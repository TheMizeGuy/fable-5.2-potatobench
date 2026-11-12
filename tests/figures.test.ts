// Figures the player sees agree with what then happens: a lot's value with what selling it pays, the yard's loads
// with what a building takes, the year with the date, and a contract with the crop in the potato house.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function ok(c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(world, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

// 2001, seed 3, left to the routine until the first weigh ticket, then a few days more.
function weighed(): Campaign {
  const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
  ok(c, { t: 'begin' })
  for (let g = 0; g < 400 && !c.season!.fields.some(f => f.weighed); g++) ok(c, { t: 'day' })
  for (let k = 0; k < 5; k++) ok(c, { t: 'day' })
  return c
}

describe('figures that agree', () => {
  it('a lot in the potato house is worth today what selling it today pays, days after it was weighed', () => {
    const c = weighed()
    const lot = S.openLots(c).find(l => c.season!.fields[l.field].weighed)!
    expect(lot.aged).toBe(c.season!.day)
    const shown = S.lotValue(world, c, lot)
    const cash = c.cash
    ok(c, { t: 'sell', lot: lot.id, frac: 1 })
    expect(c.cash - cash).toBeCloseTo(shown, 6)
  })

  it('the storage outlook counts shrink, the charge and sprouting, not the price curve alone', () => {
    const c = weighed()
    const lot = S.openLots(c).find(l => c.season!.fields[l.field].weighed)!
    const o = S.storeOutlook(world, c, lot)
    expect(o.months.map(m => m.name)).toEqual(S.CELLAR_MONTHS)
    const v = S.variety(lot.variety)
    const sprouts = lot.dugDay + v.dormancy + S.COOL_CELLAR_DAYS + (c.upgrades.vent ? S.VENT_DAYS : 0)
    // In season the year's price level is still coming in: the cellar sells at the level it settles at.
    const settle = (world.priceLevel[String(lot.year)] ?? 1) / S.levelNow(world, c)
    for (const m of o.months) {
      expect(m.sprouted).toBe(S.dayIndex(lot.year, 10, 1) + m.month * 30 > sprouts)
      // Never more than the price curve and the settled level alone would give.
      expect(m.net).toBeLessThan(o.now * settle * S.MONTH_CURVE[m.month] / S.SEASON_CURVE.reduce((a, [d, f]) => (d <= c.season!.day ? f : a), S.SEASON_CURVE[0][1]) + 1e-6)
    }
    expect(o.best).toEqual(o.months.reduce((a, b) => (b.net > a.net ? b : a)))
  })

  it('the yard shows whole loads, and a building takes and buys by the loads shown', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    c.logs = 8.6
    c.cash = 50000
    expect(S.materialsInfo(c).logs).toBe(8)
    const cost = S.buildCost(c, 'stand')
    expect(cost.buyLogs).toBe(0)
    const shed = S.buildCost(c, 'shed')
    expect(shed.buyLogs).toBe(S.BUILDINGS.shed.logs - 8)
    ok(c, { t: 'build', kind: 'shed', yard: S.HOME_YARD })
    expect(c.logs).toBeCloseTo(0.6, 9)
    expect(S.materialsInfo(c).logs).toBe(0)
  })

  it('from January the winter is the next year; the ledger closed in spring too', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    expect(S.yearNow(c)).toBe(2001)
    c.phase = 'cellar'
    c.month = 1
    expect(S.yearNow(c)).toBe(2001)
    c.month = 2
    expect(S.yearNow(c)).toBe(2002)
    c.phase = 'ledger'
    expect(S.yearNow(c)).toBe(2002)
    const f = S.createCampaign(S.climateWorld(world, 9), { seed: 9, startYear: S.FARM_YEAR0 + 1 })
    f.phase = 'cellar'
    f.month = 3
    expect(S.yearNowLabel(f)).toBe('Year 2')
  })

  it('a contract falling due takes what it is owed from the potato house before any penalty', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    const offer = c.offers.find(o => o.due === 'harvest')!
    for (let i = 0; i < S.HOME_FIELDS; i++) if (c.plans[i].crop === 'potato') ok(c, { t: 'plan', field: i, plan: { crop: 'potato', variety: offer.variety, seed: 'certified' } })
    ok(c, { t: 'accept', offer: offer.id })
    ok(c, { t: 'begin' })
    for (let g = 0; g < 400 && !S.seasonDone(c); g++) ok(c, { t: 'day' })
    const k = c.contracts[0]
    expect(k.delivered).toBe(0)
    const stock = S.openLots(c).filter(l => l.variety === k.variety).reduce((a, l) => a + l.grades.no1 + l.grades.chef, 0)
    const events = ok(c, { t: 'endSeason' }).events
    expect(k.delivered).toBeCloseTo(Math.min(k.cwt, stock), 6)
    expect(events.some(e => e.type === 'delivered')).toBe(true)
    expect(k.penalty).toBeCloseTo(Math.max(0, k.cwt - k.delivered) * k.price * S.CONTRACT_PENALTY, 6)
  })

  it('the storage outlook is right in the middle: over many winters what a kept lot came to centres on what it said', () => {
    // Sixteen coach-tended first years, each lot's outlook at the season's end against each cellar month it was kept to.
    const errs: number[][] = []
    for (let seed = 1; seed <= 16; seed++) {
      const w = S.climateWorld(world, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      S.apply(w, c, { t: 'begin' })
      for (let n = 0; n < 400 && c.phase === 'season' && !S.seasonDone(c); n++) {
        for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
        S.apply(w, c, { t: 'day' })
      }
      const lots = S.openLots(c).filter(l => !S.variety(l.variety).contract)
      const said = new Map(lots.map(l => [l.id, S.storeOutlook(w, c, l)]))
      const sold = new Map(lots.map(l => [l.id, l.sold]))
      const cwt = new Map(lots.map(l => [l.id, S.lotCwt(l)]))
      const today = c.season!.day
      S.apply(w, c, { t: 'endSeason' })
      while (c.phase === 'cellar') {
        for (const l of lots) {
          const o = said.get(l.id)!
          const k = o.months.findIndex(x => x.month === c.month)
          if (k < 0 || !l.open || l.sold > sold.get(l.id)! + 0.5) continue
          const span = (S.dayIndex(l.year, 10, 1) + c.month * 30 - today) / 30
          const got = S.lotValue(w, c, l) - S.STORE_COST * cwt.get(l.id)! * span
          ;(errs[k] ??= []).push(got / o.months[k].net - 1)
        }
        S.apply(w, c, { t: 'month' })
      }
    }
    const all = errs.flat()
    expect(all.length).toBeGreaterThan(200)
    const mean = all.reduce((a, b) => a + b, 0) / all.length
    expect(Math.abs(mean), `mean ${mean}`).toBeLessThan(0.02)
    for (const [k, e] of errs.entries()) {
      const mid = [...e].sort((a, b) => a - b)[e.length >> 1]
      expect(Math.abs(mid), `${k + 1} months ahead: median ${mid}`).toBeLessThan(0.025)
    }
  })
})
