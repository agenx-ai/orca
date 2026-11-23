import { useCallback, useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, RefreshCw, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { GitTagEntry } from '../../../../../../shared/git/tags/git-tag'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GIT_TAGS_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
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
  createRuntimeGitTag,
  deleteRuntimeGitTag,
  listRuntimeGitTags
} from '@/runtime/source-control/git/runtime-git-tag-client'
import type { SourceControlScope } from '../panel/worktree-scope'
import { SectionHeader } from './folder-section-header'
import { FolderTagCreateForm } from './folder-tag-create-form'
import { FolderTagDeleteDialog } from './folder-tag-delete-dialog'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'

function TagsBody({
  owner,
  target
}: {
  owner: SourceControlScope
  target: RuntimeClientTarget
}): React.JSX.Element {
  const t = useTranslate()
  const context = useMemo(
    () => ({ target, worktreeId: owner.worktreeId }),
    [owner.worktreeId, target]
  )
  const [tags, setTags] = useState<GitTagEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<GitTagEntry | null>(null)

  const failedMessage = useCallback(
    (failure: unknown): string =>
      failure instanceof Error
        ? failure.message
        : t('auto.components.right.sidebar.FolderRepoScm.tagActionFailed', 'Tag action failed.'),
    [t]
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setTags(await listRuntimeGitTags(context))
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

  const createTag = (): void => {
    const tagName = name.trim()
    if (!tagName || busy) {
      return
    }
    void (async () => {
      setBusy(true)
      try {
        await createRuntimeGitTag(context, tagName, message.trim() || undefined)
        toast.success(
          t('auto.components.right.sidebar.FolderRepoScm.tagCreated', 'Tag {{name}} created.', {
            name: tagName
          })
        )
        setCreating(false)
        setName('')
        setMessage('')
        await load()
      } catch (failure) {
        toast.error(failedMessage(failure))
      } finally {
        setBusy(false)
      }
    })()
  }

  const deleteTag = (tag: GitTagEntry): void => {
    setPendingDelete(null)
    if (busy) {
      return
    }
    void (async () => {
      setBusy(true)
      try {
        await deleteRuntimeGitTag(context, tag.name)
        toast.success(
          t('auto.components.right.sidebar.FolderRepoScm.tagDeleted', 'Tag {{name}} deleted.', {
            name: tag.name
          })
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
        title={t('auto.components.right.sidebar.FolderRepoScm.tags', 'Tags')}
        detail={tags && tags.length > 0 ? `${tags.length}` : undefined}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.createTag',
                    'Create tag'
                  )}
                  disabled={busy}
                  onClick={() => setCreating((open) => !open)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('auto.components.right.sidebar.FolderRepoScm.createTag', 'Create tag')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.refreshTags',
                    'Refresh tags'
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
                {t('auto.components.right.sidebar.FolderRepoScm.refreshTags', 'Refresh tags')}
              </TooltipContent>
            </Tooltip>
          </>
        }
      />
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-1">
        {creating ? (
          <FolderTagCreateForm
            busy={busy}
            name={name}
            message={message}
            onNameChange={setName}
            onMessageChange={setMessage}
            onCancel={() => setCreating(false)}
            onSubmit={createTag}
          />
        ) : null}
        {error ? (
          <div className="px-3 py-1 text-xs text-destructive">{error}</div>
        ) : tags === null ? (
          <div className="space-y-2 px-3 pb-2 pt-1" aria-busy="true">
            <div className="h-2 w-2/3 rounded bg-muted" />
            <div className="h-2 w-1/2 rounded bg-muted" />
          </div>
        ) : tags.length === 0 ? (
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {t('auto.components.right.sidebar.FolderRepoScm.noTags', 'No tags.')}
          </div>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.name}
              className="group flex items-center gap-1 rounded-sm py-0.5 pl-3 pr-1 hover:bg-accent/40"
              data-testid="folder-tag-row"
            >
              <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">{tag.name}</div>
                {tag.message ? (
                  <div className="truncate text-[10px] text-muted-foreground">{tag.message}</div>
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
                      'auto.components.right.sidebar.FolderRepoScm.tagActions',
                      'Tag actions'
                    )}
                    disabled={busy}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[150px]">
                  <DropdownMenuItem variant="destructive" onSelect={() => setPendingDelete(tag)}>
                    {t('auto.components.right.sidebar.FolderRepoScm.deleteTag', 'Delete tag')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>
      <FolderTagDeleteDialog
        tag={pendingDelete}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteTag}
      />
    </>
  )
}

export function FolderTagsSection({
  owner,
  target
}: {
  owner: SourceControlScope | null
  target: RuntimeClientTarget | null
}): React.JSX.Element {
  const t = useTranslate()
  const runtimeTarget = owner?.gitCopy?.transport ?? target
  const capability = useRuntimeTargetCapability(runtimeTarget, GIT_TAGS_RUNTIME_CAPABILITY)
  return (
    <section className="flex max-h-[30%] min-h-0 shrink-0 flex-col border-t border-border">
      {owner && runtimeTarget && capability === true ? (
        <TagsBody owner={owner} target={runtimeTarget} />
      ) : (
        <>
          <SectionHeader title={t('auto.components.right.sidebar.FolderRepoScm.tags', 'Tags')} />
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {!owner
              ? t(
                  'auto.components.right.sidebar.FolderRepoScm.selectRepoTags',
                  'Select a repository to view tags.'
                )
              : capability === false
                ? t(
                    'auto.components.right.sidebar.FolderRepoScm.tagsUpgrade',
                    'Update Orca on the host to manage tags.'
                  )
                : t('auto.components.right.sidebar.FolderRepoScm.loadingTags', 'Loading tags…')}
          </div>
        </>
      )}
    </section>
  )
}
