import type { GitRuntimeOptions } from '../../command-runner/git-runtime-options'
import { gitExecFileAsync } from '../../command-runner/git-exec-file'
import { stripCredentialsFromMessage } from '../../../../shared/git/remotes/git-remote-error'
import { stripAnsiEscapeSequences } from '../../../../shared/terminal/protocol/escape/ansi-escape-sequences'
import type { GitSubmoduleAction } from '../../../../shared/git/submodules/git-submodule-action'

const SUBMODULE_ACTION_ARGS: Record<GitSubmoduleAction, string[]> = {
  init: ['submodule', 'update', '--init', '--recursive'],
  update: ['submodule', 'update', '--recursive'],
  sync: ['submodule', 'sync', '--recursive']
}

/** Keep the checkout/submodule line; the remote-error mapping would turn it into pull advice. */
function submoduleActionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Submodule action failed.'
  }
  const lines = stripCredentialsFromMessage(stripAnsiEscapeSequences(error.message))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.at(-1) ?? 'Submodule action failed.'
}

export async function runSubmoduleAction(
  worktreePath: string,
  action: GitSubmoduleAction,
  options: GitRuntimeOptions = {}
): Promise<void> {
  try {
    await gitExecFileAsync(SUBMODULE_ACTION_ARGS[action], {
      ...options,
      cwd: worktreePath,
      admissionTier: 'interactive'
    })
  } catch (error) {
    throw new Error(submoduleActionErrorMessage(error), { cause: error })
  }
}
