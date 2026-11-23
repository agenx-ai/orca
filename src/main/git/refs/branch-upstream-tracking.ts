import type { RuntimeGitBranchUpstream } from '../../../shared/worktree/catalog/runtime-worktree-contracts'

// lstrip=2 keeps the same name branch labels use; `:short` disambiguates same-named tags.
export const BRANCH_UPSTREAM_TRACKING_ARGS = [
  'for-each-ref',
  '--format=%(refname:lstrip=2)%00%(upstream:short)%00%(upstream:track)',
  'refs/heads'
]

/** `upstream:track` prints `[ahead N, behind M]` or `[gone]` after equal counts. */
export function parseBranchUpstreamTracking(
  stdout: string
): Record<string, RuntimeGitBranchUpstream> {
  const upstreams: Record<string, RuntimeGitBranchUpstream> = Object.create(null)
  for (const line of stdout.split('\n')) {
    if (!line) {
      continue
    }
    const [name, upstream, track = ''] = line.replace(/\r$/, '').split('\0')
    if (!name || !upstream) {
      continue
    }
    if (track === '[gone]') {
      upstreams[name] = { name: upstream, ahead: 0, behind: 0, gone: true }
      continue
    }
    upstreams[name] = {
      name: upstream,
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0)
    }
  }
  return upstreams
}
