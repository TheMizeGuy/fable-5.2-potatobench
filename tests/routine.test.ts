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

  it('a farm whose player never gives an order plants, hills, walks, digs and hauls its planned fields; the calls are left as needs', () => {
    // 2001, seed 3: a season the untended farm brings in whole (in 1990, seed 7 it loses one field to the freeze-up).
    const c = S.createCampaign(world, { seed: 3, startYear: 2001 })
    ok(c, { t: 'begin' })
    const seen: GameEvent[] = []
    const callsAsked = new Set<string>()
    for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
      for (const n of S.fieldNeeds(world, c)) {
        if (!n.need || n.need.act === 'sell' || n.need.act === 'close' || n.need.act === 'wait') continue
        expect(['spray', 'water', 'kill']).toContain(n.need.act)
        callsAsked.add(n.need.act)
      }
      seen.push(...ok(c, { t: 'day' }).events)
    }
    const potato = [0, 1, 2, 3, 4, 5].filter(i => c.plans[i].crop === 'potato')
    for (const type of ['planted', 'hilled', 'scout', 'dug', 'weighed']) {
      for (const i of potato) expect(seen.some(e => e.type === type && e.field === i), `${type} ${i}`).toBe(true)
    }
    expect(seen.some(e => e.type === 'sprayed' || e.type === 'watered' || e.type === 'killed')).toBe(false)
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
    const c = S.createCampaign(world, { seed: 2, startYear: 1995 })
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
    // The next spring the slate is clean.
    const d = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(d, { t: 'hire', kind: 'hand' })
    ok(d, { t: 'begin' })
    leave(d, () => false)
    expect(d.heard.length).toBeGreaterThan(0)
    while (d.phase !== 'ledger') ok(d, d.phase === 'season' ? { t: 'endSeason' } : { t: 'month' })
    d.outcome = ''
    ok(d, { t: 'next' })
    expect(d.phase).toBe('plan')
    expect(d.heard).toEqual([])
  })
})

describe('barrels and frost', () => {
  it('ahead of a frost the crop in barrels is hauled first, and the morning says so', () => {
    // 1990, seed 7: dig on a frost-prone day with the haul behind a pile of other work.
    const base = S.createCampaign(world, { seed: 7, startYear: 1990 })
    ok(base, { t: 'begin' })
    leave(base, x => x.season!.fields.some(f => f.inField >= 0.5))
    let found = false
    for (let g = 0; g < 120 && base.phase === 'season' && !S.seasonDone(base); g++) {
      const s = base.season!
      const cold = s.fields.findIndex((f, i) => f.inField >= 0.5 && !f.weighed && S.frostOnBarrels(world, base, i))
      const haul = s.jobs.find(j => j.kind === 'haul' && j.field === cold)
      if (cold >= 0 && haul && S.workday(base, s) && S.jobWaits(world, base)[haul.id] === '') {
        const c = structuredClone(base)
        // Put other work ahead of the haul.
        for (const j of c.season!.jobs.filter(x => x.kind !== 'haul')) ok(c, { t: 'bump', id: j.id })
        expect(c.season!.jobs[0].kind).not.toBe('haul')
        // The first cold morning of a spell says so; the next does not stop the farm again.
        c.season!.frostHaul = undefined
        const again = structuredClone(c)
        again.season!.frostHaul = again.season!.day - 1
        const r = ok(c, { t: 'day' })
        expect(r.events.some(e => e.type === 'frostBarrels')).toBe(true)
        expect(c.season!.worked.find(w => w.unit === 0)?.kind).toBe('haul')
        expect(ok(again, { t: 'day' }).events.some(e => e.type === 'frostBarrels')).toBe(false)
        expect(again.season!.worked.find(w => w.unit === 0)?.kind).toBe('haul')
        found = true
        break
      }
      ok(base, { t: 'day' })
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
