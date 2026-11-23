export function SectionHeader({
  title,
  detail,
  actions
}: {
  title: string
  detail?: string
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 px-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {detail ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground">{detail}</span>
      ) : null}
      {actions ? <div className="ml-auto flex items-center gap-1">{actions}</div> : null}
    </div>
  )
}
