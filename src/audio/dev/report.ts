import type { Clicks, Masking, Repeat, Shape } from './analyze.ts'

export type Kind = 'bed' | 'voice' | 'cue' | 'scene' | 'change' | 'stress'

export interface Metrics {
  truePeak: number       // dBTP at the default volume
  lufs: number           // integrated, BS.1770-4
  momentary: number      // loudest 400 ms
  shortTerm: number      // loudest 3 s
  dc: number
  clicks: Clicks
  sub80: number          // share of energy below 80 Hz
  harsh: number          // share between 2 and 5 kHz
  hiss: number           // share above 8 kHz
  centroid: number
  corr: number           // left against right
  wave: Repeat | null    // beds: an exact repeat of the waveform
  rhythm: Repeat | null  // beds: a repeat of the pattern of events
  shape: Shape | null    // cues
  mask: (Masking & { bed: string }) | null    // cues: against the bed they play over
  chain: { gain: number; squash: number }     // the master chain at the default volume: its gain in dB, and how much less the peak gained
  worst: Masking | null                       // cues: against the loudest bed in the game
}

// Where a render has to sit in the loudness plan, in LUFS at the default volume.
export interface Plan {
  lufs?: [number, number]        // integrated
  momentary?: [number, number]   // loudest 400 ms
  carries?: boolean              // must stand clear of the loudest bed in the game, not only its own
}

export interface VoiceResult {
  id: string
  name: string
  kind: Kind
  seconds: number
  solo: boolean          // a single voice: its raw level must stay under the ceiling without help from the limiter
  ticks: boolean         // made of drops, whose short ticks are the sound and not faults
  periodic: boolean      // repeats by nature (an engine, a cricket, a bird's song), so the repeat tests do not apply
  song: boolean          // has birds or crickets in it, whose whole sound lies between 2 and 5 kHz
  plan: Plan
  m: Metrics
  peakMax: number        // sample peak through the master chain at the loudest volume setting
  rawPeak: number        // before the master volume, trim and ceiling
  cost: number           // seconds taken to render each second of sound, in this browser on this machine
  features: string[]     // what was measured off the render for comparison with the real sound
}

export interface Rendered { result: VoiceResult; wav: string; png: string; small: string; zoom: string }

export interface CaseInfo { id: string; name: string; kind: Kind; seconds: number }

export interface Lab {
  cases: CaseInfo[]
  defaultVolume: number
  run(i: number, files: boolean): Promise<Rendered>
  selfTest(): Promise<{ fails: string[]; report: string[] }>
}

export const PEAK_LIMIT = 0.98
export const SILENT_PEAK = 0.002
// The volume setting a new player starts with (DEFAULT_SETTINGS in src/game/app.ts; the live check compares them).
export const DEFAULT_VOLUME = 0.6
