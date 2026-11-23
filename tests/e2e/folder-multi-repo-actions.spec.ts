import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Orca Test', '-c', 'user.email=orca@test.local', ...args],
    { cwd, encoding: 'utf8' }
  ).trim()
}

function createRepo(root: string, relativePath: string): string {
  const repoPath = path.join(root, relativePath)
  mkdirSync(repoPath, { recursive: true })
  git(repoPath, 'init', '-b', 'main')
  git(repoPath, 'config', 'user.name', 'Orca Test')
  git(repoPath, 'config', 'user.email', 'orca@test.local')
  writeFileSync(path.join(repoPath, 'README.md'), `${relativePath}\n`)
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'initial')
  return repoPath
}

async function openFolderWorkspace(
  orcaPage: Page,
  parentPath: string,
  name: string
): Promise<string> {
  return orcaPage.evaluate(
    async ({ parentPath: folderPath, name: folderName }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      // The floating launcher is position-fixed and can cover sidebar row actions in small windows.
      await store.getState().updateSettings({ floatingTerminalEnabled: false })
      const group = await window.api.projectGroups.create({
        name: folderName,
        parentPath: folderPath,
        createdFrom: 'folder-scan'
      })
      await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
      const folder = await store
        .getState()
        .createFolderWorkspace(
          { projectGroupId: group.id, name: folderName, folderPath },
          { runtimeEnvironmentId: null }
        )
      if (!folder) {
        throw new Error('folder workspace creation returned nothing')
      }
      const key = `folder:${folder.folderWorkspace.id}`
      const state = store.getState()
      state.setActiveWorktree(key)
      state.setRightSidebarTab('source-control')
      state.setRightSidebarOpen(true)
      return key
    },
    { parentPath, name }
  )
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

test('folder repo row actions drive Git and repository exclusion', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real fetch/pull/push against local remotes plus UI round-trips need CI headroom.
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-actions-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const folderPath = path.join(root, 'workspace')
  mkdirSync(folderPath, { recursive: true })
  const barePath = path.join(root, 'origin.git')
  execFileSync('git', ['init', '--bare', '--initial-branch=main', barePath], { encoding: 'utf8' })
  const alphaPath = createRepo(folderPath, 'alpha')
  createRepo(folderPath, 'beta')
  createRepo(folderPath, 'ccc/git1')
  git(alphaPath, 'remote', 'add', 'origin', barePath)
  git(alphaPath, 'push', '-u', 'origin', 'main')

  const clonePath = path.join(root, 'clone')
  execFileSync('git', ['clone', barePath, clonePath], { encoding: 'utf8' })
  git(clonePath, 'config', 'user.name', 'Orca Test')
  git(clonePath, 'config', 'user.email', 'orca@test.local')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, folderPath, 'Repo Actions')

  const repoRow = (relativePath: string) =>
    orcaPage.locator(`[data-testid="folder-repo-row"][data-relative-path="${relativePath}"]`)
  const rowActions = (relativePath: string) =>
    orcaPage.locator(`[data-testid="folder-repo-actions"][data-repo="${relativePath}"]`)
  const chooseRowAction = async (relativePath: string, name: string): Promise<void> => {
    await expect(rowActions(relativePath)).toBeEnabled({ timeout: 30_000 })
    await rowActions(relativePath).click()
    await orcaPage.getByRole('menuitem', { name, exact: true }).click()
  }

  await expect(repoRow('alpha')).toBeVisible({ timeout: 60_000 })
  await expect(repoRow('beta')).toBeVisible()
  await expect(repoRow('ccc/git1')).toBeVisible()

  // Automatic nests under a directory; List flattens and Tree restores the directory.
  const dirNode = orcaPage.locator('[data-testid="folder-repo-dir"][data-path="ccc"]')
  const viewButton = orcaPage.locator('[data-testid="folder-repos-view-mode"]')
  await expect(dirNode).toBeVisible()
  await viewButton.click()
  await orcaPage.getByRole('menuitemradio', { name: 'List', exact: true }).click()
  await expect(dirNode).toHaveCount(0)
  await expect(repoRow('ccc/git1')).toBeVisible()
  await viewButton.click()
  await orcaPage.getByRole('menuitemradio', { name: 'Tree', exact: true }).click()
  await expect(dirNode).toBeVisible()
  await expect(repoRow('ccc/git1')).toBeVisible()

  await rowActions('alpha').click()
  await orcaPage.getByRole('menuitem', { name: 'Copy Path', exact: true }).click()
  await expect(orcaPage.getByText('Repository path copied.')).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(async () =>
      normalizePath(await orcaPage.evaluate(() => window.api.ui.readClipboardText()))
    )
    .toBe(normalizePath(alphaPath))

  // Fetch picks up a remote commit without moving the local branch.
  writeFileSync(path.join(clonePath, 'README.md'), 'remote change\n')
  git(clonePath, 'add', '.')
  git(clonePath, 'commit', '-m', 'remote change')
  git(clonePath, 'push')
  const remoteHead = git(clonePath, 'rev-parse', 'HEAD')
  await chooseRowAction('alpha', 'Fetch')
  await expect(orcaPage.getByText('Fetched alpha.')).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(() => git(alphaPath, 'rev-parse', 'origin/main'), { timeout: 30_000 })
    .toBe(remoteHead)
  expect(git(alphaPath, 'rev-parse', 'HEAD')).not.toBe(remoteHead)

  // Pull fast-forwards the local branch to the fetched commit.
  await chooseRowAction('alpha', 'Pull')
  await expect(orcaPage.getByText('Pulled alpha.')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => git(alphaPath, 'rev-parse', 'HEAD'), { timeout: 30_000 }).toBe(remoteHead)
  expect(readFileSync(path.join(alphaPath, 'README.md'), 'utf8')).toContain('remote change')

  // Push publishes a local commit to the remote.
  writeFileSync(path.join(alphaPath, 'README.md'), 'local change\n')
  git(alphaPath, 'add', '.')
  git(alphaPath, 'commit', '-m', 'local change')
  const localHead = git(alphaPath, 'rev-parse', 'HEAD')
  await chooseRowAction('alpha', 'Push')
  await expect(orcaPage.getByText('Pushed alpha.')).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(() => git(root, '--git-dir', barePath, 'rev-parse', 'main'), { timeout: 30_000 })
    .toBe(localHead)

  // Exclude writes the VS Code setting and removes the repository from the scan.
  await chooseRowAction('beta', 'Exclude Repository')
  await expect(orcaPage.getByText('beta excluded.')).toBeVisible({ timeout: 60_000 })
  await expect(repoRow('beta')).toHaveCount(0, { timeout: 60_000 })
  expect(repoRow('alpha')).toBeVisible()
  expect(
    JSON.parse(readFileSync(path.join(folderPath, '.vscode', 'settings.json'), 'utf8'))
  ).toMatchObject({ 'git.ignoredRepositories': expect.arrayContaining(['beta']) })
})
