import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { SshConnectionStatus } from '../../../../../../shared/remote-runtime/ssh/ssh-types'
import type { FolderNestedRepo } from '../../../../../../shared/folder-workspaces/folder-nested-git'
import { FOLDER_REPO_EXCLUDE_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
import { excludeFolderNestedRepo } from '@/runtime/source-control/folder-repos/folder-repos-client'
import {
  fetchRuntimeGit,
  pullRuntimeGit,
  pushRuntimeGit
} from '@/runtime/source-control/git/runtime-git-sync-client'
import type { FolderNestedRepoScopeEntry } from './folder-nested-repo-scope'
import type { FolderRepoAction } from './folder-repository-tree'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'

/** SSH states where the host cannot answer repository actions. */
const UNREACHABLE_SSH_STATUSES: ReadonlySet<SshConnectionStatus> = new Set([
  'disconnected',
  'auth-failed',
  'error',
  'reconnection-failed'
])

/** True while the folder's host lost contact or refused this client. */
export function useFolderReposDisconnected(
  target: RuntimeClientTarget | null,
  connectionId: string | null
): boolean {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const runtimeDisconnected = useAppStore((state) => {
    const entry = environmentId ? state.runtimeStatusByEnvironmentId.get(environmentId) : null
    return (
      entry?.snapshot?.transport === 'disconnected' ||
      entry?.snapshot?.verification === 'blocked' ||
      entry?.snapshot?.retired === true
    )
  })
  const sshStatus = useAppStore((state) =>
    connectionId ? (state.sshConnectionStates.get(connectionId)?.status ?? null) : null
  )
  return runtimeDisconnected || (sshStatus !== null && UNREACHABLE_SSH_STATUSES.has(sshStatus))
}

export function useFolderRepoActions({
  target,
  folderSelector,
  connectionId,
  repoScopes,
  rescan,
  refreshStatus,
  onExcluded
}: {
  target: RuntimeClientTarget | null
  folderSelector: string
  connectionId: string | null
  repoScopes: readonly FolderNestedRepoScopeEntry[]
  rescan: () => void
  refreshStatus: () => Promise<void>
  onExcluded: (relativePath: string) => void
}): {
  busyRepo: string | null
  excludeSupported: boolean
  runRepoAction: (repo: FolderNestedRepo, action: FolderRepoAction) => void
} {
  const t = useTranslate()
  const excludeCapability = useRuntimeTargetCapability(
    target,
    FOLDER_REPO_EXCLUDE_RUNTIME_CAPABILITY
  )
  const [busyRepo, setBusyRepo] = useState<string | null>(null)
  const failedMessage = useCallback(
    (failure: unknown): string =>
      failure instanceof Error && failure.message
        ? failure.message
        : t(
            'auto.components.right.sidebar.FolderRepoScm.repositoryActionFailed',
            'Repository action failed.'
          ),
    [t]
  )

  const runRepoAction = (repo: FolderNestedRepo, action: FolderRepoAction): void => {
    if (!target || busyRepo !== null) {
      return
    }
    const entry = repoScopes.find((candidate) => candidate.repo.relativePath === repo.relativePath)
    if (!entry) {
      return
    }
    const scope = entry.scope
    if (action === 'reveal') {
      useAppStore.getState().revealInExplorer(folderSelector, scope.worktree.path)
      return
    }
    if (action === 'copy') {
      void window.api.ui.writeClipboardText(scope.worktree.path).then(
        () =>
          toast.success(
            t(
              'auto.components.right.sidebar.FolderRepoScm.repositoryPathCopied',
              'Repository path copied.'
            )
          ),
        (failure: unknown) => toast.error(failedMessage(failure))
      )
      return
    }
    if (action === 'exclude') {
      if (!excludeCapability) {
        return
      }
      void (async () => {
        setBusyRepo(repo.relativePath)
        try {
          await excludeFolderNestedRepo(target, folderSelector, repo.relativePath)
          toast.success(
            t(
              'auto.components.right.sidebar.FolderRepoScm.repositoryExcluded',
              '{{repo}} excluded.',
              { repo: repo.displayName }
            )
          )
          onExcluded(repo.relativePath)
          rescan()
        } catch (failure) {
          toast.error(failedMessage(failure))
        } finally {
          setBusyRepo(null)
        }
      })()
      return
    }
    const context = {
      target: scope.gitCopy?.transport ?? target,
      worktreeId: scope.worktreeId,
      worktreePath: scope.worktree.path,
      ...(connectionId ? { connectionId } : {})
    }
    const successMessage =
      action === 'fetch'
        ? t('auto.components.right.sidebar.FolderRepoScm.repositoryFetched', 'Fetched {{repo}}.', {
            repo: repo.displayName
          })
        : action === 'pull'
          ? t('auto.components.right.sidebar.FolderRepoScm.repositoryPulled', 'Pulled {{repo}}.', {
              repo: repo.displayName
            })
          : t('auto.components.right.sidebar.FolderRepoScm.repositoryPushed', 'Pushed {{repo}}.', {
              repo: repo.displayName
            })
    void (async () => {
      setBusyRepo(repo.relativePath)
      try {
        if (action === 'fetch') {
          await fetchRuntimeGit(context)
        } else if (action === 'pull') {
          await pullRuntimeGit(context)
        } else {
          await pushRuntimeGit(context)
        }
        toast.success(successMessage)
        await refreshStatus()
        rescan()
      } catch (failure) {
        toast.error(failedMessage(failure))
      } finally {
        setBusyRepo(null)
      }
    })()
  }

  return { busyRepo, excludeSupported: excludeCapability === true, runRepoAction }
}
