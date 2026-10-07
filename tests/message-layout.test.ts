import {describe, expect, test} from 'bun:test'
import {layoutMessages} from '../packages/chat/src/core/message-layout'
import type {Message} from '../packages/chat/src/core/types'

function message(id: string, senderId: string, createdAt: string): Message {
  return {_id: id, senderId, receiverId: 'other', content: id, createdAt, readAt: null}
}

describe('message layout', () => {
  test('groups consecutive sender bubbles while timestamp groups span sender changes', () => {
    const rows = layoutMessages([
      message('a', 'you', '2026-09-28T16:35:00'),
      message('b', 'you', '2026-09-28T16:36:00'),
      message('c', 'alice', '2026-09-28T16:37:00'),
    ])
    expect(rows.map(row => [row.startsRun, row.endsRun])).toEqual([[true, false], [false, true], [true, true]])
    expect(rows[0]!.timestamp).toMatch(/^Monday 28 Sept? • 4:35\s+pm$/)
    expect(rows.slice(1).map(row => row.timestamp)).toEqual([null, null])
    expect(rows.map(row => row.message._id)).toEqual(['a', 'b', 'c'])
  })
  test('splits sender runs at a five-minute pause or local midnight', () => {
    const rows = layoutMessages([
      message('a', 'you', '2026-09-28T23:53:00'),
      message('b', 'you', '2026-09-28T23:58:00'),
      message('c', 'you', '2026-09-29T00:01:00'),
    ])
    expect(rows.every(row => row.startsRun && row.endsRun && row.timestamp !== null)).toBe(true)
    expect(rows[2]!.timestamp).toMatch(/^Tuesday 29 Sept? • 12:01\s+am$/)
  })
  test('handles empty and invalid dates and recomputes runs after history prepends', () => {
    expect(layoutMessages([])).toEqual([])
    const invalid = layoutMessages([message('invalid', 'you', 'bad date')])
    expect(invalid[0]!.timestamp).toBeNull()
    const latest = message('latest', 'you', '2026-09-28T16:36:00')
    expect(layoutMessages([latest])[0]!.startsRun).toBe(true)
    const prepended = layoutMessages([message('earlier', 'you', '2026-09-28T16:35:00'), latest])
    expect(prepended[1]!.startsRun).toBe(false)
    expect(prepended[1]!.timestamp).toBeNull()
  })
})
