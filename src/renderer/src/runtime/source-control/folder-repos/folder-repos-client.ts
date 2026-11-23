import type { RuntimeClientTarget } from '../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type {
  FolderNestedRepoScanOptions,
  FolderNestedRepoScanResult,
  FolderReposScanProgressResult,
  FolderReposSettingsResult
} from '../../../../../shared/folder-workspaces/folder-nested-git'
import { callRuntimeRpc } from '../../rpc/calls/runtime-rpc-call'

const DEFAULT_SCAN_TIMEOUT_MS = 15_000
const SCAN_PROGRESS_TIMEOUT_MS = 2_000
const SCAN_CANCEL_TIMEOUT_MS = 2_000

export function getFolderReposSettings(
  target: RuntimeClientTarget,
  folderWorktree: string
): Promise<FolderReposSettingsResult> {
  return callRuntimeRpc<FolderReposSettingsResult>(
    target,
    'folderRepos.settings',
    { folderWorktree },
    { timeoutMs: 5_000 }
  )
}

export function scanFolderNestedRepos(
  target: RuntimeClientTarget,
  folderWorktree: string,
  options: FolderNestedRepoScanOptions = {},
  scanId?: string
): Promise<FolderNestedRepoScanResult> {
  return callRuntimeRpc<FolderNestedRepoScanResult>(
    target,
    'folderRepos.scan',
    {
      folderWorktree,
      ...(scanId ? { scanId } : {}),
      options: {
        timeoutMs: options.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS,
        ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
        ...(options.maxRepos === undefined ? {} : { maxRepos: options.maxRepos })
      }
    },
    { timeoutMs: DEFAULT_SCAN_TIMEOUT_MS + 5_000 }
  )
}

export function getFolderReposScanProgress(
  target: RuntimeClientTarget,
  folderWorktree: string,
  scanId: string
): Promise<FolderReposScanProgressResult> {
  return callRuntimeRpc<FolderReposScanProgressResult>(
    target,
    'folderRepos.scanProgress',
    { folderWorktree, scanId },
    { timeoutMs: SCAN_PROGRESS_TIMEOUT_MS }
  )
}

export function cancelFolderReposScan(
  target: RuntimeClientTarget,
  folderWorktree: string,
  scanId: string
): Promise<{ cancelled: boolean }> {
  return callRuntimeRpc<{ cancelled: boolean }>(
    target,
    'folderRepos.cancelScan',
    { folderWorktree, scanId },
    { timeoutMs: SCAN_CANCEL_TIMEOUT_MS }
  )
}
