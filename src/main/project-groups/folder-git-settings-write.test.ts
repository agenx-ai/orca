import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { readFolderGitScanSettings } from './folder-git-settings'
import {
  addFolderIgnoredRepository,
  normalizeRepositoryRelativePath
} from './folder-git-settings-write'

let tempDirs: string[] = []

async function tempFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-git-settings-write-'))
  tempDirs.push(dir)
  return dir
}

function settingsPath(folder: string): string {
  return join(folder, '.vscode', 'settings.json')
}

async function writeSettings(folder: string, content: string): Promise<void> {
  await mkdir(join(folder, '.vscode'), { recursive: true })
  await writeFile(settingsPath(folder), content, 'utf8')
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('normalizeRepositoryRelativePath', () => {
  it('normalizes separators and repeated segments', () => {
    expect(normalizeRepositoryRelativePath('ccc\\git1')).toBe('ccc/git1')
    expect(normalizeRepositoryRelativePath('./packages//api/')).toBe('packages/api')
  })

  it('rejects absolute paths, escapes, and Git metadata', () => {
    expect(normalizeRepositoryRelativePath('')).toBeNull()
    expect(normalizeRepositoryRelativePath('/srv/repos/other')).toBeNull()
    expect(normalizeRepositoryRelativePath('C:\\repos\\other')).toBeNull()
    expect(normalizeRepositoryRelativePath('../other')).toBeNull()
    expect(normalizeRepositoryRelativePath('packages/../other')).toBeNull()
    expect(normalizeRepositoryRelativePath('.git')).toBeNull()
  })
})

describe('addFolderIgnoredRepository', () => {
  it('creates .vscode/settings.json when the folder has none', async () => {
    const folder = await tempFolder()
    await expect(addFolderIgnoredRepository(folder, 'ccc/git1')).resolves.toBe('ccc/git1')

    const settings = await readFolderGitScanSettings(folder)
    expect(settings.invalid).toBe(false)
    expect(settings.ignoredRelativeRepositories).toEqual(['ccc/git1'])
  })

  it('appends to existing entries without disturbing comments or trailing commas', async () => {
    const folder = await tempFolder()
    await writeSettings(
      folder,
      '{\n  // keep this comment\n  "editor.tabSize": 4,\n  "git.ignoredRepositories": [\n    "aaa", // first entry\n  ],\n}\n'
    )

    await addFolderIgnoredRepository(folder, 'bbb')

    const content = await readFile(settingsPath(folder), 'utf8')
    expect(content).toContain('// keep this comment')
    expect(content).toContain('// first entry')
    expect(content).toContain('"aaa"')
    expect(content).toContain('"bbb"')
    expect(JSON.parse(content.replace(/\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'))).toEqual({
      'editor.tabSize': 4,
      'git.ignoredRepositories': ['aaa', 'bbb']
    })
    expect((await readFolderGitScanSettings(folder)).ignoredRelativeRepositories).toEqual([
      'aaa',
      'bbb'
    ])
  })

  it('is idempotent across separator and case variants of the same entry', async () => {
    const folder = await tempFolder()
    await writeSettings(folder, '{ "git.ignoredRepositories": ["ccc/git1"] }\n')

    await expect(addFolderIgnoredRepository(folder, 'ccc\\git1')).resolves.toBe('ccc/git1')

    const content = await readFile(settingsPath(folder), 'utf8')
    expect(content.match(/ccc/g)?.length).toBe(1)
  })

  it('adds the key when other settings exist', async () => {
    const folder = await tempFolder()
    await writeSettings(folder, '{\n  "git.autorefresh": false\n}\n')

    await addFolderIgnoredRepository(folder, 'ccc/git2')

    expect(JSON.parse(await readFile(settingsPath(folder), 'utf8'))).toEqual({
      'git.autorefresh': false,
      'git.ignoredRepositories': ['ccc/git2']
    })
  })

  it('preserves a UTF-8 BOM', async () => {
    const folder = await tempFolder()
    await writeSettings(folder, '\uFEFF{ "git.ignoredRepositories": ["aaa"] }\n')

    await addFolderIgnoredRepository(folder, 'bbb')

    expect((await readFile(settingsPath(folder), 'utf8')).charCodeAt(0)).toBe(0xfeff)
  })

  it('rejects invalid JSON and non-array values without rewriting the file', async () => {
    const invalid = await tempFolder()
    await writeSettings(invalid, '{ "git.ignoredRepositories": [ }\n')
    await expect(addFolderIgnoredRepository(invalid, 'aaa')).rejects.toThrow(
      'folder_settings_invalid'
    )
    expect(await readFile(settingsPath(invalid), 'utf8')).toBe('{ "git.ignoredRepositories": [ }\n')

    const notArray = await tempFolder()
    await writeSettings(notArray, '{ "git.ignoredRepositories": "aaa" }\n')
    await expect(addFolderIgnoredRepository(notArray, 'bbb')).rejects.toThrow(
      'folder_settings_invalid'
    )
    expect(await readFile(settingsPath(notArray), 'utf8')).toBe(
      '{ "git.ignoredRepositories": "aaa" }\n'
    )
  })

  it('rejects invalid relative paths before touching the file', async () => {
    const folder = await tempFolder()
    await expect(addFolderIgnoredRepository(folder, '../outside')).rejects.toThrow(
      'invalid_relative_path'
    )
    await expect(readFile(settingsPath(folder), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
