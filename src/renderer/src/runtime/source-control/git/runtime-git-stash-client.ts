import type {
  GitStashCreateOptions,
  GitStashEntry
} from '../../../../../shared/git/stash/git-stash'
import type { RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from '../../rpc/calls/runtime-rpc-call'
import { toRuntimeWorktreeSelector } from '../../rpc/targets/runtime-worktree-selector'

const MUTATION_TIMEOUT_MS = 60_000

function worktree(context: Pick<RuntimeGitContext, 'worktreeId'>): string {
  if (!context.worktreeId) {
    throw new Error('Missing worktree selector')
  }
  return toRuntimeWorktreeSelector(context.worktreeId)
}

export async function listRuntimeGitStashes(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>
): Promise<GitStashEntry[]> {
  return callRuntimeRpc<GitStashEntry[]>(
    context.target,
    'git.stashList',
    { worktree: worktree(context) },
    { timeoutMs: 15_000 }
  )
}

export async function createRuntimeGitStash(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  options: GitStashCreateOptions
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.stashCreate',
    { worktree: worktree(context), ...options },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}

export async function applyRuntimeGitStash(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  index: number,
  pop: boolean
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.stashApply',
    { worktree: worktree(context), index, pop },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}

export async function dropRuntimeGitStash(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  index: number
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.stashDrop',
    { worktree: worktree(context), index },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}
