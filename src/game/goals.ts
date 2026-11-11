// The ladder: what a new farm reaches for next. Worked out from the farm as it stands, so nothing extra is saved.
import { PARCELS, type Campaign } from '../sim/index.ts'

export interface Goal {
  id: string
  title: string
  how: string          // one line on how to get there
  done: boolean
}

export function goals(c: Campaign): Goal[] {
  const years = c.history
  const past = (f: (y: Campaign['history'][number]) => boolean) => years.some(f)
  const fields = c.season?.fields ?? []
  const planted = fields.some(f => f.plantDay >= 0) || years.length > 0
  const dug = c.lots.length > 0 || years.length > 0
  // Land beyond what the farm began with: the home fields and its own two tracts do not count.
  const more = c.fields.some((f, i) => PARCELS[i].block !== 'home' && f.tenure !== 'none') || past(y => y.rent > 0 || y.land > 0)
  const hired = c.crew.length > 1 || past(y => y.wages > 0)
  const signed = c.contracts.length > 0 || past(y => y.contracts > 0)
  const tooled = Object.values(c.upgrades).some(Boolean)
  return [
    { id: 'plant', title: 'Plant your first field', how: 'Click the badge on a field when the ground has warmed.', done: planted },
    { id: 'dig', title: 'Bring in a crop', how: 'Kill the vines in September, let the skins set, then dig.', done: dug },
    { id: 'year', title: 'Pay the bank and see the spring', how: 'Sell or store the crop and get through the winter.', done: years.length > 0 && c.outcome !== 'lost' },
    { id: 'tool', title: 'Buy a piece of equipment', how: 'In spring, when there is cash to spare.', done: tooled },
    { id: 'contract', title: 'Sign a contract', how: 'Buyers make offers each spring. A contract fixes the price, and you must fill it.', done: signed },
    { id: 'hire', title: 'Hire some help', how: 'More hands get more done in the weeks that matter.', done: hired },
    { id: 'land', title: 'Farm more land', how: 'Rent or buy a field beyond the home six.', done: more },
    { id: 'five', title: 'Keep the farm five seasons', how: 'The bank lets go of the note.', done: c.outcome === 'kept' },
  ]
}

// The first goal not yet reached, or null when the ladder is climbed.
export function nextGoal(c: Campaign): Goal | null {
  return goals(c).find(g => !g.done) ?? null
}
