export type GitProviderStatusOptions = {
  admissionTier?: 'interactive' | 'status' | 'background'
  includeIgnored?: boolean
  includeLineStats?: boolean
  bypassEffectiveUpstreamNegativeCache?: boolean
  reuseLineStats?: boolean
  /** Merge-base OID to measure the branch line total against; omit to skip the work. */
  branchLineTotalMergeBase?: string
  /** git.ignoreSubmodules override; omit to keep Git's configured behavior. */
  ignoreSubmodules?: 'all' | 'dirty' | 'untracked'
  signal?: AbortSignal
}
