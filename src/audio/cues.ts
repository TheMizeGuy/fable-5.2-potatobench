// One-shot sounds for things that happen: jobs finished, tubers in the barrel, a sale, a warning, the year closed.
import { filter, gain, midiHz, noiseSource, panner, strike, type Rig } from './synth.ts'

function tone(rig: Rig, out: AudioNode, t: number, type: OscillatorType, hz: number, amp: number, attack: number, decay: number, toHz = 0, glide = 0.05): void {
  const o = rig.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(hz, t)
  if (toHz > 0) o.frequency.exponentialRampToValueAtTime(toHz, t + glide)
  const s = strike(rig.ctx, t, amp, attack, decay)
  o.connect(s.g).connect(out)
  o.start(t)
  o.stop(s.end)
}

function burst(rig: Rig, out: AudioNode, t: number, amp: number, attack: number, decay: number, ...chain: BiquadFilterNode[]): void {
  const n = noiseSource(rig, t, false)
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

// A seed piece dropped in the furrow: two soft low knocks.
export function planted(rig: Rig, t: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, -0.15, 0.1)
  for (const [dt, hz, a] of [[0, 150, 0.16], [0.17, 118, 0.12]]) {
    tone(rig, out, t + dt, 'sine', hz * 1.7, a, 0.003, 0.03, hz, 0.04)
    burst(rig, out, t + dt, a * 0.5, 0.002, 0.012, filter(ctx, 'bandpass', 1100, 0.9))
  }
}

// Soil turned up over the row: a soft brush.
export function hilled(rig: Rig, t: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, 0.1, 0.08)
  burst(rig, out, t, 0.32, 0.05, 0.07, filter(ctx, 'bandpass', 620, 0.9), filter(ctx, 'lowpass', 1800))
  burst(rig, out, t + 0.2, 0.2, 0.04, 0.06, filter(ctx, 'bandpass', 520, 0.9), filter(ctx, 'lowpass', 1600))
}

// Two short breaths of a sprayer nozzle.
export function sprayed(rig: Rig, t: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, 0.2, 0.12)
  burst(rig, out, t, 0.15, 0.012, 0.05, filter(ctx, 'highpass', 2600), filter(ctx, 'bandpass', 5200, 0.6))
  burst(rig, out, t + 0.17, 0.11, 0.012, 0.045, filter(ctx, 'highpass', 2600), filter(ctx, 'bandpass', 4800, 0.6))
}

// Two drops into standing water.
export function watered(rig: Rig, t: number): void {
  const out = voiceOut(rig, -0.1, 0.3)
  tone(rig, out, t, 'sine', 520, 0.12, 0.002, 0.02, 1150, 0.05)
  tone(rig, out, t + 0.13, 'sine', 610, 0.09, 0.002, 0.018, 1350, 0.045)
}

// One tuber landing in a wooden barrel: a dull body, a stave click and a short hollow ring.
function knock(rig: Rig, out: AudioNode, t: number, amp: number, hz: number): void {
  const ctx = rig.ctx
  tone(rig, out, t, 'sine', hz * 1.3, 0.18 * amp, 0.002, 0.04, hz, 0.03)
  burst(rig, out, t, 0.4 * amp, 0.001, 0.008, filter(ctx, 'bandpass', hz * 3.2, 3))
  burst(rig, out, t, 0.75 * amp, 0.001, 0.006, filter(ctx, 'bandpass', 330, 14))
}

// Tubers into the barrel: a few for a test dig, a run of them on dig day. Returns when the last has landed.
export function barrel(rig: Rig, t: number, kind: 'sample' | 'dig', tubers: number): number {
  const r = rig.rand
  const out = voiceOut(rig, 0.05, 0.15)
  const n = kind === 'dig' ? 11 : Math.max(3, Math.min(8, Math.round(tubers)))
  let at = t
  for (let i = 0; i < n; i++) {
    const fill = i / n
    const amp = (kind === 'dig' ? 0.8 : 1) * (0.65 + 0.35 * r())
    knock(rig, out, at, amp, 165 + 55 * r() - (kind === 'dig' ? 40 * fill : 0))
    at += kind === 'dig' ? 0.06 + 0.13 * r() : 0.12 + 0.16 * r()
  }
  if (kind === 'dig') {
    // The digger's chain: earth and tubers rolling, under the knocks.
    burst(rig, out, t, 0.09, 0.25, (at - t) * 0.35, filter(rig.ctx, 'lowpass', 380, 0.7))
  }
  return at + 0.3
}

// A small coin, struck twice.
function clink(rig: Rig, out: AudioNode, t: number, hz: number, amp: number): void {
  for (const [ratio, rel, tc] of [[1, 1, 0.09], [2.27, 0.55, 0.06], [3.9, 0.3, 0.04], [5.4, 0.18, 0.03]]) {
    tone(rig, out, t, 'sine', hz * ratio, amp * rel, 0.001, tc)
  }
}

export function sold(rig: Rig, t: number): void {
  const out = voiceOut(rig, 0.1, 0.2)
  clink(rig, out, t, 2350, 0.055)
  clink(rig, out, t + 0.085, 2780, 0.04)
}

// One low struck chime with a soft mallet. Used for every warning, at a pitch for each kind.
export function chime(rig: Rig, t: number, hz: number): void {
  const ctx = rig.ctx
  const lp = filter(ctx, 'lowpass', 1800)
  lp.connect(voiceOut(rig, 0, 0.45))
  for (const [ratio, rel, tc] of [[1, 1, 1.3], [2.0, 0.28, 0.8], [3.01, 0.1, 0.45], [4.16, 0.05, 0.3]]) {
    tone(rig, lp, t, 'sine', hz * ratio, 0.095 * rel, 0.012, tc)
  }
}

const CADENCE = {
  // Year closed: IV to I, in F.
  ledger: { chords: [[46, 53, 58, 62], [41, 53, 57, 60]], durs: [0.75, 2.4] },
  // Five seasons kept: IV, V, then I with an added sixth.
  kept: { chords: [[46, 53, 58, 62], [48, 55, 60, 64], [41, 53, 57, 60, 62]], durs: [0.62, 0.62, 2.8] },
}

function pad(rig: Rig, out: AudioNode, t: number, hz: number, dur: number, release: number, amp: number): void {
  const ctx = rig.ctx
  const g = ctx.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(amp, t + 0.035)
  g.gain.setTargetAtTime(amp * 0.45, t + 0.035, 0.5)
  g.gain.setTargetAtTime(0, t + dur, release)
  g.connect(out)
  const end = t + dur + release * 9
  for (const [type, mul, a] of [['triangle', 1, 1], ['sine', 2.002, 0.22]] as const) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = hz * mul
    const og = gain(ctx, a)
    o.connect(og).connect(g)
    o.start(t)
    o.stop(end)
  }
}

// A short warm cadence. Returns when it has finished sounding.
export function cadence(rig: Rig, t: number, kind: 'ledger' | 'kept'): number {
  const ctx = rig.ctx
  const lp = filter(ctx, 'lowpass', 1500, 0.5)
  lp.connect(voiceOut(rig, 0, 0.3))
  const { chords, durs } = CADENCE[kind]
  let at = t
  chords.forEach((ch, i) => {
    const last = i === chords.length - 1
    ch.forEach((m, j) => pad(rig, lp, at + j * 0.02, midiHz(m), durs[i], last ? 0.9 : 0.16, 0.05))
    at += durs[i]
  })
  return at + 1.5
}
