// The buyers who offer contracts each spring. Offers come from hashing the campaign seed and the year, so they
// are the same however the game got there and draw nothing from the game's random stream.
import * as P from './params.ts'
import { hashUnit } from './rng.ts'
import type { Due, Offer, VarietyId } from './types.ts'
import { variety } from './varieties.ts'

interface Buyer { name: string; wants: VarietyId[]; standard: boolean }

// standard: the buyer always wants the first variety on its list that has been released.
export const BUYERS: Buyer[] = [
  { name: 'The chip plant', wants: ['atlantic', 'kennebec', 'superior'], standard: true },
  { name: 'The fry plant', wants: ['burbank', 'caribou', 'kennebec'], standard: false },
  { name: 'The packer', wants: ['katahdin', 'superior', 'norland', 'gold', 'kennebec'], standard: false },
  { name: 'The seed house', wants: ['katahdin', 'superior', 'norland', 'kennebec', 'gold', 'caribou', 'burbank', 'atlantic'], standard: false },
]

export const DUE_LABEL: Record<Due, string> = {
  harvest: 'off the field by the close of the season',
  winter: 'from storage by the end of February',
}

// This spring's offers: three different buyers, each with a variety out that year, a quantity of about one or two
// fields' US No. 1, and a fixed price around the variety's average-year price, higher for winter delivery.
export function contractOffers(seed: number, year: number): Offer[] {
  const left = BUYERS.map((_, i) => i)
  const out: Offer[] = []
  for (let k = 0; k < P.CONTRACT_OFFERS && left.length > 0; k++) {
    const u = (salt: number) => hashUnit(seed, year, 4211 + k, salt)
    const b = BUYERS[left.splice(Math.floor(u(1) * left.length), 1)[0]]
    const avail = b.wants.filter(id => variety(id).released <= year)
    if (!avail.length) continue
    const id = b.standard ? avail[0] : avail[Math.floor(u(2) * avail.length)]
    const due: Due = u(3) < 0.5 ? 'harvest' : 'winter'
    const [lo, hi] = P.CONTRACT_PRICE[due]
    const price = Math.round(variety(id).price * (lo + (hi - lo) * u(4)) * 20) / 20
    const cwt = Math.round((P.CONTRACT_CWT_MIN + (P.CONTRACT_CWT_MAX - P.CONTRACT_CWT_MIN) * u(5)) / 50) * 50
    out.push({ id: year * 10 + k + 1, buyer: b.name, variety: id, cwt, price, due })
  }
  return out
}
