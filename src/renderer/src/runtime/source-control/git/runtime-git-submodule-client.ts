import type { GitSubmoduleAction } from '../../../../../shared/git/submodules/git-submodule-action'
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
