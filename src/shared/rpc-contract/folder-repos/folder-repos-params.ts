import { z } from 'zod'

export const FolderReposScan = z.object({
  folderWorktree: z.string().min(1, 'Missing folder selector'),
  /** Client-generated id used by scanProgress/cancelScan. */
  scanId: z.string().min(1).max(100).optional(),
  options: z
    .object({
      maxDepth: z.number().int().min(1).max(8).optional(),
      maxRepos: z.number().int().min(1).max(500).optional(),
      timeoutMs: z.number().int().min(500).max(30_000).nullable().optional()
    })
    .optional()
})

export const FolderReposSettings = z.object({
  folderWorktree: z.string().min(1, 'Missing folder selector')
})

export const FolderReposScanQuery = z.object({
  folderWorktree: z.string().min(1, 'Missing folder selector'),
  scanId: z.string().min(1).max(100)
})
