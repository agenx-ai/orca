import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type {
  FolderNestedRepoScanOptions,
  FolderNestedRepoScanResult
} from '../../../../../../shared/folder-workspaces/folder-nested-git'
import { normalizeRuntimePathForComparison } from '../../../../../../shared/file-access/cross-platform-path'
import {
  getFolderReposSettings,
  scanFolderNestedRepos
} from '@/runtime/source-control/folder-repos/folder-repos-client'

/** Results stay shareable across panel remounts and workspace switches; switching back must not rescan. */
export const FOLDER_REPOS_FRESH_MS = 5 * 60_000
const MAX_CACHED_FOLDERS = 20

export type FolderReposCacheEntry = {
  result: FolderNestedRepoScanResult
  fetchedAt: number
}

const cache = new Map<string, FolderReposCacheEntry>()
const inFlight = new Map<
  string,
  {
    promise: Promise<FolderNestedRepoScanResult>
    fingerprint: Promise<string | null>
    scanId: string | null
  }
>()
const latestRequestByRoot = new Map<string, number>()
let requestSequence = 0

export function folderReposRootKey(hostId: string, folderPath: string): string {
  return `${hostId}\0${normalizeRuntimePathForComparison(folderPath)}`
}

export function peekFolderRepos(rootKey: string): FolderReposCacheEntry | undefined {
  return cache.get(rootKey)
}

/** A checkout changes one repo's branch without changing the folder layout, so patch the cached row. */
export function updateFolderRepoBranch(
  rootKey: string,
  relativePath: string,
  branch: string | null
): void {
  const entry = cache.get(rootKey)
  if (!entry) {
    return
  }
  const repos = entry.result.repos.map((repo) =>
    repo.relativePath === relativePath ? { ...repo, branch } : repo
  )
  remember(rootKey, { ...entry.result, repos })
}

function folderReposAreFresh(entry: FolderReposCacheEntry, now = Date.now()): boolean {
  return now - entry.fetchedAt < FOLDER_REPOS_FRESH_MS
}

function remember(rootKey: string, result: FolderNestedRepoScanResult): void {
  cache.delete(rootKey)
  cache.set(rootKey, { result, fetchedAt: Date.now() })
  while (cache.size > MAX_CACHED_FOLDERS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
}

export async function loadFolderRepos(args: {
  rootKey: string
  target: RuntimeClientTarget
  folderWorktree: string
  options?: FolderNestedRepoScanOptions
  /** Rescan starts a new scan even when stale revalidation is already in flight. */
  force?: boolean
  /** Lets the caller poll progress and cancel this scan from the runtime. */
  scanId?: string
}): Promise<{ result: FolderNestedRepoScanResult; scanId: string | null }> {
  const readFingerprint = async (): Promise<string | null> =>
    getFolderReposSettings(args.target, args.folderWorktree).then(
      (settings) => settings.fingerprint,
      () => null
    )
  let fingerprint = args.force ? undefined : await readFingerprint()
  const existing = inFlight.get(args.rootKey)
  if (
    existing &&
    !args.force &&
    fingerprint !== null &&
    (await existing.fingerprint) === fingerprint
  ) {
    return { result: await existing.promise, scanId: existing.scanId }
  }
  const sequence = ++requestSequence
  latestRequestByRoot.set(args.rootKey, sequence)
  const fingerprintPromise: Promise<string | null> =
    fingerprint === undefined ? readFingerprint() : Promise.resolve(fingerprint)
  const request = (async (): Promise<FolderNestedRepoScanResult> => {
    // Settings live on the execution host; a fingerprint check keeps folder switches cheap while
    // still invalidating a fresh cache when .vscode/settings.json changed.
    const settingsFingerprint = await fingerprintPromise
    const cached = cache.get(args.rootKey)
    if (
      !args.force &&
      settingsFingerprint &&
      cached &&
      folderReposAreFresh(cached) &&
      cached.result.settingsFingerprint === settingsFingerprint
    ) {
      return cached.result
    }
    const result = await scanFolderNestedRepos(
      args.target,
      args.folderWorktree,
      args.options,
      args.scanId
    )
    // A forced scan may finish before the stale one it superseded; only the latest request writes.
    // A stopped scan is a partial list, so it must not replace a complete cached result.
    if (latestRequestByRoot.get(args.rootKey) === sequence && !result.stopped) {
      remember(args.rootKey, result)
    }
    return result
  })().finally(() => {
    if (inFlight.get(args.rootKey)?.promise === request) {
      inFlight.delete(args.rootKey)
    }
  })
  const entry = { promise: request, fingerprint: fingerprintPromise, scanId: args.scanId ?? null }
  inFlight.set(args.rootKey, entry)
  return { result: await request, scanId: entry.scanId }
}
