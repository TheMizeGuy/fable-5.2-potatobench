// The scale standard (docs/SCALE.md), held from the numbers the scene is drawn with: one ground unit is one metre for
// everything, and a field is the size of a field beside a barn.
import { describe, expect, it } from 'vitest'
import { FIELD_ACRES } from '../src/sim/index.ts'
import { BAY_WIDE, FD, FIELDS, FW, PLANTED_ROWS, ROW, WIDE } from '../src/render/layout.ts'
import { BARN, HOUSE, HOUSE_AREA, HOUSE_DOOR, PERSON, SHED_BAY, TRACTOR } from '../src/render/measures.ts'
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
    expect(BAY_WIDE).toBeCloseTo(SHED_BAY.wide, 5)
  })

  it('plants the rows at their true spacing whatever the size of the field', () => {
    say('rows', `${PLANTED_ROWS} to a field, ${ROW.toFixed(3)} m apart`)
    expect(ROW).toBeGreaterThanOrEqual(0.86)
    expect(ROW).toBeLessThanOrEqual(0.91)
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
