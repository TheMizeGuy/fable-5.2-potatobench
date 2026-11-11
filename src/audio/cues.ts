// One-shot sounds for things that happen: jobs finished, tubers on wood, a sale, a warning, the year closed.
// Nothing here sounds twice quite the same: pitch, timing and weight are drawn from the session's generator.
import { filter, gain, midiHz, noiseSource, panner, strike, type Rig } from './synth.ts'

const vary = (rig: Rig, x: number, by: number) => x * (1 + by * (2 * rig.rand() - 1))

function tone(rig: Rig, out: AudioNode, t: number, hz: number, amp: number, attack: number, decay: number, toHz = 0, glide = 0.05): void {
  const o = rig.ctx.createOscillator()
  o.frequency.setValueAtTime(hz, t)
  if (toHz > 0) o.frequency.exponentialRampToValueAtTime(toHz, t + glide)
  const s = strike(rig.ctx, t, amp, attack, decay)
  o.connect(s.g).connect(out)
  o.start(t)
  o.stop(s.end)
}

function burst(rig: Rig, out: AudioNode, t: number, amp: number, attack: number, decay: number, ...chain: BiquadFilterNode[]): void {
  const n = noiseSource(rig, t)
  const s = strike(rig.ctx, t, amp, attack, decay)
  let node: AudioNode = n
  for (const f of chain) node = node.connect(f)
  node.connect(s.g).connect(out)
  n.stop(s.end)
}

function voiceOut(rig: Rig, pan: number, send: number): AudioNode {
  const o = panner(rig.ctx, pan)
  o.connect(rig.bus)
  if (send > 0) o.connect(gain(rig.ctx, send)).connect(rig.verb)
  return o
}

// A seed piece dropped in the furrow and the soil closed over it: two soft pats on earth.
export function planted(rig: Rig, t: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, -0.15, 0.5), 0.1)
  const gap = vary(rig, 0.18, 0.15)
  for (const [dt, hz, a] of [[0, vary(rig, 150, 0.07), 0.3], [gap, vary(rig, 120, 0.07), vary(rig, 0.23, 0.15)]]) {
    tone(rig, out, t + dt, hz * 1.7, a, 0.004, 0.032, hz, 0.04)
    burst(rig, out, t + dt, a * 1.5, 0.004, 0.022, filter(ctx, 'bandpass', vary(rig, 420, 0.1), 1.1), filter(ctx, 'lowpass', 1400))
  }
}

// Soil turned up over the row: two soft sweeps of the hiller.
export function hilled(rig: Rig, t: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, 0.1, 0.5), 0.08)
  const gap = vary(rig, 0.21, 0.15)
  burst(rig, out, t, 0.75, 0.05, 0.07, filter(ctx, 'bandpass', vary(rig, 640, 0.1), 0.9), filter(ctx, 'lowpass', 1800))
  burst(rig, out, t + gap, vary(rig, 0.5, 0.15), 0.04, 0.06, filter(ctx, 'bandpass', vary(rig, 520, 0.1), 0.9), filter(ctx, 'lowpass', 1600))
}

// Two short breaths of a sprayer nozzle.
export function sprayed(rig: Rig, t: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, 0.2, 0.5), 0.12)
  const gap = vary(rig, 0.18, 0.15)
  burst(rig, out, t, 0.32, 0.014, 0.05, filter(ctx, 'highpass', 1800), filter(ctx, 'bandpass', vary(rig, 3600, 0.08), 0.7), filter(ctx, 'lowpass', 7000))
  burst(rig, out, t + gap, vary(rig, 0.24, 0.15), 0.014, 0.045, filter(ctx, 'highpass', 1800), filter(ctx, 'bandpass', vary(rig, 3300, 0.08), 0.7), filter(ctx, 'lowpass', 7000))
}

// Two drops into standing water.
export function watered(rig: Rig, t: number): void {
  const out = voiceOut(rig, vary(rig, -0.1, 0.5), 0.3)
  const a = vary(rig, 520, 0.08), b = vary(rig, 620, 0.08)
  tone(rig, out, t, a, 0.28, 0.003, 0.022, a * 2.2, 0.05)
  tone(rig, out, t + vary(rig, 0.14, 0.2), b, vary(rig, 0.21, 0.15), 0.003, 0.02, b * 2.2, 0.045)
}

// What a tuber lands on. Modes are [Hz, level, seconds to fall to 1/e]: wood loses its high modes first, at a
// near-constant number of cycles, which is what makes it read as wood and not metal.
interface Wood { thump: number; modes: [number, number, number][] }
const BARREL: Wood = { thump: 82, modes: [[196, 1, 0.05], [338, 0.62, 0.03], [527, 0.36, 0.019], [806, 0.16, 0.012]] }
const TRAY: Wood = { thump: 118, modes: [[262, 1, 0.036], [471, 0.66, 0.021], [742, 0.4, 0.013], [1130, 0.16, 0.009]] }

// One tuber landing: weight (a low thud), the wood it lands on, the hollow it lands in, and skin against the grain.
// `bare` is how much wood it meets (1) rather than other tubers (0); `hollow` is the air resonance in Hz, 0 for none.
function knock(rig: Rig, out: AudioNode, t: number, amp: number, wood: Wood, bare: number, hollow: number): void {
  const ctx = rig.ctx
  const tune = vary(rig, 1, 0.05)
  tone(rig, out, t, wood.thump * 1.6, 0.2 * amp, 0.005, 0.04, wood.thump, 0.035)
  for (const [hz, level, tc] of wood.modes) {
    tone(rig, out, t, hz * tune * vary(rig, 1, 0.015), 0.3 * amp * level * (0.25 + 0.75 * bare) * vary(rig, 1, 0.35), 0.003, tc * (0.6 + 0.4 * bare))
  }
  if (hollow > 0) burst(rig, out, t, 1.3 * amp, 0.005, 0.03, filter(ctx, 'bandpass', hollow, 7))
  burst(rig, out, t, 0.3 * amp, 0.003, 0.011, filter(ctx, 'lowpass', 500 + 700 * bare, 0.7), filter(ctx, 'lowpass', 2400))
}

// A hill's tubers laid on the tray one at a time (test dig), or a basket tipped into the barrel (dig day): a
// tumble that slows as the last ones roll in and settle, the barrel sounding less of wood and higher as it fills.
// Returns when the last has landed.
export function barrel(rig: Rig, t: number, kind: 'sample' | 'dig', tubers: number): number {
  const r = rig.rand
  const out = voiceOut(rig, vary(rig, 0.05, 1), 0.14)
  let at = t
  if (kind === 'sample') {
    const n = Math.max(3, Math.min(8, Math.round(tubers)))
    for (let i = 0; i < n; i++) {
      knock(rig, out, at, 0.95 * (0.62 + 0.38 * r()), TRAY, 1 - 0.35 * (i / n) * r(), 0)
      at += 0.17 + 0.15 * r()
    }
    return at + 0.3
  }
  const n = 16 + Math.floor(r() * 4)
  let step = 0.034
  for (let i = 0; i < n; i++) {
    const fill = i / (n - 1)
    const settling = i >= n - 2
    knock(rig, out, at, 0.6 * (settling ? 0.34 : 1 - 0.45 * fill) * (0.75 + 0.25 * r()), BARREL, 1 - 0.75 * fill, 105 + 150 * fill)
    step *= settling ? 1.5 : 1.13
    at += step * (0.8 + 0.4 * r())
  }
  // The digger's chain: earth and tubers rolling, under the knocks.
  burst(rig, out, t, 0.12, 0.3, (at - t) * 0.3, filter(rig.ctx, 'bandpass', 260, 0.7), filter(rig.ctx, 'lowpass', 700))
  return at + 0.3
}

// Coins counted onto a wooden counter: two small clinks.
function clink(rig: Rig, out: AudioNode, t: number, hz: number, amp: number): void {
  for (const [ratio, rel, tc] of [[1, 1, 0.09], [2.27, 0.5, 0.055], [3.1, 0.22, 0.03]]) {
    tone(rig, out, t, hz * ratio, amp * rel, 0.0015, tc)
  }
  tone(rig, out, t, 300, amp * 1.6, 0.003, 0.018)
}

export function sold(rig: Rig, t: number): void {
  const out = voiceOut(rig, vary(rig, 0.1, 0.5), 0.2)
  const hz = vary(rig, 2150, 0.05)
  clink(rig, out, t, hz, 0.1)
  clink(rig, out, t + vary(rig, 0.09, 0.2), hz * vary(rig, 1.19, 0.03), 0.075)
}

// One low struck chime with a soft mallet. Used for every warning, at a pitch for each kind.
export function chime(rig: Rig, t: number, hz: number): void {
  const ctx = rig.ctx
  const lp = filter(ctx, 'lowpass', 2200)
  lp.connect(voiceOut(rig, 0, 0.45))
  // The upper partials are what a small speaker can play; the ear fills in the note under them.
  for (const [ratio, rel, tc] of [[1, 1, 1.3], [2.0, 0.42, 0.9], [3.01, 0.2, 0.5], [4.0, 0.16, 0.6], [6.02, 0.07, 0.35]]) {
    tone(rig, lp, t, hz * ratio, 0.1 * rel, 0.012, tc)
  }
}

type Close = 'ledger' | 'kept' | 'lost'

// Chords as MIDI notes, bass first, in F. Each close begins on the same B flat chord.
const CADENCE: Record<Close, { chords: number[][]; durs: number[]; amp: number; release: number }> = {
  // Year closed: IV to I, the plain "amen".
  ledger: { chords: [[46, 53, 58, 62], [41, 53, 57, 60]], durs: [0.95, 2.4], amp: 0.062, release: 0.9 },
  // Five seasons kept: IV, I over its fifth, V held back by a suspended fourth that then resolves, and home, the
  // top voice climbing to the keynote.
  kept: {
    chords: [[46, 53, 58, 62], [48, 53, 57, 65], [48, 55, 60, 65], [48, 55, 58, 64], [41, 48, 57, 60, 65]],
    durs: [0.9, 0.9, 0.7, 0.7, 3.0], amp: 0.062, release: 1.2,
  },
  // The farm lost: the same opening, falling to the relative minor with no third in it, and left there.
  lost: { chords: [[46, 53, 58, 62], [38, 45, 50, 57]], durs: [1.5, 3.2], amp: 0.05, release: 1.5 },
}

// One voice of a reed organ: two reeds a few cents apart and a soft octave, swelling in.
function pad(rig: Rig, out: AudioNode, t: number, hz: number, dur: number, release: number, amp: number): void {
  const ctx = rig.ctx
  const g = ctx.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0, t)
  g.gain.setTargetAtTime(amp, t, 0.045)
  g.gain.setTargetAtTime(amp * 0.6, t + 0.25, 0.7)
  g.gain.setTargetAtTime(0, t + dur, release)
  g.connect(out)
  const end = t + dur + release * 9
  for (const [type, mul, a] of [['triangle', 1, 0.85], ['triangle', 1.0016, 0.3], ['sine', 2, 0.2]] as const) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = hz * mul
    o.connect(gain(ctx, a)).connect(g)
    o.start(t)
    o.stop(end)
  }
}

// A short close on a parlour organ. Returns when it has finished sounding.
export function cadence(rig: Rig, t: number, kind: Close): number {
  const ctx = rig.ctx
  const lp = filter(ctx, 'lowpass', 1500, 0.5)
  lp.connect(voiceOut(rig, 0, 0.3))
  const { chords, durs, amp, release } = CADENCE[kind]
  let at = t
  chords.forEach((ch, i) => {
    const last = i === chords.length - 1
    ch.forEach((m, j) => pad(rig, lp, at + j * (last ? 0.035 : 0.02), midiHz(m), durs[i], last ? release : 0.22, amp))
    at += durs[i]
  })
  return at + release * 2
}
