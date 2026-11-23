import { useEffect, useRef, useState } from 'react'
import { ChevronDown, GitCompare, RefreshCw } from 'lucide-react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { GitHistoryItemRef } from '../../../../../../shared/git/history/git-history-types'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitHistoryCommitActions } from '../sync/use-git-history-commit-actions'
import { useAppStore } from '@/store/index'
import { FOLDER_BRANCH_COMPARE_RUNTIME_CAPABILITY } from '../../../../../../shared/source-control/runtime/source-control-runtime-capabilities'
import { useRuntimeTargetCapability } from './use-runtime-target-capability'
import { BranchGroup } from './folder-branch-group'
import type { FolderNestedRepoScopeEntry } from './folder-nested-repo-scope'
import { useFolderRepoBranches } from './use-folder-repo-branches'
import type { FolderRepoBranchData } from './folder-repo-branch-data'
import { FolderBranchCompareDialog } from './folder-branch-compare-dialog'
import {
  readFolderBranchCache,
  writeFolderBranchExpanded,
  writeFolderBranchExpandedCurrent
} from './folder-branch-cache'

function defaultCompareBase(data: FolderRepoBranchData, headId: string | null): string | null {
  const upstream = data.upstreamName
    ? data.remote.find((ref) => ref.name === data.upstreamName)
    : undefined
  if (upstream && upstream.id !== headId) {
    return upstream.id
  }
  return (
    data.local.find((ref) => ref.id !== headId)?.id ??
    data.remote.find((ref) => ref.id !== headId)?.id ??
    null
  )
}

export function FolderRepoBranchGroup({
  entry,
  expanded,
  selected,
  target,
  onToggleExpanded,
  onCheckedOut
}: {
  entry: FolderNestedRepoScopeEntry
  expanded: boolean
  selected: boolean
  target: RuntimeClientTarget | null
  onToggleExpanded: () => void
  onCheckedOut?: (relativePath: string, branch: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const { repo: nestedRepo, scope: owner } = entry
  const {
    state,
    commits,
    loadCommits,
    loadMore,
    refresh,
    checkout,
    checkoutBranchId,
    compare,
    compareRefs,
    comparingBranchId,
    comparingRefs
  } = useFolderRepoBranches({ owner, target, enabled: expanded })
  const { openHistoryCommitDiff } = useGitHistoryCommitActions({
    activeWorktreeId: owner.worktreeId,
    worktreePath: owner.worktree.path,
    activeRepoTarget: owner.gitCopy?.transport ?? target,
    ownerConnectionId: owner.repo.connectionId,
    resolveSplitTargetGroupId: () => undefined
  })
  const worktreeId = owner.worktreeId
  const compareTarget = owner.gitCopy?.transport ?? target
  const compareSupport = useRuntimeTargetCapability(
    compareTarget,
    FOLDER_BRANCH_COMPARE_RUNTIME_CAPABILITY
  )
  const compareEnvironmentId =
    compareTarget?.kind === 'environment' ? compareTarget.environmentId : null
  const compareHostName = useAppStore((store) =>
    compareEnvironmentId
      ? (store.runtimeEnvironments?.find((environment) => environment.id === compareEnvironmentId)
          ?.name ?? null)
      : null
  )
  const [collapsedGroups, setCollapsedGroups] = useState<Set<'local' | 'remote'>>(() => new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set(readFolderBranchCache(worktreeId)?.expanded ?? [])
  )
  const data = state.status === 'ready' ? state.data : null
  const defaultHeadId = data
    ? (data.currentId ?? data.local[0]?.id ?? data.remote[0]?.id ?? null)
    : null
  const cached = readFolderBranchCache(worktreeId)
  const autoExpandedCurrent = useRef<string | null>(cached?.expandedCurrent ?? null)
  const statusHead = useAppStore((store) => store.gitStatusHeadByWorktree[worktreeId] ?? null)
  const observedHead = useRef(statusHead)
  // Null means detached; the repo row then drops its branch label like a rescan would.
  const reportedBranch = useRef<string | null>(nestedRepo.branch || null)

  useEffect(() => {
    writeFolderBranchExpanded(worktreeId, expandedBranches)
  }, [expandedBranches, worktreeId])

  // A checkout outside Orca reaches us through status polling; reload list and history pages.
  useEffect(() => {
    if (!statusHead) {
      return
    }
    if (observedHead.current === null) {
      // The first status read establishes the baseline; only later changes invalidate.
      observedHead.current = statusHead
      return
    }
    if (observedHead.current === statusHead) {
      return
    }
    observedHead.current = statusHead
    refresh()
  }, [refresh, statusHead])

  useEffect(() => {
    if (!data) {
      return
    }
    const current = data.local.find((ref) => ref.id === data.currentId)?.name ?? null
    if (reportedBranch.current === current) {
      return
    }
    reportedBranch.current = current
    onCheckedOut?.(nestedRepo.relativePath, current)
  }, [data, nestedRepo.relativePath, onCheckedOut])

  useEffect(() => {
    const currentId = data?.currentId
    if (!currentId || autoExpandedCurrent.current === currentId) {
      return
    }
    autoExpandedCurrent.current = currentId
    writeFolderBranchExpandedCurrent(worktreeId, currentId)
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Why: expands the newly loaded current branch, keyed by worktree and branch id.
    setExpandedBranches((prev) => (prev.has(currentId) ? prev : new Set(prev).add(currentId)))
  }, [data, worktreeId])

  useEffect(() => {
    if (!data) {
      return
    }
    for (const id of expandedBranches) {
      const branch =
        data.local.find((ref) => ref.id === id) ?? data.remote.find((ref) => ref.id === id)
      if (branch) {
        loadCommits(branch)
      }
    }
  }, [data, expandedBranches, loadCommits])

  const toggleGroup = (group: 'local' | 'remote'): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  const toggleBranch = (branch: GitHistoryItemRef): void => {
    setExpandedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(branch.id)) {
        next.delete(branch.id)
      } else {
        next.add(branch.id)
      }
      return next
    })
  }

  const compareRemoteName = (branch: GitHistoryItemRef): string | null => {
    if (!data || branch.id !== data.currentId) {
      return null
    }
    return data.upstreamName
  }

  return (
    <div data-testid="folder-branch-repo" data-repo={nestedRepo.relativePath}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="folder-branch-repo-toggle"
          data-repo={nestedRepo.relativePath}
          aria-expanded={expanded}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 pl-3 pr-1 text-left text-xs hover:bg-accent/50',
            selected && 'font-medium text-foreground'
          )}
          onClick={onToggleExpanded}
        >
          <ChevronDown
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              !expanded && '-rotate-90'
            )}
          />
          <span className="truncate">{nestedRepo.displayName}</span>
        </button>
        {expanded ? (
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.compareRefs',
                    'Compare refs'
                  )}
                  disabled={
                    compareSupport !== true || !data || data.local.length + data.remote.length < 2
                  }
                  onClick={() => setCompareOpen(true)}
                >
                  <GitCompare className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('auto.components.right.sidebar.FolderRepoScm.compareRefs', 'Compare refs')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={refresh}
                  disabled={!owner}
                  aria-label={t(
                    'auto.components.right.sidebar.FolderRepoScm.refreshBranches',
                    'Refresh branches'
                  )}
                >
                  <RefreshCw
                    className={cn('size-3.5', state.status === 'loading' && 'animate-spin')}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  'auto.components.right.sidebar.FolderRepoScm.refreshBranches',
                  'Refresh branches'
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="pb-1">
          {state.status === 'loading' || state.status === 'idle' ? (
            <div className="space-y-2 px-3 pb-2" aria-busy="true">
              <div className="h-2 w-2/3 rounded bg-muted" />
              <div className="h-2 w-1/2 rounded bg-muted" />
            </div>
          ) : state.status === 'error' ? (
            <div className="px-3 pb-2 text-xs text-destructive">{state.error}</div>
          ) : data && data.local.length === 0 && data.remote.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-muted-foreground">
              {t('auto.components.right.sidebar.FolderRepoScm.noBranches', 'No branches found.')}
            </div>
          ) : data ? (
            <>
              <BranchGroup
                title={t('auto.components.right.sidebar.FolderRepoScm.localBranches', 'Local')}
                group="local"
                branches={data.local}
                currentId={data.currentId}
                collapsed={collapsedGroups.has('local')}
                onToggle={() => toggleGroup('local')}
                expandedBranches={expandedBranches}
                commits={commits}
                onToggleBranch={toggleBranch}
                onCheckout={(branch) => void checkout(branch)}
                checkoutBranchId={checkoutBranchId}
                onOpenCommit={(item) => void openHistoryCommitDiff(item)}
                onLoadMore={(branch) => void loadMore(branch)}
                onCompare={(branch, baseRef) => void compare(branch, baseRef)}
                comparingBranchId={comparingBranchId}
                compareRemoteName={compareRemoteName}
                compareEnabled={compareSupport === true}
              />
              <BranchGroup
                title={t('auto.components.right.sidebar.FolderRepoScm.remoteBranches', 'Remote')}
                group="remote"
                branches={data.remote}
                currentId={data.currentId}
                collapsed={collapsedGroups.has('remote')}
                onToggle={() => toggleGroup('remote')}
                expandedBranches={expandedBranches}
                commits={commits}
                onToggleBranch={toggleBranch}
                onCheckout={(branch) => void checkout(branch)}
                checkoutBranchId={checkoutBranchId}
                onOpenCommit={(item) => void openHistoryCommitDiff(item)}
                onLoadMore={(branch) => void loadMore(branch)}
                onCompare={(branch, baseRef) => void compare(branch, baseRef)}
                comparingBranchId={comparingBranchId}
                compareRemoteName={compareRemoteName}
                compareEnabled={compareSupport === true}
              />
              {compareSupport === false ? (
                <p className="px-3 py-1 text-[11px] text-muted-foreground">
                  {t(
                    'auto.components.right.sidebar.FolderRepoScm.compareUpgrade',
                    'Update Orca on {{host}} to compare branches.',
                    { host: compareHostName ?? 'the host' }
                  )}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {compareOpen && data ? (
        <FolderBranchCompareDialog
          local={data.local}
          remote={data.remote}
          defaultBaseId={defaultCompareBase(data, defaultHeadId)}
          defaultHeadId={defaultHeadId}
          busy={comparingRefs}
          onCancel={() => setCompareOpen(false)}
          onCompare={(baseRef, headRef) => {
            void compareRefs(baseRef, headRef).then(() => setCompareOpen(false))
          }}
        />
      ) : null}
    </div>
  )
}
