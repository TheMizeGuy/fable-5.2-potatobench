// The work is watched as it is done, at a strategy game's pace (the owner, 14 November: "make it play like a true fun
// RTS watching all your guys ... make the speed go around the gameplay this is a game not a backend simulator with
// some art slapped on"). A day of work is a minute at the first speed; what that is held to, measured on the real
// game run a frame at a time without a picture (tests/longday.ts):
//  - nobody and nothing in sight is ever moved further in a frame than it could go, and nobody slides as they stand;
//  - machines and people go at one brisk pace, the same for every kind of work;
//  - the ground changes where the machine has been, in the hours it works there: none of it only when the day turns,
//    and none shown worked that the day's end does not have worked;
//  - an order given part way through the day moves nobody who was not given it;
//  - how it plays (docs/RTS.md): one order on one field is done in under a minute, a first year in under an hour,
//    and little of it is time with nobody at anything.
import { describe, expect, it } from 'vitest'
import { watchLong, type LongSeen } from './longday.ts'

// Metres a second, kept up for a second in sight: on foot (a brisk walk to a run across a yard), a machine on the
// lane, and a machine at its work in the rows: its usual pace (the median), and the most it ever goes (a stretch of
// a few seconds' work at a day's edge is gone over quicker).
const FOOT_MOST = 6, RIG_MOST = 26.5, WORK = [8, 20], WORK_MOST = 26.5

function held(r: LongSeen, what: string): void {
  expect(r.jumps, `${what}: steps nobody could make`).toEqual([])
  expect(r.slid, `${what}: figures slid over the ground as they stood`).toBe(0)
  expect(r.popped, `${what}: hills whose ground changed only when the day turned`).toBe(0)
  expect(r.ahead, `${what}: ground shown worked that the day did not work`).toEqual([])
  expect(r.fastest.foot, `${what}: on foot, ${r.where.foot}`).toBeLessThanOrEqual(FOOT_MOST)
}

describe('a long day, watched as it is worked', () => {
  it('planting: the planter works the field lane by lane through the day, the ground sown behind it, and goes on from where it stood the next morning', () => {
    const r = watchLong({ job: 'plant', days: 2, order: 0.45 })
    held(r, 'planting')
    expect(r.days).toBe(2)
    expect(r.shown).toBeGreaterThan(150)
    expect(r.slowestWorking).toBeGreaterThan(WORK[0])
    expect(r.slowestWorking).toBeLessThan(WORK[1])
    expect(r.fastest.working).toBeLessThan(WORK_MOST)
    expect(r.fastest.rig, r.where.rig).toBeLessThanOrEqual(RIG_MOST)
    // Every stretch of the planting is seen being done in its field for nearly all of its hours.
    // (a stretch of minutes at the end of a way is half way and half work)
    for (const s of r.atWork) expect(s.seen, `${s.kind} in field ${s.field}, ${(s.hours * 100).toFixed(0)}% of a day`).toBeGreaterThan(s.hours > 0.15 ? 0.9 : 0.4)
    // The planter is filled at the headland each time it is back where it set out, half way through a field: its
    // driver down beside it for some seconds (two fields in these two days).
    expect(r.filled).toBeGreaterThan(4)
    expect(r.filled).toBeLessThan(16)
    // The order given at eleven: whoever takes it sets out then, and the planter is not moved by the new plan.
    expect(r.orders).toEqual(['rocks on field 1 at 0.45'])
    // (the day is counted by the hour, and laid out again each time: nobody is moved by that either)
    expect(r.replans.length).toBeGreaterThan(5)
    for (const p of r.replans) expect(p.moved, `laid out again at ${p.at.toFixed(2)}`).toBeLessThan(1)
    expect(r.plans.find(p => p.includes('(again)') && p.includes('rocks@1'))).toMatch(/hand1 work: rocks@1 0\.45>/)
  }, 120_000)

  it('hilling, digging and hauling, a walk through the crop: at a pace that reads, with no jump', () => {
    const hill = watchLong({ job: 'hill' })
    held(hill, 'hilling')
    expect(hill.slowestWorking).toBeLessThan(WORK[1])
    expect(hill.fastest.working).toBeLessThan(WORK_MOST)
    expect(hill.shown).toBe(96)
    const dig = watchLong({ job: 'dig', days: 4 })
    held(dig, 'digging and hauling')
    expect(dig.slowestWorking).toBeGreaterThan(WORK[0])
    expect(dig.slowestWorking).toBeLessThan(WORK[1])
    expect(dig.fastest.working).toBeLessThan(WORK_MOST)
    expect(dig.shown).toBeGreaterThan(100)
    const scout = watchLong({ job: 'scout' })
    held(scout, 'scouting')
  }, 240_000)

  it('a whole season at 1×, every order the farm asks for given each morning: nobody jumps or slides, and no ground changes out of its time', () => {
    const r = watchLong({ job: 'plant', days: 230, soak: true, hands: 2, dt: 1 / 15 })
    // (planting to the freeze: the days with no work in them go by in seconds, so the season is its working days)
    expect(r.days).toBeGreaterThan(100)
    expect(r.jumps, 'steps nobody could make').toEqual([])
    expect(r.slid, 'figures slid over the ground as they stood').toBe(0)
    expect(r.popped, 'hills whose ground changed only when the day turned').toBe(0)
    expect(r.ahead, 'ground shown worked that the day did not work').toEqual([])
    expect(r.shown, 'hills whose ground changed as the work passed').toBeGreaterThan(1000)
    expect(r.fastest.foot, r.where.foot).toBeLessThanOrEqual(FOOT_MOST)
    expect(r.fastest.rig, r.where.rig).toBeLessThanOrEqual(RIG_MOST)
    expect(r.slowestWorking).toBeGreaterThan(WORK[0])
    expect(r.slowestWorking).toBeLessThan(WORK[1])
    // How it plays at the first speed: every stretch of machine work is done inside a minute, most in a quarter of
    // one; the season is a sitting, not an afternoon; and the time nobody is at anything is a small part of it.
    const f = r.feel
    expect(f.jobs[f.jobs.length - 1], 'the longest stretch of machine work, seconds').toBeLessThanOrEqual(61)
    expect(f.jobs[Math.floor(f.jobs.length / 2)], 'the usual stretch of machine work, seconds').toBeLessThan(30)
    expect(f.seconds / 60, 'the season, minutes at the first speed').toBeLessThan(60)
    expect(f.dead / f.seconds, 'share of the season nobody is at anything').toBeLessThan(0.2)
  }, 240_000)
})
