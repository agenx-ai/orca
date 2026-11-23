import type { GitTagEntry } from '../../../../../shared/git/tags/git-tag'
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

export async function listRuntimeGitTags(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>
): Promise<GitTagEntry[]> {
  return callRuntimeRpc<GitTagEntry[]>(
    context.target,
    'git.tagList',
    { worktree: worktree(context) },
    { timeoutMs: 15_000 }
  )
}

export async function createRuntimeGitTag(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  name: string,
  message?: string
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.tagCreate',
    { worktree: worktree(context), name, ...(message ? { message } : {}) },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}

export async function deleteRuntimeGitTag(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  name: string
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.tagDelete',
    { worktree: worktree(context), name },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}
