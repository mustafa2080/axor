import { describe, expect, it } from 'vitest'
import { errorPageCopy, offlineMessage } from './error-pages.ts'
import { createSingleFlight } from './single-flight.ts'

describe('createSingleFlight', () => {
  it('ignores a second call while the first is still running', async () => {
    const once = createSingleFlight()
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = once(async () => {
      calls += 1
      await gate
      return 'done'
    })
    const second = await once(async () => {
      calls += 1
      return 'again'
    })

    expect(second).toEqual({ started: false })
    release()
    expect(await first).toEqual({ started: true, value: 'done' })
    expect(calls).toBe(1)
  })

  it('allows a new call after the previous one finishes', async () => {
    const once = createSingleFlight()
    expect(await once(async () => 1)).toEqual({ started: true, value: 1 })
    expect(await once(async () => 2)).toEqual({ started: true, value: 2 })
  })

  it('releases the lock when the action throws, and rethrows to the caller', async () => {
    const once = createSingleFlight()
    await expect(
      once(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await once(async () => 'ok')).toEqual({ started: true, value: 'ok' })
  })

  it('keeps separate locks per instance', async () => {
    const a = createSingleFlight()
    const b = createSingleFlight()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = a(() => gate)
    expect(await b(async () => 'free')).toEqual({ started: true, value: 'free' })
    release()
    await pending
  })
})

describe('error page copy', () => {
  it('has a distinct code, title and message for each kind', () => {
    const kinds = Object.keys(errorPageCopy) as Array<keyof typeof errorPageCopy>
    expect(kinds.sort()).toEqual(['crashed', 'forbidden', 'not-found'])
    expect(new Set(kinds.map((kind) => errorPageCopy[kind].code))).toEqual(new Set(['403', '404', '500']))
    for (const kind of kinds) {
      expect(errorPageCopy[kind].title.length).toBeGreaterThan(0)
      expect(errorPageCopy[kind].message.length).toBeGreaterThan(0)
    }
  })

  it('never leaks technical details to the visitor', () => {
    const all = [...Object.values(errorPageCopy).flatMap((c) => [c.title, c.message]), offlineMessage].join(' ')
    expect(all).not.toMatch(/stack|exception|undefined|null|sql|token|http/i)
  })
})
