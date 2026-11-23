import { lstat, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Git dir for a checkout or linked worktree; symlinked `.git` markers follow the same rules as discovery. */
export async function resolveNestedGitDir(repoPath: string): Promise<string | null> {
  const dotGit = join(repoPath, '.git')
  const marker = await lstat(dotGit).catch(() => null)
  if (!marker) {
    return null
  }
  if (marker.isDirectory()) {
    return dotGit
  }
  if (marker.isSymbolicLink()) {
    const followed = await stat(dotGit).catch(() => null)
    if (followed?.isDirectory()) {
      return dotGit
    }
    if (!followed?.isFile()) {
      return null
    }
  } else if (!marker.isFile()) {
    return null
  }
  const content = await readFile(dotGit, 'utf8').catch(() => null)
  const firstLine = content?.split(/\r?\n/, 1)[0] ?? ''
  if (!firstLine.startsWith('gitdir:')) {
    return null
  }
  return resolve(repoPath, firstLine.slice('gitdir:'.length).trim())
}

/** A usable checkout has HEAD plus a reachable object store; linked worktrees keep objects in `commondir`. */
export async function isNestedGitCheckout(repoPath: string): Promise<boolean> {
  const gitDir = await resolveNestedGitDir(repoPath)
  if (!gitDir || (await stat(join(gitDir, 'HEAD')).catch(() => null))?.isFile() !== true) {
    return false
  }
  const commonDir = await readFile(join(gitDir, 'commondir'), 'utf8')
    .then((value) => resolve(gitDir, value.trim()))
    .catch(() => null)
  for (const directory of commonDir ? [gitDir, commonDir] : [gitDir]) {
    const objects = await stat(join(directory, 'objects')).catch(() => null)
    const refs = await stat(join(directory, 'refs')).catch(() => null)
    const packedRefs = await stat(join(directory, 'packed-refs')).catch(() => null)
    if (objects?.isDirectory() && (refs?.isDirectory() || packedRefs?.isFile())) {
      return true
    }
  }
  return false
}

export async function readNestedGitBranch(repoPath: string): Promise<string | null> {
  const gitDir = await resolveNestedGitDir(repoPath)
  if (!gitDir) {
    return null
  }
  try {
    const head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim()
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : null
  } catch {
    return null
  }
}
