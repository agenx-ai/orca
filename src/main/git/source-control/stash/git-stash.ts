import type { GitStashCreateOptions, GitStashEntry } from '../../../../shared/git/stash/git-stash'
import type { GitRuntimeOptions } from '../../command-runner/git-runtime-options'
import {
  gitOptionsForWorktree,
  gitReadOptionsForWorktree
} from '../../command-runner/git-runtime-options'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'

const FIELD = '\u001f'
const STASH_SELECTOR = /^stash@\{(\d+)\}$/

function messageBranch(message: string): string | null {
  const match = /^(?:WIP on|On) ([^:]+):/.exec(message)
  return match?.[1] ?? null
}

function stashRef(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Invalid stash index')
  }
  return `stash@{${index}}`
}

export async function listGitStashes(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitStashEntry[]> {
  const { stdout } = await gitExecFileAsync(
    ['stash', 'list', `--format=%gd${FIELD}%H${FIELD}%ci${FIELD}%gs`],
    gitReadOptionsForWorktree(worktreePath, options)
  )
  const entries: GitStashEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line) {
      continue
    }
    const [selector, commit, date, message] = line.split(FIELD)
    if (!selector) {
      continue
    }
    const index = STASH_SELECTOR.exec(selector)?.[1]
    if (index === undefined) {
      continue
    }
    entries.push({
      index: Number(index),
      selector,
      commit: commit ?? '',
      message: message ?? '',
      branch: messageBranch(message ?? ''),
      date: date || null
    })
  }
  return entries
}

export async function createGitStash(
  worktreePath: string,
  stash: GitStashCreateOptions,
  options: GitRuntimeOptions = {}
): Promise<void> {
  const args = ['stash', 'push']
  if (stash.includeUntracked) {
    args.push('--include-untracked')
  }
  if (stash.message) {
    args.push('-m', stash.message)
  }
  await gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
}

export async function applyGitStash(
  worktreePath: string,
  index: number,
  pop: boolean,
  options: GitRuntimeOptions = {}
): Promise<void> {
  await gitExecFileAsync(
    ['stash', pop ? 'pop' : 'apply', stashRef(index)],
    gitOptionsForWorktree(worktreePath, options)
  )
}

export async function dropGitStash(
  worktreePath: string,
  index: number,
  options: GitRuntimeOptions = {}
): Promise<void> {
  await gitExecFileAsync(
    ['stash', 'drop', stashRef(index)],
    gitOptionsForWorktree(worktreePath, options)
  )
}
