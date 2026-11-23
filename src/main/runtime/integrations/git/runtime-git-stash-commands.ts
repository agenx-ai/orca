import type { GitStashCreateOptions, GitStashEntry } from '../../../../shared/git/stash/git-stash'
import { requireRuntimeGitProvider, type RuntimeGitCommandHost } from './runtime-git-command-target'

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
    pop: boolean
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).applyStash(target.worktree.path, index, { pop })
    return { ok: true }
  }

  async dropRuntimeGitStash(worktreeSelector: string, index: number): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).dropStash(target.worktree.path, index)
    return { ok: true }
  }
}
