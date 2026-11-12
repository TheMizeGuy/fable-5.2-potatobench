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

function phaseOf(c: Campaign): string {
  return c.phase
}

function playing(c: Campaign): boolean {
  return c.phase === 'season' && !S.seasonDone(c)
}

describe('planting', () => {
  it('the routine plants only on soil the planting rule passes: what the card and the slip read', () => {
    let planted = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { w, c } = farm(seed)
      for (let g = 0; g < 120 && playing(c); g++) {
        const s = c.season!
        const soil = S.plantReady(w, c, 0)
        const ev = ok(w, c, { t: 'day' }).events.filter(e => e.type === 'planted')
        planted += ev.length
        for (const e of ev) expect(soil.soilT, `seed ${seed} ${S.formatDay(c.year, s.day - 1)} ${S.FIELD_NAMES[e.field]}`).toBeGreaterThanOrEqual(soil.need)
      }
    }
    expect(planted).toBeGreaterThan(20)
  })
})

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

describe('spraying this season', () => {
  it('not this year: nothing asks for a spray, the routine orders none, the player may still order one, and next year asks again', () => {
    const { w, c } = farm(1)
    expect(S.sprayWayNow(c)).toBeNull()
    ok(w, c, { t: 'routine', kind: 'spray', auto: true })
    expect(S.sprayWayNow(c)).toBe('auto')
    for (let g = 0; g < 300 && playing(c) && !c.season!.jobs.some(j => j.kind === 'spray'); g++) ok(w, c, { t: 'day' })
    expect(c.season!.jobs.some(j => j.kind === 'spray' && j.by === 'routine')).toBe(true)
    ok(w, c, { t: 'sprayWay', way: 'none' })
    expect(S.apply(w, c, { t: 'sprayWay', way: 'none' }).ok).toBe(false)
    expect([S.sprayWayNow(c), c.routine.spray]).toEqual(['none', false])
    expect(c.season!.jobs.some(j => j.kind === 'spray')).toBe(false)
    // Who does what's "ask me" takes it back from not this year.
    const ask = structuredClone(c)
    ok(w, ask, { t: 'routine', kind: 'spray', auto: false })
    expect(S.sprayWayNow(ask)).toBe('ask')
    let mine = false
    for (let g = 0; g < 300 && playing(c); g++) {
      expect(S.advise(w, c).some(a => a.act === 'spray')).toBe(false)
      expect(S.fieldNeeds(w, c).some(n => n.need?.act === 'spray')).toBe(false)
      expect(S.pressing(w, c).some(p => p.kind === 'spray')).toBe(false)
      expect(c.season!.jobs.some(j => j.kind === 'spray' && j.by !== 'you')).toBe(false)
      const f = c.season!.fields.findIndex(x => x.status === 'growing' && x.emergeDay >= 0 && x.deadDay < 0)
      if (!mine && f >= 0) { ok(w, c, { t: 'job', kind: 'spray', field: f }); mine = true }
      ok(w, c, { t: 'day' })
    }
    expect(mine).toBe(true)
    if (c.phase === 'season') ok(w, c, { t: 'endSeason' })
    while (c.phase === 'cellar') ok(w, c, { t: 'month' })
    ok(w, c, { t: 'next' })
    expect(S.sprayWayNow(c)).toBeNull()
  })

  it('ask me each time leaves the stamps and the orders to the player', () => {
    const { w, c } = farm(2)
    ok(w, c, { t: 'sprayWay', way: 'ask' })
    expect([S.sprayWayNow(c), c.routine.spray]).toEqual(['ask', false])
    let asked = false
    for (let g = 0; g < 300 && playing(c); g++) {
      asked ||= S.fieldNeeds(w, c).some(n => n.need?.act === 'spray')
      expect(c.season!.jobs.some(j => j.kind === 'spray')).toBe(false)
      ok(w, c, { t: 'day' })
    }
    expect(asked).toBe(true)
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

describe('the dig and the kill left to the crew', () => {
  it('the routine never digs green: the kill is pressed with its date, the crew kills on that date, and the dig waits for the skins', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { w, c } = farm(seed)
      const said = new Map<number, string>()
      for (let g = 0; g < 300 && playing(c); g++) {
        for (const p of S.pressing(w, c)) if (p.kind === 'kill' && p.job < 0) said.set(p.field, p.inWay)
        ok(w, c, { t: 'day' })
      }
      const s = c.season!
      const greenDig = S.dayIndex(c.year, S.DIG_GREEN.month, S.DIG_GREEN.dom)
      s.fields.forEach((f, i) => {
        if (f.plantDay < 0 || f.dugDay < 0) return
        const at = `seed ${seed} ${S.FIELD_NAMES[i]}`
        expect(f.deadDay, at).toBeGreaterThanOrEqual(0)
        expect(f.dugDay - f.deadDay >= S.SKIN_DAYS || f.dugDay >= greenDig, at).toBe(true)
        expect(c.lots.find(l => l.field === i)!.skin, `${at}: skins set at the dig`).toBe(1)
        if (f.killDay < 0) return
        const m = /^The crew kills the vines on ([A-Z][a-z]+ \d+) unless you keep them up/.exec(said.get(i) ?? '')
        expect(m, `${at}: ${said.get(i)}`).not.toBeNull()
        // Ordered that morning, and done as soon as the weather and the work ahead of it let the crew.
        const on = Array.from({ length: 5 }, (_, k) => S.formatDay(c.year, f.killDay - k))
        expect(on, at).toContain(m![1])
      })
    }
  })

  it('a vine kill taken off the list keeps the vines up: the crew does not kill them by itself', () => {
    const { w, c } = farm(1)
    let field = -1
    for (let g = 0; g < 300 && playing(c) && field < 0; g++) {
      ok(w, c, { t: 'day' })
      const j = c.season!.jobs.find(x => x.kind === 'kill' && x.by === 'routine')
      if (j) { field = j.field; ok(w, c, { t: 'cancel', id: j.id }) }
    }
    expect(field).toBeGreaterThanOrEqual(0)
    for (let g = 0; g < 300 && playing(c) && c.season!.fields[field].status === 'growing'; g++) {
      expect(S.pressing(w, c).some(p => p.kind === 'kill' && p.field === field)).toBe(false)
      ok(w, c, { t: 'day' })
      expect(c.season!.jobs.some(x => x.kind === 'kill' && x.field === field)).toBe(false)
    }
    expect(c.season!.fields[field].killDay).toBe(-1)
  })

  it('keep the vines up, said before the crew kills them: nothing is killed, nothing pressed, and taking it back restores the date', () => {
    const { w, c } = farm(1)
    let field = -1
    for (let g = 0; g < 300 && playing(c) && field < 0; g++) {
      field = S.pressing(w, c).find(p => p.kind === 'kill')?.field ?? -1
      if (field < 0) ok(w, c, { t: 'day' })
    }
    expect(field).toBeGreaterThanOrEqual(0)
    ok(w, c, { t: 'keepVines', field, keep: true })
    expect(S.apply(w, c, { t: 'keepVines', field, keep: true }).ok).toBe(false)
    const back = structuredClone(c)
    for (let g = 0; g < 300 && playing(c) && c.season!.fields[field].status === 'growing'; g++) {
      expect(S.pressing(w, c).some(p => p.kind === 'kill' && p.field === field)).toBe(false)
      ok(w, c, { t: 'day' })
      expect(c.season!.jobs.some(x => x.kind === 'kill' && x.field === field)).toBe(false)
    }
    expect(c.season!.fields[field].killDay).toBe(-1)
    ok(w, back, { t: 'keepVines', field, keep: false })
    expect(S.pressing(w, back).find(p => p.kind === 'kill' && p.field === field)?.inWay).toMatch(/^The crew kills the vines on/)
  })

  it('an ask that has lapsed starts no clock: the crew kills nothing the coach no longer asks for', () => {
    const { w, c } = farm(1)
    for (let g = 0; g < 300 && playing(c) && !c.season!.fields.some(f => f.tiDay >= 0 && f.status === 'growing'); g++) ok(w, c, { t: 'day' })
    const s = c.season!
    const i = s.fields.findIndex(f => f.tiDay >= 0 && f.status === 'growing')
    // A frost the coach once killed for, a month ago, that never came.
    s.fields[i].killAsked = s.day - 30
    s.fields[i].killWhy = 'frost'
    for (let g = 0; g < 10; g++) {
      if (S.advise(w, c).some(a => a.act === 'kill' && a.field === i)) break
      expect(S.pressing(w, c).some(p => p.kind === 'kill' && p.field === i)).toBe(false)
      ok(w, c, { t: 'day' })
      expect(s.jobs.some(j => j.kind === 'kill' && j.field === i)).toBe(false)
    }
  })

  it('kill dates come after the other pressing work, so the one row shown is what cannot wait today', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { w, c } = farm(seed)
      for (let g = 0; g < 300 && playing(c); g++) {
        const kinds = S.pressing(w, c).map(p => p.kind)
        const k = kinds.indexOf('kill')
        if (k >= 0) expect(kinds.slice(k).every(x => x === 'kill')).toBe(true)
        ok(w, c, { t: 'day' })
      }
    }
  })
})

describe('telegrams', () => {
  it('a week between telegrams but for a breakdown, and a neighbour asks after each person only once', () => {
    let poaches = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const w = S.climateWorld(base, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      c.cash = 200000
      ok(w, c, { t: 'hire', kind: 'hand' })
      ok(w, c, { t: 'hire', kind: 'hand' })
      const asked = new Set<number>()
      for (let y = 0; y < 3 && c.phase === 'plan'; y++) {
        ok(w, c, { t: 'begin' })
        let last = -99
        for (let g = 0; g < 300 && playing(c); g++) {
          for (const e of ok(w, c, { t: 'day' }).events) {
            if (e.type !== 'incident') continue
            const inc = c.incidents.find(i => i.id === e.data?.incident)!
            if (inc.kind === 'breakdown') continue
            expect(e.day - last, `seed ${seed} ${c.year} ${inc.kind}`).toBeGreaterThanOrEqual(S.TELEGRAM_GAP)
            last = e.day
            if (inc.kind === 'poach') {
              poaches++
              expect(asked.has(inc.unit!), `seed ${seed} ${c.year}: asked after ${inc.unit} again`).toBe(false)
              asked.add(inc.unit!)
              // Kept on at the neighbour's wage, so they are there to be asked after again.
              ok(w, c, { t: 'answer', incident: inc.id, choice: 'match' })
            }
          }
        }
        if (phaseOf(c) === 'season') ok(w, c, { t: 'endSeason' })
        while (phaseOf(c) === 'cellar') ok(w, c, { t: 'month' })
        if (phaseOf(c) === 'ledger') ok(w, c, { t: 'next' })
      }
    }
    expect(poaches).toBeGreaterThan(2)
  })
})

describe('the year-end figure through the harvest', () => {
  it('neither the dig nor a sale moves what the farm would have: the crop lifted counts until it is weighed', () => {
    for (const seed of [1, 2, 3]) {
      const { w, c } = farm(seed)
      let prev = S.moneyNow(w, c).after, lifting = 0
      for (let g = 0; g < 300 && playing(c); g++) {
        ok(w, c, { t: 'day' })
        const now = S.moneyNow(w, c).after
        const at = `seed ${seed} ${S.formatDay(c.year, c.season!.day)}`
        // A day of digging and hauling: the estimate of what is still in the ground may move a little, no more.
        if (c.season!.fields.some(f => f.status === 'digging' || (f.status === 'dug' && !f.weighed))) {
          lifting++
          expect(Math.abs(now - prev), at).toBeLessThan(3000)
        }
        prev = now
        for (const l of S.openLots(c)) {
          if (!c.season!.fields[l.field].weighed) continue
          ok(w, c, { t: 'sell', lot: l.id, frac: 1 })
          const sold = S.moneyNow(w, c).after
          expect(Math.abs(sold - prev), `${at}: sold`).toBeLessThan(1)
          prev = sold
        }
      }
      expect(lifting).toBeGreaterThan(5)
    }
  })
})

describe('the kill day, ahead and after', () => {
  it('a kill a day or three before it was due counts as asked; more is early by its days', () => {
    const { w, c } = farm(1)
    for (let g = 0; g < 300 && playing(c) && !c.season!.fields.some(f => f.tiDay >= 0 && f.status === 'growing'); g++) ok(w, c, { t: 'day' })
    const i = c.season!.fields.findIndex(f => f.tiDay >= 0 && f.status === 'growing')
    const f = c.season!.fields[i]
    const late = S.dayIndex(c.year, S.KILL_BY.month, S.KILL_BY.dom)
    f.matureDay = -1
    delete f.killAsked
    f.killDay = late - 1
    expect(S.killTiming(c, i)).toEqual({ asked: late, killed: late - 1, early: 0, why: 'late' })
    f.killDay = late - S.KILL_GRACE
    expect(S.killTiming(c, i).early).toBe(0)
    f.killDay = late - S.KILL_GRACE - 1
    expect(S.killTiming(c, i)).toEqual({ asked: -1, killed: late - S.KILL_GRACE - 1, early: S.KILL_GRACE + 1, why: '' })
    // Asked for on a day, killed two days before it: as asked, with the coach's reason.
    f.killAsked = late - 10
    f.killWhy = 'made'
    f.killDay = late - 12
    expect(S.killTiming(c, i)).toEqual({ asked: late - 10, killed: late - 12, early: 0, why: 'made' })
  })

  it('each field says ahead of time about when the coach will ask for the kill, and it comes about then', () => {
    let near = 0, compared = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { w, c } = farm(seed)
      const ahead = new Map<number, number>()
      for (let g = 0; g < 300 && playing(c); g++) {
        const s = c.season!
        s.fields.forEach((f, i) => {
          const o = S.killOutlook(c, i)
          if (f.status !== 'growing' || f.deadDay >= 0) expect(o).toBeNull()
          else if (f.killAsked === undefined && f.tiDay >= 0 && !ahead.has(i) && s.day >= S.dayIndex(c.year, 7, 1)) {
            // From August 1: a day ahead, not passed, and asked: false until the coach asks.
            expect(o!.asked).toBe(false)
            expect(o!.day).toBeGreaterThanOrEqual(s.day)
            ahead.set(i, o!.day)
          }
          if (o?.asked) expect(o.day).toBeLessThanOrEqual(s.day)
        })
        ok(w, c, { t: 'day' })
      }
      for (const [i, day] of ahead) {
        const f = c.season!.fields[i]
        if (f.killAsked === undefined || (f.killWhy !== 'made' && f.killWhy !== 'late')) continue
        compared++
        if (Math.abs(f.killAsked - day) <= 7) near++
      }
    }
    expect(compared).toBeGreaterThan(5)
    expect(near / compared).toBeGreaterThanOrEqual(0.8)
  })
})
