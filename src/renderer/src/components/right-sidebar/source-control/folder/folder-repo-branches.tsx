import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { GitHistoryItemRef } from '../../../../../../shared/git/history/git-history-types'
import type { FolderNestedRepo } from '../../../../../../shared/folder-workspaces/folder-nested-git'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitHistoryCommitActions } from '../sync/use-git-history-commit-actions'
import { useAppStore } from '@/store/index'
import { BranchGroup } from './folder-branch-group'
import { SourceControlScopeProvider, type SourceControlScope } from '../panel/worktree-scope'
import { SectionHeader } from './folder-section-header'
import { useFolderRepoBranches } from './use-folder-repo-branches'
import {
  readFolderBranchCache,
  writeFolderBranchExpanded,
  writeFolderBranchExpandedCurrent
} from './folder-branch-cache'

function FolderRepoBranchesBody({
  owner,
  selectedRepo,
  target,
  onCheckedOut
}: {
  owner: SourceControlScope
  selectedRepo: FolderNestedRepo | null
  target: RuntimeClientTarget | null
  onCheckedOut?: (branch: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const {
    state,
    commits,
    loadCommits,
    loadMore,
    refresh,
    checkout,
    checkoutBranchId,
    compare,
    comparingBranchId
  } = useFolderRepoBranches({ owner, target })
  const { openHistoryCommitDiff } = useGitHistoryCommitActions({
    activeWorktreeId: owner.worktreeId,
    worktreePath: owner.worktree.path,
    activeRepoTarget: owner.gitCopy?.transport ?? target,
    ownerConnectionId: owner.repo.connectionId,
    resolveSplitTargetGroupId: () => undefined
  })
  const worktreeId = owner.worktreeId
  const [collapsedGroups, setCollapsedGroups] = useState<Set<'local' | 'remote'>>(() => new Set())
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set(readFolderBranchCache(worktreeId)?.expanded ?? [])
  )
  const data = state.status === 'ready' ? state.data : null
  const cached = readFolderBranchCache(worktreeId)
  const autoExpandedCurrent = useRef<string | null>(cached?.expandedCurrent ?? null)
  const statusHead = useAppStore((store) => store.gitStatusHeadByWorktree[worktreeId] ?? null)
  const observedHead = useRef(statusHead)
  // Null means detached; the repo row then drops its branch label like a rescan would.
  const reportedBranch = useRef<string | null>(selectedRepo?.branch || null)

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
    onCheckedOut?.(current)
  }, [data, onCheckedOut])

  useEffect(() => {
    const currentId = data?.currentId
    if (!currentId || autoExpandedCurrent.current === currentId) {
      return
    }
    autoExpandedCurrent.current = currentId
    writeFolderBranchExpandedCurrent(worktreeId, currentId)
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
    <section className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border">
      <SectionHeader
        title={t('auto.components.right.sidebar.FolderRepoScm.branches', 'Branches')}
        detail={selectedRepo?.displayName}
        actions={
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
              {t('auto.components.right.sidebar.FolderRepoScm.refreshBranches', 'Refresh branches')}
            </TooltipContent>
          </Tooltip>
        }
      />
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-1">
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
            />
          </>
        ) : null}
      </div>
    </section>
  )
}

export function FolderRepoBranchesSection({
  owner,
  selectedRepo,
  target,
  onCheckedOut
}: {
  owner: SourceControlScope | null
  selectedRepo: FolderNestedRepo | null
  target: RuntimeClientTarget | null
  onCheckedOut?: (branch: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  if (!owner) {
    return (
      <section className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border">
        <SectionHeader
          title={t('auto.components.right.sidebar.FolderRepoScm.branches', 'Branches')}
          detail={selectedRepo?.displayName}
        />
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          {t(
            'auto.components.right.sidebar.FolderRepoScm.selectRepoBranches',
            'Select a repository to view branches.'
          )}
        </div>
      </section>
    )
  }
  return (
    <SourceControlScopeProvider owner={owner} active>
      <FolderRepoBranchesBody
        owner={owner}
        selectedRepo={selectedRepo}
        target={target}
        {...(onCheckedOut ? { onCheckedOut } : {})}
      />
    </SourceControlScopeProvider>
  )
}
