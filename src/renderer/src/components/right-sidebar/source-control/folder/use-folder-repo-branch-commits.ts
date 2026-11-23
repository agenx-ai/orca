import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { GitHistoryItemRef } from '../../../../../../shared/git/history/git-history-types'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import { getRuntimeGitHistory } from '@/runtime/source-control/git/runtime-git-status-client'
import { useAppStore } from '@/store/index'
import {
  FOLDER_BRANCH_COMMIT_LIMIT,
  type FolderBranchCommitsState
} from './folder-repo-branch-data'
import {
  clearFolderBranchCommits,
  readFolderBranchCache,
  writeFolderBranchCommits
} from './folder-branch-cache'

export function branchErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Per-branch commit pages for one nested repo, cached across repo switches until HEAD or a refresh moves. */
export function useFolderRepoBranchCommits(args: {
  worktreeId: string | null
  context: RuntimeGitContext | null
}): {
  commits: Record<string, FolderBranchCommitsState>
  loadCommits: (branch: GitHistoryItemRef) => void
  loadMore: (branch: GitHistoryItemRef) => void
  settleInFlight: () => void
  clearCommits: () => void
} {
  const { worktreeId, context } = args
  const [commits, setCommits] = useState<Record<string, FolderBranchCommitsState>>(() => {
    if (!worktreeId) {
      return {}
    }
    const cached = readFolderBranchCache(worktreeId)
    if (!cached) {
      return {}
    }
    const head = useAppStore.getState().gitStatusHeadByWorktree[worktreeId] ?? null
    if (cached.headOid !== null && head !== null && cached.headOid !== head) {
      // A checkout happened while this repo's panel was unmounted; its pages are stale.
      clearFolderBranchCommits(worktreeId)
      return {}
    }
    return cached.commits
  })
  const generation = useRef(0)

  useEffect(() => {
    if (worktreeId) {
      writeFolderBranchCommits(
        worktreeId,
        commits,
        useAppStore.getState().gitStatusHeadByWorktree[worktreeId] ?? null
      )
    }
  }, [commits, worktreeId])

  /** A new branch generation cancels in-flight reads; settled pages stay but drop their load-more flag. */
  const settleInFlight = useCallback((): void => {
    generation.current += 1
    setCommits((prev) => {
      const next: Record<string, FolderBranchCommitsState> = {}
      let changed = false
      for (const [branchId, entry] of Object.entries(prev)) {
        if (entry.status === 'loading') {
          changed = true
          continue
        }
        next[branchId] =
          entry.status === 'ready' && entry.loadingMore
            ? { status: 'ready', result: entry.result }
            : entry
        changed ||= entry.status === 'ready' && entry.loadingMore === true
      }
      return changed ? next : prev
    })
  }, [])

  const clearCommits = useCallback((): void => {
    generation.current += 1
    if (worktreeId) {
      clearFolderBranchCommits(worktreeId)
    }
    setCommits({})
  }, [worktreeId])

  const loadCommits = useCallback(
    (branch: GitHistoryItemRef): void => {
      if (!context || commits[branch.id]) {
        return
      }
      const request = generation.current
      setCommits((prev) => ({ ...prev, [branch.id]: { status: 'loading' } }))
      void getRuntimeGitHistory(context, {
        refs: [branch.id],
        limit: FOLDER_BRANCH_COMMIT_LIMIT
      })
        .then((result) => {
          if (generation.current !== request) {
            return
          }
          setCommits((prev) => ({ ...prev, [branch.id]: { status: 'ready', result } }))
        })
        .catch((error: unknown) => {
          if (generation.current !== request) {
            return
          }
          setCommits((prev) => ({
            ...prev,
            [branch.id]: {
              status: 'error',
              error: branchErrorMessage(error, 'Failed to load commits')
            }
          }))
        })
    },
    [commits, context]
  )

  const loadMore = useCallback(
    (branch: GitHistoryItemRef): void => {
      const current = commits[branch.id]
      if (
        !context ||
        !current ||
        current.status !== 'ready' ||
        !current.result.hasMore ||
        current.loadingMore
      ) {
        return
      }
      const request = generation.current
      setCommits((prev) => ({
        ...prev,
        [branch.id]: { status: 'ready', result: current.result, loadingMore: true }
      }))
      void getRuntimeGitHistory(context, {
        refs: [branch.id],
        limit: FOLDER_BRANCH_COMMIT_LIMIT,
        skip: current.result.items.length,
        ...(current.result.historyToken ? { historyToken: current.result.historyToken } : {})
      })
        .then((result) => {
          if (generation.current !== request) {
            return
          }
          setCommits((prev) => {
            const latest = prev[branch.id]
            if (!latest || latest.status !== 'ready') {
              return prev
            }
            // The host restarted the walk; replace the stale pages instead of merging across histories.
            if (result.historyChanged) {
              return { ...prev, [branch.id]: { status: 'ready', result } }
            }
            const seen = new Set(latest.result.items.map((item) => item.id))
            const items = [
              ...latest.result.items,
              ...result.items.filter((item) => !seen.has(item.id))
            ]
            return { ...prev, [branch.id]: { status: 'ready', result: { ...result, items } } }
          })
        })
        .catch((error: unknown) => {
          if (generation.current !== request) {
            return
          }
          setCommits((prev) => {
            const latest = prev[branch.id]
            if (!latest || latest.status !== 'ready') {
              return prev
            }
            return { ...prev, [branch.id]: { status: 'ready', result: latest.result } }
          })
          toast.error(branchErrorMessage(error, 'Failed to load commits'))
        })
    },
    [commits, context]
  )

  return { commits, loadCommits, loadMore, settleInFlight, clearCommits }
}
