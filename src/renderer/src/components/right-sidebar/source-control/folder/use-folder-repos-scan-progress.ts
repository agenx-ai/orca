import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { createNonSecureContextUuid } from '../../../../../../shared/identifiers/non-secure-context-uuid'
import {
  cancelFolderReposScan,
  getFolderReposScanProgress
} from '@/runtime/source-control/folder-repos/folder-repos-client'

const PROGRESS_POLL_MS = 400
// The scan RPC reads settings before registering, so a Stop click can arrive first.
const CANCEL_RETRY_MS = 200
const CANCEL_RETRY_WINDOW_MS = 30_000

export type FolderReposScanProgress = {
  progress: number | null
  begin: (scanId?: string) => string | null
  end: (scanId: string | null) => void
  cancel: () => void
}

/** Tracks the repositories found by the active folder scan so the panel can show progress and stop it. */
export function useFolderReposScanProgress(args: {
  target: RuntimeClientTarget | null
  folderWorktree: string | null
}): FolderReposScanProgress {
  const { target, folderWorktree } = args
  const [progress, setProgress] = useState<number | null>(null)
  const activeScanId = useRef<string | null>(null)
  const generation = useRef(0)
  const timer = useRef<number | null>(null)

  const stopPolling = useCallback((): void => {
    generation.current++
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    activeScanId.current = null
    setProgress(null)
  }, [])

  const begin = useCallback(
    (requestedScanId?: string): string | null => {
      if (!target || !folderWorktree) {
        return null
      }
      stopPolling()
      const scanId = requestedScanId ?? createNonSecureContextUuid()
      activeScanId.current = scanId
      const pollGeneration = generation.current
      setProgress(0)
      const poll = (): void => {
        void getFolderReposScanProgress(target, folderWorktree, scanId)
          .then((state) => {
            if (generation.current !== pollGeneration || !activeScanId.current) {
              return
            }
            if (state.active) {
              setProgress(state.reposFound)
            }
            timer.current = window.setTimeout(poll, PROGRESS_POLL_MS)
          })
          .catch(() => {
            if (generation.current === pollGeneration && activeScanId.current) {
              timer.current = window.setTimeout(poll, PROGRESS_POLL_MS)
            }
          })
      }
      poll()
      return scanId
    },
    [folderWorktree, stopPolling, target]
  )

  const end = useCallback(
    (scanId: string | null): void => {
      if (scanId !== null && activeScanId.current === scanId) {
        stopPolling()
      }
    },
    [stopPolling]
  )

  const cancel = useCallback((): void => {
    if (!target || !folderWorktree) {
      return
    }
    const deadline = Date.now() + CANCEL_RETRY_WINDOW_MS
    const attempt = (): void => {
      // Read the live id: a reused in-flight scan adopts its id after the click.
      const scanId = activeScanId.current
      if (!scanId) {
        return
      }
      const retry = (): void => {
        if (activeScanId.current && Date.now() < deadline) {
          window.setTimeout(attempt, CANCEL_RETRY_MS)
        }
      }
      void cancelFolderReposScan(target, folderWorktree, scanId)
        .then((result) => {
          if (!result.cancelled) {
            retry()
          }
        })
        .catch(retry)
    }
    attempt()
  }, [folderWorktree, target])

  useEffect(() => stopPolling, [stopPolling])

  return { progress, begin, end, cancel }
}
