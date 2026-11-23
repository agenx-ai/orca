import { z } from 'zod'
import { WorktreeSelector } from './git-params'

const GitStashIndex = z.number().int().min(0).max(100_000)

export const GitStashCreate = WorktreeSelector.extend({
  message: z.string().max(1000).optional(),
  includeUntracked: z.boolean().optional()
})

export const GitStashApply = WorktreeSelector.extend({
  index: GitStashIndex,
  pop: z.boolean().optional()
})

export const GitStashDrop = WorktreeSelector.extend({
  index: GitStashIndex
})
