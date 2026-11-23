import {
  WATCHER_IGNORE_DIRS,
  buildParcelWatcherIgnoreOptions,
  isWatcherSubscriptionPermissionError
} from '../../../ipc/filesystem/watchers/filesystem-watcher-ignore'
import { subscribeViaRuntimeWatcherProcess } from '../../../ipc/filesystem/watcher-process/parcel-watcher-process'
import type {
  WatcherProcessCallback,
  WatcherProcessHooks,
  WatcherProcessSubscription
} from '../../../ipc/filesystem/watcher-process/parcel-watcher-process-subscription'

export function subscribeRuntimeFileWatchProcess(
  rootPath: string,
  callback: WatcherProcessCallback,
  hooks: WatcherProcessHooks
): Promise<WatcherProcessSubscription> {
  const subscribe = (allowGitMarkers: boolean) =>
    subscribeViaRuntimeWatcherProcess(
      rootPath,
      callback,
      buildParcelWatcherIgnoreOptions(WATCHER_IGNORE_DIRS, { allowGitMarkers }),
      hooks
    )
  return subscribe(true).catch((error) => {
    // An unreadable `.git` fails Parcel's initial crawl; keep the root watched without marker events.
    if (!isWatcherSubscriptionPermissionError(error)) {
      throw error
    }
    return subscribe(false)
  })
}
