import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { isAbsoluteRuntimePath } from '../../shared/remote-runtime/ephemeral-vm-recipes/ephemeral-vm-recipes'
import { nestedRepoPathKey } from './nested-repo-scan-rules'

const SETTINGS_FILE = join('.vscode', 'settings.json')
const IGNORED_REPOSITORIES_KEY = 'git.ignoredRepositories'
const FORMATTING = { insertSpaces: true, tabSize: 2, eol: '\n' as const }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Folder-relative POSIX path, or null for absolute paths, escapes, and Git metadata. */
export function normalizeRepositoryRelativePath(value: string): string | null {
  if (value.length === 0 || isAbsoluteRuntimePath(value)) {
    return null
  }
  const segments: string[] = []
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') {
      continue
    }
    if (segment === '..' || segment === '.git') {
      return null
    }
    segments.push(segment)
  }
  return segments.length > 0 ? segments.join('/') : null
}

function readIgnoredEntries(value: unknown): string[] | null {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    return null
  }
  const entries: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return null
    }
    entries.push(entry)
  }
  return entries
}

/**
 * Adds a folder-relative repository to `.vscode/settings.json`'s git.ignoredRepositories list.
 * Appending at the next array index keeps existing entries, comments, and trailing commas intact.
 */
export async function addFolderIgnoredRepository(
  folderPath: string,
  relativePath: string
): Promise<string> {
  const normalized = normalizeRepositoryRelativePath(relativePath)
  if (!normalized) {
    throw new Error('invalid_relative_path')
  }
  const settingsPath = join(folderPath, SETTINGS_FILE)
  let content: string
  let missing = false
  try {
    content = await readFile(settingsPath, 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT') {
      throw error
    }
    missing = true
    content = '{}\n'
  }
  let bom = ''
  if (content.charCodeAt(0) === 0xfeff) {
    bom = content.slice(0, 1)
    content = content.slice(1)
  }
  const errors: ParseError[] = []
  const parsed = parse(content, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error('folder_settings_invalid')
  }
  const entries = readIgnoredEntries(parsed[IGNORED_REPOSITORIES_KEY])
  if (!entries) {
    throw new Error('folder_settings_invalid')
  }
  const key = nestedRepoPathKey(normalized)
  if (entries.some((entry) => nestedRepoPathKey(entry.replace(/\\/g, '/')) === key)) {
    return normalized
  }
  const edits = missing
    ? modify(content, [IGNORED_REPOSITORIES_KEY], [normalized], { formattingOptions: FORMATTING })
    : parsed[IGNORED_REPOSITORIES_KEY] === undefined
      ? modify(content, [IGNORED_REPOSITORIES_KEY], [normalized], {
          formattingOptions: FORMATTING
        })
      : modify(content, [IGNORED_REPOSITORIES_KEY, entries.length], normalized, {
          formattingOptions: FORMATTING
        })
  const nextContent = applyEdits(content, edits)
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, bom + nextContent, 'utf8')
  return normalized
}
