// The farmstead, section 1: people. Each mechanic is held from both sides: what it gives and what it costs.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, JobKind, Unit } from '../src/sim/index.ts'
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

function clearList(c: Campaign): void {
  for (const j of [...c.season!.jobs]) ok(c, { t: 'cancel', id: j.id })
}

const order = (c: Campaign, kind: JobKind, field: number) => c.season!.jobs.find(j => j.kind === kind && j.field === field)
const person = (c: Campaign, id: number) => c.crew.find(u => u.id === id)!

// 2001, seed 3: every home field in potatoes, grown on reference practice to mid July, the list cleared.
const mid = S.createCampaign(world, { seed: 3, startYear: 2001 })
for (const i of [1, 3]) ok(mid, { t: 'plan', field: i, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } })
ok(mid, { t: 'begin' })
tend(mid, x => x.season!.day >= S.dayIndex(2001, 6, 12), ['kill', 'dig'])
clearList(mid)

// Days ahead from a campaign in season until this turns true, keeping the list as it is.
function until(c: Campaign, cond: (c: Campaign) => boolean): void {
  for (let k = 0; k < 40 && !cond(c); k++) ok(c, { t: "day" })
  expect(cond(c)).toBe(true)
}
const dryWorkday = (c: Campaign) => S.workday(c, c.season!) && S.getDay(world, c.year, c.season!.day).prcp < 2 && S.getDay(world, c.year, c.season!.day).wind < 7.5

describe('the day of the week', () => {
  it('comes from the calendar by integer arithmetic and agrees with the civil calendar', () => {
    for (let y = 1973; y <= 2025; y++) {
      for (let d = 0; d < S.daysInYear(y); d += 3) {
        expect(S.weekday(y, d), `${y} day ${d}`).toBe((new Date(Date.UTC(y, 0, 1 + d)).getUTCDay() + 6) % 7)
      }
    }
    expect(S.WEEKDAYS[S.weekday(2024, S.dayIndex(2024, 0, 1))]).toBe('Monday')
  })
})

describe('Sundays off', () => {
  const sat = structuredClone(mid)
  until(sat, x => S.weekday(2001, x.season!.day) === 5)
  for (const f of [0, 1, 2, 3, 4, 5]) ok(sat, { t: 'job', kind: 'scout', field: f })

  it('is the rule from the start: nobody works on a Sunday, and the orders wait', () => {
    const c = structuredClone(sat)
    expect(c.sundaysOff).toBe(true)
    days(c, 1)
    expect(c.season!.worked.length).toBeGreaterThan(0)
    const list = structuredClone(c.season!.jobs)
    expect(S.labourInfo(c).restDay).toBe(true)
    expect(S.peopleInfo(c)[0].doing).toBe('Sunday: resting')
    days(c, 1)
    expect(c.season!.worked).toEqual([])
    expect(c.season!.jobs).toEqual(list)
  })

  it('rests everyone: a Sunday takes 0.3 off tiredness, where working it adds to it', () => {
    const rest = structuredClone(sat), work = structuredClone(sat)
    for (const c of [rest, work]) c.crew[0].tired = 0.5
    ok(work, { t: 'sundays', off: false })
    days(rest, 1)
    days(work, 1)
    const before = [rest.crew[0].tired, work.crew[0].tired]
    days(rest, 1)
    days(work, 1)
    expect(rest.crew[0].tired).toBeCloseTo(Math.max(0, before[0] - S.REST_PER_DAY), 12)
    expect(work.season!.worked.length).toBeGreaterThan(0)
    expect(work.crew[0].tired).toBeGreaterThan(rest.crew[0].tired)
    refused(work, { t: 'sundays', off: false }, /already works Sundays/)
  })
})

describe('skill', () => {
  it('sets speed: 0.6 + 0.08 a level, so level 5 at middling mood is the old speed', () => {
    const u = structuredClone(mid.crew[0])
    u.mood = 0.6
    for (let level = 0; level <= 10; level++) {
      u.skills.field = level
      expect(S.speed(u, 'field')).toBeCloseTo(0.6 + 0.08 * level, 12)
    }
    u.skills.field = 5
    expect(S.speed(u, 'field')).toBeCloseTo(1, 12)
  })

  it('a skilled hand walks more fields in a day than an unskilled one', () => {
    const walked = (level: number) => {
      const c = structuredClone(mid)
      ok(c, { t: 'sundays', off: false })
      ok(c, { t: 'hire', kind: 'hand' })
      const hand = c.crew[1]
      hand.skills.field = level
      hand.trait = ''
      for (const f of [0, 1, 2, 3, 4, 5]) ok(c, { t: 'job', kind: 'scout', field: f, unit: hand.id })
      until(c, x => S.getDay(world, 2001, x.season!.day).prcp < 15)
      days(c, 1)
      return c.season!.worked.filter(w => w.unit === hand.id && !order(c, 'scout', w.field)).length
    }
    expect(walked(10)).toBeGreaterThan(walked(0))
    expect(walked(0)).toBeGreaterThan(0)
  })

  it('sets results: a better sprayer lays down more protection, a better scout finds more blight', () => {
    const sprayed = (level: number) => {
      const c = structuredClone(mid)
      ok(c, { t: 'sundays', off: false })
      c.crew[0].skills.machine = level
      until(c, x => dryWorkday(x))
      ok(c, { t: 'job', kind: 'spray', field: 0 })
      days(c, 1)
      return c.season!.fields[0].residue
    }
    expect(sprayed(10) / sprayed(0)).toBeCloseTo(1 / S.SPRAY_BASE, 9)
    const found = (level: number) => {
      const c = structuredClone(mid)
      ok(c, { t: 'sundays', off: false })
      c.crew[0].skills.field = level
      const f = c.season!.fields[2]
      for (let i = 0; i < S.HILLS; i++) if (f.hState[i] & S.H_EMERGED) { f.hLes[i] = 0.1; f.hState[i] &= ~S.H_KNOWN }
      until(c, x => S.getDay(world, 2001, x.season!.day).prcp < 15)
      ok(c, { t: 'job', kind: 'scout', field: 2 })
      const e = days(c, 1).find(x => x.type === 'scout' && x.field === 2)!
      return e.data!.found as number
    }
    expect(found(10)).toBeGreaterThan(found(0) + 20)
    const u = structuredClone(mid.crew[0])
    u.skills.field = 0
    expect(S.scoutChance(u)).toBeCloseTo(S.SCOUT_BASE, 12)
    u.skills.field = 10
    expect(S.scoutChance(u)).toBeCloseTo(S.SCOUT_BASE + 10 * S.SCOUT_PER, 12)
    u.trait = 'sharp'
    expect(S.scoutChance(u)).toBe(0.95)
  })

  it('grows with work: a point a crew-day, 6 + 3L points from level L, with an event', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'sundays', off: false })
    const farmer = c.crew[0]
    expect(farmer.skills.field).toBe(6)
    farmer.xp.field = S.xpNeed(6) - 0.05
    until(c, x => S.getDay(world, 2001, x.season!.day).prcp < 15)
    ok(c, { t: 'job', kind: 'scout', field: 0 })
    const rate = S.speed(farmer, 'field')
    const events = days(c, 1)
    expect(S.xpNeed(6)).toBe(24)
    expect(farmer.skills.field).toBe(7)
    expect(farmer.xp.field).toBeCloseTo(S.JOB_DAYS.scout / rate - 0.05, 9)
    expect(events.some(e => e.type === 'skillUp' && e.data!.unit === 0)).toBe(true)
  })
})

describe('traits', () => {
  const base = (): Unit => { const u = structuredClone(mid.crew[0]); u.mood = 0.6; u.tired = 0; return u }
  const withTrait = (t: S.Trait): Unit => { const u = base(); u.trait = t; return u }

  it('change speed: strong back in the field and woods, early riser at everything, slow and sure slower', () => {
    const plain = base()
    expect(S.speed(withTrait('strong'), 'field') / S.speed(plain, 'field')).toBeCloseTo(S.STRONG_SPEED, 12)
    expect(S.speed(withTrait('strong'), 'woods') / S.speed(plain, 'woods')).toBeCloseTo(S.STRONG_SPEED, 12)
    expect(S.speed(withTrait('strong'), 'machine')).toBe(S.speed(plain, 'machine'))
    for (const k of S.SKILLS) expect(S.speed(withTrait('early'), k) / S.speed(plain, k)).toBeCloseTo(S.EARLY_SPEED, 12)
    for (const k of S.SKILLS) expect(S.speed(withTrait('slow'), k) / S.speed(plain, k)).toBeCloseTo(S.SLOW_SPEED, 12)
  })

  it('change results: steady hands spray as if two levels better; sharp eyes find more, careless ones fewer', () => {
    const plain = base()
    plain.skills.machine = 3
    const steady = withTrait('steady')
    steady.skills.machine = 3
    expect(S.sprayCover(steady)).toBeCloseTo(S.SPRAY_BASE + S.SPRAY_PER * 5, 12)
    expect(S.sprayCover(steady)).toBeGreaterThan(S.sprayCover(plain))
    expect(S.scoutChance(withTrait('sharp')) - S.scoutChance(base())).toBeCloseTo(S.SHARP_SCOUT, 12)
    expect(S.scoutChance(base()) - S.scoutChance(withTrait('careless'))).toBeCloseTo(S.CARELESS_SCOUT, 12)
  })

  it('change tiredness and mood: hard to tire, cheerful, hot-headed', () => {
    const run = (trait: S.Trait | '', setup: (u: Unit) => void, n: number) => {
      const c = structuredClone(mid)
      ok(c, { t: 'sundays', off: false })
      ok(c, { t: 'hire', kind: 'hand' })
      const u = c.crew[1]
      u.trait = trait
      setup(u)
      // A full day's walking, every day.
      for (let k = 0; k < n; k++) {
        for (const f of [0, 1, 2, 3, 4, 5]) if (!order(c, 'scout', f)) S.apply(world, c, { t: 'job', kind: 'scout', field: f, unit: u.id })
        ok(c, { t: 'day' })
      }
      return u
    }
    const tireless = run('tireless', () => {}, 3).tired
    expect(tireless).toBeGreaterThan(0)
    expect(tireless / run('', () => {}, 3).tired).toBeCloseTo(S.TIRELESS, 9)
    // Underpaid to nothing: a cheerful person's mood stops at 0.4, a plain one's sinks below it.
    const cheap = (u: Unit) => { u.wage = S.WAGE_MIN }
    expect(run('cheerful', cheap, 40).mood).toBeCloseTo(S.CHEERFUL_FLOOR, 9)
    expect(run('', cheap, 6).mood).toBeLessThan(S.CHEERFUL_FLOOR + 0.25)
    // Worn out, a hot-headed person's mood falls twice as fast.
    const worn = (u: Unit) => { u.tired = 1 }
    const hot = run('hothead', worn, 1), calm = run('', worn, 1)
    expect((S.MOOD_START - hot.mood) / (S.MOOD_START - calm.mood)).toBeGreaterThan(1.9)
    // Others' moods lift by 0.03 for a cheerful colleague.
    const c = structuredClone(mid)
    ok(c, { t: 'hire', kind: 'hand' })
    ok(c, { t: 'hire', kind: 'hand' })
    c.crew[1].trait = ''
    c.crew[2].trait = 'cheerful'
    const lifted = S.moodTarget(c, c.crew[1], 0)
    c.crew[2].trait = ''
    expect(lifted - S.moodTarget(c, c.crew[1], 0)).toBeCloseTo(S.CHEERFUL_OTHERS, 12)
  })

  it('a homebody will not work winters', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'hire', kind: 'hand' })
    c.crew[1].trait = 'homebody'
    expect(S.winterBlock(c, c.crew[1], 'woods')).toMatch(/homebody/)
    expect(S.winterBlock(c, c.crew[1], 'off')).toBe('')
  })
})

describe('tiredness', () => {
  it('slows work above 0.6, to 30% less when worn out', () => {
    const u = structuredClone(mid.crew[0])
    u.tired = 0.6
    const fresh = S.speed(u, 'machine')
    u.tired = 1
    expect(S.speed(u, 'machine') / fresh).toBeCloseTo(1 - S.TIRED_SLOW, 12)
    u.tired = 0.8
    expect(S.speed(u, 'machine') / fresh).toBeCloseTo(1 - S.TIRED_SLOW / 2, 12)
  })

  it('rises 0.07 a full working day and falls 0.3 a day off, so a tired crew rests back to speed', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'sundays', off: false })
    const farmer = c.crew[0]
    // Two days of full work.
    for (let k = 0; k < 2; k++) {
      until(c, x => S.getDay(world, 2001, x.season!.day).prcp < 15)
      for (const f of [0, 1, 2, 3, 4, 5]) if (!order(c, 'scout', f)) ok(c, { t: 'job', kind: 'scout', field: f })
      const before = farmer.tired
      days(c, 1)
      expect(farmer.tired).toBeCloseTo(before + S.TIRE_PER_DAY, 9)
    }
    // A day with nothing to do.
    clearList(c)
    farmer.road = 0
    farmer.to = farmer.at
    farmer.tired = 0.95
    const slow = S.speed(farmer, 'field')
    days(c, 1)
    expect(farmer.tired).toBeCloseTo(0.65, 12)
    days(c, 1)
    expect(S.speed(farmer, 'field')).toBeGreaterThan(slow)
  })
})

describe('mood, wages and quitting', () => {
  it('a wage cut below the ask sinks mood until they quit; a raise back restores it', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'hire', kind: 'hand' })
    const hand = c.crew[1]
    hand.trait = ''
    ok(c, { t: 'raise', unit: hand.id, wage: 150 })
    refused(c, { t: 'raise', unit: hand.id, wage: 150 }, /already/)
    refused(c, { t: 'raise', unit: 0, wage: 500 }, /farmer/)
    refused(c, { t: 'raise', unit: hand.id, wage: 50 }, /between/)
    // The next month's pay is the new wage (here a raise, so that nobody quits first).
    const pay = structuredClone(c)
    ok(pay, { t: 'raise', unit: hand.id, wage: 520 })
    const paid = pay.yearWages
    until(pay, x => x.yearWages > paid)
    expect(pay.yearWages - paid).toBe(520)
    days(c, 5)
    const raised = structuredClone(c)
    const events: S.GameEvent[] = []
    for (let k = 0; k < 80 && c.crew.length > 1; k++) events.push(...days(c, 1))
    expect(c.crew.length).toBe(1)
    expect(events.some(e => e.type === 'unhappy')).toBe(true)
    expect(events.some(e => e.type === 'quit')).toBe(true)
    const quitDay = events.find(e => e.type === 'quit')!.day
    const lowFrom = events.find(e => e.type === 'unhappy')!.day
    expect(quitDay - lowFrom).toBeGreaterThanOrEqual(S.QUIT_DAYS - 1)
    // Raised back above the ask, the same person stays and cheers up.
    const r = raised.crew[1]
    ok(raised, { t: 'raise', unit: r.id, wage: 600 })
    const before = r.mood
    days(raised, 20)
    expect(raised.crew.length).toBe(2)
    expect(r.mood).toBeGreaterThan(before)
    expect(S.moodTarget(raised, r, 0)).toBeCloseTo(Math.min(1, S.MOOD_BASE + (600 - r.ask) / r.ask - S.MOOD_TIRED * Math.max(0, r.tired - 0.5)), 9)
  })

  it('mood speeds or slows work: 0.85 + 0.25 x mood', () => {
    const u = structuredClone(mid.crew[0])
    u.tired = 0
    u.mood = 1
    const happy = S.speed(u, 'field')
    u.mood = 0
    expect(happy / S.speed(u, 'field')).toBeCloseTo(1.1 / 0.85, 12)
  })
})

describe('applicants', () => {
  it('three each spring, the same for the same seed and year, each with skills, a trait and an asking wage', () => {
    const c = S.createCampaign(world, { seed: 9, startYear: 1999 })
    expect(c.applicants.length).toBe(S.APPLICANTS)
    expect(S.createCampaign(world, { seed: 9, startYear: 1999 }).applicants).toEqual(c.applicants)
    expect(S.createCampaign(world, { seed: 10, startYear: 1999 }).applicants).not.toEqual(c.applicants)
    for (const a of S.applicantInfo(c)) {
      expect(a.why).toBe('')
      expect(S.TRAIT_LIST).toContain(a.trait)
      expect(a.traitText.length).toBeGreaterThan(5)
      expect(Math.max(...S.SKILLS.map(k => a.skills[k]))).toBeGreaterThanOrEqual(4)
      expect(a.ask / S.askFor(a.skills)).toBeGreaterThan(0.85)
      expect(a.ask / S.askFor(a.skills)).toBeLessThan(1.15)
    }
    // A better hand asks more.
    expect(S.askFor({ machine: 8, field: 3, woods: 3, build: 3, pack: 3 })).toBeGreaterThan(S.askFor({ machine: 5, field: 3, woods: 3, build: 3, pack: 3 }))
  })

  it('hired, one starts on what they asked, with their own skills and priorities from them; the rest lapse when the season begins', () => {
    const c = S.createCampaign(world, { seed: 9, startYear: 1999 })
    const a = c.applicants[1]
    ok(c, { t: 'hire', applicant: a.id })
    refused(c, { t: 'hire', applicant: a.id }, /No such applicant/)
    const u = c.crew[1]
    expect([u.name, u.skills, u.trait, u.wage, u.ask]).toEqual([a.name, a.skills, a.trait, a.ask, a.ask])
    expect(u.prio).toEqual(S.defaultPrio(a.skills))
    expect(S.planCosts(c).wages).toBe(a.ask)
    ok(c, { t: 'begin' })
    expect(c.applicants).toEqual([])
    refused(c, { t: 'hire', applicant: c.crew[1].id }, /other work/)
  })

  it('default priorities: the best skill first, others above 2 second, the rest third', () => {
    expect(S.defaultPrio({ machine: 7, field: 3, woods: 2, build: 7, pack: 0 })).toEqual({ machine: 1, field: 2, woods: 3, build: 1, pack: 3 })
  })
})

describe('priorities and the morning', () => {
  // The farmer and one hand who walks first and drives second, with one tractor.
  const setup = () => {
    const c = structuredClone(mid)
    ok(c, { t: 'sundays', off: false })
    ok(c, { t: 'hire', kind: 'hand' })
    const hand = c.crew[1]
    ok(c, { t: 'priority', unit: hand.id, work: 'machine', level: 2 })
    return { c, hand }
  }

  it('each takes the work they put first, whatever its place on the list', () => {
    const { c, hand } = setup()
    until(c, x => dryWorkday(x))
    ok(c, { t: 'job', kind: 'spray', field: 0 })
    ok(c, { t: 'job', kind: 'scout', field: 1 })
    days(c, 1)
    const w = c.season!.worked
    expect(w.find(x => x.kind === 'scout')!.unit).toBe(hand.id)
    expect(w.find(x => x.kind === 'spray')!.unit).toBe(0)
  })

  it('priority 0 is never: no orders of that kind, pinned ones refused, and setting it unpins', () => {
    const { c, hand } = setup()
    ok(c, { t: 'job', kind: 'scout', field: 2, unit: hand.id })
    ok(c, { t: 'priority', unit: hand.id, work: 'field', level: 0 })
    expect(order(c, 'scout', 2)!.unit).toBe(-1)
    refused(c, { t: 'job', kind: 'scout', field: 3, unit: hand.id }, /never/)
    refused(c, { t: 'priority', unit: hand.id, work: 'field', level: 5 }, /priority/)
    for (let k = 0; k < 3; k++) days(c, 1)
    expect(c.season!.worked.every(w => w.unit === 0)).toBe(true)
  })

  it('machine work needs a free tractor: with one, the hand waits; with a second, both water the same day', () => {
    const run = (tractor2: boolean) => {
      const { c, hand } = setup()
      if (tractor2) c.upgrades.tractor2 = true
      ok(c, { t: 'priority', unit: hand.id, work: 'machine', level: 1 })
      for (const f of [2, 4]) c.season!.fields[f].dr = 40
      until(c, x => S.workday(x, x.season!) && S.getDay(world, 2001, x.season!.day).prcp < 5 && [2, 4].every(f => x.season!.fields[f].wet < S.WORKABLE_WET_MM))
      ok(c, { t: 'job', kind: 'water', field: 2 })
      ok(c, { t: 'job', kind: 'water', field: 4 })
      days(c, 1)
      return new Set(c.season!.worked.filter(w => w.kind === 'water').map(w => w.unit))
    }
    expect(run(false).size).toBe(1)
    expect(run(true).size).toBe(2)
  })
})

describe('the foreman', () => {
  it('puts what the block needs on the list each morning, does no field work, and is paid 40% more', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'sundays', off: false })
    ok(c, { t: 'hire', kind: 'hand' })
    const hand = c.crew[1]
    refused(c, { t: 'foreman', unit: 0, block: 'home' }, /farmer/)
    refused(c, { t: 'foreman', unit: hand.id, block: 'dufour' }, /no land/)
    refused(c, { t: 'foreman', unit: hand.id, block: null }, /not a foreman/)
    expect(S.payOf(hand)).toBe(S.HAND_WAGE)
    ok(c, { t: 'foreman', unit: hand.id, block: 'home' })
    expect(S.payOf(hand)).toBe(Math.round(S.HAND_WAGE * S.FOREMAN_PAY))
    refused(c, { t: 'job', kind: 'scout', field: 0, unit: hand.id }, /foreman/)
    ok(c, { t: 'hire', kind: 'hand' })
    refused(c, { t: 'foreman', unit: c.crew[2].id, block: 'home' }, /already/)
    expect(c.season!.jobs).toEqual([])
    const wanted = S.advise(world, c).filter(a => a.field >= 0 && a.act !== 'wait' && a.act !== 'sell' && a.act !== 'close')
    expect(wanted.length).toBeGreaterThan(0)
    days(c, 1)
    // What reference practice wanted that morning was ordered, and the foreman walked none of it.
    for (const a of wanted) expect(c.season!.jobs.some(j => j.kind === a.act && j.field === a.field) || c.season!.worked.some(w => w.kind === a.act && w.field === a.field)).toBe(true)
    expect(c.season!.worked.every(w => w.unit !== hand.id)).toBe(true)
    expect(S.peopleInfo(c)[1].doing).toMatch(/Foreman/)
    // Without a foreman nothing is put on the list.
    const d = structuredClone(mid)
    ok(d, { t: 'sundays', off: false })
    days(d, 1)
    expect(d.season!.jobs).toEqual([])
  })
})

describe('harvest-break pickers', () => {
  // 1990, seed 7: grown to September 21 with the vines killed and left; a dig ordered on Brook Field.
  const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
  ok(c, { t: 'begin' })
  tend(c, x => x.season!.day >= S.dayIndex(1990, 8, 21), ['dig'])
  clearList(c)
  ok(c, { t: 'sundays', off: false })
  const field = [0, 2, 4, 5].find(i => S.fieldInfo(c, i).status === 'dead')!
  until(c, x => S.getDay(world, 1990, x.season!.day).prcp < 6 && !S.fieldInfo(x, field).tooWet)
  ok(c, { t: 'job', kind: 'dig', field })

  it('are hired only in the harvest break, September 20 to October 10, and go back to school after it', () => {
    const early = structuredClone(mid)
    refused(early, { t: 'pickers', on: true }, /September 20 to October 10/)
    const x = structuredClone(c)
    ok(x, { t: 'pickers', on: true })
    refused(x, { t: 'pickers', on: true }, /already/)
    let events: S.GameEvent[] = []
    for (let k = 0; k < 40 && x.season!.pickers && !x.season!.frozen; k++) events.push(...days(x, 1))
    expect(x.season!.pickers).toBe(false)
    expect(events.some(e => e.type === 'pickers')).toBe(true)
    expect(events.find(e => e.type === 'pickers')!.day).toBe(S.dayIndex(1990, 9, 11))
  })

  it('make every dig 40% faster, and cost $160 a day worked', () => {
    const plain = structuredClone(c), picked = structuredClone(c)
    ok(picked, { t: 'pickers', on: true })
    const wages = [plain.yearWages, picked.yearWages]
    days(plain, 1)
    days(picked, 1)
    const a = order(plain, 'dig', field)!.done, b = order(picked, 'dig', field)!.done
    expect(b / a).toBeCloseTo(S.PICKER_DIG, 9)
    expect(picked.yearWages - wages[1] - (plain.yearWages - wages[0])).toBe(S.PICKER_DAY)
  })
})

describe('winter', () => {
  it('a laid-off person costs nothing over the winter and comes back in spring with what they learned', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'hire', kind: 'hand' })
    const hand = c.crew[1]
    hand.skills.field = 7
    tend(c, x => S.seasonDone(x))
    ok(c, { t: 'endSeason' })
    expect(hand.winter).toBe('off')
    for (const u of c.crew) expect(u.tired).toBe(0)
    const wages = c.yearWages
    while (c.phase === 'cellar') ok(c, { t: 'month' })
    expect(c.yearWages).toBe(wages)
    ok(c, { t: 'next' })
    expect(c.crew[1].skills.field).toBe(7)
    expect(S.planCosts(c).wages).toBe(S.HAND_WAGE)
  })

  it('refuses work there is nothing to do, with the reason', () => {
    const c = structuredClone(mid)
    refused(c, { t: 'winter', unit: 0, work: 'pack' }, /packing shed/)
    refused(c, { t: 'winter', unit: 0, work: 'build' }, /Nothing is being built/)
    refused(c, { t: 'winter', unit: 0, work: 'off' }, /already/)
    refused(c, { t: 'winter', unit: 77, work: 'off' }, /No such person/)
    const w = S.winterInfo(c)
    expect(w.months).toBe(S.WINTER_MONTHS)
    expect(w.people[0].choices.find(x => x.work === 'off')!.ok).toBe(true)
    expect(w.people[0].choices.find(x => x.work === 'pack')!.why).toMatch(/packing shed/)
  })
})

describe('the people views', () => {
  it('report each person, their skills, trait, tiredness and mood in numbers and words, pay, priorities and what they are doing', () => {
    const c = structuredClone(mid)
    ok(c, { t: 'hire', kind: 'operator' })
    const info = S.peopleInfo(c)
    expect(info.length).toBe(2)
    const [f, o] = info
    expect([f.name, f.kind, f.skills, f.traitName, f.ask, f.foreman, f.winter]).toEqual([S.FARMER_NAME, 'farmer', c.crew[0].skills, '', 0, null, 'off'])
    expect(o.traitName).toBe(S.TRAITS[c.crew[1].trait as S.Trait].name)
    expect(o.traitText).toBe(S.TRAITS[c.crew[1].trait as S.Trait].text)
    expect([o.wage, o.pay, o.ask, o.prio.field]).toEqual([S.OPERATOR_WAGE, S.OPERATOR_WAGE, S.OPERATOR_WAGE, 0])
    for (const p of info) {
      expect(p.tiredWord.length).toBeGreaterThan(0)
      expect(p.moodWord.length).toBeGreaterThan(0)
      expect(p.doing.length).toBeGreaterThan(0)
      for (const k of S.SKILLS) expect(p.speed[k]).toBeCloseTo(S.speed(c.crew.find(u => u.id === p.id)!, k), 12)
    }
    // crewInfo keeps its shape.
    expect(Object.keys(S.crewInfo(c)[0]).sort()).toEqual(['at', 'id', 'job', 'kind', 'name', 'road', 'to', 'travelling', 'wage'])
    const l = S.labourInfo(c)
    expect([l.tractors, l.hired, l.housing, l.sundaysOff]).toEqual([1, 1, S.HOUSED_OUT, true])
  })
})
