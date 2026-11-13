// Words on the weigh ticket that are worked out from the farm, kept apart from the drawing so tests can read them.
import type * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// A ticket's place among its year's tickets, in the order they were cut: the second half of its number. (A lot's own
// id runs on from year to year and follows the digging, not the weighing.)
export function ticketPlace(c: S.Campaign, lot: S.Lot): number {
  const year = lot.year || c.year
  const cut = c.season && c.season.year === year ? c.season.log.filter(e => e.type === 'weighed').map(e => Number(e.data?.lot)) : []
  const k = cut.indexOf(lot.id)
  return Math.max(1, k >= 0 ? k + 1 : cut.length ? cut.length + 1 : c.lots.filter(l => (l.year || c.year) === year && l.id <= lot.id).length)
}

// What the yield looked like before the harvest, and from what. Test digs are often your crew's (the routine digs
// them), so the line names the digs, not who ordered them.
export function expectedFrom(digs: number): string {
  return digs ? `${F.upper(F.plural(digs, 'test dig'))} pointed to` : 'By eye it looked like'
}
