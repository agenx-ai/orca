// Share high-churn exclusions across desktop and runtime watchers, following VS Code's recursive-watch defaults.
export const WATCHER_IGNORE_DIRS: string[] = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'target',
  '.venv',
  '__pycache__',
  '.dart_tool',
  '.gradle',
  '.turbo'
]

// FSEvents rejects all exclusions above eight paths; regex filtering covers the remaining names at every depth.
export const MACOS_FSEVENTS_EXCLUSION_PATH_LIMIT = 8

export type ParcelWatcherIgnoreOptions = {
  ignore?: string[]
  // Parcel forwards this native option despite omitting it from TS declarations (parcel-bundler/watcher#244).
  ignoreGlobs?: string[]
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

// `.git` marks a repository, so its own entry must stay visible; only its contents are pruned.
const REPOSITORY_MARKER_DIR = '.git'

function buildNestedDirectoryRegex(ignoreDirs: readonly string[], contentsOnly = false): string {
  const alternatives = ignoreDirs.map(escapeRegex).join('|')
  if (process.platform === 'win32') {
    const suffix = contentsOnly ? '[\\\\/][\\s\\S]*' : '(?:[\\\\/][\\s\\S]*)?'
    return `^(?:[^\\\\/]+[\\\\/])*(?:${alternatives})${suffix}$`
  }
  // Backslash is a valid POSIX filename character.
  const suffix = contentsOnly ? '/[\\s\\S]*' : '(?:/[\\s\\S]*)?'
  return `^(?:[^/]+/)*(?:${alternatives})${suffix}$`
}

function buildIgnoreGlobs(ignoreDirs: readonly string[], allowGitMarkers: boolean): string[] {
  const markerDirs = allowGitMarkers
    ? ignoreDirs.filter((dir) => dir === REPOSITORY_MARKER_DIR)
    : []
  const prunedDirs = ignoreDirs.filter((dir) => !allowGitMarkers || dir !== REPOSITORY_MARKER_DIR)
  const globs: string[] = []
  if (prunedDirs.length > 0) {
    globs.push(buildNestedDirectoryRegex(prunedDirs))
  }
  if (markerDirs.length > 0) {
    globs.push(buildNestedDirectoryRegex(markerDirs, true))
  }
  return globs
}

export function buildParcelWatcherIgnoreOptions(
  ignoreDirs: readonly string[],
  options: { allowGitMarkers?: boolean } = {}
): ParcelWatcherIgnoreOptions {
  if (ignoreDirs.length === 0) {
    return {}
  }
  const allowGitMarkers = options.allowGitMarkers !== false
  const ignoreGlobs = buildIgnoreGlobs(ignoreDirs, allowGitMarkers)
  if (process.platform !== 'darwin') {
    // Parcel 2.5.6 leading-** globs cause pathological std::regex lookaheads; one component regex avoids that cost.
    return { ignoreGlobs }
  }
  // `.git` stays out of native exclusions so a repository marker appearing or vanishing is still reported.
  const daemonExcludedDirs = ignoreDirs
    .filter((dir) => !allowGitMarkers || dir !== REPOSITORY_MARKER_DIR)
    .slice(0, MACOS_FSEVENTS_EXCLUSION_PATH_LIMIT)
  return {
    ignore: [...daemonExcludedDirs],
    // Plain exclusions cover only the root; regex also prunes nested generated directories.
    ignoreGlobs
  }
}

/** Parcel's initial crawl opens `.git`; an unreadable marker can fail the whole root, so callers retry pruned. */
export function isWatcherSubscriptionPermissionError(error: unknown): boolean {
  return error instanceof Error && /EACCES|EPERM|permission denied/i.test(error.message)
}
