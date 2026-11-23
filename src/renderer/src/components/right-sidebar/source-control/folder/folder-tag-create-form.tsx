import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslate } from '@/i18n/use-translate'

export function FolderTagCreateForm({
  busy,
  name,
  message,
  onNameChange,
  onMessageChange,
  onCancel,
  onSubmit
}: {
  busy: boolean
  name: string
  message: string
  onNameChange: (name: string) => void
  onMessageChange: (message: string) => void
  onCancel: () => void
  onSubmit: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="border-b border-border/60 px-2 pb-1.5 pt-1">
      <Input
        autoFocus
        value={name}
        placeholder={t(
          'auto.components.right.sidebar.FolderRepoScm.tagNamePlaceholder',
          'Tag name'
        )}
        aria-label={t('auto.components.right.sidebar.FolderRepoScm.tagNamePlaceholder', 'Tag name')}
        density="compact"
        disabled={busy}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSubmit()
          } else if (event.key === 'Escape') {
            onCancel()
          }
        }}
      />
      <div className="mt-1 flex items-center gap-1.5">
        <Input
          value={message}
          placeholder={t(
            'auto.components.right.sidebar.FolderRepoScm.tagMessagePlaceholder',
            'Message (optional)'
          )}
          aria-label={t(
            'auto.components.right.sidebar.FolderRepoScm.tagMessagePlaceholder',
            'Message (optional)'
          )}
          density="compact"
          className="min-w-0 flex-1"
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
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('auto.components.right.sidebar.FolderRepoScm.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={busy || name.trim().length === 0}
          onClick={onSubmit}
        >
          {busy
            ? t('auto.components.right.sidebar.FolderRepoScm.creatingTag', 'Creating…')
            : t('auto.components.right.sidebar.FolderRepoScm.createTag', 'Create tag')}
        </Button>
      </div>
    </div>
  )
}
