import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useTranslate } from '@/i18n/use-translate'

export function FolderStashCreateForm({
  busy,
  message,
  includeUntracked,
  onMessageChange,
  onIncludeUntrackedChange,
  onCancel,
  onSubmit
}: {
  busy: boolean
  message: string
  includeUntracked: boolean
  onMessageChange: (message: string) => void
  onIncludeUntrackedChange: (include: boolean) => void
  onCancel: () => void
  onSubmit: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="border-b border-border/60 px-2 pb-1.5 pt-1">
      <Input
        autoFocus
        value={message}
        placeholder={t(
          'auto.components.right.sidebar.FolderRepoScm.stashMessagePlaceholder',
          'Stash message (optional)'
        )}
        aria-label={t(
          'auto.components.right.sidebar.FolderRepoScm.stashMessagePlaceholder',
          'Stash message (optional)'
        )}
        density="compact"
        disabled={busy}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSubmit()
          } else if (event.key === 'Escape') {
            onCancel()
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox
            checked={includeUntracked}
            className="size-3.5"
            disabled={busy}
            onCheckedChange={(checked) => onIncludeUntrackedChange(checked === true)}
          />
          <span className="truncate">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.stashIncludeUntracked',
              'Include untracked'
            )}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onCancel}>
            {t('auto.components.right.sidebar.FolderRepoScm.cancel', 'Cancel')}
          </Button>
          <Button type="button" size="xs" variant="secondary" disabled={busy} onClick={onSubmit}>
            {busy
              ? t('auto.components.right.sidebar.FolderRepoScm.stashing', 'Stashing…')
              : t('auto.components.right.sidebar.FolderRepoScm.stash', 'Stash')}
          </Button>
        </div>
      </div>
    </div>
  )
}
