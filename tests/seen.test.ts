// Work is seen where it happens (src/render/units.ts, work.ts): with the days running at 1x, 3x or 8x, a machine is
// seen on the field the game has work on, moving along its rows at a pace the eye can follow, for a fair share of the
// time that work goes on; nobody is seen to make a step no walker or driver could (a way too long to show is cut,
// with those on it gone from sight through the cut); and someone sets out the moment the clock is set going. The
// people and machines are run without a picture (tests/crewsim.ts); tools/render/seen.ts checks the picture itself.
import { describe, expect, it } from 'vitest'
import { watch, type Farm, type Seen } from './crewsim.ts'

const SPEEDS = [[1, '1x'], [2, '3x'], [3, '8x']] as const
const share = (a: number, b: number) => (b > 0 ? a / b : 0)
// What the picture owes at each clock: a machine on a field of the work for this share of the time the game has that
// work going on (what it shows of it in the few seconds after counts too: the picture runs behind the days), and
// working there for this share of it.
const OWED = { 1: { there: 0.6, working: 0.4 }, 2: { there: 0.6, working: 0.3 }, 3: { there: 0.5, working: 0.3 } }

const ROWS: [string, string, Farm][] = [
  ['planting', 'plant', {}],
  ['hilling', 'hill', {}],
  ['spraying', 'spray', {}],
  ['killing the vines', 'kill', {}],
  ['digging with the digger', 'dig', {}],
  ['digging with the harvester', 'dig', { spring: app => { app.do({ t: 'buy', upgrade: 'harvester' }) } }],
]

describe('a machine at work is seen on its field', () => {
  for (const [name, kind, farm] of ROWS) for (const [speed, label] of SPEEDS) {
    it(`${name} at ${label}`, () => {
      const s = watch(kind, speed, { farm, seconds: speed === 1 ? 24 : speed === 2 ? 16 : 12 })
      const said = `there ${Math.round(100 * share(s.atWork, s.seconds))}%, working ${Math.round(100 * share(s.busy, s.seconds))}% of ${s.seconds.toFixed(1)} s`
      expect(s.jumps, s.jumps.join('; ')).toEqual([])
      expect(share(s.atWork, s.seconds), said).toBeGreaterThanOrEqual(OWED[speed].there)
      // (at 1x it is this work it is seen at; at the faster clocks, behind the days, it may be the work before)
      expect(share(speed === 1 ? s.working : s.busy, s.seconds), said).toBeGreaterThanOrEqual(OWED[speed].working)
      // along the rows, and at a pace that is seen to move and can be followed
      expect(share(s.along, s.path)).toBeGreaterThanOrEqual(0.8)
      const pace = share(s.path, s.moving)
      expect(pace).toBeGreaterThan(1)
      expect(pace).toBeLessThan(28 * [1, 1, 1.5, 2.4][speed])
      expect(s.work[1]).toBeGreaterThan(s.work[0])
    })
  }
})

describe('work with no rows to it', () => {
  it('hauling with the truck: it is seen at the field and on its way, at 1x and 3x', () => {
    const farm: Farm = { spring: app => { app.do({ t: 'buy', upgrade: 'truck' }) } }
    for (const speed of [1, 2] as const) {
      const s: Seen = watch('haul', speed, { farm, seconds: speed === 1 ? 24 : 16 })
      expect(s.jumps, s.jumps.join('; ')).toEqual([])
      expect(share(s.atWork, s.seconds)).toBeGreaterThanOrEqual(0.3)
      expect(s.work[1]).toBeGreaterThan(s.work[0])
    }
  })

  it('felling: whoever fells is seen at the tract at every clock', () => {
    const farm: Farm = { order: app => { app.do({ t: 'job', kind: 'fell', field: 14 }) } }
    for (const [speed] of SPEEDS) {
      const s = watch('fell', speed, { farm, foot: true, headZ: 8, seconds: speed === 1 ? 20 : 12 })
      expect(s.jumps, s.jumps.join('; ')).toEqual([])
      expect(share(s.atWork, s.seconds)).toBeGreaterThanOrEqual(0.6)
    }
  })
})

describe('the clock stopped and set going again', () => {
  it('leaves whoever was being seen at work at it: a machine digging goes on digging', () => {
    for (const kind of ['dig', 'plant']) {
      const s = watch(kind, 1, { seconds: 20, dist: 308, pauseAt: 8.9 })
      expect(s.jumps, s.jumps.join('; ')).toEqual([])
      expect(share(s.working, s.seconds), `${kind}: working ${Math.round(100 * share(s.working, s.seconds))}%`).toBeGreaterThanOrEqual(0.5)
    }
  })
})

describe('the first seconds', () => {
  it('someone sets out as the clock is set going, before the day that does the work has been counted', () => {
    // (the routine's planting: nothing is on the list the evening before)
    expect(watch('plant', 1, { seconds: 6 }).lead).toBeGreaterThan(20)
    // (an order the player has given: felling, on foot)
    expect(watch('fell', 1, { farm: { order: app => { app.do({ t: 'job', kind: 'fell', field: 14 }) } }, foot: true, seconds: 6 }).lead).toBeGreaterThan(8)
  })
})
