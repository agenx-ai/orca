import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

const SHOTS_DIR = '/tmp/hermes-p0-shots-hd'

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Orca Test', '-c', 'user.email=orca@test.local', ...args],
    { cwd, encoding: 'utf8' }
  ).trim()
}

function createRepo(root: string, relativePath: string, file: string): string {
  const repoPath = path.join(root, relativePath)
  mkdirSync(repoPath, { recursive: true })
  git(repoPath, 'init', '-b', 'main')
  git(repoPath, 'config', 'user.name', 'Orca Test')
  git(repoPath, 'config', 'user.email', 'orca@test.local')
  writeFileSync(path.join(repoPath, file), 'initial\n')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'initial')
  return repoPath
}

test('capture folder multi-repo UI walkthrough', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: captures the panel across several folders and scan states.
  test.setTimeout(240_000)
  mkdirSync(SHOTS_DIR, { recursive: true })
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-shots-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))

  createRepo(root, 'repo-alpha', 'alpha.txt')
  const betaPath = createRepo(root, 'services/repo-beta', 'beta.txt')
  const gammaPath = createRepo(root, 'services/repo-gamma', 'gamma.txt')
  git(gammaPath, 'checkout', '-b', 'feature/gamma')
  writeFileSync(path.join(betaPath, 'beta.txt'), 'beta changed\n')
  writeFileSync(path.join(betaPath, 'new.txt'), 'untracked\n')

  await waitForSessionReady(orcaPage)
  await orcaPage.setViewportSize({ width: 1440, height: 900 })
  const primaryFolderKey = await orcaPage.evaluate(
    async ({ parentPath }) => {
      const store = window.__store!
      const group = await window.api.projectGroups.create({
        name: 'Nested Git P0',
        parentPath,
        createdFrom: 'folder-scan'
      })
      await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
      const folder = await store
        .getState()
        .createFolderWorkspace(
          { projectGroupId: group.id, name: 'Nested Git P0', folderPath: parentPath },
          { runtimeEnvironmentId: null }
        )
      if (!folder) {
        throw new Error('folder workspace creation returned nothing')
      }
      const state = store.getState()
      const key = `folder:${folder.folderWorkspace.id}`
      state.setActiveWorktree(key)
      state.setRightSidebarTab('source-control')
      state.setRightSidebarOpen(true)
      return key
    },
    { parentPath: root }
  )

  await expect(orcaPage.getByText('repo-alpha', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '01-repositories.png') })

  const servicesRow = orcaPage.getByRole('button', { name: /services/ }).first()
  const repositoriesSection = orcaPage
    .locator('section')
    .filter({ hasText: 'Repositories' })
    .first()
  await servicesRow.click()
  await expect(repositoriesSection.getByText('repo-beta', { exact: true })).toHaveCount(0)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '01b-tree-collapsed.png') })
  await servicesRow.click()
  await expect(repositoriesSection.getByText('repo-beta', { exact: true })).toBeVisible()

  await orcaPage
    .getByRole('button', { name: /repo-beta/ })
    .first()
    .click()
  await expect(orcaPage.getByText('beta.txt', { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '02-repo-selected.png') })

  await orcaPage.getByText('beta.txt', { exact: true }).first().click()
  await expect(orcaPage.locator('.editor-header-path').first()).toContainText('beta.txt', {
    timeout: 20_000
  })
  await expect(orcaPage.locator('.monaco-diff-editor')).toBeVisible({ timeout: 20_000 })
  await expect(
    orcaPage
      .locator('.modified-in-monaco-diff-editor .view-line')
      .filter({ hasText: 'beta changed' })
  ).toBeVisible()
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '03-diff.png') })

  const unstagedBetaRow = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="unstaged"]')
    .filter({ hasText: 'beta.txt' })
  const unstagedStageButton = unstagedBetaRow.getByRole('button', { name: 'Stage' })
  await unstagedStageButton.focus()
  await unstagedStageButton.press('Enter')
  await expect(orcaPage.getByText('Staged Changes', { exact: true })).toBeVisible({
    timeout: 15_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '03b-file-staged.png') })
  const stagedBetaRow = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="staged"]')
    .filter({ hasText: 'beta.txt' })
  const unstageButton = stagedBetaRow.getByRole('button', { name: 'Unstage' })
  await unstageButton.focus()
  await unstageButton.press('Enter')
  await expect(unstagedBetaRow).toBeVisible({ timeout: 15_000 })

  await orcaPage.getByRole('button', { name: 'Stage All', exact: true }).click()
  await expect(orcaPage.getByText('Staged Changes', { exact: true })).toBeVisible({
    timeout: 15_000
  })
  await orcaPage
    .getByRole('textbox', { name: 'Commit message' })
    .fill('docs: capture folder multi-repo walkthrough')
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '04-staged.png') })

  await orcaPage.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect
    .poll(() => git(betaPath, 'log', '-1', '--pretty=%s'), { timeout: 30_000 })
    .toBe('docs: capture folder multi-repo walkthrough')
  await expect(orcaPage.getByText('beta.txt', { exact: true })).toHaveCount(0, {
    timeout: 20_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '05-committed.png') })

  await orcaPage
    .getByRole('button', { name: /repo-alpha/ })
    .first()
    .click()
  await expect(orcaPage.locator('[data-testid="source-control-entry"]')).toHaveCount(0, {
    timeout: 20_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '06-clean-repo.png') })

  await orcaPage
    .getByRole('button', { name: /repo-gamma/ })
    .first()
    .click()
  await expect(orcaPage.getByText('feature/gamma', { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '07-other-branch.png') })

  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(orcaPage.getByText('repo-beta', { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '08-rescanned.png') })

  const otherRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-shots-empty-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(otherRoot, { recursive: true, force: true })
  )
  await orcaPage.evaluate(async (otherParentPath) => {
    const store = window.__store!
    const group = await window.api.projectGroups.create({
      name: 'Empty folder',
      parentPath: otherParentPath,
      createdFrom: 'folder-scan'
    })
    await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
    const folder = await store
      .getState()
      .createFolderWorkspace(
        { projectGroupId: group.id, name: 'Empty folder', folderPath: otherParentPath },
        { runtimeEnvironmentId: null }
      )
    if (!folder) {
      throw new Error('empty folder workspace creation returned nothing')
    }
    store.getState().setActiveWorktree(`folder:${folder.folderWorkspace.id}`)
  }, otherRoot)
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 30_000 })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '08b-other-folder.png') })

  await orcaPage.evaluate((folderKey) => {
    window.__store!.getState().setActiveWorktree(folderKey)
  }, primaryFolderKey)
  await expect(orcaPage.getByText('repo-beta', { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '09-switch-back.png') })
})
