import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, CircleStop, GitFork, Link2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type {
  GitSubmoduleAction,
  GitSubmoduleTaskProgress
} from '../../../../../../shared/git/submodules/git-submodule-action'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { GIT_SUBMODULE_TASK_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import {
  cancelRuntimeGitSubmoduleTask,
  readRuntimeGitSubmoduleTask,
  runRuntimeGitSubmoduleAction,
  startRuntimeGitSubmoduleTask
} from '@/runtime/source-control/git/runtime-git-submodule-client'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'

const TASK_POLL_MS = 1_000

type RunningTask = {
  taskId: string
  action: GitSubmoduleAction
  progress: GitSubmoduleTaskProgress
}

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
  const [task, setTask] = useState<RunningTask | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const mounted = useRef(true)
  const taskSupported =
    useRuntimeTargetCapability(target, GIT_SUBMODULE_TASK_RUNTIME_CAPABILITY) === true

  useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const actionLabel = (action: GitSubmoduleAction): string =>
    action === 'init'
      ? t('auto.components.right.sidebar.FolderRepoScm.submoduleInit', 'Initialize submodules')
      : action === 'update'
        ? t('auto.components.right.sidebar.FolderRepoScm.submoduleUpdate', 'Update submodules')
        : t('auto.components.right.sidebar.FolderRepoScm.submoduleSync', 'Sync submodule URLs')

  const failedMessage = useCallback(
    (error: unknown): string =>
      error instanceof Error
        ? error.message
        : t(
            'auto.components.right.sidebar.FolderRepoScm.submoduleActionFailed',
            'Submodule action failed.'
          ),
    [t]
  )

  const succeeded = useCallback((): void => {
    toast.success(
      t(
        'auto.components.right.sidebar.FolderRepoScm.submoduleActionDone',
        'Submodule action completed.'
      )
    )
    if (mounted.current) {
      onChanged()
    }
  }, [onChanged, t])

  const runLegacy = (action: GitSubmoduleAction): void => {
    setRunning(true)
    void runRuntimeGitSubmoduleAction({ target, worktreeId }, action)
      .then(succeeded)
      .catch((error: unknown) => toast.error(failedMessage(error)))
      .finally(() => setRunning(false))
  }

  const run = (action: GitSubmoduleAction): void => {
    if (running || task) {
      return
    }
    if (!taskSupported) {
      runLegacy(action)
      return
    }
    setRunning(true)
    void startRuntimeGitSubmoduleTask({ target, worktreeId }, action)
      .then(({ taskId }) => {
        setCancelling(false)
        setTask({
          taskId,
          action,
          progress: { active: true, cancelled: false, steps: 0, lastLine: null, error: null }
        })
      })
      .catch((error: unknown) => toast.error(failedMessage(error)))
      .finally(() => setRunning(false))
  }

  const cancel = (): void => {
    if (!task) {
      return
    }
    setCancelling(true)
    void cancelRuntimeGitSubmoduleTask({ target, worktreeId }, task.taskId).catch(
      (error: unknown) => {
        setCancelling(false)
        toast.error(failedMessage(error))
      }
    )
  }

  const taskId = task?.taskId
  useEffect(() => {
    if (!taskId) {
      return
    }
    let stopped = false
    const poll = (): void => {
      void readRuntimeGitSubmoduleTask({ target, worktreeId }, taskId)
        .then((progress) => {
          if (stopped) {
            return
          }
          if (!progress) {
            // The host restarted or pruned the finished task before this poll.
            setTask(null)
            toast.error(failedMessage(undefined))
            return
          }
          setTask((prev) => (prev && prev.taskId === taskId ? { ...prev, progress } : prev))
          if (progress.active) {
            return
          }
          setTask(null)
          if (progress.error) {
            toast.error(progress.error)
          } else if (progress.cancelled) {
            toast.info(
              t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleActionCancelled',
                'Submodule action cancelled.'
              )
            )
          } else {
            succeeded()
          }
        })
        .catch((error: unknown) => {
          if (stopped) {
            return
          }
          setTask(null)
          toast.error(failedMessage(error))
        })
    }
    const stop = installWindowVisibilityInterval({ run: poll, intervalMs: TASK_POLL_MS })
    return () => {
      stopped = true
      stop()
    }
  }, [failedMessage, onChanged, succeeded, t, target, taskId, worktreeId])

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-busy={task !== null}
              aria-label={t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleActions',
                'Submodule actions'
              )}
              disabled={running}
            >
              {task ? (
                <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <GitFork className="size-3.5 text-muted-foreground" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {task
            ? `${actionLabel(task.action)}…${
                task.progress.steps > 0 ? ` ${task.progress.steps}` : ''
              }`
            : t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleActions',
                'Submodule actions'
              )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {task ? (
          <>
            <div className="px-2 py-1.5 text-xs" data-testid="folder-submodule-progress">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                <span className="truncate">{actionLabel(task.action)}…</span>
                {task.progress.steps > 0 ? (
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {task.progress.steps}
                  </span>
                ) : null}
              </div>
              {task.progress.lastLine ? (
                <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-muted-foreground">
                  {task.progress.lastLine}
                </div>
              ) : null}
            </div>
            <DropdownMenuItem disabled={cancelling} onSelect={cancel}>
              <CircleStop className="size-3.5" />
              {t(
                'auto.components.right.sidebar.FolderRepoScm.stopSubmoduleAction',
                'Stop submodule action'
              )}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled={running} onSelect={() => run('init')}>
              <ArrowDownToLine className="size-3.5" />
              {t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleInit',
                'Initialize submodules'
              )}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={running} onSelect={() => run('update')}>
              <RefreshCw className="size-3.5" />
              {t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleUpdate',
                'Update submodules'
              )}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={running} onSelect={() => run('sync')}>
              <Link2 className="size-3.5" />
              {t(
                'auto.components.right.sidebar.FolderRepoScm.submoduleSync',
                'Sync submodule URLs'
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
