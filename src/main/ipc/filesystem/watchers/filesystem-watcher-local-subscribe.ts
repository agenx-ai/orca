import {
  WATCHER_IGNORE_DIRS,
  buildParcelWatcherIgnoreOptions,
  isWatcherSubscriptionPermissionError
} from './filesystem-watcher-ignore'
import { subscribeViaWatcherProcess } from '../watcher-process/parcel-watcher-process'
import type {
  WatcherProcessCallback,
  WatcherProcessHooks,
  WatcherProcessSubscription
} from '../watcher-process/parcel-watcher-process-subscription'

function localWatcherOptions(allowGitMarkers: boolean) {
  return {
    ...buildParcelWatcherIgnoreOptions(WATCHER_IGNORE_DIRS, { allowGitMarkers }),
    // Pin Windows backend to avoid Parcel's noisy Watchman probe.
    ...(process.platform === 'win32' ? { backend: 'windows' as const } : {})
  }
}

export function subscribeLocalWatcherProcess(
  rootPath: string,
  callback: WatcherProcessCallback,
  hooks: WatcherProcessHooks
): Promise<WatcherProcessSubscription> {
  const subscribe = (allowGitMarkers: boolean) =>
    subscribeViaWatcherProcess(rootPath, callback, localWatcherOptions(allowGitMarkers), hooks)
  return subscribe(true).catch((error) => {
    // An unreadable `.git` fails Parcel's initial crawl; keep the root watched without marker events.
    if (!isWatcherSubscriptionPermissionError(error)) {
      throw error
    }
    return subscribe(false)
  })
}
