// The farm's standing orders: the routine puts the routine work on the list by itself; the player makes the calls.
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

// Days pass with nobody giving an order; the season is closed once everything is in.
function leave(c: Campaign, until: (c: Campaign) => boolean, seen: GameEvent[] = []): void {
  for (let g = 0; g < 400 && c.phase === 'season' && !until(c); g++) {
    if (S.seasonDone(c)) break
    seen.push(...ok(c, { t: 'day' }).events)
  }
}

describe('the routine', () => {
  it('starts on for the routine work and off for the calls, and is listed in order', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    expect(S.routineInfo(c)).toEqual(S.ROUTINE_KINDS.map(kind => ({ kind, auto: S.ROUTINE_DEFAULT[kind] })))
    expect(S.routineInfo(c).filter(r => !r.auto).map(r => r.kind)).toEqual(['spray', 'water', 'kill'])
  })

  it('a farm whose player never gives an order plants (after waiting three days for the word), hills, walks, digs and hauls its planned fields; the calls are left as needs', () => {
    // 2001, seed 3: a season the untended farm brings in whole (in 1990, seed 7 it loses one field to the freeze-up).
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    const seen: GameEvent[] = []
    const callsAsked = new Set<string>()
    for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
      for (const n of S.fieldNeeds(world, c)) {
        if (!n.need || n.need.act === 'sell' || n.need.act === 'close' || n.need.act === 'wait') continue
        // (the year's first planting is asked of the player for three days, then the crew starts by itself)
        expect(['plant', 'spray', 'water', 'kill']).toContain(n.need.act)
        if (n.need.act === 'plant') expect(S.plantWordGiven(c.season!)).toBe(false)
        callsAsked.add(n.need.act)
      }
      seen.push(...ok(c, { t: 'day' }).events)
    }
    const potato = [0, 1, 2, 3, 4, 5].filter(i => c.plans[i].crop === 'potato')
    for (const type of ['planted', 'hilled', 'scout', 'dug', 'weighed']) {
      for (const i of potato) expect(seen.some(e => e.type === type && e.field === i), `${type} ${i}`).toBe(true)
    }
    expect(seen.some(e => e.type === 'sprayed' || e.type === 'watered')).toBe(false)
    // The kill stays a call, but vines left up past the date the crew gave come off rather than be dug green.
    for (const e of seen.filter(x => x.type === 'killed')) expect(c.season!.fields[e.field].killAsked!).toBeLessThan(e.day)
    expect(callsAsked.size).toBeGreaterThan(0)
    expect(S.seasonDone(c)).toBe(true)
  })

  it('switching a kind to ask me stops it, and back to by itself starts it', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(c, { t: 'routine', kind: 'plant', auto: false })
    expect(S.apply(world, c, { t: 'routine', kind: 'plant', auto: false }).ok).toBe(false)
    expect(S.apply(world, c, { t: 'routine', kind: 'fell', auto: true }).ok).toBe(false)
    ok(c, { t: 'begin' })
    leave(c, x => x.season!.day >= S.dayIndex(1990, 5, 15))
    expect(S.fieldInfo(c, 0).status).toBe('idle')
    expect(c.season!.jobs.some(j => j.kind === 'plant')).toBe(false)
    // Planting is now what the fields ask of the player.
    expect(S.fieldNeeds(world, c).some(n => n.need?.act === 'plant')).toBe(true)
    ok(c, { t: 'routine', kind: 'plant', auto: true })
    leave(c, x => x.season!.jobs.some(j => j.kind === 'plant' && j.by === 'routine'))
    expect(c.season!.jobs.some(j => j.kind === 'plant' && j.by === 'routine') || S.fieldInfo(c, 0).status !== 'idle').toBe(true)
    expect(S.fieldNeeds(world, c).some(n => n.need?.act === 'plant')).toBe(false)
  })

  it('jobs carry who put them on the list', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(c, { t: 'routine', kind: 'plant', auto: false })
    ok(c, { t: 'begin' })
    leave(c, x => x.season!.day >= S.dayIndex(1990, 4, 20))
    ok(c, { t: 'job', kind: 'plant', field: 0 })
    leave(c, x => x.season!.jobs.some(j => j.by === 'routine'))
    expect(c.season!.jobs.find(j => j.kind === 'plant' && j.field === 0)?.by ?? 'you').toBe('you')
    expect(c.season!.jobs.filter(j => j.kind !== 'plant').every(j => j.by === 'routine')).toBe(true)
    expect(c.season!.jobs.some(j => j.by === 'routine')).toBe(true)
  })

  it('a foreman\'s block gets the calls too, and the rest of the farm does not', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'hire', kind: 'hand' })
    ok(c, { t: 'begin' })
    ok(c, { t: 'foreman', unit: c.crew[1].id, block: 'home' })
    const seen: GameEvent[] = []
    leave(c, x => x.season!.jobs.some(j => j.by === 'foreman' && (j.kind === 'spray' || j.kind === 'kill')), seen)
    expect(c.season!.jobs.some(j => j.by === 'foreman' && (j.kind === 'spray' || j.kind === 'kill'))).toBe(true)
    expect(c.season!.jobs.filter(j => j.field >= 0 && j.field < S.HOME_FIELDS).every(j => j.by === 'foreman')).toBe(true)
  })

  it('a never priority is respected: nobody willing, nothing done, and the field says why', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(c, { t: 'priority', unit: 0, work: 'field', level: 0 })
    ok(c, { t: 'begin' })
    const seen: GameEvent[] = []
    leave(c, x => S.fieldNeeds(world, x).some(n => n.need?.act === 'scout'), seen)
    expect(seen.some(e => e.type === 'scout')).toBe(false)
    expect(c.season!.jobs.some(j => j.kind === 'scout')).toBe(false)
    const need = S.fieldNeeds(world, c).find(n => n.need?.act === 'scout')!.need!
    expect(need.why).toMatch(/Nobody on the farm/)
  })

  it('an old save opens with the routine on, and says so once', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(c, { t: 'begin' })
    ok(c, { t: 'day' })
    const old = c as unknown as Record<string, unknown>
    delete old.routine
    delete old.heard
    for (const j of c.season!.jobs) delete (j as unknown as Record<string, unknown>).by
    const r = ok(c, { t: 'day' })
    expect(r.events.filter(e => e.type === 'routine').length).toBe(1)
    expect(S.routineInfo(c)).toEqual(S.ROUTINE_KINDS.map(kind => ({ kind, auto: S.ROUTINE_DEFAULT[kind] })))
    expect(c.heard).toEqual([])
    expect(c.season!.jobs.every(j => j.by !== undefined)).toBe(true)
    expect(ok(c, { t: 'day' }).events.some(e => e.type === 'routine')).toBe(false)
  })
})

describe('telegrams', () => {
  it('a neighbour\'s refused offer for someone is not made again that year, and one stranger asks for work a season', () => {
    const c = S.createCampaign(world, { seed: 13, startYear: 1995 })
    ok(c, { t: 'hire', kind: 'hand' })
    ok(c, { t: 'hire', kind: 'operator' })
    ok(c, { t: 'begin' })
    const seen: GameEvent[] = []
    leave(c, () => false, seen)
    const opened = seen.filter(e => e.type === 'incident')
    const asked = opened.filter(e => e.data!.kind === 'poach').map(e => /offered (.+?) \$/.exec(e.text)![1])
    expect(asked.length).toBeGreaterThan(0)
    expect(new Set(asked).size).toBe(asked.length)
    expect(opened.filter(e => e.data!.kind === 'applicant').length).toBeLessThanOrEqual(1)
    // The next spring the slate is clean but for the neighbour's offers, made once while a person works here.
    const d = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(d, { t: 'hire', kind: 'hand' })
    ok(d, { t: 'begin' })
    leave(d, () => false)
    expect(d.heard.length).toBeGreaterThan(0)
    while (d.phase !== 'ledger') ok(d, d.phase === 'season' ? { t: 'endSeason' } : { t: 'month' })
    d.outcome = ''
    ok(d, { t: 'next' })
    expect(d.phase).toBe('plan')
    expect(d.heard.length).toBeGreaterThan(0)
    expect(d.heard.filter(k => !k.startsWith('poach:'))).toEqual([])
  })
})

describe('barrels and frost', () => {
  it('ahead of a frost the crop in barrels is hauled first, and the evening before says so, once', () => {
    // 1990, seed 7: dig on a frost-prone day with the haul behind a pile of other work.
    const base = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(base, { t: 'begin' })
    leave(base, x => x.season!.fields.some(f => f.inField >= 0.5))
    let found = false, before: S.GameEvent[] = []
    for (let g = 0; g < 120 && base.phase === 'season' && !S.seasonDone(base); g++) {
      const s = base.season!
      const cold = s.fields.findIndex((f, i) => f.inField >= 0.5 && !f.weighed && S.frostOnBarrels(world, base, i))
      const haul = s.jobs.find(j => j.kind === 'haul' && j.field === cold)
      if (cold >= 0 && haul && S.workday(base, s) && S.jobWaits(world, base)[haul.id] === '' && s.frostHaul !== s.day - 1) {
        // The warning came with the day before, dated this one: one stop, while there is a day to act.
        expect(before.filter(e => e.type === 'frostBarrels').map(e => e.day)).toEqual([s.day])
        const c = structuredClone(base)
        // Put other work ahead of the haul.
        for (const j of c.season!.jobs.filter(x => x.kind !== 'haul')) ok(c, { t: 'bump', id: j.id })
        expect(c.season!.jobs[0].kind).not.toBe('haul')
        // The cold day itself does not stop the farm again.
        const r = ok(c, { t: 'day' })
        expect(r.events.some(e => e.type === 'frostBarrels')).toBe(false)
        expect(c.season!.worked.find(w => w.unit === 0)?.kind).toBe('haul')
        found = true
        break
      }
      before = ok(base, { t: 'day' }).events
    }
    expect(found).toBe(true)
  })

  it('a Sunday off is worked when a frost is coming on crop still in barrels', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(c, { t: 'begin' })
    expect(c.sundaysOff).toBe(true)
    let sunday = false
    for (let g = 0; g < 14 && !sunday; g++) {
      if (!S.workday(c, c.season!)) sunday = true
      else ok(c, { t: 'day' })
    }
    expect(sunday).toBe(true)
    c.season!.frostHaul = c.season!.day
    expect(S.workday(c, c.season!)).toBe(true)
  })
})

describe('the word to plant (round seven)', () => {
  const potato = (c: Campaign) => [...Array(S.FIELD_COUNT).keys()].filter(i => c.plans[i]?.crop === 'potato' && c.fields[i].tenure !== 'none')
  const planting = (c: Campaign) => c.season!.jobs.filter(j => j.kind === 'plant')
  const planted = (c: Campaign) => potato(c).filter(i => c.season!.fields[i].plantDay >= 0)
  // Days pass until the crew stands ready: the first evening it says so.
  function untilAsked(c: Campaign): GameEvent {
    for (let g = 0; g < 120; g++) {
      const ask = ok(c, { t: 'day' }).events.find(e => e.type === 'plantAsk')
      if (ask) return ask
      expect(planting(c).length, 'no planting on the list before the crew asks').toBe(0)
    }
    throw new Error('the crew never stood ready')
  }

  it('the crew stands ready and says so, and no planting starts within three days without the word', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    const ask = untilAsked(c)
    expect(ask.text).toBe('The soil is ready and your crew is waiting for you. Order Plant on any potato field, or they\'ll start on their own in 3 days.')
    const asked = c.season!.plantAsk!
    // Every planned potato field that is fit carries the need, as the player's to give.
    const needs = S.fieldNeeds(world, c)
    const fit = potato(c).filter(i => needs[i].need?.act === 'plant')
    expect(fit.length).toBeGreaterThan(0)
    for (const i of potato(c)) expect(needs[i].need?.act === 'plant' || needs[i].hold?.act === 'wait', S.FIELD_NAMES[i]).toBe(true)
    while (c.season!.day - asked < S.PLANT_WORD_DAYS) {
      expect(planting(c)).toEqual([])
      expect(planted(c)).toEqual([])
      expect(S.plantWordGiven(c.season!)).toBe(false)
      ok(c, { t: 'day' })
    }
  })

  it('one press plants there and the crew carries on through the other planned fields by itself, and says exactly that', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    untilAsked(c)
    const first = S.fieldNeeds(world, c).findIndex(n => n.need?.act === 'plant')
    const r = ok(c, { t: 'job', kind: 'plant', field: first })
    const others = potato(c).length - 1
    expect(r.events.map(e => [e.type, e.text])).toEqual([['plantWord', `Planting has started. Your crew will plant the other ${others} fields too.`]])
    expect(c.season!.plantWordBy).toBe('you')
    expect(planting(c).map(j => [j.field, j.by])).toEqual([[first, 'you']])
    // No other order from the player: every planned field is planted, the pressed one first.
    const seen: GameEvent[] = []
    leave(c, x => planted(x).length === potato(x).length, seen)
    expect(planted(c)).toEqual(potato(c))
    expect(seen.filter(e => e.type === 'planted')[0].field).toBe(first)
    expect(seen.some(e => e.type === 'plantWord' || e.type === 'plantAsk')).toBe(false)
    // The need is gone from every field, and a second order says nothing more.
    expect(S.fieldNeeds(world, c).some(n => n.need?.act === 'plant')).toBe(false)
  })

  it('with no word in three days the crew starts by itself and says so, and a farm that never presses still brings in a crop', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    untilAsked(c)
    const asked = c.season!.plantAsk!
    const seen: GameEvent[] = []
    leave(c, x => planting(x).length > 0 || planted(x).length > 0, seen)
    const own = seen.filter(e => e.type === 'plantWord')
    expect(own.map(e => e.text)).toEqual(['Your crew waited 3 days and has started planting on its own.'])
    // (three days, or four where the third is a Sunday off)
    expect(own[0].day - asked).toBeGreaterThanOrEqual(S.PLANT_WORD_DAYS)
    expect(own[0].day - asked).toBeLessThanOrEqual(S.PLANT_WORD_DAYS + 1)
    expect(c.season!.plantWordBy).toBe('crew')
    expect(planting(c).every(j => j.by === 'routine')).toBe(true)
    leave(c, () => false)
    expect(S.seasonDone(c)).toBe(true)
    for (const i of potato(c)) expect(c.season!.fields[i].weighed, S.FIELD_NAMES[i]).toBe(true)
    // It holds in every year: the next spring's planting waits again.
    ok(c, { t: 'endSeason' })
    for (let m = 0; m < 12 && c.phase === 'cellar'; m++) ok(c, { t: 'month' })
    ok(c, { t: 'next' })
    ok(c, { t: 'begin' })
    expect(S.plantWordGiven(c.season!)).toBe(false)
    expect(untilAsked(c).type).toBe('plantAsk')
  })

  it('a save from before the rule, taken in the middle of planting, carries on with no word asked', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    untilAsked(c)
    ok(c, { t: 'job', kind: 'plant', field: S.fieldNeeds(world, c).findIndex(n => n.need?.act === 'plant') })
    leave(c, x => planted(x).length >= 1)
    // As an old save has it: the fields planted and the orders on the list, and none of the rule's own marks.
    const old = structuredClone(c)
    delete old.season!.plantAsk; delete old.season!.plantWord; delete old.season!.plantWordBy
    for (const j of old.season!.jobs) if (j.kind === 'plant') j.by = 'routine'
    expect(S.plantWordGiven(old.season!)).toBe(true)
    const seen: GameEvent[] = []
    leave(old, x => planted(x).length === potato(x).length, seen)
    expect(planted(old)).toEqual(potato(old))
    expect(seen.some(e => e.type === 'plantAsk' || e.type === 'plantWord')).toBe(false)
  })

  it('planting switched to "ask me" is the player\'s on every field as before, with no word and no start by the crew', () => {
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'routine', kind: 'plant', auto: false })
    ok(c, { t: 'begin' })
    const seen: GameEvent[] = []
    leave(c, x => x.season!.day >= S.dayIndex(2001, 6, 10), seen)
    expect(seen.some(e => e.type === 'plantAsk' || e.type === 'plantWord')).toBe(false)
    expect(planted(c)).toEqual([])
  })
})
