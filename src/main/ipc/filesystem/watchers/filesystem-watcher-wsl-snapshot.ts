/** Snapshot protocol for the WSL find-based watcher: script, frame parsing and event diffing. */
import type { Event as WatcherEvent } from '@parcel/watcher'

const POLL_INTERVAL_SECONDS = 2
export const [SNAPSHOT_START, SNAPSHOT_END] = ['\0\x1e\0', '\0\x1f\0']
export const MAX_STREAM_BUFFER_CHARS = 10 * 1024 * 1024

type WslSnapshotEntry = {
  path: string
  type: string
  mtime: string
}

export type WslSnapshot = Map<string, WslSnapshotEntry>

function toWslUncPath(linuxPath: string, distro: string): string {
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`
}

function quoteSafeFindName(name: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error(`Unsupported WSL watcher ignore name: ${name}`)
  }
  return `'${name}'`
}

function buildPruneExpression(ignoreDirs: readonly string[]): string {
  if (ignoreDirs.length === 0) {
    return ''
  }
  const markerNames = ignoreDirs.filter((name) => name === '.git')
  const prunedNames = ignoreDirs.filter((name) => name !== '.git')
  const clauses: string[] = []
  if (markerNames.length > 0) {
    // Report the repository marker itself, but never descend into its contents.
    const names = markerNames.map((name) => `-name ${quoteSafeFindName(name)}`).join(' -o ')
    clauses.push(`\\( -type d \\( ${names} \\) -printf '%y\\t%T@\\t%p\\0' -prune \\)`)
  }
  if (prunedNames.length > 0) {
    const names = prunedNames.map((name) => `-name ${quoteSafeFindName(name)}`).join(' -o ')
    clauses.push(`\\( -type d \\( ${names} \\) -prune \\)`)
  }
  return `${clauses.join(' -o ')} -o`
}

export function buildSnapshotScript(ignoreDirs: readonly string[]): string {
  const prune = buildPruneExpression(ignoreDirs)
  return [
    'set -efu',
    'root=$1',
    'while :; do',
    "  printf '\\000\\036\\000'",
    '  if [ -d "$root" ]; then',
    `    find "$root" -mindepth 1 -maxdepth 2 ${prune} -printf '%y\\t%T@\\t%p\\0' 2>/dev/null || true`,
    '  fi',
    "  printf '\\000\\037\\000'",
    `  sleep ${POLL_INTERVAL_SECONDS} || exit 0`,
    'done'
  ].join('\n')
}

export function parseSnapshotFrame(frame: string, distro: string): WslSnapshot {
  const snapshot: WslSnapshot = new Map()
  for (const rawEntry of frame.split('\0')) {
    if (!rawEntry) {
      continue
    }
    const firstTab = rawEntry.indexOf('\t')
    const secondTab = firstTab === -1 ? -1 : rawEntry.indexOf('\t', firstTab + 1)
    if (firstTab <= 0 || secondTab <= firstTab + 1) {
      continue
    }
    const linuxPath = rawEntry.slice(secondTab + 1)
    if (!linuxPath.startsWith('/')) {
      continue
    }
    const entry: WslSnapshotEntry = {
      type: rawEntry.slice(0, firstTab),
      mtime: rawEntry.slice(firstTab + 1, secondTab),
      path: toWslUncPath(linuxPath, distro)
    }
    snapshot.set(entry.path, entry)
  }
  return snapshot
}

export function diffSnapshots(prev: WslSnapshot, next: WslSnapshot): WatcherEvent[] {
  const events: WatcherEvent[] = []

  for (const [entryPath, nextEntry] of next) {
    const prevEntry = prev.get(entryPath)
    if (!prevEntry) {
      events.push({ type: 'create', path: entryPath } as WatcherEvent)
      continue
    }
    if (prevEntry.type !== nextEntry.type) {
      events.push({ type: 'delete', path: entryPath } as WatcherEvent)
      events.push({ type: 'create', path: entryPath } as WatcherEvent)
      continue
    }
    if (prevEntry.mtime !== nextEntry.mtime) {
      events.push({ type: 'update', path: entryPath } as WatcherEvent)
    }
  }

  for (const entryPath of prev.keys()) {
    if (!next.has(entryPath)) {
      events.push({ type: 'delete', path: entryPath } as WatcherEvent)
    }
  }

  return events
}
