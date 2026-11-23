import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_FOLDER_GIT_SCAN_SETTINGS,
  folderGitSettingsFingerprint,
  parseFolderGitScanSettings,
  readFolderGitScanSettings
} from './folder-git-settings'

let tempDirs: string[] = []

async function tempFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-git-settings-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('parseFolderGitScanSettings', () => {
  it('returns defaults when scan settings are absent', () => {
    expect(parseFolderGitScanSettings({})).toEqual(DEFAULT_FOLDER_GIT_SCAN_SETTINGS)
  })

  it('maps the VS Code keys used for repository scanning', () => {
    expect(
      parseFolderGitScanSettings({
        'git.autoRepositoryDetection': 'subFolders',
        'git.repositoryScanMaxDepth': -1,
        'git.repositoryScanIgnoredFolders': ['vendor', 'generated'],
        'git.scanRepositories': ['packages', 'services/api'],
        'git.ignoredRepositories': ['packages/legacy', '/srv/repos/other']
      })
    ).toEqual({
      scanEnabled: true,
      maxDepth: -1,
      ignoredFolders: ['vendor', 'generated'],
      scanRepositories: ['packages', 'services/api'],
      ignoredRelativeRepositories: ['packages/legacy'],
      ignoredAbsoluteRepositories: ['/srv/repos/other'],
      detectSubmodules: true,
      detectSubmodulesLimit: 10,
      detectWorktrees: false,
      detectWorktreesLimit: 50,
      autorefresh: true,
      autofetch: false,
      autofetchPeriod: 180,
      ignoreSubmodules: null,
      invalid: false
    })
  })

  it('reads submodule detection settings', () => {
    expect(
      parseFolderGitScanSettings({
        'git.detectSubmodules': false,
        'git.detectSubmodulesLimit': 3
      })
    ).toMatchObject({ detectSubmodules: false, detectSubmodulesLimit: 3 })
  })

  it('reads worktree detection settings', () => {
    expect(
      parseFolderGitScanSettings({
        'git.detectWorktrees': true,
        'git.detectWorktreesLimit': 4
      })
    ).toMatchObject({ detectWorktrees: true, detectWorktreesLimit: 4 })
    expect(parseFolderGitScanSettings({ 'git.detectWorktrees': false })).toMatchObject({
      detectWorktrees: false
    })
  })

  it('reads autorefresh', () => {
    expect(parseFolderGitScanSettings({ 'git.autorefresh': false })).toMatchObject({
      autorefresh: false
    })
    expect(parseFolderGitScanSettings({ 'git.autorefresh': true })).toMatchObject({
      autorefresh: true
    })
  })

  it('reads ignoreSubmodules', () => {
    expect(parseFolderGitScanSettings({ 'git.ignoreSubmodules': true })).toMatchObject({
      ignoreSubmodules: 'all'
    })
    expect(parseFolderGitScanSettings({ 'git.ignoreSubmodules': 'dirty' })).toMatchObject({
      ignoreSubmodules: 'dirty'
    })
    expect(parseFolderGitScanSettings({ 'git.ignoreSubmodules': false })).toMatchObject({
      ignoreSubmodules: null
    })
    expect(parseFolderGitScanSettings({ 'git.ignoreSubmodules': 'invalid' })).toMatchObject({
      ignoreSubmodules: null
    })
  })

  it('disables scanning only for autoRepositoryDetection false', () => {
    expect(parseFolderGitScanSettings({ 'git.autoRepositoryDetection': false }).scanEnabled).toBe(
      false
    )
    expect(
      parseFolderGitScanSettings({ 'git.autoRepositoryDetection': 'openEditors' }).scanEnabled
    ).toBe(true)
  })

  it('normalizes redundant segments without allowing escapes', () => {
    expect(
      parseFolderGitScanSettings({
        'git.scanRepositories': ['./packages/api/', 'services/tmp/../api', 'packages/../..'],
        'git.ignoredRepositories': ['./services/legacy/', 'services/tmp/../legacy']
      })
    ).toMatchObject({
      scanRepositories: ['packages/api', 'services/api'],
      ignoredRelativeRepositories: ['services/legacy', 'services/legacy']
    })
  })

  it('rejects absolute, escaping, and .git scan repositories', () => {
    expect(
      parseFolderGitScanSettings({
        'git.scanRepositories': [
          'packages',
          '../outside',
          '/srv/repos',
          'C:\\repos',
          'services/.git/objects',
          '.'
        ]
      }).scanRepositories
    ).toEqual(['packages'])
  })

  it('splits ignored repositories into relative and absolute entries', () => {
    const settings = parseFolderGitScanSettings({
      'git.ignoredRepositories': ['services/legacy', '../outside', 'D:\\work\\repo']
    })
    expect(settings.ignoredRelativeRepositories).toEqual(['services/legacy'])
    expect(settings.ignoredAbsoluteRepositories).toEqual(['D:\\work\\repo'])
  })

  it('treats non-object settings as invalid defaults', () => {
    expect(parseFolderGitScanSettings([])).toEqual({
      ...DEFAULT_FOLDER_GIT_SCAN_SETTINGS,
      invalid: true
    })
  })
})

describe('readFolderGitScanSettings', () => {
  it('parses JSONC comments and trailing commas', async () => {
    const folder = await tempFolder()
    await mkdir(join(folder, '.vscode'))
    await writeFile(
      join(folder, '.vscode', 'settings.json'),
      `{
        // repository depth
        "git.repositoryScanMaxDepth": 1,
        "git.repositoryScanIgnoredFolders": ["vendor",],
      }`
    )
    const settings = await readFolderGitScanSettings(folder)
    expect(settings.maxDepth).toBe(1)
    expect(settings.ignoredFolders).toEqual(['vendor'])
    expect(settings.invalid).toBe(false)
  })

  it('accepts a UTF-8 BOM', async () => {
    const folder = await tempFolder()
    await mkdir(join(folder, '.vscode'))
    await writeFile(
      join(folder, '.vscode', 'settings.json'),
      '﻿{"git.autoRepositoryDetection":false}'
    )
    const settings = await readFolderGitScanSettings(folder)
    expect(settings.scanEnabled).toBe(false)
    expect(settings.invalid).toBe(false)
  })

  it('falls back to defaults when the file is malformed', async () => {
    const folder = await tempFolder()
    await mkdir(join(folder, '.vscode'))
    await writeFile(join(folder, '.vscode', 'settings.json'), '{ not json')
    expect(await readFolderGitScanSettings(folder)).toEqual({
      ...DEFAULT_FOLDER_GIT_SCAN_SETTINGS,
      invalid: true
    })
  })

  it('uses defaults without an error when the file is missing', async () => {
    expect(await readFolderGitScanSettings(await tempFolder())).toEqual(
      DEFAULT_FOLDER_GIT_SCAN_SETTINGS
    )
  })
})

describe('folderGitSettingsFingerprint', () => {
  it('ignores array order but changes with effective settings', () => {
    const base = parseFolderGitScanSettings({
      'git.repositoryScanIgnoredFolders': ['vendor', 'generated'],
      'git.scanRepositories': ['b', 'a']
    })
    const reordered = parseFolderGitScanSettings({
      'git.repositoryScanIgnoredFolders': ['generated', 'vendor'],
      'git.scanRepositories': ['a', 'b']
    })
    expect(folderGitSettingsFingerprint(reordered)).toBe(folderGitSettingsFingerprint(base))

    const changed = parseFolderGitScanSettings({
      'git.repositoryScanIgnoredFolders': ['vendor', 'generated'],
      'git.scanRepositories': ['a']
    })
    expect(folderGitSettingsFingerprint(changed)).not.toBe(folderGitSettingsFingerprint(base))
  })
})
