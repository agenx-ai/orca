import type { GitRemoteEntry } from '../../../shared/git/remotes/git-remote-entry'
import {
  isSafeGitRemoteName,
  isSafeGitRemoteUrl
} from '../../../shared/git/remotes/git-remote-entry'
import type { GitRuntimeOptions } from '../command-runner/git-runtime-options'
import {
  gitOptionsForWorktree,
  gitReadOptionsForWorktree
} from '../command-runner/git-runtime-options'
import { gitExecFileAsync } from '../command-runner/git-exec-file'

const REMOTE_LINE = /^(\S+)\t(.+) \((fetch|push)\)$/

function assertRemoteName(name: string): void {
  if (!isSafeGitRemoteName(name)) {
    throw new Error('Invalid remote name')
  }
}

export async function listGitRemotes(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitRemoteEntry[]> {
  const { stdout } = await gitExecFileAsync(
    ['remote', '-v'],
    gitReadOptionsForWorktree(worktreePath, options)
  )
  const byName = new Map<string, GitRemoteEntry>()
  for (const line of stdout.split('\n')) {
    const match = REMOTE_LINE.exec(line)
    if (!match) {
      continue
    }
    const [, name, url, kind] = match
    const entry = byName.get(name) ?? { name, fetchUrl: null, pushUrl: null }
    if (kind === 'fetch') {
      entry.fetchUrl = url
    } else {
      entry.pushUrl = url
    }
    byName.set(name, entry)
  }
  return [...byName.values()]
}

export async function addGitRemote(
  worktreePath: string,
  name: string,
  url: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  assertRemoteName(name)
  if (!isSafeGitRemoteUrl(url)) {
    throw new Error('Invalid remote URL')
  }
  await gitExecFileAsync(['remote', 'add', name, url], gitOptionsForWorktree(worktreePath, options))
}

export async function removeGitRemote(
  worktreePath: string,
  name: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  assertRemoteName(name)
  await gitExecFileAsync(['remote', 'remove', name], gitOptionsForWorktree(worktreePath, options))
}

export async function fetchGitRemote(
  worktreePath: string,
  name: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  assertRemoteName(name)
  await gitExecFileAsync(['fetch', name], gitOptionsForWorktree(worktreePath, options))
}
