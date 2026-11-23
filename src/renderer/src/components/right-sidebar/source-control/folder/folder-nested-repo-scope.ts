import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { ExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import {
  createFolderNestedGitSelector,
  folderNestedRepoId,
  folderNestedRepoPath,
  type FolderNestedRepo
} from '../../../../../../shared/folder-workspaces/folder-nested-git'
import type { WorktreeGitCopy } from '@/lib/workspace/ownership/worktree-git-copy'
import type { SourceControlScope } from '../panel/worktree-scope'

export type FolderNestedRepoScopeEntry = {
  repo: FolderNestedRepo
  scope: SourceControlScope
}

/** One scanned folder repo as a source-control scope; nested repos have no catalog rows. */
export function folderNestedRepoScope(args: {
  folderRepo: Repo
  folderWorktree: Worktree
  folderPath: string
  repo: FolderNestedRepo
  target: RuntimeClientTarget | null
  executionHostId: ExecutionHostId
}): SourceControlScope | null {
  const { folderRepo, folderWorktree, folderPath, repo: nestedRepo, target, executionHostId } = args
  if (!target) {
    return null
  }
  const folderSelector = folderWorktree.id
  const nestedSelector = createFolderNestedGitSelector(folderSelector, nestedRepo.relativePath)
  const absolutePath = folderNestedRepoPath(folderPath, nestedRepo.relativePath)
  const repo: Repo = {
    ...folderRepo,
    id: folderNestedRepoId(folderSelector, nestedRepo.relativePath),
    path: absolutePath,
    displayName: nestedRepo.displayName,
    kind: 'git',
    connectionId: folderRepo.connectionId ?? null,
    executionHostId
  }
  const worktree: Worktree = {
    ...folderWorktree,
    id: nestedSelector,
    repoId: repo.id,
    path: absolutePath,
    displayName: nestedRepo.displayName,
    branch: nestedRepo.branch ?? '',
    head: '',
    isBare: false,
    isMainWorktree: false,
    hostId: executionHostId
  }
  const gitCopy: WorktreeGitCopy = {
    worktreeId: nestedSelector,
    hostId: executionHostId,
    connectionId: repo.connectionId ?? undefined,
    transport: target
  }
  return {
    worktreeId: nestedSelector,
    repoId: repo.id,
    executionHostId,
    worktree,
    repo,
    placementWorkspaceId: folderWorktree.id,
    attachedAt: folderWorktree.createdAt ?? 0,
    gitCopy
  }
}
