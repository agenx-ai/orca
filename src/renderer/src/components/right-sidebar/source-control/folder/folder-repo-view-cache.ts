import type { FolderRepoViewMode } from './folder-repository-tree'

const MAX_CACHED_ROOTS = 20
const viewModes = new Map<string, FolderRepoViewMode>()

export function readFolderRepoViewMode(rootKey: string): FolderRepoViewMode {
  return viewModes.get(rootKey) ?? 'auto'
}

export function writeFolderRepoViewMode(rootKey: string, mode: FolderRepoViewMode): void {
  viewModes.delete(rootKey)
  viewModes.set(rootKey, mode)
  while (viewModes.size > MAX_CACHED_ROOTS) {
    const oldest = viewModes.keys().next().value
    if (oldest === undefined) {
      break
    }
    viewModes.delete(oldest)
  }
}

const collapsedDirsByRoot = new Map<string, ReadonlySet<string>>()

export function readFolderRepoCollapsedDirs(rootKey: string): ReadonlySet<string> {
  return collapsedDirsByRoot.get(rootKey) ?? new Set()
}

export function writeFolderRepoCollapsedDirs(
  rootKey: string,
  collapsed: ReadonlySet<string>
): void {
  collapsedDirsByRoot.delete(rootKey)
  collapsedDirsByRoot.set(rootKey, new Set(collapsed))
  while (collapsedDirsByRoot.size > MAX_CACHED_ROOTS) {
    const oldest = collapsedDirsByRoot.keys().next().value
    if (oldest === undefined) {
      break
    }
    collapsedDirsByRoot.delete(oldest)
  }
}
