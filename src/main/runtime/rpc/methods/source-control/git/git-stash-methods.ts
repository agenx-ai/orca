import { defineMethod } from '../../../core'
import { WorktreeSelector } from '../../../../../../shared/rpc-contract/source-control/git-params'
import {
  GitStashApply,
  GitStashCreate,
  GitStashDrop
} from '../../../../../../shared/rpc-contract/source-control/git-stash-params'

export const GIT_STASH_METHODS = [
  defineMethod({
    name: 'git.stashList',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.listRuntimeGitStashes(params.worktree)
  }),
  defineMethod({
    name: 'git.stashCreate',
    permission: 'workspace',
    params: GitStashCreate,
    handler: async (params, { runtime }) =>
      runtime.createRuntimeGitStash(params.worktree, {
        ...(params.message === undefined ? {} : { message: params.message }),
        ...(params.includeUntracked === undefined
          ? {}
          : { includeUntracked: params.includeUntracked })
      })
  }),
  defineMethod({
    name: 'git.stashApply',
    permission: 'workspace',
    params: GitStashApply,
    handler: async (params, { runtime }) =>
      runtime.applyRuntimeGitStash(
        params.worktree,
        params.index,
        params.pop === true,
        params.commit
      )
  }),
  defineMethod({
    name: 'git.stashDrop',
    permission: 'workspace',
    params: GitStashDrop,
    handler: async (params, { runtime }) =>
      runtime.dropRuntimeGitStash(params.worktree, params.index, params.commit)
  })
]
