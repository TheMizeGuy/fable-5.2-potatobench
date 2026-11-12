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

// A lesson that asks for the order a field's stamp gives, the first time reference practice calls for it.
function order(o: { id: string; act: S.JobKind; name: string; did: (l: Look) => boolean; ask: (l: Look, f: string) => string; why: string | ((l: Look, i: number) => string) }): Lesson {
  return {
    id: o.id, part: 'year', name: o.name, holds: true,
    when: l => inSeason(l) && needFor(l, o.act) >= 0,
    done: l => jobOn(l, o.act) || o.did(l),
    ask: l => o.ask(l, name(Math.max(0, needFor(l, o.act)))),
    why: l => typeof o.why === 'string' ? o.why : o.why(l, needFor(l, o.act)),
    point: l => { const i = needFor(l, o.act); return i >= 0 ? { badge: i } : null },
  }
}

// ---------------------------------------------------------------- the lessons, in the order a first year meets them

export const LESSONS: Lesson[] = [
  // The opening: only what is needed to watch the first planting. The first spring's money and Start the season, the
  // clock, then planting day itself, held still long enough to look at it.
  {
    id: 'money', part: 'opening', name: 'The money', read: true,
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length === 0,
    done: (l, g, since) => g.has('noted:money') || g.has('paper:money') || (!!l.c && (l.c.phase !== 'plan' || l.c.history.length > 0) && !!since),
    ask: l => `Your ${cash(l)} and the bank's spring loan pay for this plan. The crop pays the loan back.`,
    why: () => `At the year end ${owed()} comes due as well: the bank's note, and the household's keep.`,
    point: () => ({ testid: ['plan-money'] }),
  },
  {
    id: 'begin', part: 'opening', name: 'Start the first season',
    when: l => l.screen === 'plan' && !!l.c && l.c.history.length === 0,
    done: l => !!l.c && (l.c.phase !== 'plan' || l.c.history.length > 0),
    ask: l => by(l, 'This is a usual first year\'s plan. Press Start the season.', 'This is a usual first year\'s plan. Tap Start the season.', 'This is a usual first year\'s plan. Enter starts the season.'),
    // The spring sheet's range (src/ui/usual-year.ts): 80 farms played by the coach's advice.
    why: () => `A first year usually ends $4,000 to $24,000 down: the note and the household take ${owed()} whatever the crop.`,
    point: () => ({ testid: ['begin-season'] }),
  },
  {
    id: 'clock', part: 'opening', name: 'Start the clock', uses: ['run'],
    when: inSeason,
    done: (_l, g) => g.has('run'),
    ask: l => by(l, 'Nothing grows until the soil warms. Press 3× to let the days run.', 'Nothing grows until the soil warms. Tap 3× to let the days run.', 'Nothing grows until the soil warms. Space starts the days; F makes them faster.'),
    why: l => auto(l, 'plant') ? 'The clock was held for you. The crew plants by itself once the ground is fit.' : 'The clock was held for you. A ringed stamp comes when the ground is fit to plant.',
    point: () => ({ testid: ['goal-faster', 'speed-3', 'speed-cycle', 'speed-toggle'] }),
  },
  {
    id: 'watch', part: 'opening', moment: true, holds: true, name: 'Watch the first planting', uses: ['pan', 'zoom'],
    // Planting under way, not an order waiting for warm soil.
    when: l => inSeason(l) && !anyField(l, f => f.emergeDay >= 0) && (!!l.c?.season?.jobs.some(j => j.kind === 'plant' && j.done > 0) || anyField(l, f => f.plantDay >= 0 && (l.c?.season?.day ?? 0) - f.plantDay <= 3)),
    done: (l, g, since) => g.has('pan') || g.has('zoom') || (!!since && !!l.c?.season && l.c.season.day >= since.d + 3),
    ask: l => {
      const a = auto(l, 'plant') ? 'Planting has begun by itself: nothing for you to do.' : 'Planting has begun.'
      return `${a} ${by(l, 'Roll the wheel over the fields to watch.', 'Pinch the fields to come closer and watch.', 'The arrow keys bring you over the fields.')}`
    },
    why: () => 'The clock is held for this note, and goes on once you have looked.',
    point: l => ({ unit: farmer(l) }),
  },
  {
    id: 'person', part: 'opening', moment: true, name: 'Meet your people', read: true, uses: ['unit'],
    when: (l, g) => inSeason(l) && g.passed('watch'),
    done: (l, g, since) => g.has('noted:person') || g.has('unit'),
    ask: l => by(l, 'Click this face: it is you. In the first year you do every job yourself.', 'Tap this face: it is you. In the first year you do every job yourself.', 'This face is you. In the first year you do every job yourself.'),
    why: () => 'Hands come later. A click on anyone on the land shows who they are and what they are doing.',
    point: l => ({ unit: farmer(l) }),
  },
  {
    id: 'plant', part: 'opening', moment: true, holds: true, name: 'Give the first order',
    when: l => inSeason(l) && needFor(l, 'plant') >= 0 && fit(l, needFor(l, 'plant')),
    done: l => jobOn(l, 'plant') || anyField(l, f => f.plantDay >= 0),
    ask: l => {
      const f = name(Math.max(0, needFor(l, 'plant')))
      return by(l, `The soil is warm. Click the ringed stamp on ${f} to plant it.`, `The soil is warm. Tap the ringed stamp on ${f} to plant it.`, `The soil is warm. Tab to ${f}, then Enter plants it.`)
    },
    why: l => by(l, 'Right-clicking a field gives the same order: whatever it needs now.', 'A long press on a field gives the same order: whatever it needs now.', 'Tab walks the fields that need something; Enter gives each its order.'),
    point: l => { const i = needFor(l, 'plant'); return i >= 0 ? { badge: i } : null },
  },
  {
    id: 'routine', part: 'opening', moment: true, name: 'Routine work and your calls', read: true,
    when: (l, g) => inSeason(l) && routineJob(l) && g.passed('person'),
    done: (l, g, since) => g.has('noted:routine'),
    ask: () => 'Routine work goes on the list by itself: planting, hilling, walking, digging. Nothing for you to do there.',
    why: () => 'Your calls come as stamps on the fields: spray, water, kill the vines. Who does what switches any of them.',
    point: () => ({ testid: ['queue-*'] }),
  },
  {
    id: 'rest', part: 'opening', moment: true, holds: true, name: 'Plant the rest', uses: ['many'],
    when: l => inSeason(l) && anyField(l, f => f.plantDay >= 0) && needFor(l, 'plant') >= 0,
    done: (l, g) => g.has('many') || (anyField(l, f => f.plantDay >= 0) && needFor(l, 'plant') < 0),
    ask: l => by(l, 'Plant the rest the same way. A double-click picks every field like it.', 'Plant the rest: tap each ringed stamp.', 'Plant the rest: Tab to each, then Enter.'),
    why: l => by(l, 'An order goes to every field picked. Shift-click adds a field.', 'Each order joins the list, and you work them in turn.', 'Shift with a number adds a field to those picked.'),
    point: l => { const i = needFor(l, 'plant'); return i >= 0 ? { badge: i } : null },
  },
  {
    id: 'list', part: 'opening', name: 'The list of orders', read: true,
    when: (l, g) => inSeason(l) && g.passed('person') && !!l.c?.season?.jobs.length,
    done: (l, g, since) => g.has('noted:list'),
    ask: l => by(l, 'Orders wait on the list at the foot. Point at one: who takes it, or what it waits for.', 'Orders wait on the list at the foot. Tap one: who takes it, or what it waits for.', 'Orders wait on the list at the foot. Backspace takes the last one off.'),
    why: () => 'Its cross takes it off the list; another can be put first.',
    point: () => ({ testid: ['queue-*'] }),
  },
  {
    id: 'turn', part: 'opening', name: 'Turn and tip the view', uses: ['turn', 'tip'],
    when: (l, g) => inSeason(l) && g.passed('person'),
    done: (_l, g) => g.has('turn') || g.has('tip'),
    ask: l => by(l, 'Hold the right button and drag: sideways turns the view, up and down tips it.', 'Twist two fingers on the land to turn the view.', 'Q and E turn the view. Page Up and Page Down tip it.'),
    why: l => by(l, 'Lost? Home, or a double-click on open ground, brings the whole farm back.', 'Lost? A double-tap on open ground brings the whole farm back.', 'Lost? Home brings the whole farm back.'),
  },
  {
    id: 'field', part: 'opening', name: 'Pick a field', uses: ['select'],
    when: (l, g) => inSeason(l) && g.passed('person'),
    done: (_l, g) => g.has('select'),
    ask: l => {
      const i = potatoField(l.c)
      return l.input === 'keys' && l.c ? `Press ${digitOf(l.c, i) || '1'} to pick ${name(i)}.` : `${click(l)} the tag of a field to pick it.`
    },
    why: () => 'Its card opens with how the crop is doing and the orders it can take now.',
    point: l => (l.input === 'keys' ? { field: potatoField(l.c) } : { fields: potatoFields(l.c) }),
  },
  {
    id: 'card', part: 'opening', name: 'Read a field\'s card', read: true,
    when: (l, g) => inSeason(l) && g.passed('field') && l.selection.length > 0,
    done: (l, g, since) => g.has('noted:card') || (!!since && l.selection.length === 0),
    ask: () => 'The card shows the crop: its leaf, water, protection and hilling, and the orders it can take now.',
    why: l => by(l, 'Escape, or the cross, puts the card away.', 'The cross puts the card away.', 'Escape puts the card away.'),
    point: () => ({ testid: ['card'] }),
  },

  // The first year: each the first time it comes.
  {
    id: 'sprayask', part: 'year', name: 'How spraying is done', urgent: true,
    when: l => inSeason(l) && l.asking === 'spray',
    done: (l, _g, since) => !!since && l.asking !== 'spray',
    ask: l => `Blight weather: the crew asks how spraying is to be done. ${by(l, 'Click one reply.', 'Tap one reply.', 'Tab to a reply, then Enter.')}`,
    why: () => 'Spray wears off with rain and new leaf, so it is done again all season. Who does what changes the answer later.',
    point: () => ({ testid: ['spray-way-auto', 'spray-ask'] }),
  },
  {
    id: 'telegram', part: 'year', name: 'Answer a telegram', urgent: true,
    when: l => inSeason(l) && !!l.c && l.c.incidents.length > 0,
    done: (l, _g, since) => !!since && !!l.c && !l.c.incidents.some(i => i.id === since.inc),
    ask: l => by(l, 'A telegram needs an answer. Click a reply; the days left are on it.', 'A telegram needs an answer. Tap a reply; the days left are on it.', 'A telegram needs an answer. Its number keys choose a reply.'),
    why: () => 'The clock stopped for it. Left alone, it lapses to the answer printed at its foot.',
    point: () => ({ testid: ['answer-*', 'incident-open'] }),
  },
  {
    id: 'stopped', part: 'year', name: 'Why the clock stopped', read: true, urgent: true,
    when: l => inSeason(l) && l.speed === 0 && !!l.stopped,
    done: (l, g, since) => g.has('noted:stopped') || (!!since && l.speed > 0),
    ask: () => 'The clock stopped by itself. The note at the foot says why.',
    why: () => 'It stops only for a question, a weigh ticket, frost on barrels in a field, and the season\'s end. Answer it and the days go on.',
  },
  {
    id: 'boards', part: 'year', name: 'Read the forecast', read: true,
    when: (l, g) => inSeason(l) && g.passed('person') && !!l.c && S.forecast(l.world, l.c, 5).some(d => d.rainChance >= 60 || d.blight >= 2 || d.frostChance >= 40),
    done: (l, g, since) => g.has('noted:boards'),
    ask: () => 'Top left, the forecast: rain, frost and blight risk, five days ahead.',
    why: () => 'The yellow slip under it is your next goal, and Show me finds where it is done.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'almanac', part: 'year', name: 'Open the almanac', uses: ['paper:almanac'],
    when: (l, g) => inSeason(l) && g.passed('boards'),
    done: (_l, g) => g.has('paper:almanac'),
    ask: l => by(l, 'Click the forecast to open the almanac: the weather ahead, the soil and every field.', 'Tap the forecast to open the almanac: the weather ahead, the soil and every field.', 'Press I to open the almanac: the weather ahead, the soil and every field.'),
    why: l => by(l, 'It is there whenever you want more than the boards show. The cross closes it.', 'It is there whenever you want more than the boards show. The cross closes it.', 'It is there whenever you want more than the boards show. Escape closes it.'),
    point: () => ({ testid: ['forecast'] }),
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
    why: 'Protectant must be on the leaf before the spores land. Rain and new leaf wear it off: spray again every week or two.',
  }),
  {
    id: 'sprayauto', part: 'year', name: 'Leave spraying to the crew', read: true,
    when: (l, g) => inSeason(l) && g.passed('spray') && !auto(l, 'spray'),
    done: (l, g, since) => auto(l, 'spray') || g.has('noted:sprayauto'),
    ask: l => { const o = l.c ? S.sprayOutlook(l.world, l.c) : null; return o && o.passes ? `Spraying can be left to the crew for the season: about ${o.passes} passes, about ${usd(o.dollars)}.` : 'Spraying can be left to the crew for the season, paying for each spray as it is done.' },
    why: () => 'Who does what switches any kind of work between by itself and asking you.',
  },
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
    why: (l, i) => {
      // The day the crew kills them by itself, as the list's "cannot wait" words it (S.pressing).
      const p = l.c && i >= 0 ? S.pressing(l.world, l.c).find(x => x.kind === 'kill' && x.field === i) : undefined
      const day = p?.inWay.match(/kills the vines on ([A-Z][a-z]+ \d+)/)?.[1]
      return `A trade: small tubers stay small, but skins set in two weeks and frost cannot reach them.${day ? ` Left alone, the crew kills them on ${day}.` : ''}`
    },
  }),
  {
    id: 'owed', part: 'year', name: 'What the year end takes', read: true,
    when: l => inSeason(l) && (jobOn(l, 'dig') || anyField(l, f => f.status === 'digging' || f.status === 'dug' || f.inField >= 0.5)),
    done: (l, g, since) => g.has('noted:owed') || (!!since && !!l.c && l.c.phase !== 'season'),
    ask: () => `The crop pays for the year. At the year end ${owed()} comes due: the bank's note and the household's keep.`,
    why: l => l.c ? `Sold today, everything would leave the farm ${usd(S.moneyNow(l.world, l.c).after)} after those bills.` : 'Sell or store with that in mind.',
    point: () => ({ testid: ['cash'] }),
  },
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
    ask: l => by(l, `${over(l)} Press Close out the season.`, `${over(l)} Tap Close out the season.`, `${over(l)} Close out the season.`),
    why: () => 'Winter is next: what you stored waits in the cellar to be sold.',
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
      ? 'Each month the price moves, storage costs a little and the piles shrink. Spring sprouting ends it.'
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
    done: (l, g, since) => g.has('noted:calls2'),
    ask: () => 'A new season. The crew plants and tends by itself; the calls are yours: spray, water, kill the vines.',
    why: () => 'Blight weather shows in the forecast first, and a stamp comes when each call is due.',
    point: () => ({ testid: ['forecast'] }),
  },
  {
    id: 'pressing', part: 'year', name: 'Work that cannot wait', read: true,
    when: (l, g) => inSeason(l) && g.passed('person') && !!l.c && S.pressing(l.world, l.c).length > 0,
    done: (l, g, since) => g.has('noted:pressing') || (!!since && !!l.c && S.pressing(l.world, l.c).length === 0),
    ask: l => `${pressed(l)} cannot wait.`,
    why: () => 'The note at the foot says what is in its way, and how to clear it.',
  },
  {
    id: 'hand', part: 'spring', name: 'Meet a hand', uses: ['unit:hand'],
    when: (l, g) => inSeason(l) && !!hand(l) && (g.passed('calls2') || (l.c?.history.length ?? 0) === 0),
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
    id: 'grid', part: 'spring', name: 'Who does what', uses: ['open:work-grid'],
    when: l => inSeason(l) && !!l.c && l.c.crew.length >= 3,
    done: (l, g) => g.has('open:work-grid') || !!l.c?.crew.some(u => u.foreman !== ''),
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
