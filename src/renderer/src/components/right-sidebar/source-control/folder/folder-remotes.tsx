import { useCallback, useEffect, useMemo, useState } from 'react'
import { Globe, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { GitRemoteEntry } from '../../../../../../shared/git/remotes/git-remote-entry'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GIT_REMOTES_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import {
  addRuntimeGitRemote,
  fetchRuntimeGitRemote,
  listRuntimeGitRemotes,
  removeRuntimeGitRemote
} from '@/runtime/source-control/git/runtime-git-remote-client'
import type { SourceControlScope } from '../panel/worktree-scope'
import { SectionHeader } from './folder-section-header'
import { FolderRemoteCreateForm } from './folder-remote-create-form'
import { FolderRemoteRemoveDialog } from './folder-remote-remove-dialog'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'

function RemotesBody({
  owner,
  target,
  onChanged
}: {
  owner: SourceControlScope
  target: RuntimeClientTarget
  onChanged?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const context = useMemo(
    () => ({ target, worktreeId: owner.worktreeId }),
    [owner.worktreeId, target]
  )
  const [remotes, setRemotes] = useState<GitRemoteEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fetching, setFetching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [pendingRemove, setPendingRemove] = useState<GitRemoteEntry | null>(null)

  const failedMessage = useCallback(
    (failure: unknown): string =>
      failure instanceof Error
        ? failure.message
        : t(
            'auto.components.right.sidebar.FolderRepoScm.remoteActionFailed',
            'Remote action failed.'
          ),
    [t]
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setRemotes(await listRuntimeGitRemotes(context))
      setError(null)
    } catch (failure) {
      setError(failedMessage(failure))
    } finally {
      setLoading(false)
    }
  }, [context, failedMessage])

  useEffect(() => {
    void load()
  }, [load])

  const addRemote = (): void => {
    const remoteName = name.trim()
    const remoteUrl = url.trim()
    if (!remoteName || !remoteUrl || busy) {
      return
    }
    void (async () => {
      setBusy(true)
      try {
        await addRuntimeGitRemote(context, remoteName, remoteUrl)
        toast.success(
          t('auto.components.right.sidebar.FolderRepoScm.remoteAdded', 'Remote {{name}} added.', {
            name: remoteName
          })
        )
        setCreating(false)
        setName('')
        setUrl('')
        await load()
      } catch (failure) {
        toast.error(failedMessage(failure))
      } finally {
        setBusy(false)
      }
    })()
  }

  const fetchRemote = (remote: GitRemoteEntry): void => {
    if (busy) {
      return
    }
    void (async () => {
      setBusy(true)
      setFetching(remote.name)
      try {
        await fetchRuntimeGitRemote(context, remote.name)
        toast.success(
          t('auto.components.right.sidebar.FolderRepoScm.remoteFetched', 'Fetched {{name}}.', {
            name: remote.name
          })
        )
        onChanged?.()
      } catch (failure) {
        toast.error(failedMessage(failure))
      } finally {
        setBusy(false)
        setFetching(null)
      }
    })()
  }

  const removeRemote = (remote: GitRemoteEntry): void => {
    setPendingRemove(null)
    if (busy) {
      return
    }
    void (async () => {
      setBusy(true)
      try {
        await removeRuntimeGitRemote(context, remote.name)
        toast.success(
          t(
            'auto.components.right.sidebar.FolderRepoScm.remoteRemoved',
            'Remote {{name}} removed.',
            { name: remote.name }
          )
        )
        await load()
      } catch (failure) {
        toast.error(failedMessage(failure))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <>
      <SectionHeader
        title={t('auto.components.right.sidebar.FolderRepoScm.remotes', 'Remotes')}
        detail={remotes && remotes.length > 0 ? `${remotes.length}` : undefined}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.addRemote',
                    'Add remote'
                  )}
                  disabled={busy}
                  onClick={() => setCreating((open) => !open)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('auto.components.right.sidebar.FolderRepoScm.addRemote', 'Add remote')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.refreshRemotes',
                    'Refresh remotes'
                  )}
                  onClick={() => {
                    if (!loading) {
                      void load()
                    }
                  }}
                >
                  <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('auto.components.right.sidebar.FolderRepoScm.refreshRemotes', 'Refresh remotes')}
              </TooltipContent>
            </Tooltip>
          </>
        }
      />
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-1">
        {creating ? (
          <FolderRemoteCreateForm
            busy={busy}
            name={name}
            url={url}
            onNameChange={setName}
            onUrlChange={setUrl}
            onCancel={() => setCreating(false)}
            onSubmit={addRemote}
          />
        ) : null}
        {error ? (
          <div className="px-3 py-1 text-xs text-destructive">{error}</div>
        ) : remotes === null ? (
          <div className="space-y-2 px-3 pb-2 pt-1" aria-busy="true">
            <div className="h-2 w-2/3 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted" />
          </div>
        ) : remotes.length === 0 ? (
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {t('auto.components.right.sidebar.FolderRepoScm.noRemotes', 'No remotes.')}
          </div>
        ) : (
          remotes.map((remote) => (
            <div
              key={remote.name}
              className="group flex items-center gap-1 rounded-sm py-0.5 pl-3 pr-1 hover:bg-accent/40"
              data-testid="folder-remote-row"
            >
              <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">{remote.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {fetching === remote.name
                    ? t('auto.components.right.sidebar.FolderRepoScm.remoteFetching', 'Fetching…')
                    : (remote.fetchUrl ?? remote.pushUrl ?? '')}
                </div>
              </div>
              {fetching === remote.name ? (
                <RefreshCw className="mr-1 size-3 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0"
                    aria-label={t(
                      'auto.components.right.sidebar.FolderRepoScm.remoteActions',
                      'Remote actions'
                    )}
                    disabled={busy}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[150px]">
                  <DropdownMenuItem onSelect={() => fetchRemote(remote)}>
                    {t('auto.components.right.sidebar.FolderRepoScm.fetchRemote', 'Fetch')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setPendingRemove(remote)}>
                    {t('auto.components.right.sidebar.FolderRepoScm.removeRemote', 'Remove remote')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>
      <FolderRemoteRemoveDialog
        remote={pendingRemove}
        busy={busy}
        onCancel={() => setPendingRemove(null)}
        onConfirm={removeRemote}
      />
    </>
  )
}

export function FolderRemotesSection({
  owner,
  target,
  onChanged
}: {
  owner: SourceControlScope | null
  target: RuntimeClientTarget | null
  onChanged?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const runtimeTarget = owner?.gitCopy?.transport ?? target
  const capability = useRuntimeTargetCapability(runtimeTarget, GIT_REMOTES_RUNTIME_CAPABILITY)
  return (
    <section className="flex max-h-[30%] min-h-0 shrink-0 flex-col border-t border-border">
      {owner && runtimeTarget && capability === true ? (
        <RemotesBody owner={owner} target={runtimeTarget} {...(onChanged ? { onChanged } : {})} />
      ) : (
        <>
          <SectionHeader
            title={t('auto.components.right.sidebar.FolderRepoScm.remotes', 'Remotes')}
          />
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {!owner
              ? t(
                  'auto.components.right.sidebar.FolderRepoScm.selectRepoRemotes',
                  'Select a repository to view remotes.'
                )
              : capability === false
                ? t(
                    'auto.components.right.sidebar.FolderRepoScm.remotesUpgrade',
                    'Update Orca on the host to manage remotes.'
                  )
                : t(
                    'auto.components.right.sidebar.FolderRepoScm.loadingRemotes',
                    'Loading remotes…'
                  )}
          </div>
        </>
      )}
    </section>
  )
}
