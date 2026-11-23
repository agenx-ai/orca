/** Poll inside WSL so distro shutdown kills the watcher instead of Windows UNC polling repeatedly waking it. */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { WebContents } from 'electron'
import { queueWatcherEvents } from './filesystem-watcher-event-batch'
import { parseWslUncPath } from '../../../../shared/file-access/wsl-paths'
import { createWslWatcherProcessExit, createWslWatcherStartup } from './wsl-watcher-process-exit'
import * as watcherChildRegistry from '../watcher-process/child-lifecycle/parcel-watcher-child-registry'
import { createDebouncedBatch, type DebouncedBatch } from './filesystem-watcher-batch-control'
import { spawnWslWatcherProcess } from './wsl-watcher-spawn'
import {
  MAX_STREAM_BUFFER_CHARS,
  SNAPSHOT_END,
  SNAPSHOT_START,
  buildSnapshotScript,
  diffSnapshots,
  parseSnapshotFrame,
  type WslSnapshot
} from './filesystem-watcher-wsl-snapshot'

export type WatcherSubscription = {
  unsubscribe(): Promise<void>
}

export type WatchedRoot = {
  subscription: WatcherSubscription
  listeners: Map<number, WebContents>
  batch: DebouncedBatch
  // Renderer paths must use real spelling, never folded comparison keys.
  rootPath: string
}

export type WslWatcherDeps = {
  ignoreDirs: string[]
  scheduleBatchFlush: (root: WatchedRoot) => void
  watchedRoots: Map<string, WatchedRoot>
  /** The child died on its own, e.g. the distro stopped; runs before the overflow refresh. */
  onUnexpectedStop?: (root: WatchedRoot, distro: string) => void
}

const STARTUP_TIMEOUT_MS = 10_000

function markOverflowWithoutUncStat(root: WatchedRoot): void {
  if (root.batch.timer) {
    clearTimeout(root.batch.timer)
    root.batch.timer = null
  }
  root.batch.events = []
  root.batch.overflowed = true
}

export async function createWslWatcher(
  rootKey: string,
  worktreePath: string,
  deps: WslWatcherDeps,
  signal?: AbortSignal
): Promise<WatchedRoot> {
  if (signal?.aborted) {
    throw new DOMException('WSL watcher subscription aborted', 'AbortError')
  }

  const wsl = parseWslUncPath(worktreePath)
  if (!wsl) {
    throw new Error(`Not a WSL path: ${worktreePath}`)
  }
  const { distro, linuxPath } = wsl

  const root: WatchedRoot = {
    subscription: null!,
    listeners: new Map(),
    batch: createDebouncedBatch(),
    rootPath: worktreePath
  }

  let disposed = false
  let prevSnapshot: WslSnapshot | null = null
  let stopped = false
  let streamBuffer = ''
  const stdoutDecoder = new StringDecoder('utf8')
  const stderrDecoder = new StringDecoder('utf8')
  let stderrTail = ''

  const startup = createWslWatcherStartup()

  function signalWatcherStopped(): void {
    if (stopped) {
      return
    }
    if (!prevSnapshot) {
      return
    }
    stopped = true
    // Stop queued UNC stats without cancelling the conservative overflow refresh.
    root.batch.statAbortController.abort()
    // First: the overflow refresh below reads the root, which would boot a just-stopped distro.
    deps.onUnexpectedStop?.(root, distro)
    markOverflowWithoutUncStat(root)
    deps.scheduleBatchFlush(root)
    deps.watchedRoots.delete(rootKey)
  }

  function ingestFrame(frame: string): void {
    if (root.batch.cancelled) {
      return
    }
    const nextSnapshot = parseSnapshotFrame(frame, distro)
    if (!prevSnapshot) {
      prevSnapshot = nextSnapshot
      startup.settle()
      return
    }
    const events = diffSnapshots(prevSnapshot, nextSnapshot)
    prevSnapshot = nextSnapshot

    if (events.length > 0) {
      queueWatcherEvents(root.batch, events)
      deps.scheduleBatchFlush(root)
    }
  }

  function drainFrames(): void {
    while (true) {
      const start = streamBuffer.indexOf(SNAPSHOT_START)
      if (start === -1) {
        streamBuffer = streamBuffer.slice(-(SNAPSHOT_START.length - 1))
        return
      }
      if (start > 0) {
        streamBuffer = streamBuffer.slice(start)
      }
      const end = streamBuffer.indexOf(SNAPSHOT_END, SNAPSHOT_START.length)
      if (end === -1) {
        if (streamBuffer.length > MAX_STREAM_BUFFER_CHARS) {
          streamBuffer = ''
          markOverflowWithoutUncStat(root)
          deps.scheduleBatchFlush(root)
        }
        return
      }
      const frame = streamBuffer.slice(SNAPSHOT_START.length, end)
      streamBuffer = streamBuffer.slice(end + SNAPSHOT_END.length)
      ingestFrame(frame)
    }
  }

  let child: ChildProcessWithoutNullStreams
  const releaseChildReservation = watcherChildRegistry.reserveWatcherChild()
  if (!releaseChildReservation) {
    throw new watcherChildRegistry.WatcherChildCapacityError()
  }
  try {
    child = spawnWslWatcherProcess(distro, linuxPath)
  } catch (error) {
    releaseChildReservation()
    throw error instanceof Error ? error : new Error(String(error))
  }

  // Release process capacity only on the same physical-exit proof required for destructive cleanup.
  const processExit = createWslWatcherProcessExit(child, worktreePath, releaseChildReservation)

  const onAbort = (): void => {
    startup.settle(new DOMException('WSL watcher subscription aborted', 'AbortError'))
    processExit.requestStopBestEffort()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  const startupTimer = setTimeout(() => {
    startup.settle(new Error(`Timed out starting WSL watcher for ${worktreePath}`))
    processExit.requestStopBestEffort()
  }, STARTUP_TIMEOUT_MS)

  child.stdin.on('error', (error) => {
    // Early WSL exit can break stdin; reject setup on EPIPE instead of crashing on a stream error.
    if (!startup.settled) {
      startup.settle(error)
    }
  })

  child.stdout.on('data', (chunk: Buffer) => {
    if (disposed) {
      return
    }
    streamBuffer += stdoutDecoder.write(chunk)
    drainFrames()
  })

  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + stderrDecoder.write(chunk)).slice(-4096)
  })

  child.stdout.on('error', (error) => {
    if (!startup.settled) {
      startup.settle(error)
      return
    }
    if (!disposed) {
      signalWatcherStopped()
    }
  })

  child.stderr.on('error', () => {
    // Ignore diagnostic stream failures; stdout/close determine watcher state.
  })

  child.once('error', (error) => {
    // Failed spawns without a PID need no exit wait; spawned children still require close proof.
    if (child.pid === undefined) {
      processExit.markPhysicalExit()
    }
    if (!startup.settled) {
      startup.settle(error)
      return
    }
    if (!disposed) {
      signalWatcherStopped()
    }
  })

  child.once('close', (code, signal) => {
    processExit.markPhysicalExit()
    if (!startup.settled) {
      const suffix = stderrTail.trim() ? `: ${stderrTail.trim()}` : ''
      startup.settle(
        new Error(`WSL watcher exited before first snapshot (${code ?? signal})${suffix}`)
      )
      return
    }
    if (!disposed) {
      signalWatcherStopped()
    }
  })

  try {
    child.stdin.end(buildSnapshotScript(deps.ignoreDirs))
    await startup.ready
  } catch (error) {
    // Destructive cancellation must retain ownership until WSL confirms physical exit.
    startup.settle(error instanceof Error ? error : new Error(String(error)))
    await startup.ready.catch(() => undefined)
    await processExit.stopAndWait()
    throw error
  } finally {
    clearTimeout(startupTimer)
    signal?.removeEventListener('abort', onAbort)
  }

  root.subscription = {
    unsubscribe: async () => {
      disposed = true
      await processExit.stopAndWait()
    }
  }

  return root
}
