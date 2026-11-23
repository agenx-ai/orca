import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveFolderNestedGitTarget } from './folder-nested-git-target'
import type { ResolvedWorktree } from './catalog/runtime-worktree-path-identity'

const roots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-folder-nested-'))
  roots.push(root)
  return root
}

function rootWorktree(path: string): ResolvedWorktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: target resolution only reads these worktree identity fields.
  return {
    id: 'folder:test',
    repoId: 'folder',
    displayName: 'root',
    path
  } as unknown as ResolvedWorktree
}

async function makeGitDir(path: string, branch = 'main'): Promise<string> {
  const gitDir = join(path, '.git')
  await mkdir(join(gitDir, 'objects'), { recursive: true })
  await mkdir(join(gitDir, 'refs'), { recursive: true })
  await writeFile(join(gitDir, 'HEAD'), `ref: refs/heads/${branch}\n`)
  return gitDir
}

async function makeGitRepo(path: string, branch = 'main'): Promise<void> {
  await mkdir(path, { recursive: true })
  await makeGitDir(path, branch)
}

const parsed = (relativePath: string) => ({ folderSelector: 'folder:test', relativePath })

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('resolveFolderNestedGitTarget', () => {
  it('resolves a repo inside the folder root with its branch', async () => {
    const root = await makeTempRoot()
    await makeGitRepo(join(root, 'services', 'repo-beta'), 'feature/beta')

    const worktree = await resolveFolderNestedGitTarget({
      selector: 'nested:folder%3Atest:services%2Frepo-beta',
      parsed: parsed('services/repo-beta'),
      root: rootWorktree(root),
      rootHostId: 'local'
    })

    expect(worktree.path).toBe(join(root, 'services', 'repo-beta'))
    expect(worktree.branch).toBe('feature/beta')
    expect(worktree.id).toBe('nested:folder%3Atest:services%2Frepo-beta')
  })

  it.each(['../outside', '/etc', 'services/../outside', ''])(
    'rejects relative path %j',
    async (relativePath) => {
      const root = await makeTempRoot()
      await expect(
        resolveFolderNestedGitTarget({
          selector: 'nested:folder%3Atest:bad',
          parsed: parsed(relativePath),
          root: rootWorktree(root)
        })
      ).rejects.toThrow('selector_not_found')
    }
  )

  it('rejects a symlink that escapes the folder root', async () => {
    if (process.platform === 'win32') {
      return
    }
    const root = await makeTempRoot()
    const outside = await makeTempRoot()
    await makeGitRepo(outside)
    await symlink(outside, join(root, 'linked'), 'dir')

    await expect(
      resolveFolderNestedGitTarget({
        selector: 'nested:folder%3Atest:linked',
        parsed: parsed('linked'),
        root: rootWorktree(root)
      })
    ).rejects.toThrow('selector_not_found')
  })

  it('rejects a directory without a Git marker', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, 'plain'))

    await expect(
      resolveFolderNestedGitTarget({
        selector: 'nested:folder%3Atest:plain',
        parsed: parsed('plain'),
        root: rootWorktree(root)
      })
    ).rejects.toThrow('selector_not_found')
  })

  it('rejects a .git directory with HEAD but no object store', async () => {
    const root = await makeTempRoot()
    const repoPath = join(root, 'head-only')
    await mkdir(join(repoPath, '.git'), { recursive: true })
    await writeFile(join(repoPath, '.git', 'HEAD'), 'ref: refs/heads/main\n')

    await expect(
      resolveFolderNestedGitTarget({
        selector: 'nested:folder%3Atest:head-only',
        parsed: parsed('head-only'),
        root: rootWorktree(root)
      })
    ).rejects.toThrow('selector_not_found')
  })

  it('rejects an empty .git directory', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, 'empty-git', '.git'), { recursive: true })

    await expect(
      resolveFolderNestedGitTarget({
        selector: 'nested:folder%3Atest:empty-git',
        parsed: parsed('empty-git'),
        root: rootWorktree(root)
      })
    ).rejects.toThrow('selector_not_found')
  })

  it('rejects a bare repository', async () => {
    const root = await makeTempRoot()
    await mkdir(join(root, 'bare.git', 'objects'), { recursive: true })
    await mkdir(join(root, 'bare.git', 'refs'), { recursive: true })
    await writeFile(join(root, 'bare.git', 'HEAD'), 'ref: refs/heads/main\n')

    await expect(
      resolveFolderNestedGitTarget({
        selector: 'nested:folder%3Atest:bare.git',
        parsed: parsed('bare.git'),
        root: rootWorktree(root)
      })
    ).rejects.toThrow('selector_not_found')
  })

  it('accepts a .git file pointing at a worktree git dir', async () => {
    const root = await makeTempRoot()
    const repoPath = join(root, 'linked-worktree')
    await mkdir(repoPath, { recursive: true })
    const gitDir = join(root, 'gitdirs', 'wt')
    await mkdir(join(gitDir, 'objects'), { recursive: true })
    await mkdir(join(gitDir, 'refs'), { recursive: true })
    await writeFile(join(gitDir, 'HEAD'), 'ref: refs/heads/linked\n')
    await writeFile(join(repoPath, '.git'), 'gitdir: ../gitdirs/wt\n')

    const worktree = await resolveFolderNestedGitTarget({
      selector: 'nested:folder%3Atest:linked-worktree',
      parsed: parsed('linked-worktree'),
      root: rootWorktree(root)
    })

    expect(worktree.branch).toBe('linked')
  })

  it('accepts a linked worktree that shares objects through commondir', async () => {
    const root = await makeTempRoot()
    const repoPath = join(root, 'common-worktree')
    await mkdir(repoPath, { recursive: true })
    const commonDir = join(root, 'gitdirs', 'main')
    await mkdir(join(commonDir, 'objects'), { recursive: true })
    await mkdir(join(commonDir, 'refs'), { recursive: true })
    const gitDir = join(root, 'gitdirs', 'wt-common')
    await mkdir(gitDir, { recursive: true })
    await writeFile(join(gitDir, 'HEAD'), 'ref: refs/heads/common\n')
    await writeFile(join(gitDir, 'commondir'), '../main\n')
    await writeFile(join(repoPath, '.git'), 'gitdir: ../gitdirs/wt-common\n')

    const worktree = await resolveFolderNestedGitTarget({
      selector: 'nested:folder%3Atest:common-worktree',
      parsed: parsed('common-worktree'),
      root: rootWorktree(root)
    })

    expect(worktree.branch).toBe('common')
  })

  it('accepts a POSIX directory named like a Windows drive path', async () => {
    if (process.platform === 'win32') {
      return
    }
    const root = await makeTempRoot()
    await makeGitRepo(join(root, 'A:\\repo'))

    const worktree = await resolveFolderNestedGitTarget({
      selector: 'nested:folder%3Atest:A%3A%5Crepo',
      parsed: parsed('A:\\repo'),
      root: rootWorktree(root)
    })

    expect(worktree.path).toBe(join(root, 'A:\\repo'))
  })

  it('accepts a symlinked .git directory', async () => {
    if (process.platform === 'win32') {
      return
    }
    const root = await makeTempRoot()
    const repoPath = join(root, 'symlinked-git')
    await mkdir(repoPath, { recursive: true })
    const gitDir = join(root, 'gitdirs', 'symlinked')
    await mkdir(join(gitDir, 'objects'), { recursive: true })
    await mkdir(join(gitDir, 'refs'), { recursive: true })
    await writeFile(join(gitDir, 'HEAD'), 'ref: refs/heads/linked\n')
    await symlink(gitDir, join(repoPath, '.git'), 'dir')

    const worktree = await resolveFolderNestedGitTarget({
      selector: 'nested:folder%3Atest:symlinked-git',
      parsed: parsed('symlinked-git'),
      root: rootWorktree(root)
    })

    expect(worktree.branch).toBe('linked')
  })
})
