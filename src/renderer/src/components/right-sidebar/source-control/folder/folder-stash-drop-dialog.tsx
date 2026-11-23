import type { GitStashEntry } from '../../../../../../shared/git/stash/git-stash'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTranslate } from '@/i18n/use-translate'

export function FolderStashDropDialog({
  entry,
  busy,
  onCancel,
  onConfirm
}: {
  entry: GitStashEntry | null
  busy: boolean
  onCancel: () => void
  onConfirm: (entry: GitStashEntry) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle size="compact">
            {t('auto.components.right.sidebar.FolderRepoScm.dropStashTitle', 'Drop this stash?')}
          </DialogTitle>
          <DialogDescription size="compact">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.dropStashDescription',
              'The stash will be permanently removed.'
            )}
          </DialogDescription>
        </DialogHeader>
        {entry ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs">
            <div className="break-all font-medium text-foreground">
              {entry.message || entry.selector}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('auto.components.right.sidebar.FolderRepoScm.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            autoFocus
            disabled={busy}
            onClick={() => {
              if (entry) {
                onConfirm(entry)
              }
            }}
          >
            {t('auto.components.right.sidebar.FolderRepoScm.dropStash', 'Drop stash')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
