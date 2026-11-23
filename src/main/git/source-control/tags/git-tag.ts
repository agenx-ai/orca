import type { GitTagEntry } from '../../../../shared/git/tags/git-tag'
import { isSafeGitTagName } from '../../../../shared/git/tags/git-tag'
import type { GitRuntimeOptions } from '../../command-runner/git-runtime-options'
import {
  gitOptionsForWorktree,
  gitReadOptionsForWorktree
} from '../../command-runner/git-runtime-options'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'

const FIELD = '\u001f'

function assertTagName(name: string): void {
  if (!isSafeGitTagName(name)) {
    throw new Error('Invalid tag name')
  }
}

export async function listGitTags(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitTagEntry[]> {
  const { stdout } = await gitExecFileAsync(
    [
      'for-each-ref',
      'refs/tags',
      `--format=%(refname:short)${FIELD}%(objectname)${FIELD}%(objecttype)${FIELD}%(contents:subject)`
    ],
    gitReadOptionsForWorktree(worktreePath, options)
  )
  const tags: GitTagEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line) {
      continue
    }
    const [name, commit, objectType, message] = line.split(FIELD)
    if (!name) {
      continue
    }
    // Only annotated tags carry their own message; a lightweight tag inherits the commit subject.
    tags.push({
      name,
      commit: commit ?? '',
      message: objectType === 'tag' ? message || null : null
    })
  }
  return tags
}

export async function createGitTag(
  worktreePath: string,
  name: string,
  message: string | undefined,
  options: GitRuntimeOptions = {}
): Promise<void> {
  assertTagName(name)
  const args = message ? ['tag', '-a', name, '-m', message] : ['tag', name]
  await gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
}

export async function deleteGitTag(
  worktreePath: string,
  name: string,
  options: GitRuntimeOptions = {}
): Promise<void> {
  assertTagName(name)
  await gitExecFileAsync(['tag', '-d', name], gitOptionsForWorktree(worktreePath, options))
}
