import { useEffect, useRef } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { fetchRuntimeGit } from '@/runtime/source-control/git/runtime-git-sync-client'
import {
  fetchRuntimeGitRemote,
  listRuntimeGitRemotes
} from '@/runtime/source-control/git/runtime-git-remote-client'
import type { FolderNestedRepoScopeEntry } from './folder-nested-repo-scope'

/**
 * Background fetch for scanned folder repos on the git.autofetchPeriod cadence.
 * The first fetch waits a full period, matching VS Code's autofetch timer.
 */
export function useFolderRepoAutofetch(
  entries: readonly FolderNestedRepoScopeEntry[],
  autofetch: boolean | 'all',
  autofetchPeriod: number
): void {
  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  })

  useEffect(() => {
    if (autofetch === false || entries.length === 0) {
      return
    }
    let cancelled = false
    let running = false
    const tick = (): void => {
      if (running) {
        return
      }
      running = true
      void (async () => {
        try {
          for (const entry of entriesRef.current) {
            if (cancelled) {
              return
            }
            const { scope } = entry
            const gitCopy = scope.gitCopy
            if (!gitCopy) {
              continue
            }
            const context = {
              target: gitCopy.transport,
              worktreeId: scope.worktreeId,
              worktreePath: scope.worktree.path,
              ...(scope.repo.connectionId ? { connectionId: scope.repo.connectionId } : {})
            }
            if (autofetch === 'all') {
              let remotes: Awaited<ReturnType<typeof listRuntimeGitRemotes>>
              try {
                remotes = await listRuntimeGitRemotes(context)
              } catch {
                continue
              }
              for (const remote of remotes) {
                if (cancelled) {
                  return
                }
                try {
                  await fetchRuntimeGitRemote(context, remote.name)
                } catch {
                  // One unreachable remote must not skip the remaining remotes or repos.
                }
              }
            } else {
              try {
                await fetchRuntimeGit(context)
              } catch {
                // Offline or no upstream: keep the previous refs and retry next period.
              }
            }
          }
        } finally {
          running = false
        }
      })()
    }
    const stop = installWindowVisibilityInterval({
      run: tick,
      // Autofetch measures from mount, not from whenever the window becomes visible.
      runOnVisible: () => {},
      intervalMs: autofetchPeriod * 1000,
      slowWhileUnfocused: true
    })
    return () => {
      cancelled = true
      stop()
    }
    // entries is current through entriesRef; only its emptiness restarts the timer.
  }, [autofetch, autofetchPeriod, entries.length])
}
