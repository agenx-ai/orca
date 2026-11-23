import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import type * as FsPromisesModule from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scanNestedRepos } from './nested-repo-discovery'
import { isGitRepoAsync } from '../git/repositories/discovery/repo-detection'

vi.mock('../git/repositories/discovery/repo-detection', () => ({ isGitRepoAsync: vi.fn() }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>()
  return { ...actual, lstat: vi.fn(actual.lstat), stat: vi.fn(actual.stat) }
})

beforeEach(() => {
  vi.mocked(isGitRepoAsync).mockReset().mockResolvedValue(false)
  for (const key of Object.keys(process.env).filter((key) => key.startsWith('GIT_'))) {
    vi.stubEnv(key, undefined)
  }
})

let tempDirs: string[] = []

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-nested-repos-'))
  tempDirs.push(dir)
  return dir
}

async function makeGitRepo(path: string): Promise<void> {
  await mkdir(join(path, '.git'), { recursive: true })
}

function posixTestFilesystem(args: {
  directories: Map<string, string[]>
  gitRepos: Set<string>
  files?: Map<string, string>
}) {
  return {
    readDirectory: async (dirPath: string) =>
      (args.directories.get(dirPath) ?? []).map((name) => ({
        name,
        isDirectory: !args.files?.has(`${dirPath}/${name}`)
      })),
    readTextFile: async (path: string) => {
      const content = args.files?.get(path)
      if (content === undefined) {
        throw new Error('not found')
      }
      return content
    },
    joinPath: (parentPath: string, childName: string) => `${parentPath}/${childName}`,
    basename: (path: string) => path.split('/').at(-1) ?? path,
    hasGitMarker: (path: string) => args.gitRepos.has(path),
    isSelectedPathGitRepo: (path: string) => args.gitRepos.has(path)
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('scanNestedRepos', () => {
  it('returns repositories found before a stopped scan', async () => {
    const directories = new Map([['/workspace', ['api', 'web']]])
    const gitRepos = new Set(['/workspace/api', '/workspace/web'])
    const controller = new AbortController()

    const result = await scanNestedRepos({
      path: '/workspace',
      signal: controller.signal,
      onProgress: (scan) => {
        if (scan.repos.length === 1) {
          controller.abort()
        }
      },
      filesystem: posixTestFilesystem({ directories, gitRepos })
    })

    expect(result).toMatchObject({
      selectedPathKind: 'non_git_folder',
      stopped: true,
      timedOut: false,
      truncated: false
    })
    expect(result.repos.map((repo) => repo.path)).toEqual(['/workspace/api'])
  })

  it('scans children of a folder inside a parent work tree only for VS Code folder scans', async () => {
    const directories = new Map([['/parent/monorepo', ['api']]])
    const gitRepos = new Set(['/parent/monorepo/api'])
    const filesystem = {
      ...posixTestFilesystem({ directories, gitRepos }),
      // Stands in for is-inside-work-tree: the selection itself is not a checkout.
      isSelectedPathGitRepo: () => true
    }

    const imported = await scanNestedRepos({ path: '/parent/monorepo', filesystem })
    expect(imported.selectedPathKind).toBe('git_repo')

    const scanned = await scanNestedRepos({
      path: '/parent/monorepo',
      vsCodeDepth: true,
      filesystem
    })
    expect(scanned.selectedPathKind).toBe('non_git_folder')
    expect(scanned.repos.map((repo) => repo.path)).toEqual(['/parent/monorepo/api'])
  })

  it('applies ignored folders, ignored repositories, and extra scan roots', async () => {
    const directories = new Map([
      ['/workspace', ['kept', 'ignored', 'vendor', 'custom-ignored', 'nested']],
      ['/workspace/nested', ['deep']]
    ])
    const gitRepos = new Set([
      '/workspace/kept',
      '/workspace/ignored',
      '/workspace/vendor',
      '/workspace/vendor/sdk',
      '/workspace/custom-ignored',
      '/workspace/nested/deep',
      '/workspace/extra'
    ])

    const result = await scanNestedRepos({
      path: '/workspace',
      options: { maxDepth: 3 },
      ignoredFolders: ['custom-ignored'],
      ignoredRepositories: ['ignored'],
      extraRoots: [
        { path: '/workspace/extra', segments: ['extra'] },
        { path: '/workspace/vendor/sdk', segments: ['vendor', 'sdk'] }
      ],
      filesystem: posixTestFilesystem({ directories, gitRepos })
    })

    expect(result.repos.map((repo) => repo.path)).toEqual([
      '/workspace/extra',
      '/workspace/kept',
      '/workspace/nested/deep'
    ])
  })

  it.skipIf(process.platform === 'win32')(
    'does not follow symlinked directories outside the selected folder',
    async () => {
      const root = await tempRoot()
      const external = await tempRoot()
      await mkdir(join(external, 'outside-repo'), { recursive: true })
      await makeGitRepo(join(external, 'outside-repo'))
      await symlink(external, join(root, 'linked'), 'dir')

      const result = await scanNestedRepos({ path: root })

      expect(result.repos).toEqual([])
    }
  )
})
