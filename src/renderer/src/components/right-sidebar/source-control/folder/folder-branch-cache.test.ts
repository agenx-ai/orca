import { describe, expect, it } from 'vitest'
import { readFolderBranchCache, writeFolderBranchExpanded } from './folder-branch-cache'

describe('folder branch cache LRU', () => {
  it('evicts the least recently read worktree beyond the cap', () => {
    for (let index = 0; index < 8; index += 1) {
      writeFolderBranchExpanded(`wt-${index}`, new Set([`branch-${index}`]))
    }
    // Refreshing wt-0 makes wt-1 the oldest entry.
    expect(readFolderBranchCache('wt-0')?.expanded).toEqual(new Set(['branch-0']))
    writeFolderBranchExpanded('wt-8', new Set(['branch-8']))

    expect(readFolderBranchCache('wt-1')).toBeNull()
    expect(readFolderBranchCache('wt-0')).not.toBeNull()
    expect(readFolderBranchCache('wt-8')).not.toBeNull()
  })
})
