import { useEffect } from 'react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { normalizeRuntimePathForComparison } from '../../../../../../shared/file-access/cross-platform-path'
import {
  ORCA_WORKTREE_FILE_CHANGE_EVENT,
  type WorktreeFileChangeEventDetail
} from '@/runtime/files/watching/worktree-file-change-event'
import { payloadChangesRepoLayout, payloadCreatesGitMarker } from './folder-repos-watch-filter'

const WATCH_RESCAN_DEBOUNCE_MS = 500
// A slow `git init` can still be writing after the first rescan, so look once more.
const WATCH_MARKER_FOLLOW_UP_MS = 1_500

/** Watches the folder root so a new or removed checkout appears without Rescan. */
export function useFolderReposWatch(args: {
  enabled: boolean
  rootKey: string | null
  folderWorktree: string | null
  folderPath: string | null
  connectionId?: string | null
  target: RuntimeClientTarget | null
  runtimeEnvironmentId: string | null
  knownRepoPaths: { current: readonly string[] }
  runningToken: { current: number | null }
  watchRescanPending: { current: boolean }
  watchMissedWhileHidden: { current: boolean }
  runRef: { current: ((force: boolean) => Promise<void>) | null }
  staleRoots: Set<string>
}): void {
  const {
    enabled,
    rootKey,
    folderWorktree,
    folderPath,
    connectionId,
    target,
    runtimeEnvironmentId,
    knownRepoPaths,
    runningToken,
    watchRescanPending,
    watchMissedWhileHidden,
    runRef,
    staleRoots
  } = args

  useEffect(() => {
    if (!enabled || !rootKey || !folderPath || !folderWorktree || !target) {
      return
    }
    let timer: number | null = null
    let followUpTimer: number | null = null
    const schedule = (): void => {
      if (document.visibilityState !== 'visible') {
        watchMissedWhileHidden.current = true
        return
      }
      if (timer !== null) {
        return
      }
      timer = window.setTimeout(() => {
        timer = null
        if (document.visibilityState !== 'visible') {
          watchMissedWhileHidden.current = true
          return
        }
        if (runningToken.current !== null) {
          watchRescanPending.current = true
          return
        }
        void runRef.current?.(true)
      }, WATCH_RESCAN_DEBOUNCE_MS)
    }
    const scheduleMarkerFollowUp = (): void => {
      if (followUpTimer !== null) {
        return
      }
      followUpTimer = window.setTimeout(() => {
        followUpTimer = null
        if (document.visibilityState !== 'visible') {
          watchMissedWhileHidden.current = true
          return
        }
        if (runningToken.current !== null) {
          watchRescanPending.current = true
          return
        }
        void runRef.current?.(true)
      }, WATCH_MARKER_FOLLOW_UP_MS)
    }
    const handleFsChanged = (event: Event): void => {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the source-control watch only dispatches events of this detail shape.
      const detail = (event as CustomEvent<WorktreeFileChangeEventDetail>).detail
      if (!detail || (detail.runtimeEnvironmentId ?? null) !== runtimeEnvironmentId) {
        return
      }
      const payload = detail.payload
      if (
        normalizeRuntimePathForComparison(payload.worktreePath) !==
          normalizeRuntimePathForComparison(folderPath) ||
        (payload.connectionId ?? null) !== (connectionId ?? null)
      ) {
        return
      }
      // The watch prunes `.git`, so an unclassifiable delete during a scan may hide a removed checkout.
      if (
        runningToken.current !== null &&
        payload.events.some((event) => event.kind === 'delete')
      ) {
        watchRescanPending.current = true
      }
      if (payloadChangesRepoLayout(payload, folderPath, knownRepoPaths.current)) {
        staleRoots.add(rootKey)
        schedule()
      }
      if (payloadCreatesGitMarker(payload, folderPath)) {
        staleRoots.add(rootKey)
        scheduleMarkerFollowUp()
      }
    }
    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible' && watchMissedWhileHidden.current) {
        watchMissedWhileHidden.current = false
        schedule()
      }
    }
    window.addEventListener(ORCA_WORKTREE_FILE_CHANGE_EVENT, handleFsChanged)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      if (followUpTimer !== null) {
        window.clearTimeout(followUpTimer)
      }
      window.removeEventListener(ORCA_WORKTREE_FILE_CHANGE_EVENT, handleFsChanged)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [
    connectionId,
    enabled,
    folderPath,
    folderWorktree,
    knownRepoPaths,
    rootKey,
    runRef,
    runningToken,
    runtimeEnvironmentId,
    staleRoots,
    target,
    watchMissedWhileHidden,
    watchRescanPending
  ])
}
