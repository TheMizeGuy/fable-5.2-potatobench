// The yards' plan: every building the simulation can raise has a site, and the sites leave each other, the fields,
// the old buildings and the roads clear.
import { describe, expect, it } from 'vitest'
import { BUILDINGS, BUILDING_KINDS } from '../src/sim/index.ts'
import {
  BARN, BAYS, DUFOUR_BARN, DUFOUR_HOUSE, DUFOUR_POTATO_HOUSE, FIELDS, HOUSE, LOG_DECKS, POTATO_HOUSE, SITES, STONE_PILE, gravelDist, route, siteOf,
  yardAt, yardSpot,
} from '../src/render/layout.ts'
import { S } from '../src/render/scale.ts'

const corners = (s: (typeof SITES)[number]) => {
  const c = Math.cos(s.ry), n = Math.sin(s.ry)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: s.x + (a * s.w / 2) * c + (b * s.d / 2) * n, z: s.z - (a * s.w / 2) * n + (b * s.d / 2) * c }))
}
const box = (s: (typeof SITES)[number]) => {
  const p = corners(s)
  return { x0: Math.min(...p.map(q => q.x)), x1: Math.max(...p.map(q => q.x)), z0: Math.min(...p.map(q => q.z)), z1: Math.max(...p.map(q => q.z)) }
}

describe('the yards\' plan', () => {
  it('has a site for every building at every yard it can stand in', () => {
    for (const kind of BUILDING_KINDS) {
      expect(siteOf(kind, -1), kind).toBeDefined()
      expect(!!siteOf(kind, -2), kind).toBe(BUILDINGS[kind].dufour)
    }
    expect(SITES.length).toBe(BUILDING_KINDS.length + BUILDING_KINDS.filter(k => BUILDINGS[k].dufour).length)
  })

  it('keeps the sites clear of each other, of the fields and of what already stands', () => {
    const old = [HOUSE, BARN, POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN, DUFOUR_POTATO_HOUSE]
    const built = SITES.filter(s => s.kind !== 'road')
    for (const s of built) {
      const a = box(s)
      for (const t of built) {
        if (t === s) continue
        const b = box(t)
        const apart = a.x1 + 0.5 * S < b.x0 || b.x1 + 0.5 * S < a.x0 || a.z1 + 0.5 * S < b.z0 || b.z1 + 0.5 * S < a.z0
        expect(apart, `${s.kind} ${s.yard} and ${t.kind} ${t.yard}`).toBe(true)
      }
      for (const f of FIELDS) expect(a.x1 < f.x0 || a.x0 > f.x1 || a.z1 < f.z0 || a.z0 > f.z1, `${s.kind} ${s.yard} on field ${f.i}`).toBe(true)
      for (const o of old) expect(Math.hypot(s.x - o.x, s.z - o.z), `${s.kind} ${s.yard} by an old building`).toBeGreaterThan(5 * S)
      // no building stands on a road, and each has one near enough to reach
      expect(gravelDist(s.x, s.z), `${s.kind} ${s.yard} on a road`).toBeGreaterThan(0.6 * S)
    }
  })

  it('gives every site a door and standing room outside its walls, reachable by the farm\'s ways', () => {
    for (const s of SITES) {
      const a = box(s)
      const outside = (p: { x: number; z: number }) => p.x < a.x0 || p.x > a.x1 || p.z < a.z0 || p.z > a.z1
      expect(outside(s.door), `${s.kind} ${s.yard} door`).toBe(true)
      expect(s.work.length).toBeGreaterThanOrEqual(3)
      for (const w of s.work) expect(outside(w), `${s.kind} ${s.yard} work`).toBe(true)
      const from = yardSpot(s.yard, 0, false)
      const way = route(from, s.door)
      expect(way.length).toBeGreaterThanOrEqual(2)
      const last = way[way.length - 1]
      expect(Math.hypot(last.x - s.door.x, last.z - s.door.z)).toBeLessThan(1e-6)
    }
  })

  it('counts a click on any home site but the stand and the pump as the yard', () => {
    for (const s of SITES) {
      if (s.kind === 'stand' || s.kind === 'pond') continue
      expect(yardAt(s.x, s.z), `${s.kind} ${s.yard}`).toBe(s.yard)
    }
    for (const f of FIELDS) expect(yardAt(f.cx, f.cz), `field ${f.i}`).toBe(0)
  })

  it('keeps the material piles and the shed\'s bays where they belong', () => {
    const shed = siteOf('shed', -1)!
    for (const b of BAYS) expect(Math.abs(b.x - shed.x) < shed.w / 2 && Math.abs(b.z - shed.z) < shed.d / 2).toBe(true)
    for (const p of [...LOG_DECKS, STONE_PILE]) {
      expect(yardAt(p.x, p.z)).toBe(-1)
      for (const s of SITES.filter(q => q.kind !== 'road')) { const a = box(s); expect(p.x < a.x0 - 0.3 * S || p.x > a.x1 + 0.3 * S || p.z < a.z0 - 0.3 * S || p.z > a.z1 + 0.3 * S, `pile by ${s.kind}`).toBe(true) }
    }
  })
})
