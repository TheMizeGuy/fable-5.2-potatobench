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
// The one rule for the weigh ticket: store only when the best month's usual figure beats selling today by more than
// prices can swing by then. The tab goes on the way the rule favours, and its words say why: "Brings most" when that
// way brings the most even with the swing, "Surer" when storing brings more only on average. The store line never
// says it brings more than the way the tab is on.
export function storeCall(o: { now: number; months: S.StoreMonth[]; best: S.StoreMonth | null }): { store: boolean; tab: string; phrase: string } {
  const b = o.best
  if (!b) return { store: false, tab: 'Brings most', phrase: 'there are no months left to store it' }
  const spread = Math.round((b.net * priceBand(o.months.indexOf(b) + 1)) / 10) * 10
  const d = b.net - o.now
  if (d < 0.5) return { store: false, tab: 'Brings most', phrase: `after storage costs and shrinkage, no month usually pays more than today (the best is ${b.name}, at about ${F.money(b.net)})` }
  if (d > spread) {
    return { store: true, tab: 'Brings most', phrase: `stored until ${b.name} it usually brings about ${F.money(b.net)} after storage costs and shrinkage, ${F.money(d)} more than selling today${b.sprouted ? ', even after it sprouts' : ''}, and prices rarely swing more than ${F.money(spread)} by then` }
  }
  return {
    store: false, tab: 'Surer',
    phrase: `stored until ${b.name} it usually brings about ${F.money(b.net)} after storage costs and shrinkage, but prices can swing ${F.money(spread)} either way by then, so it could as easily bring less than selling today`,
  }
}
