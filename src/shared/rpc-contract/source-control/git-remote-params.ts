import { z } from 'zod'
import { isSafeGitRemoteName, isSafeGitRemoteUrl } from '../../git/remotes/git-remote-entry'
import { WorktreeSelector } from './git-params'

const GitRemoteName = z.string().min(1).max(255).refine(isSafeGitRemoteName, 'Invalid remote name')

export const GitRemoteAdd = WorktreeSelector.extend({
  name: GitRemoteName,
  url: z.string().min(1).max(4096).refine(isSafeGitRemoteUrl, 'Invalid remote URL')
})

export const GitRemoteNameParams = WorktreeSelector.extend({
  name: GitRemoteName
})
