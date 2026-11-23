import type {
  FsChangeEvent,
  FsChangedPayload
} from '../../../../../../shared/file-watch/filesystem-change-event'
import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathSeparators,
  relativePathInsideRoot
} from '../../../../../../shared/file-access/cross-platform-path'

function eventRelativePaths(event: FsChangeEvent, folderPath: string): string[] {
  const absolutePaths = event.oldAbsolutePath
    ? [event.absolutePath, event.oldAbsolutePath]
    : [event.absolutePath]
  const relativePaths = absolutePaths
    .map((path) => relativePathInsideRoot(folderPath, path))
    .filter((path): path is string => path !== null)
  if (!isWindowsAbsolutePathLike(folderPath)) {
    return relativePaths
  }
  return relativePaths.map((path) => normalizeRuntimePathSeparators(path))
}

function affectsKnownRepo(relativePath: string, knownRepoPaths: readonly string[]): boolean {
  return knownRepoPaths.some(
    (repoPath) => repoPath === relativePath || repoPath.startsWith(`${relativePath}/`)
  )
}

function isGitDirMarker(relativePath: string): boolean {
  return relativePath === '.git' || relativePath.endsWith('/.git')
}

/** The shared watch prunes `.git` contents, so checkout layout changes surface as folder create/delete/move events. */
function isRepoLayoutChange(
  event: FsChangeEvent,
  folderPath: string,
  knownRepoPaths: readonly string[]
): boolean {
  if (event.kind === 'overflow') {
    return true
  }
  const relativePaths = eventRelativePaths(event, folderPath)
  if (relativePaths.length === 0) {
    return false
  }
  if (relativePaths.some((path) => path === '.gitmodules' || path.endsWith('/.gitmodules'))) {
    return true
  }
  if (event.kind !== 'create' && event.kind !== 'rename' && event.kind !== 'delete') {
    return false
  }
  return (
    relativePaths.some(isGitDirMarker) ||
    event.isDirectory === true ||
    relativePaths.some((path) => affectsKnownRepo(path, knownRepoPaths))
  )
}

export function payloadChangesRepoLayout(
  payload: FsChangedPayload,
  folderPath: string,
  knownRepoPaths: readonly string[]
): boolean {
  return payload.events.some((event) => isRepoLayoutChange(event, folderPath, knownRepoPaths))
}

/** A slow `git init` can finish after the first rescan; schedule one more look at a new marker. */
export function payloadCreatesGitMarker(payload: FsChangedPayload, folderPath: string): boolean {
  return payload.events.some(
    (event) =>
      (event.kind === 'create' || event.kind === 'rename') &&
      eventRelativePaths(event, folderPath).some(isGitDirMarker)
  )
}
