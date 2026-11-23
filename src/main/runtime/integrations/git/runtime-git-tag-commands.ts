import type { GitTagEntry } from '../../../../shared/git/tags/git-tag'
import { requireRuntimeGitProvider, type RuntimeGitCommandHost } from './runtime-git-command-target'

export class RuntimeGitTagCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  async listRuntimeGitTags(worktreeSelector: string): Promise<GitTagEntry[]> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return requireRuntimeGitProvider(target).listTags(target.worktree.path)
  }

  async createRuntimeGitTag(
    worktreeSelector: string,
    name: string,
    message?: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).createTag(target.worktree.path, name, message)
    return { ok: true }
  }

  async deleteRuntimeGitTag(worktreeSelector: string, name: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).deleteTag(target.worktree.path, name)
    return { ok: true }
  }
}
