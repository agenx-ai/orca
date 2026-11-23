import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  knownWslAutomountRoots,
  wslDrivePathUnderRoots
} from '../../wsl/filesystem/wsl-automount-root'
import { resolveNestedGitDir } from './nested-repo-head-branch'

function resolveGitdirPath(baseDir: string, link: string): string | null {
  if (process.platform === 'win32' && link.startsWith('/')) {
    return wslDrivePathUnderRoots(link, knownWslAutomountRoots())
  }
  return resolve(baseDir, link)
}

async function readGitdirLink(worktreePath: string): Promise<string | null> {
  const marker = await readFile(join(worktreePath, '.git'), 'utf8').catch(() => null)
  const firstLine = marker?.split(/\r?\n/, 1)[0] ?? ''
  if (!firstLine.startsWith('gitdir:')) {
    return null
  }
  return resolveGitdirPath(worktreePath, firstLine.slice('gitdir:'.length).trim())
}

function sameCanonicalPath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** Linked worktree roots of a main checkout; linked checkouts return nothing. */
export async function listLinkedWorktreePaths(repoPath: string): Promise<string[]> {
  const gitDir = await resolveNestedGitDir(repoPath)
  if (!gitDir) {
    return []
  }
  const commonDir = await readFile(join(gitDir, 'commondir'), 'utf8')
    .then((value) => resolve(gitDir, value.trim()))
    .catch(() => null)
  if (commonDir) {
    return []
  }
  const worktreesDir = join(gitDir, 'worktrees')
  const dirents = await readdir(worktreesDir, { withFileTypes: true }).catch(() => [])
  const paths: string[] = []
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) {
      continue
    }
    const adminDir = join(worktreesDir, dirent.name)
    const adminCanonical = await realpath(adminDir).catch(() => null)
    if (!adminCanonical) {
      continue
    }
    const marker = await readFile(join(adminCanonical, 'gitdir'), 'utf8').catch(() => null)
    const gitdirPath = marker?.trim()
    if (!gitdirPath) {
      continue
    }
    const resolvedGitdir = resolveGitdirPath(adminCanonical, gitdirPath)
    if (!resolvedGitdir) {
      continue
    }
    const worktreePath = dirname(resolvedGitdir)
    const directory = await stat(worktreePath).catch(() => null)
    if (!directory?.isDirectory()) {
      continue
    }
    // A stale admin entry can outlive a removed worktree whose path now holds another repo.
    const backlink = await readGitdirLink(worktreePath)
    const backlinkCanonical = backlink ? await realpath(backlink).catch(() => null) : null
    if (!backlinkCanonical || !sameCanonicalPath(backlinkCanonical, adminCanonical)) {
      continue
    }
    const canonical = await realpath(worktreePath).catch(() => null)
    if (canonical) {
      paths.push(canonical)
    }
  }
  return paths.sort()
}
