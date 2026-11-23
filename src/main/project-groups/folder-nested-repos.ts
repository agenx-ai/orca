import { lstat, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import type { FolderNestedRepo } from '../../shared/folder-workspaces/folder-nested-git'
import {
  isNestedGitCheckout,
  readNestedGitBranch
} from '../git/repositories/nested-repo-head-branch'
import { listLinkedWorktreePaths } from '../git/repositories/nested-worktree-paths'
import {
  listSubmodulePaths,
  resolveSubmoduleWorktreePath
} from '../git/source-control/submodules/submodule-paths'
import { nestedRepoPathKey } from './nested-repo-scan-rules'

/**
 * Initialized submodules become child rows of their parent repository.
 * detectSubmodulesLimit caps each parent; maxRepos still caps the whole folder.
 */
export async function collectSubmoduleRepos(args: {
  folderPath: string
  repos: FolderNestedRepo[]
  limit: number
  maxRepos: number
  ignored: ReadonlySet<string>
  ignoredAbsolute: ReadonlySet<string>
  signal?: AbortSignal
}): Promise<{ repos: FolderNestedRepo[]; truncated: boolean }> {
  const repos = [...args.repos]
  const indexByKey = new Map(
    repos.map((repo, index) => [nestedRepoPathKey(repo.relativePath), index] as const)
  )
  let index = 0
  let truncated = false
  while (index < repos.length) {
    if (args.signal?.aborted) {
      break
    }
    const parent = repos[index++]!
    const parentPath = join(args.folderPath, ...parent.relativePath.split('/'))
    const gitmodules = join(parentPath, '.gitmodules')
    const marker = await lstat(gitmodules).catch(() => null)
    if (!marker?.isFile()) {
      continue
    }
    // Uninitialized submodules have no child checkout but still offer init/update/sync.
    repos[index - 1] = { ...parent, hasSubmodules: true }
    if (args.limit <= 0) {
      continue
    }
    const parentCanonical = await realpath(parentPath).catch(() => null)
    if (!parentCanonical) {
      continue
    }
    let detected = 0
    for (const submodulePath of await listSubmodulePaths(parentPath)) {
      if (args.signal?.aborted) {
        break
      }
      if (detected >= args.limit) {
        break
      }
      let resolved: string
      try {
        resolved = resolveSubmoduleWorktreePath(parentPath, submodulePath)
      } catch {
        continue
      }
      const canonical = await realpath(resolved).catch(() => null)
      if (!canonical) {
        continue
      }
      const inside = relative(parentCanonical, canonical)
      if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) {
        continue
      }
      if (!(await isNestedGitCheckout(canonical))) {
        continue
      }
      const suffix = inside.split(sep).filter(Boolean).join('/')
      const relativePath = `${parent.relativePath}/${suffix}`
      const key = nestedRepoPathKey(relativePath)
      if (args.ignored.has(key)) {
        continue
      }
      if (args.ignoredAbsolute.size > 0 && args.ignoredAbsolute.has(canonical)) {
        continue
      }
      detected++
      const existingIndex = indexByKey.get(key)
      if (existingIndex !== undefined) {
        // A git.scanRepositories entry can name the submodule before the parent is processed.
        const existing = repos[existingIndex]!
        if (!existing.isSubmodule) {
          repos[existingIndex] = {
            ...existing,
            depth: parent.depth + 1,
            isSubmodule: true,
            parentRelativePath: parent.relativePath
          }
        }
        continue
      }
      if (repos.length >= args.maxRepos) {
        truncated = true
        break
      }
      indexByKey.set(key, repos.length)
      repos.push({
        relativePath,
        displayName: basename(canonical),
        depth: parent.depth + 1,
        branch: await readNestedGitBranch(canonical),
        isSubmodule: true,
        parentRelativePath: parent.relativePath
      })
    }
  }
  return { repos, truncated }
}

/**
 * Linked worktrees become child rows of their main repository.
 * Only worktrees inside the folder are addressable by nested selectors.
 */
export async function collectWorktreeRepos(args: {
  folderPath: string
  repos: FolderNestedRepo[]
  limit: number
  maxRepos: number
  ignored: ReadonlySet<string>
  ignoredAbsolute: ReadonlySet<string>
  signal?: AbortSignal
}): Promise<{ repos: FolderNestedRepo[]; truncated: boolean }> {
  const repos = [...args.repos]
  const indexByKey = new Map(
    repos.map((repo, index) => [nestedRepoPathKey(repo.relativePath), index] as const)
  )
  let truncated = false
  for (let index = 0; index < repos.length; index++) {
    if (args.signal?.aborted) {
      break
    }
    const parent = repos[index]!
    if (parent.isWorktree) {
      continue
    }
    const parentPath = join(args.folderPath, ...parent.relativePath.split('/'))
    const parentCanonical = await realpath(parentPath).catch(() => null)
    if (!parentCanonical) {
      continue
    }
    let detected = 0
    for (const worktreePath of await listLinkedWorktreePaths(parentPath)) {
      if (args.signal?.aborted) {
        break
      }
      const canonical = await realpath(worktreePath).catch(() => null)
      if (!canonical || canonical === parentCanonical) {
        continue
      }
      const inside = relative(args.folderPath, canonical)
      if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) {
        continue
      }
      if (!(await isNestedGitCheckout(canonical))) {
        continue
      }
      const relativePath = inside.split(sep).filter(Boolean).join('/')
      const key = nestedRepoPathKey(relativePath)
      if (args.ignored.has(key)) {
        continue
      }
      if (args.ignoredAbsolute.size > 0 && args.ignoredAbsolute.has(canonical)) {
        continue
      }
      const beyondLimit = detected >= args.limit
      detected++
      if (beyondLimit) {
        truncated = true
        continue
      }
      const existingIndex = indexByKey.get(key)
      if (existingIndex !== undefined) {
        const existing = repos[existingIndex]!
        if (!existing.isSubmodule && !existing.isWorktree) {
          repos[existingIndex] = {
            ...existing,
            depth: parent.depth + 1,
            isWorktree: true,
            parentRelativePath: parent.relativePath
          }
        }
        continue
      }
      if (repos.length >= args.maxRepos) {
        truncated = true
        continue
      }
      indexByKey.set(key, repos.length)
      repos.push({
        relativePath,
        displayName: basename(canonical),
        depth: parent.depth + 1,
        branch: await readNestedGitBranch(canonical),
        isWorktree: true,
        parentRelativePath: parent.relativePath
      })
    }
  }
  return { repos, truncated }
}
