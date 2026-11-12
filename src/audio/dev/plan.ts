// The limits every render is held to. Each returned line is a hard failure of tools/audio/check.ts.
import { PEAK_LIMIT, SILENT_PEAK, type Compared, type VoiceResult } from './report.ts'

export const LIMITS = {
  truePeak: -6,        // dBTP at the default volume
  dc: 0.001,           // -60 dBFS
  loop: 0.2,           // how far a repeat of the waveform may stand above the rest of the autocorrelation
  rhythm: 0.35,        // the same for a repeat of the pattern of events
  sub80: 0.3,          // beds: share of energy below 80 Hz
  harsh: 0.45,         // beds without birds or crickets: share between 2 and 5 kHz
  hiss: 0.1,           // beds: share above 8 kHz
  corr: -0.2,          // left against right: never out of phase
  tail: 0.00018,       // cues: -75 dBFS left at the end of the render means the cue was cut off
  ownBed: 13,          // cues: dB clear of the bed they play over, in their clearest third-octave band (ISO 7731)
  loudestBed: 3,       // warnings and the key moments: dB clear of the loudest bed in the game
  smallSpeaker: 6,     // warnings and the key moments: dB clear of their own bed at 500 Hz and above
  seasonsApart: 6,     // the four seasons: dB between any two, where their energy lies and how it moves together
  seasonsOver: 2,      // and that many times what a season differs from itself on another day
  alikeLevel: 6,       // two cues of different families are taken for each other when their spectra are within
  alikeRhythm: 0.85,   // this many dB and their rhythms this alike
  keyClear: 6,         // a moment that must not be missed: dB clear of any other cue sounding at once
}

const within = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi
const n1 = (x: number) => x.toFixed(1)

export function judge(r: VoiceResult): string[] {
  const out: string[] = []
  const m = r.m
  const no = (what: string) => out.push(`${r.name}: ${what}`)
  if (r.peakMax < SILENT_PEAK) no('silent')
  if (r.peakMax > PEAK_LIMIT) no(`peaks at ${r.peakMax.toFixed(3)} with the volume at its top, over ${PEAK_LIMIT}`)
  if (r.solo && r.rawPeak > PEAK_LIMIT) no(`raw peak ${r.rawPeak.toFixed(3)} before the limiter, over ${PEAK_LIMIT}`)
  if (r.kind !== 'stress' && m.truePeak > LIMITS.truePeak) no(`true peak ${n1(m.truePeak)} dBTP at the default volume, over ${LIMITS.truePeak}`)
  if (m.clicks.count > 0 && !r.ticks) no(`${m.clicks.count} click(s); the worst at ${m.clicks.at.toFixed(3)} s is ${n1(m.clicks.worst)} times its surroundings`)
  if (m.dc > LIMITS.dc) no(`DC offset ${m.dc.toFixed(5)}`)
  if (m.corr < LIMITS.corr) no(`left and right are out of phase (correlation ${m.corr.toFixed(2)})`)
  if (r.plan.lufs && !within(m.lufs, r.plan.lufs)) no(`${n1(m.lufs)} LUFS, outside the plan's ${r.plan.lufs[0]} to ${r.plan.lufs[1]}`)
  if (r.plan.momentary && !within(m.momentary, r.plan.momentary)) no(`loudest 400 ms is ${n1(m.momentary)} LUFS, outside the plan's ${r.plan.momentary[0]} to ${r.plan.momentary[1]}`)
  if (!r.periodic) {
    if (m.wave && m.wave.salience > LIMITS.loop) no(`the waveform repeats every ${n1(m.wave.lag)} s (${m.wave.salience.toFixed(2)})`)
    if (m.rhythm && m.rhythm.salience > LIMITS.rhythm) no(`the pattern of events repeats every ${n1(m.rhythm.lag)} s (${m.rhythm.salience.toFixed(2)})`)
  }
  if (r.kind === 'bed' || r.kind === 'scene') {
    if (m.sub80 > LIMITS.sub80) no(`${(m.sub80 * 100).toFixed(0)}% of the energy is below 80 Hz`)
    if (m.harsh > LIMITS.harsh && !r.song) no(`${(m.harsh * 100).toFixed(0)}% of the energy is between 2 and 5 kHz`)
    if (m.hiss > LIMITS.hiss) no(`${(m.hiss * 100).toFixed(0)}% of the energy is above 8 kHz`)
  }
  if (r.kind === 'cue') {
    if (m.shape && m.shape.tail > LIMITS.tail) no('still sounding when the render ends')
    if (m.mask && m.mask.snrBest < LIMITS.ownBed) no(`only ${n1(m.mask.snrBest)} dB clear of ${m.mask.bed}`)
    if (r.plan.carries && m.worst && m.worst.snrBest < LIMITS.loudestBed) no(`only ${n1(m.worst.snrBest)} dB clear of the loudest bed`)
    if (r.plan.carries && m.mask && m.mask.snrSmall < LIMITS.smallSpeaker) no(`only ${n1(m.mask.snrSmall)} dB clear of ${m.mask.bed} above 500 Hz, where a small speaker plays`)
  }
  return out
}

// The limits no single render can be held to: the seasons against each other, and the cues against each other.
export function judgeCompared(c: Compared): string[] {
  const out: string[] = []
  const n1 = (x: number) => x.toFixed(1)
  const own = Math.max(...c.within.map(p => p.both))
  for (const p of c.between) {
    if (p.both < LIMITS.seasonsApart) out.push(`${p.a} and ${p.b} are only ${n1(p.both)} dB apart, under ${LIMITS.seasonsApart}`)
    if (p.both < LIMITS.seasonsOver * own) out.push(`${p.a} and ${p.b} are ${n1(p.both)} dB apart, under ${LIMITS.seasonsOver} times what a season differs from itself (${n1(own)} dB)`)
  }
  for (const p of c.nearest) {
    if (p.level < LIMITS.alikeLevel && p.rhythm > LIMITS.alikeRhythm) out.push(`cue ${p.a} could be taken for ${p.b}: ${n1(p.level)} dB apart in spectrum, rhythm ${p.rhythm.toFixed(2)} alike`)
  }
  for (const k of c.covered) {
    if (k.db < LIMITS.keyClear) out.push(`cue ${k.cue} stands only ${n1(k.db)} dB clear of ${k.by} when both sound at once`)
  }
  return out
}
