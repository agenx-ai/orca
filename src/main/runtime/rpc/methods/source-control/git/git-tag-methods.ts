import { defineMethod } from '../../../core'
import { WorktreeSelector } from '../../../../../../shared/rpc-contract/source-control/git-params'
import {
  GitTagCreate,
  GitTagDelete
} from '../../../../../../shared/rpc-contract/source-control/git-tag-params'

export const GIT_TAG_METHODS = [
  defineMethod({
    name: 'git.tagList',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.listRuntimeGitTags(params.worktree)
  }),
  defineMethod({
    name: 'git.tagCreate',
    permission: 'workspace',
    params: GitTagCreate,
    handler: async (params, { runtime }) =>
      runtime.createRuntimeGitTag(params.worktree, params.name, params.message)
  }),
  defineMethod({
    name: 'git.tagDelete',
    permission: 'workspace',
    params: GitTagDelete,
    handler: async (params, { runtime }) =>
      runtime.deleteRuntimeGitTag(params.worktree, params.name)
  })
]
