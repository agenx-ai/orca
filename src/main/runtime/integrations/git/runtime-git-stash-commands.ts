import type { GitStashCreateOptions, GitStashEntry } from '../../../../shared/git/stash/git-stash'
import { requireRuntimeGitProvider, type RuntimeGitCommandHost } from './runtime-git-command-target'

type StashProvider = ReturnType<typeof requireRuntimeGitProvider>

/** A commit id identifies the entry even if other stashes changed the index since the list was read. */
async function resolveStashIndex(
  provider: StashProvider,
  worktreePath: string,
  index: number,
  commit: string | undefined
): Promise<number> {
  if (!commit) {
    return index
  }
  const entries = await provider.listStashes(worktreePath)
  const match = entries.find((entry) => entry.commit === commit)
  if (!match) {
    throw new Error('Stash entry no longer exists; refresh stashes and try again.')
  }
  return match.index
}

export class RuntimeGitStashCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  async listRuntimeGitStashes(worktreeSelector: string): Promise<GitStashEntry[]> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return requireRuntimeGitProvider(target).listStashes(target.worktree.path)
  }

  async createRuntimeGitStash(
    worktreeSelector: string,
    options: GitStashCreateOptions
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).createStash(target.worktree.path, options)
    return { ok: true }
  }

  async applyRuntimeGitStash(
    worktreeSelector: string,
    index: number,
    pop: boolean,
    commit?: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const provider = requireRuntimeGitProvider(target)
    const resolvedIndex = await resolveStashIndex(provider, target.worktree.path, index, commit)
    await provider.applyStash(target.worktree.path, resolvedIndex, { pop })
    return { ok: true }
  }

  async dropRuntimeGitStash(
    worktreeSelector: string,
    index: number,
    commit?: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const provider = requireRuntimeGitProvider(target)
    const resolvedIndex = await resolveStashIndex(provider, target.worktree.path, index, commit)
    await provider.dropStash(target.worktree.path, resolvedIndex)
    return { ok: true }
  }
}
