import type { GitTagEntry } from '../../../../../../shared/git/tags/git-tag'
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

export function FolderTagDeleteDialog({
  tag,
  busy,
  onCancel,
  onConfirm
}: {
  tag: GitTagEntry | null
  busy: boolean
  onCancel: () => void
  onConfirm: (tag: GitTagEntry) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <Dialog
      open={tag !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle size="compact">
            {t('auto.components.right.sidebar.FolderRepoScm.deleteTagTitle', 'Delete this tag?')}
          </DialogTitle>
          <DialogDescription size="compact">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.deleteTagDescription',
              'The tag will be deleted locally. This cannot be undone.'
            )}
          </DialogDescription>
        </DialogHeader>
        {tag ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs">
            <div className="break-all font-medium text-foreground">{tag.name}</div>
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
              if (tag) {
                onConfirm(tag)
              }
            }}
          >
            {t('auto.components.right.sidebar.FolderRepoScm.deleteTag', 'Delete tag')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
