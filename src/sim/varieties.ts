import type { VarietyId } from './types.ts'

export interface Variety {
  id: VarietyId
  name: string
  released: number
  blurb: string
  maturity: 'early' | 'mid' | 'late' | 'very late'
  market: string        // what it is sold as
  tiPd: number          // thermal time from emergence to tuber initiation
  matPd: number         // thermal time from emergence to the start of senescence
  set: number           // tubers per hill
  bulk: number          // daily growth relative to the average
  blightLeaf: number    // susceptibility of foliage to late blight (Atlantic = 1)
  blightTuber: number   // susceptibility of tubers
  scab: number          // susceptibility to common scab (Atlantic = 1)
  hollow: number        // base share of large tubers with hollow heart
  green: number         // tendency to green: how high in the hill the tubers set
  rough: number         // tendency to knobs and growth cracks
  drought: number       // tolerance of dry soil, 0..1
  virus: number         // how readily virus spreads into saved seed (PVY susceptibility)
  dormancy: number      // days in the cellar before sprouting
  price: number         // dollars per cwt of US No. 1 in an average year
  chefBonus: boolean    // large tubers sell at a premium
  contract: boolean     // the chipping variety: off contract it sells at a processing price that barely moves with the market
  skin: number          // colours, for drawing
  flesh: number
  shape: number         // 1 round, 1.7 long
}

// Sources and derivations: docs/research/03-varieties.md, table 2B, and docs/MODEL.md.
export const VARIETIES: Variety[] = [
  {
    id: 'norland', name: 'Dark Red Norland', released: 1957, maturity: 'early', market: 'Red tablestock',
    blurb: 'Early red. Off the field before the worst of the blight and sold at a red-potato price, but it wilts in a dry spell and sprouts within three months of the dig.',
    tiPd: 120, matPd: 450, set: 9, bulk: 1.25, blightLeaf: 1.15, blightTuber: 1.2, scab: 0.58, hollow: 0.03, green: 1.0, rough: 0.8,
    drought: 0.1, virus: 0.9, dormancy: 60, price: 15.5, chefBonus: false, contract: false, skin: 0x9c3a3a, flesh: 0xf6efd8, shape: 1.05,
  },
  {
    id: 'superior', name: 'Superior', released: 1962, maturity: 'early', market: 'Early round white',
    blurb: 'Early, smooth and scab resistant. The most blight-prone leaf on the list, so it has to be dug or sprayed before August turns wet.',
    tiPd: 125, matPd: 520, set: 8, bulk: 1.15, blightLeaf: 1.38, blightTuber: 1.2, scab: 0.63, hollow: 0.03, green: 0.9, rough: 0.8,
    drought: 0.4, virus: 1.0, dormancy: 75, price: 14, chefBonus: false, contract: false, skin: 0xd6bb86, flesh: 0xf7f1dc, shape: 1.15,
  },
  {
    id: 'katahdin', name: 'Katahdin', released: 1932, maturity: 'late', market: 'Round white tablestock',
    blurb: 'The standard round white of this country for decades. Rides out a dry spell and keeps well, but the tubers set high in the hill and green if the hill is thin.',
    tiPd: 155, matPd: 740, set: 7, bulk: 1.0, blightLeaf: 0.92, blightTuber: 0.7, scab: 1.42, hollow: 0.05, green: 1.5, rough: 0.9,
    drought: 0.55, virus: 0.5, dormancy: 120, price: 14.5, chefBonus: false, contract: false, skin: 0xdcc594, flesh: 0xf8f3e2, shape: 1,
  },
  {
    id: 'kennebec', name: 'Kennebec', released: 1948, maturity: 'late', market: 'Round white tablestock',
    blurb: 'Heavy yields and the best field resistance to blight. Scabs badly in dry ground, and the tubers roughen when a dry spell breaks.',
    tiPd: 150, matPd: 680, set: 7, bulk: 1.02, blightLeaf: 0.48, blightTuber: 0.6, scab: 2.45, hollow: 0.08, green: 1.3, rough: 1.5,
    drought: 0.6, virus: 0.3, dormancy: 140, price: 13, chefBonus: false, contract: false, skin: 0xe0cb9c, flesh: 0xfaf5e6, shape: 1.25,
  },
  {
    id: 'burbank', name: 'Russet Burbank', released: 1902, maturity: 'very late', market: 'Russet bakers and fry stock',
    blurb: 'The baking potato. Never quite finishes in a season this short, so every September day counts, and uneven water turns it knobby and hollow. Keeps into April, the longest on the list.',
    tiPd: 175, matPd: 850, set: 10, bulk: 1.0, blightLeaf: 0.7, blightTuber: 1.1, scab: 0.47, hollow: 0.138, green: 0.7, rough: 1.7,
    drought: 0.3, virus: 0.85, dormancy: 160, price: 14, chefBonus: true, contract: false, skin: 0xa6794e, flesh: 0xf5eeda, shape: 1.7,
  },
  {
    id: 'atlantic', name: 'Atlantic', released: 1976, maturity: 'mid', market: 'Chip contract',
    blurb: 'The chipping standard. Grown against a chip plant\'s contract, which pays a fixed price; off contract it fetches only a processing price. Big tubers go hollow.',
    tiPd: 145, matPd: 650, set: 8, bulk: 1.12, blightLeaf: 1.0, blightTuber: 1.1, scab: 1.0, hollow: 0.154, green: 1.0, rough: 0.9,
    drought: 0.3, virus: 0.75, dormancy: 100, price: 12.5, chefBonus: false, contract: true, skin: 0xd9c491, flesh: 0xf8f2de, shape: 1.05,
  },
  {
    id: 'gold', name: 'Yukon Gold', released: 1980, maturity: 'mid', market: 'Yellow specialty',
    blurb: 'Yellow flesh, sold by name at the best price on the list. Sets few tubers, so they run large and some go hollow.',
    tiPd: 140, matPd: 580, set: 6, bulk: 1.0, blightLeaf: 0.87, blightTuber: 0.8, scab: 1.32, hollow: 0.12, green: 1.0, rough: 0.9,
    drought: 0.4, virus: 1.0, dormancy: 110, price: 16.2, chefBonus: false, contract: false, skin: 0xd8b565, flesh: 0xf2d98a, shape: 1.1,
  },
  {
    id: 'caribou', name: 'Caribou Russet', released: 2015, maturity: 'late', market: 'Russet bakers and fry stock',
    blurb: 'A newer russet that finishes in a short season, with high yield, smooth tubers and little scab. It will not keep far past January.',
    tiPd: 150, matPd: 700, set: 8, bulk: 1.03, blightLeaf: 1.0, blightTuber: 1.0, scab: 0.6, hollow: 0.03, green: 0.8, rough: 0.9,
    drought: 0.4, virus: 1.0, dormancy: 80, price: 14, chefBonus: true, contract: false, skin: 0xa9825a, flesh: 0xf6f0dc, shape: 1.6,
  },
]

export function variety(id: VarietyId): Variety {
  const v = VARIETIES.find(x => x.id === id)
  if (!v) throw new Error(`unknown variety ${id}`)
  return v
}

export function availableVarieties(year: number): Variety[] {
  return VARIETIES.filter(v => v.released <= year)
}
