// The sizes of the few things the eye reads scale from (docs/SCALE.md), in metres, from the numbers they are drawn
// with: the models' own sizes times the factor each is drawn at. tests/scale.test.ts holds them to the standard.
import { COWS, COW_SCALE, DRAUGHT, HORSE } from './animals.ts'
import { FIGURE_TALL } from './crew.ts'
import { S } from './scale.ts'
import { TRACTOR_SIZE, TRUCK_SIZE } from './tractor.ts'

// People and machines are modelled small (a figure 0.83 tall, the tractor 1.61 long: the models' own numbers, read
// from crew.ts and tractor.ts) and drawn at this size, which is true size, whatever the distance. People against the machines' scale: FIGURE.
export const TRUE_SIZE = 2.1
export const FIGURE = 1.05
export const PERSON = { tall: FIGURE_TALL * TRUE_SIZE * FIGURE }
export const TRACTOR = { long: TRACTOR_SIZE.long * TRUE_SIZE, wide: TRACTOR_SIZE.wide * TRUE_SIZE, tall: TRACTOR_SIZE.tall * TRUE_SIZE }
export const TRUCK = { long: TRUCK_SIZE.long * TRUE_SIZE, wide: TRUCK_SIZE.wide * TRUE_SIZE }
// Animals: the shoulder height each is modelled at, times the factor each is drawn at.
export const DRAUGHT_HORSE = { shoulder: HORSE.high * TRUE_SIZE * FIGURE * DRAUGHT }
export const COW = { shoulder: COWS[0].high * TRUE_SIZE * FIGURE * COW_SCALE }

// Buildings, in the small units they are drawn in (the Builder brings them up by S).
export const SMALL = {
  houseDoor: { w: 0.44, h: 0.9 },
  house: { w: 3.0, l: 3.6, wall: 2.05, rise: 1.15 },
  ell: { w: 2.3, l: 3.0 }, backHouse: { w: 2.5, l: 2.8 },
  barn: { w: 4.3, l: 6.0, wall: 2.5, rise: 1.9, door: { w: 1.9, h: 1.88 } },
  shed: { w: 3.1, l: 6.4, wall: 1.5, bays: 3 },
}
const m = (v: number) => v * S
export const HOUSE_DOOR = { w: m(SMALL.houseDoor.w), h: m(SMALL.houseDoor.h) }
export const HOUSE = { w: m(SMALL.house.w), l: m(SMALL.house.l), ridge: m(SMALL.house.wall + SMALL.house.rise) }
// The house with its ell and back house, as a footprint.
export const HOUSE_AREA = m(SMALL.house.w) * m(SMALL.house.l) + m(SMALL.ell.w) * m(SMALL.ell.l) + m(SMALL.backHouse.w) * m(SMALL.backHouse.l)
export const BARN = { w: m(SMALL.barn.w), l: m(SMALL.barn.l), ridge: m(SMALL.barn.wall + SMALL.barn.rise), door: { w: m(SMALL.barn.door.w), h: m(SMALL.barn.door.h) } }
export const SHED_BAY = { wide: m(SMALL.shed.l / SMALL.shed.bays), deep: m(SMALL.shed.w), tall: m(SMALL.shed.wall) }
