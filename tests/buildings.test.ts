// The farmstead, sections 4 and 5: buildings, equipment and hauling. Each is held from both sides.
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
  // Work the test leaves undone is not ordered by the routine either.
  for (const k of skip) if (S.routineInfo(c).some(r => r.kind === k && r.auto)) S.apply(world, c, { t: 'routine', kind: k, auto: false })
  for (let guard = 0; !until(c); guard++) {
    expect(guard < 400 && c.phase === 'season').toBe(true)
    for (const a of S.advise(world, c)) {
      if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && !skip.includes(a.act)) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    }
    S.apply(world, c, { t: 'day' })
  }
}

const order = (c: Campaign, kind: JobKind, field: number) => c.season!.jobs.find(j => j.kind === kind && j.field === field)
const HOME = -1, DUFOUR = -2

// A spring with money to build with.
function spring(year = 1990, seed = 1): Campaign {
  const c = S.createCampaign(world, { seed, startYear: year })
  c.cash = 100000
  return c
}

// Builds in the season with nothing else on the list until the building stands.
function buildOut(c: Campaign, kind: S.BuildingKind, yard = HOME): S.GameEvent[] {
  ok(c, { t: 'build', kind, yard })
  if (c.phase === 'plan') ok(c, { t: 'begin' })
  const events: S.GameEvent[] = []
  for (let k = 0; k < 120 && !S.hasBuilt(c, kind, yard); k++) events.push(...days(c, 1))
  expect(S.hasBuilt(c, kind, yard)).toBe(true)
  return events
}

describe('building', () => {
  it('pays the cash part, takes the yard\'s materials, buys what it lacks at the mill and the quarry, and is built by the farm\'s people', () => {
    const c = spring()
    c.logs = 10
    c.stone = 30
    const cost = S.buildCost(c, 'house')
    expect(cost).toEqual({ cash: S.BUILDINGS.house.cash, logs: 30, stone: 25, buyLogs: 20, buyStone: 0, total: S.BUILDINGS.house.cash + 20 * S.MILL_PRICE })
    const cash = c.cash
    ok(c, { t: 'build', kind: 'house', yard: HOME })
    expect([cash - c.cash, c.yearBuilding, c.logs, c.stone]).toEqual([cost.total, cost.total, 0, 5])
    refused(c, { t: 'build', kind: 'house', yard: HOME }, /going up/)
    refused(c, { t: 'build', kind: 'pond', yard: DUFOUR }, /home yard/)
    refused(c, { t: 'build', kind: 'bunk', yard: DUFOUR }, /Dufour land/)
    const info = S.buildingInfo(c).find(b => b.kind === 'house' && b.yard === HOME)!
    expect([info.state, info.progress]).toEqual(['building', 0])
    ok(c, { t: 'begin' })
    const job = c.season!.jobs.find(j => j.kind === 'build')!
    expect([job.field, job.building, job.need]).toEqual([HOME, c.buildings[0].id, S.BUILDINGS.house.days])
    refused(c, { t: 'cancel', id: job.id }, /paid for/)
    const events: S.GameEvent[] = []
    for (let k = 0; k < 80 && !S.hasBuilt(c, 'house'); k++) events.push(...days(c, 1))
    expect(events.some(e => e.type === 'built')).toBe(true)
    // Thirty crew-days by one farmer, a little faster than average at building, with Sundays off.
    expect(c.season!.day - c.season!.startDay).toBeGreaterThan(30)
    expect(c.crew[0].xp.build + c.crew[0].skills.build).toBeGreaterThan(S.FARMER_SKILLS.build)
  })

  it('cannot be paid for on credit', () => {
    const c = S.createCampaign(world, { seed: 1, startYear: 1990 })
    c.cash = 1000
    refused(c, { t: 'build', kind: 'shed', yard: HOME }, /Not enough cash/)
    expect(S.buildingInfo(c).find(b => b.kind === 'shed')!.why).toMatch(/Not enough cash/)
  })

  it('goes on through the winter with someone kept on to build', () => {
    const c = spring()
    ok(c, { t: 'hire', kind: 'hand' })
    for (let i = 0; i < 6; i++) if (S.isField(c, i)) ok(c, { t: 'plan', field: i, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
    ok(c, { t: 'begin' })
    ok(c, { t: 'endSeason' })
    refused(c, { t: 'winter', unit: c.crew[1].id, work: 'build' }, /Nothing is being built/)
    ok(c, { t: 'build', kind: 'bunk', yard: HOME })
    ok(c, { t: 'winter', unit: c.crew[1].id, work: 'build' })
    const events: S.GameEvent[] = []
    while (c.phase === 'cellar') events.push(...ok(c, { t: 'month' }).events)
    expect(S.hasBuilt(c, 'bunk')).toBe(true)
    expect(events.some(e => e.type === 'built')).toBe(true)
  })
})

describe('the potato house', () => {
  it('stores 3,600 cwt more at its yard; bought from a contractor it stands at once, at twice the cash', () => {
    const c = spring()
    const cap = S.cellarCapacity(c)
    buildOut(c, 'house')
    expect(S.cellarCapacity(c)).toBe(cap + S.CELLAR_CWT)
    expect(c.upgrades.house2).toBe(true)
    const d = spring()
    ok(d, { t: 'buy', upgrade: 'house2' })
    expect(S.cellarCapacity(d)).toBe(cap + S.CELLAR_CWT)
    expect(d.yearCosts).toBe(S.UPGRADES.house2.cost)
    expect(S.UPGRADES.house2.cost).toBeGreaterThan(S.BUILDINGS.house.cash + S.BUILDINGS.house.logs * S.MILL_PRICE + S.BUILDINGS.house.stone * S.QUARRY_PRICE)
    refused(d, { t: 'build', kind: 'house', yard: HOME }, /already/)
    // At the Dufour yard, while Dufour land is held.
    ok(d, { t: 'rent', field: 11 })
    ok(d, { t: 'build', kind: 'house', yard: DUFOUR })
  })
})

describe('the machine shed', () => {
  it('makes machine work 10% faster and lets the farm keep more tractors; without it a second tractor is refused', () => {
    const c = spring()
    refused(c, { t: 'buy', upgrade: 'tractor2' }, /machine shed/)
    refused(c, { t: 'buy', upgrade: 'tractor3' }, /machine shed/)
    buildOut(c, 'shed')
    // Next spring the tractors can be bought.
    tend(c, x => S.seasonDone(x))
    ok(c, { t: 'endSeason' })
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    ok(c, { t: 'next' })
    c.cash = 100000
    refused(c, { t: 'buy', upgrade: 'tractor3' }, /second tractor first/)
    ok(c, { t: 'buy', upgrade: 'tractor2' })
    ok(c, { t: 'buy', upgrade: 'tractor3' })
    expect(S.tractorsOwned(c)).toBe(3)
    // The same spraying goes 10% faster with the shed than without.
    ok(c, { t: 'begin' })
    tend(c, x => x.season!.day >= S.dayIndex(1991, 6, 15), ['kill', 'dig'])
    for (const j of [...c.season!.jobs]) ok(c, { t: 'cancel', id: j.id })
    ok(c, { t: 'sundays', off: false })
    const without = structuredClone(c)
    without.buildings = without.buildings.filter(b => b.kind !== 'shed')
    for (let k = 0; k < 30 && !(S.getDay(world, 1991, c.season!.day).prcp < 2 && S.getDay(world, 1991, c.season!.day).wind < 7.5); k++) { days(c, 1); days(without, 1) }
    const f = [0, 1, 2, 3, 4, 5].find(i => S.fieldInfo(c, i).status === 'growing' && !S.fieldInfo(c, i).tooWet)!
    for (const x of [c, without]) {
      x.crew[0].at = f; x.crew[0].to = f; x.crew[0].road = 0
      ok(x, { t: 'job', kind: 'water', field: f })
    }
    const xp = [c.crew[0].xp.machine, without.crew[0].xp.machine]
    days(c, 1)
    days(without, 1)
    expect(order(c, 'water', f)).toBeUndefined()
    // The same watering took the farmer a tenth less of the day.
    expect((without.crew[0].xp.machine - xp[1]) / (c.crew[0].xp.machine - xp[0])).toBeCloseTo(S.SHED_SPEED, 9)
  })
})

describe('the bunkhouse', () => {
  it('in the Dufour yard, beds people only while the farm holds Dufour land', () => {
    const c = spring()
    ok(c, { t: 'rent', field: 10 })
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: DUFOUR, done: 12, need: 12, built: true })
    expect(S.housingLimit(c)).toBe(S.HOUSED_OUT + S.BUNK_BEDS)
    ok(c, { t: 'release', field: 10 })
    expect(S.housingLimit(c)).toBe(S.HOUSED_OUT)
  })

  it('beds six more hired people, who are happier in them; without one, two is the most', () => {
    const c = spring()
    ok(c, { t: 'hire', kind: 'hand' })
    ok(c, { t: 'hire', kind: 'hand' })
    refused(c, { t: 'hire', kind: 'hand' }, /bunkhouse/)
    buildOut(c, 'bunk')
    expect(S.housingLimit(c)).toBe(S.HOUSED_OUT + S.BUNK_BEDS)
    const none = structuredClone(c)
    none.buildings = []
    expect(S.moodTarget(c, c.crew[1], 0) - S.moodTarget(none, none.crew[1], 0)).toBeCloseTo(S.MOOD_BED, 9)
    ok(c, { t: 'hire', kind: 'hand' })
    expect(S.peopleInfo(c).filter(p => p.bed).length).toBe(3)
  })
})

describe('the packing shed', () => {
  // 1990, seed 7: reference practice to the end of the season, everything stored.
  const base = S.createCampaign(world, { seed: 7, startYear: 1990 })
  ok(base, { t: 'begin' })
  tend(base, x => S.seasonDone(x))
  ok(base, { t: 'endSeason' })

  it('packed stock brings 8% more for No. 1 and three quarters of the No. 1 price for B size, less the packing charge', () => {
    const c = structuredClone(base)
    refused(c, { t: 'winter', unit: 0, work: 'pack' }, /packing shed/)
    c.buildings.push({ id: c.nextBuilding++, kind: 'packing', yard: HOME, done: 24, need: 24, built: true })
    const lot = S.openLots(c)[0]
    const plain = S.lotValue(world, c, lot)
    ok(c, { t: 'winter', unit: 0, work: 'pack' })
    const costs = c.yearCosts
    ok(c, { t: 'month' })
    const packedCwt = S.FARMER_WINTER_DAYS * S.speed(c.crew[0], 'pack') * S.PACK_PER_DAY
    expect(c.yearPacking).toBeCloseTo(packedCwt * S.PACK_CHARGE, 6)
    expect(c.yearCosts - costs).toBeGreaterThan(c.yearPacking - 1e-9)
    expect(lot.packed).toBeGreaterThan(0)
    // The same lot, shrunk by a month in the cellar, against an unpacked twin.
    const twin = structuredClone(lot)
    twin.packed = 0
    const no1 = S.gradePrice(world, c, lot, 'no1'), b = S.gradePrice(world, c, lot, 'b')
    expect(S.lotValue(world, c, lot) - S.lotValue(world, c, twin)).toBeCloseTo(lot.packed * (lot.grades.no1 * no1 * S.PACK_NO1 + lot.grades.b * (S.PACK_B * no1 - b)), 6)
    expect(plain).toBeGreaterThan(0)
  })
})

describe('the irrigation pond', () => {
  it('waters a home field in a third of a day for $60 while it holds water', () => {
    const c = spring(2001, 3)
    buildOut(c, 'pond')
    for (let k = 0; k < 60 && c.pond < 1; k++) days(c, 1)
    expect(c.pond).toBeGreaterThanOrEqual(1)
    expect(S.jobDays(c, 'water', null, 2)).toBeCloseTo(S.POND_DAYS, 12)
    expect(S.jobCost(c, 'water', 2)).toBe(S.POND_COST)
    // Not for a field beyond the home farm and the intervale.
    expect(S.jobCost(c, 'water', 8)).toBe(S.JOB_COST.water)
    tend(c, x => x.season!.day >= S.dayIndex(2001, 6, 20) && x.pond >= 1, ['kill', 'dig', 'water'])
    for (const j of [...c.season!.jobs]) ok(c, { t: 'cancel', id: j.id })
    const f = [0, 2, 4, 5].find(i => !S.fieldInfo(c, i).tooWet && S.fieldInfo(c, i).status === 'growing')!
    const pond = c.pond, costs = c.yearCosts
    ok(c, { t: 'job', kind: 'water', field: f })
    const events: S.GameEvent[] = []
    for (let k = 0; k < 10 && order(c, 'water', f); k++) events.push(...days(c, 1))
    expect(events.some(e => e.type === 'watered' && e.field === f && /pond/.test(e.text))).toBe(true)
    expect(c.yearCosts - costs).toBe(S.POND_COST)
    expect(c.pond).toBeLessThan(pond)
  })

  it('runs dry in the 1995 and 2020 droughts, when a month brings under 40 mm', () => {
    for (const year of [1995, 2020]) {
      const c = spring(year, 2)
      c.buildings.push({ id: c.nextBuilding++, kind: 'pond', yard: HOME, done: 20, need: 20, built: true })
      ok(c, { t: 'begin' })
      expect(c.pond).toBe(S.POND_CAP)
      const events: S.GameEvent[] = []
      for (let k = 0; k < 150 && !events.some(e => e.type === 'pondDry'); k++) events.push(...days(c, 1))
      const dry = events.find(e => e.type === 'pondDry')
      expect(dry, `${year}`).toBeDefined()
      expect(S.rain30(world, year, dry!.day)).toBeLessThan(S.POND_DRY_MM)
      expect(c.pond).toBe(0)
      expect(S.jobCost(c, 'water', 2)).toBe(S.JOB_COST.water)
      expect(S.pondInfo(world, c).waterings).toBe(0)
    }
  })
})

describe('the farm stand', () => {
  // 1990, seed 7: grown to September 21, then one field dug and hauled so a weighed lot is in hand.
  const base = S.createCampaign(world, { seed: 7, startYear: 1990 })
  ok(base, { t: 'begin' })
  tend(base, x => x.season!.day >= S.dayIndex(1990, 8, 21), ['dig'])
  for (const j of [...base.season!.jobs]) ok(base, { t: 'cancel', id: j.id })
  const field = [0, 2, 4, 5].find(i => S.fieldInfo(base, i).status === 'dead')!
  ok(base, { t: 'job', kind: 'dig', field })
  for (let k = 0; k < 40 && !base.season!.fields[field].weighed; k++) days(base, 1)
  ok(base, { t: 'sundays', off: false })

  it('sells about 4 cwt a day from the newest lot at twice the market price', () => {
    const c = structuredClone(base)
    c.buildings.push({ id: c.nextBuilding++, kind: 'stand', yard: HOME, done: 4, need: 4, built: true })
    const lot = S.standLot(c, c.season!)!
    expect(lot.field).toBe(field)
    const price = S.basePrice(world, c, lot.variety)
    const sold = lot.sold, rev = c.yearStand
    days(c, 1)
    expect(lot.sold - sold).toBeCloseTo(S.STAND_CWT, 9)
    expect(c.yearStand - rev).toBeCloseTo(S.STAND_CWT * price * S.STAND_PRICE, 6)
    expect(S.standInfo(c).sales).toBe(c.yearStand)
  })

  it('but someone has to mind it: a fifth of a working day', () => {
    const c = structuredClone(base), plain = structuredClone(base)
    c.buildings.push({ id: c.nextBuilding++, kind: 'stand', yard: HOME, done: 4, need: 4, built: true })
    for (const x of [c, plain]) for (const f of [0, 1, 2, 3, 4, 5]) if (S.fieldActions(world, x, f).find(a => a.kind === 'rocks')!.ok) ok(x, { t: 'job', kind: 'rocks', field: f })
    days(c, 1)
    days(plain, 1)
    const work = (x: Campaign) => x.season!.jobs.filter(j => j.kind === 'rocks').reduce((a, j) => a + j.done, 0) + x.stone
    expect(work(c)).toBeLessThan(work(plain))
    expect(c.crew[0].xp.pack - plain.crew[0].xp.pack).toBeCloseTo(S.STAND_MIND, 9)
  })
})

describe('the weather station', () => {
  it('makes the forecast\'s errors 40% smaller, but it still errs', () => {
    let pub = 0, own = 0, misses = 0, n = 0
    for (const year of [1990, 2005]) {
      for (let d = S.dayIndex(year, 4, 1); d < S.dayIndex(year, 9, 1); d++) {
        const real = S.getDay(world, year, d)
        const a = S.forecastFor(world, 9, year, d, 3), b = S.forecastFor(world, 9, year, d, 3, S.STATION_ERROR)
        pub += Math.abs(a.hi - real.tmax)
        own += Math.abs(b.hi - real.tmax)
        if ((b.rainMm > 0) !== (real.prcp >= 1)) misses++
        n++
      }
    }
    expect(own / pub).toBeCloseTo(S.STATION_ERROR, 9)
    expect(misses).toBeGreaterThan(0)
    const c = spring()
    buildOut(c, 'station')
    const f = S.forecast(world, c, 3)[2]
    expect(f).toEqual(S.forecastFor(world, c.seed, c.year, c.season!.day + 3, 3, S.STATION_ERROR))
  })

  it('shows each field today\'s blight risk from its own wet hours, and nothing without one', () => {
    const c = spring(2001, 3)
    ok(c, { t: 'begin' })
    tend(c, x => x.season!.day >= S.dayIndex(2001, 6, 1))
    expect(S.fieldInfo(c, 4, world).blightRisk).toBeNull()
    c.buildings.push({ id: c.nextBuilding++, kind: 'station', yard: HOME, done: 1, need: 1, built: true })
    const d = S.getDay(world, 2001, c.season!.day)
    for (const i of [0, 4]) {
      const env = S.fieldEnv(c, i)
      expect(S.fieldInfo(c, i, world).blightRisk).toBe(S.wallin(Math.max(0, Math.min(24, d.wetH + env.humid + (c.season!.fields[i].wateredDay === c.season!.day ? 3 : 0))), d.wetT))
    }
    expect(S.fieldInfo(c, 4).blightRisk).toBeNull()
  })
})

describe('the gravelled road', () => {
  it('makes travel 20% quicker, for sixty loads of stone', () => {
    const c = spring()
    expect(S.buildCost(c, 'road').buyStone).toBe(S.BUILDINGS.road.stone)
    expect(S.travel(c, -1, 8)).toBeCloseTo(S.travelDays(-1, 8), 12)
    buildOut(c, 'road')
    expect(S.travel(c, -1, 8)).toBeCloseTo(S.travelDays(-1, 8) * S.ROAD_SPEED, 12)
    expect(S.haulRate(c, c.crew[0], 8, 'tractor') / (S.HAUL_CWT_DAY * S.speed(c.crew[0], 'machine') / S.haulFactor(c, 8))).toBeCloseTo(1 / S.ROAD_SPEED, 9)
  })
})

describe('hauling', () => {
  // 1990, seed 7: grown to September 21 with the vines dead; then one field is dug.
  const base = S.createCampaign(world, { seed: 7, startYear: 1990 })
  ok(base, { t: 'begin' })
  tend(base, x => x.season!.day >= S.dayIndex(1990, 8, 21), ['dig'])
  for (const j of [...base.season!.jobs]) ok(base, { t: 'cancel', id: j.id })
  const field = [0, 2, 4, 5].find(i => S.fieldInfo(base, i).status === 'dead')!

  it('the digger lifts the crop into barrels and an order to haul it goes on top of the list by itself', () => {
    const c = structuredClone(base)
    ok(c, { t: 'job', kind: 'dig', field })
    refused(c, { t: 'job', kind: 'haul', field }, /by itself/)
    for (let k = 0; k < 10 && c.season!.fields[field].inField === 0; k++) days(c, 1)
    const f = c.season!.fields[field]
    expect(f.inField).toBeGreaterThan(0)
    expect(c.season!.jobs[0].kind).toBe('haul')
    refused(c, { t: 'cancel', id: c.season!.jobs[0].id }, /has to come in/)
    expect(S.haulInfo(world, c).map(h => h.field)).toEqual([field])
    expect(S.fieldInfo(c, field).inField).toBeCloseTo(f.inField, 9)
  })

  it('the weigh ticket is cut when everything is in; until then nothing is sold, and the season is not done', () => {
    const c = structuredClone(base)
    ok(c, { t: 'job', kind: 'dig', field })
    const events: S.GameEvent[] = []
    let sawDug = false
    for (let k = 0; k < 40 && !c.season!.fields[field].weighed; k++) {
      events.push(...days(c, 1))
      const f = c.season!.fields[field]
      if (f.status === 'dug' && !f.weighed) {
        sawDug = true
        refused(c, { t: 'sell', lot: f.lotId, frac: 1 }, /hauled in and weighed/)
        expect(S.fieldNeeds(world, c)[field].need?.act).not.toBe('sell')
      }
    }
    expect(sawDug).toBe(true)
    const weighed = events.find(e => e.type === 'weighed' && e.field === field)!
    expect(weighed).toBeDefined()
    expect(weighed.day).toBeGreaterThanOrEqual(events.find(e => e.type === 'dug' && e.field === field)!.day)
    expect(c.season!.jobs.some(j => j.kind === 'haul')).toBe(false)
    ok(c, { t: 'sell', lot: c.season!.fields[field].lotId, frac: 0.5 })
  })

  it('goes at 900 cwt a day for a tractor, twice that with the truck, which leaves the tractor free', () => {
    const c = structuredClone(base)
    const u = c.crew[0]
    const rate = S.haulRate(c, u, field, 'tractor')
    expect(rate).toBeCloseTo(S.HAUL_CWT_DAY * S.speed(u, 'machine'), 9)
    expect(S.haulRate(c, u, field, 'truck') / rate).toBeCloseTo(S.TRUCK_HAUL, 12)
    // With the truck, one person hauls while another digs on the one tractor.
    c.cash = 100000
    c.upgrades.truck = true
    ok(c, { t: 'hire', kind: 'operator' })
    ok(c, { t: 'sundays', off: false })
    ok(c, { t: 'job', kind: 'dig', field })
    expect(S.tractorsOwned(c)).toBe(1)
    for (let k = 0; k < 10 && !(c.season!.worked.some(w => w.kind === 'haul') && c.season!.worked.some(w => w.kind === 'dig')); k++) days(c, 1)
    // On the one tractor someone digs, and the same day someone else hauls: on the truck.
    const w = c.season!.worked
    expect(w.find(x => x.kind === 'dig')!.unit).not.toBe(w.find(x => x.kind === 'haul')!.unit)
    const without = structuredClone(base)
    without.cash = 100000
    ok(without, { t: 'hire', kind: 'operator' })
    ok(without, { t: 'sundays', off: false })
    ok(without, { t: 'job', kind: 'dig', field })
    // Without it, nobody hauls on a day the one tractor is digging.
    for (let k = 0; k < 10 && S.fieldInfo(without, field).status !== 'dug'; k++) {
      days(without, 1)
      const ww = without.season!.worked
      if (S.fieldInfo(without, field).status === 'digging') expect(ww.some(x => x.kind === 'haul') && ww.some(x => x.kind === 'dig')).toBe(false)
    }
  })

  it('a crop left in the field freezes a fifth on a hard frost night, and greens on bright days', () => {
    const c = structuredClone(base)
    ok(c, { t: 'job', kind: 'dig', field })
    for (let k = 0; k < 10 && c.season!.fields[field].inField === 0; k++) days(c, 1)
    // Nobody hauls: the hauling order is pinned to someone who is never there, and the routine does not haul.
    c.crew[0].prio.machine = 1
    ok(c, { t: 'routine', kind: 'haul', auto: false })
    const lot = c.lots.find(l => l.id === c.season!.fields[field].lotId)!
    const f = c.season!.fields[field]
    let froze = false
    for (let k = 0; k < 40 && !froze && !c.season!.frozen; k++) {
      // Keep the barrels in the field.
      for (const j of c.season!.jobs.filter(x => x.kind === 'haul')) c.season!.jobs.splice(c.season!.jobs.indexOf(j), 1)
      for (const p of c.crew) if (p.job >= 0 && !c.season!.jobs.some(j => j.id === p.job)) { p.job = -1; p.rig = '' }
      const inField = f.inField, frost = lot.loss.frost
      const d = S.getDay(world, 1990, c.season!.day)
      const events = days(c, 1)
      const tmin = S.envTmin(d, S.fieldEnv(c, field))
      if (tmin <= S.FREEZE_IN_FIELD && inField > 1) {
        froze = true
        expect(lot.loss.frost - frost).toBeGreaterThan(0)
        expect(events.some(e => e.type === 'frozenInField' && e.field === field)).toBe(true)
      }
    }
    expect(froze).toBe(true)
    expect(lot.loss.green).toBeGreaterThan(0)
  })

  it('a dug field whose last barrels freeze in the night is weighed, not left waiting for a hauler', () => {
    const c = structuredClone(base)
    ok(c, { t: 'job', kind: 'dig', field })
    for (let k = 0; k < 40 && S.fieldInfo(c, field).status !== 'dug'; k++) days(c, 1)
    const f = c.season!.fields[field]
    if (f.weighed) {
      f.weighed = false
      c.season!.jobs.unshift({ id: c.season!.nextJob++, kind: 'haul', field, done: 0, need: 0, unit: -1, by: 'routine' })
    }
    // A sliver left in the barrels on the eve of a hard frost at the field, and nobody to haul it.
    let frost = c.season!.day
    while (S.envTmin(S.getDay(world, 1990, frost), S.fieldEnv(c, field)) > S.FREEZE_IN_FIELD) frost++
    for (const u of c.crew) u.prio.machine = 0
    while (c.season!.day < frost) { f.inField = 0.6; days(c, 1) }
    f.inField = 0.6
    const events = days(c, 1)
    expect(events.some(e => e.type === 'weighed' && e.field === field)).toBe(true)
    expect(f.weighed).toBe(true)
    expect(c.season!.jobs.some(j => j.kind === 'haul')).toBe(false)
  })

  it('what is still in barrels when the ground freezes is lost', () => {
    const c = structuredClone(base)
    ok(c, { t: 'job', kind: 'dig', field })
    for (let k = 0; k < 10 && c.season!.fields[field].inField === 0; k++) days(c, 1)
    const f = c.season!.fields[field]
    const lot = c.lots.find(l => l.id === f.lotId)!
    const before = S.lotCwt(lot), frost = lot.loss.frost
    const inField = f.inField
    const events = ok(c, { t: 'endSeason' }).events
    expect(events.some(e => e.type === 'frozenInField')).toBe(true)
    expect(f.weighed).toBe(true)
    expect(lot.loss.frost - frost).toBeGreaterThanOrEqual(inField - 1e-6)
    expect(S.lotCwt(lot)).toBeLessThan(before)
  })
})
