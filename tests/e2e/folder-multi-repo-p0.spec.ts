import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Orca Test', '-c', 'user.email=orca@test.local', ...args],
    {
      cwd,
      encoding: 'utf8'
    }
  ).trim()
}

function createRepo(root: string, relativePath: string, file: string, content: string): string {
  const repoPath = path.join(root, relativePath)
  mkdirSync(repoPath, { recursive: true })
  git(repoPath, 'init', '-b', 'main')
  git(repoPath, 'config', 'user.name', 'Orca Test')
  git(repoPath, 'config', 'user.email', 'orca@test.local')
  writeFileSync(path.join(repoPath, file), content)
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'initial')
  return repoPath
}

test('folder project discovers nested repos and drives source control', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: Electron startup plus the first folder scan exceeds the default E2E timeout.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))

  createRepo(root, 'repo-alpha', 'alpha.txt', 'alpha\n')
  const betaPath = createRepo(root, 'services/repo-beta', 'beta.txt', 'beta\n')
  createRepo(root, 'services/repo-gamma', 'gamma.txt', 'gamma\n')
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-remote-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(remoteRoot, { recursive: true, force: true })
  )
  const remotePath = path.join(remoteRoot, 'repo-beta.git')
  git(remoteRoot, 'init', '--bare', remotePath)
  git(betaPath, 'remote', 'add', 'origin', remotePath)
  git(betaPath, 'push', 'origin', 'main')
  git(betaPath, 'branch', 'feature/older')
  git(betaPath, 'checkout', '-b', 'feature/history')
  writeFileSync(path.join(betaPath, 'history.txt'), 'history\n')
  git(betaPath, 'add', 'history.txt')
  git(betaPath, 'commit', '-m', 'history commit')
  git(betaPath, 'checkout', 'main')
  writeFileSync(path.join(betaPath, 'beta.txt'), 'beta changed\n')
  writeFileSync(path.join(betaPath, 'new.txt'), 'untracked\n')
  for (let index = 0; index < 40; index += 1) {
    writeFileSync(path.join(betaPath, `bulk-${String(index).padStart(2, '0')}.txt`), 'bulk\n')
  }

  await waitForSessionReady(orcaPage)
  const primaryFolderKey = await orcaPage.evaluate(async (parentPath) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
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
    const folderKey = `folder:${folder.folderWorkspace.id}`
    state.setActiveWorktree(folderKey)
    state.setRightSidebarTab('source-control')
    state.setRightSidebarOpen(true)
    return folderKey
  }, root)

  await expect(orcaPage.getByText('repo-alpha', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText('repo-beta', { exact: true }).first()).toBeVisible()
  await expect(orcaPage.getByText('repo-gamma', { exact: true }).first()).toBeVisible()
  await orcaPage.screenshot({ path: path.join(root, 'p0-repositories.png') })

  await orcaPage
    .getByRole('button', { name: /repo-beta/ })
    .first()
    .click()
  await expect(orcaPage.getByText('beta.txt', { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })
  await expect(orcaPage.getByText('new.txt', { exact: true }).first()).toBeVisible()

  const branchRow = (name: string) =>
    orcaPage.locator(`[data-testid="folder-branch-row"][data-branch="${name}"]`)
  const branchHistory = (name: string) =>
    orcaPage.locator(`[data-testid="folder-branch-history"][data-branch="${name}"]`)
  await expect(branchRow('main')).toHaveAttribute('aria-expanded', 'true', { timeout: 20_000 })
  await expect(branchRow('main')).toHaveAttribute('aria-current', 'true')
  await expect(branchRow('feature/history')).toHaveAttribute('aria-expanded', 'false')
  await expect(branchRow('feature/older')).toBeVisible()
  await expect(branchRow('origin/main')).toBeVisible()
  await expect(
    branchHistory('main')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: 'initial' })
      .first()
  ).toBeVisible()
  await branchRow('feature/history').click()
  await expect(branchRow('feature/history')).toHaveAttribute('aria-expanded', 'true')
  await expect(
    branchHistory('feature/history')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: 'history commit' })
      .first()
  ).toBeVisible({ timeout: 15_000 })
  await orcaPage.screenshot({ path: path.join(root, 'p0-branches.png') })

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
  await orcaPage.screenshot({ path: path.join(root, 'p0-diff.png') })

  // A long change list must scroll inside Changes instead of being clipped by the section.
  const firstEntry = orcaPage.locator('[data-testid="source-control-entry"]').first()
  await expect(firstEntry).toBeVisible()
  const scrollState = await firstEntry.evaluate((element) => {
    let node = element.parentElement
    while (node) {
      const style = getComputedStyle(node)
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight + 4
      ) {
        node.scrollTop = node.scrollHeight
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
        return { scrollable: true, scrollTop: node.scrollTop, total: node.scrollHeight }
      }
      node = node.parentElement
    }
    return { scrollable: false, scrollTop: 0, total: 0 }
  })
  expect(scrollState.scrollable).toBe(true)
  expect(scrollState.scrollTop).toBeGreaterThan(0)
  await expect(
    orcaPage.locator('[data-testid="source-control-entry"]').filter({ hasText: 'bulk-39.txt' })
  ).toBeVisible({ timeout: 5_000 })

  // External edits reach the selected repo without reopening the panel.
  writeFileSync(path.join(betaPath, 'external.txt'), 'external\n')
  await expect(orcaPage.getByText('external.txt', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })

  const unstagedBetaRow = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="unstaged"]')
    .filter({ hasText: 'beta.txt' })
  const stageButton = unstagedBetaRow.getByRole('button', { name: 'Stage' })
  await stageButton.focus()
  await stageButton.press('Enter')
  await expect(orcaPage.getByText('Staged Changes', { exact: true })).toBeVisible({
    timeout: 15_000
  })

  const stagedBetaRow = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="staged"]')
    .filter({ hasText: 'beta.txt' })
  await stagedBetaRow.getByText('beta.txt', { exact: true }).click()
  await expect(orcaPage.locator('.monaco-diff-editor')).toBeVisible({ timeout: 20_000 })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)
  const unstageButton = stagedBetaRow.getByRole('button', { name: 'Unstage' })
  await unstageButton.focus()
  await unstageButton.press('Enter')
  await expect(unstagedBetaRow).toBeVisible({ timeout: 15_000 })

  const stageAll = orcaPage.getByRole('button', { name: 'Stage All', exact: true })
  await expect(stageAll).toBeVisible({ timeout: 10_000 })
  await stageAll.click()
  await expect(orcaPage.getByText('Staged Changes', { exact: true })).toBeVisible({
    timeout: 15_000
  })

  const message = `nested commit ${Date.now()}`
  const composer = orcaPage.getByRole('textbox', { name: 'Commit message' })
  await composer.fill(message)
  await orcaPage.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect
    .poll(() => git(betaPath, 'log', '-1', '--pretty=%s'), { timeout: 30_000 })
    .toBe(message)
  expect(git(betaPath, 'status', '--porcelain')).toBe('')

  await orcaPage.getByRole('button', { name: 'Refresh branches' }).click()
  await expect(
    branchHistory('main')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: message })
      .first()
  ).toBeVisible({ timeout: 20_000 })

  const otherRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-empty-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(otherRoot, { recursive: true, force: true })
  )
  await orcaPage.evaluate(async (otherParentPath) => {
    const store = window.__store!
    const group = await window.api.projectGroups.create({
      name: 'Nested Git P0 empty',
      parentPath: otherParentPath,
      createdFrom: 'folder-scan'
    })
    await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
    const folder = await store
      .getState()
      .createFolderWorkspace(
        { projectGroupId: group.id, name: 'Nested Git P0 empty', folderPath: otherParentPath },
        { runtimeEnvironmentId: null }
      )
    if (!folder) {
      throw new Error('second folder workspace creation returned nothing')
    }
    store.getState().setActiveWorktree(`folder:${folder.folderWorkspace.id}`)
  }, otherRoot)
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 30_000 })

  await orcaPage.evaluate((folderKey) => {
    window.__store!.getState().setActiveWorktree(folderKey)
  }, primaryFolderKey)
  await expect(orcaPage.getByText('repo-beta', { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })

  await orcaPage.screenshot({ path: path.join(root, 'p0-committed.png') })
})
