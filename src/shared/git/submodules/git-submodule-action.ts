export const GIT_SUBMODULE_ACTIONS = ['init', 'update', 'sync'] as const

export type GitSubmoduleAction = (typeof GIT_SUBMODULE_ACTIONS)[number]

/** Polled while a server-side submodule task runs; finished entries stay readable briefly. */
export type GitSubmoduleTaskProgress = {
  active: boolean
  cancelled: boolean
  steps: number
  lastLine: string | null
  error: string | null
}
