import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { defineMethod } from '../../core'
import {
  FolderReposScan,
  FolderReposScanQuery,
  FolderReposSettings
} from '../../../../../shared/rpc-contract/folder-repos/folder-repos-params'
import type {
  FolderNestedRepo,
  FolderNestedRepoScanResult,
  FolderReposScanProgressResult,
  FolderReposSettingsResult
} from '../../../../../shared/folder-workspaces/folder-nested-git'
import {
  beginFolderRepoScan,
  cancelFolderRepoScan,
  folderRepoScanKey,
  readFolderRepoScanProgress
} from './folder-repos-scan-registry'
import { scanNestedRepos } from '../../../../project-groups/nested-repo-discovery'
import {
  collectSubmoduleRepos,
  collectWorktreeRepos
} from '../../../../project-groups/folder-nested-repos'
import {
  folderGitSettingsFingerprint,
  readFolderGitScanSettings,
  type FolderGitScanSettings
} from '../../../../project-groups/folder-git-settings'
import {
  normalizeNestedRepoScanOptions,
  nestedRepoPathKey
} from '../../../../project-groups/nested-repo-scan-rules'
import {
  isNestedGitCheckout,
  readNestedGitBranch
} from '../../../../git/repositories/nested-repo-head-branch'

/** git.scanRepositories paths, canonicalized and constrained to the folder root. */
async function resolveScanRoots(
  folderPath: string,
  scanRepositories: readonly string[],
  signal?: AbortSignal
): Promise<{ path: string; segments: string[] }[]> {
  const roots: { path: string; segments: string[] }[] = []
  for (const relativePath of scanRepositories) {
    if (signal?.aborted) {
      break
    }
    const canonical = await realpath(resolve(folderPath, ...relativePath.split('/'))).catch(
      () => null
    )
    if (!canonical) {
      continue
    }
    const inside = relative(folderPath, canonical)
    // A junction can resolve to another drive, where relative() returns an absolute path.
    if (!inside || isAbsolute(inside) || inside.startsWith(`..${sep}`) || inside === '..') {
      continue
    }
    roots.push({ path: canonical, segments: inside.split(sep).filter(Boolean) })
  }
  return roots
}

/**
 * Absolute git.ignoredRepositories entries compare by realpath, as VS Code does. Entries inside
 * the folder also become relative keys so they are filtered before consuming the repo cap.
 */
async function resolveIgnoredRepositories(
  folderPath: string,
  ignoredRepositories: readonly string[],
  signal?: AbortSignal
): Promise<{ absolute: Set<string>; relative: string[] }> {
  const absolute = new Set<string>()
  const relativePaths: string[] = []
  for (const repositoryPath of ignoredRepositories) {
    if (signal?.aborted) {
      break
    }
    const canonical = await realpath(repositoryPath).catch(() => null)
    if (!canonical) {
      continue
    }
    absolute.add(canonical)
    const inside = relative(folderPath, canonical)
    if (inside && !isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`)) {
      relativePaths.push(nestedRepoPathKey(inside.split(sep).filter(Boolean).join('/')))
    }
  }
  return { absolute, relative: relativePaths }
}

type Runtime = {
  resolveRuntimeFileTarget: (selector: string) => Promise<{ worktree: { path: string } }>
}

/** Submodule actions depend on .gitmodules, not on whether submodule rows were detected. */
async function markHasSubmodules(
  folderPath: string,
  repos: FolderNestedRepo[],
  signal?: AbortSignal
): Promise<FolderNestedRepo[]> {
  const marked = [...repos]
  for (let index = 0; index < marked.length; index++) {
    if (signal?.aborted) {
      break
    }
    const repo = marked[index]!
    if (repo.hasSubmodules) {
      continue
    }
    const marker = await lstat(
      join(folderPath, ...repo.relativePath.split('/'), '.gitmodules')
    ).catch(() => null)
    if (marker?.isFile()) {
      marked[index] = { ...repo, hasSubmodules: true }
    }
  }
  return marked
}

async function readSettings(
  folderWorktree: string,
  runtime: Runtime
): Promise<{ folderPath: string; settings: FolderGitScanSettings }> {
  const target = await runtime.resolveRuntimeFileTarget(folderWorktree)
  const folderPath = await realpath(target.worktree.path)
  return { folderPath, settings: await readFolderGitScanSettings(folderPath) }
}

export const FOLDER_REPO_METHODS = [
  defineMethod({
    name: 'folderRepos.settings',
    permission: 'workspace',
    params: FolderReposSettings,
    handler: async (params, { runtime }): Promise<FolderReposSettingsResult> => {
      const { settings } = await readSettings(params.folderWorktree, runtime)
      return { fingerprint: folderGitSettingsFingerprint(settings), error: settings.invalid }
    }
  }),
  defineMethod({
    name: 'folderRepos.scan',
    permission: 'workspace',
    params: FolderReposScan,
    handler: async (params, { runtime, signal }): Promise<FolderNestedRepoScanResult> => {
      const scanHandle = params.scanId
        ? beginFolderRepoScan(folderRepoScanKey(params.folderWorktree, params.scanId), signal)
        : null
      const scanSignal = scanHandle?.signal ?? signal
      try {
        const { folderPath, settings } = await readSettings(params.folderWorktree, runtime)
        const settingsFingerprint = folderGitSettingsFingerprint(settings)
        const normalized = normalizeNestedRepoScanOptions(params.options)
        if (!settings.scanEnabled) {
          return {
            folderPath,
            repos: [],
            truncated: false,
            timedOut: false,
            stopped: false,
            durationMs: 0,
            maxDepth: settings.maxDepth,
            maxRepos: normalized.maxRepos,
            settingsFingerprint,
            settingsError: settings.invalid,
            autorefresh: settings.autorefresh
          }
        }
        const [extraRoots, ignoredAbsolute] = await Promise.all([
          resolveScanRoots(folderPath, settings.scanRepositories, scanSignal),
          resolveIgnoredRepositories(folderPath, settings.ignoredAbsoluteRepositories, scanSignal)
        ])
        const ignoredRepositories = [
          ...new Set([...settings.ignoredRelativeRepositories, ...ignoredAbsolute.relative])
        ]
        const maxDepth =
          params.options?.maxDepth === undefined ? settings.maxDepth : normalized.maxDepth
        const scan = await scanNestedRepos({
          path: folderPath,
          options: { ...params.options, maxDepth },
          ...(scanSignal ? { signal: scanSignal } : {}),
          ...(scanHandle
            ? { onProgress: (progressScan) => scanHandle.setReposFound(progressScan.repos.length) }
            : {}),
          extraRoots,
          ignoredFolders: settings.ignoredFolders,
          ignoredRepositories,
          vsCodeDepth: true
        })
        const ignoredRelativePaths = new Set(ignoredRepositories)
        const repos: FolderNestedRepo[] = []
        for (const repo of scan.repos) {
          if (scanSignal?.aborted) {
            break
          }
          const relativeRepoPath = relative(folderPath, repo.path)
          if (!relativeRepoPath || !(await isNestedGitCheckout(repo.path))) {
            continue
          }
          const normalizedRelativePath = relativeRepoPath.split(sep).join('/')
          if (ignoredRelativePaths.has(nestedRepoPathKey(normalizedRelativePath))) {
            continue
          }
          if (ignoredAbsolute.absolute.size > 0) {
            const canonical = await realpath(repo.path).catch(() => null)
            if (canonical && ignoredAbsolute.absolute.has(canonical)) {
              continue
            }
          }
          repos.push({
            relativePath: normalizedRelativePath,
            displayName: repo.displayName,
            depth: repo.depth,
            branch: await readNestedGitBranch(repo.path)
          })
        }
        scanHandle?.setReposFound(repos.length)
        const nestedStartedAt = Date.now()
        const nestedDetectionAllowed = !scan.stopped && !scan.timedOut && !scanSignal?.aborted
        const worktrees =
          settings.detectWorktrees && nestedDetectionAllowed
            ? await collectWorktreeRepos({
                folderPath,
                repos,
                limit: settings.detectWorktreesLimit,
                maxRepos: scan.maxRepos,
                ignored: ignoredRelativePaths,
                ignoredAbsolute: ignoredAbsolute.absolute,
                ...(scanSignal ? { signal: scanSignal } : {})
              })
            : { repos, truncated: false }
        scanHandle?.setReposFound(worktrees.repos.length)
        const submodules =
          settings.detectSubmodules && nestedDetectionAllowed
            ? await collectSubmoduleRepos({
                folderPath,
                repos: worktrees.repos,
                limit: settings.detectSubmodulesLimit,
                maxRepos: scan.maxRepos,
                ignored: ignoredRelativePaths,
                ignoredAbsolute: ignoredAbsolute.absolute,
                ...(scanSignal ? { signal: scanSignal } : {})
              })
            : { repos: worktrees.repos, truncated: false }
        const finalRepos =
          settings.detectSubmodules && nestedDetectionAllowed
            ? submodules.repos
            : await markHasSubmodules(folderPath, submodules.repos, scanSignal)
        scanHandle?.setReposFound(finalRepos.length)
        return {
          folderPath,
          repos: finalRepos,
          truncated: scan.truncated || worktrees.truncated || submodules.truncated,
          timedOut: scan.timedOut,
          stopped: scan.stopped || Boolean(scanSignal?.aborted),
          durationMs: scan.durationMs + (Date.now() - nestedStartedAt),
          maxDepth: scan.maxDepth,
          maxRepos: scan.maxRepos,
          settingsFingerprint,
          settingsError: settings.invalid,
          autorefresh: settings.autorefresh
        }
      } finally {
        scanHandle?.finish()
      }
    }
  }),
  defineMethod({
    name: 'folderRepos.scanProgress',
    permission: 'workspace',
    params: FolderReposScanQuery,
    handler: async (params): Promise<FolderReposScanProgressResult> =>
      readFolderRepoScanProgress(folderRepoScanKey(params.folderWorktree, params.scanId))
  }),
  defineMethod({
    name: 'folderRepos.cancelScan',
    permission: 'workspace',
    params: FolderReposScanQuery,
    handler: async (params): Promise<{ cancelled: boolean }> => ({
      cancelled: cancelFolderRepoScan(folderRepoScanKey(params.folderWorktree, params.scanId))
    })
  })
]
