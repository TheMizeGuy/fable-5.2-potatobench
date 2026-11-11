// The land: every field the farm has or could have, where it lies, and how far apart things are.
// Positions are in the field view's ground units (one field is about 14 by 11); x runs north to south
// along the rows, z runs down the slope from the spruce ridge to the brook and beyond it.

export type BlockId = 'home' | 'brook' | 'ridge' | 'dufour'

export interface Parcel {
  name: string
  block: BlockId
  elev: 0 | 1 | 2         // 0 bottom land, 1 mid slope, 2 ridge
  x: number               // centre
  z: number
  rent: number            // dollars a year
  price: number           // dollars to buy
}

export interface Yard { name: string; block: BlockId; x: number; z: number; cellar: number }

// The home farm's six, then the land that can be rented or bought.
export const PARCELS: Parcel[] = [
  { name: 'North Ridge', block: 'home', elev: 2, x: -8.4, z: -14.2, rent: 0, price: 0 },
  { name: 'South Ridge', block: 'home', elev: 2, x: 7.8, z: -14.2, rent: 0, price: 0 },
  { name: 'Upper Middle', block: 'home', elev: 1, x: -8.4, z: -1, rent: 0, price: 0 },
  { name: 'Lower Middle', block: 'home', elev: 1, x: 7.8, z: -1, rent: 0, price: 0 },
  { name: 'Brook Field', block: 'home', elev: 0, x: -8.4, z: 12.2, rent: 0, price: 0 },
  { name: 'Bottom Field', block: 'home', elev: 0, x: 7.8, z: 12.2, rent: 0, price: 0 },
  // Across the brook: deep wet bottom land, frosty, close to water.
  { name: 'Intervale North', block: 'brook', elev: 0, x: -8.4, z: 38, rent: 1300, price: 15000 },
  { name: 'Intervale South', block: 'brook', elev: 0, x: 7.8, z: 38, rent: 1300, price: 15000 },
  // North along the ridge: early, dry ground under the spruce.
  { name: 'Spruce Lot', block: 'ridge', elev: 2, x: -44, z: -14.2, rent: 900, price: 10000 },
  { name: 'High Lot', block: 'ridge', elev: 2, x: -27.8, z: -14.2, rent: 900, price: 10000 },
  // The Dufour place, up the road to the south, with a potato house of its own.
  { name: 'Dufour Upper', block: 'dufour', elev: 2, x: 58, z: -14.2, rent: 1100, price: 12500 },
  { name: 'Dufour Flat', block: 'dufour', elev: 1, x: 74.2, z: -14.2, rent: 1100, price: 12500 },
  { name: 'Dufour Middle', block: 'dufour', elev: 1, x: 58, z: -1, rent: 1100, price: 12500 },
  { name: 'Dufour Lower', block: 'dufour', elev: 0, x: 74.2, z: -1, rent: 1100, price: 12500 },
]

export const HOME_FIELDS = 6

// Where crews start the day and crops are stored. The Dufour yard is the farm's only when Dufour land is held.
export const YARDS: Yard[] = [
  { name: 'Home yard', block: 'home', x: 26, z: -4, cellar: 3600 },
  { name: 'Dufour yard', block: 'dufour', x: 90, z: -6, cellar: 2400 },
]

// A place a crew can be: a field (0 and up) or a yard (-1 the home yard, -2 the Dufour yard).
export function placeXZ(place: number): { x: number; z: number } {
  return place >= 0 ? PARCELS[place] : YARDS[-place - 1]
}

// Distance by the farm roads, which run square to the fields.
export function distance(a: number, b: number): number {
  const p = placeXZ(a), q = placeXZ(b)
  const dx = p.x - q.x, dz = p.z - q.z
  return (dx < 0 ? -dx : dx) + (dz < 0 ? -dz : dz)
}
