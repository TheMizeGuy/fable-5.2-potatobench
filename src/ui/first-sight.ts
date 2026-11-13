// The varieties a first spring's field record offers, kept apart from the drawing so tests can read them.
import type * as S from '../sim/index.ts'

const MATURES: Record<S.Variety['maturity'], number> = { early: 0, mid: 1, late: 2, 'very late': 3 }

// What a first spring's field record offers: the varieties in the ground, and beside them two that answer the two
// questions a first grower meets, the one that best resists blight on its leaves and the earliest to dig (the better
// paid of the earliest). The contract-only variety waits for the comparison. From the second spring all show.
export function firstSight(vs: S.Variety[], planted: S.VarietyId[]): S.Variety[] {
  const pick = new Set<S.VarietyId>(planted)
  const free = () => vs.filter(v => !v.contract && !pick.has(v.id))
  const safest = free().sort((a, b) => a.blightLeaf - b.blightLeaf)[0]
  if (safest) pick.add(safest.id)
  const early = free().sort((a, b) => MATURES[a.maturity] - MATURES[b.maturity] || b.price - a.price)[0]
  if (early) pick.add(early.id)
  return vs.filter(v => pick.has(v.id))
}

