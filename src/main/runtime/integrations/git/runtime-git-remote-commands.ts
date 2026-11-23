import type { GitRemoteEntry } from '../../../../shared/git/remotes/git-remote-entry'
import { requireRuntimeGitProvider, type RuntimeGitCommandHost } from './runtime-git-command-target'

export class RuntimeGitRemoteCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  async listRuntimeGitRemotes(worktreeSelector: string): Promise<GitRemoteEntry[]> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return requireRuntimeGitProvider(target).listRemotes(target.worktree.path)
  }

  async addRuntimeGitRemote(
    worktreeSelector: string,
    name: string,
    url: string
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).addRemote(target.worktree.path, name, url)
    return { ok: true }
  }

  async removeRuntimeGitRemote(worktreeSelector: string, name: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).removeRemote(target.worktree.path, name)
    return { ok: true }
  }

  async fetchRuntimeGitRemote(worktreeSelector: string, name: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await requireRuntimeGitProvider(target).fetchNamedRemote(target.worktree.path, name)
    return { ok: true }
  }
}
