import type {
  GitHistoryItemRef,
  GitHistoryResult
} from '../../../../../../shared/git/history/git-history-types'
import type { RuntimeGitLocalBranches } from '../../../../../../shared/worktree/catalog/runtime-worktree-contracts'

export const FOLDER_BRANCH_COMMIT_LIMIT = 50

export type FolderRepoBranchData = {
  local: GitHistoryItemRef[]
  remote: GitHistoryItemRef[]
  currentId: string | null
  /** Upstream of the current branch, e.g. origin/release; null when none is configured. */
  upstreamName: string | null
}

export type FolderRepoBranchesState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: FolderRepoBranchData }
  | { status: 'error'; error: string }

export type FolderBranchCommitsState =
  | { status: 'loading' }
  | { status: 'ready'; result: GitHistoryResult; loadingMore?: boolean }
  | { status: 'error'; error: string }

/** Current branch first, then most recent commit, so the list reads like the branch picker. */
export function buildFolderRepoBranchData(
  remoteRefs: readonly GitHistoryItemRef[],
  localBranches: RuntimeGitLocalBranches,
  upstreamName: string | null
): FolderRepoBranchData {
  const currentId = localBranches.current ? `refs/heads/${localBranches.current}` : null
  const committedAt = localBranches.committedAt ?? {}
  const worktreePaths = localBranches.worktreePaths ?? {}
  const upstreams = localBranches.upstreams ?? {}
  const local = localBranches.branches
    .map((name): GitHistoryItemRef => {
      const upstream = Object.hasOwn(upstreams, name) ? upstreams[name] : undefined
      return {
        id: `refs/heads/${name}`,
        name,
        category: 'branches',
        ...(worktreePaths[name] ? { worktreePath: worktreePaths[name] } : {}),
        ...(upstream
          ? {
              upstream: {
                name: upstream.name,
                ahead: upstream.ahead,
                behind: upstream.behind,
                ...(upstream.gone ? { gone: true } : {})
              }
            }
          : {})
      }
    })
    .sort((left, right) => {
      if (left.id === currentId) {
        return -1
      }
      if (right.id === currentId) {
        return 1
      }
      return (
        (committedAt[right.name] ?? 0) - (committedAt[left.name] ?? 0) ||
        left.name.localeCompare(right.name)
      )
    })
  const remote = remoteRefs
    .filter((ref) => ref.category === 'remote branches' && ref.id.startsWith('refs/remotes/'))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { local, remote, currentId, upstreamName }
}
