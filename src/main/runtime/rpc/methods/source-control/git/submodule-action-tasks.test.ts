import { expect, it, vi } from 'vitest'
import {
  cancelSubmoduleActionTask,
  readSubmoduleActionTaskProgress,
  startSubmoduleActionTask
} from './submodule-action-tasks'

const WORKTREE = 'id:workspace'

it('counts completed submodules and keeps the last stderr line', async () => {
  let emit: (chunk: string) => void = () => {}
  let release: () => void = () => {}
  const taskId = startSubmoduleActionTask({
    worktreeSelector: WORKTREE,
    action: 'update',
    run: ({ onStderr }) =>
      new Promise<void>((resolve) => {
        emit = onStderr
        release = resolve
      })
  })

  emit("Submodule path 'a': checked out '1'\nCloning into 'b'...\n")
  expect(readSubmoduleActionTaskProgress(WORKTREE, taskId)).toMatchObject({
    active: true,
    cancelled: false,
    steps: 1,
    lastLine: "Cloning into 'b'..."
  })

  release()
  await vi.waitFor(() =>
    expect(readSubmoduleActionTaskProgress(WORKTREE, taskId)).toMatchObject({
      active: false,
      cancelled: false,
      error: null
    })
  )
})

it('marks a cancelled run instead of reporting an error', async () => {
  const taskId = startSubmoduleActionTask({
    worktreeSelector: WORKTREE,
    action: 'init',
    run: ({ signal }) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
  })

  expect(cancelSubmoduleActionTask(WORKTREE, taskId)).toBe(true)
  await vi.waitFor(() =>
    expect(readSubmoduleActionTaskProgress(WORKTREE, taskId)).toMatchObject({
      active: false,
      cancelled: true,
      error: null
    })
  )
  expect(cancelSubmoduleActionTask(WORKTREE, taskId)).toBe(false)
})
