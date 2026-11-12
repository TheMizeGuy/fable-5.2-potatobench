// Keeping a crop against selling it now, said with how sure it is. The cellar outlook (S.storeOutlook) follows the
// usual price curve; a winter's prices wander from it, so a gain inside that wander is no gain to count on.
import type * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// How far what a kept lot comes to can stray from the outlook, as a share, for a month this many ahead: about 7% a
// month out, growing with the square root of the months (tests/store-band.test.ts holds it to nine months in ten).
export function priceBand(ahead: number): number {
  return Math.min(0.2, 0.068 * Math.sqrt(Math.max(1, ahead)))
}

// Whether keeping a lot is the way that brings most: only when the best month ahead beats selling today by more than
// prices wander. The line says the month, the usual figure, how far off it can be, and so whether to count on it.
export function storeCall(o: { now: number; months: S.StoreMonth[]; best: S.StoreMonth | null }): { store: boolean; phrase: string } {
  const b = o.best
  if (!b) return { store: false, phrase: 'there are no months left to store it' }
  const spread = Math.round((b.net * priceBand(o.months.indexOf(b) + 1)) / 10) * 10
  const d = b.net - o.now
  if (d < 0.5) return { store: false, phrase: `after storage costs and shrinkage, no month usually pays more than today, and the best is ${b.name} at about ${F.money(b.net)}` }
  const sure = d > spread
  return {
    store: sure,
    phrase: `stored until ${b.name} it usually brings about ${F.money(b.net)} after storage costs and shrinkage, give or take ${F.money(spread)}. That's ${F.money(d)} more than today${sure ? '' : ', but prices can swing that much by then, so don\'t count on it'}${b.sprouted ? ', even though it will have sprouted' : ''}`,
  }
}
