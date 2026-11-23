import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

const repoRow = (orcaPage: Page, relativePath: string) =>
  orcaPage.locator(`[data-testid="folder-repo-row"][data-relative-path="${relativePath}"]`)

test('folder nested repo stashes, applies, and drops changes', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git operations against local repositories plus UI round-trips need CI headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-stash-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const repoPath = createRepo(root, 'stash-repo')
  writeFileSync(path.join(repoPath, 'README.md'), 'changed\n')
  writeFileSync(path.join(repoPath, 'untracked.txt'), 'new\n')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Stash')
  await expect(repoRow(orcaPage, 'stash-repo')).toBeVisible({ timeout: 60_000 })

  const stashButton = orcaPage.getByRole('button', { name: 'Stash changes' })
  await expect(stashButton).toBeVisible({ timeout: 60_000 })
  await stashButton.click()
  await orcaPage.getByLabel('Stash message (optional)').fill('e2e stash one')
  await orcaPage.getByRole('checkbox', { name: 'Include untracked' }).click()
  await orcaPage.getByRole('button', { name: 'Stash', exact: true }).click()
  await expect(orcaPage.getByText('Changes stashed.')).toBeVisible({ timeout: 30_000 })

  const stashRow = orcaPage.locator('[data-testid="folder-stash-row"]')
  await expect(stashRow).toContainText('e2e stash one', { timeout: 30_000 })
  expect(git(repoPath, 'status', '--porcelain')).toBe('')
  expect(git(repoPath, 'stash', 'list')).toContain('e2e stash one')

  // Apply keeps the entry and restores the tracked and untracked changes.
  await stashRow.getByRole('button', { name: 'Stash actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Apply stash' }).click()
  await expect(orcaPage.getByText('Stash applied.')).toBeVisible({ timeout: 30_000 })
  await expect(stashRow).toHaveCount(1)
  expect(git(repoPath, 'status', '--porcelain')).toContain('README.md')
  expect(git(repoPath, 'status', '--porcelain')).toContain('untracked.txt')

  // Drop permanently removes the entry through the confirmation dialog.
  await stashRow.getByRole('button', { name: 'Stash actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Drop stash' }).click()
  await orcaPage.getByRole('dialog').getByRole('button', { name: 'Drop stash' }).click()
  await expect(orcaPage.getByText('Stash dropped.')).toBeVisible({ timeout: 30_000 })
  await expect(stashRow).toHaveCount(0)
  expect(git(repoPath, 'stash', 'list')).toBe('')
})

test('folder nested repo creates and deletes tags', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git operations against local repositories plus UI round-trips need CI headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-tag-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const repoPath = createRepo(root, 'tag-repo')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Tags')
  await expect(repoRow(orcaPage, 'tag-repo')).toBeVisible({ timeout: 60_000 })

  const createTagButton = orcaPage.getByRole('button', { name: 'Create tag' })
  await expect(createTagButton).toBeVisible({ timeout: 60_000 })
  await createTagButton.click()
  await orcaPage.getByLabel('Tag name').fill('v1.0.0-e2e')
  await orcaPage.getByLabel('Message (optional)').fill('release candidate')
  await orcaPage.getByRole('button', { name: 'Create tag' }).last().click()
  await expect(orcaPage.getByText('Tag v1.0.0-e2e created.')).toBeVisible({ timeout: 30_000 })

  const tagRow = orcaPage.locator('[data-testid="folder-tag-row"]')
  await expect(tagRow).toContainText('v1.0.0-e2e', { timeout: 30_000 })
  expect(git(repoPath, 'tag', '--list')).toBe('v1.0.0-e2e')
  expect(git(repoPath, 'tag', '--list', '--format=%(contents)')).toContain('release candidate')

  await tagRow.getByRole('button', { name: 'Tag actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Delete tag' }).click()
  await orcaPage.getByRole('dialog').getByRole('button', { name: 'Delete tag' }).click()
  await expect(orcaPage.getByText('Tag v1.0.0-e2e deleted.')).toBeVisible({ timeout: 30_000 })
  await expect(tagRow).toHaveCount(0)
  expect(git(repoPath, 'tag', '--list')).toBe('')
})

test('folder nested repo adds, fetches, and removes a remote', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git operations against local repositories plus UI round-trips need CI headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-remote-'))
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-remote-bare-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(remoteRoot, { recursive: true, force: true })
  )
  const repoPath = createRepo(root, 'remote-repo')
  const remotePath = path.join(remoteRoot, 'backup.git')
  execFileSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' })
  git(repoPath, 'push', remotePath, 'main')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Remotes')
  await expect(repoRow(orcaPage, 'remote-repo')).toBeVisible({ timeout: 60_000 })

  const addRemoteButton = orcaPage.getByRole('button', { name: 'Add remote' })
  await expect(addRemoteButton).toBeVisible({ timeout: 60_000 })
  await addRemoteButton.click()
  await orcaPage.getByLabel('Remote name').fill('backup')
  await orcaPage.getByLabel('Remote URL').fill(remotePath)
  await orcaPage.getByRole('button', { name: 'Add remote' }).last().click()
  await expect(orcaPage.getByText('Remote backup added.')).toBeVisible({ timeout: 30_000 })

  const remoteRow = orcaPage.locator('[data-testid="folder-remote-row"]')
  await expect(remoteRow).toContainText('backup', { timeout: 30_000 })
  expect(git(repoPath, 'remote')).toBe('backup')

  await remoteRow.getByRole('button', { name: 'Remote actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Fetch' }).click()
  await expect(orcaPage.getByText('Fetched backup.')).toBeVisible({ timeout: 30_000 })
  expect(git(repoPath, 'rev-parse', '--verify', 'refs/remotes/backup/main')).toBeTruthy()

  await remoteRow.getByRole('button', { name: 'Remote actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Remove remote' }).click()
  await orcaPage.getByRole('dialog').getByRole('button', { name: 'Remove remote' }).click()
  await expect(orcaPage.getByText('Remote backup removed.')).toBeVisible({ timeout: 30_000 })
  await expect(remoteRow).toHaveCount(0)
  expect(git(repoPath, 'remote')).toBe('')
})

test('folder branch list filters repositories', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git operations against local repositories plus UI round-trips need CI headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-filter-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  createRepo(root, 'filter-repo-a')
  createRepo(root, 'filter-repo-b')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Filter')
  await expect(repoRow(orcaPage, 'filter-repo-a')).toBeVisible({ timeout: 60_000 })
  await expect(repoRow(orcaPage, 'filter-repo-b')).toBeVisible()

  const branchRepo = (relativePath: string) =>
    orcaPage.locator(`[data-testid="folder-branch-repo"][data-repo="${relativePath}"]`)
  await expect(branchRepo('filter-repo-a')).toBeVisible({ timeout: 60_000 })
  await expect(branchRepo('filter-repo-b')).toBeVisible()

  const filterButton = orcaPage.getByTestId('folder-branch-repo-filter')
  await expect(filterButton).toBeVisible()
  await filterButton.click()
  await orcaPage.getByRole('menuitemcheckbox', { name: 'filter-repo-b' }).click()
  await expect(branchRepo('filter-repo-b')).toHaveCount(0)
  await expect(branchRepo('filter-repo-a')).toHaveCount(1)

  await orcaPage.getByRole('menuitem', { name: 'Show all repositories' }).click()
  await orcaPage.keyboard.press('Escape')
  await expect(branchRepo('filter-repo-b')).toHaveCount(1)
  await expect(branchRepo('filter-repo-a')).toHaveCount(1)
})

test('folder branch compare refs opens an arbitrary branch diff', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git operations against local repositories plus UI round-trips need CI headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-compare-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const repoPath = createRepo(root, 'compare-repo')
  git(repoPath, 'checkout', '-b', 'feature/two')
  writeFileSync(path.join(repoPath, 'two.txt'), 'two\n')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'two change')
  git(repoPath, 'checkout', 'main')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Compare')
  await expect(repoRow(orcaPage, 'compare-repo')).toBeVisible({ timeout: 60_000 })

  const mainRow = orcaPage.locator('[data-testid="folder-branch-row"][data-branch="main"]')
  await expect(mainRow).toHaveAttribute('aria-current', 'true', { timeout: 60_000 })
  await expect(mainRow).toHaveAttribute('aria-expanded', 'true')

  const repoGroup = orcaPage.locator('[data-testid="folder-branch-repo"][data-repo="compare-repo"]')
  await repoGroup.getByRole('button', { name: 'Compare refs' }).click()
  await orcaPage.getByTestId('folder-compare-base').click()
  await orcaPage.getByRole('option', { name: 'main' }).click()
  await orcaPage.getByTestId('folder-compare-head').click()
  await orcaPage.getByRole('option', { name: 'feature/two' }).click()
  await orcaPage.getByTestId('folder-compare-submit').click()

  await expect(orcaPage.getByRole('button', { name: /Branch Changes \(main\)/ })).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText('two.txt', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)
})

test('folder nested repo opens the Git Graph and commit diffs on the folder workspace', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git operations against local repositories plus UI round-trips need CI headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-graph-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const repoPath = createRepo(root, 'graph-repo')
  writeFileSync(path.join(repoPath, 'graph-file.txt'), 'graph\n')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'graph change')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Graph')
  await expect(repoRow(orcaPage, 'graph-repo')).toBeVisible({ timeout: 60_000 })
  await expect(
    orcaPage.locator('[data-testid="folder-branch-row"][data-branch="main"]')
  ).toHaveAttribute('aria-expanded', 'true', { timeout: 60_000 })

  const repoGroup = orcaPage.locator('[data-testid="folder-branch-repo"][data-repo="graph-repo"]')
  const graphButton = repoGroup.getByRole('button', { name: 'Git Graph' })
  await expect(graphButton).toBeEnabled({ timeout: 60_000 })
  await graphButton.click()

  const graphTab = orcaPage.getByTestId('git-graph-tab')
  await expect(graphTab).toBeVisible({ timeout: 30_000 })
  await expect(graphTab.getByText('graph change').first()).toBeVisible({ timeout: 30_000 })

  // The graph splits into rows plus a details pane; free the sidebars so the commit row is clickable.
  await orcaPage.evaluate(() => {
    const state = window.__store?.getState()
    state?.setRightSidebarOpen(false)
    state?.setSidebarOpen(false)
  })

  // Commit diffs from a nested repo open on the folder workspace, not the synthetic worktree.
  await graphTab.getByRole('button', { name: 'graph change' }).dblclick()
  await expect(orcaPage.getByRole('button', { name: /Commit .*graph change/ })).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText('graph-file.txt', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)
})
