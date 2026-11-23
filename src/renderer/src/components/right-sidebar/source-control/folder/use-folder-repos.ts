import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { FolderNestedRepoScanResult } from '../../../../../../shared/folder-workspaces/folder-nested-git'
import { getFolderReposSettings } from '@/runtime/source-control/folder-repos/folder-repos-client'
import { useSourceControlWatchConsumer } from '@/components/editor/external-changes/watching/source-control-watch-consumers'
import { loadFolderRepos, peekFolderRepos, updateFolderRepoBranch } from './folder-repos-cache'
import { useFolderReposScanProgress } from './use-folder-repos-scan-progress'
import { useFolderReposWatch } from './use-folder-repos-watch'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'

const selectedPathByRoot = new Map<string, string>()
const SETTINGS_RECHECK_MS = 5_000
// Roots whose cached scan went stale while hidden or unmounted; the next scan must bypass freshness.
const staleFolderReposRoots = new Set<string>()

export function readFolderRepoSelection(rootKey: string | null): string | null {
  return rootKey ? (selectedPathByRoot.get(rootKey) ?? null) : null
}

export function rememberFolderRepoSelection(rootKey: string, relativePath: string): void {
  selectedPathByRoot.set(rootKey, relativePath)
}

export function useFolderReposScan(args: {
  enabled: boolean
  rootKey: string | null
  folderWorktree: string | null
  folderPath: string | null
  connectionId?: string | null
  target: RuntimeClientTarget | null
}): {
  result: FolderNestedRepoScanResult | null
  /** True once the shown result's settings fingerprint came back from the runtime. */
  settingsVerified: boolean
  loading: boolean
  /** True while a scan request is in flight, including background rescans with a cached result. */
  scanning: boolean
  scanProgress: number | null
  stopped: boolean
  error: string | null
  rescan: () => void
  cancelScan: () => void
  updateRepoBranch: (relativePath: string, branch: string | null) => void
} {
  const { enabled, rootKey, folderWorktree, folderPath, connectionId, target } = args
  const runtimeEnvironmentId = target?.kind === 'environment' ? target.environmentId : null
  const scanControl = useFolderReposScanProgress({ target, folderWorktree })
  const { begin: beginScan, end: endScan } = scanControl
  const [result, setResult] = useState<FolderNestedRepoScanResult | null>(() =>
    rootKey ? (peekFolderRepos(rootKey)?.result ?? null) : null
  )
  const [resultRootKey, setResultRootKey] = useState<string | null>(rootKey)
  const [settingsVerified, setSettingsVerified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestToken = useRef(0)
  const runningToken = useRef<number | null>(null)
  // A root change seen mid-scan reruns once the current one settles.
  const watchRescanPending = useRef(false)
  const watchMissedWhileHidden = useRef(false)
  // Last settings fingerprint seen or used, so a failed scan can still notice later edits.
  const settingsBaseline = useRef<string | null>(null)
  const runRef = useRef<((force: boolean) => Promise<void>) | null>(null)
  // Lets the watch handler decide which deletes removed a checkout without rescanning for file churn.
  const knownRepoPaths = useRef<readonly string[]>([])
  if (resultRootKey === rootKey) {
    knownRepoPaths.current = result?.repos.map((repo) => repo.relativePath) ?? []
  }

  // Watch the folder root so a new or removed checkout appears without Rescan.
  useSourceControlWatchConsumer(
    `folder-repos-scan:${rootKey ?? folderWorktree ?? ''}`,
    enabled && folderWorktree && folderPath
      ? {
          worktreeId: folderWorktree,
          worktreePath: folderPath,
          connectionId: connectionId ?? undefined,
          runtimeEnvironmentId
        }
      : null
  )

  const applyResult = useCallback((key: string, next: FolderNestedRepoScanResult): void => {
    setResult(next)
    setResultRootKey(key)
  }, [])

  const run = useCallback(
    async (force: boolean): Promise<void> => {
      if (!enabled || !rootKey || !folderWorktree || !target) {
        return
      }
      const token = ++requestToken.current
      runningToken.current = token
      setSettingsVerified(false)
      const cached = peekFolderRepos(rootKey)
      if (cached) {
        applyResult(rootKey, cached.result)
      }
      setLoading(cached === undefined)
      setScanning(true)
      setStopped(false)
      setError(null)
      let activeScanId = beginScan()
      try {
        // Always verify the cached entry's settings fingerprint, even while it is fresh.
        const loaded = await loadFolderRepos({
          rootKey,
          target,
          folderWorktree,
          force,
          ...(activeScanId ? { scanId: activeScanId } : {}),
          // Adopt a joined scan immediately, so Stop and progress track the scan actually running.
          onScanId: (scanId) => {
            if (token === requestToken.current && scanId !== activeScanId) {
              activeScanId = beginScan(scanId)
            }
          }
        })
        if (loaded.scanId && loaded.scanId !== activeScanId) {
          // A reused in-flight scan registered its own id; track that one for progress and Stop.
          activeScanId = beginScan(loaded.scanId)
        }
        const next = loaded.result
        if (token === requestToken.current) {
          // A stopped scan returns a partial list; keep the previous complete list on screen.
          if (!(next.stopped && cached)) {
            applyResult(rootKey, next)
          }
          setStopped(next.stopped)
          settingsBaseline.current = next.settingsFingerprint
          setSettingsVerified(true)
          if (force) {
            staleFolderReposRoots.delete(rootKey)
          }
        }
      } catch (scanError) {
        if (token === requestToken.current) {
          setError(scanError instanceof Error ? scanError.message : 'Repository scan failed')
        }
      } finally {
        endScan(activeScanId)
        if (token === requestToken.current) {
          runningToken.current = null
          setLoading(false)
          setScanning(false)
          if (watchRescanPending.current) {
            watchRescanPending.current = false
            if (document.visibilityState !== 'visible') {
              watchMissedWhileHidden.current = true
            } else {
              // The marker change invalidates the cached scan, so bypass its freshness window.
              queueMicrotask(() => void runRef.current?.(true))
            }
          }
        }
      }
    },
    [applyResult, beginScan, enabled, endScan, folderWorktree, rootKey, target]
  )
  runRef.current = run

  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- Why: resets presentation state when the folder root changes and seeds it from the shared cache.
  useEffect(() => {
    setSettingsVerified(false)
    const cached = rootKey ? peekFolderRepos(rootKey) : undefined
    settingsBaseline.current = cached?.result.settingsFingerprint ?? null
    if (cached) {
      applyResult(rootKey!, cached.result)
    } else {
      setResult(null)
      setResultRootKey(rootKey)
    }
    setError(null)
    setLoading(false)
    if (!enabled || !rootKey || !folderWorktree || !target) {
      return
    }
    // A fresh cache renders immediately; the settings fingerprint still decides whether to rescan.
    void run(staleFolderReposRoots.has(rootKey))
  }, [applyResult, enabled, folderWorktree, rootKey, target, run])

  const rescan = useCallback((): void => {
    void run(true)
  }, [run])

  const updateRepoBranch = useCallback(
    (relativePath: string, branch: string | null): void => {
      if (!rootKey || resultRootKey !== rootKey) {
        return
      }
      updateFolderRepoBranch(rootKey, relativePath, branch)
      setResult((prev) =>
        prev
          ? {
              ...prev,
              repos: prev.repos.map((repo) =>
                repo.relativePath === relativePath ? { ...repo, branch } : repo
              )
            }
          : prev
      )
    },
    [resultRootKey, rootKey]
  )

  useEffect(() => {
    if (!enabled || !rootKey || !folderWorktree || !target) {
      return
    }
    let closed = false
    let checking = false
    // Revalidate settings while the panel is open; a changed fingerprint rescans without Rescan.
    const check = (): void => {
      if (checking || runningToken.current !== null || document.visibilityState !== 'visible') {
        return
      }
      checking = true
      void getFolderReposSettings(target, folderWorktree)
        .then((settings) => {
          if (closed || settingsBaseline.current === settings.fingerprint) {
            return
          }
          settingsBaseline.current = settings.fingerprint
          // Also retries once after an initial scan failure, which leaves no baseline.
          void run(false)
        })
        .catch(() => undefined)
        .finally(() => {
          checking = false
        })
    }
    const stop = installWindowVisibilityInterval({ run: check, intervalMs: SETTINGS_RECHECK_MS })
    return () => {
      closed = true
      stop()
    }
  }, [enabled, folderWorktree, rootKey, run, target])

  useFolderReposWatch({
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
    staleRoots: staleFolderReposRoots
  })

  return {
    result: resultRootKey === rootKey ? result : null,
    settingsVerified,
    loading,
    scanning,
    scanProgress: scanControl.progress,
    stopped,
    error,
    rescan,
    cancelScan: scanControl.cancel,
    updateRepoBranch
  }
}
