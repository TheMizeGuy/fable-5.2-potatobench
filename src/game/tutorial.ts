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
  // The fields whose stamp is on the screen now, the one a note already named first, so a note names a stamp the
  // player can see and keeps to it.
  inView?: number[]
}

// Where a note's "Show me" goes: the field or the person its sentence is about, and the control lit there.
export type Show = { field: number } | { unit: number; foreman?: boolean }
// A thing the player can do about what a note says, as its key: the words on it and the orders it gives. done: what
// is said after; left out, the game's own answer to the order is said.
export interface Act { label: string; cmds: S.Cmd[]; done?: string }

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
  // "Show me": where the thing the note is about is.
  show?(l: Look): Show | null
  // What the player can do about it now, as a key on the note.
  act?(l: Look): Act | null
  // It asks for a press on the land (a stamp, a face, a field): the game stays paused after Got it, and when the
  // thing is done, until the player resumes. A note that only tells goes back to the speed the game had.
  asks?(l: Look): boolean
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
// Of several fields with one, the first whose stamp is on the screen: the note names the stamp the player sees.
const seen = (l: Look, ok: (a: S.Advice | null) => boolean) => {
  const all = l.needs.map((a, i) => (ok(a) ? i : -1)).filter(i => i >= 0)
  return l.inView?.find(i => all.includes(i)) ?? all[0] ?? -1
}
// (the planting that waits for the player's word has a note of its own)
const call = (l: Look) => seen(l, a => jobAct(a?.act) && a?.act !== 'kill' && a?.act !== 'plant' && (a?.act !== 'spray' || (!!l.c && S.sprayWayNow(l.c) === 'ask')))
// The year's first planting waits for the player's word: the field whose Plant stamp is up, or -1.
const wordAt = (l: Look) => (l.c?.season && !S.plantWordGiven(l.c.season) ? seen(l, a => a?.act === 'plant') : -1)
// The potato fields still to plant, the one being planted aside.
const othersToPlant = (l: Look) => Math.max(0, potatoFields(l.c).filter(i => (l.c?.season?.fields[i]?.plantDay ?? -1) < 0).length - 1)
// The people the farm has hired, and whether there are fields away from home for a foreman to run.
const hands = (l: Look) => l.c?.crew.filter(u => u.kind !== 'farmer') ?? []
// Alone on the farm: "your crew" is you.
const alone = (l: Look) => (l.c?.crew.length ?? 1) <= 1
const killAt = (l: Look) => seen(l, a => a?.act === 'kill')
// The buildings the winter sheet's list offers (src/ui/winter.ts): its key reads "N to choose from".
const toRaise = (c: S.Campaign | null) => (c ? S.buildingInfo(c).filter(b => b.state === 'none' && (b.yard === S.HOME_YARD || S.holdsDufour(c))).length : 0)

// A frost forecast tonight on crop still in barrels: the field with most of it out.
function frostNow(l: Look): { field: number } | null {
  const c = l.c
  const s = c?.season
  if (!c || !s || c.phase !== 'season' || s.frozen) return null
  const cold = S.haulInfo(l.world, c).filter(x => !s.fields[x.field].weighed && S.frostOnBarrels(l.world, c, x.field))
  if (!cold.length) return null
  return { field: [...cold].sort((a, b) => b.cwt - a.cwt)[0].field }
}
// The evening's frost warning (S.frostAhead) is dated the day the barrels are hauled in: today.
const frostWarned = (l: Look) => { const s = l.c?.season; return !!s && s.log.some(e => e.type === 'frostBarrels' && e.day === s.day) }

// ---------------------------------------------------------------- the lessons, in the order a first year meets them

export const LESSONS: Lesson[] = [
  // The opening: what the game is, then the land. Every note says what it is, why it matters and what to do, in 35
  // words or fewer, and the clock is held while it is up.
  {
    id: 'frame', part: 'opening', name: 'How a year works', read: true, card: true,
    when: l => l.screen === 'plan' && firstYear(l),
    done: (l, g) => g.has('noted:frame') || (!!l.c && l.c.phase !== 'plan'),
    ask: () => 'Your goal is to keep the farm for five years.',
    why: l => `${alone(l) ? 'You and anyone you hire do' : 'You and your crew do'} the field work, and you make the big decisions. I'll pause the game to explain each one.`,
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
    // The first thing the player does on the land, and the season's first note: the guide has carried the player
    // through the weeks the soil took to warm (driving, below), and the year's first planting waits for their word
    // (src/sim/advice.ts). The tags come onto the land with their stamps.
    id: 'word', part: 'opening', moment: true, name: 'Give the word to plant', read: true, reveals: ['tags', 'stamps'],
    when: l => inSeason(l) && firstYear(l) && wordAt(l) >= 0,
    done: (l, g) => g.has('noted:word') || (!!l.c?.season && S.plantWordGiven(l.c.season)),
    ask: l => `The soil is ready, and planting waits for your word. ${by(l, 'Click', 'Tap', 'Press Tab to reach')} the ringed Plant stamp on ${name(wordAt(l))}${l.input === 'keys' ? ', then Enter' : ''}.`,
    why: l => { const n = othersToPlant(l); return n ? `Your crew then plants the other ${n === 1 ? 'field' : `${n} fields`} on its own.` : 'Planting starts there right away.' },
    point: l => { const i = wordAt(l); return i >= 0 ? { badge: i } : null },
    show: l => { const i = wordAt(l); return i >= 0 ? { field: i } : null },
    asks: () => true,
  },
  {
    id: 'plantday', part: 'opening', moment: true, name: 'Planting day', read: true, reveals: ['people', 'stamps'],
    // The word given (or three days gone by with none), in this season or an older save's.
    when: l => inSeason(l) && firstYear(l) && !!l.c?.season && S.plantWordGiven(l.c.season),
    done: (_l, g) => g.has('noted:plantday'),
    ask: l => {
      const n = othersToPlant(l)
      const word = l.c?.season?.plantWordBy === 'crew' ? 'You gave no word, so your crew started planting on its own.'
        : n ? `You gave the word. Your crew will plant the other ${n === 1 ? 'field' : `${n} fields`} too.` : 'You gave the word, and planting has started.'
      return `${word} You're on the crew, and your face at the bottom shows what you're doing.`
    },
    why: () => 'The same face on the land is you.',
    point: l => ({ unit: farmer(l) }),
  },
  {
    id: 'tend', part: 'year', name: 'The summer', read: true,
    when: (l, g) => inSeason(l) && firstYear(l) && g.passed('plantday') && !unplanted(l),
    done: (_l, g) => g.has('noted:tend'),
    ask: () => 'Planting is done. All summer your crew hills the rows (piles soil over them) and checks for disease.',
    why: () => 'You don\'t need to do anything until blight weather arrives. That\'ll be your first big decision.',
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
  },
  {
    id: 'stamp', part: 'year', name: 'A decision on a field', read: true, reveals: ['stamps', 'list'],
    when: l => inSeason(l) && call(l) >= 0,
    done: (l, g, since) => g.has('noted:stamp') || (!!since && call(l) < 0),
    ask: l => `A ringed stamp means a field needs a decision from you. This one: ${l.needs[call(l)]?.text ?? 'work that\'s due.'}`,
    why: l => by(l, 'Click the stamp to order it. The job goes on the work list.', 'Tap the stamp to order it. The job goes on the work list.', 'Press Tab to go to the field, then Enter to order it.'),
    point: l => { const i = call(l); return i >= 0 ? { badge: i } : null },
    show: l => { const i = call(l); return i >= 0 ? { field: i } : null },
    asks: () => true,
  },
  {
    id: 'kill', part: 'year', name: 'Kill the vines', read: true, reveals: ['stamps', 'list', 'forecast'],
    when: l => inSeason(l) && (needFor(l, 'kill') >= 0 || !!crewKills(l) || jobOn(l, 'kill')),
    done: (_l, g) => g.has('noted:kill'),
    ask: () => 'The crop is nearly ready. Killing the vines stops the growth, so the skins toughen for harvest.',
    why: l => {
      const day = crewKills(l)
      if (day) return `Your crew will do this automatically on ${day}. ${click(l)} a stamp to do it sooner.`
      const i = killAt(l)
      return i >= 0 ? `${click(l)} the stamp on ${name(i)} to order it.` : 'It\'s on the work list, so you don\'t need to do anything.'
    },
    point: l => { const i = killAt(l); return i >= 0 && !crewKills(l) ? { badge: i } : null },
    show: l => { const i = killAt(l); return i >= 0 && !crewKills(l) ? { field: i } : null },
    asks: l => killAt(l) >= 0 && !crewKills(l),
  },
  {
    id: 'frost', part: 'year', name: 'Frost on the barrels', read: true, urgent: true,
    // The warning itself, not a pause for it: the game no longer stops for a frost by itself.
    when: l => inSeason(l) && frostWarned(l) && !!frostNow(l),
    done: (_l, g) => g.has('noted:frost'),
    ask: () => 'Frost tonight ruins a fifth of the potatoes still out in barrels.',
    // Never a promise the night may break (a tractor hauls about 900 cwt a day, the forecast misses, and what is dug
    // after the haul stays out): what the player can do now, by the same order and the same words as the frost
    // toast's key (the haulNow command), whose answer says how much comes in by dark and how much stays out.
    why: l => {
      const f = frostNow(l)
      return f ? `Haul it in now sends whoever can bring in the most from ${name(f.field)} by dark, day off or not.` : 'Your crew hauls barrels in ahead of everything else.'
    },
    show: l => { const f = frostNow(l); return f ? { field: f.field } : null },
    act: l => {
      const f = frostNow(l)
      return f ? { label: 'Haul it in now', cmds: [{ t: 'haulNow', field: f.field }] } : null
    },
  },
  {
    id: 'dig', part: 'year', name: 'The harvest', read: true, reveals: ['people', 'forecast', 'list', 'stamps'],
    when: l => inSeason(l) && anyField(l, f => f.status === 'digging' || f.status === 'dug' || f.inField >= 0.5),
    done: (_l, g) => g.has('noted:dig'),
    ask: () => 'The harvest has started. Your crew digs the potatoes into barrels and hauls them to the potato house.',
    why: () => 'You don\'t need to do anything. Each field is weighed when its barrels are in.',
  },
  {
    id: 'bills', part: 'year', name: 'The year-end bills', read: true, reveals: ['after'],
    when: l => inSeason(l) && anyField(l, f => f.weighed) && !l.papers.includes('weighin'),
    done: (l, g, since) => g.has('noted:bills') || (!!since && !!l.c && l.c.phase !== 'season'),
    // By the words on the money board: its second figure is labelled "After year-end bills".
    ask: () => `Your first crop is weighed. "After year-end bills" at the top right is what's left after paying the ${owed()}.`,
    why: () => 'It counts the crop still in the ground, so it\'ll change until every field is in.',
    point: () => ({ testid: ['outlook'] }),
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
    id: 'yard', part: 'year', name: 'Put up a building', uses: ['fold:raise'],
    when: (l, g) => l.screen === 'cellar' && g.passed('cellar') && !!l.c && S.goalCosts(l.c).some(x => x.id.startsWith('build:') && x.can),
    done: (l, g) => g.has('fold:raise') || (!!l.c && l.c.buildings.length > 0),
    // By the words on the control: the sheet's heading, and the key under it (src/ui/winter.ts).
    ask: l => `Under Put up a building, ${l.input === 'touch' ? 'tap' : 'click'} "${toRaise(l.c)} to choose from" to raise one this winter.`,
    why: () => 'Whoever you set to Build works on it, using your own logs and stone.',
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
    id: 'seed', part: 'spring', name: 'Pick a field to plan', uses: ['select:plan'],
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
    // The field's record is open: this step is the player's until they close it or say Got it. Nothing after it
    // comes on a timer or on another click.
    id: 'crop', part: 'spring', name: 'Choose what a field grows', read: true, follows: true,
    // (a field that can be planted: a tract's record offers clearing, not a crop)
    when: (l, g) => l.screen === 'plan' && !!l.c && l.c.history.length > 0 && g.passed('seed') && l.selection.length > 0 && S.held(l.c, l.selection[0]) && l.c.fields[l.selection[0]].cover === 'open',
    done: (l, g, since) => g.has('noted:crop') || (!!since && l.selection.length === 0),
    ask: l => `Choose potatoes or a rest year for ${name(l.selection[0] ?? 0)}, and which variety to grow.`,
    why: l => `Take your time. ${by(l, 'Click', 'Tap', 'Press')} Got it or close the record when you're done, and I'll go on.`,
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
    why: () => 'Each person\'s best skill is marked. You can also wait, because you can farm alone for another year.',
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
    // The Land fold is open: the agent says what it shows and that it is a choice, and waits for Got it or the fold
    // to close. The tutorial never goes quiet while a fold it asked for is open.
    id: 'lots', part: 'spring', name: 'Look over the land', read: true, follows: true,
    when: (l, g) => l.screen === 'plan' && l.fold === 'land' && g.passed('land') && !!l.c && l.c.history.length > 0,
    done: (l, g, since) => g.has('noted:lots') || (!!since && l.fold !== 'land'),
    ask: () => 'Each lot lists its rent for the year, then its price to buy.',
    why: l => `More land is a choice, and the land you have is enough for now. ${by(l, 'Click', 'Tap', 'Press')} Got it when you've looked, and I'll go on.`,
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
    // The walk's closing line.
    ask: l => by(l, 'That\'s the plan. Click Start the season when you\'re ready.', 'That\'s the plan. Tap Start the season when you\'re ready.', 'That\'s the plan. Start the season when you\'re ready.'),
    why: () => 'Machines and contracts can wait until a later spring.',
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'calls2', part: 'spring', name: 'Your decisions this season', read: true,
    when: l => inSeason(l) && !!l.c && l.c.history.length > 0,
    done: (_l, g) => g.has('noted:calls2'),
    ask: () => 'It\'s a new season. The game pauses when the soil is ready, and planting waits for your word.',
    why: () => 'Your other big decisions are spray, water and kill the vines, and a stamp appears when one is due.',
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
    asks: () => true,
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
    // Only where a foreman pays: two hired hands at least (one can be spared from field work) and fields away from
    // home for them to run. With one hand it would take the only help out of the field for 40% more pay.
    when: (l, g) => inSeason(l) && hands(l).length >= 2 && beyond(l) && g.passed('hand') && !!l.c && S.goalCosts(l.c).some(x => x.id === 'foreman' && x.can),
    done: (l, g) => g.has('noted:foreman') || !!l.c?.crew.some(u => u.foreman !== ''),
    ask: () => 'A foreman orders the work on your fields away from home each morning, so nothing out there waits for you.',
    why: l => `Name one with Foreman on ${first(hand(l)?.name ?? 'their')}'s card. They earn 40% more and stop field work.`,
    point: () => ({ testid: ['person-foreman'] }),
    show: l => { const u = hand(l); return u ? { unit: u.id, foreman: true } : null },
  },
]

const BY_ID = new Map(LESSONS.map(x => [x.id, x]))
export function lesson(id: string): Lesson | undefined { return BY_ID.get(id) }

export const PART_NAME: Record<Part, string> = { opening: 'Getting started', year: 'Your first year', spring: 'Your second spring' }
// The heading on a note: its part's name, or the year the farm is really in when a lesson is met later than that.
export function partName(part: Part, c: S.Campaign | null): string {
  const n = (c?.history.length ?? 0) + 1
  if (part === 'year' && n > 1) return `Year ${n}`
  if (part === 'spring' && n !== 2) return `Spring, year ${n}`
  return PART_NAME[part]
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
export function countWords(t: string): number { return words(t) }

// ---------------------------------------------------------------- the guide runs the clock between its notes

// What the guide does with the clock when no note is up (src/ui/tutorial.ts carries it out). It never starts a clock
// the game stopped for a decision (app.ts, SELF_PAUSES): those stop it like anyone's.
export interface Scene {
  // The work shown: its kind, or 'up' for the plants coming up.
  id: string
  // Who to follow (-1: nobody, the field is framed) and where.
  unit: number
  field: number
  line: string
}
export interface Drive {
  // A press the year waits on is still open (the word to plant, a ringed stamp): the guide waits for it, or for the
  // player to wave it through.
  waits?: { id: string; field: number }
  // Work to slow down and look at, the first time it is done.
  scene?: Scene
  // What is passing and what comes next, in a line each.
  line: string
  next: string
  // The clock's speed (1 to 3) and how many times faster than it the days go.
  speed: 1 | 2 | 3
  pace: number
}

// How many times faster than the clock's fastest (two days a second) the days go under the guide: through the weeks
// before planting, which teach nothing (18 to 30 days, so two or three seconds), and through the rest of the year.
export const OPENING_PACE = 5
export const RUN_PACE = 1.5
// How long a piece of work is watched, in seconds, at the first speed.
export const SCENE_SECONDS = 4.5

// Each kind of work the guide shows, as it is said while it goes on and once that day finished it.
const WORK: [S.JobKind, string, string, (field: string) => string][] = [
  ['plant', 'planting', 'planted', f => `${f}.`],
  ['hill', 'hilling', 'hilled', f => `${f}, piling soil over the rows.`],
  ['spray', 'spraying', 'sprayed', f => `${f} ahead of the blight.`],
  ['sample', 'digging', 'dug', f => `a test hill in ${f} to see the crop.`],
  ['kill', 'killing', 'killed', f => `the vines in ${f}.`],
  ['dig', 'digging', 'dug', f => `${f} into barrels.`],
  ['haul', 'hauling', 'hauled', f => `${f}'s barrels to the potato house.`],
]
// Whether the one who did this work on the last day is still at it: the order is still on the list and theirs, and
// they are in the field (the rule the time book's own word for them follows, ui/now.ts).
function stillAt(l: Look, w: { kind: S.JobKind; field: number; unit: number }): boolean {
  const c = l.c!
  const u = c.crew.find(x => x.id === w.unit)
  const j = c.season!.jobs.find(x => x.kind === w.kind && x.field === w.field)
  return !!u && !!j && !S.resting(u) && !S.hurt(u, c.season!.day) && (u.job === j.id || (u.job < 0 && !c.crew.some(o => o !== u && o.job === j.id))) && u.road <= 0 && u.at === w.field
}
function workLine(l: Look, w: { kind: S.JobKind; field: number; unit: number }, doing: string, did: string, rest: (field: string) => string): string {
  const u = l.c?.crew.find(x => x.id === w.unit)
  const you = !u || u.kind === 'farmer'
  return stillAt(l, w) ? `${you ? 'You\'re' : `${first(u.name)} is`} ${doing} ${rest(name(w.field))}` : `${you ? 'You' : first(u.name)} ${did} ${rest(name(w.field))}`
}

// The presses the year is waiting on, that no note is asking for now: the word to plant, a vine kill that is the
// player's, a ringed stamp. Each by its order and field ("water:2"); the word is one ask whichever field it is given on.
export function openAsks(l: Look): { id: string; field: number }[] {
  const tries: [string, number][] = [['word', wordAt(l)], ['kill', crewKills(l) ? -1 : killAt(l)], [l.needs[call(l)]?.act ?? '', call(l)]]
  return tries.filter(([act, field]) => field >= 0 && !!act).map(([act, field]) => ({ id: act === 'word' ? act : `${act}:${field}`, field }))
}

// What the guide is waiting for, said as the thing to press.
function askLine(l: Look, a: { id: string; field: number }): string {
  if (a.id === 'word') return `Planting waits for your word. ${click(l)} a ringed Plant stamp.`
  if (a.id.startsWith('kill:')) return `The vines in ${name(a.field)} wait for you. ${click(l)} the ringed Kill vines stamp.`
  return `${l.needs[a.field]?.text ?? 'Work is waiting.'} ${click(l)} its ringed stamp.`
}

// What is passing, and what it leads to.
function passing(l: Look): { line: string; next: string } {
  const c = l.c!
  const s = c.season!
  const pot = potatoFields(c)
  const left = pot.filter(i => (s.fields[i]?.plantDay ?? -1) < 0).length
  const any = (ok: (f: S.FieldSeason) => boolean) => pot.some(i => !!s.fields[i] && ok(s.fields[i]))
  if (!S.plantWordGiven(s) && left === pot.length) return { line: 'A few weeks pass while the soil warms.', next: 'Next: planting, on your word.' }
  if (left > 0) return { line: left === pot.length ? 'Your crew is starting to plant.' : `Your crew is planting the other ${left === 1 ? 'field' : `${left} fields`}.`, next: 'Next: the plants come up.' }
  if (any(f => f.weighed)) return { line: 'The rest of the crop is coming in.', next: 'Next: the next weigh ticket.' }
  if (any(f => f.status === 'digging' || f.status === 'dug' || f.inField >= 0.5)) return { line: 'Your crew is digging and hauling.', next: 'Next: the first weigh ticket.' }
  if (any(f => f.status === 'dead') || jobOn(l, 'kill')) return { line: 'The vines are dying back and the skins are toughening.', next: 'Next: the harvest.' }
  if (!any(f => f.status === 'growing')) return { line: 'The seed is in the ground.', next: 'Next: the plants come up.' }
  if (s.watchDay < 0) return { line: 'Your crew hills the rows and walks the fields.', next: 'Next: blight weather, your first big decision.' }
  return { line: auto(l, 'spray') ? 'Your crew sprays when blight weather comes.' : 'The crop is growing.', next: 'Next: killing the vines, near September.' }
}

// What the guide does with the clock now: null when it is not the guide's (the tutorial off, the clock taken by the
// player, no season running). waved: the open asks the player said to go on without.
export function driving(l: Look, g: Guide, waved: ReadonlySet<string> = new Set()): Drive | null {
  const c = l.c
  const s = c?.season
  if (!c || !s || !inSeason(l) || !g.drives(c) || S.seasonDone(c)) return null
  const { line, next } = passing(l)
  const run: Drive = { line, next, speed: 3, pace: RUN_PACE }
  const waits = openAsks(l).find(a => !waved.has(a.id))
  if (waits) return { ...run, waits, line: askLine(l, waits), next: 'I\'ll run the clock on once it\'s done.' }
  // The weeks before planting go by in a breath, at one pace from the season's first day.
  if (!S.plantWordGiven(s) && s.plantAsk === undefined) return { ...run, pace: OPENING_PACE }
  // A first year's work is watched once, each kind the first day it is done; the plants coming up likewise.
  if (firstYear(l)) {
    const up = potatoFields(c).find(i => s.fields[i]?.status === 'growing')
    if (up !== undefined && !g.has('seen:up')) return { ...run, scene: { id: 'up', unit: -1, field: up, line: `The plants are up in ${name(up)}.` } }
    // Work is shown on a working day: on a Sunday off the time book has everyone at home, whatever they did the day before.
    for (const [kind, doing, did, rest] of S.workday(c, s) && !s.frozen ? WORK : []) {
      if (g.has(`seen:${kind}`)) continue
      // Someone still at it before someone who finished theirs that day; of those, one still in the field before
      // one who has gone on to other work, whose field is shown without them.
      const all = s.worked.filter(x => x.kind === kind && x.field >= 0)
      const there = (x: { field: number; unit: number }) => c.crew.some(u => u.id === x.unit && u.road <= 0 && u.at === x.field)
      const w = all.find(x => stillAt(l, x)) ?? all.find(there) ?? all[0]
      if (w) return { ...run, scene: { id: kind, unit: there(w) ? w.unit : -1, field: w.field, line: workLine(l, w, doing, did, rest) } }
    }
  }
  return run
}

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
  // Whose the clock is between notes. The guide runs it through a first year until the player takes it (a speed set,
  // a pause, "I'll set the speed"); after that, and in later years, only where the player handed it back.
  drives(c: S.Campaign | null): boolean {
    return this.on && !!c && (this.facts.has('clock:guide') || (c.history.length === 0 && !this.facts.has('clock:player')))
  }
  takeClock(): void { this.facts.delete('clock:guide'); this.facts.add('clock:player'); this.save() }
  giveClock(): void { this.facts.delete('clock:player'); this.facts.add('clock:guide'); this.save() }
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
    // So may a note about what the player has just opened (a field's record, a fold): it is what they are looking at,
    // whatever note they put away before opening it.
    const cuts = (x: Lesson | null) => !!x && (!!x.urgent || !!x.holds || !!x.follows)
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
