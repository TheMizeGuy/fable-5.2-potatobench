import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { expectedFrom } from '../src/ui/ticket-words.ts'

const record = loadWorld()

// A first season played by the advice, each crop sold the day its weigh ticket comes in.
function soldOffTheTicket(seed: number): { w: S.World; c: S.Campaign } {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
    for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
    S.apply(w, c, { t: 'day' })
    for (const l of S.openLots(c)) S.apply(w, c, { t: 'sell', lot: l.id, frac: 1 })
  }
  return { w, c }
}

describe('the weigh ticket and what it charges', () => {
  it('a crop sold off its ticket was never stored, so the year charges no storage for it', () => {
    for (const seed of [1, 2, 3]) {
      const { c } = soldOffTheTicket(seed)
      expect(c.lots.filter(l => l.year === c.year).length, `seed ${seed}`).toBeGreaterThan(0)
      expect(c.yearStorage, `seed ${seed}`).toBe(0)
    }
  })

  it('says the test digs pointed to a range, not that you expected it: the crew digs them on its own', () => {
    expect(expectedFrom(2)).toBe('2 test digs pointed to')
    expect(expectedFrom(1)).toBe('1 test dig pointed to')
    expect(expectedFrom(0)).toBe('By eye it looked like')
    for (const n of [0, 1, 2, 3]) expect(expectedFrom(n)).not.toMatch(/\byou\b/i)
  })
})
