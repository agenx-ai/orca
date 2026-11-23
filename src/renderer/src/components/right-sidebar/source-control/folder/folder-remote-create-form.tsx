import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslate } from '@/i18n/use-translate'

export function FolderRemoteCreateForm({
  busy,
  name,
  url,
  onNameChange,
  onUrlChange,
  onCancel,
  onSubmit
}: {
  busy: boolean
  name: string
  url: string
  onNameChange: (name: string) => void
  onUrlChange: (url: string) => void
  onCancel: () => void
  onSubmit: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const canSubmit = name.trim().length > 0 && url.trim().length > 0
  return (
    <div className="border-b border-border/60 px-2 pb-1.5 pt-1">
      <Input
        autoFocus
        value={name}
        placeholder={t(
          'auto.components.right.sidebar.FolderRepoScm.remoteNamePlaceholder',
          'Remote name'
        )}
        aria-label={t(
          'auto.components.right.sidebar.FolderRepoScm.remoteNamePlaceholder',
          'Remote name'
        )}
        density="compact"
        disabled={busy}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canSubmit) {
            onSubmit()
          } else if (event.key === 'Escape') {
            onCancel()
          }
        }}
      />
      <div className="mt-1 flex items-center gap-1.5">
        <Input
          value={url}
          placeholder={t(
            'auto.components.right.sidebar.FolderRepoScm.remoteUrlPlaceholder',
            'Remote URL'
          )}
          aria-label={t(
            'auto.components.right.sidebar.FolderRepoScm.remoteUrlPlaceholder',
            'Remote URL'
          )}
          density="compact"
          className="min-w-0 flex-1"
          disabled={busy}
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSubmit) {
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
          disabled={busy || !canSubmit}
          onClick={onSubmit}
        >
          {busy
            ? t('auto.components.right.sidebar.FolderRepoScm.addingRemote', 'Adding…')
            : t('auto.components.right.sidebar.FolderRepoScm.addRemote', 'Add remote')}
        </Button>
      </div>
    </div>
  )
}
