export type GitRemoteEntry = {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}

/** Guards option injection and ambiguous argv; Git rejects other malformed names. */
export function isSafeGitRemoteName(name: string): boolean {
  return /^[^\s-][^\s]*$/.test(name)
}

export function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

export function isSafeGitRemoteUrl(url: string): boolean {
  return url.length > 0 && !url.startsWith('-') && !hasControlCharacter(url)
}
