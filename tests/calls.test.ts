// The season's calls as the player meets them: spraying (each order one pass, the routine's spraying never asked for
// again), the vine kill counted as asked when the coach asked for it, and why.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, GameEvent, World } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const base = loadWorld()

function ok(w: World, c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(w, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

// A first-year farm of its own: the farmer alone, weather made from the seed.
function farm(seed: number): { w: World; c: Campaign } {
  const w = S.climateWorld(base, seed)
  const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
  ok(w, c, { t: 'begin' })
  return { w, c }
}

function playing(c: Campaign): boolean {
  return c.phase === 'season' && !S.seasonDone(c)
}

describe('spraying', () => {
  it('the lone farmer on a first-year farm does every kind of work, and takes every spray ordered', () => {
    for (const seed of [1, 2, 3]) {
      const { w, c } = farm(seed)
      expect(c.crew.length).toBe(1)
      for (const k of S.JOBS) expect(S.unitBlock(c, k, c.crew[0].id), k).toBe('')
      let ordered = 0, sprayed = 0, dropped = 0
      for (let g = 0; g < 300 && playing(c); g++) {
        for (const p of S.pressing(w, c)) if (p.kind === 'spray' && p.job < 0 && S.apply(w, c, p.fix!).ok) ordered++
        for (const o of S.jobOutlook(w, c)) expect(o.why).not.toMatch(/Nobody on the farm/)
        const ev = ok(w, c, { t: 'day' }).events
        sprayed += ev.filter(e => e.type === 'sprayed').length
        dropped += ev.filter(e => e.type === 'dropped' && e.data?.kind === 'spray').length
      }
      expect(ordered).toBeGreaterThan(3)
      expect(sprayed + dropped + c.season!.jobs.filter(j => j.kind === 'spray').length).toBe(ordered)
      expect(dropped).toBeLessThanOrEqual(1)
    }
  })

  it('a spray asked for again says when the last pass was and that each order is one pass; the year counts the passes', () => {
    const { w, c } = farm(1)
    const seen: GameEvent[] = []
    let again: S.Pressing | undefined
    for (let g = 0; g < 300 && playing(c); g++) {
      for (const p of S.pressing(w, c)) {
        if (p.kind !== 'spray' || p.job >= 0) continue
        const f = c.season!.fields[p.field]
        if (f.lastSpray >= 0) again ??= p
        else expect(p.inWay).toMatch(/Not sprayed yet this season/)
        S.apply(w, c, p.fix!)
      }
      seen.push(...ok(w, c, { t: 'day' }).events)
    }
    expect(again, 'a spray asked for a second time').toBeDefined()
    expect(again!.inWay).toMatch(/^Sprayed on [A-Z][a-z]+ \d+, and that has worn thin\. Each order is one pass/)
    const passes = seen.filter(e => e.type === 'sprayed').length
    expect(c.season!.fields.reduce((n, f) => n + (f.sprays ?? 0), 0)).toBe(passes)
    if (c.phase === 'season') ok(w, c, { t: 'endSeason' })
    while (c.phase === 'cellar') ok(w, c, { t: 'month' })
    expect(c.history[0].sprays).toBe(passes)
  })

  it('with spraying left to the routine, the routine orders it and it is never pressed on the player', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { w, c } = farm(seed)
      ok(w, c, { t: 'routine', kind: 'spray', auto: true })
      let byRoutine = 0
      for (let g = 0; g < 300 && playing(c); g++) {
        const asked = S.pressing(w, c).filter(p => p.kind === 'spray' && p.job < 0)
        expect(asked, `${seed} ${S.formatDay(c.year, c.season!.day)}`).toEqual([])
        ok(w, c, { t: 'day' })
        byRoutine += c.season!.jobs.filter(j => j.kind === 'spray' && j.by === 'routine').length
      }
      expect(byRoutine).toBeGreaterThan(0)
    }
  })

  it('the coach is not pressed for a spray on vines it asks to have killed', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { w, c } = farm(seed)
      for (let g = 0; g < 300 && playing(c); g++) {
        const kills = new Set(S.advise(w, c).filter(a => a.act === 'kill').map(a => a.field))
        for (const p of S.pressing(w, c)) if (p.kind === 'spray' && p.job < 0) expect(kills.has(p.field)).toBe(false)
        ok(w, c, { t: 'day' })
      }
    }
  })
})

describe('the vine kill', () => {
  // The player kills the vines the evening the coach first asks, as the guide's stamp has them do.
  function killWhenAsked(w: World, c: Campaign, set?: (c: Campaign, field: number) => void): number {
    for (let g = 0; g < 300 && playing(c); g++) {
      const s = c.season!
      if (set) for (let i = 0; i < s.fields.length; i++) if (s.fields[i].tiDay >= 0 && s.fields[i].status === 'growing') set(c, i)
      const need = S.fieldNeeds(w, c).map(n => n.need).find(n => n?.act === 'kill')
      if (need) {
        ok(w, c, { t: 'job', kind: 'kill', field: need.field })
        while (playing(c) && c.season!.fields[need.field].killDay < 0) ok(w, c, { t: 'day' })
        return need.field
      }
      ok(w, c, { t: 'day' })
    }
    return -1
  }

  it('a kill ordered the day the coach asks for it counts as asked, not as days before it was due', () => {
    let early = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const { w, c } = farm(seed)
      const i = killWhenAsked(w, c)
      if (i < 0) continue
      const k = S.killTiming(c, i)
      expect(k.killed).toBeGreaterThanOrEqual(0)
      expect(k.asked, `seed ${seed}`).toBeGreaterThanOrEqual(0)
      expect(k.early).toBe(0)
      expect(['blight', 'frost', 'made', 'late']).toContain(k.why)
      if (k.killed < S.dayIndex(c.year, 8, 8)) early++
    }
    expect(early).toBeGreaterThan(0)
  })

  it('a kill the coach asked for because blight was winning says so', () => {
    const { w, c } = farm(2)
    const i = killWhenAsked(w, c, (x, f) => { x.season!.fields[f].knownSev = 0.3 })
    expect(i).toBeGreaterThanOrEqual(0)
    const k = S.killTiming(c, i)
    expect(k).toMatchObject({ early: 0, why: 'blight' })
    expect(k.asked).toBeGreaterThanOrEqual(0)
  })

  it('a kill nobody asked for still counts its days early', () => {
    const { w, c } = farm(1)
    for (let g = 0; g < 300 && playing(c) && !c.season!.fields.some(f => f.tiDay >= 0 && f.status === 'growing'); g++) ok(w, c, { t: 'day' })
    const i = c.season!.fields.findIndex(f => f.tiDay >= 0 && f.status === 'growing')
    ok(w, c, { t: 'job', kind: 'kill', field: i })
    while (playing(c) && c.season!.fields[i].killDay < 0) ok(w, c, { t: 'day' })
    const k = S.killTiming(c, i)
    expect(k.asked).toBe(-1)
    expect(k.why).toBe('')
    expect(k.early).toBeGreaterThan(0)
  })
})
