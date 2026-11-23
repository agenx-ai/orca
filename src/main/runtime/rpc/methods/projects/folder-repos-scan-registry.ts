import type { FolderReposScanProgressResult } from '../../../../../shared/folder-workspaces/folder-nested-git'

type ActiveScan = {
  controller: AbortController
  reposFound: number
}

/** Progress is polled from another RPC, so running scans are addressed by folder+client id. */
const activeScans = new Map<string, ActiveScan>()

export type FolderRepoScanHandle = {
  signal: AbortSignal
  setReposFound: (count: number) => void
  finish: () => void
}

export function folderRepoScanKey(folderWorktree: string, scanId: string): string {
  return `${folderWorktree}\0${scanId}`
}

export function beginFolderRepoScan(key: string, clientSignal?: AbortSignal): FolderRepoScanHandle {
  const controller = new AbortController()
  const abortFromClient = (): void => controller.abort()
  if (clientSignal?.aborted) {
    controller.abort()
  } else {
    clientSignal?.addEventListener('abort', abortFromClient, { once: true })
  }
  const entry: ActiveScan = { controller, reposFound: 0 }
  activeScans.set(key, entry)
  return {
    signal: clientSignal ? AbortSignal.any([clientSignal, controller.signal]) : controller.signal,
    setReposFound: (count) => {
      if (activeScans.get(key) === entry) {
        entry.reposFound = count
      }
    },
    finish: () => {
      clientSignal?.removeEventListener('abort', abortFromClient)
      if (activeScans.get(key) === entry) {
        activeScans.delete(key)
      }
    }
  }
}

export function readFolderRepoScanProgress(key: string): FolderReposScanProgressResult {
  const entry = activeScans.get(key)
  return entry ? { active: true, reposFound: entry.reposFound } : { active: false, reposFound: 0 }
}

/** False when the scan already finished; the caller surfaces that to the user as a no-op. */
export function cancelFolderRepoScan(key: string): boolean {
  const entry = activeScans.get(key)
  if (!entry) {
    return false
  }
  entry.controller.abort()
  return true
}
