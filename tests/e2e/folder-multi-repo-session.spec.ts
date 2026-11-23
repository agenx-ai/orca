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

async function createFolderWorkspaces(
  orcaPage: Page,
  folders: readonly { name: string; folderPath: string }[]
): Promise<string[]> {
  return orcaPage.evaluate(async (entries) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    // The floating launcher is position-fixed and can cover sidebar rows in small windows.
    await store.getState().updateSettings({ floatingTerminalEnabled: false })
    const keys: string[] = []
    for (const entry of entries) {
      const group = await window.api.projectGroups.create({
        name: entry.name,
        parentPath: entry.folderPath,
        createdFrom: 'folder-scan'
      })
      await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
      const folder = await store
        .getState()
        .createFolderWorkspace(
          { projectGroupId: group.id, name: entry.name, folderPath: entry.folderPath },
          { runtimeEnvironmentId: null }
        )
      if (!folder) {
        throw new Error('folder workspace creation returned nothing')
      }
      keys.push(`folder:${folder.folderWorkspace.id}`)
    }
    const state = store.getState()
    state.setActiveWorktree(keys[0]!)
    state.setRightSidebarTab('source-control')
    state.setRightSidebarOpen(true)
    return keys
  }, folders)
}

test('folder repo session state survives folder switches and stays keyboard friendly', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: two folder workspaces plus scan, switch, and draft round-trips need headroom.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-session-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const folderA = path.join(root, 'folder-a')
  const folderB = path.join(root, 'folder-b')
  mkdirSync(folderA, { recursive: true })
  mkdirSync(folderB, { recursive: true })
  const aaaPath = createRepo(folderA, 'aaa')
  createRepo(folderA, 'group/bbb')
  createRepo(folderB, 'ccc')
  // Keep aaa dirty so the commit composer is available for the draft round-trip.
  writeFileSync(path.join(aaaPath, 'README.md'), 'dirty\n')

  await waitForSessionReady(orcaPage)
  const [folderKeyA, folderKeyB] = (await createFolderWorkspaces(orcaPage, [
    { name: 'Session A', folderPath: folderA },
    { name: 'Session B', folderPath: folderB }
  ])) as [string, string]

  const repoRow = (relativePath: string) =>
    orcaPage.locator(`[data-testid="folder-repo-row"][data-relative-path="${relativePath}"]`)
  const repoSelect = (relativePath: string) => repoRow(relativePath).locator('button').first()
  const dirNode = (relativePath: string) =>
    orcaPage.locator(`[data-testid="folder-repo-dir"][data-path="${relativePath}"]`)
  const commitMessage = () => orcaPage.getByRole('textbox', { name: 'Commit message' })
  const switchFolder = (key: string) =>
    orcaPage.evaluate((nextKey) => {
      window.__store!.getState().setActiveWorktree(nextKey)
    }, key)

  await expect(repoRow('aaa')).toBeVisible({ timeout: 60_000 })
  await expect(repoRow('group/bbb')).toBeVisible()
  await expect(dirNode('group')).toHaveAttribute('aria-expanded', 'true')

  await repoSelect('aaa').click()
  await expect(repoSelect('aaa')).toHaveAttribute('aria-current', 'true')
  await expect(commitMessage()).toBeVisible({ timeout: 30_000 })
  // The composer is disabled until something is staged; stage the dirty file first.
  const unstagedReadme = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="unstaged"]')
    .filter({ hasText: 'README.md' })
  const stageButton = unstagedReadme.getByRole('button', { name: 'Stage' })
  await stageButton.focus()
  await stageButton.press('Enter')
  await expect(commitMessage()).toBeEnabled({ timeout: 30_000 })
  await commitMessage().fill('draft survives folder switch')

  // Collapse the directory so the restored expansion state is observable.
  await dirNode('group').click()
  await expect(dirNode('group')).toHaveAttribute('aria-expanded', 'false')

  await switchFolder(folderKeyB)
  await expect(repoRow('ccc')).toBeVisible({ timeout: 60_000 })
  // Loading another folder must not move focus into its repository list.
  expect(
    await orcaPage.evaluate(
      () => document.activeElement?.closest('[data-testid="folder-repo-row"]') === null
    )
  ).toBe(true)

  const cacheHitStartedAt = Date.now()
  await switchFolder(folderKeyA)
  await expect(repoRow('aaa')).toBeVisible({ timeout: 60_000 })
  const cacheHitMs = Date.now() - cacheHitStartedAt
  console.log(`[perf] cached folder switch first paint ${cacheHitMs}ms`)
  expect(cacheHitMs).toBeLessThan(10_000)
  await expect(repoSelect('aaa')).toHaveAttribute('aria-current', 'true')
  await expect(commitMessage()).toHaveValue('draft survives folder switch')
  await expect(dirNode('group')).toHaveAttribute('aria-expanded', 'false')

  // Row actions are reachable from the keyboard and Escape returns focus to the trigger.
  const actionsTrigger = orcaPage.locator('[data-testid="folder-repo-actions"][data-repo="aaa"]')
  await actionsTrigger.focus()
  await actionsTrigger.press('Enter')
  await expect(orcaPage.getByRole('menuitem', { name: 'Fetch', exact: true })).toBeVisible()
  await orcaPage.keyboard.press('Escape')
  await expect(actionsTrigger).toBeFocused()
})

test('folder repo scan reports the repository limit', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  // Why: creating 101 repositories and scanning them needs more than the default timeout.
  test.setTimeout(180_000)
  const root = mkdtempSync(path.join(os.tmpdir(), 'orca-nested-git-limit-'))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const folderPath = path.join(root, 'workspace')
  mkdirSync(folderPath, { recursive: true })
  for (let index = 0; index < 101; index += 1) {
    createRepo(folderPath, `repo-${String(index).padStart(3, '0')}`)
  }

  await waitForSessionReady(orcaPage)
  await createFolderWorkspaces(orcaPage, [{ name: 'Repo Limit', folderPath }])
  await expect(orcaPage.getByText(/Repository limit reached/)).toBeVisible({ timeout: 60_000 })
})
