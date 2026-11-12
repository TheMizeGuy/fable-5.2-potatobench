// Keeping a crop against selling it now, said with how sure it is. The cellar outlook (S.storeOutlook) follows the
// usual price curve; a winter's prices wander from it, so a gain inside that wander is no gain to count on.
import type * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// How far a month's price can wander from the usual curve, as a share, for a month this many ahead: about a tenth a
// month out and up to a fifth over a winter (tests/store-band.test.ts holds it to nine months in ten).
export function priceBand(ahead: number): number {
  return Math.min(0.2, 0.05 + 0.06 * Math.sqrt(Math.max(1, ahead)))
}

// Whether keeping a lot is the way that brings most: only when the best month ahead beats selling today by more than
// prices wander. The line says the month, the usual figure, how far off it can be, and so whether to count on it.
export function storeCall(o: { now: number; months: S.StoreMonth[]; best: S.StoreMonth | null }): { store: boolean; phrase: string } {
  const b = o.best
  if (!b) return { store: false, phrase: 'there is no month left to keep it to' }
  const spread = Math.round((b.net * priceBand(o.months.indexOf(b) + 1)) / 10) * 10
  const d = b.net - o.now
  if (d < 0.5) return { store: false, phrase: `after the cellar's charge and shrink no month usually pays more than today; ${b.name}, the best, about ${F.money(b.net)}` }
  const sure = d > spread
  return {
    store: sure,
    phrase: `kept to ${b.name}, usually about ${F.money(b.net)} after the cellar's charge and shrink, give or take ${F.money(spread)}: ${F.money(d)} more than today${sure ? '' : ', inside what prices wander in that time, so not a gain to count on'}${b.sprouted ? ', though sprouted' : ''}`,
  }
}
