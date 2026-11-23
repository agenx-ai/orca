import { expect, it } from 'vitest'
import { parseBranchUpstreamTracking } from './branch-upstream-tracking'

it('parses ahead, behind, gone, and up-to-date tracking states', () => {
  const stdout = [
    'main\0origin/main\0[ahead 1, behind 2]',
    'feature\0origin/feature\0[gone]',
    'clean\0origin/clean\0',
    'local-only\0\0',
    ''
  ].join('\n')
  expect(parseBranchUpstreamTracking(stdout)).toEqual({
    main: { name: 'origin/main', ahead: 1, behind: 2 },
    feature: { name: 'origin/feature', ahead: 0, behind: 0, gone: true },
    clean: { name: 'origin/clean', ahead: 0, behind: 0 }
  })
})

it('treats a trailing carriage return as line punctuation', () => {
  expect(parseBranchUpstreamTracking('main\0origin/main\0[ahead 3]\r\n')).toEqual({
    main: { name: 'origin/main', ahead: 3, behind: 0 }
  })
})
