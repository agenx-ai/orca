import type { FsChangeEvent } from '../../../../shared/file-watch/filesystem-change-event'
import type { WatcherProcessSubscription } from '../../../ipc/filesystem/watcher-process/parcel-watcher-process-subscription'
import type { WatcherProcessFailure } from '../../../ipc/filesystem/watcher-process/parcel-watcher-process-failure'
import type { PromiseSettlementWaiters } from '../../../../shared/concurrency/promise-settlement-waiters'

export type RuntimeFileWatchSubscriber = {
  onEvents: (events: FsChangeEvent[]) => void
  onTerminalError: (error: Error) => void
}

export type RuntimeRootWatch = {
  rootPath: string
  subscribers: Set<RuntimeFileWatchSubscriber>
  startWaiters: PromiseSettlementWaiters<void>
  subscription: WatcherProcessSubscription | null
  abortController: AbortController
  generation: number
  closed: boolean
  closePromise: Promise<void> | null
  terminalReleaseError: WatcherProcessFailure | null
}
