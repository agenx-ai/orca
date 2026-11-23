import type { GitRemoteEntry } from '../../../../../shared/git/remotes/git-remote-entry'
import type { RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from '../../rpc/calls/runtime-rpc-call'
import { toRuntimeWorktreeSelector } from '../../rpc/targets/runtime-worktree-selector'

const MUTATION_TIMEOUT_MS = 60_000
const FETCH_TIMEOUT_MS = 180_000

function worktree(context: Pick<RuntimeGitContext, 'worktreeId'>): string {
  if (!context.worktreeId) {
    throw new Error('Missing worktree selector')
  }
  return toRuntimeWorktreeSelector(context.worktreeId)
}

export async function listRuntimeGitRemotes(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>
): Promise<GitRemoteEntry[]> {
  return callRuntimeRpc<GitRemoteEntry[]>(
    context.target,
    'git.remoteList',
    { worktree: worktree(context) },
    { timeoutMs: 15_000 }
  )
}

export async function addRuntimeGitRemote(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  name: string,
  url: string
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.remoteAdd',
    { worktree: worktree(context), name, url },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}

export async function removeRuntimeGitRemote(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  name: string
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.remoteRemove',
    { worktree: worktree(context), name },
    { timeoutMs: MUTATION_TIMEOUT_MS }
  )
}

export async function fetchRuntimeGitRemote(
  context: Pick<RuntimeGitContext, 'target' | 'worktreeId'>,
  name: string
): Promise<void> {
  await callRuntimeRpc(
    context.target,
    'git.remoteFetch',
    { worktree: worktree(context), name },
    { timeoutMs: FETCH_TIMEOUT_MS }
  )
}
