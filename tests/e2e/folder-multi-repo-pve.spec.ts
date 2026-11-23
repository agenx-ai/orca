import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { createFolderNestedGitSelector } from '../../src/shared/folder-workspaces/folder-nested-git'

const PAIRING_URL = process.env.ORCA_PVE_PAIRING_URL ?? ''
const FOLDER_PATH = process.env.ORCA_PVE_FOLDER_PATH ?? '/root/nested-git-p0'
const SSH_TARGET = process.env.ORCA_PVE_SSH ?? 'root@10.10.10.104'

function sshRun(command: string): string {
  return execFileSync(
    'ssh',
    ['-o', 'StrictHostKeyChecking=no', '-J', 'root@10.20.35.181', SSH_TARGET, command],
    { encoding: 'utf8' }
  ).trim()
}

function sshGit(repoRelativePath: string, ...args: string[]): string {
  return sshRun(`cd ${FOLDER_PATH}/${repoRelativePath} && git ${args.join(' ')}`)
}

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

test('folder project discovers nested repos on a paired runtime', async ({ orcaPage }) => {
  // Why: scans run on a remote runtime reached through the paired connection.
  test.setTimeout(480_000)
  if (!PAIRING_URL) {
    throw new Error('ORCA_PVE_PAIRING_URL is required')
  }
  const diffLine = `pve diff ${Date.now()}`
  const REPO_PATH = `${FOLDER_PATH}/services/repo-beta`
  const BRANCH_REPO_PATH = `${FOLDER_PATH}/services/repo-branches`
  const BRANCH_REMOTE_PATH = '/root/nested-git-p0-branches-remote.git'
  const SUBMODULE_REPO_PATH = `${FOLDER_PATH}/services/repo-sub`
  const SUBMODULE_SOURCE_PATH = '/root/nested-git-submodule-src'
  const WORKTREE_REPO_PATH = `${FOLDER_PATH}/services/repo-wt-parent`
  const WORKTREE_PATH = `${FOLDER_PATH}/hidden/one/two/repo-wt`
  const MARKER_REPO_RELATIVE_PATH = `services/repo-marker-${Date.now()}`
  sshRun(`rm -f ${FOLDER_PATH}/.vscode/settings.json && mkdir -p ${FOLDER_PATH}/.vscode`)
  sshRun(
    `printf '%s\\n' '{"git.ignoredRepositories":["repo-alpha"],"git.detectWorktrees":true}' > ${FOLDER_PATH}/.vscode/settings.json`
  )
  sshRun(
    `rm -rf ${SUBMODULE_REPO_PATH} ${SUBMODULE_SOURCE_PATH} ${WORKTREE_REPO_PATH} ${WORKTREE_PATH} ${FOLDER_PATH}/${MARKER_REPO_RELATIVE_PATH}`
  )
  // The plain directory exists before the folder is opened; only `git init` may surface it later.
  sshRun(`mkdir -p ${FOLDER_PATH}/${MARKER_REPO_RELATIVE_PATH}`)
  sshRun(
    `mkdir -p ${SUBMODULE_SOURCE_PATH} && cd ${SUBMODULE_SOURCE_PATH} && git init -q -b main && git config user.name "E2E Test" && git config user.email e2e@test.local && printf 'child\\n' > child.txt && git add -A && git commit -q -m "child commit"`
  )
  sshRun(
    `mkdir -p ${SUBMODULE_REPO_PATH} && cd ${SUBMODULE_REPO_PATH} && git init -q -b main && git config user.name "E2E Test" && git config user.email e2e@test.local && printf 'parent\\n' > parent.txt && git add -A && git commit -q -m "parent commit"`
  )
  sshRun(
    `cd ${SUBMODULE_REPO_PATH} && git -c protocol.file.allow=always submodule add ${SUBMODULE_SOURCE_PATH} libs/child && git commit -q -m "add submodule"`
  )
  sshRun(
    `mkdir -p ${WORKTREE_REPO_PATH} && cd ${WORKTREE_REPO_PATH} && git init -q -b main && git config user.name "E2E Test" && git config user.email e2e@test.local && printf 'worktree\\n' > parent.txt && git add -A && git commit -q -m "worktree parent commit"`
  )
  sshRun(`mkdir -p ${FOLDER_PATH}/hidden/one/two`)
  sshRun(`cd ${WORKTREE_REPO_PATH} && git worktree add ${WORKTREE_PATH} -b feature/worktree`)
  sshRun(`cd ${REPO_PATH} && git checkout main`)
  sshRun(`rm -rf ${BRANCH_REPO_PATH} ${BRANCH_REMOTE_PATH}`)
  sshRun(`mkdir -p ${BRANCH_REPO_PATH}`)
  sshRun(
    `cd ${BRANCH_REPO_PATH} && git init -q -b main && git config user.name "E2E Test" && git config user.email e2e@test.local`
  )
  sshRun(
    `cd ${BRANCH_REPO_PATH} && printf 'main\\n' > branches.txt && git add -A && git commit -q -m "branch main commit"`
  )
  sshRun(
    `cd ${BRANCH_REPO_PATH} && git checkout -q -b feature/history && printf 'history\\n' > history.txt && git add -A && git commit -q -m "branch history commit"`
  )
  sshRun(
    `cd ${BRANCH_REPO_PATH} && git checkout -q -b feature/older main && printf 'older\\n' > older.txt && git add -A && git commit -q -m "branch older commit"`
  )
  sshRun(`cd ${BRANCH_REPO_PATH} && git checkout -q main`)
  sshRun(
    `cd ${BRANCH_REPO_PATH} && for i in $(seq 1 55); do git commit -q --allow-empty -m "pve history $i"; done`
  )
  sshRun(`git init --bare ${BRANCH_REMOTE_PATH}`)
  sshRun(
    `cd ${BRANCH_REPO_PATH} && git remote add origin ${BRANCH_REMOTE_PATH} && git push -f -u origin main`
  )
  sshRun(`cd ${BRANCH_REPO_PATH} && git push -f origin feature/history feature/older`)
  // Keep main ahead of origin/main with a real file change so the branch compare has a diff to open.
  sshRun(
    `cd ${BRANCH_REPO_PATH} && printf 'compare tip\\n' > compare.txt && git add compare.txt && git commit -q -m "pve compare tip"`
  )
  sshRun(`printf '%s\n' '${diffLine}' > ${FOLDER_PATH}/services/repo-beta/repo-beta.txt`)
  sshRun(`printf '%s\n' 'pve untracked ${Date.now()}' > ${FOLDER_PATH}/services/repo-beta/new.txt`)
  sshRun(`rm -rf ${FOLDER_PATH}/bare.git ${FOLDER_PATH}/head-only`)
  sshRun(
    `mkdir -p ${FOLDER_PATH}/bare.git/objects ${FOLDER_PATH}/bare.git/refs && printf 'ref: refs/heads/main\\n' > ${FOLDER_PATH}/bare.git/HEAD`
  )
  sshRun(
    `mkdir -p ${FOLDER_PATH}/head-only/.git && printf 'ref: refs/heads/main\\n' > ${FOLDER_PATH}/head-only/.git/HEAD`
  )

  await waitForSessionReady(orcaPage)
  const { environmentId, folderSelector } = await orcaPage.evaluate(
    async ({ pairingUrl, folderPath }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const added = await window.api.runtimeEnvironments.addFromPairingCode({
        name: 'PVE Linux',
        pairingCode: pairingUrl
      })
      const id = added.environment.id
      store.getState().setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
      if (!(await store.getState().refreshRuntimeEnvironmentStatus(id))) {
        throw new Error('paired runtime unreachable')
      }
      if (!(await store.getState().setActiveRuntimeEnvironmentPreference(id))) {
        throw new Error('could not select paired runtime')
      }
      const group = await store.getState().createProjectGroup('PVE Nested Git P0', `runtime:${id}`)
      if (!group) {
        throw new Error('project group creation returned nothing')
      }
      await store.getState().fetchProjectGroups({ runtimeEnvironmentId: id, throwOnError: true })
      const folder = await store
        .getState()
        .createFolderWorkspace(
          { projectGroupId: group.id, name: 'PVE Nested Git P0', folderPath },
          { runtimeEnvironmentId: id }
        )
      if (!folder) {
        throw new Error('folder workspace creation returned nothing')
      }
      const state = store.getState()
      state.setActiveWorktree(`folder:${folder.folderWorkspace.id}`)
      state.setRightSidebarTab('source-control')
      state.setRightSidebarOpen(true)
      return { environmentId: id, folderSelector: `folder:${folder.folderWorkspace.id}` }
    },
    { pairingUrl: PAIRING_URL, folderPath: FOLDER_PATH }
  )

  await expect(orcaPage.getByText('repo-beta', { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText('repo-gamma', { exact: true }).first()).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: /repo-alpha/ })).toHaveCount(0)
  await expect(orcaPage.getByRole('button', { name: /bare\.git/ })).toHaveCount(0)
  await expect(orcaPage.getByRole('button', { name: /head-only/ })).toHaveCount(0)
  await expect(
    orcaPage.locator(
      '[data-testid="folder-repo-row"][data-relative-path="services/repo-sub/libs/child"]'
    )
  ).toHaveAttribute('data-submodule', 'true', { timeout: 30_000 })
  await expect(
    orcaPage.locator('[data-testid="folder-repo-row"][data-relative-path="hidden/one/two/repo-wt"]')
  ).toHaveAttribute('data-worktree', 'true', { timeout: 30_000 })

  await orcaPage
    .getByRole('button', { name: /repo-beta/ })
    .first()
    .click()
  const branchRow = (name: string) =>
    orcaPage.locator(`[data-testid="folder-branch-row"][data-branch="${name}"]`)
  const branchHistory = (name: string) =>
    orcaPage.locator(`[data-testid="folder-branch-history"][data-branch="${name}"]`)
  await expect(orcaPage.getByText('repo-beta.txt', { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await expect(orcaPage.getByText('new.txt', { exact: true }).first()).toBeVisible()

  await orcaPage.getByText('repo-beta.txt', { exact: true }).first().click()
  await expect(orcaPage.locator('.editor-header-path').first()).toContainText('repo-beta.txt', {
    timeout: 30_000
  })
  await expect(orcaPage.locator('.monaco-diff-editor')).toBeVisible({ timeout: 30_000 })
  await expect(
    orcaPage.locator('.modified-in-monaco-diff-editor .view-line').filter({ hasText: diffLine })
  ).toBeVisible()
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)
  await orcaPage.screenshot({ path: path.join('/tmp', 'pve-p0-diff.png') })

  const unstagedBetaRow = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="unstaged"]')
    .filter({ hasText: 'repo-beta.txt' })
  const stageButton = unstagedBetaRow.getByRole('button', { name: 'Stage' })
  await stageButton.focus()
  await stageButton.press('Enter')
  await expect(orcaPage.getByText('Staged Changes', { exact: true })).toBeVisible({
    timeout: 30_000
  })

  const stagedBetaRow = orcaPage
    .locator('[data-testid="source-control-entry"][data-source-control-area="staged"]')
    .filter({ hasText: 'repo-beta.txt' })
  await stagedBetaRow.getByText('repo-beta.txt', { exact: true }).click()
  await expect(orcaPage.locator('.monaco-diff-editor')).toBeVisible({ timeout: 30_000 })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)
  const unstageButton = stagedBetaRow.getByRole('button', { name: 'Unstage' })
  await unstageButton.focus()
  await unstageButton.press('Enter')
  await expect(unstagedBetaRow).toBeVisible({ timeout: 30_000 })

  const stageAll = orcaPage.getByRole('button', { name: 'Stage All', exact: true })
  await expect(stageAll).toBeVisible({ timeout: 15_000 })
  await stageAll.click()
  await expect(orcaPage.getByText('Staged Changes', { exact: true })).toBeVisible({
    timeout: 30_000
  })

  const message = `pve nested commit ${Date.now()}`
  await orcaPage.getByRole('textbox', { name: 'Commit message' }).fill(message)
  await orcaPage.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect
    .poll(() => sshGit('services/repo-beta', 'log', '-1', '--pretty=%s'), { timeout: 60_000 })
    .toBe(message)
  expect(sshGit('services/repo-beta', 'status', '--porcelain')).toBe('')

  await orcaPage.getByRole('button', { name: 'Refresh branches' }).click()
  await expect(
    branchHistory('main')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: message })
      .first()
  ).toBeVisible({ timeout: 30_000 })

  await orcaPage
    .getByRole('button', { name: /repo-branches/ })
    .first()
    .click()
  await expect(branchRow('main')).toHaveAttribute('aria-expanded', 'true', { timeout: 60_000 })
  await expect(branchRow('main')).toHaveAttribute('aria-current', 'true')
  await expect(branchRow('feature/history')).toHaveAttribute('aria-expanded', 'false')
  await expect(branchRow('feature/older')).toBeVisible()
  await expect(branchRow('origin/main')).toBeVisible()
  await expect(
    branchHistory('main')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: 'pve compare tip' })
      .first()
  ).toBeVisible({ timeout: 30_000 })
  expect(await branchHistory('main').innerText()).not.toContain('branch history commit')
  await branchRow('feature/history').click()
  await expect(
    branchHistory('feature/history')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: 'branch history commit' })
      .first()
  ).toBeVisible({ timeout: 30_000 })
  await branchRow('feature/older').click()
  await expect(
    branchHistory('feature/older')
      .locator('[data-testid="folder-branch-commit-row"]')
      .filter({ hasText: 'branch older commit' })
      .first()
  ).toBeVisible({ timeout: 30_000 })

  // Commit diffs, history paging, branch compare, and checkout run through the paired runtime.
  await branchHistory('feature/older')
    .locator('[data-testid="folder-branch-commit-row"]')
    .filter({ hasText: 'branch older commit' })
    .first()
    .click()
  await expect(orcaPage.getByRole('button', { name: /Commit .*branch older commit/ })).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText('older.txt', { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)

  const loadMore = orcaPage.locator('[data-testid="folder-branch-load-more"]')
  await expect(loadMore).toBeVisible({ timeout: 60_000 })
  await loadMore.click()
  await expect
    .poll(() => branchHistory('main').locator('[data-testid="folder-branch-commit-row"]').count(), {
      timeout: 60_000
    })
    .toBeGreaterThan(50)
  await expect(loadMore).toHaveCount(0)
  await expect(branchHistory('main').getByText('pve history 1', { exact: true })).toHaveCount(1)

  const compareRow = orcaPage.locator('[data-testid="folder-branch-compare"]')
  await expect(compareRow).toContainText('Compare main with origin/main', { timeout: 60_000 })
  await compareRow.click()
  await expect(
    orcaPage.getByRole('button', { name: /Branch Changes \(origin\/main\)/ })
  ).toBeVisible({ timeout: 60_000 })
  await expect(orcaPage.getByText('compare.txt', { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText(/Error loading diff/)).toHaveCount(0)

  const checkoutOlder = orcaPage.locator(
    '[data-testid="folder-branch-checkout"][data-branch="feature/older"]'
  )
  await expect(checkoutOlder).toBeVisible({ timeout: 60_000 })
  await checkoutOlder.click()
  await expect
    .poll(() => sshGit('services/repo-branches', 'branch', '--show-current'), { timeout: 60_000 })
    .toBe('feature/older')
  await expect(branchRow('feature/older')).toHaveAttribute('aria-current', 'true', {
    timeout: 60_000
  })
  sshRun(`cd ${BRANCH_REPO_PATH} && git checkout -q main`)
  // The external checkout refreshes the branch list and repo row without reopening the folder.
  const nestedSelector = createFolderNestedGitSelector(folderSelector, 'services/repo-branches')
  await reportObservedHead(
    orcaPage,
    nestedSelector,
    sshGit('services/repo-branches', 'rev-parse', 'feature/older')
  )
  await reportObservedHead(
    orcaPage,
    nestedSelector,
    sshGit('services/repo-branches', 'rev-parse', 'main')
  )
  await expect(branchRow('main')).toHaveAttribute('aria-current', 'true', { timeout: 90_000 })
  await expect(
    orcaPage.locator('[data-testid="folder-repo-row"][data-relative-path="services/repo-branches"]')
  ).toContainText('main', { timeout: 30_000 })

  sshRun(`printf 'dirty\\n' > ${SUBMODULE_REPO_PATH}/libs/child/dirty.txt`)
  const submoduleParentRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="services/repo-sub"]'
  )
  await submoduleParentRow.getByRole('button').first().click()
  const submoduleChange = orcaPage.locator(
    '[data-testid="source-control-entry"][data-source-control-path="libs/child"]'
  )
  await expect(submoduleChange).toBeVisible({ timeout: 60_000 })
  sshRun(`printf '%s\\n' '{"git.ignoreSubmodules":true}' > ${FOLDER_PATH}/.vscode/settings.json`)
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(submoduleChange).toHaveCount(0, { timeout: 60_000 })

  // The folder root watch discovers and drops a remote checkout without Rescan.
  const liveRepoRelativePath = `services/repo-live-${Date.now()}`
  sshRun(
    `mkdir -p ${FOLDER_PATH}/${liveRepoRelativePath} && cd ${FOLDER_PATH}/${liveRepoRelativePath} && git init -q -b main && git config user.name "E2E Test" && git config user.email e2e@test.local && printf 'live\\n' > live.txt && git add -A && git commit -q -m "live commit"`
  )
  const liveRepoRow = orcaPage.locator(
    `[data-testid="folder-repo-row"][data-relative-path="${liveRepoRelativePath}"]`
  )
  await expect(liveRepoRow).toBeVisible({ timeout: 60_000 })
  sshRun(`rm -rf ${FOLDER_PATH}/${liveRepoRelativePath}`)
  await expect(liveRepoRow).toHaveCount(0, { timeout: 60_000 })

  // git init in an existing directory and removing only `.git` both surface through the marker watch.
  const markerRepoRow = orcaPage.locator(
    `[data-testid="folder-repo-row"][data-relative-path="${MARKER_REPO_RELATIVE_PATH}"]`
  )
  await expect(markerRepoRow).toHaveCount(0)
  sshRun(`cd ${FOLDER_PATH}/${MARKER_REPO_RELATIVE_PATH} && git init -q -b main`)
  await expect(markerRepoRow).toBeVisible({ timeout: 60_000 })
  sshRun(`rm -rf ${FOLDER_PATH}/${MARKER_REPO_RELATIVE_PATH}/.git`)
  await expect(markerRepoRow).toHaveCount(0, { timeout: 60_000 })

  // Submodule actions run on the paired runtime: deinit drops the child row, Init restores it.
  sshRun(`cd ${SUBMODULE_REPO_PATH} && git config protocol.file.allow always`)
  sshRun(`cd ${SUBMODULE_REPO_PATH} && git submodule deinit -f libs/child`)
  const submoduleChildRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="services/repo-sub/libs/child"]'
  )
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(submoduleChildRow).toHaveCount(0, { timeout: 60_000 })
  await submoduleParentRow.getByRole('button').first().click()
  const submoduleMenu = orcaPage.getByRole('button', { name: 'Submodule actions' })
  await expect(submoduleMenu).toBeVisible({ timeout: 60_000 })
  await submoduleMenu.click()
  await orcaPage.getByRole('menuitem', { name: 'Initialize submodules' }).click()
  await expect(submoduleChildRow).toHaveAttribute('data-submodule', 'true', { timeout: 60_000 })

  sshRun(`cd ${SUBMODULE_REPO_PATH} && git config submodule.libs/child.url /nonexistent/submodule`)
  await submoduleMenu.click()
  await orcaPage.getByRole('menuitem', { name: 'Sync submodule URLs' }).click()
  await expect
    .poll(() => sshRun(`cd ${SUBMODULE_REPO_PATH} && git config submodule.libs/child.url`), {
      timeout: 60_000
    })
    .toBe(SUBMODULE_SOURCE_PATH)

  sshRun(
    `printf '%s\\n' '{"git.ignoredRepositories":["services/repo-gamma"]}' > ${FOLDER_PATH}/.vscode/settings.json`
  )
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(orcaPage.getByText('repo-alpha', { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText('repo-gamma', { exact: true })).toHaveCount(0)

  sshRun(
    `printf '%s\\n' '{"git.autoRepositoryDetection":false}' > ${FOLDER_PATH}/.vscode/settings.json`
  )
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(orcaPage.getByText(/No Git repositories found/)).toBeVisible({ timeout: 60_000 })

  // A separate heavy folder keeps the scan busy long enough to report progress and stop it.
  const SCAN_FOLDER = '/root/nested-git-scan-control'
  sshRun(`rm -rf ${SCAN_FOLDER}`)
  sshRun(`bash -c 'mkdir -p ${SCAN_FOLDER}/scan-heavy/a{001..160}/b{001..160}'`)
  sshRun(
    `mkdir -p ${SCAN_FOLDER}/repo-scan && cd ${SCAN_FOLDER}/repo-scan && git init -q -b main && git config user.name "E2E Test" && git config user.email e2e@test.local && printf 'scan\\n' > scan.txt && git add -A && git commit -q -m "scan repo"`
  )
  await orcaPage.evaluate(
    async ({ environmentId: id, folderPath, name }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const group = await store.getState().createProjectGroup(name, `runtime:${id}`)
      if (!group) {
        throw new Error('project group creation returned nothing')
      }
      await store.getState().fetchProjectGroups({ runtimeEnvironmentId: id, throwOnError: true })
      const folder = await store
        .getState()
        .createFolderWorkspace(
          { projectGroupId: group.id, name, folderPath },
          { runtimeEnvironmentId: id }
        )
      if (!folder) {
        throw new Error('folder workspace creation returned nothing')
      }
      const state = store.getState()
      state.setActiveWorktree(`folder:${folder.folderWorkspace.id}`)
      state.setRightSidebarTab('source-control')
      state.setRightSidebarOpen(true)
    },
    { environmentId, folderPath: SCAN_FOLDER, name: 'PVE Scan Control' }
  )
  const scanRow = orcaPage.locator(
    '[data-testid="folder-repo-row"][data-relative-path="repo-scan"]'
  )
  await expect(scanRow).toBeVisible({ timeout: 120_000 })
  const scanning = orcaPage.locator('[data-testid="folder-repos-scanning"]')
  await orcaPage.getByRole('button', { name: 'Rescan repositories' }).click()
  await expect(scanning).toBeVisible()
  await expect(scanning).toContainText(/Scanning repositories… \d+/, { timeout: 60_000 })
  await scanning.getByRole('button', { name: 'Stop' }).dispatchEvent('click')
  await expect(scanning).toHaveCount(0, { timeout: 60_000 })
  await expect(orcaPage.getByText('Scan was stopped.')).toBeVisible({ timeout: 60_000 })

  sshRun(`rm -f ${FOLDER_PATH}/.vscode/settings.json`)
  sshRun(
    `rm -rf ${SUBMODULE_REPO_PATH} ${SUBMODULE_SOURCE_PATH} ${WORKTREE_REPO_PATH} ${WORKTREE_PATH} ${FOLDER_PATH}/${MARKER_REPO_RELATIVE_PATH} ${SCAN_FOLDER}`
  )
  console.log('[pve] environment', environmentId)
})
