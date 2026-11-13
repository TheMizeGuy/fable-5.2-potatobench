// Frost on the barrels, pressed: the haul goes first for whoever can drive, today, Sunday or not, and the answer says
// how much one tractor brings in by dark.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { SUNDAY, weekday } from '../src/sim/calendar.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

// The fixed farm, the farmer alone, left to its routine to the first Sunday off with crop out in barrels.
function sundayWithBarrels(): { c: S.Campaign; field: number } {
  const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
    c.incidents = []
    const s = c.season!
    const field = s.fields.findIndex(f => f.inField >= 200 && !f.weighed)
    if (field >= 0 && weekday(s.year, s.day) === SUNDAY && s.frostHaul !== s.day) return { c, field }
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
  }
  throw new Error('no Sunday with barrels out')
}

describe('haul it in now', () => {
  it('on a Sunday off, puts the haul first and someone drives that day', () => {
    const { c, field } = sundayWithBarrels()
    const s = c.season!
    expect(S.workday(c, s)).toBe(false)
    const before = s.fields[field].inField
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    expect(s.jobs[0]).toMatchObject({ kind: 'haul', field, unit: 0 })
    expect(S.workday(c, s)).toBe(true)
    expect(r.events[0].text).toMatch(/^You're hauling .+ now\. It's a day off, so it tires you as a working day does\. One tractor brings in about [\d,]+ cwt by dark(, so about [\d,]+ cwt will stay out|, which is all of it)\.$/)
    const by = S.haulByDark(c, field)!
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(s.worked.some(w => w.kind === 'haul' && w.field === field && w.unit === 0)).toBe(true)
    // What came in that day is what was said, give or take what the digger added and the rounding.
    const hauled = before - s.fields[field].inField
    expect(hauled).toBeGreaterThan(by.cwt * 0.8)
    expect(hauled).toBeLessThanOrEqual(by.cwt + 1)
  })

  it('says exactly why when nobody on the farm will drive', () => {
    const { c, field } = sundayWithBarrels()
    expect(S.apply(world, c, { t: 'priority', unit: 0, work: 'machine', level: 0 }).ok).toBe(true)
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    expect(r.events[0].text).toBe(`You're set never to drive. The barrels in ${S.FIELD_NAMES[field]} stay out tonight. Set someone's priority for machine work to haul them in.`)
    expect(S.workday(c, c.season!)).toBe(false)
  })

  it('says who is hurt or resting when that is why', () => {
    const { c, field } = sundayWithBarrels()
    const s = c.season!
    c.crew[0].out = s.day + 4
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    expect(r.events[0].text).toMatch(new RegExp(`^You're hurt until [^.]+\\. The barrels in ${S.FIELD_NAMES[field]} stay out tonight\\.$`))
    c.crew[0].out = 0
    c.crew[0].rest = 'now'
    expect(S.apply(world, c, { t: 'haulNow', field }).events[0].text).toBe(`You're resting, worn out. The barrels in ${S.FIELD_NAMES[field]} stay out tonight.`)
  })

  it('with the only tractor out digging, the digger stops to haul and the answer says so', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    let found: { field: number; dig: S.Job } | null = null
    for (let g = 0; g < 400 && !found && !S.seasonDone(c); g++) {
      c.incidents = []
      const s = c.season!
      const dig = s.jobs.find(j => j.id === c.crew[0].job && j.kind === 'dig')
      const field = s.fields.findIndex(f => f.inField >= 200 && !f.weighed)
      if (dig && field >= 0 && c.crew[0].rig === 'tractor') found = { field, dig }
      else expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    }
    expect(found).not.toBeNull()
    const { field, dig } = found!
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    const where = dig.field === field ? 'there' : S.FIELD_NAMES[dig.field]
    expect(r.events[0].text).toMatch(new RegExp(`^You're hauling ${S.FIELD_NAMES[field]} now\\. You stop digging ${where} for it\\.( It's a day off, so it tires you as a working day does\\.)? One tractor brings in about [\\d,]+ cwt by dark`))
    expect(c.season!.jobs[0]).toMatchObject({ kind: 'haul', field, unit: 0 })
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(c.season!.worked.some(w => w.kind === 'haul' && w.field === field && w.unit === 0)).toBe(true)
  })
})
