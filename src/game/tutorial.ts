// The guided first year: the county agent's notes, one thing at a time, each the first time its moment comes. Every
// lesson starts and ends on what the farm and the app show, never on a page being looked at, and nothing here is
// written into the campaign. Progress lives in its own storage key. docs/TUTORIAL.md has the list and the reasons.
import * as S from '../sim/index.ts'

export type Input = 'mouse' | 'touch' | 'keys'
export type Part = 'opening' | 'year' | 'spring'

// What a lesson reads: the app's state, the advice for each field, the paper on top ('' for none) and every paper open.
export interface Look {
  c: S.Campaign | null
  world: S.World
  screen: 'title' | S.Phase
  selection: number[]
  unit: number
  yard: number
  speed: number
  needs: (S.Advice | null)[]
  paper: string
  papers: string[]
  input: Input
}

// Where a lesson points: a control by its test id (the first of several that is on screen), a field's tag, a field's
// need stamp, a person on the land.
export type Point = { testid: string[] } | { field: number } | { badge: number } | { unit: number }

// When a lesson was first shown: the year and day (or cellar month), and the question then open.
export interface Since { y: number; d: number; m: number; inc: number }

export interface Progress {
  v: 1
  offered: boolean
  // The seed of the farm the offer is for, until it is answered.
  offerSeed: number | null
  mode: 'unset' | 'on' | 'off'
  passed: Record<string, 'done' | 'skip'>
  replay: string[]
  facts: string[]
  since: Record<string, Since>
}

export interface Lesson {
  id: string
  part: Part
  name: string
  // Its moment is here.
  when(l: Look, g: Guide): boolean
  // The farm shows it done: checked always, so a lesson the player is already past is passed over.
  done(l: Look, g: Guide, since: Since | undefined): boolean
  ask(l: Look): string
  why(l: Look): string
  point?(l: Look): Point | null
  // Nothing to do but read: it carries a button to put it away.
  read?: boolean
  // Comes ahead of everything else: a question the clock stopped for.
  urgent?: boolean
  // An opening lesson tied to a moment (planting day), so it comes ahead of the opening's look round.
  moment?: boolean
  // Shown over this paper (its test id); any other paper puts the lessons away until it closes.
  paper?: string
  // The facts it is done by, forgotten when it is replayed so that doing it again is what passes it.
  uses?: string[]
}

export const KEY = 'the-county/tutorial'

export interface Store { get(): string | null; set(text: string): void }

export function localStore(): Store | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage
    if (!ls) return null
    return { get: () => ls.getItem(KEY), set: t => ls.setItem(KEY, t) }
  } catch { return null }
}

function fresh(): Progress {
  return { v: 1, offered: false, offerSeed: null, mode: 'unset', passed: {}, replay: [], facts: [], since: {} }
}

// ---------------------------------------------------------------- reading the farm

const name = (i: number) => S.FIELD_NAMES[i] ?? 'the field'
const first = (n: string) => n.split(' ')[0]
const by = (l: Look, mouse: string, touch: string, keys: string) => l.input === 'touch' ? touch : l.input === 'keys' ? keys : mouse
const click = (l: Look) => (l.input === 'touch' ? 'Tap' : 'Click')
const inSeason = (l: Look) => l.screen === 'season' && !!l.c?.season && l.c.phase === 'season'
const fields = (l: Look) => l.c?.season?.fields ?? []
const anyField = (l: Look, f: (x: S.FieldSeason) => boolean) => fields(l).some(f)
const jobOn = (l: Look, kind: S.JobKind) => !!l.c?.season?.jobs.some(j => j.kind === kind)
const needFor = (l: Look, act: string) => l.needs.findIndex(a => a?.act === act)
// The number key that picks a field: the fields held and open to the plough, in order (src/ui/map.ts).
export function digitOf(c: S.Campaign, field: number): string {
  const list: number[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i) && S.isField(c, i)) list.push(i)
  const k = list.indexOf(field)
  return k < 0 || k > 9 ? '' : String((k + 1) % 10)
}
// The first field the farm holds that is in potatoes this year, else the first held field.
function potatoField(c: S.Campaign | null): number {
  if (!c) return 0
  for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i) && S.isField(c, i) && c.plans[i]?.crop === 'potato') return i
  for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i)) return i
  return 0
}
const farmer = (l: Look) => l.c?.crew[0]?.id ?? 0
const hand = (l: Look) => l.c?.crew.find(u => u.kind !== 'farmer') ?? null
const tract = (l: Look) => S.TRACTS.find(i => l.c && l.c.fields[i].tenure !== 'none' && (l.c.fields[i].cover === 'woods' || l.c.fields[i].cover === 'brush')) ?? -1

// A lesson that asks for the order a field's stamp gives, the first time reference practice calls for it.
function order(o: { id: string; act: S.JobKind; name: string; did: (l: Look) => boolean; ask: (l: Look, f: string) => string; why: string }): Lesson {
  return {
    id: o.id, part: 'year', name: o.name,
    when: l => inSeason(l) && needFor(l, o.act) >= 0,
    done: l => jobOn(l, o.act) || o.did(l),
    ask: l => o.ask(l, name(Math.max(0, needFor(l, o.act)))),
    why: () => o.why,
    point: l => { const i = needFor(l, o.act); return i >= 0 ? { badge: i } : null },
  }
}

// ---------------------------------------------------------------- the lessons, in the order a first year meets them

export const LESSONS: Lesson[] = [
  // The opening: the first spring, then the idle weeks before the soil is warm enough to plant.
  {
    id: 'begin', part: 'opening', name: 'Start the first season',
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length === 0,
    done: l => !!l.c && (l.c.phase !== 'plan' || l.c.history.length > 0),
    ask: l => by(l, 'The plan is already a sound one. Press Start the season.', 'The plan is already a sound one. Tap Start the season.', 'The plan is already a sound one. Enter starts the season.'),
    why: () => 'Seed, people and land can wait for next spring. This year is for learning the crop.',
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'look', part: 'opening', name: 'Look round the land', uses: ['pan', 'zoom'],
    when: inSeason,
    done: (_l, g) => g.has('pan') || g.has('zoom'),
    ask: l => by(l, 'Drag the land to look round. Roll the wheel to come closer.', 'Drag the land to look round. Pinch to come closer.', 'The arrow keys move you over the land.'),
    why: () => 'Nothing can be planted yet: the soil is cold. The clock is held while you look.',
  },
  {
    id: 'turn', part: 'opening', name: 'Turn and tip the view', uses: ['turn', 'tip'],
    when: inSeason,
    done: (_l, g) => g.has('turn') || g.has('tip'),
    ask: l => by(l, 'Hold the right button and drag: sideways turns the view, up and down tips it.', 'Twist two fingers on the land to turn the view.', 'Q and E turn the view. Page Up and Page Down tip it.'),
    why: l => by(l, 'Lost? Home, or a double-click on open ground, brings the whole farm back.', 'Lost? A double-tap on open ground brings the whole farm back.', 'Lost? Home brings the whole farm back.'),
  },
  {
    id: 'boards', part: 'opening', name: 'Read the boards', read: true,
    when: inSeason,
    done: (l, g, since) => g.has('noted:boards') || (!!since && !!l.c?.season && l.c.season.day >= since.d + 3),
    ask: () => 'Top left: today, and the weather five days ahead. The yellow slip under it is your next goal.',
    why: () => 'Top right is your money, on the bank\'s spring loan, and the clock.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'field', part: 'opening', name: 'Pick a field', uses: ['select'],
    when: inSeason,
    done: (_l, g) => g.has('select'),
    ask: l => {
      const i = potatoField(l.c)
      return l.input === 'keys' && l.c ? `Press ${digitOf(l.c, i) || '1'} to pick ${name(i)}.` : `${click(l)} the tag of ${name(i)} to pick that field.`
    },
    why: () => 'Its card opens with what the field is and the orders it can take now.',
    point: l => ({ field: potatoField(l.c) }),
  },
  {
    id: 'card', part: 'opening', name: 'Read a field\'s card', read: true,
    when: (l, g) => inSeason(l) && g.has('select') && l.selection.length > 0 && needFor(l, 'plant') < 0,
    done: (l, g, since) => g.has('noted:card') || (!!since && l.selection.length === 0) || jobOn(l, 'plant') || anyField(l, f => f.plantDay >= 0),
    ask: () => 'The card shows the orders this field can take. It says hold off planting: the soil is cold.',
    why: l => by(l, 'Seed in cold ground rots. Escape, or the cross, puts the card away.', 'Seed in cold ground rots. The cross puts the card away.', 'Seed in cold ground rots. Escape puts the card away.'),
    point: () => ({ testid: ['card'] }),
  },
  {
    id: 'person', part: 'opening', name: 'Meet your people', read: true, uses: ['unit'],
    when: inSeason,
    done: (l, g, since) => g.has('noted:person') || g.has('unit') || (!!since && !!l.c?.season && l.c.season.day >= since.d + 4),
    ask: () => 'This face is you. In the first year you do every job yourself.',
    why: () => 'Hands come later. Each face on the land shows where someone is and what they are doing.',
    point: l => ({ unit: farmer(l) }),
  },
  {
    id: 'clock', part: 'opening', name: 'Start the clock', uses: ['run'],
    when: inSeason,
    done: (_l, g) => g.has('run'),
    ask: l => by(l, 'Press 1× to start the days. Space stops them again.', 'Tap the play key to start the days.', 'Space starts the days, and stops them again.'),
    why: () => 'The clock was held for you. It stops by itself only for a question that needs an answer.',
    point: () => ({ testid: ['speed-1', 'speed-toggle', 'paused-go'] }),
  },
  {
    id: 'fast', part: 'opening', name: 'Hurry the quiet weeks', uses: ['fast'],
    when: (l, g) => inSeason(l) && g.has('run') && needFor(l, 'plant') < 0 && !anyField(l, f => f.plantDay >= 0),
    done: (l, g) => g.has('fast') || needFor(l, 'plant') >= 0 || anyField(l, f => f.plantDay >= 0) || jobOn(l, 'plant'),
    ask: l => by(l, 'Nothing to do until the soil warms. Press 3× to hurry the wait.', 'Nothing to do until the soil warms. Tap 3× to hurry the wait.', 'Nothing to do until the soil warms. F steps the clock up to 3×.'),
    why: () => 'When the soil is warm enough a field gets a ringed stamp. The clock keeps the speed you set.',
    point: () => ({ testid: ['speed-3', 'speed-cycle'] }),
  },
  {
    id: 'plant', part: 'opening', moment: true, name: 'Give the first order',
    when: l => inSeason(l) && needFor(l, 'plant') >= 0,
    done: l => jobOn(l, 'plant') || anyField(l, f => f.plantDay >= 0),
    ask: l => {
      const f = name(Math.max(0, needFor(l, 'plant')))
      return by(l, `The soil is warm. Click the ringed stamp on ${f} to plant it.`, `The soil is warm. Tap the ringed stamp on ${f} to plant it.`, `The soil is warm. Tab to ${f}, then Enter plants it.`)
    },
    why: l => by(l, 'Right-clicking a field gives the same order: whatever it needs now.', 'A long press on a field gives the same order: whatever it needs now.', 'Tab walks the fields that need something; Enter gives each its order.'),
    point: l => { const i = needFor(l, 'plant'); return i >= 0 ? { badge: i } : null },
  },
  {
    id: 'watch', part: 'opening', moment: true, name: 'See the order taken',
    when: l => inSeason(l) && jobOn(l, 'plant') && !anyField(l, f => f.plantDay >= 0),
    done: l => anyField(l, f => f.plantDay >= 0),
    ask: () => 'Watch: you take the order, go to the field and plant it.',
    why: () => 'Orders wait on the list beside your face at the foot. Let the days run to see it done.',
    point: l => ({ unit: farmer(l) }),
  },
  {
    id: 'rest', part: 'opening', moment: true, name: 'Plant the rest', uses: ['many'],
    when: l => inSeason(l) && anyField(l, f => f.plantDay >= 0) && needFor(l, 'plant') >= 0,
    done: (l, g) => g.has('many') || (anyField(l, f => f.plantDay >= 0) && needFor(l, 'plant') < 0),
    ask: l => by(l, 'Plant the rest the same way. A double-click picks every field like it.', 'Plant the rest: tap each ringed stamp.', 'Plant the rest: Tab to each, then Enter.'),
    why: l => by(l, 'An order goes to every field picked. Shift-click adds a field.', 'Each order joins the list, and you work them in turn.', 'Shift with a number adds a field to those picked.'),
    point: l => { const i = needFor(l, 'plant'); return i >= 0 ? { badge: i } : null },
  },

  // The first year: each the first time it comes.
  {
    id: 'telegram', part: 'year', name: 'Answer a telegram', urgent: true,
    when: l => inSeason(l) && !!l.c && l.c.incidents.length > 0,
    done: (l, _g, since) => !!since && !!l.c && !l.c.incidents.some(i => i.id === since.inc),
    ask: l => by(l, 'A telegram needs an answer. Click a reply; the days left are on it.', 'A telegram needs an answer. Tap a reply; the days left are on it.', 'A telegram needs an answer. Its number keys choose a reply.'),
    why: () => 'The clock stopped for it. Left alone, it lapses to the answer printed at its foot.',
    point: () => ({ testid: ['incident', 'incident-open'] }),
  },
  order({
    id: 'scout', act: 'scout', name: 'Walk a field for blight', did: l => anyField(l, f => f.lastScout >= 0),
    ask: (l, f) => `The rows are up in ${f}. ${click(l)} its stamp to walk it for blight.`,
    why: 'Blight shows only up close, and a reading a week old is a guess.',
  }),
  order({
    id: 'hill', act: 'hill', name: 'Hill the rows', did: l => anyField(l, f => f.hillPasses > 0),
    ask: (l, f) => `The plants are a hand high. ${click(l)} the stamp on ${f} to hill them.`,
    why: 'Soil pulled over the row keeps the tubers out of the light. Twice, before the rows close.',
  }),
  order({
    id: 'spray', act: 'spray', name: 'Spray before the blight', did: l => anyField(l, f => f.lastSpray >= 0),
    ask: (l, f) => `Blight weather is coming. ${click(l)} the stamp on ${f} to spray it.`,
    why: 'Protectant must be on the leaf before the spores land. Rain and new leaf wear it off.',
  }),
  {
    id: 'frost', part: 'year', name: 'Frost in the forecast', read: true,
    when: l => inSeason(l) && !!l.c && S.forecast(l.world, l.c, 2).some(d => d.frostChance >= 50) &&
      anyField(l, f => (f.emergeDay >= 0 && f.deadDay < 0) || f.inField >= 0.5),
    done: (l, g, since) => g.has('noted:frost') || (!!since && !!l.c?.season && l.c.season.day > since.d + 2),
    ask: () => 'Frost in the forecast: the snowflake. It blackens leaves and freezes barrels left in a field.',
    why: () => 'Nothing stops a frost. Dig and haul ahead of one in the fall.',
    point: () => ({ testid: ['forecast'] }),
  },
  order({
    id: 'sample', act: 'sample', name: 'Lift a test hill', did: l => anyField(l, f => f.samples.length > 0),
    ask: (l, f) => `Tubers are setting in ${f}. ${click(l)} its stamp to lift one hill and look.`,
    why: 'A test dig is your only look at the crop before dig day.',
  }),
  order({
    id: 'water', act: 'water', name: 'Water a dry field', did: () => false,
    ask: (l, f) => `${f} is drying out. ${click(l)} its stamp to water it.`,
    why: 'Dry soil while the tubers grow costs yield and brings scab.',
  }),
  order({
    id: 'rogue', act: 'rogue', name: 'Pull blighted plants', did: () => false,
    ask: (l, f) => `Blight is found in ${f}. ${click(l)} its red stamp to pull the sick plants.`,
    why: 'Bagged and out of the field, they cannot throw spores at the rest.',
  }),
  order({
    id: 'kill', act: 'kill', name: 'Kill the vines', did: l => anyField(l, f => f.killDay >= 0),
    ask: (l, f) => `The crop in ${f} is made. ${click(l)} its stamp to kill the vines.`,
    why: 'Growth stops, and the skins set in about two weeks. Set skins keep in the cellar.',
  }),
  order({
    id: 'dig', act: 'dig', name: 'Dig the crop', did: l => anyField(l, f => f.status === 'digging' || f.status === 'dug'),
    ask: (l, f) => `The skins are set in ${f}. ${click(l)} its stamp to dig it.`,
    why: 'The digger lifts the crop into barrels in the field. Then it is hauled in.',
  }),
  {
    id: 'haul', part: 'year', name: 'Bring the crop in', read: true,
    when: l => inSeason(l) && anyField(l, f => f.inField >= 0.5),
    done: (l, g) => g.has('noted:haul') || anyField(l, f => f.weighed),
    ask: l => `The crop is in barrels in ${name(Math.max(0, fields(l).findIndex(f => f.inField >= 0.5)))}. It is hauled to the potato house by itself.`,
    why: () => 'When the last barrel is in, it is weighed and the weigh ticket comes. A hard frost takes a share.',
    point: l => { const i = fields(l).findIndex(f => f.inField >= 0.5); return i >= 0 ? { field: i } : null },
  },
  {
    id: 'ticket', part: 'year', name: 'Sell or store the crop', urgent: true, paper: 'weighin',
    when: l => l.paper === 'weighin',
    done: (l, _g, since) => (!!since && !l.papers.includes('weighin')) || !!l.c?.lots.some(x => x.sold > 0),
    ask: () => 'The weigh ticket. Tear off one way: sell now, or store the crop to sell over the winter.',
    why: () => 'Brings most marks the better way today. Stored potatoes can be sold any day after.',
  },
  {
    id: 'close', part: 'year', name: 'Close out the season', urgent: true,
    when: l => inSeason(l) && !!l.c && S.seasonDone(l.c),
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'season',
    ask: l => by(l, 'The ground has frozen and the season is over. Press Close out the season.', 'The ground has frozen and the season is over. Tap Close out the season.', 'The ground has frozen and the season is over. Close out the season.'),
    why: () => 'Winter is next: what you stored waits in the cellar to be sold.',
    point: () => ({ testid: ['end-season'] }),
  },
  {
    id: 'cellar', part: 'year', name: 'Winter in the cellar',
    when: l => l.screen === 'cellar' && !!l.c,
    done: (l, _g, since) => !!since && !!l.c && (l.c.phase !== 'cellar' || l.c.month > since.m),
    ask: () => 'Winter. Sell stored potatoes when the price suits you, then go on a month.',
    why: () => 'Each month the price moves, storage costs a little and the piles shrink. Spring sprouting ends it.',
    point: () => ({ testid: ['month-next'] }),
  },
  {
    id: 'book', part: 'year', name: 'The account book',
    when: l => l.screen === 'ledger' && !!l.c,
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'ledger',
    ask: () => 'The account book: the year\'s money in and out. The bank takes its note here.',
    why: () => 'See where the money went, then plan the second year.',
    point: () => ({ testid: ['year-next'] }),
  },

  // The second spring's catalogue, and what opens up after it.
  {
    id: 'seed', part: 'spring', name: 'Choose seed for a field', uses: ['select:plan'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('select:plan'),
    ask: l => {
      const i = potatoField(l.c)
      return l.input === 'keys' && l.c ? `A new spring. Press ${digitOf(l.c, i) || '1'} to choose the seed for ${name(i)}.` : `A new spring. ${click(l)} the tag of ${name(i)} to choose its variety and seed.`
    },
    why: () => 'Seed saved from your cellar is free but carries virus. Certified seed is clean.',
    point: l => ({ field: potatoField(l.c) }),
  },
  {
    id: 'people', part: 'spring', name: 'Hire a hand', uses: ['fold:crew'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (l, g) => g.has('fold:crew') || (!!l.c && l.c.crew.length > 1),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} People: who is asking for work, and what each is best at.`,
    why: () => 'A hand works the list beside you. Wages are paid every month of the season.',
    point: () => ({ testid: ['crew-open'] }),
  },
  {
    id: 'land', part: 'spring', name: 'Rent or buy land', uses: ['fold:land'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (l, g) => g.has('fold:land') || (!!l.c && l.c.fields.some((f, i) => i < S.TRACTS[0] && i >= 6 && f.tenure !== 'none')),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} Land: rent a field by the year, or buy one on a mortgage.`,
    why: () => 'More land is more crop and more work. Woods and brush can be cleared into fields.',
    point: () => ({ testid: ['land-open'] }),
  },
  {
    id: 'loan', part: 'spring', name: 'The money and the loan', uses: ['paper:money'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('paper:money') || g.has('noted:loan'),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} The money: what this plan costs, and what the spring loan covers.`,
    why: () => 'The bank lends for the spring. It wants its note paid at the year end.',
    point: () => ({ testid: ['money-open'] }),
  },
  {
    id: 'begin2', part: 'spring', name: 'Start the second season',
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'plan',
    ask: l => by(l, 'When the plan suits you, press Start the season.', 'When the plan suits you, tap Start the season.', 'When the plan suits you, start the season.'),
    why: () => 'Machines and contracts can wait for a later spring.',
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'hand', part: 'spring', name: 'Give a hand an order', uses: ['unit:hand'],
    when: l => inSeason(l) && !!hand(l),
    done: (_l, g) => g.has('unit:hand'),
    ask: l => {
      const u = hand(l)
      const n = u ? first(u.name) : 'a hand'
      return by(l, `Click ${n}'s face to see what they are good at.`, `Tap ${n}'s face to see what they are good at.`, `Tab to ${n} at the foot and press Enter.`)
    },
    why: () => 'Orders given while someone is picked go to them alone.',
    point: l => { const u = hand(l); return u ? { unit: u.id } : null },
  },
  {
    id: 'fell', part: 'spring', name: 'Clear woods into a field',
    when: l => inSeason(l) && !!l.c && l.c.history.length > 0 && tract(l) >= 0,
    done: l => jobOn(l, 'fell') || (!!l.c && S.TRACTS.some(i => l.c!.fields[i].felled > 0 || l.c!.fields[i].cover !== S.PARCELS[i].cover)),
    ask: l => `Woods can become a field. Pick ${name(tract(l))} and give the order Fell.`,
    why: () => 'Felling brings logs to the yard. The stumps and stones come out next, then a crop.',
    point: l => { const i = tract(l); return i >= 0 ? { field: i } : null },
  },
  {
    id: 'yard', part: 'spring', name: 'Raise a building', uses: ['yard'],
    when: l => inSeason(l) && !!l.c && l.c.history.length > 0 && S.buildingInfo(l.c).some(b => b.ok),
    done: (l, g) => g.has('yard') || (!!l.c && l.c.buildings.length > 0),
    ask: l => by(l, 'Click the home yard to raise a building from your own logs and stone.', 'Tap the home yard to raise a building from your own logs and stone.', 'Press Y for the home yard, and raise a building there.'),
    why: () => 'Your people build it between field jobs. A second potato house holds more crop.',
    point: () => ({ testid: ['yard-home'] }),
  },
]

const BY_ID = new Map(LESSONS.map(x => [x.id, x]))
export function lesson(id: string): Lesson | undefined { return BY_ID.get(id) }

export const PART_NAME: Record<Part, string> = { opening: 'The opening', year: 'The first year', spring: 'The second spring' }

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
export function countWords(t: string): number { return words(t) }

// ---------------------------------------------------------------- the guide: progress, and the one lesson now

export class Guide {
  p: Progress
  private store: Store | null
  private facts: Set<string>
  // Replayed lessons seen not yet done since they came back: done from here on passes them.
  private armed = new Set<string>()

  constructor(store: Store | null) {
    this.store = store
    this.p = fresh()
    try {
      const t = store?.get()
      if (t) {
        const o = JSON.parse(t) as Partial<Progress>
        if (o && o.v === 1) this.p = { ...fresh(), ...o, passed: { ...o.passed }, since: { ...o.since }, replay: [...(o.replay ?? [])], facts: [...(o.facts ?? [])] }
      }
    } catch { /* unreadable: start afresh */ }
    this.facts = new Set(this.p.facts)
  }

  private save(): void {
    this.p.facts = [...this.facts]
    try { this.store?.set(JSON.stringify(this.p)) } catch { /* storage blocked: the guide forgets on reload */ }
  }

  get on(): boolean { return this.p.mode === 'on' }
  has(fact: string): boolean { return this.facts.has(fact) }
  passed(id: string): boolean { return id in this.p.passed }

  // A fact the screen saw: the camera moved, a paper opened, a fold opened.
  note(fact: string): void {
    if (this.facts.has(fact)) return
    this.facts.add(fact)
    this.save()
  }

  // A new farm started from the title: the offer is made on its first spring, once.
  newFarm(seed: number): void {
    if (this.p.offered) return
    this.p.offerSeed = seed
    this.save()
  }

  offerFor(c: S.Campaign | null, screen: Look['screen']): boolean {
    return !this.p.offered && !!c && screen === 'plan' && c.history.length === 0 && this.p.offerSeed === c.seed
  }

  accept(): void { this.p.offered = true; this.p.offerSeed = null; this.p.mode = 'on'; this.save() }
  // Straight in: and so is a season started with the offer unanswered.
  refuse(): void { this.p.offered = true; this.p.offerSeed = null; if (this.p.mode === 'unset') this.p.mode = 'off'; this.save() }
  stop(): void { this.p.mode = 'off'; this.p.replay = []; this.save() }
  resume(): void { this.p.offered = true; this.p.offerSeed = null; this.p.mode = 'on'; this.save() }
  skip(id: string): void { this.p.passed[id] = 'skip'; this.p.replay = this.p.replay.filter(x => x !== id); this.save() }
  noted(id: string): void { this.note(`noted:${id}`); this.pass(id) }

  // Shows a lesson again, the next time its moment comes, whether or not the guide is on.
  replay(id: string): void {
    if (!BY_ID.has(id)) return
    delete this.p.passed[id]
    delete this.p.since[id]
    this.facts.delete(`noted:${id}`)
    for (const f of BY_ID.get(id)!.uses ?? []) this.facts.delete(f)
    this.armed.delete(id)
    if (!this.p.replay.includes(id)) this.p.replay.push(id)
    this.save()
  }

  // As on a browser that never played: the offer still to come.
  reset(): void {
    this.p = fresh()
    this.facts = new Set()
    this.armed.clear()
    this.save()
  }

  // Skips every lesson listed before this one, the guide on: for the browser tests and the capture tool.
  skipTo(id: string): void {
    this.p.offered = true
    this.p.mode = 'on'
    for (const x of LESSONS) { if (x.id === id) break; this.p.passed[x.id] = 'skip' }
    this.save()
  }

  // Every lesson from the start, with the guide on.
  restart(): void {
    this.p = { ...fresh(), offered: true, mode: 'on' }
    this.facts = new Set()
    this.armed.clear()
    this.save()
  }

  private pass(id: string): void {
    this.armed.delete(id)
    if (this.p.passed[id] === 'done') return
    this.p.passed[id] = 'done'
    this.p.replay = this.p.replay.filter(x => x !== id)
    this.save()
  }

  replaying(id: string): boolean { return this.p.replay.includes(id) }

  private eligible(x: Lesson): boolean {
    return !this.passed(x.id) && (this.on || this.p.replay.includes(x.id))
  }

  // In the guided first season the clock waits for the lesson that starts it.
  holdsClock(c: S.Campaign | null): boolean {
    return this.on && !!c && c.history.length === 0 && !this.passed('clock') && !this.has('run')
  }

  // Whether the guide speaks for the orders' first tips: while it is on, they would say the same twice.
  quiet(): boolean { return this.on }

  // What the screen shows records itself: picking, running the clock, the paper on top.
  private observe(l: Look): void {
    const c = l.c
    if (!c) return
    if (l.screen === 'season') {
      if (l.selection.length) this.note('select')
      if (l.selection.length > 1) this.note('many')
      if (l.unit >= 0) this.note('unit')
      if (l.unit >= 0 && c.crew.some(u => u.id === l.unit && u.kind !== 'farmer')) this.note('unit:hand')
      if (l.yard !== 0) this.note('yard')
      if (l.speed > 0) this.note('run')
      if (l.speed >= 3) this.note('fast')
    } else if (l.screen === 'plan' && l.selection.length && c.history.length > 0) this.note('select:plan')
    for (const p of l.papers) this.note(`paper:${p}`)
  }

  // The lesson to show now, or null. Lessons the farm shows done are passed on the way, shown or not.
  current(l: Look): Lesson | null {
    this.observe(l)
    let best: Lesson | null = null
    let rank = 9
    for (const x of LESSONS) {
      if (!this.eligible(x)) continue
      const since = this.p.since[x.id]
      const done = x.done(l, this, since)
      // A replayed lesson waits for its moment, then for the thing done again; the first time, done is passed over.
      if (this.replaying(x.id)) {
        if (since && !done) this.armed.add(x.id)
        else if (since && this.armed.has(x.id)) { this.pass(x.id); continue }
      } else if (done) { this.pass(x.id); continue }
      if (!x.when(l, this)) continue
      const r = x.urgent ? 0 : x.part === 'opening' && !x.moment ? 2 : 1
      if (r < rank) { best = x; rank = r }
    }
    if (best && !this.p.since[best.id]) {
      const c = l.c
      const since = { y: c?.year ?? 0, d: c?.season?.day ?? -1, m: c?.month ?? 0, inc: c?.incidents[0]?.id ?? -1 }
      this.p.since[best.id] = since
      if (this.replaying(best.id) && !best.done(l, this, since)) this.armed.add(best.id)
      this.save()
    }
    return best
  }

  // A paper not the lesson's own puts it away until it closes.
  showing(l: Look): Lesson | null {
    const x = this.current(l)
    if (!x) return null
    if (l.paper && x.paper !== l.paper) return null
    return x
  }

  // Where a lesson stands in its part: '3 of 12'.
  place(x: Lesson): { n: number; of: number } {
    const list = LESSONS.filter(y => y.part === x.part)
    return { n: list.indexOf(x) + 1, of: list.length }
  }
}
