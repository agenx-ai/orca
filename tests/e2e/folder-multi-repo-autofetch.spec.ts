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
  writeFileSync(path.join(repoPath, 'README.md'), `${relativePath}\n`)
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '-m', 'initial')
  return repoPath
}

function createBare(remoteRoot: string, name: string): string {
  const remotePath = path.join(remoteRoot, name)
  git(remoteRoot, 'init', '--bare', '-b', 'main', remotePath)
  return remotePath
}

function commitAndPush(cloneRoot: string, remotePath: string): string {
  git(cloneRoot, 'clone', remotePath, 'clone')
  const clonePath = path.join(cloneRoot, 'clone')
  writeFileSync(path.join(clonePath, 'remote.txt'), `${Date.now()}\n`)
  git(clonePath, 'add', '.')
  git(clonePath, 'commit', '-m', 'remote commit')
  git(clonePath, 'push', 'origin', 'main')
  return git(clonePath, 'rev-parse', 'HEAD')
}

function writeAutofetchSettings(root: string, autofetch: true | 'all'): void {
  mkdirSync(path.join(root, '.vscode'), { recursive: true })
  writeFileSync(
    path.join(root, '.vscode', 'settings.json'),
    JSON.stringify({ 'git.autofetch': autofetch, 'git.autofetchPeriod': 60 })
  )
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

async function openNestedRepo(orcaPage: Page, root: string): Promise<string> {
  await waitForSessionReady(orcaPage)
  await openFolderWorkspace(orcaPage, root, 'Autofetch Folder')
  const repoRow = orcaPage.locator('[data-testid="folder-repo-row"][data-relative-path="repo-a"]')
  await expect(repoRow).toBeVisible({ timeout: 60_000 })
  await repoRow.getByRole('button').first().click()
  await expect(
    orcaPage.locator('[data-testid="folder-branch-row"][data-branch="main"]')
  ).toHaveAttribute('aria-current', 'true', { timeout: 60_000 })
  return path.join(root, 'repo-a')
}

test('git.autofetch fetches the default remote on the configured period', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-autofetch-'))
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-autofetch-remote-'))
  const cloneRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-autofetch-clone-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(remoteRoot, { recursive: true, force: true })
  )
  registerPostElectronShutdownCleanup(async () =>
    rmSync(cloneRoot, { recursive: true, force: true })
  )
  const repoPath = createRepo(root, 'repo-a')
  const remotePath = createBare(remoteRoot, 'origin.git')
  git(repoPath, 'remote', 'add', 'origin', remotePath)
  git(repoPath, 'push', '-u', 'origin', 'main')
  writeAutofetchSettings(root, true)

  await openNestedRepo(orcaPage, root)
  const before = git(repoPath, 'rev-parse', 'origin/main')
  const pushed = commitAndPush(cloneRoot, remotePath)
  expect(pushed).not.toBe(before)
  expect(git(repoPath, 'rev-parse', 'origin/main')).toBe(before)

  await expect
    .poll(() => git(repoPath, 'rev-parse', 'origin/main'), {
      timeout: 90_000,
      intervals: [5_000]
    })
    .toBe(pushed)
})

test('git.autofetch all fetches every remote', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(240_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-autofetch-all-'))
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-autofetch-all-remote-'))
  const cloneRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-autofetch-all-clone-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(remoteRoot, { recursive: true, force: true })
  )
  registerPostElectronShutdownCleanup(async () =>
    rmSync(cloneRoot, { recursive: true, force: true })
  )
  const repoPath = createRepo(root, 'repo-a')
  const originPath = createBare(remoteRoot, 'origin.git')
  const backupPath = createBare(remoteRoot, 'backup.git')
  git(repoPath, 'remote', 'add', 'origin', originPath)
  git(repoPath, 'remote', 'add', 'backup', backupPath)
  git(repoPath, 'push', '-u', 'origin', 'main')
  git(repoPath, 'push', 'backup', 'main')
  writeAutofetchSettings(root, 'all')

  await openNestedRepo(orcaPage, root)
  const backupBefore = git(repoPath, 'rev-parse', 'backup/main')
  const pushed = commitAndPush(cloneRoot, backupPath)
  expect(pushed).not.toBe(backupBefore)
  expect(git(repoPath, 'rev-parse', 'backup/main')).toBe(backupBefore)

  await expect
    .poll(() => git(repoPath, 'rev-parse', 'backup/main'), {
      timeout: 90_000,
      intervals: [5_000]
    })
    .toBe(pushed)
  // The default remote is untouched by the backup-only commit.
  expect(git(repoPath, 'rev-parse', 'origin/main')).toBe(
    git(repoPath, 'rev-parse', 'backup/main~1')
  )
})
