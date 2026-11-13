import { describe, expect, it } from 'vitest'
import { READ_MS, waitsItsTurn } from '../src/ui/turn.ts'

describe('a slip nobody asked for waits its turn', () => {
  const at = 100_000
  it('waits while the one row holds a warning that has only just come up', () => {
    expect(waitsItsTurn([{ level: 'warn', born: at - 1000 }], 1, at)).toBe(true)
    expect(waitsItsTurn([{ level: 'bad', born: at - READ_MS + 1 }], 1, at)).toBe(true)
  })
  it('waits while the one row answers the player\'s own press, until it has been read', () => {
    expect(waitsItsTurn([{ level: 'info', born: at - 1000, answer: true }], 1, at)).toBe(true)
    expect(waitsItsTurn([{ level: 'info', born: at - READ_MS, answer: true }], 1, at)).toBe(false)
  })
  it('goes up once the warning has had time to be read', () => {
    expect(waitsItsTurn([{ level: 'warn', born: at - READ_MS }], 1, at)).toBe(false)
  })
  it('goes up at once over plain news, and where a row is free', () => {
    expect(waitsItsTurn([{ level: 'info', born: at - 10 }], 1, at)).toBe(false)
    expect(waitsItsTurn([{ level: 'good', born: at - 10 }], 1, at)).toBe(false)
    expect(waitsItsTurn([{ level: 'warn', born: at - 10 }], 2, at)).toBe(false)
    expect(waitsItsTurn([], 1, at)).toBe(false)
  })
})
