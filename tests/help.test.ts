// Many hands: someone with nothing of their own to do helps at an order someone else is working, and the order goes
// faster for each helper at it.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { parseSave, serialize } from '../src/game/save.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()
const CUTS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

function farm(hands = 2, operators = 0): S.Campaign {
  const c = S.createCampaign(world, { seed: 11, startYear: 1987 })
  c.cash += 60000
  // (more than two hired people need a bunkhouse)
  if (hands + operators > 2) c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: S.HOME_YARD, done: 12, need: 12, built: true })
  for (let h = 0; h < hands; h++) expect(S.apply(world, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
  for (let h = 0; h < operators; h++) expect(S.apply(world, c, { t: 'hire', kind: 'operator' }).ok).toBe(true)
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  return c
}

// The fields planned for potatoes and not yet planted.
function idle(c: S.Campaign): number[] {
  return c.season!.fields.flatMap((f, i) => f.status === 'idle' ? [i] : [])
}

function work(c: S.Campaign, cuts: number[]): void {
  for (const to of cuts) expect(S.apply(world, c, { t: 'work', to }).ok).toBe(true)
}

// Days worked in windows, each with its night; the events of the nights.
function days(c: S.Campaign, n: number, cuts = CUTS): S.GameEvent[] {
  const out: S.GameEvent[] = []
  for (let k = 0; k < n && c.phase === 'season' && !S.seasonDone(c); k++) {
    c.incidents = []
    work(c, cuts)
    const r = S.apply(world, c, { t: 'day' })
    expect(r.ok).toBe(true)
    out.push(...r.events)
  }
  return out
}

// On to a working day the weather lets the crew plant on, whole days at a time.
function toPlantingDay(c: S.Campaign): void {
  for (let g = 0; g < 60; g++) {
    const s = c.season!
    if (S.workday(c, s) && !S.jobWait('plant', s.fields[idle(c)[0]], S.getDay(world, s.year, s.day))) return
    days(c, 1, [])
  }
  throw new Error('no planting day')
}

// A farm on a planting day with the planting of these many fields ordered (the first idle ones).
function planting(hands: number, fields = 2, operators = 0): { c: S.Campaign; jobs: S.Job[] } {
  const c = farm(hands, operators)
  toPlantingDay(c)
  const at = idle(c).slice(0, fields)
  expect(at.length).toBe(fields)
  for (const field of at) expect(S.apply(world, c, { t: 'job', kind: 'plant', field }).ok).toBe(true)
  return { c, jobs: at.map(field => c.season!.jobs.find(j => j.kind === 'plant' && j.field === field)!) }
}

const hands = (c: S.Campaign) => c.crew.filter(u => u.kind === 'hand')

describe('many hands', () => {
  it('a hand with nothing to do helps at the planting the farmer is doing, and the day\'s record says so', () => {
    const { c } = planting(2)
    work(c, CUTS)
    const s = c.season!
    const held = s.jobs.find(j => j.id === c.crew[0].job)!
    expect(held.kind).toBe('plant')
    for (const u of hands(c)) {
      expect(u.job).toBe(-1)
      expect(u.help).toBe(held.id)
      expect(u.at).toBe(held.field)
      expect(u.road).toBe(0)
      expect(u.rig).toBe('')
      expect(s.worked.filter(w => w.unit === u.id && w.help && w.kind === 'plant').length).toBeGreaterThan(0)
      expect(s.worked.filter(w => w.unit === u.id && w.help).every(w => w.rig === undefined && w.from === undefined)).toBe(true)
      expect(s.clock!.log.some(l => l.unit === u.id && l.help && l.kind === 'plant')).toBe(true)
    }
    expect(S.helpersAt(c, held)).toBe(2)
    // What a person is doing reads as helping.
    const info = S.peopleInfo(c).find(p => p.id === hands(c)[0].id)!
    expect(info.job).toBeNull()
    expect(info.helping).toEqual({ kind: 'plant', field: held.field })
    expect(info.doing).toMatch(/^Helping with planting in /)
    expect(S.crewInfo(c).find(p => p.id === hands(c)[0].id)!.helping).toEqual({ kind: 'plant', field: held.field })
    expect(S.peopleInfo(c)[0].helping).toBeUndefined()

    const alone = planting(0).c
    work(alone, CUTS)
    expect(alone.season!.worked.some(w => w.help)).toBe(false)
    expect(alone.season!.worked.some(w => w.kind === 'plant')).toBe(true)
  })

  it('a planting goes faster with two helpers', () => {
    const helped = planting(2), alone = planting(0)
    for (const x of [helped, alone]) work(x.c, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
    expect(helped.jobs[0].done).toBeGreaterThan(alone.jobs[0].done * 1.4)
    // The same fields planted in fewer days.
    const daysToPlant = (hands: number) => {
      const { c, jobs } = planting(hands, 4)
      for (let n = 1; n <= 30; n++) {
        days(c, 1)
        if (jobs.every(j => !c.season!.jobs.includes(j))) return n
      }
      return Infinity
    }
    const fast = daysToPlant(2), slow = daysToPlant(0)
    expect(fast).toBeLessThan(slow)
  })

  it('a two-day dig goes faster with helpers', () => {
    // The routine's season to the morning a dig is first on the list with nothing in barrels.
    const c = farm(2)
    let dig: S.Job | undefined
    for (let g = 0; g < 300 && !dig; g++) {
      const s = c.season!
      const first = s.jobs.find(j => j.kind === 'dig' && j.done === 0)
      if (first && S.workday(c, s) && !s.jobs.some(j => j.kind === 'haul' || (j.kind === 'dig' && j.done > 0))) dig = first
      else days(c, 1, [])
    }
    expect(dig?.need).toBe(2)
    // The same farm with and without its hands' help (set never to do field work, they cannot help a machine).
    const run = (help: boolean) => {
      const x = structuredClone(c)
      if (!help) for (const u of hands(x)) expect(S.apply(world, x, { t: 'priority', unit: u.id, work: 'field', level: 0 }).ok).toBe(true)
      const job = x.season!.jobs.find(j => j.id === dig!.id)!
      let first = 0, n = 0
      while (n < 20 && x.season!.jobs.includes(job)) {
        days(x, 1)
        n++
        if (!first && job.done > 0) first = job.done
      }
      return { first, n }
    }
    const helped = run(true), alone = run(false)
    // (the first day's dig: with two helpers at the field from the second stretch on)
    expect(helped.first).toBeGreaterThan(alone.first * 1.4)
    expect(helped.n).toBeLessThan(alone.n)
  })

  it('a helper given an order of their own stops helping and works it', () => {
    const { c, jobs } = planting(2)
    work(c, [0.1, 0.2, 0.3])
    const hand = hands(c)[0]
    expect(hand.help).toBe(jobs[0].id)
    const field = c.season!.fields.findIndex(f => f.status === 'rest')
    expect(field).toBeGreaterThanOrEqual(0)
    const r = S.apply(world, c, { t: 'job', kind: 'rocks', field, unit: hand.id })
    expect(r.ok, r.err).toBe(true)
    const rocks = c.season!.jobs.find(j => j.kind === 'rocks' && j.field === field)!
    work(c, [0.4])
    expect(hand.job).toBe(rocks.id)
    expect(hand.help).toBeUndefined()
    expect(S.peopleInfo(c).find(p => p.id === hand.id)!.helping).toBeUndefined()
    work(c, [0.6, 1])
    expect(c.season!.worked.some(w => w.unit === hand.id && w.kind === 'rocks' && !w.help)).toBe(true)
    expect(rocks.done).toBeGreaterThan(0)
    // The other hand goes on helping.
    expect(hands(c)[1].help).toBe(c.crew[0].job)
  })

  it('someone set never to do field work never helps at machine work', () => {
    const c = farm(1, 1)
    const op = c.crew.find(u => u.kind === 'operator')!
    expect(op.prio.field).toBe(0)
    let helped = 0
    for (let n = 0; n < 200 && c.phase === 'season' && !S.seasonDone(c); n++) {
      c.incidents = []
      for (const to of [0.25, 0.5, 0.75, 1]) {
        S.apply(world, c, { t: 'work', to })
        const j = op.help !== undefined ? c.season!.jobs.find(x => x.id === op.help) : undefined
        if (j) expect(S.jobSkill(j.kind)).not.toBe('machine')
        for (const u of c.crew) if (u !== op && u.help !== undefined) helped++
      }
      expect(c.season!.worked.some(w => w.unit === op.id && w.help && S.jobSkill(w.kind) === 'machine')).toBe(false)
      S.apply(world, c, { t: 'day' })
    }
    expect(helped).toBeGreaterThan(0)
  })

  // (a farm takes four hands at most: the fifth who could help is the operator, set to do field work)
  it('at most three help at one order, of five who could', () => {
    const { c, jobs } = planting(4, 1, 1)
    const op = c.crew.find(u => u.kind === 'operator')!
    expect(S.apply(world, c, { t: 'priority', unit: op.id, work: 'field', level: 1 }).ok).toBe(true)
    let most = 0
    for (const to of CUTS) {
      work(c, [to])
      const job = c.season!.jobs.find(j => j.id === jobs[0].id)
      if (!job) break
      const n = c.crew.filter(u => u.help === job.id).length
      expect(n).toBeLessThanOrEqual(S.HELPERS_MOST)
      expect(S.helpersAt(c, job)).toBeLessThanOrEqual(S.HELPERS_MOST)
      most = Math.max(most, n)
    }
    expect(most).toBe(3)
  })

  it('a helper\'s day is a working day: they tire, and nobody calls them idle', () => {
    const { c } = planting(2, 4)
    const before = hands(c).map(u => u.tired)
    const events = days(c, 1)
    hands(c).forEach((u, k) => expect(u.tired, u.name).toBeGreaterThan(before[k]))
    events.push(...days(c, 3))
    expect(events.filter(e => e.type === 'idleNever')).toEqual([])
    for (const u of hands(c)) expect(u.idleRun).toBeUndefined()
  })

  it('a whole day in one step is the same each time, and a save part way through a day goes on to the same end', () => {
    const run = () => {
      const { c } = planting(2, 3)
      days(c, 40, [])
      return S.hashCampaign(c)
    }
    expect(run()).toBe(run())
    const saved = (save: boolean) => {
      const { c: c0 } = planting(2, 3)
      work(c0, [0.4])
      expect(hands(c0).every(u => u.help !== undefined)).toBe(true)
      const c = save ? parseSave(serialize(c0, 0))!.campaign : c0
      days(c, 30, [0.7, 1])
      return S.hashCampaign(c)
    }
    expect(saved(true)).toBe(saved(false))
  })
})
