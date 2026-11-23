import type {
  GitSubmoduleAction,
  GitSubmoduleTaskProgress
} from '../../../../../shared/git/submodules/git-submodule-action'
import type { RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from '../../rpc/calls/runtime-rpc-call'
import { toRuntimeWorktreeSelector } from '../../rpc/targets/runtime-worktree-selector'

export async function runRuntimeGitSubmoduleAction(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  action: GitSubmoduleAction
): Promise<void> {
  if (!context.worktreeId) {
    throw new Error('Missing worktree selector')
  }
  await callRuntimeRpc(
    context.target,
    'git.submoduleAction',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), action },
    { timeoutMs: 120_000 }
  )
}

export async function startRuntimeGitSubmoduleTask(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  action: GitSubmoduleAction
): Promise<{ taskId: string }> {
  if (!context.worktreeId) {
    throw new Error('Missing worktree selector')
  }
  return callRuntimeRpc<{ taskId: string }>(
    context.target,
    'git.submoduleActionStart',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), action },
    { timeoutMs: 15_000 }
  )
}

export async function readRuntimeGitSubmoduleTask(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  taskId: string
): Promise<GitSubmoduleTaskProgress | null> {
  if (!context.worktreeId) {
    throw new Error('Missing worktree selector')
  }
  return callRuntimeRpc<GitSubmoduleTaskProgress | null>(
    context.target,
    'git.submoduleActionProgress',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), taskId },
    { timeoutMs: 15_000 }
  )
}

export async function cancelRuntimeGitSubmoduleTask(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  taskId: string
): Promise<{ cancelled: boolean }> {
  if (!context.worktreeId) {
    throw new Error('Missing worktree selector')
  }
  return callRuntimeRpc<{ cancelled: boolean }>(
    context.target,
    'git.submoduleActionCancel',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), taskId },
    { timeoutMs: 15_000 }
  )
}
