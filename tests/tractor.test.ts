// A machine's hours are booked (src/sim/season.ts, the crews' day): no tractor, truck or one-off implement is used by two
// people at once, none works more hours than the day has, and someone left waiting for it says so.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { personNow } from '../src/ui/now.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()
const EPS = 1e-6

// A first year on a farm of its own: the farmer, a hired operator and a field hand, by reference practice.
function season(seed: number, tractors: number, each: (c: S.Campaign, world: S.World) => void): void {
  const world = S.climateWorld(record, seed)
  const c = S.createCampaign(world, { seed, startYear: S.FARM_YEAR0 + 1 })
  S.apply(world, c, { t: 'hire', kind: 'operator' })
  S.apply(world, c, { t: 'hire', kind: 'hand' })
  if (tractors > 1) { c.buildings.push({ id: c.nextBuilding++, kind: 'shed', yard: S.HOME_YARD, done: 1, need: 1, built: true }); c.upgrades.tractor2 = true }
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
    c.incidents = []
    for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.field >= 0) S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    each(c, world)
  }
}

describe('a machine\'s day', () => {
  for (const tractors of [1, 2]) {
    it(`over twelve first years with ${tractors === 1 ? 'one tractor' : 'two tractors'}: no machine is used by two people at once, nor longer than the day`, () => {
      let machineDays = 0
      for (let seed = 1; seed <= 12; seed++) season(seed, tractors, c => {
        const s = c.season!
        const on = new Map<string, { unit: number; from: number; to: number }[]>()
        for (const w of s.worked) {
          if (S.jobSkill(w.kind) !== 'machine') continue
          // machine work says which machine it was on and when
          expect(w.machine, `${w.kind} on day ${s.day - 1}`).toBeDefined()
          on.set(w.machine!, [...(on.get(w.machine!) ?? []), { unit: w.unit, from: w.from!, to: w.to! }])
        }
        for (const [machine, spans] of on) {
          machineDays++
          let hours = 0
          for (const a of spans) {
            hours += a.to - a.from
            expect(a.from).toBeGreaterThanOrEqual(-EPS)
            expect(a.to).toBeLessThanOrEqual(1 + EPS)
            for (const b of spans) if (a !== b && a.unit !== b.unit) expect(a.to <= b.from + EPS || b.to <= a.from + EPS, `${machine} on day ${s.day - 1}: ${JSON.stringify(spans)}`).toBe(true)
          }
          expect(hours, `${machine} on day ${s.day - 1}`).toBeLessThanOrEqual(1 + EPS)
        }
      })
      expect(machineDays).toBeGreaterThan(100)
    })
  }

  it('someone whose machine work waits on the tractor someone else holds says so', () => {
    let seen = false
    for (let seed = 1; seed <= 12 && !seen; seed++) season(seed, 1, (c, world) => {
      if (seen) return
      const waits = S.jobWaits(world, c)
      for (const u of c.crew) {
        const n = personNow(c, u.id, waits)
        if (n.word !== 'Waiting' || n.rest !== 'for the tractor') continue
        // nothing they would do is held up by anything but the tractor, and someone else holds it
        expect(c.crew.some(o => o !== u && o.rig === 'tractor')).toBe(true)
        seen = true
      }
    })
    expect(seen).toBe(true)
  })
})
