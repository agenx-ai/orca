import { Fragment, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useAppStore } from '@/store/index'
import { cn } from '@/lib/class-names'
import type { Repo } from '../../../../../../shared/repository/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  getRepoExecutionHostId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host/execution-host'
import type { FolderNestedRepo } from '../../../../../../shared/folder-workspaces/folder-nested-git'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SourceControlPanelReady } from '../panel/panel-ready'
import { useSourceControlPanelModel } from '../panel/use-panel-model'
import { SourceControlScopeProvider } from '../panel/worktree-scope'
import { FolderRepositoryTree, type FolderRepoViewMode } from './folder-repository-tree'
import { FolderRepoBranchesSection } from './folder-repo-branches'
import { FolderRepoViewMenu } from './folder-repo-view-menu'
import { FolderSubmoduleActionsMenu } from './folder-submodule-actions-menu'
import { folderNestedRepoScope } from './folder-nested-repo-scope'
import { FolderStashesSection } from './folder-stashes'
import { FolderTagsSection } from './folder-tags'
import { FolderRemotesSection } from './folder-remotes'
import { SectionHeader } from './folder-section-header'
import { folderReposRootKey } from './folder-repos-cache'
import { readFolderRepoViewMode, writeFolderRepoViewMode } from './folder-repo-view-cache'
import { useFolderRepoActions, useFolderReposDisconnected } from './use-folder-repo-actions'
import {
  readFolderRepoSelection,
  rememberFolderRepoSelection,
  useFolderReposScan
} from './use-folder-repos'
import { useFolderNestedRepoStatus } from './use-folder-nested-repo-status'
import { useFolderRepoAutofetch } from './use-folder-repo-autofetch'

const EMPTY_REPOS: readonly FolderNestedRepo[] = []

function NestedRepoChanges(): React.JSX.Element | null {
  const model = useSourceControlPanelModel()
  if (!model.activeRepo || !model.activeWorktree || !model.worktreePath) {
    return null
  }
  return (
    <SourceControlPanelReady
      activeRepo={model.activeRepo}
      activeWorktree={model.activeWorktree}
      currentWorktreeId={model.activeWorktree.id}
      model={model}
      worktreePath={model.worktreePath}
    />
  )
}

function FolderMultiRepoContent({
  folderRepo,
  folderWorktree,
  folderPath,
  target,
  executionHostId,
  rootKey
}: {
  folderRepo: Repo
  folderWorktree: Worktree
  folderPath: string
  target: RuntimeClientTarget | null
  executionHostId: ExecutionHostId
  rootKey: string
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const folderSelector = folderWorktree.id
  const {
    result,
    settingsVerified,
    loading,
    scanning,
    scanProgress,
    stopped,
    error,
    rescan,
    cancelScan,
    updateRepoBranch
  } = useFolderReposScan({
    enabled: true,
    rootKey,
    folderWorktree: folderSelector,
    folderPath,
    connectionId: folderRepo.connectionId ?? null,
    target
  })
  const repos = result?.repos ?? EMPTY_REPOS

  const [requestedPath, setRequestedPath] = useState<string | null>(() =>
    readFolderRepoSelection(rootKey)
  )
  // Keep the remembered repo when it still exists; otherwise fall back to the first repo.
  const selectedPath = useMemo(() => {
    if (requestedPath && repos.some((repo) => repo.relativePath === requestedPath)) {
      return requestedPath
    }
    return repos[0]?.relativePath ?? null
  }, [repos, requestedPath])
  useEffect(() => {
    if (selectedPath) {
      rememberFolderRepoSelection(rootKey, selectedPath)
    }
  }, [rootKey, selectedPath])

  const selectRepo = (relativePath: string): void => {
    setRequestedPath(relativePath)
    rememberFolderRepoSelection(rootKey, relativePath)
  }

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.relativePath === selectedPath) ?? null,
    [repos, selectedPath]
  )

  const repoScopes = useMemo(
    () =>
      repos.flatMap((repo) => {
        const scope = folderNestedRepoScope({
          folderRepo,
          folderWorktree,
          folderPath,
          repo,
          target,
          executionHostId
        })
        return scope ? [{ repo, scope }] : []
      }),
    [executionHostId, folderPath, folderRepo, folderWorktree, repos, target]
  )

  const owner = useMemo(
    () => repoScopes.find((entry) => entry.repo.relativePath === selectedPath)?.scope ?? null,
    [repoScopes, selectedPath]
  )
  useFolderRepoAutofetch(
    repoScopes,
    settingsVerified ? (result?.autofetch ?? false) : false,
    result?.autofetchPeriod ?? 180
  )

  const refreshNestedRepoStatus = useFolderNestedRepoStatus(
    owner,
    settingsVerified && result?.autorefresh === true
  )
  const selectedChangeCount = useAppStore((state) =>
    owner ? (state.gitStatusByWorktree[owner.worktreeId]?.length ?? 0) : 0
  )

  const [viewMode, setViewMode] = useState<FolderRepoViewMode>(() =>
    readFolderRepoViewMode(rootKey)
  )
  const changeViewMode = (mode: FolderRepoViewMode): void => {
    writeFolderRepoViewMode(rootKey, mode)
    setViewMode(mode)
  }

  const disconnected = useFolderReposDisconnected(target, folderRepo.connectionId ?? null)
  const { busyRepo, excludeSupported, runRepoAction } = useFolderRepoActions({
    target,
    folderSelector,
    connectionId: folderRepo.connectionId ?? null,
    repoScopes,
    rescan,
    refreshStatus: refreshNestedRepoStatus,
    onExcluded: (relativePath) =>
      setRequestedPath((current) => (current === relativePath ? null : current))
  })

  return (
    <div className="scrollbar-sleek flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      {disconnected ? (
        <div
          data-testid="folder-repos-disconnected"
          className="shrink-0 border-b border-status-warning-border bg-status-warning-background px-3 py-2 text-xs text-status-warning-text"
        >
          {t(
            'auto.components.right.sidebar.FolderRepoScm.hostDisconnected',
            'The host is disconnected. Reconnect to manage repositories.'
          )}
        </div>
      ) : null}
      <section className="flex max-h-56 min-h-0 shrink-0 flex-col border-b border-border">
        <SectionHeader
          title={t('auto.components.right.sidebar.FolderRepoScm.repositories', 'Repositories')}
          detail={
            repos.length > 0
              ? t('auto.components.right.sidebar.FolderRepoScm.repoCount', '{{count}}', {
                  count: repos.length
                })
              : undefined
          }
          actions={
            <>
              <FolderRepoViewMenu viewMode={viewMode} onChange={changeViewMode} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    onClick={rescan}
                    disabled={!target || scanning || disconnected}
                    aria-label={t(
                      'auto.components.right.sidebar.FolderRepoScm.rescan',
                      'Rescan repositories'
                    )}
                  >
                    <RefreshCw className={cn('size-3.5', scanning && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('auto.components.right.sidebar.FolderRepoScm.rescan', 'Rescan repositories')}
                </TooltipContent>
              </Tooltip>
            </>
          }
        />
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
          {scanning ? (
            <div
              className="flex items-center gap-2 px-3 pb-1 text-xs text-muted-foreground"
              data-testid="folder-repos-scanning"
            >
              <span className="min-w-0 flex-1 truncate">
                {scanProgress !== null
                  ? t(
                      'auto.components.right.sidebar.FolderRepoScm.scanningCount',
                      'Scanning repositories… {{count}}',
                      { count: scanProgress }
                    )
                  : t(
                      'auto.components.right.sidebar.FolderRepoScm.scanning',
                      'Scanning repositories…'
                    )}
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="shrink-0"
                onClick={cancelScan}
              >
                {t('auto.components.right.sidebar.FolderRepoScm.stopScan', 'Stop')}
              </Button>
            </div>
          ) : null}
          {result === null && loading ? (
            <div className="space-y-2 px-3 pb-2" aria-busy="true">
              <div className="h-2 w-3/4 rounded bg-muted" />
              <div className="h-2 w-1/2 rounded bg-muted" />
            </div>
          ) : error ? (
            <div className="px-3 pb-2 text-xs text-destructive">{error}</div>
          ) : repos.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-muted-foreground">
              {t(
                'auto.components.right.sidebar.FolderRepoScm.empty',
                'No Git repositories found in this folder.'
              )}
            </div>
          ) : (
            <FolderRepositoryTree
              rootKey={rootKey}
              repos={repos}
              selectedPath={selectedPath}
              onSelect={selectRepo}
              viewMode={viewMode}
              onAction={runRepoAction}
              actionsDisabled={disconnected || busyRepo !== null}
              busyPath={busyRepo}
              excludeSupported={excludeSupported}
            />
          )}
          {result && (stopped || result.stopped || result.truncated || result.timedOut) ? (
            <div className="px-3 pb-2 text-[11px] text-status-warning-text">
              {stopped || result.stopped
                ? t('auto.components.right.sidebar.FolderRepoScm.stopped', 'Scan was stopped.')
                : result.truncated
                  ? t(
                      'auto.components.right.sidebar.FolderRepoScm.truncated',
                      'Repository limit reached; some repositories were hidden.'
                    )
                  : t(
                      'auto.components.right.sidebar.FolderRepoScm.timedOut',
                      'Scan timed out before finishing.'
                    )}
            </div>
          ) : null}
          {result?.settingsError ? (
            <div className="px-3 pb-2 text-[11px] text-status-warning-text">
              {t(
                'auto.components.right.sidebar.FolderRepoScm.settingsInvalid',
                '.vscode/settings.json could not be read or parsed; scan defaults are in use.'
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex min-h-[18rem] flex-1 flex-col overflow-hidden">
        <SectionHeader
          title={t('auto.components.right.sidebar.FolderRepoScm.changes', 'Changes')}
          detail={
            selectedRepo
              ? `${selectedRepo.displayName}${selectedChangeCount > 0 ? ` · ${selectedChangeCount}` : ''}`
              : undefined
          }
          actions={
            owner && target && selectedRepo?.hasSubmodules ? (
              <FolderSubmoduleActionsMenu
                key={owner.worktreeId}
                target={target}
                worktreeId={owner.worktreeId}
                onChanged={rescan}
              />
            ) : undefined
          }
        />
        <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full">
          {owner ? (
            <SourceControlScopeProvider key={owner.worktreeId} owner={owner} active>
              <NestedRepoChanges />
            </SourceControlScopeProvider>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {t(
                'auto.components.right.sidebar.FolderRepoScm.selectRepo',
                'Select a repository to view changes.'
              )}
            </div>
          )}
        </div>
      </section>

      <FolderRepoBranchesSection
        entries={repoScopes}
        selectedPath={selectedPath}
        target={target}
        onCheckedOut={(relativePath, branch) => updateRepoBranch(relativePath, branch)}
      />

      {/* One key for the whole repo-scoped group: sibling sections must not share a key. */}
      <Fragment key={owner?.worktreeId ?? 'no-repo'}>
        <FolderStashesSection
          owner={owner}
          target={target}
          onChanged={() => void refreshNestedRepoStatus()}
        />

        <FolderTagsSection owner={owner} target={target} />

        <FolderRemotesSection
          owner={owner}
          target={target}
          onChanged={() => void refreshNestedRepoStatus()}
        />
      </Fragment>
    </div>
  )
}

export function FolderMultiRepoSourceControlPanel({
  folderRepo,
  folderWorktree,
  folderPath,
  target
}: {
  folderRepo: Repo
  folderWorktree: Worktree
  folderPath: string
  target: RuntimeClientTarget | null
}): React.JSX.Element {
  const executionHostId: ExecutionHostId =
    folderWorktree.hostId ?? getRepoExecutionHostId(folderRepo)
  const rootKey = folderReposRootKey(executionHostId, folderPath)
  // Remount per folder, so one folder's remembered repo cannot leak into another.
  return (
    <FolderMultiRepoContent
      key={rootKey}
      executionHostId={executionHostId}
      folderPath={folderPath}
      folderRepo={folderRepo}
      folderWorktree={folderWorktree}
      rootKey={rootKey}
      target={target}
    />
  )
}
