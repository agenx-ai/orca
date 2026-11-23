import { List, ListTree, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import type { FolderRepoViewMode } from './folder-repository-tree'

/** Manual list/tree choice; `auto` keeps the flat list until paths nest. */
export function FolderRepoViewMenu({
  viewMode,
  onChange
}: {
  viewMode: FolderRepoViewMode
  onChange: (mode: FolderRepoViewMode) => void
}): React.JSX.Element {
  const t = useTranslate()
  const label = t('auto.components.right.sidebar.FolderRepoScm.repositoryView', 'Repository view')
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              data-testid="folder-repos-view-mode"
              aria-label={label}
            >
              {viewMode === 'list' ? (
                <List className="size-3.5" />
              ) : viewMode === 'tree' ? (
                <ListTree className="size-3.5" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={viewMode}
          onValueChange={(mode) => onChange(mode === 'list' || mode === 'tree' ? mode : 'auto')}
        >
          <DropdownMenuRadioItem value="auto">
            {t('auto.components.right.sidebar.FolderRepoScm.viewAutomatic', 'Automatic')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">
            {t('auto.components.right.sidebar.FolderRepoScm.viewList', 'List')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="tree">
            {t('auto.components.right.sidebar.FolderRepoScm.viewTree', 'Tree')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
