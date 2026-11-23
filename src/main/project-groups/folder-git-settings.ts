import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, type ParseError } from 'jsonc-parser'
import { isAbsoluteRuntimePath } from '../../shared/remote-runtime/ephemeral-vm-recipes/ephemeral-vm-recipes'
import { nestedRepoPathKey } from './nested-repo-scan-rules'

const SETTINGS_FILE = join('.vscode', 'settings.json')
const DEFAULT_MAX_DEPTH = 3
const DEFAULT_AUTOFETCH_PERIOD = 180
const MIN_AUTOFETCH_PERIOD = 60

export type FolderGitScanSettings = {
  scanEnabled: boolean
  /** -1 means unlimited, matching git.repositoryScanMaxDepth. */
  maxDepth: number
  ignoredFolders: readonly string[]
  /** Scan roots relative to the folder root, using `/` separators. */
  scanRepositories: readonly string[]
  /** Repositories to drop, relative to the folder root and normalized to `/`. */
  ignoredRelativeRepositories: readonly string[]
  /** Repositories to drop, kept absolute for realpath comparison. */
  ignoredAbsoluteRepositories: readonly string[]
  /** git.detectSubmodules: list initialized submodules inside detected repositories. */
  detectSubmodules: boolean
  /** git.detectSubmodulesLimit: maximum submodules read per repository. */
  detectSubmodulesLimit: number
  /** git.detectWorktrees: list linked worktrees inside detected repositories. */
  detectWorktrees: boolean
  /** git.detectWorktreesLimit: maximum linked worktrees read per repository. */
  detectWorktreesLimit: number
  /** git.autorefresh: poll the selected nested repository for status changes. */
  autorefresh: boolean
  /** git.autofetch: false disables background fetches; 'all' fetches every remote. */
  autofetch: boolean | 'all'
  /** git.autofetchPeriod: seconds between automatic fetches; raised to VS Code's 60s minimum. */
  autofetchPeriod: number
  /** git.ignoreSubmodules: how nested repo status treats submodule changes; null keeps Git defaults. */
  ignoreSubmodules: 'all' | 'dirty' | 'untracked' | null
  invalid: boolean
}

export const DEFAULT_FOLDER_GIT_SCAN_SETTINGS: FolderGitScanSettings = {
  scanEnabled: true,
  maxDepth: DEFAULT_MAX_DEPTH,
  ignoredFolders: [],
  scanRepositories: [],
  ignoredRelativeRepositories: [],
  ignoredAbsoluteRepositories: [],
  detectSubmodules: true,
  detectSubmodulesLimit: 10,
  detectWorktrees: false,
  detectWorktreesLimit: 50,
  autorefresh: true,
  autofetch: false,
  autofetchPeriod: 180,
  ignoreSubmodules: null,
  invalid: false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

/**
 * Resolves a folder-relative setting like path.join does, rejecting absolute paths and escapes.
 * Matching follows VS Code's case-insensitive comparison on Windows.
 */
function normalizeRelativePath(value: string): string[] | null {
  if (isAbsoluteRuntimePath(value)) {
    return null
  }
  const segments: string[] = []
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return null
      }
      segments.pop()
      continue
    }
    if (segment === '.git') {
      return null
    }
    segments.push(segment)
  }
  return segments.length > 0 ? segments : null
}

function relativePathKey(segments: readonly string[]): string {
  return nestedRepoPathKey(segments.join('/'))
}

function readScanRepositories(value: unknown): string[] {
  return readStringArray(value).flatMap((entry) => {
    const segments = normalizeRelativePath(entry)
    return segments ? [relativePathKey(segments)] : []
  })
}

function readIgnoredRepositories(value: unknown): {
  relative: string[]
  absolute: string[]
} {
  const relative: string[] = []
  const absolute: string[] = []
  for (const entry of readStringArray(value)) {
    if (isAbsoluteRuntimePath(entry)) {
      absolute.push(entry)
      continue
    }
    const segments = normalizeRelativePath(entry)
    if (segments) {
      relative.push(relativePathKey(segments))
    }
  }
  return { relative, absolute }
}

function readMaxDepth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_DEPTH
  }
  const depth = Math.trunc(value)
  return depth === -1 ? -1 : Math.max(0, depth)
}

function readCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback
}

function readAutofetchPeriod(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(MIN_AUTOFETCH_PERIOD, Math.trunc(value))
    : DEFAULT_AUTOFETCH_PERIOD
}

function readIgnoreSubmodules(value: unknown): 'all' | 'dirty' | 'untracked' | null {
  if (value === true) {
    return 'all'
  }
  return value === 'all' || value === 'dirty' || value === 'untracked' ? value : null
}

export function parseFolderGitScanSettings(parsed: unknown): FolderGitScanSettings {
  if (!isRecord(parsed)) {
    return { ...DEFAULT_FOLDER_GIT_SCAN_SETTINGS, invalid: true }
  }
  const detection = parsed['git.autoRepositoryDetection']
  const ignored = readIgnoredRepositories(parsed['git.ignoredRepositories'])
  return {
    scanEnabled: detection !== false,
    maxDepth: readMaxDepth(parsed['git.repositoryScanMaxDepth']),
    ignoredFolders: readStringArray(parsed['git.repositoryScanIgnoredFolders']),
    scanRepositories: readScanRepositories(parsed['git.scanRepositories']),
    ignoredRelativeRepositories: ignored.relative,
    ignoredAbsoluteRepositories: ignored.absolute,
    detectSubmodules: parsed['git.detectSubmodules'] !== false,
    detectSubmodulesLimit: readCount(parsed['git.detectSubmodulesLimit'], 10),
    detectWorktrees: parsed['git.detectWorktrees'] === true,
    detectWorktreesLimit: readCount(parsed['git.detectWorktreesLimit'], 50),
    autorefresh: parsed['git.autorefresh'] !== false,
    autofetch: parsed['git.autofetch'] === 'all' ? 'all' : parsed['git.autofetch'] === true,
    autofetchPeriod: readAutofetchPeriod(parsed['git.autofetchPeriod']),
    ignoreSubmodules: readIgnoreSubmodules(parsed['git.ignoreSubmodules']),
    invalid: false
  }
}

/** Stable across settings edits that leave the effective scan configuration unchanged. */
export function folderGitSettingsFingerprint(settings: FolderGitScanSettings): string {
  return JSON.stringify({
    invalid: settings.invalid,
    scanEnabled: settings.scanEnabled,
    maxDepth: settings.maxDepth,
    ignoredFolders: [...settings.ignoredFolders].sort(),
    scanRepositories: [...settings.scanRepositories].sort(),
    ignoredRelativeRepositories: [...settings.ignoredRelativeRepositories].sort(),
    ignoredAbsoluteRepositories: [...settings.ignoredAbsoluteRepositories].sort(),
    detectSubmodules: settings.detectSubmodules,
    detectSubmodulesLimit: settings.detectSubmodulesLimit,
    detectWorktrees: settings.detectWorktrees,
    detectWorktreesLimit: settings.detectWorktreesLimit,
    autorefresh: settings.autorefresh,
    autofetch: settings.autofetch,
    autofetchPeriod: settings.autofetchPeriod,
    ignoreSubmodules: settings.ignoreSubmodules
  })
}

export async function readFolderGitScanSettings(
  folderPath: string
): Promise<FolderGitScanSettings> {
  let content: string
  try {
    content = await readFile(join(folderPath, SETTINGS_FILE), 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    return { ...DEFAULT_FOLDER_GIT_SCAN_SETTINGS, invalid: code !== 'ENOENT' }
  }
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }
  const errors: ParseError[] = []
  const parsed = parse(content, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0) {
    return { ...DEFAULT_FOLDER_GIT_SCAN_SETTINGS, invalid: true }
  }
  return parseFolderGitScanSettings(parsed)
}
