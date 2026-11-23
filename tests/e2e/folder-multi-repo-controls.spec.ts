import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { createFolderNestedGitSelector } from '../../src/shared/folder-workspaces/folder-nested-git'

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

// Hidden e2e windows skip visibility-gated status polling; feed the observer the HEAD a poll would report.
async function reportObservedHead(orcaPage: Page, worktreeId: string, head: string): Promise<void> {
  await orcaPage.evaluate(
    ({ worktreeId: id, head: oid }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const state = store.getState()
      store.setState({
        gitStatusHeadByWorktree: { ...state.gitStatusHeadByWorktree, [id]: oid }
      })
    },
    { worktreeId, head }
  )
}

test('folder scan shows repository progress and can be stopped', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: the scan must stay busy long enough for the progress poll and Stop click to win.
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-scan-control-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  createRepo(root, 'repo-a')
  // Windows directory creation is slower, and its scans are slower per entry.
  const heavyDirs = process.platform === 'win32' ? 100 : 160
  for (let first = 0; first < heavyDirs; first++) {
    for (let second = 0; second < heavyDirs; second++) {
      mkdirSync(path.join(root, 'scan-heavy', `a${first}`, `b${second}`), { recursive: true })
    }
  }

  await waitForSessionReady(orcaPage)
  const folderKey = await openFolderWorkspace(orcaPage, root, 'Nested Git Scan Control')
  expect(folderKey).toBeTruthy()

  const repoARow = repoRow(orcaPage, 'repo-a')
  await expect(repoARow).toBeVisible({ timeout: 60_000 })
  const scanning = orcaPage.locator('[data-testid="folder-repos-scanning"]')
  await expect(scanning).toHaveCount(0)

  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(scanning).toBeVisible()
  // Why: actionability waits can outlast this scan; a DOM click still drives the real handler.
  await scanning.getByRole('button', { name: 'Stop' }).dispatchEvent('click')
  await expect(scanning).toHaveCount(0, { timeout: 30_000 })
  await expect(orcaPage.getByText('Scan was stopped.')).toBeVisible({ timeout: 30_000 })

  // The repository list still works after a stopped scan.
  await expect(repoARow).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(scanning).toContainText(/Scanning repositories… \d+/, { timeout: 30_000 })
  await expect(scanning).toHaveCount(0, { timeout: 60_000 })
  await expect(repoARow).toBeVisible()
})

test('folder submodule menu initializes, updates, and syncs submodules', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: real Git submodule init, update, and sync against a local remote need headroom on CI.
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-submodule-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-submodule-src-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(sourceRoot, { recursive: true, force: true })
  )
  createRepo(root, 'plain-repo')
  const sourcePath = createRepo(sourceRoot, 'child-source')
  const firstCommit = git(sourcePath, 'rev-parse', 'HEAD')
  writeFileSync(path.join(sourcePath, 'second.txt'), 'second\n')
  git(sourcePath, 'add', '.')
  git(sourcePath, 'commit', '-m', 'second')
  const secondCommit = git(sourcePath, 'rev-parse', 'HEAD')

  const parentPath = createRepo(root, 'parent')
  execFileSync(
    'git',
    ['-c', 'protocol.file.allow=always', 'submodule', 'add', sourcePath, 'libs/child'],
    { cwd: parentPath, encoding: 'utf8' }
  )
  git(parentPath, 'commit', '-m', 'add submodule')
  git(parentPath, 'config', 'protocol.file.allow', 'always')
  git(parentPath, 'submodule', 'deinit', '-f', 'libs/child')
  const childPath = path.join(parentPath, 'libs', 'child')

  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Nested Git Submodules')
  const parentRow = repoRow(orcaPage, 'parent')
  const plainRow = repoRow(orcaPage, 'plain-repo')
  const childRow = repoRow(orcaPage, 'parent/libs/child')
  await expect(parentRow).toBeVisible({ timeout: 60_000 })
  await expect(plainRow).toBeVisible()

  // Only repositories with a .gitmodules file expose submodule actions.
  await plainRow.getByRole('button').first().click()
  await expect(orcaPage.getByRole('button', { name: 'Submodule actions' })).toHaveCount(0)
  await parentRow.getByRole('button').first().click()

  const submoduleMenu = orcaPage.getByRole('button', { name: 'Submodule actions' })
  await expect(submoduleMenu).toBeVisible({ timeout: 30_000 })
  await submoduleMenu.click()
  await orcaPage.getByRole('menuitem', { name: 'Initialize submodules' }).click()
  await expect(childRow).toHaveAttribute('data-submodule', 'true', { timeout: 60_000 })
  expect(git(childPath, 'rev-parse', 'HEAD')).toBe(secondCommit)

  git(childPath, 'checkout', '-q', firstCommit)
  await submoduleMenu.click()
  await orcaPage.getByRole('menuitem', { name: 'Update submodules' }).click()
  await expect
    .poll(() => git(childPath, 'rev-parse', 'HEAD'), { timeout: 60_000 })
    .toBe(secondCommit)

  git(parentPath, 'config', 'submodule.libs/child.url', '/nonexistent/submodule')
  await submoduleMenu.click()
  await orcaPage.getByRole('menuitem', { name: 'Sync submodule URLs' }).click()
  await expect
    .poll(() => git(parentPath, 'config', 'submodule.libs/child.url'), { timeout: 60_000 })
    .toBe(sourcePath)
})

test('folder branches open commit diffs, page history, compare, and check out', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: covers commit history paging, compare, and checkout across two local repositories.
  test.setTimeout(300_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-branches-'))
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-branches-remote-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(remoteRoot, { recursive: true, force: true })
  )
  const repoPath = createRepo(root, 'branch-repo')
  createRepo(root, 'branch-repo-two')
  const remotePath = path.join(remoteRoot, 'origin.git')
  execFileSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' })
  git(repoPath, 'remote', 'add', 'origin', remotePath)
  git(repoPath, 'push', '-u', 'origin', 'main')
  git(repoPath, 'checkout', '-b', 'feature/one')
  writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'feature commit')
  git(repoPath, 'checkout', 'main')
  for (let index = 0; index < 59; index++) {
    git(repoPath, 'commit', '--allow-empty', '-m', `history ${index}`)
  }
  writeFileSync(path.join(repoPath, 'tip.txt'), 'tip\n')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'tip change')

  await waitForSessionReady(orcaPage)
  const folderKey = await openFolderWorkspace(orcaPage, root, 'Nested Git Branches')
  const repoRowSelect = repoRow(orcaPage, 'branch-repo')
  await expect(repoRowSelect).toBeVisible({ timeout: 60_000 })
  await repoRowSelect.getByRole('button').first().click()

  const mainRow = orcaPage.locator('[data-testid="folder-branch-row"][data-branch="main"]')
  await expect(mainRow).toHaveAttribute('aria-current', 'true', { timeout: 60_000 })
  await expect(mainRow).toHaveAttribute('aria-expanded', 'true')
  const commitRows = orcaPage.locator('[data-testid="folder-branch-commit-row"]')
  const tipRow = commitRows.filter({ hasText: 'tip change' }).first()
  await expect(tipRow).toBeVisible({ timeout: 60_000 })
  await tipRow.click()
  await expect(orcaPage.getByRole('button', { name: /Commit .*tip change/ })).toBeVisible({
    timeout: 30_000
  })
  // The combined diff lists the commit's changed file, not just the tab title.
  await expect(orcaPage.getByText('tip.txt', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)

  // The first page holds 50 commits; loading the rest must reach the oldest and not duplicate rows.
  const loadMore = orcaPage.locator('[data-testid="folder-branch-load-more"]')
  await expect(loadMore).toBeVisible({ timeout: 30_000 })
  await loadMore.click()
  await expect.poll(() => commitRows.count(), { timeout: 30_000 }).toBeGreaterThan(50)
  await expect(loadMore).toHaveCount(0)
  await expect(commitRows.filter({ hasText: 'history 0' })).toHaveCount(1)
  await expect(commitRows.filter({ hasText: 'tip change' })).toHaveCount(1)

  // Leaving the repo keeps its expanded branches and loaded pages; returning must not start at 50.
  const nestedSelector = createFolderNestedGitSelector(folderKey, 'branch-repo')
  await repoRow(orcaPage, 'branch-repo-two').getByRole('button').first().click()
  await expect(
    orcaPage.locator('[data-testid="folder-branch-row"][data-branch="main"]')
  ).toHaveAttribute('aria-current', 'true', { timeout: 60_000 })
  await repoRow(orcaPage, 'branch-repo').getByRole('button').first().click()
  await expect(mainRow).toHaveAttribute('aria-expanded', 'true', { timeout: 60_000 })
  await expect.poll(() => commitRows.count(), { timeout: 30_000 }).toBeGreaterThan(50)

  // A fold survives the round trip, and a HEAD that moved while away drops the stale pages.
  await mainRow.click()
  await expect(mainRow).toHaveAttribute('aria-expanded', 'false')
  await repoRow(orcaPage, 'branch-repo-two').getByRole('button').first().click()
  git(repoPath, 'commit', '--allow-empty', '-m', 'away change')
  await reportObservedHead(orcaPage, nestedSelector, git(repoPath, 'rev-parse', 'main'))
  await repoRow(orcaPage, 'branch-repo').getByRole('button').first().click()
  await expect(mainRow).toHaveAttribute('aria-expanded', 'false', { timeout: 60_000 })
  await mainRow.click()
  await expect(commitRows.filter({ hasText: 'away change' }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect.poll(() => commitRows.count(), { timeout: 30_000 }).toBe(50)

  const compareRow = orcaPage.locator('[data-testid="folder-branch-compare"]')
  await expect(compareRow).toContainText('Compare main with origin/main', { timeout: 30_000 })
  await compareRow.click()
  await expect(
    orcaPage.getByRole('button', { name: /Branch Changes \(origin\/main\)/ })
  ).toBeVisible({ timeout: 30_000 })
  await expect(orcaPage.getByText('tip.txt', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)

  const checkoutFeature = orcaPage.locator(
    '[data-testid="folder-branch-checkout"][data-branch="feature/one"]'
  )
  await expect(checkoutFeature).toBeVisible({ timeout: 30_000 })
  await checkoutFeature.click()
  await expect
    .poll(() => git(repoPath, 'branch', '--show-current'), { timeout: 60_000 })
    .toBe('feature/one')
  await expect(
    orcaPage.locator('[data-testid="folder-branch-row"][data-branch="feature/one"]')
  ).toHaveAttribute('aria-current', 'true', { timeout: 60_000 })
  // Repositories row follows the checkout without a folder rescan.
  await expect(repoRowSelect).toContainText('feature/one', { timeout: 30_000 })

  // A checkout outside Orca reaches the branch list and repo row through status polling.
  await reportObservedHead(orcaPage, nestedSelector, git(repoPath, 'rev-parse', 'feature/one'))
  git(repoPath, 'checkout', '-q', 'main')
  await reportObservedHead(orcaPage, nestedSelector, git(repoPath, 'rev-parse', 'main'))
  await expect(
    orcaPage.locator('[data-testid="folder-branch-row"][data-branch="main"]')
  ).toHaveAttribute('aria-current', 'true', { timeout: 90_000 })
  await expect(repoRowSelect).toContainText('main', { timeout: 30_000 })

  // Detached HEAD has no current branch, so the repo row drops the stale label.
  git(repoPath, 'checkout', '-q', '--detach', 'main~1')
  await reportObservedHead(orcaPage, nestedSelector, git(repoPath, 'rev-parse', 'HEAD'))
  await expect(
    orcaPage.locator('[data-testid="folder-branch-row"][aria-current="true"]')
  ).toHaveCount(0, { timeout: 90_000 })
  await expect(repoRowSelect).not.toContainText('main')
})
