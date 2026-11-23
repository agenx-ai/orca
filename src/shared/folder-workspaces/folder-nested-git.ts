/**
 * Nested Git repositories inside one folder project.
 *
 * A nested repo is addressed without registering a Repo/Worktree row:
 * `nested:<encoded folder selector>:<encoded relative repository path>`.
 * Both halves are URI-encoded because a folder selector may itself contain `:`.
 */

import { parseWorkspaceKey } from '../workspace/identity/workspace-scope'

const NESTED_PREFIX = 'nested:'
const NESTED_REPO_ID_PREFIX = 'folder-nested:'

/** Synthetic repo id for source-control scope; it never exists in the repo catalog. */
export function folderNestedRepoId(folderSelector: string, relativePath: string): string {
  return `${NESTED_REPO_ID_PREFIX}${folderSelector}:${relativePath}`
}

/** Repo-id RPCs (`repo.*`) resolve catalog ids only, so callers must skip these synthetic ids. */
export function isFolderNestedRepoId(repoId: string | null | undefined): boolean {
  return typeof repoId === 'string' && repoId.startsWith(NESTED_REPO_ID_PREFIX)
}

export type FolderNestedRepo = {
  /** Repository path relative to the folder root, using `/` on every platform. */
  relativePath: string
  displayName: string
  depth: number
  /** Current local branch from HEAD, or null when detached/unreadable. */
  branch: string | null
  /** True when this repository is a submodule of the parent repository below. */
  isSubmodule?: boolean
  /** True when this repository is a linked worktree of the parent repository below. */
  isWorktree?: boolean
  /** Parent repository relative path for submodule or worktree tree rows. */
  parentRelativePath?: string
  /** True when the repository has a .gitmodules file, even if no submodule is checked out. */
  hasSubmodules?: boolean
}

export type FolderNestedRepoScanOptions = {
  maxDepth?: number
  maxRepos?: number
  timeoutMs?: number | null
}

export type FolderNestedRepoScanResult = {
  folderPath: string
  repos: FolderNestedRepo[]
  truncated: boolean
  timedOut: boolean
  stopped: boolean
  durationMs: number
  maxDepth: number
  maxRepos: number
  /** Fingerprint of the .vscode/settings.json scan configuration used for this result. */
  settingsFingerprint: string
  /** True when .vscode/settings.json exists but could not be read or parsed. */
  settingsError: boolean
  /** git.autorefresh: refresh the selected repository status automatically. */
  autorefresh: boolean
  /** git.autofetch: false disables background fetches; 'all' fetches every remote. */
  autofetch: boolean | 'all'
  /** git.autofetchPeriod in seconds, raised to VS Code's 60s minimum. */
  autofetchPeriod: number
}

export type FolderReposSettingsResult = {
  fingerprint: string
  error: boolean
}

export type FolderReposScanProgressResult = {
  /** False once the scan finished, failed, or was cancelled. */
  active: boolean
  /** Repositories found so far by the running scan. */
  reposFound: number
}

export type ParsedFolderNestedGitSelector = {
  folderSelector: string
  relativePath: string
}

function stripIdPrefix(selector: string): string {
  return selector.startsWith('id:') ? selector.slice(3) : selector
}

export function isFolderNestedGitSelector(selector: string): boolean {
  return stripIdPrefix(selector).startsWith(NESTED_PREFIX)
}

/** The folder workspace that owns a nested repo, when the selector names one. */
export function folderWorkspaceIdFromNestedGitSelector(selector: string): string | null {
  const folderSelector = parseFolderNestedGitSelector(selector)?.folderSelector
  if (!folderSelector) {
    return null
  }
  const scope = parseWorkspaceKey(folderSelector)
  return scope?.type === 'folder' ? scope.folderWorkspaceId : null
}

/** Absolute path of a nested repo under its folder root, using the folder's separator convention. */
export function folderNestedRepoPath(folderPath: string, relativePath: string): string {
  const separator = folderPath.includes('\\') && !folderPath.includes('/') ? '\\' : '/'
  return `${folderPath.replace(/[\\/]+$/, '')}${separator}${relativePath
    .split('/')
    .join(separator)}`
}

export function createFolderNestedGitSelector(
  folderSelector: string,
  relativePath: string
): string {
  return `${NESTED_PREFIX}${encodeURIComponent(folderSelector)}:${encodeURIComponent(relativePath)}`
}

/** Null when the selector is not nested syntax; malformed nested selectors also return null and must be rejected by the caller. */
export function parseFolderNestedGitSelector(
  selector: string
): ParsedFolderNestedGitSelector | null {
  const body = stripIdPrefix(selector)
  if (!body.startsWith(NESTED_PREFIX)) {
    return null
  }
  const rest = body.slice(NESTED_PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator <= 0) {
    return null
  }
  try {
    const folderSelector = decodeURIComponent(rest.slice(0, separator))
    const relativePath = decodeURIComponent(rest.slice(separator + 1))
    return folderSelector && relativePath ? { folderSelector, relativePath } : null
  } catch {
    return null
  }
}
