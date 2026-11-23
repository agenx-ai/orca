import { useState } from 'react'
import type { GitHistoryItemRef } from '../../../../../../shared/git/history/git-history-types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'

export function FolderBranchCompareDialog({
  local,
  remote,
  defaultBaseId,
  defaultHeadId,
  busy,
  onCancel,
  onCompare
}: {
  local: readonly GitHistoryItemRef[]
  remote: readonly GitHistoryItemRef[]
  defaultBaseId: string | null
  defaultHeadId: string | null
  busy: boolean
  onCancel: () => void
  onCompare: (baseRef: string, headRef: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [baseId, setBaseId] = useState(defaultBaseId ?? '')
  const [headId, setHeadId] = useState(defaultHeadId ?? '')
  const canCompare = baseId.length > 0 && headId.length > 0 && baseId !== headId
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle size="compact">
            {t('auto.components.right.sidebar.FolderRepoScm.compareRefsTitle', 'Compare refs')}
          </DialogTitle>
          <DialogDescription size="compact">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.compareRefsDescription',
              'Choose a base ref and a head ref to compare.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label variant="dialog-field">
              {t('auto.components.right.sidebar.FolderRepoScm.baseRef', 'Base ref')}
            </Label>
            <Select value={baseId} onValueChange={setBaseId} disabled={busy}>
              <SelectTrigger
                size="sm"
                density="compact"
                className="w-full"
                data-testid="folder-compare-base"
                aria-label={t('auto.components.right.sidebar.FolderRepoScm.baseRef', 'Base ref')}
              >
                <SelectValue
                  placeholder={t('auto.components.right.sidebar.FolderRepoScm.baseRef', 'Base ref')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>
                    {t('auto.components.right.sidebar.FolderRepoScm.localBranches', 'Local')}
                  </SelectLabel>
                  {local.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>
                    {t('auto.components.right.sidebar.FolderRepoScm.remoteBranches', 'Remote')}
                  </SelectLabel>
                  {remote.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label variant="dialog-field">
              {t('auto.components.right.sidebar.FolderRepoScm.headRef', 'Head ref')}
            </Label>
            <Select value={headId} onValueChange={setHeadId} disabled={busy}>
              <SelectTrigger
                size="sm"
                density="compact"
                className="w-full"
                data-testid="folder-compare-head"
                aria-label={t('auto.components.right.sidebar.FolderRepoScm.headRef', 'Head ref')}
              >
                <SelectValue
                  placeholder={t('auto.components.right.sidebar.FolderRepoScm.headRef', 'Head ref')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>
                    {t('auto.components.right.sidebar.FolderRepoScm.localBranches', 'Local')}
                  </SelectLabel>
                  {local.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>
                    {t('auto.components.right.sidebar.FolderRepoScm.remoteBranches', 'Remote')}
                  </SelectLabel>
                  {remote.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {t('auto.components.right.sidebar.FolderRepoScm.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="folder-compare-submit"
            disabled={busy || !canCompare}
            onClick={() => onCompare(baseId, headId)}
          >
            {busy
              ? t('auto.components.right.sidebar.FolderRepoScm.comparingRefs', 'Comparing…')
              : t('auto.components.right.sidebar.FolderRepoScm.compare', 'Compare')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
