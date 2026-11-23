export type GitStashEntry = {
  index: number
  selector: string
  commit: string
  message: string
  branch: string | null
  date: string | null
}

export type GitStashCreateOptions = {
  message?: string
  includeUntracked?: boolean
}
