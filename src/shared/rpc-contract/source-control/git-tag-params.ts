import { z } from 'zod'
import { isSafeGitTagName } from '../../git/tags/git-tag'
import { WorktreeSelector } from './git-params'

const GitTagName = z
  .string()
  .min(1)
  .max(255)
  .refine(isSafeGitTagName, 'Tag name must not start with -')

export const GitTagCreate = WorktreeSelector.extend({
  name: GitTagName,
  message: z.string().max(5000).optional()
})

export const GitTagDelete = WorktreeSelector.extend({
  name: GitTagName
})
