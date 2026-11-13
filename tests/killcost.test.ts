import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()

// One step of the coach's season, the kill of one field left to the caller.
function step(w: S.World, c: S.Campaign, hold: number): void {
  for (const a of S.advise(w, c)) {
    if (a.act === 'wait' || a.act === 'close' || a.act === 'sell') continue
    if (a.act === 'kill' && a.field === hold) continue
    S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
  }
  S.apply(w, c, { t: 'day' })
}

// The field's crop at the weigh-in, in hundredweight an acre, whatever its grade.
function weighed(c: S.Campaign, field: number): number {
  const lot = c.lots.find(l => l.year === c.year && l.field === field)
  if (!lot) return NaN
  return (S.lotCwt(lot) + lot.grades.cull) / S.FIELD_ACRES
}

// For a seed: a week or more before a field's kill is due, what the game says killing today costs, against what it
// cost: the same farm run on twice, killed that day in one and when due (when the coach asks) in the other.
function trial(seed: number): { said: number; cost: number } | null {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  const field = c.plans.findIndex((p, i) => S.isField(c, i) && p.crop === 'potato')
  for (let n = 0; n < 300 && c.phase === 'season' && !S.seasonDone(c); n++) {
    const k = S.killCostToday(w, c, field)
    if (k && k.days >= 6 && k.days <= 12) {
      const early = structuredClone(c), late = structuredClone(c)
      S.apply(w, early, { t: 'job', kind: 'kill', field })
      for (let m = 0; m < 200 && !early.season!.fields[field].weighed && early.phase === 'season'; m++) step(w, early, -1)
      for (let m = 0; m < 200 && !late.season!.fields[field].weighed && late.phase === 'season'; m++) step(w, late, -1)
      const cost = weighed(late, field) - weighed(early, field)
      return Number.isFinite(cost) ? { said: k.cwtPerAcre, cost } : null
    }
    step(w, c, field)
  }
  return null
}

describe('what killing the vines early costs', () => {
  it('says nothing before the tubers have set', () => {
    const w = S.climateWorld(record, 3)
    const c = S.createCampaign(w, { seed: 3, startYear: S.FARM_YEAR0 + 1 })
    S.apply(w, c, { t: 'begin' })
    expect(S.killCostToday(w, c, 0)).toBeNull()
  })

  it('comes within reach of what the same farm lost by killing that day, over a dozen farms', () => {
    const seen = Array.from({ length: 12 }, (_, k) => trial(k + 1)).filter((x): x is { said: number; cost: number } => !!x)
    expect(seen.length).toBeGreaterThan(8)
    // Each said cost within 25 cwt an acre or half again of what it cost, and on average no more than a fifth off.
    const near = seen.filter(x => Math.abs(x.said - x.cost) <= Math.max(25, x.cost * 0.5))
    expect(near.length / seen.length).toBeGreaterThanOrEqual(0.75)
    const mean = (f: (x: { said: number; cost: number }) => number) => seen.reduce((a, x) => a + f(x), 0) / seen.length
    expect(Math.abs(mean(x => x.said) - mean(x => x.cost))).toBeLessThan(Math.max(10, mean(x => x.cost) * 0.2))
  }, 120_000)
})
