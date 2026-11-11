// The farmstead, sections 2 and 3: land and materials. Each mechanic is held from both sides.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, JobKind } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function ok(c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(world, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

function refused(c: Campaign, cmd: Cmd, why?: RegExp): void {
  const before = S.hashCampaign(c)
  const r = S.apply(world, c, cmd)
  expect(r.ok, JSON.stringify(cmd)).toBe(false)
  expect(r.err.length).toBeGreaterThan(0)
  if (why) expect(r.err).toMatch(why)
  expect(S.hashCampaign(c), JSON.stringify(cmd)).toBe(before)
}

function days(c: Campaign, n: number): S.GameEvent[] {
  const out: S.GameEvent[] = []
  for (let k = 0; k < n; k++) out.push(...ok(c, { t: 'day' }).events)
  return out
}

function tend(c: Campaign, until: (c: Campaign) => boolean, skip: JobKind[] = []): void {
  for (let guard = 0; !until(c); guard++) {
    expect(guard < 400 && c.phase === 'season').toBe(true)
    for (const a of S.advise(world, c)) {
      if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && !skip.includes(a.act)) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    }
    S.apply(world, c, { t: 'day' })
  }
}

const order = (c: Campaign, kind: JobKind, field: number) => c.season!.jobs.find(j => j.kind === kind && j.field === field)
const WOODLOT = 14, SWALE = 15, BURNT = 16, BACKLOT = 17
const NORTH_RIDGE = 0, BOTTOM = 5

// Every field the farm crops rested, so that a year with nothing dug costs little.
function restAll(c: Campaign): void {
  for (let i = 0; i < S.FIELD_COUNT; i++) if (S.isField(c, i) && c.plans[i].crop !== 'rest') ok(c, { t: 'plan', field: i, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
}

// A year closed with nothing planted: the winter passes at once, then the next spring.
function winterThenSpring(c: Campaign): S.GameEvent[] {
  if (c.phase === 'plan') { restAll(c); ok(c, { t: 'begin' }) }
  const out: S.GameEvent[] = []
  if (c.phase === 'season') out.push(...ok(c, { t: 'endSeason' }).events)
  while (c.phase === 'cellar') out.push(...ok(c, { t: 'month' }).events)
  out.push(...ok(c, { t: 'next' }).events)
  return out
}

describe('the tracts', () => {
  const c = S.createCampaign(world, { seed: 1, startYear: 1990 })

  it('are four more parcels beside their blocks: the woodlot and the swale the farm\'s, Burnt Hill for sale, the back lot with Dufour land', () => {
    expect(S.FIELD_COUNT).toBe(18)
    expect(S.TRACTS.map(i => [S.PARCELS[i].name, S.PARCELS[i].block, c.fields[i].cover, c.fields[i].tenure])).toEqual([
      ['Home Woodlot', 'home', 'woods', 'owned'], ['Alder Swale', 'home', 'brush', 'owned'],
      ['Burnt Hill', 'ridge', 'woods', 'none'], ['Dufour Back Lot', 'dufour', 'woods', 'none'],
    ])
    for (const i of S.TRACTS) {
      const f = S.fieldInfo(c, i)
      expect(f.status).toBe('off')
      expect(f.clearing!.stage).toBe('fell')
      refused(c, { t: 'plan', field: i, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } })
      refused(c, { t: 'rent', field: i })
    }
    expect(S.planCosts(c)).toEqual(S.planCosts(S.createCampaign(world, { seed: 1, startYear: 1990 })))
    refused(c, { t: 'buyLand', field: BACKLOT }, /Dufour/)
    const x = structuredClone(c)
    ok(x, { t: 'buyLand', field: BURNT })
    ok(x, { t: 'rent', field: 10 })
    ok(x, { t: 'buyLand', field: BACKLOT })
    // The back lot is no Dufour field: it does not bring the Dufour house by itself.
    ok(x, { t: 'release', field: 10 })
    expect(S.holdsDufour(x)).toBe(false)
    expect(S.tractInfo(x).map(t => t.tenure)).toEqual(['owned', 'owned', 'owned', 'owned'])
  })

  it('take no crop orders, but take felling', () => {
    const x = structuredClone(c)
    ok(x, { t: 'begin' })
    refused(x, { t: 'job', kind: 'plant', field: WOODLOT }, /woods/)
    refused(x, { t: 'job', kind: 'rocks', field: WOODLOT }, /stumps/)
    refused(x, { t: 'job', kind: 'fell', field: BURNT }, /not the farm/)
    ok(x, { t: 'job', kind: 'fell', field: WOODLOT })
    expect(order(x, 'fell', WOODLOT)!.need).toBe(S.FELL_DAYS.woods)
    refused(x, { t: 'job', kind: 'fell', field: 0 }, /nothing to fell/)
  })
})

describe('clearing the woodlot', () => {
  // The farmer and a hand kept on through the winter fell the woodlot; a contractor pulls the stumps in spring.
  const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
  ok(c, { t: 'hire', kind: 'hand' })
  const hand = c.crew[1]
  hand.trait = ''
  c.cash = 100000
  restAll(c)
  ok(c, { t: 'begin' })
  ok(c, { t: 'endSeason' })
  const sheltered = S.fieldEnv(c, NORTH_RIDGE)
  ok(c, { t: 'winter', unit: hand.id, work: 'woods', field: WOODLOT })
  refused(c, { t: 'winter', unit: hand.id, work: 'woods', field: WOODLOT }, /already/)
  const wages = c.yearWages, logs0 = c.logs
  const winter = winterThenSpring(c)

  it('felling in winter yields logs by the feller\'s woods skill, and is paid for the months it takes', () => {
    expect(c.fields[WOODLOT].cover).toBe('stumps')
    expect(winter.some(e => e.type === 'felled' && e.field === WOODLOT)).toBe(true)
    expect(c.logs - logs0).toBeCloseTo(S.TIMBER.woods * S.fellYield(hand), 9)
    expect(S.fellYield(hand)).toBeCloseTo(S.FELL_YIELD_BASE + S.FELL_YIELD_PER * hand.skills.woods, 12)
    // 40 crew-days at a little under 20 a month: three months paid, then laid off for the rest of the winter.
    const months = Math.ceil(S.FELL_DAYS.woods / (S.WINTER_DAYS * S.speed(hand, 'woods')))
    expect(c.history[0].wages - wages).toBe(months * S.HAND_WAGE)
    expect(winter.some(e => e.type === 'winterIdle')).toBe(true)
    expect(hand.winter).toBe('off')
  })

  it('takes the shelter away: the ridge field below dries faster, loses its extra wet hour, sprays in less wind and is not so frosty', () => {
    const open = S.fieldEnv(c, NORTH_RIDGE)
    expect(sheltered.shelter).toBe(WOODLOT)
    expect(open.shelter).toBe(-1)
    expect([sheltered.et, open.et]).toEqual([S.SHELTER_WATER, 1])
    expect(sheltered.humid - open.humid).toBe(S.SHELTER_WET_HOURS)
    expect(sheltered.wind / open.wind).toBeCloseTo(S.SHELTER_WIND, 12)
    expect(sheltered.colder - open.colder).toBeCloseTo(S.SHELTER_FROST, 12)
    expect(S.fieldInfo(c, NORTH_RIDGE).sheltered).toBe(false)
  })

  it('then a contractor pulls the stumps: a fee, ten season days, and the tract is a rested field of stony new ground', () => {
    const x = structuredClone(c)
    refused(x, { t: 'stump', field: SWALE }, /Fell it first/)
    refused(x, { t: 'stump', field: 0 }, /no stumps/)
    const cash = x.cash
    ok(x, { t: 'stump', field: WOODLOT })
    refused(x, { t: 'stump', field: WOODLOT }, /already/)
    expect([cash - x.cash, x.yearWorks]).toEqual([S.STUMP_FEE, S.STUMP_FEE])
    ok(x, { t: 'begin' })
    const events = days(x, S.STUMP_DAYS)
    expect(events.some(e => e.type === 'stumped' && e.field === WOODLOT)).toBe(true)
    const fp = x.fields[WOODLOT]
    expect([fp.cover, fp.raw, fp.soil, fp.streak, fp.vert, fp.stones]).toEqual(['open', true, 1, 0, S.NEW_GROUND_VERT, S.PARCELS[WOODLOT].stones])
    // A field from next spring; this season it waits, though its rocks can be picked now.
    expect(S.fieldInfo(x, WOODLOT).stage).toMatch(/next spring/)
    refused(x, { t: 'job', kind: 'plant', field: WOODLOT }, /next spring/)
    ok(x, { t: 'job', kind: 'rocks', field: WOODLOT })
    const stone = x.stone
    for (let k = 0; k < 20 && order(x, 'rocks', WOODLOT); k++) days(x, 1)
    expect(x.fields[WOODLOT].stones).toBeCloseTo(S.PARCELS[WOODLOT].stones - S.ROCKS_TAKE, 12)
    expect(x.stone - stone).toBeCloseTo(S.ROCKS_LOADS * S.ROCKS_TAKE, 9)
    // Next spring it is a field: it rests first by default, since its first potato crop on raw ground grows less.
    winterThenSpring(x)
    expect(S.isField(x, WOODLOT)).toBe(true)
    expect(x.plans[WOODLOT].crop).toBe('rest')
    ok(x, { t: 'plan', field: WOODLOT, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } })
  })

  it('in the growing season felling goes at half speed', () => {
    const a = S.createCampaign(world, { seed: 1, startYear: 1990 })
    ok(a, { t: 'begin' })
    ok(a, { t: 'sundays', off: false })
    for (let k = 0; k < 40 && S.getDay(world, 1990, a.season!.day).prcp >= 15; k++) days(a, 1)
    ok(a, { t: 'job', kind: 'fell', field: WOODLOT })
    const rate = S.speed(a.crew[0], 'woods')
    days(a, 1)
    expect(a.fields[WOODLOT].felled).toBeCloseTo((1 - S.travelDays(-1, WOODLOT)) * rate * S.FELL_SEASON, 9)
    expect(a.logs).toBeCloseTo(a.fields[WOODLOT].felled / S.FELL_DAYS.woods * S.TIMBER.woods * S.fellYield(a.crew[0]), 9)
  })
})

describe('raw ground', () => {
  it('grows a first potato crop 15% short', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    tend(c, x => x.season!.day >= S.dayIndex(2001, 6, 20), ['kill', 'dig'])
    const raw = structuredClone(c)
    raw.fields[0].raw = true
    const m0 = c.season!.fields[0].hMass.reduce((a, b) => a + b, 0)
    for (let k = 0; k < 10; k++) { S.apply(world, c, { t: 'day' }); S.apply(world, raw, { t: 'day' }) }
    const grow = c.season!.fields[0].hMass.reduce((a, b) => a + b, 0) - m0
    const rawGrow = raw.season!.fields[0].hMass.reduce((a, b) => a + b, 0) - m0
    expect(grow).toBeGreaterThan(0)
    expect(rawGrow / grow).toBeCloseTo(S.RAW_GROUND, 6)
  })
})

describe('shelter', () => {
  // 2001, mid July: North Ridge under the woodlot against the same field with the woodlot felled.
  const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
  ok(c, { t: 'begin' })
  tend(c, x => x.season!.day >= S.dayIndex(2001, 6, 10), ['kill', 'dig'])
  const open = structuredClone(c)
  open.fields[WOODLOT].cover = 'stumps'

  it('keeps water in the ground and lets the sprayer out in more wind', () => {
    for (const x of [c, open]) x.season!.fields[NORTH_RIDGE].dr = 10
    for (let k = 0; k < 6; k++) { S.apply(world, c, { t: 'day' }); S.apply(world, open, { t: 'day' }) }
    expect(c.season!.fields[NORTH_RIDGE].dr).toBeLessThan(open.season!.fields[NORTH_RIDGE].dr)
    const d = { ...S.getDay(world, 2001, c.season!.day), wind: 8.5, prcp: 0 }
    const f = c.season!.fields[NORTH_RIDGE]
    expect(S.jobWait('spray', f, d, S.fieldEnv(c, NORTH_RIDGE).wind)).toBe('')
    expect(S.jobWait('spray', f, d, S.fieldEnv(open, NORTH_RIDGE).wind)).toBe('too windy')
  })

  it('but stays wet an hour longer for blight and runs colder on a frost night', () => {
    const d = { ...S.getDay(world, 2001, c.season!.day), tmin: 1, wind: 1, cloud: 0 }
    expect(S.envTmin(d, S.fieldEnv(c, NORTH_RIDGE))).toBeCloseTo(S.envTmin(d, S.fieldEnv(open, NORTH_RIDGE)) - S.SHELTER_FROST, 12)
    expect(S.fieldEnv(c, NORTH_RIDGE).humid).toBe(S.fieldEnv(open, NORTH_RIDGE).humid + 1)
    expect(S.fieldInfo(c, NORTH_RIDGE).shelteredBy).toBe('Home Woodlot')
    expect(S.tractInfo(c)[0].shelters).toEqual([NORTH_RIDGE])
    // The swale shelters Bottom Field the same way.
    expect(S.fieldEnv(c, BOTTOM).shelter).toBe(SWALE)
  })
})

describe('stones', () => {
  it('slow planting to 30% at 1, and the home farm\'s usual stones leave the old pace', () => {
    expect(S.stoneSpeed(S.STONE_BASE)).toBe(1)
    expect(S.stoneSpeed(1) * (1 - S.STONE_SLOW * S.STONE_BASE)).toBeCloseTo(0.3, 12)
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    ok(c, { t: 'begin' })
    ok(c, { t: 'sundays', off: false })
    while (!(S.fieldActions(world, c, 2).find(a => a.kind === 'plant')!.wait === '')) days(c, 1)
    const stony = structuredClone(c)
    stony.fields[2].stones = 1
    for (const x of [c, stony]) ok(x, { t: 'job', kind: 'plant', field: 2 })
    days(c, 1)
    days(stony, 1)
    expect(c.season!.fields[2].status).not.toBe('idle')
    expect(order(stony, 'plant', 2)!.done).toBeCloseTo((1 - S.travelDays(-1, 2)) * S.speed(stony.crew[0], 'machine') * S.stoneSpeed(1), 9)
  })

  it('bruise tubers at the dig, put down to stones, less for a skilled digger', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(c, { t: 'begin' })
    tend(c, x => x.season!.day >= S.dayIndex(1990, 8, 25), ['dig'])
    const field = [0, 2, 4, 5].find(i => S.fieldInfo(c, i).status === 'dead')!
    const dig = (stones: number, machine: number) => {
      const x = structuredClone(c)
      x.fields[field].stones = stones
      x.crew[0].skills.machine = machine
      for (const j of [...x.season!.jobs]) ok(x, { t: 'cancel', id: j.id })
      ok(x, { t: 'job', kind: 'dig', field })
      for (let k = 0; k < 30 && S.fieldInfo(x, field).status !== 'dug'; k++) days(x, 1)
      const lot = x.lots.find(l => l.field === field)!
      return lot.loss.stone / (S.lotCwt(lot) + lot.grades.cull)
    }
    expect(dig(0.2, 6)).toBe(0)
    const rough = dig(1, 0), smooth = dig(1, 10)
    expect(rough).toBeGreaterThan(0.08)
    expect(smooth).toBeGreaterThan(0)
    expect(smooth).toBeLessThan(rough * 0.6)
    expect(S.stoneBruise(1, null)).toBeCloseTo(S.STONE_BRUISE * 0.8, 12)
  })

  it('heave up 0.04 each winter on the land the farm holds; rock picking takes 0.4 off and gives fieldstone, but only with no crop in the ground', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    const before = c.fields.map(f => f.stones)
    winterThenSpring(c)
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const heaved = c.fields[i].tenure !== 'none' && c.fields[i].cover === 'open'
      expect(c.fields[i].stones, `field ${i}`).toBeCloseTo(heaved ? before[i] + S.HEAVE : before[i], 12)
    }
    ok(c, { t: 'begin' })
    ok(c, { t: 'job', kind: 'rocks', field: 1 })
    expect(order(c, 'rocks', 1)!.need).toBe(S.JOB_DAYS.rocks)
    for (let k = 0; k < 20 && order(c, 'rocks', 1); k++) days(c, 1)
    expect(c.fields[1].stones).toBeCloseTo(Math.max(0, before[1] + S.HEAVE - S.ROCKS_TAKE), 12)
    expect(c.stone).toBeCloseTo(S.ROCKS_LOADS * Math.min(S.ROCKS_TAKE, before[1] + S.HEAVE), 9)
    tend(c, x => S.fieldInfo(x, 0).status === 'growing')
    refused(c, { t: 'job', kind: 'rocks', field: 0 }, /no crop/)
    refused(c, { t: 'job', kind: 'rocks', field: 1 }, /hardly any|no crop/)
  })

  it('reference practice picks the rocks off a very stony field in spring, and leaves the home farm\'s alone', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    ok(c, { t: 'begin' })
    expect(S.advise(world, c).filter(a => a.act === 'rocks')).toEqual([])
    c.fields[2].stones = 0.7
    expect(S.advise(world, c).filter(a => a.act === 'rocks').map(a => a.field)).toEqual([2])
  })
})

describe('hedgerows', () => {
  it('cut back, the bottom field loses its extra wet hours and half its frost, but the wind dries it more; they grow back in four years', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    c.cash = 100000
    // Without the swale's shelter, to see the hedgerows alone.
    c.fields[SWALE].cover = 'stumps'
    ok(c, { t: 'begin' })
    refused(c, { t: 'job', kind: 'brush', field: 0 }, /ridge/)
    const before = S.fieldEnv(c, BOTTOM)
    ok(c, { t: 'job', kind: 'brush', field: BOTTOM })
    for (let k = 0; k < 20 && order(c, 'brush', BOTTOM); k++) days(c, 1)
    const after = S.fieldEnv(c, BOTTOM)
    expect([before.humid, after.humid]).toEqual([S.HUMID_BONUS[0], 0])
    expect(after.frost).toBeCloseTo(before.frost / 2, 12)
    expect(after.et / before.et).toBeCloseTo(S.BRUSH_WATER, 12)
    refused(c, { t: 'job', kind: 'brush', field: BOTTOM }, /already/)
    let events: S.GameEvent[] = []
    for (let y = 0; y < S.BRUSH_YEARS; y++) {
      expect(S.fieldInfo(c, BOTTOM).brushed).toBe(S.BRUSH_YEARS - y)
      events = winterThenSpring(c)
    }
    expect(S.fieldEnv(c, BOTTOM).humid).toBe(S.HUMID_BONUS[0])
    expect(events.some(e => e.type === 'brushBack' && e.field === BOTTOM)).toBe(true)
  })
})

describe('tile drainage', () => {
  it('bottom land drains like the mid slope, at a fee and eight season days; it holds less water in a drought', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    refused(c, { t: 'tile', field: 2 }, /bottom land/)
    refused(c, { t: 'tile', field: 6 }, /own land/)
    ok(c, { t: 'tile', field: BOTTOM })
    expect(c.yearWorks).toBe(S.TILE_FEE)
    ok(c, { t: 'begin' })
    refused(c, { t: 'job', kind: 'plant', field: BOTTOM }, /contractor/)
    const events = days(c, S.TILE_DAYS)
    expect(events.some(e => e.type === 'tiled' && e.field === BOTTOM)).toBe(true)
    const env = S.fieldEnv(c, BOTTOM)
    expect(env.drain).toBe(S.DRAIN[1])
    expect(env.taw).toBeCloseTo(S.TAW_MM[0] * S.TILE_TAW, 12)
    // The same deficit is a larger share of what the tiled field holds.
    const plain = S.createCampaign(world, { seed: 1, startYear: 1990 })
    ok(plain, { t: 'begin' })
    days(plain, S.TILE_DAYS)
    c.season!.fields[BOTTOM].dr = 40
    plain.season!.fields[BOTTOM].dr = 40
    expect(S.fieldInfo(c, BOTTOM).moisture).toBeLessThan(S.fieldInfo(plain, BOTTOM).moisture)
    refused(c, { t: 'tile', field: BOTTOM }, /already/)
  })
})

describe('the land mortgage', () => {
  it('buys land a quarter down; each year end the bank takes a tenth of the loan and 8% on what is owed; extra can be paid in spring', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    const price = S.PARCELS[BURNT].price
    const cash = c.cash
    ok(c, { t: 'buyLand', field: BURNT })
    expect(cash - c.cash).toBe(price * S.MORTGAGE_DOWN)
    const loan = price * (1 - S.MORTGAGE_DOWN)
    c.cash += 50000
    expect(S.mortgageInfo(c)).toMatchObject({ owed: loan, principal: loan * S.MORTGAGE_PRINCIPAL, interest: loan * S.MORTGAGE_RATE, payWhy: '' })
    const costs = c.yearCosts
    const events = winterThenSpring(c)
    const paid = loan * S.MORTGAGE_PRINCIPAL + loan * S.MORTGAGE_RATE
    expect(c.history[0].mortgage).toBeCloseTo(paid, 9)
    expect(c.history[0].costs - costs).toBeGreaterThanOrEqual(paid - 1e-9)
    expect(events.some(e => e.type === 'mortgage')).toBe(true)
    expect(S.mortgageOwed(c)).toBeCloseTo(loan * (1 - S.MORTGAGE_PRINCIPAL), 9)
    const h = c.history[0]
    // The year's books close to the cent (the test's own $50,000 aside).
    expect(c.cash).toBeCloseTo(h.cashStart + 50000 + h.revenue - h.costs - h.note - h.living - h.interest, 6)
    // Net worth counts what is still owed against the land.
    expect(S.netWorth(c)).toBe(Math.round(c.cash + price - S.mortgageOwed(c)))
    refused(c, { t: 'payMortgage', amount: loan }, /Only/)
    ok(c, { t: 'payMortgage', amount: 1000 })
    expect(S.mortgageOwed(c)).toBeCloseTo(loan * (1 - S.MORTGAGE_PRINCIPAL) - 1000, 9)
    ok(c, { t: 'payMortgage', amount: S.mortgageOwed(c) })
    expect(c.mortgages).toEqual([])
    refused(c, { t: 'payMortgage', amount: 1 }, /Nothing/)
  })
})

describe('logs', () => {
  it('sell to the mill by the load', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    refused(c, { t: 'sellLogs', loads: 1 }, /only 0 loads/)
    c.logs = 10
    ok(c, { t: 'sellLogs', loads: 4 })
    expect([c.logs, c.yearLogs, c.yearRevenue]).toEqual([6, 4 * S.LOG_PRICE, 4 * S.LOG_PRICE])
    expect(S.materialsInfo(c)).toMatchObject({ logs: 6, stone: 0, logPrice: S.LOG_PRICE, millPrice: S.MILL_PRICE, quarryPrice: S.QUARRY_PRICE })
  })
})
