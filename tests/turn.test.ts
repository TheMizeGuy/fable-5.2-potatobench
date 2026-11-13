import { describe, expect, it } from 'vitest'
import { READ_MS, waitsItsTurn } from '../src/ui/turn.ts'

describe('a slip nobody asked for waits its turn', () => {
  const at = 100_000
  it('waits while the one row holds something that has only just come up', () => {
    expect(waitsItsTurn([{ born: at - 1000 }], 1, at)).toBe(true)
    expect(waitsItsTurn([{ born: at - READ_MS + 1 }], 1, at)).toBe(true)
  })
  it('goes up once that has had time to be read', () => {
    expect(waitsItsTurn([{ born: at - READ_MS }], 1, at)).toBe(false)
  })
  it('goes up at once where a row is free', () => {
    expect(waitsItsTurn([{ born: at - 10 }], 2, at)).toBe(false)
    expect(waitsItsTurn([], 1, at)).toBe(false)
  })
})
