import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { priceBand, storeCall } from '../src/ui/store-band.ts'

const record = loadWorld()

// A season played the way the coach would, nothing sold, stopped on its last day with the crop in store.
function harvested(seed: number): { w: S.World; c: S.Campaign } {
  const w = S.climateWorld(record, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(w, c, { t: 'begin' })
  for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
    for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
    S.apply(w, c, { t: 'day' })
  }
  return { w, c }
}

interface Outcome { ahead: number; err: number; said: S.StoreMonth; now: number; got: number }

// For every lot and cellar month: what the outlook said at the end of the season keeping it to that month would
// bring, against what the lot was worth that month less the storage charged on the way. A lot something has been taken
// from since (a contract falling due) is left out: it is no longer the pile the outlook spoke of.
function outcomes(): Outcome[] {
  const out: Outcome[] = []
  for (let seed = 1; seed <= 16; seed++) {
    const { w, c } = harvested(seed)
    const lots = S.openLots(c).filter(l => !S.variety(l.variety).contract)
    if (!lots.length) continue
    const said = new Map(lots.map(l => [l.id, S.storeOutlook(w, c, l)]))
    const sold = new Map(lots.map(l => [l.id, l.sold]))
    const today = c.season!.day
    const cwt = new Map(lots.map(l => [l.id, l.grades.no1 + l.grades.chef + l.grades.b + l.grades.no2 + l.skinned]))
    S.apply(w, c, { t: 'endSeason' })
    while (c.phase === 'cellar') {
      for (const l of lots) {
        const o = said.get(l.id)!
        const k = o.months.findIndex(x => x.month === c.month)
        if (k < 0 || !l.open || l.sold > sold.get(l.id)! + 0.5) continue
        const span = (S.dayIndex(l.year, 10, 1) + c.month * 30 - today) / 30
        const got = S.lotValue(w, c, l) - S.STORE_COST * cwt.get(l.id)! * span
        out.push({ ahead: k + 1, err: Math.abs(got / o.months[k].net - 1), said: o.months[k], now: o.now, got })
      }
      S.apply(w, c, { t: 'month' })
    }
  }
  return out
}

describe('keeping a crop is said with how sure it is', () => {
  const seen = outcomes()

  it('the give-or-take band holds what the lot came to, nine months in ten', () => {
    expect(seen.length).toBeGreaterThan(60)
    const outside = seen.filter(x => x.err > priceBand(x.ahead))
    expect(outside.length / seen.length).toBeLessThan(0.1)
  })

  it('"brings most" goes on keeping only when keeping then paid at least what selling at the weigh-in did', () => {
    let called = 0, wrong = 0
    for (const x of seen) {
      if (!storeCall({ now: x.now, months: [x.said], best: x.said }).store) continue
      called++
      if (x.got < x.now) wrong++
    }
    expect(wrong).toBeLessThanOrEqual(Math.ceil(called * 0.05))
  })

  it('over twelve harvests the tab sits on the way the rule favours, and the store line never says it brings more than that way', () => {
    let lots = 0, surer = 0
    for (let seed = 1; seed <= 12; seed++) {
      const { w, c } = harvested(seed)
      for (const l of S.openLots(c)) {
        const o = S.storeOutlook(w, c, l)
        const call = storeCall(o)
        const b = o.best
        const d = b ? b.net - o.now : 0
        const spread = b ? Math.round((b.net * priceBand(o.months.indexOf(b) + 1)) / 10) * 10 : 0
        lots++
        // The rule: store only when the usual gain is bigger than prices can swing by then.
        expect(call.store, `seed ${seed} lot ${l.id}`).toBe(!!b && d > spread)
        // Selling is the way: the store line says it could bring less, never that it brings more.
        if (!call.store) expect(call.phrase).not.toMatch(/\$[\d,]+ more than/)
        if (call.store) expect(call.phrase).toMatch(/more than selling today/)
        // The tab's words: "Brings most" only when that way brings the most even with the swing.
        expect(call.tab).toBe(!call.store && b && d >= 0.5 ? 'Surer' : 'Brings most')
        if (call.tab === 'Surer') { surer++; expect(call.phrase).toMatch(/could as easily bring less/) }
      }
    }
    expect(lots).toBeGreaterThan(30)
    expect(surer).toBeGreaterThan(0)
  })
})
