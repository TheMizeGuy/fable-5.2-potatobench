// The ladder: what a farm reaches for next, in the order a player can reach it. Worked out from the farm as it stands,
// so nothing extra is saved.
import { BUILDING_KINDS, FELL_DAYS, FIELD_COUNT, isField, PARCELS, ROCKS_ADVISE, TRACTS, type Campaign } from '../sim/index.ts'

export interface Goal {
  id: string
  title: string                                  // a few words, for the line under the date
  why: string                                    // what it teaches or brings, in a line
  done: boolean
  now: boolean                                   // it can be worked on in this part of the year
  when: string                                   // when it can, for the list when it cannot now
  progress: { n: number; of: number } | null
  long: boolean                                  // one of the long goals at the top of the ladder
}

type Spec = Omit<Goal, 'done' | 'now' | 'progress' | 'long'> & { done: boolean; now: boolean; progress?: { n: number; of: number } | null; long?: boolean }

export function goals(c: Campaign): Goal[] {
  const past = c.history.length > 0
  const s = c.season
  const inSeason = c.phase === 'season' && !!s && !s.frozen
  const spring = c.phase === 'plan'
  const crop = spring || inSeason
  const fields = s && (c.phase === 'season' || c.phase === 'cellar' || c.phase === 'ledger') ? s.fields : []
  const potato: number[] = []
  for (let i = 0; i < FIELD_COUNT; i++) if (fields[i] && isField(c, i) && fields[i].status !== 'off' && fields[i].status !== 'rest') potato.push(i)
  const planted = potato.filter(i => fields[i].plantDay >= 0)
  const any = (f: (x: NonNullable<Campaign['season']>['fields'][number]) => boolean) => fields.some(f)
  const hired = c.crew.some(u => u.kind !== 'farmer')
  const tracts = TRACTS.map(i => ({ i, f: c.fields[i], held: c.fields[i].tenure !== 'none' }))
  const standingHeld = tracts.filter(t => t.held && (t.f.cover === 'woods' || t.f.cover === 'brush'))
  const felledMost = standingHeld.reduce((m, t) => Math.max(m, t.f.felled / FELL_DAYS[t.f.cover as 'woods' | 'brush']), 0)
  const building = c.buildings.find(b => !b.built)
  const kindsBuilt = new Set(c.buildings.filter(b => b.built).map(b => b.kind))

  // The first season, in the order the crop asks for it. A later step done means every earlier one is behind the farm.
  const season: Spec[] = [
    { id: 'plant', title: 'Plant the fields', why: 'Seed goes in once the soil has warmed.', when: 'In the season',
      done: past || (potato.length > 0 && planted.length === potato.length) || any(f => f.tiDay >= 0), now: crop,
      progress: potato.length ? { n: planted.length, of: potato.length } : null },
    { id: 'walk', title: 'Walk a field for blight', why: 'Blight shows only up close. A walk finds it while it is small.', when: 'Once the rows are up',
      done: past || any(f => f.lastScout >= 0), now: crop },
    { id: 'hill', title: 'Hill the rows', why: 'Soil pulled over the row keeps the tubers from light and blight.', when: 'Once the plants are a hand high',
      done: past || any(f => f.hillPasses > 0), now: crop,
      progress: planted.length ? { n: planted.filter(i => fields[i].hillPasses > 0).length, of: planted.length } : null },
    { id: 'spray', title: 'Spray before the blight', why: 'Protectant has to be on the leaf before the spores land.', when: 'While the vines are green',
      done: past || any(f => f.lastSpray >= 0), now: crop },
    { id: 'sample', title: 'Lift a test hill', why: 'One hill dug shows what the crop is making.', when: 'Once tubers have set',
      done: past || any(f => f.samples.length > 0), now: crop },
    { id: 'kill', title: 'Kill the vines', why: 'Growth stops and the skins set in two weeks.', when: 'In September',
      done: past || any(f => f.killDay >= 0 || f.deadDay >= 0), now: crop },
    { id: 'dig', title: 'Dig a field', why: 'The digger lifts the crop into barrels in the field.', when: 'Once the skins are set',
      done: past || any(f => f.status === 'digging' || f.status === 'dug'), now: crop },
    { id: 'haul', title: 'Bring the crop in', why: 'The crop waits in barrels until it is hauled; a hard frost takes a share. It is weighed once all is in.', when: 'After the dig',
      done: past || any(f => f.weighed), now: crop },
    { id: 'sell', title: 'Sell some potatoes', why: 'Sell off the field now, or store and sell into the winter.', when: 'After the weigh-in',
      done: c.lots.some(l => l.sold > 0) || c.history.some(y => y.cwtSold > 0), now: c.phase === 'season' || c.phase === 'cellar' },
    { id: 'year', title: 'Get through the year', why: 'The bank takes its note at the year end, and spring comes again.', when: 'At the year end',
      done: past && c.outcome !== 'lost', now: true },
  ]

  // The farmstead, opening up from the second spring.
  const cleared = tracts.filter(t => t.f.cover === 'open')
  const clearing: Spec[] = [
    { id: 'fell', title: 'Fell a woodlot', why: 'Woods become a field: logs to the yard now, stumps and stone next.', when: 'In the season or over the winter',
      done: tracts.some(t => t.f.cover === 'stumps' || t.f.cover === 'open'), now: inSeason || c.phase === 'cellar',
      progress: felledMost > 0 ? { n: Math.round(felledMost * 100), of: 100 } : null },
    { id: 'stump', title: 'Pull the stumps', why: 'A contractor with a bulldozer, for a fee.', when: 'In spring or the season',
      done: cleared.length > 0, now: spring || inSeason },
    { id: 'rocks', title: 'Pick the new ground', why: 'New ground is stony. The stones come to the yard for building.', when: 'In the season',
      done: cleared.some(t => t.f.stones < ROCKS_ADVISE), now: inSeason },
    { id: 'newfield', title: 'Crop the new ground', why: 'A year in oats and clover, then potatoes on fresh soil.', when: 'From the next spring',
      done: cleared.some(t => !t.f.raw || (inSeason && fields[t.i] && fields[t.i].status !== 'off')), now: spring || inSeason },
  ]

  const ladder: Spec[] = [
    ...chain(season),
    { id: 'tool', title: 'Buy a machine', why: 'Equipment makes the jobs that matter go faster.', when: 'In spring',
      done: Object.values(c.upgrades).some(Boolean), now: spring },
    { id: 'hire', title: 'Hire a hand', why: 'A second pair of hands works the list beside you.', when: 'In spring or the season',
      done: hired || c.history.some(y => y.wages > 0), now: spring || inSeason },
    { id: 'contract', title: 'Sign a contract', why: 'A buyer fixes the price, and you must fill it.', when: 'In spring',
      done: c.contracts.length > 0 || c.history.some(y => y.contracts > 0), now: spring },
    { id: 'land', title: 'Farm more land', why: 'Rent or buy beyond the home six.', when: 'In spring',
      done: c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none') || c.history.some(y => y.rent > 0 || y.land > 0), now: spring },
    ...chain(clearing),
    { id: 'build', title: 'Raise a building', why: 'Your own people build it, from your own logs and stone.', when: 'In spring, the season or winter',
      done: c.buildings.some(b => b.built), now: spring || inSeason || c.phase === 'cellar',
      progress: building ? { n: Math.round(building.done), of: building.need } : null },
    { id: 'foreman', title: 'Name a foreman', why: 'A foreman orders what a block needs, every working morning.', when: 'With someone hired',
      done: c.crew.some(u => u.foreman !== ''), now: hired },
    { id: 'five', title: 'Keep the farm five years', why: 'The bank lets go of the note.', when: 'Every year end',
      done: c.outcome === 'kept', now: true, progress: { n: Math.min(c.goalYears, c.history.length), of: c.goalYears } },
    { id: 'cleared', title: 'Clear every tract', why: 'Every woodlot, swale and burnt hill a field.', when: 'Any year', long: true,
      done: cleared.length === TRACTS.length, now: true, progress: { n: cleared.length, of: TRACTS.length } },
    { id: 'map', title: 'Hold the whole map', why: 'Every field and tract the farm\'s own or rented.', when: 'Any spring', long: true,
      done: c.fields.every(f => f.tenure !== 'none'), now: true, progress: { n: c.fields.filter(f => f.tenure !== 'none').length, of: FIELD_COUNT } },
    { id: 'crew', title: 'A crew of ten', why: 'Ten people on the books, and beds for them.', when: 'Any year', long: true,
      done: c.crew.length >= 10, now: true, progress: { n: Math.min(10, c.crew.length), of: 10 } },
    { id: 'every', title: 'Every kind of building', why: 'A potato house, shed, bunkhouse, packing shed, pond, stand, station and road.', when: 'Any year', long: true,
      done: kindsBuilt.size === BUILDING_KINDS.length, now: true, progress: { n: kindsBuilt.size, of: BUILDING_KINDS.length } },
  ]
  return ladder.map(g => ({ ...g, progress: g.done ? null : g.progress ?? null, long: !!g.long }))
}

// A step further on means every step before it in the same run is behind the farm too.
function chain(steps: Spec[]): Spec[] {
  for (let k = steps.length - 2; k >= 0; k--) if (steps[k + 1].done) steps[k].done = true
  return steps
}

// The goal to show: the first not yet reached. When that waits for another part of the year, the first step that can be
// taken now comes forward in its place; the long goals and the five years never jump the queue.
export function nextGoal(c: Campaign): Goal | null {
  const all = goals(c).filter(g => !g.done)
  const first = all[0]
  if (!first || first.now) return first ?? null
  return all.find(g => g.now && !g.long && g.id !== 'five') ?? first
}
