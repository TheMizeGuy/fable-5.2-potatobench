// The scale standard (docs/SCALE.md), held from the numbers the scene is drawn with: one ground unit is one metre for
// everything, and a field is the size of a field beside a barn.
import { describe, expect, it } from 'vitest'
import { FIELD_ACRES } from '../src/sim/index.ts'
import { BAY_WIDE, FD, FIELDS, FW, PLANTED_ROWS, ROW, WIDE } from '../src/render/layout.ts'
import { PERSON, TRACTOR, TRUCK } from '../src/render/living.ts'
import {
  BARN, BUNK, DUFOUR_BUILT, HOUSE, HOUSE2, HOUSE_AREA, HOUSE_DOOR, NEIGHBOUR, PACKING, POLE, POTATO_HOUSE, PUMP, SHED, SHED_BAY, STAND,
} from '../src/render/measures.ts'
import { K, KV, S } from '../src/render/scale.ts'

const ACRE = 4046.86
const said: string[] = []
const say = (what: string, value: string) => said.push(`${what}: ${value}`)

describe('the scale standard', () => {
  it('draws a person 1.8 m tall and a house door they can walk through', () => {
    say('person', `${PERSON.tall.toFixed(2)} m`)
    say('house door', `${HOUSE_DOOR.w.toFixed(2)} by ${HOUSE_DOOR.h.toFixed(2)} m`)
    expect(PERSON.tall).toBeGreaterThan(1.7)
    expect(PERSON.tall).toBeLessThan(1.9)
    expect(Math.abs(HOUSE_DOOR.h - 2.0)).toBeLessThanOrEqual(0.2)
    expect(HOUSE_DOOR.h).toBeGreaterThan(PERSON.tall)
  })

  it('draws a tractor of true size, a lane it fits and a shed bay that takes it', () => {
    say('tractor', `${TRACTOR.long.toFixed(2)} long, ${TRACTOR.wide.toFixed(2)} wide, ${TRACTOR.tall.toFixed(2)} tall`)
    say('farm lane', `${WIDE.track.toFixed(1)} m (${(WIDE.track / TRACTOR.wide).toFixed(2)} tractor widths); farm road ${WIDE.road.toFixed(1)} m; town road ${WIDE.town.toFixed(1)} m`)
    say('machine-shed bay', `${SHED_BAY.wide.toFixed(2)} wide, ${SHED_BAY.deep.toFixed(2)} deep, ${SHED_BAY.tall.toFixed(2)} to the eave`)
    expect(TRACTOR.long).toBeGreaterThan(3.3)
    expect(TRACTOR.long).toBeLessThan(4.1)
    expect(WIDE.track).toBeGreaterThanOrEqual(1.3 * TRACTOR.wide)
    expect(WIDE.town).toBeGreaterThanOrEqual(5.5)
    expect(SHED_BAY.wide).toBeGreaterThan(TRACTOR.wide + 0.6)
    expect(SHED_BAY.deep).toBeGreaterThan(TRACTOR.long)
    expect(SHED_BAY.tall).toBeGreaterThan(TRACTOR.tall)
    // the standard's bay: about four metres wide and high, and deep enough for the truck
    expect(SHED_BAY.wide).toBeGreaterThanOrEqual(4)
    expect(SHED_BAY.wide).toBeLessThanOrEqual(5)
    expect(SHED_BAY.tall).toBeGreaterThanOrEqual(3.8)
    expect(SHED_BAY.deep).toBeGreaterThan(TRUCK.long + 1)
    expect(BAY_WIDE).toBeCloseTo(SHED_BAY.wide, 5)
  })

  it('plants the rows at their true spacing whatever the size of the field', () => {
    say('rows', `${PLANTED_ROWS} to a field, ${ROW.toFixed(3)} m apart`)
    expect(ROW).toBeGreaterThanOrEqual(0.86)
    expect(ROW).toBeLessThanOrEqual(0.91)
  })

  it('builds every building to the size of a real one', () => {
    const within = (v: number, lo: number, hi: number, what: string) => { expect(v, what).toBeGreaterThanOrEqual(lo); expect(v, what).toBeLessThanOrEqual(hi) }
    const size = (b: { w: number; l: number; ridge?: number }) => `${b.w.toFixed(1)} by ${b.l.toFixed(1)} m${b.ridge ? `, ${b.ridge.toFixed(1)} to the ridge` : ''}`
    say('potato house', size(POTATO_HOUSE))
    say('machine shed', size(SHED))
    say('bunkhouse', size(BUNK))
    say('packing shed', size(PACKING))
    say('second potato house', size(HOUSE2))
    say('farm stand', size(STAND))
    say('pump house', size(PUMP))
    say('Dufour house, barn, potato house', `${size(DUFOUR_BUILT.house)}; ${size(DUFOUR_BUILT.barn)}; ${size(DUFOUR_BUILT.potatoHouse)}`)
    say('a neighbour\'s house and barn', `${size(NEIGHBOUR.house)}; ${size(NEIGHBOUR.barn)}`)
    say('a pole', `${POLE.toFixed(1)} m`)
    // the farmhouse: about 8 by 11 m and 8 to 9 m to the ridge; with its ells near the measured median of 173 m2
    within(HOUSE.w, 7.5, 8.6, 'house width'); within(HOUSE.l, 10.4, 11.6, 'house length'); within(HOUSE.ridge, 8, 9, 'house ridge')
    within(HOUSE_AREA, 140, 200, 'house with its ells')
    // the barn: 11 by 12 up to 13 by 32 m, 10 to 12 m to the ridge, a 4 m door
    within(BARN.w, 11, 13, 'barn width'); within(BARN.l, 12, 32, 'barn length'); within(BARN.ridge, 10, 12, 'barn ridge')
    within(BARN.door.w, 3.8, 4.4, 'barn door'); within(BARN.door.h, 3.8, 4.4, 'barn door height')
    // the banked potato house: 12 by 18 m
    within(POTATO_HOUSE.w, 11.4, 12.6, 'potato house width'); within(POTATO_HOUSE.l, 17, 19, 'potato house length')
    // the machine shed: 9 by 18 m
    within(SHED.w, 8.5, 9.5, 'shed depth'); within(SHED.l, 17, 19.5, 'shed length')
    // a bunkhouse for six: 28 to 56 m2 of floor
    within(BUNK.w * BUNK.l, 28, 60, 'bunkhouse floor')
    // a packing shed about 9 by 18 m; a roadside stand about 2.4 by 4.9 m; the others between a shed and a barn
    within(PACKING.w, 8, 10, 'packing shed width'); within(PACKING.l, 12, 19, 'packing shed length')
    within(STAND.w, 4, 5.5, 'stand length'); within(STAND.l, 2.2, 3.2, 'stand depth')
    within(HOUSE2.w, 9, 12.6, 'second potato house width'); within(HOUSE2.l, 12, 18.5, 'second potato house length')
    for (const b of [DUFOUR_BUILT.barn, NEIGHBOUR.barn]) { within(b.w, 11, 13, 'a barn\'s width'); within(b.l, 12, 32, 'a barn\'s length'); within(b.ridge, 10, 12, 'a barn\'s ridge') }
    for (const b of [DUFOUR_BUILT.house, NEIGHBOUR.house]) { within(b.w, 7, 8.6, 'a house\'s width'); within(b.l, 10, 11.6, 'a house\'s length') }
    within(POLE, 8.5, 11, 'a pole')
  })

  it('makes a field the size of a field beside the barn and the house', () => {
    const area = FW * FD
    say('scale', `K ${K}, KV ${KV.toFixed(2)}, S ${S}`)
    say('field', `${FW.toFixed(0)} by ${FD.toFixed(0)} m, ${(area / 10000).toFixed(2)} ha, ${(area / ACRE).toFixed(2)} acres (the simulation says ${FIELD_ACRES})`)
    say('barn', `${BARN.w.toFixed(1)} by ${BARN.l.toFixed(1)} m, ${BARN.ridge.toFixed(1)} to the ridge, door ${BARN.door.w.toFixed(1)} by ${BARN.door.h.toFixed(1)}`)
    say('house', `${HOUSE.w.toFixed(1)} by ${HOUSE.l.toFixed(1)} m, ${HOUSE.ridge.toFixed(1)} to the ridge, ${HOUSE_AREA.toFixed(0)} m2 with its ells`)
    say('field in barn lengths', (FW / BARN.l).toFixed(1))
    say('field in house footprints', `${(area / (HOUSE.w * HOUSE.l)).toFixed(0)} of the house alone, ${(area / HOUSE_AREA).toFixed(0)} with its ells`)
    expect(FW / BARN.l).toBeGreaterThanOrEqual(6)
    expect(area / HOUSE_AREA).toBeGreaterThanOrEqual(80)
    // the drawn field against the five acres the weigh ticket prints: within the compression the standard allows
    expect(area / ACRE).toBeGreaterThan(FIELD_ACRES * 0.45)
    expect(area / ACRE).toBeLessThan(FIELD_ACRES * 1.3)
    for (const f of FIELDS) expect(f.x1 - f.x0).toBeCloseTo(FW, 6)
    console.log('\n  the scale as drawn\n  ' + said.join('\n  '))
  })
})
