import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  GitBranch,
  GitFork
} from 'lucide-react'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type { FolderNestedRepo } from '../../../../../../shared/folder-workspaces/folder-nested-git'

type DirNode = {
  kind: 'dir'
  name: string
  path: string
  children: RepoTreeNode[]
}
type RepoNode = { kind: 'repo'; repo: FolderNestedRepo; children: RepoNode[] }
type RepoTreeNode = DirNode | RepoNode

function repoNodeCount(node: RepoNode): number {
  return 1 + node.children.reduce((count, child) => count + repoNodeCount(child), 0)
}

function repoCount(node: DirNode): number {
  return node.children.reduce(
    (count, child) => count + (child.kind === 'repo' ? repoNodeCount(child) : repoCount(child)),
    0
  )
}

function childKindLabel(node: RepoNode): 'worktrees' | 'submodules' | 'children' {
  const hasWorktree = node.children.some((child) => child.repo.isWorktree)
  const hasSubmodule = node.children.some((child) => child.repo.isSubmodule)
  if (hasWorktree && !hasSubmodule) {
    return 'worktrees'
  }
  return hasSubmodule && !hasWorktree ? 'submodules' : 'children'
}

function sortRepoNodes(nodes: RepoNode[]): void {
  nodes.sort((left, right) => left.repo.displayName.localeCompare(right.repo.displayName))
  for (const node of nodes) {
    sortRepoNodes(node.children)
  }
}

function sortNodes(node: DirNode): void {
  node.children.sort((left, right) => {
    if (left.kind === 'dir' && right.kind === 'repo') {
      return -1
    }
    if (left.kind === 'repo' && right.kind === 'dir') {
      return 1
    }
    if (left.kind === 'dir' && right.kind === 'dir') {
      return left.name.localeCompare(right.name)
    }
    return left.kind === 'repo' && right.kind === 'repo'
      ? left.repo.displayName.localeCompare(right.repo.displayName)
      : 0
  })
  for (const child of node.children) {
    if (child.kind === 'dir') {
      sortNodes(child)
    } else {
      sortRepoNodes(child.children)
    }
  }
}

/** Directory nodes exist only to explain mixed depths; flat folders stay a flat list. */
function buildTree(repos: readonly FolderNestedRepo[]): DirNode {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [] }
  const repoNodes = new Map<string, RepoNode>()
  for (const repo of repos) {
    repoNodes.set(repo.relativePath, { kind: 'repo', repo, children: [] })
  }
  // Submodules attach to their declared parent instead of repeating the parent path as directories.
  for (const repo of repos) {
    const node = repoNodes.get(repo.relativePath)!
    const parent = repo.parentRelativePath ? repoNodes.get(repo.parentRelativePath) : undefined
    if (parent) {
      parent.children.push(node)
      continue
    }
    const segments = repo.relativePath.split('/')
    let current = root
    let prefix = ''
    for (const segment of segments.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${segment}` : segment
      let child = current.children.find(
        (node): node is DirNode => node.kind === 'dir' && node.name === segment
      )
      if (!child) {
        child = { kind: 'dir', name: segment, path: prefix, children: [] }
        current.children.push(child)
      }
      current = child
    }
    current.children.push(node)
  }
  sortNodes(root)
  return root
}

function RepoRow({
  repo,
  selected,
  indent,
  isCollapsed,
  childrenLabel,
  onToggle,
  onSelect
}: {
  repo: FolderNestedRepo
  selected: boolean
  indent: number
  isCollapsed: boolean
  childrenLabel: string
  onToggle: (() => void) | null
  onSelect: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div
      data-testid="folder-repo-row"
      data-relative-path={repo.relativePath}
      data-submodule={repo.isSubmodule ? 'true' : undefined}
      data-worktree={repo.isWorktree ? 'true' : undefined}
      className={cn(
        'flex w-full min-w-0 items-center rounded-sm py-1 pr-2 text-xs',
        selected
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground hover:bg-accent/50 focus-within:bg-accent/50'
      )}
      style={{ paddingLeft: 4 + indent * 12 }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {repo.isSubmodule ? (
          <GitFork
            className="size-3 shrink-0 text-muted-foreground"
            aria-label={t(
              'auto.components.right.sidebar.FolderRepoScm.submoduleBadge',
              'Submodule'
            )}
          />
        ) : null}
        {repo.isWorktree ? (
          <Copy
            className="size-3 shrink-0 text-muted-foreground"
            aria-label={t(
              'auto.components.right.sidebar.FolderRepoScm.worktreeRepoBadge',
              'Worktree'
            )}
          />
        ) : null}
        <span className="truncate">{repo.displayName}</span>
        {repo.branch ? (
          <span className="ml-auto max-w-[45%] truncate text-[11px] text-muted-foreground">
            {repo.branch}
          </span>
        ) : null}
      </button>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed
              ? t(
                  'auto.components.right.sidebar.FolderRepoScm.expandChildren',
                  'Expand {{children}} of {{repo}}',
                  { children: childrenLabel, repo: repo.displayName }
                )
              : t(
                  'auto.components.right.sidebar.FolderRepoScm.collapseChildren',
                  'Collapse {{children}} of {{repo}}',
                  { children: childrenLabel, repo: repo.displayName }
                )
          }
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent"
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  )
}

export function FolderRepositoryTree({
  repos,
  selectedPath,
  onSelect
}: {
  repos: readonly FolderNestedRepo[]
  selectedPath: string | null
  onSelect: (relativePath: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const tree = useMemo(() => buildTree(repos), [repos])
  const childrenLabels = {
    worktrees: t('auto.components.right.sidebar.FolderRepoScm.worktrees', 'worktrees'),
    submodules: t('auto.components.right.sidebar.FolderRepoScm.submodules', 'submodules'),
    children: t('auto.components.right.sidebar.FolderRepoScm.children', 'children')
  }
  const nested = useMemo(
    () => repos.some((repo) => repo.relativePath.includes('/') || repo.parentRelativePath),
    [repos]
  )

  const toggle = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (!nested) {
    return (
      <div className="flex flex-col gap-px px-1 pb-1">
        {repos.map((repo) => (
          <RepoRow
            key={repo.relativePath}
            repo={repo}
            selected={repo.relativePath === selectedPath}
            indent={0}
            isCollapsed={false}
            childrenLabel=""
            onToggle={null}
            onSelect={() => onSelect(repo.relativePath)}
          />
        ))}
      </div>
    )
  }

  const renderNodes = (nodes: readonly RepoTreeNode[], depth: number): React.JSX.Element[] =>
    nodes.map((node) => {
      if (node.kind === 'repo') {
        const key = `repo:${node.repo.relativePath}`
        const isCollapsed = collapsed.has(key)
        return (
          <div key={key}>
            <RepoRow
              repo={node.repo}
              selected={node.repo.relativePath === selectedPath}
              indent={depth}
              isCollapsed={isCollapsed}
              childrenLabel={childrenLabels[childKindLabel(node)]}
              onToggle={node.children.length > 0 ? () => toggle(key) : null}
              onSelect={() => onSelect(node.repo.relativePath)}
            />
            {!isCollapsed && node.children.length > 0
              ? renderNodes(node.children, depth + 1)
              : null}
          </div>
        )
      }
      const key = `dir:${node.path}`
      const isCollapsed = collapsed.has(key)
      return (
        <div key={key}>
          <button
            type="button"
            onClick={() => toggle(key)}
            aria-expanded={!isCollapsed}
            className="flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left text-xs text-muted-foreground hover:bg-accent/40"
            style={{ paddingLeft: 4 + depth * 12 }}
          >
            {isCollapsed ? (
              <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            {isCollapsed ? (
              <Folder className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{node.name}</span>
            <span className="ml-auto text-[11px]">{repoCount(node)}</span>
          </button>
          {!isCollapsed ? renderNodes(node.children, depth + 1) : null}
        </div>
      )
    })

  return <div className="flex flex-col gap-px px-1 pb-1">{renderNodes(tree.children, 0)}</div>
}
