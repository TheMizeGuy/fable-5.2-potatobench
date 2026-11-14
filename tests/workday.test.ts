// A day worked in stretches (the `work` command): an order given at two in the afternoon is worked that afternoon,
// by a farm that has done the morning's work. A whole day in one step is unchanged (tests/determinism.test.ts).
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { parseSave, serialize } from '../src/game/save.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

function farm(hands = 2): S.Campaign {
  const c = S.createCampaign(world, { seed: 11, startYear: 1987 })
  for (let h = 0; h < hands; h++) expect(S.apply(world, c, { t: 'hire', kind: 'hand' }).ok).toBe(true)
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  return c
}

// Runs the routine's season, each day cut at the given times.
function season(c: S.Campaign, cuts: number[], each?: (c: S.Campaign) => void, until?: (c: S.Campaign) => boolean): void {
  for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
    if (until?.(c)) return
    c.incidents = []
    for (const to of cuts) expect(S.apply(world, c, { t: 'work', to }).ok).toBe(true)
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    each?.(c)
  }
}

describe('a day worked in stretches', () => {
  it('counts each person\'s day and each machine\'s hours once', () => {
    const c = farm()
    let stretches = 0
    season(c, [0.3, 0.7], c => {
      const s = c.season!
      expect(s.clock, 'the day\'s count is put away when the day is over').toBeUndefined()
      const byMachine = new Map<string, [number, number][]>()
      const byUnit = new Map<number, [number, number][]>()
      for (const w of s.worked) {
        if (w.from === undefined || w.to === undefined) continue
        stretches++
        expect(w.from).toBeGreaterThanOrEqual(-1e-9)
        expect(w.to).toBeLessThanOrEqual(1 + 1e-9)
        expect(w.to).toBeGreaterThanOrEqual(w.from)
        byMachine.set(w.machine!, [...(byMachine.get(w.machine!) ?? []), [w.from, w.to]])
        byUnit.set(w.unit, [...(byUnit.get(w.unit) ?? []), [w.from, w.to]])
      }
      for (const [who, spans] of [...byMachine, ...byUnit]) {
        spans.sort((a, b) => a[0] - b[0])
        for (let k = 1; k < spans.length; k++) expect(spans[k][0], `${who} on day ${s.day - 1}: ${JSON.stringify(spans)}`).toBeGreaterThanOrEqual(spans[k - 1][1] - 1e-6)
      }
      // Work on foot is said once for a person, a kind and a field.
      const foot = s.worked.filter(w => w.from === undefined).map(w => `${w.unit}:${w.kind}:${w.field}`)
      expect(new Set(foot).size).toBe(foot.length)
      for (const u of c.crew) { expect(u.tired).toBeGreaterThanOrEqual(0); expect(u.tired).toBeLessThanOrEqual(1) }
    })
    expect(stretches).toBeGreaterThan(30)
    expect(c.season!.fields.filter(f => f.plantDay >= 0).length).toBeGreaterThan(0)
  })

  it('work carried over a cut is one stretch in the day\'s record', () => {
    const c = farm()
    let joined = 0
    season(c, [0.5], c => {
      for (const w of c.season!.worked) if (w.from !== undefined && w.from < 0.5 - 1e-3 && w.to! > 0.5 + 1e-3) joined++
    })
    expect(joined).toBeGreaterThan(5)
  })

  it('an order given part way through the day is worked in what is left of that day', () => {
    // A day in the growing season with nothing for the farmer to do by early afternoon.
    let c!: S.Campaign
    const base = farm(0)
    season(base, [], undefined, x => {
      if (!x.season!.fields.some(f => f.status === 'growing') || !S.workday(x, x.season!)) return false
      const copy = structuredClone(x)
      S.apply(world, copy, { t: 'work', to: 0.6 })
      if (copy.season!.worked.length || copy.season!.jobs.length) return false
      c = copy
      return true
    })
    const s = c.season!
    const field = s.fields.findIndex(f => f.status === 'rest')
    expect(field).toBeGreaterThanOrEqual(0)
    expect(s.clock?.at).toBeCloseTo(0.6)
    const r = S.apply(world, c, { t: 'job', kind: 'rocks', field })
    expect(r.ok, r.err).toBe(true)
    const job = s.jobs.find(j => j.kind === 'rocks' && j.field === field)!
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(s.worked.some(w => w.kind === 'rocks' && w.field === field)).toBe(true)
    // No more of it than the afternoon holds (the walk there comes out of it too).
    expect(job.done).toBeGreaterThan(0)
    expect(job.done).toBeLessThanOrEqual(0.4 * 1.6)
    // The same order given in the morning gets the whole day.
    const c2 = farm(0)
    season(c2, [], undefined, x => x.season!.day === s.day - 1)
    expect(c2.season!.day).toBe(s.day - 1)
    expect(S.apply(world, c2, { t: 'job', kind: 'rocks', field }).ok).toBe(true)
    const job2 = c2.season!.jobs.find(j => j.kind === 'rocks' && j.field === field)!
    expect(S.apply(world, c2, { t: 'day' }).ok).toBe(true)
    expect(job2.done).toBeGreaterThan(job.done * 1.5)
  })

  it('what the rest of the day will be can be worked out ahead on a copy, and is what then happens', () => {
    const c = farm()
    let days = 0
    season(c, [], undefined, c => {
      const s = c.season!
      c.incidents = []
      expect(S.apply(world, c, { t: 'work', to: 0.25 }).ok).toBe(true)
      const copy = structuredClone(c)
      expect(S.apply(world, copy, { t: 'work', to: 1 }).ok).toBe(true)
      const ahead = JSON.stringify(copy.season!.worked)
      const jobs = JSON.stringify(copy.season!.jobs)
      const day = s.day
      expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
      expect(c.season!.day).toBe(day + 1)
      expect(JSON.stringify(c.season!.worked)).toBe(ahead)
      // (the night can take orders off the list; it adds none and does no work on them)
      const before = JSON.parse(jobs) as S.Job[]
      for (const j of c.season!.jobs) expect(before.find(b => b.id === j.id)?.done).toBe(j.done)
      days++
      return false
    })
    expect(days).toBeGreaterThan(80)
  })

  it('a save taken part way through a day goes on to the same end', () => {
    const run = (save: boolean) => {
      const c0 = farm()
      season(c0, [], undefined, c => c.season!.day >= S.dayIndex(c.year, 6, 20))
      expect(S.apply(world, c0, { t: 'work', to: 0.4 }).ok).toBe(true)
      const c = save ? parseSave(serialize(c0, 0))!.campaign : c0
      expect(c.season!.clock?.at).toBeCloseTo(0.4)
      season(c, [])
      return S.hashCampaign(c)
    }
    expect(run(true)).toBe(run(false))
  })

  it('starting the day gives the morning its orders without working any of it', () => {
    const c = farm()
    season(c, [], undefined, c => c.season!.fields.some(f => f.status === 'growing'))
    const s = c.season!
    const r = S.apply(world, c, { t: 'work', to: 0 })
    expect(r.ok).toBe(true)
    expect(s.clock).toMatchObject({ at: 0 })
    expect(s.worked).toEqual([])
    // Asked twice, the morning comes once.
    const jobs = JSON.stringify(s.jobs)
    expect(S.apply(world, c, { t: 'work', to: 0 }).events).toEqual([])
    expect(JSON.stringify(s.jobs)).toBe(jobs)
  })
})
