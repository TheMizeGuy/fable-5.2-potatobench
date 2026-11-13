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

interface Trial { said: number; cost: number; days: number; logged: number }

// For a seed: on the first day a field's kill is due lo to hi days ahead, what the game says killing today costs,
// against what it cost: the same farm run on twice, killed that day in one and when the coach asks in the other.
function trial(seed: number, lo: number, hi: number): Trial | null {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  const field = c.plans.findIndex((p, i) => S.isField(c, i) && p.crop === 'potato')
  for (let n = 0; n < 300 && c.phase === 'season' && !S.seasonDone(c); n++) {
    const k = S.killCostToday(w, c, field)
    if (k && k.days >= lo && k.days <= hi) {
      const early = structuredClone(c), late = structuredClone(c)
      S.apply(w, early, { t: 'job', kind: 'kill', field })
      for (let m = 0; m < 200 && !early.season!.fields[field].weighed && early.phase === 'season'; m++) step(w, early, -1)
      const killed = early.season!.log.find(e => e.type === 'killed' && e.field === field)
      for (let m = 0; m < 200 && !late.season!.fields[field].weighed && late.phase === 'season'; m++) step(w, late, -1)
      const cost = weighed(late, field) - weighed(early, field)
      return Number.isFinite(cost) ? { said: k.cwtPerAcre, cost, days: k.days, logged: Number(killed?.data?.lost ?? 0) } : null
    }
    step(w, c, field)
  }
  return null
}

const seeds = (from: number, n: number) => Array.from({ length: n }, (_, k) => from + k)
const mean = (xs: Trial[], f: (x: Trial) => number) => xs.reduce((a, x) => a + f(x), 0) / xs.length

describe('what killing the vines early costs', () => {
  it('says nothing before the tubers have set', () => {
    const w = S.climateWorld(record, 3)
    const c = S.createCampaign(w, { seed: 3, startYear: S.FARM_YEAR0 + 1 })
    S.apply(w, c, { t: 'begin' })
    expect(S.killCostToday(w, c, 0)).toBeNull()
  })

  it('costs nothing once the kill is due or asked for', () => {
    for (const seed of [1, 2, 3]) {
      const w = S.climateWorld(record, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      S.apply(w, c, { t: 'begin' })
      const field = c.plans.findIndex((p, i) => S.isField(c, i) && p.crop === 'potato')
      let seen = false
      for (let n = 0; n < 300 && c.phase === 'season' && !S.seasonDone(c); n++) {
        const due = S.killCostToday(w, c, field)
        if (due && due.days === 0) expect(due.cwtPerAcre, `seed ${seed}, due today`).toBe(0)
        for (const a of S.advise(w, c)) {
          if (a.act === 'wait' || a.act === 'close' || a.act === 'sell') continue
          S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
          if (a.act === 'kill' && a.field === field) { expect(S.killCostToday(w, c, field)?.cwtPerAcre, `seed ${seed}, asked`).toBe(0); seen = true }
        }
        S.apply(w, c, { t: 'day' })
      }
      expect(seen, `seed ${seed}: the coach asked for the kill`).toBe(true)
    }
  })

  // Held out: the share LATE_SEASON was set on seeds 1 to 12 at a week or more ahead.
  for (const [lo, hi, from] of [[6, 12, 1], [6, 12, 13], [2, 5, 13], [13, 25, 13]] as const) {
    it(`a kill ${lo} to ${hi} days early, seeds ${from} to ${from + 17}: near what the same farm lost, and the kill's own record says it`, () => {
      const seen = seeds(from, 18).map(s => trial(s, lo, hi)).filter((x): x is Trial => !!x)
      expect(seen.length).toBeGreaterThan(12)
      const pairs = JSON.stringify(seen.map(x => [x.said, Math.round(x.cost)]))
      // The weather ahead isn't known, so one farm can lose half again or half as much as said: each said cost within
      // 15 cwt an acre or half of what it cost in two farms of three, and on average a fifth off at most.
      const near = seen.filter(x => Math.abs(x.said - x.cost) <= Math.max(15, x.cost * 0.5))
      expect(near.length / seen.length, pairs).toBeGreaterThanOrEqual(2 / 3)
      expect(Math.abs(mean(seen, x => x.said) - mean(seen, x => x.cost)), pairs).toBeLessThan(Math.max(5, mean(seen, x => x.cost) * 0.2))
      // The killed event carries the cost on the day the kill was done, a working day or more nearer its due day.
      for (const x of seen) {
        expect(x.logged, 'the killed event carries the figure').toBeGreaterThan(0)
        expect(x.logged, 'the killed event carries the figure').toBeLessThanOrEqual(x.said + 1)
      }
    }, 120_000)
  }
})
