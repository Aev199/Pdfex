import { describe, expect, it } from 'vitest'
import type { CommentMap } from './types'
import {
  createReply,
  createThread,
  editedThread,
  formatWhen,
  orderedThreads,
  pageAnchor,
  resolvedThread,
  visualAnchor,
  withThread
} from './threads'

describe('comment threads', () => {
  it('maps anchors through Rotate and back', () => {
    const p = { x: 0.2, y: 0.7 }
    for (const rotation of [0, 90, 180, 270]) {
      const back = pageAnchor(visualAnchor(p, rotation), rotation)
      expect(back.x).toBeCloseTo(p.x)
      expect(back.y).toBeCloseTo(p.y)
    }
    // Turned clockwise, the top-left corner goes to the top-right.
    expect(visualAnchor({ x: 0, y: 0 }, 90)).toEqual({ x: 1, y: 0 })
  })

  it('replies, edits, resolves and removes', () => {
    const thread = { ...createThread({ x: 0.5, y: 0.5 }, 'Check this', 'Anna'), id: 't' }
    let map: CommentMap = { p: [thread] }
    const reply = createReply('Fixed', 'Boris')
    map = withThread(map, 'p', 't', (t) => ({ ...t, replies: [...t.replies, reply] }))
    map = withThread(map, 'p', 't', (t) => editedThread(t, reply.id, 'Fixed in rev. B'))
    expect(map.p[0].replies[0].text).toBe('Fixed in rev. B')
    expect(map.p[0].replies[0].editedAt).toBeTruthy()
    map = withThread(map, 'p', 't', (t) => resolvedThread(t, true, 'Anna'))
    expect(map.p[0]).toMatchObject({ resolved: true, resolvedBy: 'Anna' })
    map = withThread(map, 'p', 't', (t) => resolvedThread(t, false, 'Anna'))
    expect(map.p[0].resolvedBy).toBeUndefined()
    expect(withThread(map, 'p', 't', () => null)).toEqual({})
  })

  it('orders pins as the page reads and formats times', () => {
    const a = createThread({ x: 0.9, y: 0.1 }, 'a', 'x')
    const b = createThread({ x: 0.1, y: 0.5 }, 'b', 'x')
    const c = createThread({ x: 0.1, y: 0.1 }, 'c', 'x')
    expect(orderedThreads([a, b, c]).map((t) => t.text)).toEqual(['c', 'a', 'b'])
    const at = new Date(2026, 9, 23, 15, 0)
    expect(formatWhen(new Date(2026, 9, 23, 14, 58).toISOString(), at)).toBe('2 min ago')
    expect(formatWhen(new Date(2026, 9, 23, 9, 5).toISOString(), at)).toBe('09:05')
    expect(formatWhen(new Date(2026, 9, 2).toISOString(), at)).toBe('2 Oct')
    expect(formatWhen(new Date(2025, 0, 2).toISOString(), at)).toBe('2 Jan 2025')
  })
})
