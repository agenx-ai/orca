import type { FolderBranchCommitsState } from './folder-repo-branch-data'

const MAX_CACHED_WORKTREES = 8

type FolderBranchCacheEntry = {
  commits: Record<string, FolderBranchCommitsState>
  expanded: Set<string>
  /** HEAD the cached pages were loaded at, so a checkout made while away invalidates them. */
  headOid: string | null
  /** Current branch already auto-expanded once; a user fold must survive remounts. */
  expandedCurrent: string | null
}

const cache = new Map<string, FolderBranchCacheEntry>()

function ensureEntry(worktreeId: string): FolderBranchCacheEntry {
  const existing = cache.get(worktreeId)
  if (existing) {
    return existing
  }
  const entry: FolderBranchCacheEntry = {
    commits: {},
    expanded: new Set(),
    headOid: null,
    expandedCurrent: null
  }
  cache.set(worktreeId, entry)
  const oldest = cache.keys().next().value
  if (cache.size > MAX_CACHED_WORKTREES && oldest !== undefined) {
    cache.delete(oldest)
  }
  return entry
}

/** Keeps the repo the user just visited last in line for eviction. */
export function readFolderBranchCache(worktreeId: string): FolderBranchCacheEntry | null {
  const entry = cache.get(worktreeId)
  if (!entry) {
    return null
  }
  cache.delete(worktreeId)
  cache.set(worktreeId, entry)
  return entry
}

/** Only settled pages are worth restoring; loading and error states refetch on mount. */
export function writeFolderBranchCommits(
  worktreeId: string,
  commits: Record<string, FolderBranchCommitsState>,
  headOid: string | null
): void {
  const entry = ensureEntry(worktreeId)
  entry.commits = Object.fromEntries(
    Object.entries(commits).flatMap(([branchId, state]) =>
      state.status === 'ready' ? [[branchId, { status: 'ready', result: state.result }]] : []
    )
  )
  entry.headOid = headOid
}

export function writeFolderBranchExpanded(worktreeId: string, expanded: ReadonlySet<string>): void {
  ensureEntry(worktreeId).expanded = new Set(expanded)
}

export function writeFolderBranchExpandedCurrent(worktreeId: string, branchId: string): void {
  ensureEntry(worktreeId).expandedCurrent = branchId
}

export function clearFolderBranchCommits(worktreeId: string): void {
  ensureEntry(worktreeId).commits = {}
}
