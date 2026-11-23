import { useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import { FOLDER_REPOS_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
import {
  selectCrossStoreFolderChildrenById,
  selectSidebarLineageParentIdentities
} from '@/store/slices/worktrees/metadata/cross-store-lineage-parents'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'
import {
  folderWorkspaceRepoId,
  getFolderWorkspaceWorktree
} from '../../../../../../shared/folder-workspaces/folder-workspace-worktree'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/rpc/targets/runtime-client-target'
import { getAttachedWorktreesForFolderWorkspace } from '../../folder-workspaces/folder-workspace-attached-worktrees'
import { FolderMultiRepoSourceControlPanel } from './folder-multi-repo-panel'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'

/** Owns the folder root's synthetic repo/worktree, which is not a catalog row. */
export default function FolderMultiRepoSourceControlPanelHost(): React.JSX.Element | null {
  const activeWorkspaceKey = useAppStore((state) => state.activeWorkspaceKey)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const executionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const folderWorkspaces = useAppStore(selectFolderWorkspaces)
  const worktreesByRepo = useAppStore(selectWorktreesByRepo)
  const workspaceLineageByChildKey = useAppStore((state) => state.workspaceLineageByChildKey)
  const worktreeLineageById = useAppStore((state) => state.worktreeLineageById)
  const lineageParentIdentities = useAppStore(selectSidebarLineageParentIdentities)
  const crossStoreChildrenByFolderId = useAppStore(selectCrossStoreFolderChildrenById)
  const resolution = useMemo(
    () =>
      getAttachedWorktreesForFolderWorkspace({
        activeWorkspaceKey,
        activeWorktreeId,
        executionHostId,
        folderWorkspaces,
        worktreesByRepo,
        workspaceLineageByChildKey,
        worktreeLineageById,
        lineageParentIdentities,
        crossStoreChildrenByFolderId
      }),
    [
      activeWorkspaceKey,
      activeWorktreeId,
      executionHostId,
      folderWorkspaces,
      worktreesByRepo,
      workspaceLineageByChildKey,
      worktreeLineageById,
      lineageParentIdentities,
      crossStoreChildrenByFolderId
    ]
  )
  const folder = resolution.folderWorkspace
  const folderWorktree = useMemo(
    () =>
      folder
        ? getFolderWorkspaceWorktree(folder, {
            hostId: folder.executionHostId ?? executionHostId ?? 'local',
            connectionId: folder.connectionId ?? null
          })
        : null,
    [executionHostId, folder]
  )
  const folderRepo = useMemo<Repo | null>(
    () =>
      folder
        ? {
            id: folderWorkspaceRepoId(folder.projectGroupId),
            path: folder.folderPath,
            displayName: folder.name,
            badgeColor: 'gray',
            addedAt: folder.createdAt,
            kind: 'folder',
            connectionId: folder.connectionId ?? null,
            executionHostId: folder.executionHostId ?? executionHostId ?? null,
            projectGroupId: folder.projectGroupId
          }
        : null,
    [executionHostId, folder]
  )
  const target = useMemo(
    () => (folderWorktree ? ipcOrRuntimeTargetForHostId(folderWorktree.hostId) : null),
    [folderWorktree]
  )
  const folderReposSupport = useRuntimeTargetCapability(target, FOLDER_REPOS_RUNTIME_CAPABILITY)
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const hostName = useAppStore((state) =>
    environmentId
      ? (state.runtimeEnvironments?.find((environment) => environment.id === environmentId)?.name ??
        null)
      : null
  )
  const t = useTranslate()
  if (!folder || !folderWorktree || !folderRepo) {
    return null
  }
  if (folderReposSupport === null) {
    return null
  }
  if (!folderReposSupport) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {t(
          'auto.components.right.sidebar.FolderRepoScm.hostUpgrade',
          'Update Orca on {{host}} to use multi-repository Source Control.',
          { host: hostName ?? 'the host' }
        )}
      </div>
    )
  }
  return (
    <FolderMultiRepoSourceControlPanel
      folderPath={folder.folderPath}
      folderRepo={folderRepo}
      folderWorktree={folderWorktree}
      target={target}
    />
  )
}
