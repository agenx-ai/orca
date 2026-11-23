import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, GitFork, Link2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { GitSubmoduleAction } from '../../../../../../shared/git/submodules/git-submodule-action'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { runRuntimeGitSubmoduleAction } from '@/runtime/source-control/git/runtime-git-submodule-client'

export function FolderSubmoduleActionsMenu({
  target,
  worktreeId,
  onChanged
}: {
  target: RuntimeClientTarget
  worktreeId: string
  onChanged: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [running, setRunning] = useState(false)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const run = (action: GitSubmoduleAction): void => {
    if (running) {
      return
    }
    setRunning(true)
    void runRuntimeGitSubmoduleAction({ target, worktreeId }, action)
      .then(() => {
        toast.success(
          t(
            'auto.components.right.sidebar.FolderRepoScm.submoduleActionDone',
            'Submodule action completed.'
          )
        )
        if (mounted.current) {
          onChanged()
        }
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleActionFailed',
                'Submodule action failed.'
              )
        )
      })
      .finally(() => setRunning(false))
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleActions',
                'Submodule actions'
              )}
              disabled={running}
            >
              <GitFork className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {t('auto.components.right.sidebar.FolderRepoScm.submoduleActions', 'Submodule actions')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem disabled={running} onSelect={() => run('init')}>
          <ArrowDownToLine className="size-3.5" />
          {t('auto.components.right.sidebar.FolderRepoScm.submoduleInit', 'Initialize submodules')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={running} onSelect={() => run('update')}>
          <RefreshCw className="size-3.5" />
          {t('auto.components.right.sidebar.FolderRepoScm.submoduleUpdate', 'Update submodules')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={running} onSelect={() => run('sync')}>
          <Link2 className="size-3.5" />
          {t('auto.components.right.sidebar.FolderRepoScm.submoduleSync', 'Sync submodule URLs')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
