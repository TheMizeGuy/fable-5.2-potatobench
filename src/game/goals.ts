// The ladder: what a farm reaches for next, in the order a player can reach it. Worked out from the farm as it stands,
// so nothing extra is saved.
import { BUILDING_KINDS, forecast, FELL_DAYS, FIELD_COUNT, formatDay, goalCosts, isField, killOutlook, NOTE_PAYMENT, PARCELS, plantWordGiven, ROCKS_ADVISE, sprayWayNow, standingBy, TRACTS, type Campaign, type World, type GoalCost, type JobKind } from '../sim/index.ts'

export interface Goal {
  id: string
  title: string                                  // a few words, for the line under the date
  why: string                                    // what it teaches or brings, in a line
  how: string                                    // the same line, under the name the year-end sheet reads
  done: boolean
  now: boolean                                   // it can be worked on in this part of the year
  when: string                                   // when it can, for the list when it cannot now
  progress: { n: number; of: number } | null
  long: boolean                                  // one of the long goals at the top of the ladder
  cost: number                                   // the cash the step takes (0: none)
  block: string                                  // why the farm cannot take the step now ('' when it can)
  short: number                                  // how much more cash than the farm has the step takes (0: it can pay)
}

type Price = { cost: number; block: string }
type Spec = Omit<Goal, 'done' | 'now' | 'progress' | 'long' | 'how' | 'cost' | 'block' | 'short'> & { done: boolean; now: boolean; progress?: { n: number; of: number } | null; long?: boolean; price?: Price }

// What a step that spends money costs and whether the farm can take it now, from the simulation (src/sim/outlook.ts):
// of several (a machine, a building) the cheapest it can take, or else the cheapest it cannot, with the reason.
function prices(c: Campaign): Record<string, Price> {
  const all = goalCosts(c)
  const one = (id: string): Price => { const g = all.find(x => x.id === id); return g ? { cost: g.cost, block: g.can ? '' : g.why } : { cost: 0, block: '' } }
  const cheapest = (list: GoalCost[]): Price => {
    const by = (a: GoalCost, b: GoalCost) => a.cost - b.cost
    const can = list.filter(g => g.can).sort(by)[0]
    if (can) return { cost: can.cost, block: '' }
    const open = list.filter(g => !/already/i.test(g.why)).sort(by)[0]
    return open ? { cost: open.cost, block: open.why } : { cost: 0, block: '' }
  }
  // A machine is a goal only while buying it keeps the note's worth in hand: equipment comes out of cash, and a farm
  // left with less than that at the start of a season goes into its year end short.
  const tool = cheapest(all.filter(g => g.id.startsWith('buy:')))
  const left = c.cash - tool.cost
  const floor = !tool.block && tool.cost > 0 && left < NOTE_PAYMENT
    ? `That would leave ${money(left)}, less than the ${money(NOTE_PAYMENT)} yearly bank payment.` : ''
  return {
    stump: one('stump'), hire: one('hire'), foreman: one('foreman'), land: one('rent'),
    tool: floor ? { cost: tool.cost, block: floor } : tool, build: cheapest(all.filter(g => g.id.startsWith('build:'))),
  }
}

function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

export function goals(c: Campaign, o: { thisSeason?: boolean } = {}): Goal[] {
  // thisSeason: the crop steps of this season alone, as if no year were behind the farm.
  const past = !o.thisSeason && c.history.length > 0
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
  // A hand is a step only once the farm's work needs one: until then hiring is a choice, as the agent says in spring.
  const handNeeded = needsHand(c)
  // A foreman pays only where one hired hand can be spared from field work and there are fields away from home to
  // run: with fewer, the step is not on the ladder at all.
  const foremanPays = c.crew.filter(u => u.kind !== 'farmer').length >= 2 && c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none')
  const hasForeman = c.crew.some(u => u.foreman !== '')
  const tracts = TRACTS.map(i => ({ i, f: c.fields[i], held: c.fields[i].tenure !== 'none' }))
  const standingHeld = tracts.filter(t => t.held && (t.f.cover === 'woods' || t.f.cover === 'brush'))
  const felledMost = standingHeld.reduce((m, t) => Math.max(m, t.f.felled / FELL_DAYS[t.f.cover as 'woods' | 'brush']), 0)
  const building = c.buildings.find(b => !b.built)
  const kindsBuilt = new Set(c.buildings.filter(b => b.built).map(b => b.kind))
  const price = prices(c)

  // The first season, in the order the crop asks for it. A later step done means every earlier one is behind the farm.
  const season: Spec[] = [
    { id: 'plant', title: 'Plant the fields', why: 'Planting can start once the soil has warmed up. Your crew then waits for you, so order Plant on one field and they\'ll plant the rest.', when: 'During the season',
      done: past || (potato.length > 0 && planted.length === potato.length) || any(f => f.tiDay >= 0), now: crop,
      progress: potato.length ? { n: planted.length, of: potato.length } : null },
    { id: 'walk', title: 'Walk a field for blight', why: 'Blight only shows up close, so walking a field catches it while it\'s still small.', when: 'Once the rows are up',
      done: past || any(f => f.lastScout >= 0), now: crop },
    { id: 'hill', title: 'Hill the rows', why: 'Hilling (piling soil over the rows) protects the potatoes from sunlight and blight.', when: 'Once the plants are a hand tall',
      done: past || any(f => f.hillPasses > 0), now: crop,
      progress: planted.length ? { n: planted.filter(i => fields[i].hillPasses > 0).length, of: planted.length } : null },
    { id: 'spray', title: 'Spray before blight arrives', why: 'Spray only protects leaves it reaches before the blight does.', when: 'While the vines are green',
      done: past || any(f => f.lastSpray >= 0), now: crop },
    { id: 'sample', title: 'Do a test dig', why: 'Digging up one plant shows how the potatoes are coming along.', when: 'Once potatoes have formed',
      done: past || any(f => f.samples.length > 0), now: crop },
    { id: 'kill', title: 'Kill the vines', why: 'This stops the growth, and the skins toughen over about two weeks.', when: 'In September',
      done: past || any(f => f.killDay >= 0 || f.deadDay >= 0), now: crop },
    { id: 'dig', title: 'Dig a field', why: 'The digger lifts the potatoes out of the ground and into barrels.', when: 'Once the skins toughen',
      done: past || any(f => f.status === 'digging' || f.status === 'dug'), now: crop },
    { id: 'haul', title: 'Bring the crop in', why: 'Potatoes wait in barrels until they\'re hauled in, and a hard frost will ruin some of them. Each field is weighed once everything is in.', when: 'After digging',
      done: past || any(f => f.weighed), now: crop },
    { id: 'sell', title: 'Sell some potatoes', why: 'Sell straight from the field now, or store them and sell over the winter.', when: 'After the weigh-in',
      done: o.thisSeason ? c.lots.some(l => l.year === c.year && l.sold > 0) : c.lots.some(l => l.sold > 0) || c.history.some(y => y.cwtSold > 0), now: c.phase === 'season' || c.phase === 'cellar' },
    { id: 'year', title: 'Get through the year', why: 'Make your yearly bank payment at the end of the year, and spring comes around again.', when: 'At the end of the year',
      done: past && c.outcome !== 'lost', now: true },
  ]

  // The farmstead, opening up from the second spring.
  // The clearing steps are about the farm's own tracts: one it does not hold is no step of its, felled or not.
  const cleared = tracts.filter(t => t.f.cover === 'open')
  const mine = tracts.filter(t => t.held)
  const clearedMine = mine.filter(t => t.f.cover === 'open')
  const noTract = mine.length === 0
  const clearing: Spec[] = [
    // Felling waits until the crop is in the ground: in a season it is the work of the quiet weeks.
    { id: 'fell', title: 'Fell a woodlot', why: 'Cutting the woods down is the first step to a new field. The logs go to your yard, and the stumps and stones come out next.', when: noTract ? 'Once you own a woodlot, which you can buy in spring under Land' : 'Once the crop is planted, or over the winter',
      done: mine.some(t => t.f.cover === 'stumps' || t.f.cover === 'open'), now: !noTract && ((inSeason && planted.length === potato.length) || c.phase === 'cellar'),
      progress: felledMost > 0 ? { n: Math.round(felledMost * 100), of: 100 } : null },
    { id: 'stump', title: 'Pull the stumps', why: 'A contractor with a bulldozer pulls them for a fee.', when: 'In spring or during the season',
      done: clearedMine.length > 0, now: spring || inSeason, price: price.stump },
    { id: 'rocks', title: 'Pick rocks off new ground', why: 'Newly cleared land is full of rocks. Use Pick rocks on its card to have someone clear them so it can be planted, and the stones go to your yard for building.', when: 'During the season',
      done: clearedMine.some(t => t.f.stones < ROCKS_ADVISE), now: inSeason && clearedMine.length > 0 },
    { id: 'newfield', title: 'Farm the new ground', why: 'Grow oats and clover on it for a year, then plant potatoes in the fresh soil.', when: 'Starting next spring',
      done: clearedMine.some(t => !t.f.raw || (inSeason && fields[t.i] && fields[t.i].status !== 'off')), now: (spring || inSeason) && clearedMine.length > 0 },
  ]

  const ladder: Spec[] = [
    ...chain(season),
    { id: 'tool', title: 'Buy a machine', why: 'Equipment speeds up the jobs that matter most.', when: 'In spring',
      done: Object.values(c.upgrades).some(Boolean), now: spring, price: price.tool },
    ...(handNeeded || hired || c.history.some(y => y.wages > 0) ? [{ id: 'hire', title: 'Hire a hand', why: 'A second pair of hands helps you get through the work list.', when: 'In spring or during the season',
      done: hired || c.history.some(y => y.wages > 0), now: spring || inSeason, price: price.hire }] : []),
    { id: 'contract', title: 'Sign a contract', why: 'A buyer locks in a price, and you have to deliver the potatoes.', when: 'In spring',
      done: c.contracts.length > 0 || c.history.some(y => y.contracts > 0), now: spring },
    { id: 'land', title: 'Farm more land', why: 'Rent or buy fields beyond your six home fields.', when: 'In spring, under Land',
      done: c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none') || c.history.some(y => y.rent > 0 || y.land > 0), now: spring, price: price.land },
    ...chain(clearing),
    { id: 'build', title: 'Raise a building', why: 'Your crew builds it using your own logs and stone.', when: 'In spring, during the season or in winter',
      done: c.buildings.some(b => b.built), now: spring || inSeason || c.phase === 'cellar',
      progress: building ? { n: Math.round(building.done), of: building.need } : null, price: building ? undefined : price.build },
    ...(foremanPays || hasForeman ? [{ id: 'foreman', title: 'Name a foreman', why: 'A foreman orders the work on your fields away from home each morning, so nothing out there waits for you. They earn 40% more and stop doing field work.', when: 'Once you\'ve hired two people and farm fields away from home',
      done: hasForeman, now: foremanPays, price: price.foreman }] : []),
    { id: 'five', title: 'Keep the farm five years', why: 'Make it through five years and the farm is yours for good.', when: 'At the end of every year',
      done: c.outcome === 'kept', now: true, progress: { n: Math.min(c.goalYears, c.history.length), of: c.goalYears } },
    { id: 'cleared', title: 'Clear every tract', why: 'Turn every woodlot, swale and burnt hill into a field.', when: 'Any year', long: true,
      done: cleared.length === TRACTS.length, now: true, progress: { n: cleared.length, of: TRACTS.length } },
    { id: 'map', title: 'Farm the whole map', why: 'Own or rent every field and tract on the map.', when: 'Any spring', long: true,
      done: c.fields.every(f => f.tenure !== 'none'), now: true, progress: { n: c.fields.filter(f => f.tenure !== 'none').length, of: FIELD_COUNT } },
    { id: 'crew', title: 'Hire a crew of ten', why: 'Have ten people on your payroll, with a bed for each of them.', when: 'Any year', long: true,
      done: c.crew.length >= 10, now: true, progress: { n: Math.min(10, c.crew.length), of: 10 } },
    { id: 'every', title: 'Raise every kind of building', why: 'Build a potato house, shed, bunkhouse, packing shed, pond, stand, station and road.', when: 'Any year', long: true,
      done: kindsBuilt.size === BUILDING_KINDS.length, now: true, progress: { n: kindsBuilt.size, of: BUILDING_KINDS.length } },
  ]
  return ladder.map(({ price: p, ...g }) => {
    const cost = g.done || !p ? 0 : p.cost
    const block = g.done || !p ? '' : p.block
    // Money is the reason when the farm has less in hand than the step costs.
    const short = block && cost > Math.max(0, c.cash) ? Math.ceil(cost - Math.max(0, c.cash)) : 0
    return { ...g, how: g.why, progress: g.done ? null : g.progress ?? null, long: !!g.long, cost, block, short }
  })
}

// A step further on means every step before it in the same run is behind the farm too.
function chain(steps: Spec[]): Spec[] {
  for (let k = steps.length - 2; k >= 0; k--) if (steps[k + 1].done) steps[k].done = true
  return steps
}

// The goal to show: the first not yet reached that the farm can take. When that waits for another part of the year, the
// first step that can be taken now comes forward in its place; the long goals and the five years never jump the queue.
// A step the farm cannot pay for or cannot take now (no bed free, nobody hired) is passed over; the ladder says why.
// At the year end it is the coming spring's goal, so the one the book shows is the one the spring opens on.
export function nextGoal(c: Campaign): Goal | null {
  if (c.phase === 'ledger' && c.outcome === '') return nextGoal({ ...c, phase: 'plan' })
  const all = goals(c).filter(g => !g.done)
  const open = all.filter(g => !(g.now && g.block))
  const first = open[0] ?? all[0]
  if (!first || first.now) return first ?? null
  return open.find(g => g.now && !g.long && g.id !== 'five') ?? first
}

// How many fields of potatoes one person farms alone, as the first year's plan has it.
export const ALONE_FIELDS = 4

// Whether the farm's work needs a hired hand: more potato fields than one person plants and digs, or fields away
// from home. With less, the farmer can farm alone, and hiring is not asked for.
export function needsHand(c: Campaign): boolean {
  let potato = 0
  for (let i = 0; i < FIELD_COUNT; i++) if (c.fields[i].tenure !== 'none' && isField(c, i) && c.plans[i]?.crop === 'potato') potato++
  return potato > ALONE_FIELDS || c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none')
}

// While the season's next step is the crew's own work (planting after the word, walking, hilling, digging), the slip
// says what the player is waiting for in the player's terms: the progress of the planting they ordered, or their next
// decision and when it comes. Never a job that is not theirs. Null when the next step is the player's own to take.
// What the forecast says about blight, for the line under a spray decision: the day it comes, or that none is in sight.
function blightAhead(world: World | undefined, c: Campaign): string {
  if (!world) return 'when blight weather is forecast'
  const k = forecast(world, c, 6).findIndex(d => d.blight >= 2)
  return k < 0 ? 'no blight weather in the forecast' : `blight weather ${k === 0 ? 'today' : k === 1 ? 'tomorrow' : `in ${k} days`}`
}

export function waitingFor(c: Campaign, world?: World): { title: string; when: string } | null {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return null
  const potato: number[] = []
  for (let i = 0; i < FIELD_COUNT; i++) if (isField(c, i) && s.fields[i].status !== 'off' && s.fields[i].status !== 'rest') potato.push(i)
  if (!potato.length) return null
  const crew = (kind: JobKind) => potato.every(i => !!standingBy(c, kind, i))
  const planted = potato.filter(i => s.fields[i].plantDay >= 0).length
  if (planted < potato.length) {
    if (!crew('plant') || !plantWordGiven(s)) return null
    return { title: `Planting: ${planted} of ${potato.length} ${potato.length === 1 ? 'field' : 'fields'}`, when: 'your crew plants the rest on its own' }
  }
  if (!crew('hill') || !crew('scout')) return null
  const up = potato.filter(i => { const f = s.fields[i]; return (f.status === 'planted' || f.status === 'growing') && f.deadDay < 0 })
  const kills = up.map(i => ({ i, k: killOutlook(c, i), listed: s.jobs.some(j => j.kind === 'kill' && j.field === i) }))
  const due = kills.map(x => x.k).filter((k): k is NonNullable<typeof k> => !!k).sort((a, b) => a.day - b.day)[0]
  // While the spraying is the player's (not left to the crew), a spray is their next decision until the vine kill
  // comes near: before the first one it comes with the first blight weather, after it with each new forecast of it.
  if (up.length && !crew('spray') && sprayWayNow(c) !== 'none' && !(due && due.day - s.day <= KILL_NEAR)) {
    if (!s.fields.some(f => f.lastSpray >= 0)) return { title: 'Nothing to do until blight weather', when: 'your crew tends the fields on its own' }
    return { title: 'Your next decision is a spray', when: blightAhead(world, c) }
  }
  if (up.length && !crew('kill')) {
    // Due and not yet ordered: the decision is the player's now, and the goal or the stamp says so.
    if (kills.some(x => x.k?.asked && !x.listed)) return null
    // Ordered, and the vines not yet down: how far along it is, as the planting was.
    if (kills.some(x => x.listed)) {
      const dead = potato.filter(i => s.fields[i].killDay >= 0 || s.fields[i].deadDay >= 0).length
      return { title: `Killing the vines: ${dead} of ${potato.length} ${potato.length === 1 ? 'field' : 'fields'}`, when: 'on the work list' }
    }
    return { title: 'Your next decision is killing the vines', when: due ? `due around ${formatDay(c.year, due.day, true)}` : 'in September' }
  }
  if (!crew('dig') || !crew('haul')) return null
  if (potato.some(i => !s.fields[i].weighed && s.fields[i].status !== 'lost')) return { title: 'Nothing to do until the weigh ticket', when: up.length ? 'your crew kills the vines and digs on its own' : 'your crew digs and hauls on its own' }
  return null
}

// How near the vine kill is, in days, before it is the player's next decision ahead of another spray.
const KILL_NEAR = 14

const CROP = new Set(['plant', 'walk', 'hill', 'spray', 'sample', 'kill', 'dig', 'haul'])

// In a season after the first, the crop's own next step this season: said ahead of a farmstead goal (fell a woodlot),
// which waits in the line under it. Null outside a season, or once the crop is in.
export function seasonStep(c: Campaign): Goal | null {
  if (c.phase !== 'season' || !c.season || c.season.frozen) return null
  return goals(c, { thisSeason: true }).find(g => CROP.has(g.id) && !g.done) ?? null
}
