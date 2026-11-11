// Everything the sound check renders: each voice alone, each bed, each cue, the changes between them, and
// three one-minute scenes played the way the game plays them. Each carries its place in the loudness plan.
import type { GameEvent } from '../../sim/index.ts'
import { Ambience, Birds, singer, song, type Singer, type Species } from '../ambience.ts'
import * as cue from '../cues.ts'
import { Director } from '../director.ts'
import { sceneFor, type Scene, type SceneInput, type Sky } from '../scene.ts'
import { FADE_IN, FADE_OUT, volumeGain, type Rig } from '../synth.ts'
import { DEFAULT_VOLUME, type Kind, type Plan } from './report.ts'

export type Feature = 'notes' | 'lines' | 'pulses' | 'knocks' | 'engine' | 'rain' | 'ridge' | 'gusts'

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
  ticks?: boolean             // made of drops: its short ticks are the sound, not faults
  periodic?: boolean          // repeats by nature, so the repeat tests do not apply
  song?: boolean              // has birds or crickets in it
  fadeIn?: boolean            // bring the master volume up from silence, as the live engine does
  play(rig: Rig, seconds: number): void
}

type Layer = 'wind' | 'rain' | 'birds' | 'crickets'

function only(s: Scene, keep: Layer[]): Scene {
  return {
    ...s,
    wind: keep.includes('wind') ? s.wind : 0,
    cold: keep.includes('wind') ? s.cold : 0,
    rain: keep.includes('rain') ? s.rain : 0,
    heavy: keep.includes('rain') ? s.heavy : 0,
    birds: keep.includes('birds') ? s.birds : 0,
    crickets: keep.includes('crickets') ? s.crickets : 0,
  }
}

function season(month: number, wind: number, prcp: number, sky: Sky, tmean: number): SceneInput {
  return { place: 'season', month, weather: { wind, prcp, sky, tmean } }
}

// When a one-shot begins.
const START = 0.5

const NOTHING: Scene = { wind: 0, cold: 0, rain: 0, heavy: 0, birds: 0, crickets: 0, chirps: 0, pulse: 0.05, month: 5 }

const ev = (type: string, level: GameEvent['level'] = 'info', field = 0, data?: GameEvent['data']): GameEvent => ({ day: 0, type, field, text: '', level, data })

interface Moment {
  input?: SceneInput
  scene?: Scene
  engine?: [number, number]
  events?: GameEvent[]
  ledger?: boolean
  run?: (rig: Rig, t: number, amb: Ambience) => void
}

// Steps through a render the way the live engine's frame loop does: the scene and the tractor are re-read every
// 150 ms, timed sounds are scheduled 0.4 s ahead, and game events go through the same director.
// `script` is a list of [seconds, what happens then].
function drive(rig: Rig, seconds: number, script: [number, Moment][]): void {
  const amb = new Ambience(rig, 0)
  const director = new Director(rig)
  let scene: Scene = NOTHING
  let engine: [number, number] = [0, 0]
  let k = 0
  for (let t = 0; t < seconds; t += 0.15) {
    while (k < script.length && script[k][0] < t + 0.15) {
      const [at, m] = script[k++]
      const now = Math.max(at, t)
      if (m.input) scene = sceneFor(m.input)
      if (m.scene) scene = m.scene
      if (m.engine) engine = m.engine
      if (m.events) director.events(m.events, now)
      if (m.ledger) director.ledger(now)
      m.run?.(rig, now, amb)
    }
    amb.setScene(scene, t)
    amb.setEngine(engine[0], engine[1], t)
    amb.schedule(t, t + 0.4)
  }
}

function bed(id: string, name: string, seconds: number, lufs: [number, number], input: SceneInput, keep: Layer[] | null, engine: [number, number] = [0, 0], extra: Partial<Case> = {}): Case {
  const scene = keep ? only(sceneFor(input), keep) : sceneFor(input)
  return {
    id, name, seconds, kind: keep && keep.length === 1 ? 'voice' : 'bed', solo: keep !== null && keep.length === 1, plan: { lufs },
    song: scene.birds > 0 || scene.crickets > 0,
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
  return { id, name, seconds, kind: 'cue', solo: true, over, win: 2048, plan: { momentary }, play, ...extra }
}

function warning(id: string, name: string, over: string, hz: number): Case {
  return oneShot(id, name, 10, [-28, -22], over, r => cue.chime(r, START, hz), { win: 4096, features: ['lines'], plan: { momentary: [-28, -22], carries: true } })
}

const JUNE = season(5, 3.2, 0, 'clear', 17)
const WET_AUGUST = season(7, 4, 9, 'rain', 17)
const DRIZZLE_AUGUST = season(7, 3, 0.5, 'overcast', 17)
const SEPTEMBER = season(8, 5, 0, 'cloud', 12)
const STORM = season(7, 9, 45, 'storm', 18)
const CELLAR: SceneInput = { place: 'cellar', month: 10, weather: null }
const YEAR_END: SceneInput = { place: 'yearEnd', month: 4, weather: null }

export const CASES: Case[] = [
  bed('bed-title', 'bed: title screen', 30, [-48, -35], { place: 'title', month: 5, weather: null }, null),
  bed('bed-plan', 'bed: spring plan', 24, [-48, -35], { place: 'plan', month: 3, weather: null }, null),
  bed('bed-june', 'bed: June, fair', 30, [-43, -33], JUNE, null),
  bed('bed-june-work', 'bed: June, fair, tractor working', 24, [-38, -31], JUNE, null, [1, 1]),
  bed('bed-august-rain', 'bed: August, steady rain, 9 mm', 24, [-37, -30], WET_AUGUST, null, [0, 0], { ticks: true }),
  bed('bed-august-rain-work', 'bed: August, drizzle, tractor working', 24, [-38, -31], DRIZZLE_AUGUST, null, [1, 1], { ticks: true }),
  bed('bed-august-evening', 'bed: August, fair and warm, crickets', 24, [-45, -35], season(7, 2.5, 0, 'clear', 19), null),
  bed('bed-september', 'bed: late September, fair', 24, [-43, -33], SEPTEMBER, null),
  bed('bed-september-work', 'bed: late September, digging', 24, [-38, -31], SEPTEMBER, null, [1, 1]),
  bed('bed-october-gale', 'bed: October gale, 11 m/s', 48, [-32, -26], season(9, 11, 0, 'overcast', 6), null),
  bed('bed-storm-work', 'bed: storm, 45 mm, tractor working (the loudest bed)', 48, [-29, -22], STORM, null, [1, 1], { ticks: true }),
  bed('bed-cellar-november', 'bed: cellar, November', 48, [-50, -40], CELLAR, null),
  bed('bed-cellar-january', 'bed: cellar, January', 48, [-50, -40], { place: 'cellar', month: 0, weather: null }, null),
  bed('bed-year-end', 'bed: ledger and year end', 24, [-48, -35], YEAR_END, null),

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
  bird('bird-chickadee', 'bird: black-capped chickadee', 'chickadee', 3, { pitch: 3814 }),
  bird('bird-robin', 'bird: American robin, one group of phrases', 'robin', 6.5),
  bird('bird-junco', 'bird: dark-eyed junco', 'junco', 4, { pitch: 4600 }),
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
  tractor('tractor-working', 'tractor: working', [-41, -33], 1, 1),
  tractor('tractor-idle', 'tractor: idling (work on foot)', [-48, -38], 0.4, 0),

  oneShot('cue-planted', 'cue: planted', 2.5, [-31, -24], 'bed-june-work', r => cue.planted(r, START)),
  oneShot('cue-hilled', 'cue: hilled', 2.5, [-31, -24], 'bed-june-work', r => cue.hilled(r, START)),
  oneShot('cue-sprayed', 'cue: sprayed', 2.5, [-31, -24], 'bed-august-rain-work', r => cue.sprayed(r, START)),
  oneShot('cue-watered', 'cue: watered', 3.5, [-31, -24], 'bed-june-work', r => cue.watered(r, START)),
  oneShot('cue-test-dig', 'cue: test dig (6 tubers on the tray)', 4.5, [-28, -21], 'bed-august-evening', r => { cue.barrel(r, START, 'sample', 6) }, { features: ['knocks'], plan: { momentary: [-28, -21], carries: true } }),
  oneShot('cue-dug', 'cue: dug (a basket into the barrel)', 6.5, [-28, -21], 'bed-september-work', r => { cue.barrel(r, START, 'dig', 0) }, { features: ['knocks'], plan: { momentary: [-28, -21], carries: true } }),
  oneShot('cue-sold', 'cue: sold', 3, [-31, -24], 'bed-cellar-november', r => cue.sold(r, START), { features: ['lines'] }),
  warning('cue-warn-frost', 'cue: warning, frost (C4)', 'bed-september', 261.6),
  warning('cue-warn-watch', 'cue: warning, blight watch (A3)', 'bed-august-rain', 220),
  warning('cue-warn-seen', 'cue: warning, blight seen (G3)', 'bed-august-rain', 196),
  warning('cue-warn-dry', 'cue: warning, dry (E3)', 'bed-june-work', 164.8),
  warning('cue-warn-lost', 'cue: warning, a field lost (D3)', 'bed-september', 146.8),
  oneShot('cue-ledger', 'cue: year-end ledger', 11, [-28, -21], 'bed-year-end', r => { cue.cadence(r, START, 'ledger') }, { win: 4096, features: ['lines'] }),
  oneShot('cue-kept', 'cue: five seasons kept', 14, [-26, -20], 'bed-year-end', r => { cue.cadence(r, START, 'kept') }, { win: 4096, features: ['lines'] }),
  oneShot('cue-lost', 'cue: the farm lost', 16, [-30, -23], 'bed-year-end', r => { cue.cadence(r, START, 'lost') }, { win: 4096, features: ['lines'] }),

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
    id: 'change-places', name: 'change: title, plan, season, cellar, ledger with its close', seconds: 44, kind: 'change', solo: false, plan: {},
    play(rig, secs) {
      drive(rig, secs, [
        [0, { input: { place: 'title', month: 5, weather: null } }], [8, { input: { place: 'plan', month: 3, weather: null } }],
        [16, { input: JUNE }], [24, { input: CELLAR }], [32, { input: YEAR_END, ledger: true }],
      ])
    },
  },
  {
    id: 'change-cues', name: 'change: every cue once, in the order of a year', seconds: 44, kind: 'change', solo: false, plan: {},
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
    id: 'scene-dig', name: 'scene: dig day in late September, then a sale', seconds: 60, kind: 'scene', solo: false, fadeIn: true, plan: { lufs: [-38, -29] },
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
    id: 'stress', name: 'stress: storm, gale, tractor and every cue at once', seconds: 8, kind: 'stress', solo: false, ticks: true, plan: {},
    play(rig, secs) {
      const s = sceneFor(season(9, 12, 60, 'storm', 4))
      drive(rig, secs, [[0, { scene: { ...s, birds: 6, crickets: 1, chirps: 2.5, month: 5 }, engine: [1, 1] }]])
      for (const t of [2.5, 4.5]) {
        cue.planted(rig, t); cue.hilled(rig, t); cue.sprayed(rig, t); cue.watered(rig, t)
        cue.barrel(rig, t, 'dig', 0); cue.barrel(rig, t, 'sample', 8); cue.sold(rig, t)
        cue.chime(rig, t, 146.8); cue.chime(rig, t, 261.6); cue.cadence(rig, t, 'kept')
      }
    },
  },
]

// The bed every cue is also measured against: the loudest one the game can make.
export const WORST_BED = 'bed-storm-work'
