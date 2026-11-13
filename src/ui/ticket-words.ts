// Words on the weigh ticket that are worked out from the farm, kept apart from the drawing so tests can read them.
import * as F from './fmt.ts'

// What the yield looked like before the harvest, and from what. Test digs are often your crew's (the routine digs
// them), so the line names the digs, not who ordered them.
export function expectedFrom(digs: number): string {
  return digs ? `${F.upper(F.plural(digs, 'test dig'))} pointed to` : 'By eye it looked like'
}
