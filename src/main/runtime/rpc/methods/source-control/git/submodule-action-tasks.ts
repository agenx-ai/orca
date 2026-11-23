import { randomUUID } from 'node:crypto'
import type {
  GitSubmoduleAction,
  GitSubmoduleTaskProgress
} from '../../../../../../shared/git/submodules/git-submodule-action'

type SubmoduleActionTask = {
  controller: AbortController
  action: GitSubmoduleAction
  steps: number
  lastLine: string | null
  cancelled: boolean
  error: string | null
  active: boolean
  finishedAt: number | null
}

// A finished task stays pollable long enough for the client to read its outcome.
const FINISHED_TASK_TTL_MS = 60_000
const PROGRESS_LINE = /^(?:Submodule path .*: checked out |Synchronizing submodule url )/

/** Progress is polled from another RPC, so tasks are addressed by worktree+client id. */
const activeTasks = new Map<string, SubmoduleActionTask>()

function taskKey(worktreeSelector: string, taskId: string): string {
  return `${worktreeSelector}\0${taskId}`
}

function pruneFinishedTasks(now: number): void {
  for (const [key, task] of activeTasks) {
    if (task.finishedAt !== null && now - task.finishedAt > FINISHED_TASK_TTL_MS) {
      activeTasks.delete(key)
    }
  }
}

export function startSubmoduleActionTask(args: {
  worktreeSelector: string
  action: GitSubmoduleAction
  run: (options: { signal: AbortSignal; onStderr: (chunk: string) => void }) => Promise<unknown>
}): string {
  pruneFinishedTasks(Date.now())
  const taskId = randomUUID()
  const key = taskKey(args.worktreeSelector, taskId)
  const controller = new AbortController()
  const task: SubmoduleActionTask = {
    controller,
    action: args.action,
    steps: 0,
    lastLine: null,
    cancelled: false,
    error: null,
    active: true,
    finishedAt: null
  }
  activeTasks.set(key, task)

  const consumeLine = (raw: string): void => {
    const line = raw.trim()
    if (!line) {
      return
    }
    task.lastLine = line
    if (PROGRESS_LINE.test(line)) {
      task.steps += 1
    }
  }
  let pending = ''
  const onStderr = (chunk: string): void => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    lines.forEach(consumeLine)
  }

  void args
    .run({ signal: controller.signal, onStderr })
    .catch((error: unknown) => {
      if (controller.signal.aborted) {
        task.cancelled = true
        return
      }
      task.error = error instanceof Error ? error.message : 'Submodule action failed.'
    })
    .finally(() => {
      consumeLine(pending)
      task.active = false
      task.finishedAt = Date.now()
    })
  return taskId
}

/** Null means the host restarted or the finished task was already pruned. */
export function readSubmoduleActionTaskProgress(
  worktreeSelector: string,
  taskId: string
): GitSubmoduleTaskProgress | null {
  const task = activeTasks.get(taskKey(worktreeSelector, taskId))
  return task
    ? {
        active: task.active,
        cancelled: task.cancelled,
        steps: task.steps,
        lastLine: task.lastLine,
        error: task.error
      }
    : null
}

/** False when the task already settled; the client then just reads the final progress. */
export function cancelSubmoduleActionTask(worktreeSelector: string, taskId: string): boolean {
  const task = activeTasks.get(taskKey(worktreeSelector, taskId))
  if (!task || !task.active) {
    return false
  }
  task.controller.abort()
  return true
}
