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
  // A card that wants an answer is up: the note waits behind it, and brings nothing onto the screen yet.
  carded?: boolean
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
const over = (l: Look) => l.c?.season?.frozen ? 'The ground has frozen, so the season is over.' : 'The crop is in, so the season is over.'
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
// The fields held that rest this year.
const resting = (c: S.Campaign | null) => { let n = 0; if (c) for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i) && S.isField(c, i) && c.plans[i]?.crop === 'rest') n++; return n }
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
    const day = p.kind === 'kill' ? p.inWay.match(/vines\b[^.]*?\bon ([A-Z][a-z]+ \d+)/)?.[1] : undefined
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
    id: 'frame', part: 'opening', name: 'How a year works', read: true, card: true,
    when: l => l.screen === 'plan' && firstYear(l),
    done: (l, g) => g.has('noted:frame') || (!!l.c && l.c.phase !== 'plan'),
    ask: () => 'Your goal is to keep the farm for five years.',
    why: () => 'Your crew handles the field work and you make the big decisions. I\'ll pause the game and explain each one as it comes up.',
  },
  {
    id: 'begin', part: 'opening', name: 'Start the first season',
    when: l => l.screen === 'plan' && firstYear(l),
    done: l => !!l.c && (l.c.phase !== 'plan' || l.c.history.length > 0),
    ask: l => { const a = `Your plan is ready, with ${potatoFields(l.c).length} fields of potatoes.`; return by(l, `${a} Click Start the season.`, `${a} Tap Start the season.`, `${a} Press Enter to start the season.`) },
    why: () => 'The bank\'s spring loan covers the cost, and your crop pays it back.',
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'fields', part: 'opening', name: 'Your fields', read: true, reveals: ['tags'],
    when: l => inSeason(l) && firstYear(l),
    done: (_l, g) => g.has('noted:fields'),
    ask: l => { const n = potatoFields(l.c).length; const rest = resting(l.c); return rest ? `These tags mark your fields. This year ${n} will grow potatoes and ${rest} ${rest === 1 ? 'is' : 'are'} resting.` : `These tags mark your ${n} potato fields.` },
    why: () => 'It\'s too cold to plant yet. Your crew will start automatically when the soil warms.',
    point: l => ({ fields: potatoFields(l.c) }),
  },
  {
    id: 'look', part: 'opening', name: 'Look around', read: true,
    when: (l, g) => inSeason(l) && firstYear(l) && g.passed('fields'),
    done: (_l, g) => g.has('noted:look'),
    ask: l => by(l, 'Drag to move around the farm, and scroll to zoom in.', 'Drag to move around the farm, and pinch to zoom in.', 'Use the arrow keys to move around, and press Home to center the farm again.'),
    why: l => unplanted(l) ? `Planting starts when the soil warms up${(l.wait ?? -1) > 1 ? `, in about ${l.wait} days` : ''}.` : 'The game resumes when you close this.',
    skip: l => unplanted(l) ? 'Skip to planting day' : null,
  },
  {
    id: 'plantday', part: 'opening', moment: true, name: 'Planting day', read: true, reveals: ['people'],
    // Planting under way, not an order waiting for warm soil.
    when: l => inSeason(l) && firstYear(l) && (!!l.c?.season?.jobs.some(j => j.kind === 'plant' && j.done > 0) || anyField(l, f => f.plantDay >= 0)),
    done: (_l, g) => g.has('noted:plantday'),
    ask: () => 'Your crew has started planting. You didn\'t need to tell them. You\'re on the crew too, and your face at the bottom shows what you\'re doing.',
    why: () => 'The same face on the land is you.',
    point: l => ({ unit: farmer(l) }),
    skip: l => unplanted(l) ? 'Skip to the end of planting' : null,
  },
  {
    id: 'tend', part: 'year', name: 'The summer', read: true,
    when: (l, g) => inSeason(l) && firstYear(l) && g.passed('plantday') && !unplanted(l),
    done: (_l, g) => g.has('noted:tend'),
    ask: () => 'Planting is done. All summer your crew hills the rows (piles soil over them) and checks for disease.',
    why: () => 'You don\'t need to do anything until blight weather arrives. That\'ll be your first big decision.',
    skip: l => (l.c?.season?.watchDay ?? -1) < 0 ? 'Skip to your first decision' : null,
  },
  {
    id: 'blight', part: 'year', name: 'Blight weather', read: true, reveals: ['forecast'],
    when: l => inSeason(l) && (l.c?.season?.watchDay ?? -1) >= 0 && anyField(l, f => f.status === 'growing'),
    done: (_l, g) => g.has('noted:blight'),
    ask: () => 'Blight weather is coming. Blight is a disease that can wipe out a field in one wet week.',
    why: () => 'The forecast marks it with a red leaf. Spraying protects a field for about a week.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'list', part: 'year', name: 'The work list', read: true, reveals: ['list'],
    when: l => inSeason(l) && auto(l, 'spray') && jobOn(l, 'spray'),
    done: (_l, g) => g.has('noted:list'),
    ask: () => 'Your crew now sprays on its own. The work list at the bottom shows their jobs in order.',
    why: l => { const o = l.c ? S.sprayOutlook(l.world, l.c) : null; return `${o && o.perPass > 0 ? `Each spray costs about ${usd(o.perPass)} a field. ` : ''}You don't need to do anything else.` },
    point: () => ({ testid: ['queue-*'] }),
    skip: () => 'Skip to the next decision',
  },
  {
    id: 'stamp', part: 'year', name: 'A decision on a field', read: true, reveals: ['stamps', 'list'],
    when: l => inSeason(l) && call(l) >= 0,
    done: (l, g, since) => g.has('noted:stamp') || (!!since && call(l) < 0),
    ask: l => `A ringed stamp means a field needs a decision from you. This one: ${l.needs[call(l)]?.text ?? 'work that\'s due.'}`,
    why: l => by(l, 'Click the stamp to order it. The job goes on the work list.', 'Tap the stamp to order it. The job goes on the work list.', 'Press Tab to go to the field, then Enter to order it.'),
    point: l => { const i = call(l); return i >= 0 ? { badge: i } : null },
  },
  {
    id: 'kill', part: 'year', name: 'Kill the vines', read: true, reveals: ['stamps', 'list', 'forecast'],
    when: l => inSeason(l) && (needFor(l, 'kill') >= 0 || !!crewKills(l) || jobOn(l, 'kill')),
    done: (_l, g) => g.has('noted:kill'),
    ask: () => 'The crop is nearly ready. Killing the vines stops the growth, so the skins toughen for harvest.',
    why: l => {
      const day = crewKills(l)
      if (day) return `Your crew will do this automatically on ${day}. ${click(l)} a stamp to do it sooner.`
      const i = needFor(l, 'kill')
      return i >= 0 ? `${click(l)} the stamp on ${name(i)} to order it.` : 'It\'s on the work list, so you don\'t need to do anything.'
    },
    point: l => { const i = needFor(l, 'kill'); return i >= 0 && !crewKills(l) ? { badge: i } : null },
    skip: () => 'Skip to the harvest',
  },
  {
    id: 'frost', part: 'year', name: 'Frost on the barrels', read: true, urgent: true,
    when: l => inSeason(l) && l.speed === 0 && /frost/i.test(l.stopped ?? ''),
    done: (_l, g) => g.has('noted:frost'),
    ask: () => 'Frost tonight would ruin the potatoes still sitting in barrels in the field.',
    why: () => 'Your crew will haul them in first, so you don\'t need to do anything.',
  },
  {
    id: 'dig', part: 'year', name: 'The harvest', read: true, reveals: ['people', 'forecast', 'list', 'stamps'],
    when: l => inSeason(l) && anyField(l, f => f.status === 'digging' || f.status === 'dug' || f.inField >= 0.5),
    done: (_l, g) => g.has('noted:dig'),
    ask: () => 'The harvest has started. Your crew digs the potatoes into barrels and hauls them to the potato house.',
    why: () => 'You don\'t need to do anything. Each field is weighed when its barrels are in.',
    skip: l => anyField(l, f => f.weighed) ? null : 'Skip to the weigh ticket',
  },
  {
    id: 'bills', part: 'year', name: 'The year-end bills', read: true, reveals: ['after'],
    when: l => inSeason(l) && anyField(l, f => f.weighed) && !l.papers.includes('weighin'),
    done: (l, g, since) => g.has('noted:bills') || (!!since && !!l.c && l.c.phase !== 'season'),
    ask: () => `Your first crop is weighed. Under your cash you'll see what's left after the year-end bills of ${owed()}.`,
    why: () => 'It counts the crop still in the ground, so it\'ll change until every field is in.',
    point: () => ({ testid: ['outlook'] }),
    skip: l => (l.c && S.seasonDone(l.c) ? null : 'Skip to the next ticket'),
  },
  {
    id: 'close', part: 'year', name: 'Close out the season', urgent: true,
    when: l => inSeason(l) && !!l.c && S.seasonDone(l.c),
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'season',
    ask: l => by(l, `${over(l)} Click Close out the season.`, `${over(l)} Tap Close out the season.`, `${over(l)} Close out the season.`),
    why: () => 'Winter comes next, and that\'s when you can sell what you stored.',
    point: () => ({ testid: ['end-season'] }),
  },
  {
    id: 'cellar', part: 'year', name: 'Winter in the cellar',
    when: l => l.screen === 'cellar' && !!l.c,
    done: (l, _g, since) => !!since && !!l.c && (l.c.phase !== 'cellar' || l.c.month > since.m),
    ask: l => !l.c || S.openLots(l.c).length > 0
      ? 'It\'s winter. Sell your stored potatoes when you like the price, then move on to the next month.'
      : `It's winter. Your cellar is empty, so you can end the year. ${by(l, 'Click', 'Tap', 'Press')} Close the year.`,
    why: l => !l.c || S.openLots(l.c).length > 0
      ? 'Each month the price changes, storage costs a little, and your stored potatoes shrink.'
      : 'If you\'d stored potatoes, each winter month would be a chance to sell at a better price.',
    point: () => ({ testid: ['month-next'] }),
  },
  {
    id: 'fell', part: 'year', name: 'Fell woods in winter',
    when: (l, g) => l.screen === 'cellar' && g.passed('cellar') && tract(l) >= 0,
    done: (l, g) => g.has('noted:fell') || !!l.c?.crew.some(u => u.winter === 'woods') || (!!l.c && S.TRACTS.some(i => l.c!.fields[i].felled > 0 || l.c!.fields[i].cover !== S.PARCELS[i].cover)),
    ask: () => 'Winter is a good time to fell (cut down) woods. Set yourself to Woods and the logs go to your yard.',
    why: () => 'Once the stumps and stones are out, the cleared land becomes a new field.',
    point: l => ({ testid: [`winter-${farmer(l)}-woods`] }),
  },
  {
    id: 'yard', part: 'year', name: 'Raise a building', uses: ['fold:raise'],
    when: (l, g) => l.screen === 'cellar' && g.passed('cellar') && !!l.c && S.goalCosts(l.c).some(x => x.id.startsWith('build:') && x.can),
    done: (l, g) => g.has('fold:raise') || (!!l.c && l.c.buildings.length > 0),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} Raise a building to put one up this winter with your own logs and stone.`,
    why: () => 'Whoever you set to Build works on it, and a second potato house stores more of your crop.',
    point: () => ({ testid: ['raise-open'] }),
  },
  {
    id: 'book', part: 'year', name: 'The ledger',
    when: l => l.screen === 'ledger' && !!l.c,
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'ledger',
    ask: () => 'This is the ledger, which shows the year\'s money in and out. Your yearly bank payment comes out here.',
    why: () => 'See where your money went, then plan your second year.',
    point: () => ({ testid: ['year-next'] }),
  },

  // The second spring's catalogue, then the season's own work first; people and blocks as the farm grows into them.
  {
    id: 'seed', part: 'spring', name: 'Choose a variety for a field', uses: ['select:plan'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('select:plan'),
    ask: l => {
      const i = potatoField(l.c)
      return l.input === 'keys' && l.c ? `It's a new spring. Press ${digitOf(l.c, i) || '1'} to choose what ${name(i)} grows.` : `It's a new spring. ${click(l)} a field's tag to choose what it grows.`
    },
    why: l => (l.c?.seedStock.some(x => x.fields > 0) ? 'Seed saved from your cellar is free but can carry virus, while certified seed is clean.' : 'Each variety yields, stores and sells differently. Compare them all shows them side by side.'),
    point: l => (l.input === 'keys' ? { field: potatoField(l.c) } : { fields: potatoFields(l.c) }),
  },
  {
    id: 'people', part: 'spring', name: 'Hire a hand', uses: ['fold:crew'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (l, g) => g.has('fold:crew') || (!!l.c && l.c.crew.length > 1),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} People to see who's looking for work and what each person is best at.`,
    why: () => 'A hired hand shares the work list with you, and you pay their wages every month of the season.',
    point: () => ({ testid: ['crew-open'] }),
  },
  {
    id: 'hire', part: 'spring', name: 'Choose who to hire', read: true, follows: true,
    when: (l, g) => l.screen === 'plan' && l.fold === 'crew' && g.passed('people') && !!l.c && l.c.crew.length === 1,
    done: (l, g, since) => g.has('noted:hire') || (!!l.c && l.c.crew.length > 1) || (!!since && l.fold !== 'crew'),
    ask: l => `Each person asks for a monthly wage. ${by(l, 'Click Hire next to the one you want.', 'Tap Hire next to the one you want.', 'Press Tab to reach Hire next to the one you want.')}`,
    why: () => 'Each person\'s best skill is marked. You don\'t have to hire anyone, because you can farm alone for another year.',
    point: () => ({ testid: ['applicant-hire-*', 'hire-*'] }),
  },
  {
    id: 'land', part: 'spring', name: 'Rent or buy land', uses: ['fold:land'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (l, g) => g.has('fold:land') || (!!l.c && l.c.fields.some((f, i) => i < S.TRACTS[0] && i >= 6 && f.tenure !== 'none')),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} Land to rent a field by the year or buy one with a mortgage.`,
    why: () => 'More land means more crop and more work. You can also clear woods and brush to make new fields.',
    point: () => ({ testid: ['land-open'] }),
  },
  {
    id: 'loan', part: 'spring', name: 'Money and the spring loan', uses: ['paper:money'],
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('paper:money') || g.has('noted:loan'),
    ask: l => `${l.input === 'touch' ? 'Tap' : 'Open'} The money to see what this plan costs and how much the spring loan covers.`,
    why: () => 'The bank lends you money each spring, and your yearly bank payment is due at the end of the year.',
    point: () => ({ testid: ['money-open'] }),
  },
  {
    id: 'begin2', part: 'spring', name: 'Start the second season',
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length > 0,
    done: (l, _g, since) => !!since && !!l.c && l.c.phase !== 'plan',
    ask: l => by(l, 'When you\'re happy with the plan, click Start the season.', 'When you\'re happy with the plan, tap Start the season.', 'When you\'re happy with the plan, start the season.'),
    why: () => 'Machines and contracts can wait until a later spring.',
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'calls2', part: 'spring', name: 'Your decisions this season', read: true,
    when: l => inSeason(l) && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('noted:calls2'),
    ask: () => 'It\'s a new season. Your crew plants and tends on its own, and you make the big decisions: spray, water and kill the vines.',
    why: () => 'The forecast shows blight weather first, and a stamp appears when a decision is due.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'hand', part: 'spring', name: 'Meet your hired hand', read: true, uses: ['unit:hand'],
    when: (l, g) => inSeason(l) && !!hand(l) && g.passed('calls2'),
    done: (_l, g) => g.has('unit:hand') || g.has('noted:hand'),
    ask: l => {
      const n = first(hand(l)?.name ?? 'A hand')
      return by(l, `Click ${n}'s face to see what they're good at.`, `Tap ${n}'s face to see what they're good at.`, `Select ${n}'s name at the bottom to see what they're good at.`)
    },
    why: () => 'While someone is selected, any orders you give go only to them.',
    point: l => { const u = hand(l); return u ? { unit: u.id } : null },
  },
  {
    id: 'grid', part: 'spring', name: 'Who does what', read: true, uses: ['open:work-grid'],
    when: l => inSeason(l) && !!l.c && l.c.crew.length >= 3,
    done: (l, g) => g.has('open:work-grid') || g.has('noted:grid') || !!l.c?.crew.some(u => u.foreman !== ''),
    ask: l => by(l, 'Click the grid at the bottom to see who does what and which jobs each person does first.', 'Tap the grid at the bottom to see who does what and which jobs each person does first.', 'Press G to open the grid and see who does what and which jobs each person does first.'),
    why: () => 'People get better at the work they do, so put someone who\'s good with machines on the tractor.',
    point: () => ({ testid: ['grid-open'] }),
  },
  {
    id: 'foreman', part: 'spring', name: 'Name a foreman', read: true,
    when: (l, g) => inSeason(l) && !!hand(l) && g.passed('hand') && beyond(l) && !!l.c && S.goalCosts(l.c).some(x => x.id === 'foreman' && x.can),
    done: (l, g) => g.has('noted:foreman') || !!l.c?.crew.some(u => u.foreman !== ''),
    ask: l => `A hired hand can run a block of land as its foreman. Use Foreman on ${first(hand(l)?.name ?? 'their')}'s card.`,
    why: () => 'Each morning a foreman adds the block\'s jobs to the work list, including the decisions. It\'s handy for land far from home.',
    point: () => ({ testid: ['person-foreman'] }),
  },
]

const BY_ID = new Map(LESSONS.map(x => [x.id, x]))
export function lesson(id: string): Lesson | undefined { return BY_ID.get(id) }

export const PART_NAME: Record<Part, string> = { opening: 'Getting started', year: 'Your first year', spring: 'Your second spring' }

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
    if (best?.reveals && !l.carded) for (const p of best.reveals) this.note(`show:${p}`)
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
