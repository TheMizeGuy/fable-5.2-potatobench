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
  // Why the clock stopped itself, when it did ('' when the player stopped it, or it runs).
  stopped?: string
  // A question on the screen that is not a telegram: 'spray' while the season's spraying question is up.
  asking?: string
  // The spring catalogue's fold open now ('crew', 'land', ...), or ''.
  fold?: string
  // Days until the soil is fit to plant, as the boards have it (-1 when not known).
  wait?: number
}

// Where a lesson points: a control by its test id (the first of several that is on screen), a field's tag, a field's
// need stamp, a person on the land.
export type Point = { testid: string[] } | { field: number } | { fields: number[] } | { badge: number } | { unit: number }

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
  // It asks for a click on something that moves while the days run: the clock is held while it shows.
  holds?: boolean
  // Shown over this paper (its test id); any other paper puts the lessons away until it closes.
  paper?: string
  // The facts it is done by, forgotten when it is replayed so that doing it again is what passes it.
  uses?: string[]
  // Follows at once the click that opened what it is about, without the pause between lessons.
  follows?: boolean
  // Shown as a card in the middle of the screen, with the year drawn on it.
  card?: boolean
  // The pieces of the season screen this note brings in (the guided first year opens on the land alone).
  reveals?: Piece[]
  // A key on the note that lets the days run fast to the next thing: its words.
  skip?(l: Look): string | null
}

// The pieces of the season screen a guided first year brings in one at a time.
export type Piece = 'tags' | 'people' | 'forecast' | 'list' | 'stamps' | 'after'
export const PIECES: Piece[] = ['tags', 'people', 'forecast', 'list', 'stamps', 'after']

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
const over = (l: Look) => l.c?.season?.frozen ? 'The ground has frozen and the season is over.' : 'The crop is in and the season is over.'
const hand = (l: Look) => l.c?.crew.find(u => u.kind !== 'farmer') ?? null
// A job the routine put on the list by itself (Campaign.routine, where the simulation has it).
const routineJob = (l: Look) => !!l.c?.season?.jobs.some(j => j.by === 'routine')
// Whether the crew does this kind of work by itself (the routine), rather than waiting for the player's stamp.
const auto = (l: Look, kind: S.RoutineKind) => !!l.c?.routine?.[kind]
// The fields in potatoes this year, for a lesson that points at whichever of their tags is on the screen.
function potatoFields(c: S.Campaign | null): number[] {
  const out: number[] = []
  if (c) for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i) && S.isField(c, i) && c.plans[i]?.crop === 'potato') out.push(i)
  return out.length ? out : [potatoField(c)]
}
const cash = (l: Look) => `$${Math.max(0, Math.round(l.c?.cash ?? 0)).toLocaleString('en-US')}`
// The farm holds land beyond the home six: a block a foreman could run.
const beyond = (l: Look) => !!l.c?.fields.some((f, i) => i >= S.HOME_FIELDS && f.tenure !== 'none' && S.PARCELS[i].block !== 'home')
const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`
// Planting by the one rule the field's card and the routine use.
const fit = (l: Look, field: number) => !!l.c && field >= 0 && S.plantReady(l.world, l.c, field).ok
const JOB_WORD: Partial<Record<S.JobKind, string>> = { plant: 'Planting', spray: 'Spraying', haul: 'Hauling', dig: 'Digging', kill: 'Killing the vines', water: 'Watering', rogue: 'Pulling blighted plants', hill: 'Hilling', scout: 'Walking a field', sample: 'A test dig' }
// The first pressing job, in a few words: "Spraying North Ridge".
const pressed = (l: Look) => { const p = l.c ? S.pressing(l.world, l.c)[0] : undefined; return p ? `${JOB_WORD[p.kind] ?? 'Work'} ${name(p.field)}` : 'Work' }
const owed = () => `$${(S.NOTE_PAYMENT + S.LIVING).toLocaleString('en-US')}`
const tract = (l: Look) => S.TRACTS.find(i => l.c && l.c.fields[i].tenure !== 'none' && (l.c.fields[i].cover === 'woods' || l.c.fields[i].cover === 'brush')) ?? -1

const jobAct = (a: string | undefined) => !!a && a !== 'wait' && a !== 'sell' && a !== 'close'
const firstYear = (l: Look) => !!l.c && l.c.history.length === 0
// The day the crew kills a field's vines by itself, as the list's row words it (S.pressing), or ''.
function crewKills(l: Look): string {
  if (!l.c) return ''
  for (const p of S.pressing(l.world, l.c)) {
    const day = p.kind === 'kill' ? p.inWay.match(/kills the vines on ([A-Z][a-z]+ \d+)/)?.[1] : undefined
    if (day) return day
  }
  return ''
}
const unplanted = (l: Look) => !!l.c && potatoFields(l.c).some(i => (l.c!.season?.fields[i]?.plantDay ?? -1) < 0)
// A call that is the player's to make now, the vine kill aside (it has a note of its own). A spray is a call only
// once the season's spraying question is answered "ask me": until then the question itself is the call.
const call = (l: Look) => l.needs.findIndex(a => jobAct(a?.act) && a?.act !== 'kill' && (a?.act !== 'spray' || (!!l.c && S.sprayWayNow(l.c) === 'ask')))

// ---------------------------------------------------------------- the lessons, in the order a first year meets them

export const LESSONS: Lesson[] = [
  // The opening: what the game is, then the land. Every note says what it is, why it matters and what to do, in 35
  // words or fewer, and the clock is held while it is up.
  {
    id: 'frame', part: 'opening', name: 'What a year is', read: true, card: true,
    when: l => l.screen === 'plan' && firstYear(l),
    done: (l, g) => g.has('noted:frame') || (!!l.c && l.c.phase !== 'plan'),
    ask: () => 'Keep the farm five years. Each year: plant, tend, kill the vines, dig, sell or store.',
    why: () => 'Your crew does the field work. You make the calls. I stop the clock and say why each time.',
  },
  {
    id: 'begin', part: 'opening', name: 'Start the first season',
    when: l => l.screen === 'plan' && firstYear(l),
    done: l => !!l.c && (l.c.phase !== 'plan' || l.c.history.length > 0),
    ask: l => { const a = `The plan is ready: ${potatoFields(l.c).length} fields of potatoes.`; return by(l, `${a} Press Start the season.`, `${a} Tap Start the season.`, `${a} Enter starts the season.`) },
    why: () => 'The bank\'s spring loan pays for it, and the crop pays the loan back.',
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'fields', part: 'opening', name: 'Your fields', read: true, reveals: ['tags'],
    when: l => inSeason(l) && firstYear(l),
    done: (_l, g) => g.has('noted:fields'),
    ask: l => `These tags are your ${potatoFields(l.c).length} potato fields. Nothing is planted yet: the soil is too cold.`,
    why: () => 'Your crew plants them by itself when the soil warms.',
    point: l => ({ fields: potatoFields(l.c) }),
  },
  {
    id: 'look', part: 'opening', name: 'Look round', read: true,
    when: (l, g) => inSeason(l) && firstYear(l) && g.passed('fields'),
    done: (_l, g) => g.has('noted:look'),
    ask: l => by(l, 'Drag the land to move over it. Roll the wheel to come closer.', 'Drag the land to move over it. Pinch to come closer.', 'The arrow keys move over the land. Home brings the farm back.'),
    why: l => unplanted(l) ? `Planting waits for warm soil${(l.wait ?? -1) > 1 ? `, about ${l.wait} days away` : ''}.` : 'The days run when this note is put away.',
    skip: l => unplanted(l) ? 'Skip to planting day' : null,
  },
  {
    id: 'plantday', part: 'opening', moment: true, name: 'Planting day', read: true, reveals: ['people'],
    // Planting under way, not an order waiting for warm soil.
    when: l => inSeason(l) && firstYear(l) && (!!l.c?.season?.jobs.some(j => j.kind === 'plant' && j.done > 0) || anyField(l, f => f.plantDay >= 0)),
    done: (_l, g) => g.has('noted:plantday'),
    ask: () => 'Planting has begun, with no order from you. That face on the land is you, doing the work.',
    why: l => by(l, 'Click the face to see what you are doing.', 'Tap the face to see what you are doing.', 'Your name at the foot says what you are doing.'),
    point: l => ({ unit: farmer(l) }),
    skip: l => unplanted(l) ? 'Skip to the end of planting' : null,
  },
  {
    id: 'tend', part: 'year', name: 'The summer', read: true,
    when: (l, g) => inSeason(l) && firstYear(l) && g.passed('plantday') && !unplanted(l),
    done: (_l, g) => g.has('noted:tend'),
    ask: () => 'The fields are planted. All summer the crew hills the rows and walks them for disease, by itself.',
    why: () => 'Nothing for you to do until blight weather comes: that is your first call.',
    skip: l => (l.c?.season?.watchDay ?? -1) < 0 ? 'Skip to the first call' : null,
  },
  {
    id: 'blight', part: 'year', name: 'Blight weather', read: true, reveals: ['forecast'],
    when: l => inSeason(l) && (l.c?.season?.watchDay ?? -1) >= 0 && anyField(l, f => f.status === 'growing'),
    done: (_l, g) => g.has('noted:blight'),
    ask: () => 'Blight weather is coming. Blight is a disease that can take a whole field in one wet week.',
    why: () => 'The forecast marks it with a red leaf. A spray protects a field for about a week.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'list', part: 'year', name: 'The list of work', read: true, reveals: ['list'],
    when: l => inSeason(l) && auto(l, 'spray') && jobOn(l, 'spray'),
    done: (_l, g) => g.has('noted:list'),
    ask: () => 'The crew now sprays by itself. Its work shows on the list at the foot, in the order it is done.',
    why: l => { const o = l.c ? S.sprayOutlook(l.world, l.c) : null; return `${o && o.perPass > 0 ? `Each spray costs about ${usd(o.perPass)} a field. ` : ''}Nothing more for you to do.` },
    point: () => ({ testid: ['queue-*'] }),
    skip: () => 'Skip to the next call',
  },
  {
    id: 'stamp', part: 'year', name: 'A call on a field', read: true, reveals: ['stamps', 'list'],
    when: l => inSeason(l) && call(l) >= 0,
    done: (l, g, since) => g.has('noted:stamp') || (!!since && call(l) < 0),
    ask: l => `A ringed stamp on a field is a call for you. This one: ${l.needs[call(l)]?.text ?? 'work that is due.'}`,
    why: l => by(l, 'Click the stamp to order it. The work joins the list at the foot.', 'Tap the stamp to order it. The work joins the list at the foot.', 'Tab goes to the field, and Enter orders it.'),
    point: l => { const i = call(l); return i >= 0 ? { badge: i } : null },
  },
  {
    id: 'kill', part: 'year', name: 'Kill the vines', read: true, reveals: ['stamps', 'list', 'forecast'],
    when: l => inSeason(l) && (needFor(l, 'kill') >= 0 || !!crewKills(l) || jobOn(l, 'kill')),
    done: (_l, g) => g.has('noted:kill'),
    ask: () => 'The crop is nearly made. Killing the vines stops the growth, so the skins toughen for digging.',
    why: l => {
      const day = crewKills(l)
      if (day) return `The crew does it by itself on ${day}. Nothing for you to do.`
      const i = needFor(l, 'kill')
      return i >= 0 ? `${click(l)} the stamp on ${name(i)} to order it.` : 'It is on the list: nothing for you to do.'
    },
    point: l => { const i = needFor(l, 'kill'); return i >= 0 ? { badge: i } : null },
    skip: () => 'Skip to the dig',
  },
  {
    id: 'frost', part: 'year', name: 'Frost on the barrels', read: true, urgent: true,
    when: l => inSeason(l) && l.speed === 0 && /frost/i.test(l.stopped ?? ''),
    done: (_l, g) => g.has('noted:frost'),
    ask: () => 'Frost tonight would spoil the crop still in barrels in the field.',
    why: () => 'The crew hauls it in first. Nothing for you to do.',
  },
  {
    id: 'dig', part: 'year', name: 'The dig', read: true, reveals: ['people', 'forecast', 'list', 'stamps'],
    when: l => inSeason(l) && anyField(l, f => f.status === 'digging' || f.status === 'dug' || f.inField >= 0.5),
    done: (_l, g) => g.has('noted:dig'),
    ask: () => 'Digging has begun. The crew lifts the crop into barrels and hauls it to the potato house.',
    why: () => 'Nothing for you to do. Each field is weighed when its last barrel is in.',
    skip: l => anyField(l, f => f.weighed) ? null : 'Skip to the weigh ticket',
  },
  {
    id: 'bills', part: 'year', name: 'What the year end takes', read: true, reveals: ['after'],
    when: l => inSeason(l) && anyField(l, f => f.weighed) && !l.papers.includes('weighin'),
    done: (l, g, since) => g.has('noted:bills') || (!!since && !!l.c && l.c.phase !== 'season'),
    ask: () => `Your first crop is weighed. Under your cash is what would be left after the year-end bills of ${owed()}.`,
    why: () => 'It counts the crop still in the ground, so it moves until every field is in.',
    point: () => ({ testid: ['outlook'] }),
    skip: l => (l.c && S.seasonDone(l.c) ? null : 'Skip to the next ticket'),
  },
  {
    id: 'close', part: 'year', name: 'Close out the season', urgent: true,
    when: l => inSeason(l) && !!l.c && S.seasonDone(l.c),
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'season',
    ask: l => by(l, `${over(l)} Press Close out the season.`, `${over(l)} Tap Close out the season.`, `${over(l)} Close out the season.`),
    why: () => 'Winter is next: what you stored can be sold then.',
    point: () => ({ testid: ['end-season'] }),
  },
  {
    id: 'cellar', part: 'year', name: 'Winter in the cellar',
    when: l => l.screen === 'cellar' && !!l.c,
    done: (l, _g, since) => !!since && !!l.c && (l.c.phase !== 'cellar' || l.c.month > since.m),
    ask: l => !l.c || S.openLots(l.c).length > 0
      ? 'Winter. Sell stored potatoes when the price suits you, then go on a month.'
      : 'Winter. The cellar is empty, so the year can close: press Close the year.',
    why: l => !l.c || S.openLots(l.c).length > 0
      ? 'Each month the price moves, storage costs a little and the piles shrink.'
      : 'With a crop in store, each winter month would be a chance to sell at a better price.',
    point: () => ({ testid: ['month-next'] }),
  },
  {
    id: 'fell', part: 'year', name: 'Fell woods in winter',
    when: (l, g) => l.screen === 'cellar' && g.passed('cellar') && tract(l) >= 0,
    done: (l, g) => g.has('noted:fell') || !!l.c?.crew.some(u => u.winter === 'woods') || (!!l.c && S.TRACTS.some(i => l.c!.fields[i].felled > 0 || l.c!.fields[i].cover !== S.PARCELS[i].cover)),
    ask: () => 'Winter is the time to fell woods. Set yourself to Woods, and the logs come to the yard.',
    why: () => 'A felled tract becomes a field: the stumps out, then the stones, then a crop.',
    point: l => ({ testid: [`winter-${farmer(l)}-woods`] }),
  },
  {
    id: 'yard', part: 'year', name: 'Raise a building', uses: ['fold:raise'],
    when: (l, g) => l.screen === 'cellar' && g.passed('cellar') && !!l.c && S.goalCosts(l.c).some(x => x.id.startsWith('build:') && x.can),
    done: (l, g) => g.has('fold:raise') || (!!l.c && l.c.buildings.length > 0),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} Raise a building: your own logs and stone, put up over the winter.`,
    why: () => 'Whoever you set to Build puts it up. A second potato house holds more crop.',
    point: () => ({ testid: ['raise-open'] }),
  },
  {
    id: 'book', part: 'year', name: 'The account book',
    when: l => l.screen === 'ledger' && !!l.c,
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'ledger',
    ask: () => 'The account book: the year\'s money in and out. The bank takes its note here.',
    why: () => 'See where the money went, then plan the second year.',
    point: () => ({ testid: ['year-next'] }),
  },

  // The second spring's catalogue, then the season's own work first; people and blocks as the farm grows into them.
  {
    id: 'seed', part: 'spring', name: 'Choose a variety for a field', uses: ['select:plan'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('select:plan'),
    ask: l => {
      const i = potatoField(l.c)
      return l.input === 'keys' && l.c ? `A new spring. Press ${digitOf(l.c, i) || '1'} to choose what ${name(i)} grows.` : `A new spring. ${click(l)} a field's tag to choose what it grows.`
    },
    why: l => (l.c?.seedStock.some(x => x.fields > 0) ? 'Seed saved from your cellar is free but carries virus. Certified seed is clean.' : 'Each variety yields, keeps and sells differently; Compare them all sets them side by side.'),
    point: l => (l.input === 'keys' ? { field: potatoField(l.c) } : { fields: potatoFields(l.c) }),
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
    id: 'hire', part: 'spring', name: 'Choose a hand', read: true, follows: true,
    when: (l, g) => l.screen === 'plan' && l.fold === 'crew' && g.passed('people') && !!l.c && l.c.crew.length === 1,
    done: (l, g, since) => g.has('noted:hire') || (!!l.c && l.c.crew.length > 1) || (!!since && l.fold !== 'crew'),
    ask: l => `Each asks a wage a month. ${by(l, 'Press Hire beside the one you want.', 'Tap Hire beside the one you want.', 'Tab to Hire beside the one you want.')}`,
    why: () => 'Their best work is marked. Nobody is needed: you can farm alone another year.',
    point: () => ({ testid: ['applicant-hire-*', 'hire-*'] }),
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
    id: 'calls2', part: 'spring', name: 'The season\'s calls', read: true,
    when: l => inSeason(l) && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('noted:calls2'),
    ask: () => 'A new season. The crew plants and tends by itself; the calls are yours: spray, water, kill the vines.',
    why: () => 'Blight weather shows in the forecast first, and a stamp comes when each call is due.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'hand', part: 'spring', name: 'Meet a hand', read: true, uses: ['unit:hand'],
    when: (l, g) => inSeason(l) && !!hand(l) && (g.passed('calls2') || (firstYear(l) && g.passed('plantday'))),
    done: (_l, g) => g.has('unit:hand') || g.has('noted:hand'),
    ask: l => {
      const n = first(hand(l)?.name ?? 'A hand')
      return by(l, `Click ${n}'s face to see what they are good at.`, `Tap ${n}'s face to see what they are good at.`, `${n}'s name at the foot opens their page.`)
    },
    why: () => 'Orders given while someone is picked go to them alone.',
    point: l => { const u = hand(l); return u ? { unit: u.id } : null },
  },
  {
    id: 'grid', part: 'spring', name: 'Who does what', read: true, uses: ['open:work-grid'],
    when: l => inSeason(l) && !!l.c && l.c.crew.length >= 3,
    done: (l, g) => g.has('open:work-grid') || g.has('noted:grid') || !!l.c?.crew.some(u => u.foreman !== ''),
    ask: l => by(l, 'Click the grid at the foot: who does what, and which jobs each person takes first.', 'Tap the grid at the foot: who does what, and which jobs each person takes first.', 'Press G for the grid: who does what, and which jobs each person takes first.'),
    why: () => 'Skills grow with the work. Someone good with machines belongs on the tractor.',
    point: () => ({ testid: ['grid-open'] }),
  },
  {
    id: 'foreman', part: 'spring', name: 'Name a foreman', read: true,
    when: (l, g) => inSeason(l) && !!hand(l) && g.passed('hand') && beyond(l) && !!l.c && S.goalCosts(l.c).some(x => x.id === 'foreman' && x.can),
    done: (l, g) => g.has('noted:foreman') || !!l.c?.crew.some(u => u.foreman !== ''),
    ask: l => `A hand can run a block of land as its foreman: Foreman, on ${first(hand(l)?.name ?? 'their')}'s card.`,
    why: () => 'Each morning they put the block\'s work on the list, the calls too. It suits land far from home.',
    point: () => ({ testid: ['person-foreman'] }),
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
  // The lesson last shown.
  private onShow = ''
  // The lesson an urgent one interrupted.
  private waiting = ''
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
  skip(id: string): void { this.p.passed[id] = 'skip'; this.p.replay = this.p.replay.filter(x => x !== id); this.bring(id); this.save() }
  private bring(id: string): void { for (const p of BY_ID.get(id)?.reveals ?? []) this.facts.add(`show:${p}`) }
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
    for (const x of LESSONS) { if (x.id === id) break; this.p.passed[x.id] = 'skip'; this.bring(x.id) }
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
    this.bring(id)
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

  // The pieces of the season screen a guided first year has not brought in yet: each comes with the note that
  // introduces it, and stays. Off the guide, or past the first year, nothing is held back.
  hidden(c: S.Campaign | null, screen: Look['screen']): Piece[] {
    if (!this.on || !c || c.history.length > 0 || screen !== 'season') return []
    return PIECES.filter(p => !this.facts.has(`show:${p}`))
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
    let kept: Lesson | null = null
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
      if (x.id === this.onShow || (!this.onShow && x.id === this.waiting)) kept = x
      const r = x.urgent ? 0 : x.part === 'opening' && !x.moment ? 2 : 1
      if (r < rank) { best = x; rank = r }
    }
    // One lesson at a time: the one on show keeps its place until it passes, unless something urgent comes.
    // A question, or a moment that holds the clock for a click, may come in front; the note it interrupted comes back.
    const cuts = (x: Lesson | null) => !!x && (!!x.urgent || !!x.holds)
    if (kept && best && !cuts(best)) best = kept
    if (cuts(best) && this.onShow && this.onShow !== best!.id && !cuts(lesson(this.onShow) ?? null)) this.waiting = this.onShow
    else if (best && !cuts(best)) this.waiting = ''
    this.onShow = best && !cuts(best) ? best.id : ''
    if (best?.reveals) for (const p of best.reveals) this.note(`show:${p}`)
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

}
