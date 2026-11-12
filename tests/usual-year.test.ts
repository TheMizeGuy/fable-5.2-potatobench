import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { againstUsual, USUAL_YEAR } from '../src/ui/usual-year.ts'

const record = loadWorld()

// A first year played by the coach's advice, every lot sold when it says, to the ledger: the cash it gained or lost.
function firstYear(seed: number): number | null {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
    for (const a of S.advise(w, c)) {
      if (a.act === 'wait' || a.act === 'close') continue
      if (a.act === 'sell') S.apply(w, c, { t: 'sell', lot: a.lot, frac: 1 })
      else S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
    }
    S.apply(w, c, { t: 'day' })
  }
  S.apply(w, c, { t: 'endSeason' })
  for (let k = 0; k < 12 && c.phase === 'cellar'; k++) {
    for (const a of S.advise(w, c)) if (a.act === 'sell') S.apply(w, c, { t: 'sell', lot: a.lot, frac: 1 })
    S.apply(w, c, { t: 'month' })
  }
  const y = c.history[0]
  return y ? y.cashEnd - y.cashStart : null
}

describe('what a usual year does to the balance', () => {
  it('the range said is the middle half of first years played by the advice', () => {
    const ends = Array.from({ length: 60 }, (_, k) => firstYear(k + 1)).filter((x): x is number => x !== null).sort((a, b) => a - b)
    const q = (p: number) => ends[Math.floor(p * ends.length)]
    expect(ends.length).toBeGreaterThan(50)
    expect(Math.abs(q(0.25) - USUAL_YEAR.lo)).toBeLessThan(3000)
    expect(Math.abs(q(0.5) - USUAL_YEAR.mid)).toBeLessThan(3000)
    expect(Math.abs(q(0.75) - USUAL_YEAR.hi)).toBeLessThan(3000)
  })

  it('a year end says better, worse or usual against that range', () => {
    expect(againstUsual(2000)).toMatch(/^Better/)
    expect(againstUsual(-30000)).toMatch(/^Worse/)
    expect(againstUsual(-12000)).toMatch(/^A usual year/)
  })
})
