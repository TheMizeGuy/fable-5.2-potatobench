// What the player is shown of the farm's position agrees with what happens: each order's fate, pressing work, orders
// that no longer make sense, resting before an injury, what goals cost, the money, the spray question, the kill and
// the one planting rule.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, GameEvent } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function ok(c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(world, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

function until(c: Campaign, done: (c: Campaign) => boolean, seen: GameEvent[] = []): void {
  for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c) && !done(c); g++) seen.push(...ok(c, { t: 'day' }).events)
}

// 2001, seed 3, left to the routine into the summer.
function summer(): Campaign {
  const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
  ok(c, { t: 'begin' })
  until(c, x => x.season!.watchDay >= 0 && x.season!.fields.some(f => f.status === 'growing' && f.emergeDay >= 0))
  return c
}

describe('each order\'s fate', () => {
  it('every order on the list says who takes it and when, and the next day bears it out', () => {
    const c = summer()
    for (let i = 0; i < 6; i++) S.apply(world, c, { t: 'job', kind: 'spray', field: i })
    const fate = S.jobOutlook(world, c)
    expect(fate.map(o => o.id)).toEqual(c.season!.jobs.map(j => j.id))
    for (const o of fate) expect(o.why.length).toBeGreaterThan(5)
    const now = fate.filter(o => o.when === 'now')
    const jobs = new Map(c.season!.jobs.map(j => [j.id, j]))
    ok(c, { t: 'day' })
    for (const o of now) {
      const j = jobs.get(o.id)!
      expect(c.season!.worked.some(w => w.kind === j.kind && w.field === j.field && w.unit === o.unit), JSON.stringify(o)).toBe(true)
    }
  })

  it('an order nobody will take says so, and pressing work names what is in its way with the fix', () => {
    const c = summer()
    ok(c, { t: 'priority', unit: 0, work: 'machine', level: 0 })
    const f = c.season!.fields.findIndex(x => x.status === 'growing' && x.emergeDay >= 0 && x.deadDay < 0)
    ok(c, { t: 'job', kind: 'spray', field: f })
    const o = S.jobOutlook(world, c).find(x => c.season!.jobs.find(j => j.id === x.id)!.kind === 'spray')!
    expect(o.unit).toBe(-1)
    expect(o.when).toBe('waiting')
    expect(o.why).toMatch(/Nobody on the farm will do machine work/)
    const p = S.pressing(world, c).find(x => x.kind === 'spray' && x.field === f)!
    expect(p.why).toMatch(/blight/)
    expect(p.fix).toEqual({ t: 'priority', unit: 0, work: 'machine', level: 1 })
  })

  it('pressing work is taken ahead of work that can wait, whatever the priorities, and says so', () => {
    const c = summer()
    // Everyone to the woods first, as the player who lost a field to blight had set them.
    ok(c, { t: 'priority', unit: 0, work: 'woods', level: 1 })
    for (const j of [...c.season!.jobs]) ok(c, { t: 'cancel', id: j.id })
    ok(c, { t: 'job', kind: 'fell', field: 14 })
    const f = c.season!.fields.findIndex(x => x.status === 'growing' && x.emergeDay >= 0 && x.deadDay < 0)
    ok(c, { t: 'job', kind: 'spray', field: f })
    ok(c, { t: 'bump', id: c.season!.jobs.find(j => j.kind === 'fell')!.id })
    let events: GameEvent[] = []
    for (let k = 0; k < 10 && !events.some(e => e.type === 'sprayed'); k++) events = events.concat(ok(c, { t: 'day' }).events)
    expect(events.some(e => e.type === 'pressing')).toBe(true)
    expect(events.some(e => e.type === 'sprayed' && e.field === f)).toBe(true)
    // A never is still a never.
    const d = summer()
    ok(d, { t: 'priority', unit: 0, work: 'machine', level: 0 })
    ok(d, { t: 'job', kind: 'fell', field: 14 })
    ok(d, { t: 'job', kind: 'spray', field: f })
    const seen: GameEvent[] = []
    for (let k = 0; k < 5; k++) seen.push(...ok(d, { t: 'day' }).events)
    expect(seen.some(e => e.type === 'sprayed')).toBe(false)
  })
})

describe('orders that no longer make sense', () => {
  it('a walk, a spray or a watering for vines that are dead leaves the list with a dropped event and its reason', () => {
    const c = summer()
    const f = c.season!.fields.findIndex(x => x.status === 'growing' && x.emergeDay >= 0 && x.tiDay >= 0)
    if (f < 0) until(c, x => x.season!.fields.some(y => y.status === 'growing' && y.tiDay >= 0))
    const i = c.season!.fields.findIndex(x => x.status === 'growing' && x.tiDay >= 0)
    ok(c, { t: 'routine', kind: 'scout', auto: false })
    ok(c, { t: 'job', kind: 'scout', field: i })
    ok(c, { t: 'job', kind: 'kill', field: i })
    for (const j of c.season!.jobs.filter(x => x.kind === 'kill')) ok(c, { t: 'bump', id: j.id })
    // The scout is pinned to someone who is never there, so only the sweep can take it off.
    const scout = c.season!.jobs.find(j => j.kind === 'scout' && j.field === i)!
    ok(c, { t: 'hire', kind: 'hand' })
    ok(c, { t: 'assign', id: scout.id, unit: c.crew[1].id })
    ok(c, { t: 'priority', unit: c.crew[1].id, work: 'field', level: 0 })
    const seen: GameEvent[] = []
    until(c, x => x.season!.fields[i].deadDay >= 0, seen)
    seen.push(...ok(c, { t: 'day' }).events)
    const drop = seen.find(e => e.type === 'dropped' && e.data?.job === scout.id)!
    expect(drop).toBeDefined()
    expect(String(drop.data!.why)).toMatch(/dead/)
    expect(c.season!.jobs.some(j => j.id === scout.id)).toBe(false)
  })
})

describe('rest', () => {
  it('a worn-out person rests by themselves, is warned of first, and is never hurt unless told to work on', () => {
    const c = summer()
    const u = c.crew[0]
    u.tired = 0.84
    for (const i of [0, 1, 2, 3, 4, 5]) S.apply(world, c, { t: 'job', kind: 'scout', field: i })
    const seen: GameEvent[] = []
    for (let k = 0; k < 8; k++) seen.push(...ok(c, { t: 'day' }).events)
    expect(seen.some(e => e.type === 'wornOut' && /rest/.test(e.text))).toBe(true)
    expect(seen.some(e => e.type === 'hurt')).toBe(false)
    expect(u.tired).toBeLessThan(S.HURT_TIRED + S.TIRE_PER_DAY)
    ok(c, { t: 'rest', unit: 0 })
    expect(S.resting(u)).toBe(true)
    ok(c, { t: 'day' })
    expect(c.season!.worked.some(w => w.unit === 0)).toBe(false)
    ok(c, { t: 'rest', unit: 0, mode: 'push' })
    u.tired = 0.95
    expect(S.resting(u)).toBe(false)
  })
})

describe('what goals cost, the money and the year', () => {
  it('each goal says what it costs and whether the farm can pay now', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    const costs = S.goalCosts(c)
    const stump = costs.find(x => x.id === 'stump')!
    expect(stump.cost).toBe(S.STUMP_FEE)
    expect(stump.can).toBe(false)
    expect(stump.why).toMatch(/felled/)
    const shed = costs.find(x => x.id === 'build:shed')!
    expect(shed.cost).toBe(S.buildCost(c, 'shed').total)
    expect(shed.can).toBe(c.cash >= shed.cost)
    expect(costs.find(x => x.id === 'foreman')!.why).toMatch(/hire someone first/)
    c.cash = 100
    expect(costs.length).toBe(S.goalCosts(c).length)
    expect(S.goalCosts(c).find(x => x.id === 'build:shed')!.can).toBe(false)
  })

  it('am I all right: the farm after the year-end bills if the crop sold today, the spring loan counted as owed', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    const spring = S.moneyNow(world, c)
    expect(spring.cash).toBeCloseTo(c.cash - S.planCosts(c).total, 6)
    expect(spring.due.loan).toBeCloseTo(Math.max(0, S.planCosts(c).total - c.cash), 6)
    expect(spring.due.total).toBeCloseTo(S.NOTE_PAYMENT + S.LIVING + spring.due.loan, 6)
    // Buying on the loan raises what is due at the year end.
    ok(c, { t: 'buy', upgrade: 'vent' })
    expect(S.moneyNow(world, c).due.total).toBeCloseTo(spring.due.total + S.UPGRADES.vent.cost, 6)
    ok(c, { t: 'begin' })
    until(c, x => x.season!.fields.some(f => f.weighed))
    const m = S.moneyNow(world, c)
    expect(m.stored).toBeGreaterThan(0)
    // The oats and clover the resting fields bring at the season's close count, as do the wages and penalties still to
    // pay and the interest on what the year end would leave owed.
    expect(m.rest).toBe(c.season!.fields.filter(f => f.status === 'rest').length * S.REST_INCOME)
    expect(m.after).toBeCloseTo(m.cash + m.stored + m.growing + m.rest - m.wages - m.penalties - S.NOTE_PAYMENT - S.LIVING - m.due.mortgage - m.interest, 6)
    expect(m.parts.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(m.after, 6)
  })

  it('the year-end sentence: began with, ends with, and the three largest reasons', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    until(c, () => false)
    ok(c, { t: 'endSeason' })
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    const y = S.yearStory(c.history[0])
    expect([y.began, y.ended]).toEqual([c.history[0].cashStart, c.history[0].cashEnd])
    expect(y.reasons.length).toBe(3)
    for (let k = 1; k < 3; k++) expect(Math.abs(y.reasons[k - 1].amount)).toBeGreaterThanOrEqual(Math.abs(y.reasons[k].amount))
  })
})

describe('the calls, judged fairly', () => {
  it('a field where a blighted hill was found says blight is there, and that the crew will pull it', () => {
    let found = false
    for (const [year, seed] of [[1994, 1], [2008, 2], [2001, 3], [1990, 7]] as const) {
      const c = S.createCampaign(world, { seed, startYear: year })
      ok(c, { t: 'begin' })
      until(c, x => S.FIELD_NAMES.some((_, i) => S.fieldInfo(x, i).blightHills > 0))
      const i = S.FIELD_NAMES.findIndex((_, k) => S.fieldInfo(c, k).blightHills > 0)
      if (i < 0) continue
      const f = S.fieldInfo(c, i)
      expect(f.blightSeen).toBe(true)
      expect(f.pullBy).toBe('routine')
      ok(c, { t: 'routine', kind: 'rogue', auto: false })
      expect(S.fieldInfo(c, i).pullBy).toBe('you')
      found = true
      break
    }
    expect(found).toBe(true)
  })

  it('the spray question: about how many passes and dollars keep the fields sprayed', () => {
    const c = summer()
    const o = S.sprayOutlook(world, c)
    expect(o.fields).toBeGreaterThan(0)
    expect(o.passes).toBeGreaterThanOrEqual(o.fields)
    expect(o.dollars).toBe(o.passes * o.perPass)
  })

  it('a kill on or after the day the coach asked for it is no fault; an earlier one counts its days', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'routine', kind: 'kill', auto: true })
    ok(c, { t: 'begin' })
    until(c, x => x.season!.fields.some(f => f.killDay >= 0))
    const i = c.season!.fields.findIndex(f => f.killDay >= 0)
    const k = S.killTiming(c, i)
    expect(k.asked).toBeGreaterThanOrEqual(0)
    expect(k.killed).toBeGreaterThanOrEqual(k.asked)
    expect(k.early).toBe(0)
    const d = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(d, { t: 'begin' })
    until(d, x => x.season!.fields.some(f => f.tiDay >= 0 && f.status === 'growing'))
    const j = d.season!.fields.findIndex(f => f.tiDay >= 0 && f.status === 'growing')
    ok(d, { t: 'job', kind: 'kill', field: j })
    ok(d, { t: 'bump', id: d.season!.jobs.find(x => x.kind === 'kill')!.id })
    until(d, x => x.season!.fields[j].killDay >= 0)
    expect(S.killTiming(d, j).early).toBeGreaterThan(0)
  })

  it('one rule for planting: the advice plants exactly when plantReady says so', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'routine', kind: 'plant', auto: false })
    ok(c, { t: 'begin' })
    for (let g = 0; g < 60; g++) {
      const advice = S.advise(world, c)
      for (const i of [0, 2, 4]) {
        const ready = S.plantReady(world, c, i)
        expect(advice.some(a => a.act === 'plant' && a.field === i), `${g} ${i}`).toBe(ready.ok)
        if (!ready.ok) expect(advice.find(a => a.act === 'wait' && a.field === i)?.why).toBe(ready.why)
      }
      ok(c, { t: 'day' })
    }
  })

  it('a lone hauler digs no more than the rest of the day can haul in before a freezing night', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    let capped = 0, frozen = 0
    for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
      for (const e of ok(c, { t: 'day' }).events) {
        if (e.type === 'digWait') capped++
        if (e.type === 'frozenInField') frozen += Number(e.data?.cwt ?? 0)
      }
    }
    expect(capped).toBeGreaterThan(0)
    expect(frozen).toBeLessThan(50)
  })
})
