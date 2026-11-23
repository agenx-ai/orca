import { defineMethod } from '../../../core'
import { WorktreeSelector } from '../../../../../../shared/rpc-contract/source-control/git-params'
import {
  GitRemoteAdd,
  GitRemoteNameParams
} from '../../../../../../shared/rpc-contract/source-control/git-remote-params'

export const GIT_REMOTE_METHODS = [
  defineMethod({
    name: 'git.remoteList',
    permission: 'workspace',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => runtime.listRuntimeGitRemotes(params.worktree)
  }),
  defineMethod({
    name: 'git.remoteAdd',
    permission: 'workspace',
    params: GitRemoteAdd,
    handler: async (params, { runtime }) =>
      runtime.addRuntimeGitRemote(params.worktree, params.name, params.url)
  }),
  defineMethod({
    name: 'git.remoteRemove',
    permission: 'workspace',
    params: GitRemoteNameParams,
    handler: async (params, { runtime }) =>
      runtime.removeRuntimeGitRemote(params.worktree, params.name)
  }),
  defineMethod({
    name: 'git.remoteFetch',
    permission: 'workspace',
    params: GitRemoteNameParams,
    handler: async (params, { runtime }) =>
      runtime.fetchRuntimeGitRemote(params.worktree, params.name)
  })
]
