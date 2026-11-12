// The sizes of the few things the eye reads scale from (docs/SCALE.md), in metres, from the numbers they are drawn
// with: the models' own sizes times the factor each is drawn at. tests/scale.test.ts holds them to the standard.
import { S } from './scale.ts'

// People and machines are modelled small (a figure 0.82 tall, the tractor 1.61 long) and drawn at this size, which is
// true size, whatever the distance. People against the machines' scale: FIGURE.
export const TRUE_SIZE = 2.1
export const FIGURE = 1.05
export const PERSON = { tall: 0.82 * TRUE_SIZE * FIGURE }
export const TRACTOR = { long: 1.61 * TRUE_SIZE, wide: 0.93 * TRUE_SIZE, tall: 1.26 * TRUE_SIZE }
export const TRUCK = { long: 2.94 * TRUE_SIZE, wide: 0.96 * TRUE_SIZE }

// Buildings, in the small units they are drawn in (the Builder brings them up by S). `w` is across the ridge, `l`
// along it, `wall` the eaves above the floor and `rise` the ridge above the eaves.
export const SMALL = {
  houseDoor: { w: 0.44, h: 0.92 },
  house: { w: 3.65, l: 5.0, wall: 2.5, rise: 1.45 },
  ell: { w: 2.5, l: 3.2, wall: 1.5, rise: 0.92 }, backHouse: { w: 2.7, l: 3.0, wall: 1.55, rise: 1.0 },
  barn: { w: 5.45, l: 8.2, wall: 2.9, rise: 2.05, lean: 1.8, door: { w: 1.85, h: 1.85 } },
  potatoHouse: { w: 5.45, l: 8.2, wall: 1.3, rise: 1.6 },
  // what the farm can raise
  shed: { w: 4.1, l: 8.2, wall: 1.85, rise: 0.95, bays: 4 },
  bunk: { w: 2.8, l: 4.2, wall: 1.3, rise: 0.78 },
  packing: { w: 4.2, l: 7.2, wall: 1.8, rise: 1.15 },
  house2: { w: 4.8, l: 7.0, wall: 1.25, rise: 1.45 },
  pump: { w: 1.3, l: 1.6 }, stand: { w: 2.2, l: 1.3 }, station: { w: 2.3, l: 2.3 },
  // the Dufour place
  dufour: {
    house: { w: 3.4, l: 4.8, wall: 1.4, rise: 1.4 }, ell: { w: 2.3, l: 3.0, wall: 1.25, rise: 0.82 }, woodshed: { w: 2.2, l: 2.6, wall: 1.15, rise: 0.72 },
    barn: { w: 5.0, l: 5.6, wall: 2.6, rise: 2.0, lean: 1.5 }, potatoHouse: { w: 4.6, l: 6.6, wall: 1.15, rise: 1.35 },
    house2: { w: 4.4, l: 6.4, wall: 1.15, rise: 1.35 }, bunk: { w: 2.7, l: 4.0, wall: 1.3, rise: 0.75 },
  },
  // a neighbour's place
  neighbour: { house: { w: 3.6, l: 4.8, wall: 2.4, rise: 1.4 }, barn: { w: 5.4, l: 8.4, wall: 2.9, rise: 2.1 } },
  pole: 4.3,
}
const m = (v: number) => v * S
const box = (b: { w: number; l: number; wall?: number; rise?: number }) => ({ w: m(b.w), l: m(b.l), eave: m(b.wall ?? 0), ridge: m((b.wall ?? 0) + (b.rise ?? 0)) })
export const HOUSE_DOOR = { w: m(SMALL.houseDoor.w), h: m(SMALL.houseDoor.h) }
export const HOUSE = box(SMALL.house)
// The house with its ell and back house, as a footprint.
export const HOUSE_AREA = m(SMALL.house.w) * m(SMALL.house.l) + m(SMALL.ell.w) * m(SMALL.ell.l) + m(SMALL.backHouse.w) * m(SMALL.backHouse.l)
export const BARN = { ...box(SMALL.barn), door: { w: m(SMALL.barn.door.w), h: m(SMALL.barn.door.h) } }
export const POTATO_HOUSE = box(SMALL.potatoHouse)
export const SHED = box(SMALL.shed)
export const SHED_BAY = { wide: m(SMALL.shed.l / SMALL.shed.bays), deep: m(SMALL.shed.w), tall: m(SMALL.shed.wall) }
export const BUNK = box(SMALL.bunk), PACKING = box(SMALL.packing), HOUSE2 = box(SMALL.house2)
export const STAND = { w: m(SMALL.stand.w), l: m(SMALL.stand.l) }, PUMP = { w: m(SMALL.pump.w), l: m(SMALL.pump.l) }
export const DUFOUR_BUILT = { house: box(SMALL.dufour.house), barn: box(SMALL.dufour.barn), potatoHouse: box(SMALL.dufour.potatoHouse) }
export const NEIGHBOUR = { house: box(SMALL.neighbour.house), barn: box(SMALL.neighbour.barn) }
export const POLE = m(SMALL.pole)
