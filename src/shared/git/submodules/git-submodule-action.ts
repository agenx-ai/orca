export const GIT_SUBMODULE_ACTIONS = ['init', 'update', 'sync'] as const

export type GitSubmoduleAction = (typeof GIT_SUBMODULE_ACTIONS)[number]
