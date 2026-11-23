import { defineMethod } from '../../../core'
import { WorktreeSelector } from '../../../../../../shared/rpc-contract/source-control/git-params'

export const GIT_RECOVERY_METHODS = [
  defineMethod({
    name: 'git.mutationInFlight',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.getRuntimeGitMutationInFlight(params.worktree)
  }),
  defineMethod({
    name: 'git.abortMerge',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.abortRuntimeGitMerge(params.worktree)
  }),
  defineMethod({
    name: 'git.completeMerge',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.completeRuntimeGitMerge(params.worktree)
  }),
  defineMethod({
    name: 'git.abortRebase',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.abortRuntimeGitRebase(params.worktree)
  })
]
