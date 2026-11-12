// Everything the sound check renders: each voice alone, each bed, each cue, the changes between them, and
// one-minute scenes played the way the game plays them. Each carries its place in the loudness plan.
import type { GameEvent } from '../../sim/index.ts'
import { Ambience, Birds, Engine, TRUCK, singer, song, type Singer, type Species } from '../ambience.ts'
import * as cue from '../cues.ts'
import { CUES, Director, type Rank } from '../director.ts'
import { QUIET, sceneFor, type Scene, type SceneInput, type Sky } from '../scene.ts'
import { Brook, Crows, Frost, Geese, Leaves, Peepers } from '../seasons.ts'
import { FADE_IN, FADE_OUT, volumeGain, type Rig } from '../synth.ts'
import { FAR, NEAR, NO_WORK, type WorkScene } from '../work.ts'
import { DEFAULT_VOLUME, type Kind, type Plan } from './report.ts'

export type Feature = 'notes' | 'lines' | 'pulses' | 'knocks' | 'engine' | 'rain' | 'ridge' | 'gusts' | 'blows' | 'low'

export interface Case {
  id: string
  name: string
  kind: Kind
  seconds: number
  solo: boolean
  plan: Plan
  over?: string               // cues: the id of the bed this plays over in the game
  win?: number                // FFT length for the picture
  band?: [number, number]     // also draw a linear close-up of this band
  features?: Feature[]
  ticks?: boolean             // made of drops or sharp blows: its short ticks are the sound, not faults
  periodic?: boolean          // repeats by nature, so the repeat tests do not apply
  song?: boolean              // has birds, frogs or crickets in it
  fadeIn?: boolean            // bring the master volume up from silence, as the live engine does
  season?: string             // one of the four beds that must be told apart with the eyes shut
  cue?: string                // cues: the id in the director's list
  family?: string             // cues: the family it is one of (the warning chime at five pitches is one family)
  rank?: Rank
  play(rig: Rig, seconds: number): void
}

type Layer = 'wind' | 'rain' | 'birds' | 'crickets' | 'brook' | 'peepers' | 'bees' | 'geese' | 'crows' | 'frost' | 'leaves'

function only(s: Scene, keep: Layer[]): Scene {
  const k = (l: Layer, v: number) => (keep.includes(l) ? v : 0)
  return {
    ...s,
    wind: k('wind', s.wind), cold: k('wind', s.cold),
    rain: k('rain', s.rain), heavy: k('rain', s.heavy),
    birds: k('birds', s.birds), crickets: k('crickets', s.crickets),
    brook: k('brook', s.brook), peepers: k('peepers', s.peepers), bees: k('bees', s.bees),
    geese: k('geese', s.geese), crows: k('crows', s.crows), frost: k('frost', s.frost),
    dry: keep.includes('wind') || keep.includes('leaves') ? s.dry : 0,
  }
}

function season(month: number, wind: number, prcp: number, sky: Sky, tmean: number, dom?: number): SceneInput {
  return { place: 'season', month, dom, weather: { wind, prcp, sky, tmean } }
}

// When a one-shot begins.
const START = 0.5

const NOTHING: Scene = { ...QUIET, wind: 0 }

const ev = (type: string, level: GameEvent['level'] = 'info', field = 0, data?: GameEvent['data']): GameEvent => ({ day: 0, type, field, text: '', level, data })

interface Moment {
  input?: SceneInput
  scene?: Scene
  engine?: [number, number]
  work?: Partial<WorkScene>
  truck?: number
  events?: GameEvent[]
  ledger?: boolean
  goal?: boolean
  order?: boolean
  pick?: ['field' | 'tract' | 'person' | 'yard', number]
  run?: (rig: Rig, t: number, amb: Ambience) => void
}

// Steps through a render the way the live engine's frame loop does: the scene, the engines and the work are
// re-read every 150 ms, timed sounds are scheduled 0.4 s ahead, and game events go through the same director.
// `script` is a list of [seconds, what happens then].
function drive(rig: Rig, seconds: number, script: [number, Moment][]): void {
  const amb = new Ambience(rig, 0)
  const director = new Director(rig)
  let scene: Scene = NOTHING
  let engine: [number, number] = [0, 0]
  let work: WorkScene = NO_WORK
  let truck = 0
  let k = 0
  for (let t = 0; t < seconds; t += 0.15) {
    while (k < script.length && script[k][0] < t + 0.15) {
      const [at, m] = script[k++]
      const now = Math.max(at, t)
      if (m.input) scene = sceneFor(m.input)
      if (m.scene) scene = m.scene
      if (m.engine) engine = m.engine
      if (m.work) work = { ...NO_WORK, ...m.work }
      if (m.truck !== undefined) truck = m.truck
      if (m.events) director.events(m.events, now)
      if (m.ledger) director.ledger(now)
      if (m.goal) director.goal(now)
      if (m.order) director.order(now)
      if (m.pick) director.pick(m.pick[0], m.pick[1], now)
      m.run?.(rig, now, amb)
    }
    amb.setScene(scene, t)
    amb.setEngine(engine[0], engine[1], t)
    amb.setWork(work, truck, t)
    amb.schedule(t, t + 0.4)
  }
}

function bed(id: string, name: string, seconds: number, lufs: [number, number], input: SceneInput, keep: Layer[] | null, engine: [number, number] = [0, 0], extra: Partial<Case> = {}): Case {
  const scene = keep ? only(sceneFor(input), keep) : sceneFor(input)
  return {
    id, name, seconds, kind: keep && keep.length === 1 ? 'voice' : 'bed', solo: keep !== null && keep.length === 1, plan: { lufs },
    song: scene.birds > 0 || scene.crickets > 0 || scene.peepers > 0,
    play(rig, secs) { drive(rig, secs, [[0, { scene, engine }]]) },
    ...extra,
  }
}

// The ridge layer of the wind by itself, to measure where its band sits.
function ridge(id: string, name: string, wind: number): Case {
  return {
    id, name, seconds: 60, kind: 'voice', solo: true, features: ['ridge'], plan: {},
    play(rig, secs) {
      drive(rig, secs, [[0, {
        scene: only(sceneFor(season(5, wind, 0, 'overcast', 12)), ['wind']),
        run: (_r, _t, amb) => { for (const layer of [amb.wind.level, amb.wind.leafLevel, amb.wind.cold]) layer.output.disconnect() },
      }]])
    },
  }
}

function tractor(id: string, name: string, lufs: [number, number], level: number, load: number): Case {
  return {
    id, name, seconds: 16, kind: 'voice', solo: true, win: 16384, features: ['engine'], periodic: true, plan: { lufs },
    play(rig, secs) { drive(rig, secs, [[0, { scene: NOTHING, engine: [level, load] }]]) },
  }
}

function bird(id: string, name: string, species: Species, seconds: number, shape: Partial<Singer> = {}): Case {
  return {
    id, name, seconds, kind: 'voice', solo: true, win: 1024, band: [1500, 7500], features: ['notes'], periodic: true, plan: { momentary: [-38, -27] },
    play(rig) {
      const b = new Birds(rig)
      song(rig, b.out, START, { ...singer(rig, species), pan: 0, near: 1, ...shape })
    },
  }
}

function oneShot(id: string, name: string, seconds: number, momentary: [number, number], over: string, play: (rig: Rig) => void, extra: Partial<Case> = {}): Case {
  return { id, name, seconds, kind: 'cue', solo: true, over, win: 2048, plan: { momentary }, cue: id.slice(4), play, ...extra }
}

function warning(id: string, cueId: string, name: string, over: string, hz: number): Case {
  return oneShot(id, name, 10, [-28, -22], over, r => cue.chime(r, START, hz), { win: 4096, features: ['lines'], plan: { momentary: [-28, -22], carries: true }, cue: cueId, family: 'warn', rank: 2 })
}

// One kind of work alone, as near as it comes or far off.
function work(id: string, name: string, seconds: number, lufs: [number, number], w: Partial<WorkScene>, extra: Partial<Case> = {}): Case {
  return {
    id, name, seconds, kind: 'voice', solo: true, periodic: true, ticks: true, plan: { lufs },
    play(rig, secs) { drive(rig, secs, [[0, { scene: NOTHING, work: w }]]) },
    ...extra,
  }
}

// A voice of the seasons alone and close, started at once so that a short render holds it.
function voice(id: string, name: string, seconds: number, plan: Plan, play: (rig: Rig, seconds: number) => void, extra: Partial<Case> = {}): Case {
  return { id, name, seconds, kind: 'voice', solo: true, periodic: true, plan, play, ...extra }
}

function steps(secs: number, each: (from: number, to: number) => void): void {
  for (let t = 0; t < secs; t += 0.15) each(t, t + 0.4)
}

const JUNE = season(5, 3.2, 0, 'clear', 17)
const WET_AUGUST = season(7, 4, 9, 'rain', 17)
const DRIZZLE_AUGUST = season(7, 3, 0.5, 'overcast', 17)
const SEPTEMBER = season(8, 5, 0, 'cloud', 12)
const STORM = season(7, 9, 45, 'storm', 18)
const CELLAR: SceneInput = { place: 'cellar', month: 10, weather: null }
const YEAR_END: SceneInput = { place: 'yearEnd', month: 4, weather: null }
// The four that must be told apart with the eyes shut.
const SPRING = season(4, 3, 0, 'clear', 12, 20)
const HIGH_SUMMER = season(7, 2.5, 0, 'clear', 20, 5)
const HARVEST = season(9, 5, 0, 'cloud', 9, 5)
const DEEP_WINTER: SceneInput = { place: 'cellar', month: 0, weather: null }

// How loud a cue of each rank may be at its loudest 400 ms, in LUFS at the default volume.
export const RANK_PLAN: Record<Rank, Plan> = {
  0: { momentary: [-42, -31] },
  1: { momentary: [-31, -24] },
  2: { momentary: [-29, -22] },
  3: { momentary: [-27, -20], carries: true },
}

// The cues of the farmstead: [id in the director's list, seconds to render, the bed it is heard over, what to
// measure, the argument it is played with].
const FARMSTEAD: [string, number, string, Feature[], number][] = [
  ['pickField', 2, 'bed-june', [], 0],
  ['pickTract', 2, 'bed-june', [], 14],
  ['pickPerson', 2, 'bed-june-work', ['lines'], 1],
  ['pickYard', 2, 'bed-june', [], -1],
  ['heard', 2, 'bed-june-work', [], 0],
  ['rocks', 3, 'bed-june', ['blows'], 0],
  ['brushed', 3, 'bed-september', [], 0],
  ['ticket', 4, 'bed-september-work', ['blows'], 0],
  ['felled', 7.5, 'bed-september', ['blows', 'low'], 0],
  ['stumped', 5, 'bed-june', ['blows', 'low'], 0],
  ['tiled', 4.5, 'bed-june', ['lines'], 0],
  ['logs', 4.5, 'bed-cellar-november', ['blows'], 0],
  ['begun', 3.5, 'bed-june', ['blows'], 0],
  ['built', 5, 'bed-june-work', ['blows', 'lines'], 0],
  ['hired', 4, 'bed-plan', ['blows'], 0],
  ['left', 4.5, 'bed-august-rain', ['blows'], 0],
  ['better', 5, 'bed-june-work', ['lines'], 0],
  ['wornOut', 8, 'bed-june-work', ['lines'], 0],
  ['unhappy', 8, 'bed-june-work', ['lines'], 0],
  ['hurt', 8, 'bed-june-work', ['lines'], 0],
  ['signed', 3.5, 'bed-plan', ['blows'], 0],
  ['deed', 3.5, 'bed-plan', ['blows'], 0],
  ['paidOff', 4, 'bed-year-end', ['blows'], 0],
  ['brokeDown', 4.5, 'bed-june-work', ['blows'], 0],
  ['repaired', 4.5, 'bed-june', ['blows'], 0],
  ['door', 4.5, 'bed-june-work', ['blows', 'lines'], 0],
  ['settled', 3.5, 'bed-june', [], 0],
  ['goal', 9, 'bed-june-work', ['lines'], 0],
]

const farmstead: Case[] = FARMSTEAD.map(([id, seconds, over, features, arg]) => {
  const spec = CUES.find(c => c.id === id)!
  // The knock that answers every order is the one routine cue kept under the rest: it sounds more often than any.
  const plan = id === 'heard' ? { momentary: [-38, -27] as [number, number] } : RANK_PLAN[spec.rank]
  return oneShot(`cue-${id}`, `cue: ${id} (${spec.on})`, seconds, plan.momentary!, over, r => { spec.play(r, START, arg) }, {
    features, plan, family: spec.share, rank: spec.rank, win: seconds > 6 ? 4096 : 2048,
  })
})

// Every event of the farmstead, in the order a year might bring them.
const FARM_YEAR: [number, Moment][] = [
  [1, { events: [ev('hired')] }], [3, { events: [ev('accepted')] }], [4.5, { events: [ev('landBought', 'good')] }],
  [6.5, { events: [ev('building')] }], [8.5, { pick: ['person', 1] }], [9.5, { pick: ['yard', -1] }], [10.5, { pick: ['tract', 14] }],
  [11.5, { pick: ['field', 2] }], [12, { order: true }], [13.5, { events: [ev('rocks')] }], [15.5, { events: [ev('brushed')] }],
  [17.5, { events: [ev('skillUp', 'good', -1)] }], [19.5, { events: [ev('wornOut', 'warn', -1)] }], [22, { events: [ev('breakdown', 'warn', -1)] }],
  [25, { events: [ev('repaired', 'good', -1)] }], [28, { events: [ev('incident', 'warn', -1, { kind: 'applicant' })] }],
  [31, { events: [ev('incidentDone', 'info', -1)] }], [33, { events: [ev('built', 'good', -1)] }], [36, { goal: true }],
  [40, { events: [ev('hurt', 'bad', -1)] }], [43, { events: [ev('weighed', 'good')] }], [46, { events: [ev('felled', 'good', 14)] }],
  [51, { events: [ev('stumped', 'good', 14)] }], [54, { events: [ev('tiled', 'good', 5)] }], [57, { events: [ev('logsSold', 'good', -1)] }],
  [60, { events: [ev('mortgagePaid', 'good', -1)] }], [62.5, { events: [ev('quit', 'bad', -1)] }],
]

const ALL_NEAR: WorkScene = { fell: NEAR, rocks: NEAR, brush: NEAR, build: NEAR, barrels: NEAR }
const ALL_FAR: WorkScene = { fell: FAR, rocks: FAR, brush: FAR, build: FAR, barrels: FAR }

export const CASES: Case[] = [
  bed('bed-title', 'bed: title screen', 30, [-48, -35], { place: 'title', month: 5, weather: null }, null),
  bed('bed-plan', 'bed: spring plan', 24, [-48, -35], { place: 'plan', month: 3, weather: null }, null),
  bed('bed-june', 'bed: June, fair', 30, [-43, -33], JUNE, null),
  bed('bed-june-work', 'bed: June, fair, tractor working', 24, [-38, -31], JUNE, null, [1, 1]),
  bed('bed-august-rain', 'bed: August, steady rain, 9 mm', 24, [-37, -30], WET_AUGUST, null, [0, 0], { ticks: true }),
  bed('bed-august-rain-work', 'bed: August, drizzle, tractor working', 24, [-38, -31], DRIZZLE_AUGUST, null, [1, 1], { ticks: true }),
  bed('bed-august-evening', 'bed: August, fair and warm, crickets', 24, [-45, -35], season(7, 2.5, 0, 'clear', 19), null),
  bed('bed-september', 'bed: late September, fair', 24, [-43, -33], SEPTEMBER, null, [0, 0], { ticks: true }),
  bed('bed-september-work', 'bed: late September, digging', 24, [-38, -31], SEPTEMBER, null, [1, 1], { ticks: true }),
  bed('bed-october-gale', 'bed: October gale, 11 m/s', 48, [-32, -26], season(9, 11, 0, 'overcast', 6), null, [0, 0], { ticks: true }),
  bed('bed-storm-work', 'bed: storm, 45 mm, tractor working (the loudest bed)', 48, [-29, -22], STORM, null, [1, 1], { ticks: true }),
  bed('bed-cellar-november', 'bed: cellar, November', 48, [-50, -40], CELLAR, null, [0, 0], { ticks: true }),
  bed('bed-cellar-january', 'bed: cellar, January', 48, [-50, -40], DEEP_WINTER, null, [0, 0], { ticks: true }),
  bed('bed-year-end', 'bed: ledger and year end', 24, [-48, -35], YEAR_END, null),
  bed('bed-may-rain', 'bed: mild wet May day, the peepers at their height', 30, [-43, -33], season(4, 2.5, 4, 'rain', 11, 10), null, [0, 0], { ticks: true }),
  bed('bed-july', 'bed: July, fair, the potatoes in blossom', 40, [-45, -33], season(6, 2.5, 0, 'clear', 21, 15), null),
  bed('bed-snow', 'bed: November, snow on the dug fields', 40, [-50, -36], season(10, 4, 3, 'snow', -4, 5), null, [0, 0], { ticks: true }),
  {
    id: 'bed-work-far', name: 'bed: June, fair, every kind of work going on somewhere, none picked', seconds: 40, kind: 'bed', solo: false, song: true, ticks: true, plan: { lufs: [-43, -33] },
    play(rig, secs) { drive(rig, secs, [[0, { input: JUNE, work: ALL_FAR }]]) },
  },

  bed('season-spring', 'season: spring, a fair morning in late May', 60, [-43, -33], SPRING, null, [0, 0], { season: 'spring' }),
  bed('season-summer', 'season: high summer, a warm day in early August', 60, [-45, -35], HIGH_SUMMER, null, [0, 0], { season: 'high summer' }),
  bed('season-harvest', 'season: harvest, a grey day in early October', 60, [-43, -33], HARVEST, null, [0, 0], { season: 'harvest', ticks: true }),
  bed('season-winter', 'season: deep winter, January', 60, [-50, -40], DEEP_WINTER, null, [0, 0], { season: 'deep winter', ticks: true }),

  bed('wind-breeze', 'wind: breeze, 3.2 m/s, 90 s', 90, [-48, -38], season(5, 3.2, 0, 'overcast', 15), ['wind'], [0, 0], { features: ['gusts'] }),
  bed('wind-gale', 'wind: gale, 11 m/s, October', 48, [-32, -26], season(9, 11, 0, 'overcast', 6), ['wind'], [0, 0], { features: ['gusts'] }),
  ridge('wind-ridge-breeze', 'wind: the spruce ridge alone, 3.2 m/s', 3.2),
  ridge('wind-ridge-gale', 'wind: the spruce ridge alone, 7.5 m/s and over', 11),
  {
    id: 'wind-cold', name: 'wind: cold whistle alone', seconds: 48, kind: 'voice', solo: true, plan: { lufs: [-54, -42] },
    play(rig, secs) { drive(rig, secs, [[0, { scene: { ...NOTHING, cold: 0.7 } }]]) },
  },
  bed('rain-light', 'rain: light, 3 mm', 24, [-45, -36], season(6, 2, 3, 'rain', 16), ['rain'], [0, 0], { ticks: true, features: ['rain'] }),
  bed('rain-heavy', 'rain: heavy, 18 mm', 24, [-35, -28], season(6, 4, 18, 'rain', 16), ['rain'], [0, 0], { ticks: true, features: ['rain'] }),
  bed('rain-storm', 'rain: storm, 45 mm', 24, [-32, -25], STORM, ['rain'], [0, 0], { ticks: true, features: ['rain'] }),
  bed('birds-may', 'birds: May morning, 60 s', 60, [-44, -30], season(4, 2, 0, 'clear', 12), ['birds'], [0, 0], { band: [1500, 7500], periodic: true }),
  bird('bird-sparrow', 'bird: white-throated sparrow, rising form', 'sparrow', 6, { rising: true, pitch: 3200, step: 1.26, third: false, slurred: true, triplets: 2 }),
  bird('bird-sparrow-falling', 'bird: white-throated sparrow, falling form', 'sparrow', 6, { rising: false, pitch: 3480, step: 1.26, third: true, slurred: false, triplets: 2 }),
  bird('bird-chickadee', 'bird: black-capped chickadee, the spring whistle', 'chickadee', 3, { pitch: 3814 }),
  bird('bird-robin', 'bird: American robin, one group of phrases', 'robin', 6.5),
  bird('bird-junco', 'bird: dark-eyed junco', 'junco', 4, { pitch: 4600 }),
  bird('bird-dee', 'bird: black-capped chickadee, the call it keeps all year', 'dee', 3.5, { pitch: 3750, count: 4 }),
  bed('crickets', 'crickets: August, 20 C', 24, [-48, -38], season(7, 2, 0, 'clear', 20), ['crickets'], [0, 0], { band: [3500, 6000], periodic: true }),
  {
    id: 'cricket-one', name: 'crickets: one cricket, 20 C', seconds: 8, kind: 'voice', solo: true, win: 1024, band: [3500, 6000], features: ['pulses'], periodic: true, plan: {},
    play(rig, secs) {
      const a = new Ambience(rig, 0)
      a.setScene(only(sceneFor(season(7, 2, 0, 'clear', 20)), ['crickets']), 0)
      a.crickets.next = a.crickets.next.map((_, k) => (k === 0 ? 0.2 : 1e9))
      a.schedule(0, secs)
    },
  },

  voice('brook', 'spring: the brook in flood', 30, { lufs: [-52, -40] }, (rig, secs) => {
    const b = new Brook(rig)
    b.set(1, 0)
    steps(secs, (from, to) => b.schedule(from, to))
  }, { periodic: false, ticks: true, features: ['rain'] }),
  voice('peepers', 'spring: the peepers, 12 C', 30, { lufs: [-48, -37] }, (rig, secs) => {
    const p = new Peepers(rig)
    p.set(1, sceneFor(season(4, 2, 2, 'overcast', 12, 10)).peeps, 0)
    steps(secs, (from, to) => p.schedule(from, to))
  }, { band: [2200, 3800], song: true }),
  voice('peeper-one', 'spring: one peeper, 12 C', 8, {}, (rig, secs) => {
    const p = new Peepers(rig)
    p.set(1, sceneFor(season(4, 2, 2, 'overcast', 12, 10)).peeps, 0)
    p.next = p.next.map((_, k) => (k === 0 ? 0.2 : 1e9))
    p.schedule(0, secs)
  }, { win: 1024, band: [2200, 3800], features: ['notes'] }),
  bed('bee', 'summer: bumblebees in the blossom, 60 s', 60, [-56, -40], season(6, 2, 0, 'clear', 21, 20), ['bees'], [0, 0], { periodic: true, win: 8192, features: ['low'] }),
  voice('geese', 'harvest: a skein of geese going over', 22, { momentary: [-40, -28] }, (rig, secs) => {
    const g = new Geese(rig)
    g.set(1)
    g.pace.first = [0.5, 0]
    steps(secs, (from, to) => g.schedule(from, to))
  }, { band: [300, 3200], features: ['lines'] }),
  voice('crow', 'harvest: a crow, one series of caws', 5, { momentary: [-42, -29] }, (rig, secs) => {
    const c = new Crows(rig)
    c.set(1)
    c.pace.first = [0.5, 0]
    c.schedule(0, 1)
    void secs
  }, { band: [300, 4000], features: ['blows'] }),
  voice('leaves', 'harvest: dry leaves blowing, wind 5 m/s', 30, { lufs: [-56, -42] }, (rig, secs) => {
    const l = new Leaves(rig)
    l.set(1, 0.62, 0)
    void secs
  }, { periodic: false, ticks: true }),
  voice('frost', 'winter: a tree cracking in the frost', 6, { momentary: [-40, -27] }, (rig, secs) => {
    const f = new Frost(rig)
    f.set(1)
    f.pace.first = [0.5, 0]
    f.schedule(0, 1)
    void secs
  }, { ticks: true, features: ['blows'] }),

  tractor('tractor-working', 'tractor: working', [-41, -33], 1, 1),
  tractor('tractor-idle', 'tractor: idling (work on foot)', [-48, -38], 0.4, 0),
  {
    id: 'truck-hauling', name: 'truck: hauling, picked', seconds: 16, kind: 'voice', solo: true, win: 16384, features: ['engine'], periodic: true, plan: { lufs: [-44, -34] },
    play(rig, secs) {
      const e = new Engine(rig, 0, TRUCK)
      steps(secs, (from, to) => { e.set(1, 1, from); e.schedule(from, to) })
    },
  },

  work('work-fell', 'work: felling, picked (axe, crosscut, and a tree down)', 75, [-40, -29], { fell: NEAR }, { features: ['low'] }),
  work('work-fell-far', 'work: felling, somewhere on the farm', 40, [-56, -41], { fell: FAR }),
  work('work-rocks', 'work: picking rocks, picked', 30, [-46, -32], { rocks: NEAR }),
  work('work-brush', 'work: cutting brush and burning it, picked', 30, [-42, -31], { brush: NEAR }),
  work('work-build', 'work: building, picked (nails, a hand saw, boards)', 45, [-40, -29], { build: NEAR }),
  work('work-barrels', 'work: barrels down the potato-house ramp, picked', 30, [-44, -31], { barrels: NEAR }),
  work('work-all', 'work: every kind at once, all picked', 30, [-37, -26], ALL_NEAR, { solo: false, kind: 'bed' }),

  oneShot('cue-planted', 'cue: planted', 2.5, [-31, -24], 'bed-june-work', r => cue.planted(r, START), { rank: 1 }),
  oneShot('cue-hilled', 'cue: hilled', 2.5, [-31, -24], 'bed-june-work', r => cue.hilled(r, START), { rank: 1 }),
  oneShot('cue-sprayed', 'cue: sprayed', 2.5, [-31, -24], 'bed-august-rain-work', r => cue.sprayed(r, START), { rank: 1 }),
  oneShot('cue-watered', 'cue: watered', 3.5, [-31, -24], 'bed-june-work', r => cue.watered(r, START), { rank: 1 }),
  oneShot('cue-test-dig', 'cue: test dig (6 tubers on the tray)', 4.5, [-28, -21], 'bed-august-evening', r => { cue.barrel(r, START, 'sample', 6) }, { features: ['knocks'], plan: { momentary: [-28, -21], carries: true }, cue: 'sample', family: 'barrel', rank: 3 }),
  oneShot('cue-dug', 'cue: dug (a basket into the barrel)', 6.5, [-28, -21], 'bed-september-work', r => { cue.barrel(r, START, 'dig', 0) }, { features: ['knocks'], plan: { momentary: [-28, -21], carries: true }, family: 'barrel', rank: 3 }),
  oneShot('cue-sold', 'cue: sold', 3, [-31, -24], 'bed-cellar-november', r => cue.sold(r, START), { features: ['lines'], rank: 1 }),
  warning('cue-warn-frost', 'warnFrost', 'cue: warning, frost (C4)', 'bed-september', 261.6),
  warning('cue-warn-watch', 'warnWatch', 'cue: warning, blight watch (A3)', 'bed-august-rain', 220),
  warning('cue-warn-seen', 'warnSeen', 'cue: warning, blight seen (G3)', 'bed-august-rain', 196),
  warning('cue-warn-dry', 'warnDry', 'cue: warning, dry (E3)', 'bed-june-work', 164.8),
  warning('cue-warn-lost', 'warnLost', 'cue: warning, a field lost (D3)', 'bed-september', 146.8),
  oneShot('cue-ledger', 'cue: year-end ledger', 11, [-28, -21], 'bed-year-end', r => { cue.cadence(r, START, 'ledger') }, { win: 4096, features: ['lines'], family: 'close', rank: 3 }),
  oneShot('cue-kept', 'cue: five seasons kept', 14, [-26, -20], 'bed-year-end', r => { cue.cadence(r, START, 'kept') }, { win: 4096, features: ['lines'], family: 'close', rank: 3 }),
  oneShot('cue-lost', 'cue: the farm lost', 16, [-30, -23], 'bed-year-end', r => { cue.cadence(r, START, 'lost') }, { win: 4096, features: ['lines'], family: 'close', rank: 3 }),
  ...farmstead,

  {
    id: 'change-weather', name: 'change: fair, then storm, then fair again', seconds: 40, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) { drive(rig, secs, [[0, { input: JUNE }], [8, { input: STORM }], [22, { input: JUNE }]]) },
  },
  {
    id: 'change-tractor', name: 'change: tractor starts, works, idles, stops', seconds: 20, kind: 'change', solo: false, win: 8192, plan: {},
    play(rig, secs) { drive(rig, secs, [[0, { scene: NOTHING }], [1, { engine: [1, 1] }], [8, { engine: [0.4, 0] }], [13, { engine: [0, 0] }]]) },
  },
  {
    id: 'change-mute', name: 'change: sound off and on again, tab hidden and shown', seconds: 14, kind: 'change', solo: false, plan: {},
    play(rig, secs) {
      drive(rig, secs, [[0, { input: JUNE, engine: [1, 1] }]])
      const v = volumeGain(DEFAULT_VOLUME)
      for (const t of [5, 9]) {
        rig.volume.gain.setTargetAtTime(0, t, FADE_OUT)
        rig.volume.gain.setTargetAtTime(v, t + 1.5, FADE_IN)
      }
    },
  },
  {
    id: 'change-places', name: 'change: title, plan, season, cellar, ledger with its close', seconds: 44, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: { place: 'title', month: 5, weather: null } }], [8, { input: { place: 'plan', month: 3, weather: null } }],
        [16, { input: JUNE }], [24, { input: CELLAR }], [32, { input: YEAR_END, ledger: true }],
      ])
    },
  },
  {
    id: 'change-cues', name: 'change: every cue of the crop once, in the order of a year', seconds: 44, kind: 'change', solo: false, plan: {},
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: season(4, 2.5, 0, 'cloud', 11) }],
        [2, { events: [ev('planted')] }], [4.5, { events: [ev('hilled')] }], [7, { events: [ev('watered')] }], [9.5, { events: [ev('sprayed')] }],
        [12, { events: [ev('watch', 'warn', -1)] }], [16, { events: [ev('sample', 'info', 0, { weights: [1, 2, 3, 4, 5] })] }],
        [20, { events: [ev('dug', 'good')] }], [25, { events: [ev('sold', 'good')] }], [27, { input: YEAR_END, ledger: true }],
        [33, { events: [ev('kept', 'good', -1)] }],
      ])
    },
  },
  {
    id: 'change-farmstead', name: 'change: every cue of the farmstead once, in the order of a year', seconds: 68, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) { drive(rig, secs, [[0, { input: season(4, 2.5, 0, 'cloud', 11) }], ...FARM_YEAR]) },
  },
  {
    id: 'change-pileup', name: 'change: one day brings a tract felled, a building up, a level gained, a weigh ticket and a knock at the door; then a goal', seconds: 20, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: SEPTEMBER }],
        [2, { events: [ev('felled', 'good', 14), ev('built', 'good', -1), ev('skillUp', 'good', -1), ev('rocks'), ev('weighed', 'good'), ev('incident', 'warn', -1, { kind: 'buyer' })] }],
        [2.1, { goal: true }],
      ])
    },
  },
  {
    id: 'change-work', name: 'change: felling far, picked, far again and stopped; then building picked and stopped', seconds: 44, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: HARVEST }], [2, { work: { fell: FAR } }], [10, { work: { fell: NEAR }, pick: ['person', 2] }], [20, { work: { fell: FAR } }],
        [26, { work: {} }], [28, { work: { build: NEAR }, pick: ['yard', -1] }], [38, { work: {} }],
      ])
    },
  },
  {
    id: 'change-seasons', name: 'change: the year in a minute, May, August, October, January', seconds: 64, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) { drive(rig, secs, [[0, { input: SPRING }], [16, { input: HIGH_SUMMER }], [32, { input: HARVEST }], [48, { input: DEEP_WINTER }]]) },
  },
  {
    id: 'seam-loops', name: 'seam: every looped buffer wrapping round', seconds: 6, kind: 'change', solo: false, ticks: true, plan: {},
    play(rig, secs) {
      // Every loop is started just short of its end, so each wraps inside this render.
      rig.rand = () => 0.9999
      drive(rig, secs, [[0, { input: season(7, 6, 12, 'rain', 16), engine: [1, 1] }]])
    },
  },

  {
    id: 'scene-june', name: 'scene: fair June morning, the farmer planting', seconds: 60, kind: 'scene', solo: false, fadeIn: true, plan: { lufs: [-38, -29] },
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: JUNE }], [6, { engine: [1, 1] }],
        [24, { events: [ev('planted')] }], [41, { events: [ev('planted', 'info', 1)] }],
        [46, { engine: [0, 0] }],
      ])
    },
  },
  {
    id: 'scene-august', name: 'scene: wet August day, blight warning, spraying', seconds: 60, kind: 'scene', solo: false, fadeIn: true, ticks: true, plan: { lufs: [-38, -29] },
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: WET_AUGUST }],
        [12, { events: [ev('watch', 'warn', -1)] }],
        [24, { input: DRIZZLE_AUGUST }], [30, { engine: [1, 1] }],
        [44, { events: [ev('sprayed')] }],
        [52, { engine: [0, 0], events: [ev('blightSeen', 'bad', 2)] }],
      ])
    },
  },
  {
    id: 'scene-dig', name: 'scene: dig day in late September, then a sale', seconds: 60, kind: 'scene', solo: false, fadeIn: true, ticks: true, plan: { lufs: [-38, -29] },
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: SEPTEMBER }], [4, { engine: [1, 1] }],
        [20, { engine: [0, 0], events: [ev('dug', 'good')] }],
        [28, { engine: [1, 1] }],
        [40, { engine: [0, 0], events: [ev('dug', 'good', 1)] }],
        [47, { input: CELLAR }],
        [54, { events: [ev('sold', 'good')] }],
      ])
    },
  },
  {
    id: 'scene-clearing', name: 'scene: October, a hand felling the woodlot: far, then picked, the last tree, a level gained', seconds: 60, kind: 'scene', solo: false, fadeIn: true, ticks: true, plan: { lufs: [-38, -27] },
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: HARVEST, work: { fell: FAR } }],
        [14, { pick: ['person', 2], work: { fell: NEAR } }],
        [44, { work: {}, events: [ev('felled', 'good', 14), ev('skillUp', 'good', -1)] }],
        [50, { pick: ['tract', 14] }], [52, { events: [ev('stumping', 'info', 14)] }],
      ])
    },
  },
  {
    id: 'scene-haul', name: 'scene: the crop coming in: digging, the truck hauling, the yard picked, the weigh ticket, a goal met', seconds: 60, kind: 'scene', solo: false, fadeIn: true, ticks: true, plan: { lufs: [-38, -27] },
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: SEPTEMBER }], [3, { engine: [1, 1] }],
        [12, { events: [ev('dug', 'good')], work: { barrels: FAR }, truck: 0.45 }],
        [22, { pick: ['yard', -1], work: { barrels: NEAR }, truck: 1 }],
        [40, { engine: [0, 0], work: {}, truck: 0, events: [ev('weighed', 'good')] }], [40.1, { goal: true }],
        [48, { events: [ev('incident', 'warn', -1, { kind: 'buyer' })] }], [54, { events: [ev('incidentDone', 'good', -1), ev('sold', 'good')] }],
      ])
    },
  },
  {
    id: 'scene-raising', name: 'scene: June, a potato house going up in the yard: picked, the last nail, a goal met, someone hired', seconds: 60, kind: 'scene', solo: false, fadeIn: true, ticks: true, plan: { lufs: [-38, -27] },
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: JUNE, work: { build: FAR, rocks: FAR } }],
        [10, { pick: ['yard', -1], work: { build: NEAR, rocks: FAR } }],
        [36, { work: { rocks: FAR }, events: [ev('built', 'good', -1), ev('rocks')] }], [36.1, { goal: true }],
        [46, { work: {}, events: [ev('incident', 'warn', -1, { kind: 'applicant' })] }], [52, { events: [ev('hired'), ev('incidentDone', 'info', -1)] }],
      ])
    },
  },

  {
    id: 'stress', name: 'stress: storm, gale, engines, every kind of work and every cue at once', seconds: 9, kind: 'stress', solo: false, ticks: true, plan: {},
    play(rig, secs) {
      const s = sceneFor(season(9, 12, 60, 'storm', 4))
      drive(rig, secs, [[0, {
        scene: { ...s, birds: 6, crickets: 1, chirps: 2.5, month: 5, brook: 1, peepers: 1, bees: 1, geese: 1, crows: 1, frost: 1, dry: 1, leaf: 1 },
        engine: [1, 1], work: ALL_NEAR, truck: 1,
      }]])
      for (const t of [2.5, 4.5]) for (const c of CUES) c.play(rig, t, 0)
    },
  },
]

// The bed every cue is also measured against: the loudest one the game can make.
export const WORST_BED = 'bed-storm-work'
