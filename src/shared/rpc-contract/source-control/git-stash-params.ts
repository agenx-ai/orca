import { z } from 'zod'
import { WorktreeSelector } from './git-params'

const GitStashIndex = z.number().int().min(0).max(100_000)
/** Resolved to a fresh index on the host, so a shifted stash cannot apply or drop the wrong entry. */
const GitStashCommit = z.string().regex(/^[0-9a-f]{7,64}$/i)

export const GitStashCreate = WorktreeSelector.extend({
  message: z.string().max(1000).optional(),
  includeUntracked: z.boolean().optional()
})

export const GitStashApply = WorktreeSelector.extend({
  index: GitStashIndex,
  commit: GitStashCommit.optional(),
  pop: z.boolean().optional()
})

export const GitStashDrop = WorktreeSelector.extend({
  index: GitStashIndex,
  commit: GitStashCommit.optional()
})
