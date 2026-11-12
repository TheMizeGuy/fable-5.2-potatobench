// The layout as the builders of made things see it: in the small units their drawings were first authored in, in the
// frame they are drawing in now (scale.ts). A drawing made with these comes out at true size where the frame puts it:
// the Builder multiplies every point by S and adds the frame.
import * as L from './layout.ts'
import { K, NOW, S, type Frame } from './scale.ts'

export { useFrame, TRUE } from './scale.ts'
export { HOME, DUFOUR, BRIDGE, PONDSIDE, ROADSIDE } from './layout.ts'
export type { Spot, Pt } from './layout.ts'
export type Site = L.SmallSite & { frame: Frame }

export const { HOUSE, BARN, POTATO_HOUSE, DUFOUR_HOUSE, DUFOUR_BARN, DUFOUR_POTATO_HOUSE, LOG_DECKS, STONE_PILE } = L.SMALL
export const POND_AT = L.SMALL.POND
export const WATER_Y = L.WATER_Y / S
// The sites of the yards' plan, each in the small units of its own frame.
export const SITES: Site[] = L.SITES.map(s => ({ ...s.small, frame: s.frame }))

export function groundY(x: number, z: number): number {
  return L.groundY(NOW.x + S * x, NOW.z + S * z) / S
}
export function brookZ(x: number): number {
  return (L.brookZ(NOW.x + S * x) - NOW.z) / S
}
export function brookHalf(x: number): number {
  return L.brookHalf(NOW.x + S * x) / S
}
export function townRoadZ(x: number): number {
  return (L.townRoadZ(NOW.x + S * x) - NOW.z) / S
}
// In the plain frame: where the roads cross the brook, the farm road's line, the gateways in the walls.
export const BRIDGE_X = { home: L.BRIDGE_X.home / S, dufour: L.BRIDGE_X.dufour / S }
export const ROAD_TRUE: [number, number][] = L.ROAD.map(([x, z]) => [x / S, z / S])
export const GATEWAYS_TRUE = L.GATEWAYS.map(p => ({ x: p.x / S, z: p.z / S }))
// A small point of another frame, in the frame being drawn in.
export function from(f: Frame, x: number, z: number): { x: number; z: number } {
  return here(f.x + S * x, f.z + S * z)
}
// A point of the world in the frame being drawn in.
export function here(x: number, z: number): { x: number; z: number } {
  return { x: (x - NOW.x) / S, z: (z - NOW.z) / S }
}
// A point of the land, given in the simulation's plan units, in the frame being drawn in.
export function plan(x: number, z: number): { x: number; z: number } {
  return here(K * x, K * z)
}
