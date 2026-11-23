import { useCallback, useEffect } from 'react'
import { useAppStore } from '@/store/index'
import {
  installWindowVisibilityInterval,
  isWindowVisible
} from '@/lib/window-activity/window-visibility-interval'
import { refreshGitStatusForWorktree } from '../sync/git-status-refresh'
import type { SourceControlScope } from '../panel/worktree-scope'

const STATUS_POLL_MS = 15_000

/**
 * Folder sections have no catalog worktree, so the ordinary observer cannot resolve their owner.
 * Poll only the selected nested repo, then let the existing Source Control tree read its status.
 */
export function useFolderNestedRepoStatus(
  owner: SourceControlScope | null,
  autorefresh = true
): (signal?: AbortSignal) => Promise<void> {
  const gitCopy = owner?.gitCopy
  const worktreeId = owner?.worktreeId
  const worktreePath = owner?.worktree.path
  const connectionId = owner?.repo.connectionId ?? undefined

  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!gitCopy || !worktreeId || !worktreePath) {
        return
      }
      await refreshGitStatusForWorktree({
        target: gitCopy.transport,
        ownerHostId: gitCopy.hostId,
        worktreeId,
        worktreePath,
        ...(connectionId ? { connectionId } : {}),
        deps: useAppStore.getState(),
        request: {
          admissionTier: 'status',
          ...(signal ? { signal } : {})
        }
      })
    },
    [connectionId, gitCopy, worktreeId, worktreePath]
  )

  useEffect(() => {
    if (!gitCopy || !worktreeId) {
      return
    }
    const controller = new AbortController()
    const refreshNow = (): void => {
      void refresh(controller.signal).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('[folder-source-control] status refresh failed', error)
        }
      })
    }
    // A hidden window still gets the post-selection read; only recurring polls wait for visibility.
    if (!autorefresh || !isWindowVisible()) {
      refreshNow()
    }
    const stop = autorefresh
      ? installWindowVisibilityInterval({ run: refreshNow, intervalMs: STATUS_POLL_MS })
      : null
    return () => {
      controller.abort()
      stop?.()
    }
  }, [autorefresh, gitCopy, refresh, worktreeId])

  return refresh
}
