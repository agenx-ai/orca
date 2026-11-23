import { ArrowDown, ArrowUp } from 'lucide-react'
import type { GitBranchUpstream } from '../../../../../../shared/git/history/git-history-types'
import { useTranslate } from '@/i18n/use-translate'

export function BranchUpstreamBadge({
  upstream
}: {
  upstream: GitBranchUpstream | undefined
}): React.JSX.Element | null {
  const t = useTranslate()
  if (!upstream) {
    return null
  }
  if (upstream.gone) {
    const label = t('sourceControl.branchUpstream.gone', 'Upstream {{upstream}} is gone', {
      upstream: upstream.name
    })
    return (
      <span className="shrink-0 text-[10px] text-muted-foreground" title={label} aria-label={label}>
        {t('sourceControl.branchUpstream.goneShort', 'gone')}
      </span>
    )
  }
  if (upstream.ahead === 0 && upstream.behind === 0) {
    return null
  }
  const label = t(
    'sourceControl.branchUpstream.counts',
    '{{ahead}} ahead, {{behind}} behind {{upstream}}',
    { ahead: upstream.ahead, behind: upstream.behind, upstream: upstream.name }
  )
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-muted-foreground"
      title={label}
      aria-label={label}
    >
      {upstream.ahead > 0 ? (
        <span className="flex items-center gap-px">
          <ArrowUp className="size-3" aria-hidden="true" />
          {upstream.ahead}
        </span>
      ) : null}
      {upstream.behind > 0 ? (
        <span className="flex items-center gap-px">
          <ArrowDown className="size-3" aria-hidden="true" />
          {upstream.behind}
        </span>
      ) : null}
    </span>
  )
}
