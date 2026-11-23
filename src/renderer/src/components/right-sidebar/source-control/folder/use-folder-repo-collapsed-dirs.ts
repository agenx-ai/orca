import { useState } from 'react'
import { readFolderRepoCollapsedDirs, writeFolderRepoCollapsedDirs } from './folder-repo-view-cache'

/** Collapsed directory nodes remembered per folder root across folder switches. */
export function useFolderRepoCollapsedDirs(
  rootKey: string
): [ReadonlySet<string>, (key: string) => void] {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
    readFolderRepoCollapsedDirs(rootKey)
  )
  const toggle = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      writeFolderRepoCollapsedDirs(rootKey, next)
      return next
    })
  }
  return [collapsed, toggle]
}
