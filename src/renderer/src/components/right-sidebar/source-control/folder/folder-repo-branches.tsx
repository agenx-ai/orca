import { useEffect, useState } from 'react'
import { ListFilter } from 'lucide-react'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SourceControlScopeProvider } from '../panel/worktree-scope'
import { SectionHeader } from './folder-section-header'
import { FolderRepoBranchGroup } from './folder-repo-branch-group'
import type { FolderNestedRepoScopeEntry } from './folder-nested-repo-scope'

function RepoFilterMenu({
  entries,
  hiddenPaths,
  onToggle,
  onShowAll
}: {
  entries: readonly FolderNestedRepoScopeEntry[]
  hiddenPaths: ReadonlySet<string>
  onToggle: (relativePath: string, visible: boolean) => void
  onShowAll: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const label = t(
    'auto.components.right.sidebar.FolderRepoScm.filterRepositories',
    'Filter repositories'
  )
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={label}
              data-testid="folder-branch-repo-filter"
            >
              <ListFilter className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t('auto.components.right.sidebar.FolderRepoScm.repositories', 'Repositories')}
        </DropdownMenuLabel>
        {entries.map((entry) => (
          <DropdownMenuCheckboxItem
            key={entry.repo.relativePath}
            checked={!hiddenPaths.has(entry.repo.relativePath)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onToggle(entry.repo.relativePath, checked === true)}
          >
            {entry.repo.displayName}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={hiddenPaths.size === 0} onSelect={onShowAll}>
          {t(
            'auto.components.right.sidebar.FolderRepoScm.showAllRepositories',
            'Show all repositories'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FolderRepoBranchesSection({
  entries,
  selectedPath,
  target,
  onCheckedOut
}: {
  entries: readonly FolderNestedRepoScopeEntry[]
  selectedPath: string | null
  target: RuntimeClientTarget | null
  onCheckedOut?: (relativePath: string, branch: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const [hiddenPaths, setHiddenPaths] = useState<ReadonlySet<string>>(() => new Set())
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(selectedPath ? [selectedPath] : [])
  )

  // The selected repository's group is the one expanded by default; older expansions fold away.
  useEffect(() => {
    if (!selectedPath) {
      return
    }
    setExpandedPaths(new Set([selectedPath]))
  }, [selectedPath])

  const visibleEntries = entries.filter((entry) => !hiddenPaths.has(entry.repo.relativePath))
  const toggleExpanded = (relativePath: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(relativePath)) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
      }
      return next
    })
  }
  const setRepoVisible = (relativePath: string, visible: boolean): void => {
    setHiddenPaths((prev) => {
      const next = new Set(prev)
      if (visible) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
      }
      return next
    })
  }

  return (
    <section className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border">
      <SectionHeader
        title={t('auto.components.right.sidebar.FolderRepoScm.branches', 'Branches')}
        detail={
          entries.length > 1
            ? t(
                'auto.components.right.sidebar.FolderRepoScm.showingRepositories',
                '{{visible}} of {{total}} repositories',
                { visible: visibleEntries.length, total: entries.length }
              )
            : entries[0]?.repo.displayName
        }
        actions={
          entries.length > 1 ? (
            <RepoFilterMenu
              entries={entries}
              hiddenPaths={hiddenPaths}
              onToggle={setRepoVisible}
              onShowAll={() => setHiddenPaths(new Set())}
            />
          ) : undefined
        }
      />
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-1">
        {entries.length === 0 ? (
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.selectRepoBranches',
              'Select a repository to view branches.'
            )}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="px-3 pb-2 text-xs text-muted-foreground">
            {t(
              'auto.components.right.sidebar.FolderRepoScm.noRepositoriesSelected',
              'No repositories selected.'
            )}
          </div>
        ) : (
          visibleEntries.map((entry) => (
            <SourceControlScopeProvider
              key={entry.scope.worktreeId}
              owner={entry.scope}
              active={expandedPaths.has(entry.repo.relativePath)}
            >
              <FolderRepoBranchGroup
                entry={entry}
                expanded={expandedPaths.has(entry.repo.relativePath)}
                selected={entry.repo.relativePath === selectedPath}
                target={target}
                onToggleExpanded={() => toggleExpanded(entry.repo.relativePath)}
                {...(onCheckedOut ? { onCheckedOut } : {})}
              />
            </SourceControlScopeProvider>
          ))
        )}
      </div>
    </section>
  )
}
