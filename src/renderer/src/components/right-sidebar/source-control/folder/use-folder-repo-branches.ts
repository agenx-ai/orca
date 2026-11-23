import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { GitHistoryItemRef } from '../../../../../../shared/git/history/git-history-types'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import { getRuntimeGitRefs } from '@/runtime/source-control/git/runtime-git-status-client'
import { getRuntimeGitBranchCompare } from '@/runtime/source-control/git/runtime-git-diff-client'
import { getRuntimeGitUpstreamStatus } from '@/runtime/source-control/git/runtime-git-sync-client'
import {
  listRuntimeGitBranches,
  switchRuntimeGitBranch
} from '@/runtime/source-control/git/runtime-git-branch-client'
import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import type { SourceControlScope } from '../panel/worktree-scope'
import {
  buildFolderRepoBranchData,
  type FolderBranchCommitsState,
  type FolderRepoBranchesState
} from './folder-repo-branch-data'
import { branchErrorMessage, useFolderRepoBranchCommits } from './use-folder-repo-branch-commits'

/** Branch list and per-branch commits for the selected nested repo; nested selectors only reach Git through RPC. */
export function useFolderRepoBranches(args: {
  owner: SourceControlScope | null
  target: RuntimeClientTarget | null
}): {
  state: FolderRepoBranchesState
  commits: Record<string, FolderBranchCommitsState>
  loadCommits: (branch: GitHistoryItemRef) => void
  loadMore: (branch: GitHistoryItemRef) => void
  refresh: () => void
  checkout: (branch: GitHistoryItemRef) => Promise<void>
  checkoutBranchId: string | null
  compare: (branch: GitHistoryItemRef, baseRef: string) => Promise<void>
  compareRefs: (baseRef: string, headRef: string) => Promise<void>
  comparingBranchId: string | null
  comparingRefs: boolean
} {
  const worktreeId = args.owner?.worktreeId ?? null
  const worktreePath = args.owner?.worktree.path ?? null
  const routeTarget = args.owner?.gitCopy?.transport ?? args.target
  const connectionId = args.owner?.repo.connectionId ?? undefined
  const context = useMemo<RuntimeGitContext | null>(
    () =>
      routeTarget && worktreeId && worktreePath
        ? {
            target: routeTarget,
            worktreeId,
            worktreePath,
            ...(connectionId === undefined ? {} : { connectionId })
          }
        : null,
    [connectionId, routeTarget, worktreeId, worktreePath]
  )
  const [state, setState] = useState<FolderRepoBranchesState>({ status: 'idle' })
  const { commits, loadCommits, loadMore, settleInFlight, clearCommits } =
    useFolderRepoBranchCommits({ worktreeId, context })
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [checkoutBranchId, setCheckoutBranchId] = useState<string | null>(null)
  const [comparingBranchId, setComparingBranchId] = useState<string | null>(null)
  const [comparingRefs, setComparingRefs] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    const request = ++generation.current
    settleInFlight()
    if (!context) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    void Promise.all([
      getRuntimeGitRefs(context, 'refs/remotes/origin/'),
      listRuntimeGitBranches(context),
      getRuntimeGitUpstreamStatus(context).catch(() => null)
    ])
      .then(([refs, localBranches, upstream]) => {
        if (generation.current !== request) {
          return
        }
        setState({
          status: 'ready',
          data: buildFolderRepoBranchData(
            refs,
            localBranches,
            upstream?.hasUpstream ? upstream.upstreamName?.trim() || null : null
          )
        })
      })
      .catch((error: unknown) => {
        if (generation.current !== request) {
          return
        }
        setState({
          status: 'error',
          error: branchErrorMessage(error, 'Failed to load branches')
        })
      })
  }, [context, refreshRevision, settleInFlight])

  const refresh = useCallback((): void => {
    clearCommits()
    setRefreshRevision((revision) => revision + 1)
  }, [clearCommits])

  const checkout = useCallback(
    async (branch: GitHistoryItemRef): Promise<void> => {
      if (!context) {
        return
      }
      setCheckoutBranchId(branch.id)
      try {
        const result = await switchRuntimeGitBranch(context, {
          kind: 'local',
          name: branch.name
        })
        if (result.warning) {
          toast.warning(result.warning, { duration: 15000 })
        } else {
          toast.success(
            translate(
              'auto.components.right.sidebar.FolderRepoScm.checkedOutBranch',
              'Checked out {{branch}}',
              { branch: result.branch }
            )
          )
        }
        refresh()
      } catch (error) {
        toast.error(branchErrorMessage(error, 'Failed to check out branch'))
      } finally {
        setCheckoutBranchId(null)
      }
    },
    [context, refresh]
  )

  const openCompare = useCallback(
    async (baseRef: string, headRef: string): Promise<void> => {
      if (!context || !worktreeId || !worktreePath) {
        return
      }
      const owner = args.owner
      const result = await getRuntimeGitBranchCompare(context, baseRef, 'interactive', headRef)
      if (result.summary.status !== 'ready') {
        throw new Error(result.summary.errorMessage ?? 'Could not compare branches')
      }
      // Open from this result's own entries; the shared Changes compare state keeps its own base.
      useAppStore.getState().openBranchAllDiffs(
        worktreeId,
        worktreePath,
        result.summary,
        undefined,
        {
          placementWorkspaceId: owner?.placementWorkspaceId,
          executionHostId: owner?.executionHostId,
          runtimeEnvironmentId: owner?.worktree.runtimeOwnerEnvironmentId
        },
        result.entries
      )
    },
    [args.owner, context, worktreeId, worktreePath]
  )

  const compare = useCallback(
    async (branch: GitHistoryItemRef, baseRef: string): Promise<void> => {
      setComparingBranchId(branch.id)
      try {
        await openCompare(baseRef, branch.id)
      } catch (error) {
        toast.error(branchErrorMessage(error, 'Failed to compare branches'))
      } finally {
        setComparingBranchId(null)
      }
    },
    [openCompare]
  )

  const compareRefs = useCallback(
    async (baseRef: string, headRef: string): Promise<void> => {
      setComparingRefs(true)
      try {
        await openCompare(baseRef, headRef)
      } catch (error) {
        toast.error(branchErrorMessage(error, 'Failed to compare branches'))
      } finally {
        setComparingRefs(false)
      }
    },
    [openCompare]
  )

  return {
    state,
    commits,
    loadCommits,
    loadMore,
    refresh,
    checkout,
    checkoutBranchId,
    compare,
    compareRefs,
    comparingBranchId,
    comparingRefs
  }
}
