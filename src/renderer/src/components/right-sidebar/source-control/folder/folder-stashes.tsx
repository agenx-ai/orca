import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { GitStashEntry } from '../../../../../../shared/git/stash/git-stash'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GIT_STASH_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
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
  applyRuntimeGitStash,
  createRuntimeGitStash,
  dropRuntimeGitStash,
  listRuntimeGitStashes
} from '@/runtime/source-control/git/runtime-git-stash-client'
import type { SourceControlScope } from '../panel/worktree-scope'
import { FolderStashCreateForm } from './folder-stash-create-form'
import { FolderStashDropDialog } from './folder-stash-drop-dialog'
import { SectionHeader } from './folder-section-header'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'

function SectionPlaceholder({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-3 pb-2 text-xs text-muted-foreground">{children}</div>
}

function StashesBody({
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
  const [entries, setEntries] = useState<GitStashEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(false)
  const [pendingDrop, setPendingDrop] = useState<GitStashEntry | null>(null)

  const failedMessage = useCallback(
    (failure: unknown): string =>
      failure instanceof Error
        ? failure.message
        : t(
            'auto.components.right.sidebar.FolderRepoScm.stashActionFailed',
            'Stash action failed.'
          ),
    [t]
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setEntries(await listRuntimeGitStashes(context))
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

  const run = async (
    successMessage: string,
    action: () => Promise<void>,
    refreshStatus: boolean
  ): Promise<boolean> => {
    if (busy) {
      return false
    }
    setBusy(true)
    try {
      await action()
      toast.success(successMessage)
      await load()
      if (refreshStatus) {
        onChanged?.()
      }
      return true
    } catch (failure) {
      toast.error(failedMessage(failure))
      return false
    } finally {
      setBusy(false)
    }
  }

  const stashChanges = (): void => {
    void (async () => {
      const created = await run(
        t('auto.components.right.sidebar.FolderRepoScm.stashCreated', 'Changes stashed.'),
        () => createRuntimeGitStash(context, { message: message.trim(), includeUntracked }),
        true
      )
      if (created) {
        setCreating(false)
        setMessage('')
      }
    })()
  }

  const refresh = (): void => {
    if (!loading) {
      void load()
    }
  }

  return (
    <>
      <SectionHeader
        title={t('auto.components.right.sidebar.FolderRepoScm.stashes', 'Stashes')}
        detail={entries && entries.length > 0 ? `${entries.length}` : undefined}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.stashChanges',
                    'Stash changes'
                  )}
                  disabled={busy}
                  onClick={() => setCreating((open) => !open)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('auto.components.right.sidebar.FolderRepoScm.stashChanges', 'Stash changes')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.refreshStashes',
                    'Refresh stashes'
                  )}
                  onClick={refresh}
                >
                  <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('auto.components.right.sidebar.FolderRepoScm.refreshStashes', 'Refresh stashes')}
              </TooltipContent>
            </Tooltip>
          </>
        }
      />
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-1">
        {creating ? (
          <FolderStashCreateForm
            busy={busy}
            message={message}
            includeUntracked={includeUntracked}
            onMessageChange={setMessage}
            onIncludeUntrackedChange={setIncludeUntracked}
            onCancel={() => setCreating(false)}
            onSubmit={stashChanges}
          />
        ) : null}
        {error ? (
          <div className="px-3 py-1 text-xs text-destructive">{error}</div>
        ) : entries === null ? (
          <div className="space-y-2 px-3 pb-2 pt-1" aria-busy="true">
            <div className="h-2 w-2/3 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted" />
          </div>
        ) : entries.length === 0 ? (
          <SectionPlaceholder>
            {t('auto.components.right.sidebar.FolderRepoScm.noStashes', 'No stashes.')}
          </SectionPlaceholder>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.selector}
              className="group flex items-center gap-1 rounded-sm py-0.5 pl-3 pr-1 hover:bg-accent/40"
              data-testid="folder-stash-row"
            >
              <Archive className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">{entry.message || entry.selector}</div>
                {entry.branch ? (
                  <div className="truncate text-[10px] text-muted-foreground">{entry.branch}</div>
                ) : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0"
                    aria-label={t(
                      'auto.components.right.sidebar.FolderRepoScm.stashActions',
                      'Stash actions'
                    )}
                    disabled={busy}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[150px]">
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(
                        t(
                          'auto.components.right.sidebar.FolderRepoScm.stashApplied',
                          'Stash applied.'
                        ),
                        () => applyRuntimeGitStash(context, entry.index, false),
                        true
                      )
                    }
                  >
                    {t('auto.components.right.sidebar.FolderRepoScm.applyStash', 'Apply stash')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(
                        t(
                          'auto.components.right.sidebar.FolderRepoScm.stashPopped',
                          'Stash popped.'
                        ),
                        () => applyRuntimeGitStash(context, entry.index, true),
                        true
                      )
                    }
                  >
                    {t('auto.components.right.sidebar.FolderRepoScm.popStash', 'Pop stash')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setPendingDrop(entry)}>
                    {t('auto.components.right.sidebar.FolderRepoScm.dropStash', 'Drop stash')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>
      <FolderStashDropDialog
        entry={pendingDrop}
        busy={busy}
        onCancel={() => setPendingDrop(null)}
        onConfirm={(entry) => {
          setPendingDrop(null)
          void run(
            t('auto.components.right.sidebar.FolderRepoScm.stashDropped', 'Stash dropped.'),
            () => dropRuntimeGitStash(context, entry.index),
            false
          )
        }}
      />
    </>
  )
}

export function FolderStashesSection({
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
  const capability = useRuntimeTargetCapability(runtimeTarget, GIT_STASH_RUNTIME_CAPABILITY)
  return (
    <section className="flex max-h-[35%] min-h-0 shrink-0 flex-col border-t border-border">
      {owner && runtimeTarget && capability === true ? (
        <StashesBody owner={owner} target={runtimeTarget} {...(onChanged ? { onChanged } : {})} />
      ) : (
        <>
          <SectionHeader
            title={t('auto.components.right.sidebar.FolderRepoScm.stashes', 'Stashes')}
          />
          <SectionPlaceholder>
            {!owner
              ? t(
                  'auto.components.right.sidebar.FolderRepoScm.selectRepoStashes',
                  'Select a repository to view stashes.'
                )
              : capability === false
                ? t(
                    'auto.components.right.sidebar.FolderRepoScm.stashUpgrade',
                    'Update Orca on the host to manage stashes.'
                  )
                : t(
                    'auto.components.right.sidebar.FolderRepoScm.loadingStashes',
                    'Loading stashes…'
                  )}
          </SectionPlaceholder>
        </>
      )}
    </section>
  )
}
