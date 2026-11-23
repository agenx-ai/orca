export type GitTagEntry = {
  name: string
  commit: string
  message: string | null
}

/** Guards option injection; Git itself rejects the remaining malformed names. */
export function isSafeGitTagName(name: string): boolean {
  return name.length > 0 && !name.startsWith('-')
}
