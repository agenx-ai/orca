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

function createRepo(root: string, relativePath: string): void {
  const repoPath = path.join(root, relativePath)
  mkdirSync(repoPath, { recursive: true })
  git(repoPath, 'init', '-b', 'main')
  writeFileSync(path.join(repoPath, 'README.md'), `${relativePath}\n`)
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'initial')
}

function writeSettings(root: string, content: string): void {
  mkdirSync(path.join(root, '.vscode'), { recursive: true })
  writeFileSync(path.join(root, '.vscode', 'settings.json'), content)
}

async function createFolderWorkspace(
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
      return `folder:${folder.folderWorkspace.id}`
    },
    { parentPath, name }
  )
}

test('folder scan honors .vscode/settings.json and invalidates cached results', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: this scenario switches settings, repositories, and rescans several times.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-settings-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  createRepo(root, 'repo-a')
  createRepo(root, 'packages/repo-b')
  createRepo(root, 'generated/repo-c')
  createRepo(root, 'deep/one/two/repo-d')
  createRepo(root, 'explicit/one/repo-e')
  createRepo(root, 'repo-sub-parent')
  createRepo(root, 'repo-wt-parent')
  // Existing directories are initialized later, so only the `.git` marker can trigger discovery.
  mkdirSync(path.join(root, 'init-later'))
  mkdirSync(path.join(root, 'marker-repo'))
  git(
    path.join(root, 'repo-wt-parent'),
    'worktree',
    'add',
    path.join(root, 'deep', 'one', 'two', 'repo-wt'),
    '-b',
    'feature/worktree'
  )
  const submoduleSource = mkdtempSync(path.join(os.tmpdir(), 'orca-submodule-src-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(submoduleSource, { recursive: true, force: true })
  )
  createRepo(submoduleSource, 'child-source')
  git(
    path.join(root, 'repo-sub-parent'),
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    path.join(submoduleSource, 'child-source'),
    'libs/child'
  )
  git(path.join(root, 'repo-sub-parent'), 'commit', '-m', 'add submodule')
  writeSettings(
    root,
    `{
      // Keep discovery shallow and skip generated trees.
      "git.repositoryScanMaxDepth": 2,
      "git.repositoryScanIgnoredFolders": ["generated"],
      "git.ignoredRepositories": ["packages/repo-b"],
      "git.scanRepositories": ["explicit/one/repo-e"],
    }`
  )

  await waitForSessionReady(orcaPage)
  const folderKey = await createFolderWorkspace(orcaPage, root, 'Nested Git Settings')
  // Fake timers control the 15s status poll without real-time sleeps.
  await orcaPage.clock.install()
  await orcaPage.evaluate((key) => {
    const state = window.__store!.getState()
    state.setActiveWorktree(key)
    state.setRightSidebarTab('source-control')
    state.setRightSidebarOpen(true)
  }, folderKey)

  await expect(orcaPage.getByText('repo-a', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText('repo-e', { exact: true }).first()).toBeVisible()
  await expect(orcaPage.getByText('repo-b', { exact: true })).toHaveCount(0)
  await expect(orcaPage.getByText('repo-c', { exact: true })).toHaveCount(0)
  await expect(orcaPage.getByText('repo-d', { exact: true })).toHaveCount(0)

  const parentRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="repo-sub-parent"]'
  )
  const submoduleRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="repo-sub-parent/libs/child"]'
  )
  await expect(parentRow).toBeVisible()
  await expect(submoduleRow).toHaveAttribute('data-submodule', 'true')
  await parentRow.getByRole('button', { name: 'Collapse submodules of repo-sub-parent' }).click()
  await expect(submoduleRow).toHaveCount(0)
  await parentRow.getByRole('button', { name: 'Expand submodules of repo-sub-parent' }).click()
  await expect(submoduleRow).toBeVisible()

  const worktreeParentRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="repo-wt-parent"]'
  )
  const worktreeRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="deep/one/two/repo-wt"]'
  )
  await expect(worktreeParentRow).toBeVisible()
  await expect(worktreeRow).toHaveCount(0)

  writeSettings(
    root,
    `{
      "git.repositoryScanMaxDepth": 2,
      "git.repositoryScanIgnoredFolders": ["generated"],
      "git.ignoredRepositories": ["packages/repo-b"],
      "git.scanRepositories": ["explicit/one/repo-e"],
      "git.detectWorktrees": true
    }`
  )
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(worktreeRow).toHaveAttribute('data-worktree', 'true', { timeout: 30_000 })
  await expect(worktreeRow.locator('[aria-label="Worktree"]')).toBeVisible()
  await worktreeParentRow
    .getByRole('button', { name: 'Collapse worktrees of repo-wt-parent' })
    .click()
  await expect(worktreeRow).toHaveCount(0)
  await worktreeParentRow
    .getByRole('button', { name: 'Expand worktrees of repo-wt-parent' })
    .click()
  await expect(worktreeRow).toBeVisible()

  const emptyRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-empty-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(emptyRoot, { recursive: true, force: true })
  )
  const emptyFolderKey = await createFolderWorkspace(orcaPage, emptyRoot, 'Nested Git Empty')

  writeSettings(
    root,
    `{
      "git.repositoryScanMaxDepth": 2,
      "git.repositoryScanIgnoredFolders": ["generated"],
      "git.ignoredRepositories": ["packages/repo-b"],
      "git.scanRepositories": ["explicit/one/repo-e"],
      "git.detectWorktrees": true,
      "git.detectWorktreesLimit": 0
    }`
  )
  // Reopening the folder without Rescan must still pick up the changed fingerprint.
  await orcaPage.evaluate((key) => {
    window.__store!.getState().setActiveWorktree(key)
  }, emptyFolderKey)
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 30_000 })
  await orcaPage.evaluate((key) => {
    window.__store!.getState().setActiveWorktree(key)
  }, folderKey)
  await expect(worktreeRow).toHaveCount(0, { timeout: 30_000 })
  await expect(worktreeParentRow).toBeVisible()

  writeSettings(root, '{ "git.detectSubmodules": false }')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(submoduleRow).toHaveCount(0, { timeout: 30_000 })
  await expect(parentRow).toBeVisible()

  writeSettings(root, '{ "git.detectSubmodules": true, "git.detectSubmodulesLimit": 0 }')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(submoduleRow).toHaveCount(0, { timeout: 30_000 })
  await expect(parentRow).toBeVisible()

  // A settings change invalidates the fresh cache when the folder is reopened.
  writeSettings(
    root,
    `{
      "git.repositoryScanMaxDepth": -1,
      "git.repositoryScanIgnoredFolders": [],
      "git.ignoredRepositories": [],
      "git.scanRepositories": []
    }`
  )
  await orcaPage.evaluate((key) => {
    window.__store!.getState().setActiveWorktree(key)
  }, emptyFolderKey)
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 30_000 })

  await orcaPage.evaluate((key) => {
    window.__store!.getState().setActiveWorktree(key)
  }, folderKey)
  await expect(orcaPage.getByText('repo-b', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText('repo-c', { exact: true }).first()).toBeVisible()
  await expect(orcaPage.getByText('repo-d', { exact: true }).first()).toBeVisible()

  // autoRepositoryDetection false disables nested scanning on Rescan.
  writeSettings(root, '{ "git.autoRepositoryDetection": false }')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 30_000 })

  // A malformed file falls back to defaults and surfaces one warning.
  writeSettings(root, '{ broken')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(orcaPage.getByText(/could not be read or parsed/)).toBeVisible({ timeout: 30_000 })
  await expect(orcaPage.getByText('repo-a', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })

  // git.autorefresh false: selection reads still run, but no interval polls afterwards.
  writeSettings(root, '{ "git.autorefresh": false }')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(orcaPage.getByText(/could not be read or parsed/)).toHaveCount(0, {
    timeout: 30_000
  })
  const repoARow = orcaPage.locator('[data-testid="folder-repo-row"][data-relative-path="repo-a"]')
  const repoBRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="packages/repo-b"]'
  )
  const changesEntry = (name: string) =>
    orcaPage.locator('[data-testid="source-control-entry"]').filter({ hasText: name })
  const selectRepoA = () => repoARow.getByRole('button').first().click()
  const selectRepoB = () => repoBRow.getByRole('button').first().click()

  writeFileSync(path.join(root, 'repo-a', 'disabled-read.txt'), 'disabled\n')
  await selectRepoB()
  await selectRepoA()
  await expect(changesEntry('disabled-read.txt').first()).toBeVisible({ timeout: 30_000 })

  writeFileSync(path.join(root, 'repo-a', 'no-poll.txt'), 'no poll\n')
  await orcaPage.clock.fastForward(16_000)
  await expect(changesEntry('no-poll.txt')).toHaveCount(0)

  await selectRepoB()
  await selectRepoA()
  await expect(changesEntry('no-poll.txt').first()).toBeVisible({ timeout: 30_000 })

  // Re-enabling performs an immediate read; a file written after it needs the 15s poll.
  writeFileSync(path.join(root, 'repo-a', 'pre-enable.txt'), 'before enabling\n')
  writeSettings(root, '{ "git.autorefresh": true }')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(changesEntry('pre-enable.txt').first()).toBeVisible({ timeout: 30_000 })

  writeFileSync(path.join(root, 'repo-a', 'polled.txt'), 'polled\n')
  await orcaPage.clock.fastForward(16_000)
  await expect(changesEntry('polled.txt').first()).toBeVisible({ timeout: 30_000 })

  // git.ignoreSubmodules=all hides both a moved gitlink and dirty submodule files.
  const submoduleWorktree = path.join(root, 'repo-sub-parent', 'libs', 'child')
  writeFileSync(path.join(submoduleWorktree, 'dirty.txt'), 'dirty\n')
  writeFileSync(path.join(submoduleWorktree, 'committed.txt'), 'committed\n')
  git(submoduleWorktree, 'add', '.')
  git(submoduleWorktree, 'commit', '-m', 'submodule commit')
  await parentRow.getByRole('button').first().click()
  const submoduleChange = orcaPage.locator(
    '[data-testid="source-control-entry"][data-source-control-path="libs/child"]'
  )
  await expect(submoduleChange).toBeVisible({ timeout: 30_000 })
  writeSettings(root, '{ "git.autorefresh": true, "git.ignoreSubmodules": true }')
  await orcaPage.clock.fastForward(6_000)
  await expect(submoduleChange).toHaveCount(0, { timeout: 30_000 })

  // The folder root watch discovers a new checkout and drops a removed one without Rescan.
  createRepo(root, 'live-repo')
  const liveRepoRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="live-repo"]'
  )
  await expect
    .poll(
      async () => {
        await orcaPage.clock.fastForward(1_000)
        return liveRepoRow.count()
      },
      { timeout: 30_000 }
    )
    .toBe(1)
  rmSync(path.join(root, 'live-repo'), { recursive: true, force: true })
  await expect
    .poll(
      async () => {
        await orcaPage.clock.fastForward(1_000)
        return liveRepoRow.count()
      },
      { timeout: 30_000 }
    )
    .toBe(0)

  const repoRow = (relativePath: string) =>
    orcaPage.locator(`[data-testid="folder-repo-row"][data-relative-path="${relativePath}"]`)
  const expectRepoRowCount = (relativePath: string, count: number) =>
    expect
      .poll(
        async () => {
          await orcaPage.clock.fastForward(1_000)
          return repoRow(relativePath).count()
        },
        { timeout: 30_000 }
      )
      .toBe(count)

  // git init in an existing directory surfaces its `.git` marker without Rescan.
  const initLaterDir = path.join(root, 'init-later')
  await expectRepoRowCount('init-later', 0)
  git(initLaterDir, 'init', '-b', 'main')
  await expectRepoRowCount('init-later', 1)

  // Removing only the marker drops the checkout even though the directory remains.
  rmSync(path.join(initLaterDir, '.git'), { recursive: true, force: true })
  await expectRepoRowCount('init-later', 0)

  const markerRepoDir = path.join(root, 'marker-repo')
  await expectRepoRowCount('marker-repo', 0)
  git(markerRepoDir, 'init', '-b', 'main')
  await expectRepoRowCount('marker-repo', 1)
  rmSync(path.join(markerRepoDir, '.git'), { recursive: true, force: true })
  await expectRepoRowCount('marker-repo', 0)

  // A settings edit is picked up without Rescan or remounting.
  writeSettings(root, '{ "git.autoRepositoryDetection": false }')
  await orcaPage.clock.fastForward(6_000)
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 30_000 })

  await orcaPage.screenshot({ path: path.join(root, 'p2-settings.png') })
})
