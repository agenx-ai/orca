import type { GitRemoteEntry } from '../../../../../../shared/git/remotes/git-remote-entry'
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

export function FolderRemoteRemoveDialog({
  remote,
  busy,
  onCancel,
  onConfirm
}: {
  remote: GitRemoteEntry | null
  busy: boolean
  onCancel: () => void
  onConfirm: (remote: GitRemoteEntry) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <Dialog
      open={remote !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle size="compact">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.removeRemoteTitle',
              'Remove this remote?'
            )}
          </DialogTitle>
          <DialogDescription size="compact">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.removeRemoteDescription',
              'The remote configuration will be removed locally.'
            )}
          </DialogDescription>
        </DialogHeader>
        {remote ? (
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs">
            <div className="break-all font-medium text-foreground">{remote.name}</div>
            {remote.fetchUrl ? (
              <div className="mt-0.5 break-all text-muted-foreground">{remote.fetchUrl}</div>
            ) : null}
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
              if (remote) {
                onConfirm(remote)
              }
            }}
          >
            {t('auto.components.right.sidebar.FolderRepoScm.removeRemote', 'Remove remote')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
