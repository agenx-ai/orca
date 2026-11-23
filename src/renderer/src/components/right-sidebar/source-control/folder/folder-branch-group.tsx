import { useMemo } from 'react'
import { ArrowUpRight, Check, ChevronDown, GitBranch, GitCompare } from 'lucide-react'
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../../shared/git/history/git-history-types'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels
} from '../../../../../../shared/git/history/git-history-graph'
import { GitHistoryRow } from '../sync/git-history-row'
import type { FolderBranchCommitsState } from './folder-repo-branch-data'

function BranchCommits({
  state,
  compare,
  onOpenCommit,
  onLoadMore
}: {
  state: FolderBranchCommitsState | undefined
  compare?: { label: string; busy: boolean; onCompare: () => void }
  onOpenCommit: (item: GitHistoryItem) => void
  onLoadMore: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const result = state?.status === 'ready' ? state.result : null
  const viewModels = useMemo(
    () =>
      result ? buildGitHistoryViewModels(result.items, buildDefaultGitHistoryColorMap(result)) : [],
    [result]
  )
  const compareRow = compare ? (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      className="mx-4 my-0.5 h-6 justify-start gap-1 px-1 text-[11px] font-normal text-muted-foreground"
      data-testid="folder-branch-compare"
      disabled={compare.busy}
      onClick={compare.onCompare}
    >
      <GitCompare className="size-3 shrink-0" />
      <span className="truncate">{compare.label}</span>
    </Button>
  ) : null

  if (!state || state.status === 'loading') {
    return (
      <>
        {compareRow}
        <div className="px-6 py-1 text-[11px] text-muted-foreground" aria-busy="true">
          {t('auto.components.right.sidebar.FolderRepoScm.loadingCommits', 'Loading commits…')}
        </div>
      </>
    )
  }
  if (state.status === 'error') {
    return (
      <>
        {compareRow}
        <div className="px-6 py-1 text-[11px] text-destructive">{state.error}</div>
      </>
    )
  }
  if (viewModels.length === 0) {
    return (
      <>
        {compareRow}
        <div className="px-6 py-1 text-[11px] text-muted-foreground">
          {t('auto.components.right.sidebar.FolderRepoScm.noCommits', 'No commits yet')}
        </div>
      </>
    )
  }
  return (
    <div data-testid="folder-branch-commits" className="pb-1 pl-4">
      {compareRow}
      {viewModels.map((viewModel) => (
        <div key={viewModel.historyItem.id} data-testid="folder-branch-commit-row">
          <GitHistoryRow viewModel={viewModel} onOpenCommit={onOpenCommit} />
        </div>
      ))}
      {result?.hasMore ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-4 mt-0.5 text-[11px] font-normal text-muted-foreground"
          data-testid="folder-branch-load-more"
          disabled={state.loadingMore === true}
          onClick={onLoadMore}
        >
          {state.loadingMore
            ? t('auto.components.right.sidebar.FolderRepoScm.loadingMore', 'Loading…')
            : t('auto.components.right.sidebar.FolderRepoScm.loadMore', 'Load more')}
        </Button>
      ) : null}
    </div>
  )
}

export function BranchGroup({
  title,
  group,
  branches,
  currentId,
  collapsed,
  onToggle,
  expandedBranches,
  commits,
  onToggleBranch,
  onCheckout,
  checkoutBranchId,
  onOpenCommit,
  onLoadMore,
  onCompare,
  comparingBranchId,
  compareRemoteName
}: {
  title: string
  group: 'local' | 'remote'
  branches: readonly GitHistoryItemRef[]
  currentId: string | null
  collapsed: boolean
  onToggle: () => void
  expandedBranches: ReadonlySet<string>
  commits: Record<string, FolderBranchCommitsState>
  onToggleBranch: (branch: GitHistoryItemRef) => void
  onCheckout: (branch: GitHistoryItemRef) => void
  checkoutBranchId: string | null
  onOpenCommit: (item: GitHistoryItem) => void
  onLoadMore: (branch: GitHistoryItemRef) => void
  onCompare: (branch: GitHistoryItemRef, baseRef: string) => void
  comparingBranchId: string | null
  compareRemoteName: (branch: GitHistoryItemRef) => string | null
}): React.JSX.Element | null {
  const t = useTranslate()
  if (branches.length === 0) {
    return null
  }
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 px-3 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <ChevronDown
          className={cn('size-3 shrink-0 transition-transform', collapsed && '-rotate-90')}
        />
        <span className="truncate">{title}</span>
        <span className="ml-auto tabular-nums">{branches.length}</span>
      </button>
      {!collapsed &&
        branches.map((branch) => {
          const current = branch.id === currentId
          const expanded = expandedBranches.has(branch.id)
          const remoteName = compareRemoteName(branch)
          return (
            <div key={branch.id}>
              <div className="group flex items-center">
                <button
                  type="button"
                  data-testid="folder-branch-row"
                  data-branch={branch.name}
                  aria-expanded={expanded}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 pl-4 pr-1 text-left text-xs hover:bg-accent/50',
                    current && 'font-medium text-foreground'
                  )}
                  onClick={() => onToggleBranch(branch)}
                >
                  <ChevronDown
                    className={cn(
                      'size-3 shrink-0 text-muted-foreground transition-transform',
                      !expanded && '-rotate-90'
                    )}
                  />
                  <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{branch.name}</span>
                  {current && (
                    <Check
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label={t(
                        'auto.components.right.sidebar.FolderRepoScm.currentBranch',
                        'Current'
                      )}
                    />
                  )}
                  {branch.worktreePath && (
                    <span className="ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                      {t('auto.components.right.sidebar.FolderRepoScm.worktreeBadge', 'worktree')}
                    </span>
                  )}
                </button>
                {group === 'local' && !current ? (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="mr-1 shrink-0"
                    data-testid="folder-branch-checkout"
                    data-branch={branch.name}
                    aria-label={t(
                      'auto.components.right.sidebar.FolderRepoScm.checkoutBranch',
                      'Checkout {{branch}}',
                      { branch: branch.name }
                    )}
                    disabled={checkoutBranchId !== null || Boolean(branch.worktreePath)}
                    onClick={() => onCheckout(branch)}
                  >
                    <ArrowUpRight className="size-3" />
                  </Button>
                ) : null}
              </div>
              {expanded && (
                <div data-testid="folder-branch-history" data-branch={branch.name}>
                  <BranchCommits
                    state={commits[branch.id]}
                    {...(current && remoteName
                      ? {
                          compare: {
                            label: t(
                              'auto.components.right.sidebar.FolderRepoScm.compareWith',
                              'Compare {{current}} with {{upstream}}',
                              { current: branch.name, upstream: remoteName }
                            ),
                            busy: comparingBranchId === branch.id,
                            onCompare: () => onCompare(branch, remoteName)
                          }
                        }
                      : {})}
                    onOpenCommit={onOpenCommit}
                    onLoadMore={() => onLoadMore(branch)}
                  />
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
