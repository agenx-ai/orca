import { realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import type { ExecutionHostId } from '../../../shared/execution-host/execution-host'
import type { FolderWorkspace } from '../../../shared/folder-workspaces/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../shared/folder-workspaces/folder-workspace-worktree'
import type { ParsedFolderNestedGitSelector } from '../../../shared/folder-workspaces/folder-nested-git'
import { isFolderNestedGitSelector } from '../../../shared/folder-workspaces/folder-nested-git'
import type { ResolvedWorktree } from './catalog/runtime-worktree-path-identity'
import type {
  WorkspaceSelectorCandidate,
  WorkspaceSelectorOptions
} from './catalog/workspace-selector-candidates'
import {
  isNestedGitCheckout,
  readNestedGitBranch
} from '../../git/repositories/nested-repo-head-branch'

/** Raw real-path containment: comparison-level NFC/case folding must not admit a distinct Linux directory. */
function isRawPathInsideOrEqual(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export function resolvedWorktreeFromFolderWorkspace(folder: FolderWorkspace): ResolvedWorktree {
  const worktree = folderWorkspaceToWorktree(folder)
  return {
    ...worktree,
    parentWorktreeId: null,
    childWorktreeIds: [],
    lineage: null,
    git: {
      path: worktree.path,
      head: worktree.head,
      branch: worktree.branch,
      isBare: worktree.isBare,
      isMainWorktree: worktree.isMainWorktree
    }
  }
}

/** Resolve through the folder root, which is also the path boundary for the nested repo. */
export async function resolveFolderNestedGitWorkspace(args: {
  selector: string
  parsed: ParsedFolderNestedGitSelector
  requiredHostId: ExecutionHostId | undefined
  resolveWorkspaceCandidate: (
    selector: string,
    options: WorkspaceSelectorOptions
  ) => Promise<WorkspaceSelectorCandidate>
}): Promise<ResolvedWorktree> {
  const { selector, parsed, requiredHostId, resolveWorkspaceCandidate } = args
  if (isFolderNestedGitSelector(parsed.folderSelector)) {
    throw new Error('selector_not_found')
  }
  const candidate = await resolveWorkspaceCandidate(parsed.folderSelector, {
    ...(requiredHostId === undefined ? {} : { requiredHostId }),
    matchFolders: true
  })
  if (candidate.kind !== 'folder') {
    throw new Error('selector_not_found')
  }
  const root = resolvedWorktreeFromFolderWorkspace(candidate.folder)
  const rootHostId =
    candidate.hostId ?? candidate.folder.executionHostId ?? root.hostId ?? undefined
  return resolveFolderNestedGitTarget({
    selector,
    parsed,
    root,
    ...(rootHostId === undefined ? {} : { rootHostId })
  })
}

/**
 * Resolve one repo inside a folder project without a catalog row. The folder root is the
 * security boundary: the target must stay inside its real path and carry a Git marker.
 */
export async function resolveFolderNestedGitTarget(args: {
  selector: string
  parsed: ParsedFolderNestedGitSelector
  root: ResolvedWorktree
  rootHostId?: ExecutionHostId
}): Promise<ResolvedWorktree> {
  const { selector, parsed, root, rootHostId } = args
  const segments = parsed.relativePath.split('/')
  if (
    isAbsolute(parsed.relativePath) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('selector_not_found')
  }

  const rootPath = await realpath(root.path)
  const candidatePath = resolve(rootPath, ...segments)
  if (!isRawPathInsideOrEqual(rootPath, candidatePath)) {
    throw new Error('selector_not_found')
  }
  const repoPath = await realpath(candidatePath)
  if (!isRawPathInsideOrEqual(rootPath, repoPath) || relative(rootPath, repoPath) === '') {
    throw new Error('selector_not_found')
  }
  if (!(await isNestedGitCheckout(repoPath))) {
    throw new Error('selector_not_found')
  }

  const branch = await readNestedGitBranch(repoPath)
  return {
    ...root,
    // Preserve the caller's selector as the synthetic key so status drafts and caches stay per-repo.
    id: selector,
    path: repoPath,
    displayName: basename(repoPath),
    branch: branch ?? '',
    head: '',
    isBare: false,
    isMainWorktree: false,
    parentWorktreeId: null,
    childWorktreeIds: [],
    lineage: null,
    ...(rootHostId === undefined ? {} : { hostId: rootHostId }),
    git: {
      path: repoPath,
      head: '',
      branch: branch ?? '',
      isBare: false,
      isMainWorktree: false
    }
  }
}
