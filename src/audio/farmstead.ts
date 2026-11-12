// The sounds of the farmstead: people coming and going, land cleared, buildings raised, paper signed and stamped,
// a knock at the door, and the reward for a goal met. Wood, iron, stone and paper. The single blows here (an axe,
// a saw stroke, a hammer, a stone) are also what the work voices in work.ts are made of.
import { BARREL, burst, clink, knock, pad, tone, vary, voiceOut } from './cues.ts'
import { filter, gain, midiHz, noiseSource, swell, type Rig } from './synth.ts'

// Modes of a struck thing: [Hz or ratio, level, seconds to fall to 1/e].
type Mode = [number, number, number]

function ring(rig: Rig, out: AudioNode, t: number, amp: number, modes: Mode[], scale = 1, attack = 0.002): void {
  for (const [hz, level, tc] of modes) tone(rig, out, t, hz * scale, amp * level, attack, tc)
}

const TRUNK: Mode[] = [[232, 1, 0.05], [405, 0.7, 0.032], [690, 0.45, 0.02], [1180, 0.2, 0.012]]
const BOAT: Mode[] = [[148, 1, 0.045], [262, 0.6, 0.03], [431, 0.35, 0.018], [700, 0.15, 0.011]]
const BOARD: Mode[] = [[205, 1, 0.04], [372, 0.6, 0.026], [640, 0.4, 0.016], [1020, 0.18, 0.01]]
const PLANK: Mode[] = [[138, 1, 0.075], [306, 0.7, 0.05], [552, 0.5, 0.03], [935, 0.25, 0.018], [1480, 0.1, 0.01]]
const DOOR: Mode[] = [[118, 0.8, 0.07], [212, 1, 0.06], [347, 0.7, 0.04], [528, 0.45, 0.026], [890, 0.2, 0.014]]
const PORCH: Mode[] = [[92, 1, 0.06], [163, 0.7, 0.04], [255, 0.4, 0.025], [410, 0.2, 0.015]]
const LOG: Mode[] = [[112, 1, 0.09], [203, 0.8, 0.06], [342, 0.5, 0.04], [561, 0.3, 0.022], [905, 0.12, 0.012]]
const HANDLE: Mode[] = [[392, 1, 0.03], [705, 0.6, 0.018], [1110, 0.3, 0.011]]
const TILE: Mode[] = [[655, 1, 0.05], [1490, 0.5, 0.03], [2630, 0.25, 0.015]]
// A free bar of iron: its overtones are not a harmonic series, which is what says metal.
const IRON: Mode[] = [[1, 1, 0.7], [2.76, 0.45, 0.4], [5.4, 0.2, 0.2], [8.93, 0.08, 0.1]]
const ANVIL: Mode[] = [[1, 1, 0.24], [2.76, 0.5, 0.12], [5.4, 0.22, 0.05]]
const BAR: Mode[] = [[1, 1, 0.8], [2, 0.3, 0.45], [3.01, 0.1, 0.22], [4.1, 0.04, 0.1]]

// ---------------------------------------------------------------- single blows

// A small piece of iron against another: a latch, a pawl, a link of chain.
function click(rig: Rig, out: AudioNode, t: number, hz: number, amp: number, tc: number): void {
  ring(rig, out, t, amp, [[1, 1, tc], [1.83, 0.6, tc * 0.7], [2.9, 0.35, tc * 0.5]], hz, 0.001)
  burst(rig, out, t, amp * 1.4, 0.001, 0.005, filter(rig.ctx, 'highpass', 3000))
}

// Wood fibre letting go.
function crack(rig: Rig, out: AudioNode, t: number, amp: number, hz = 1500): void {
  burst(rig, out, t, amp, 0.001, vary(rig, 0.012, 0.4), filter(rig.ctx, 'bandpass', vary(rig, hz, 0.4), 1.5), filter(rig.ctx, 'lowpass', 6000))
  tone(rig, out, t, vary(rig, hz * 0.55, 0.3), amp * 0.25, 0.001, 0.008)
}

// An axe into green wood: the edge going in, the trunk answering, and the blow coming back off the standing timber.
export function chop(rig: Rig, out: AudioNode, t: number, amp: number): void {
  const ctx = rig.ctx
  const tune = vary(rig, 1, 0.06)
  burst(rig, out, t, 0.6 * amp, 0.001, 0.007, filter(ctx, 'bandpass', vary(rig, 2600, 0.15), 0.8), filter(ctx, 'lowpass', 6000))
  tone(rig, out, t, 150, 0.25 * amp, 0.003, 0.03, 85, 0.03)
  ring(rig, out, t, 0.3 * amp, TRUNK, tune)
  const back = t + vary(rig, 0.23, 0.12)
  burst(rig, out, back, 0.2 * amp, 0.004, 0.02, filter(ctx, 'bandpass', 900, 0.7))
  tone(rig, out, back, 232 * tune, 0.05 * amp, 0.004, 0.04)
}

// One stroke of a saw: the rasp of the teeth through the wood, rising and falling with the arm. `hz` is where the
// rasp lies and `teeth` how many pass a second at the middle of the stroke.
export function sawStroke(rig: Rig, out: AudioNode, t: number, dur: number, amp: number, hz: number, teeth: number): void {
  const ctx = rig.ctx
  const n = noiseSource(rig, t)
  const env = ctx.createGain()
  swell(env.gain, t, dur, amp, dur * 0.4, dur * 0.45)
  const rasp = gain(ctx, 0.5)
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(teeth * 0.3, t)
  o.frequency.linearRampToValueAtTime(teeth, t + dur * 0.45)
  o.frequency.linearRampToValueAtTime(teeth * 0.3, t + dur)
  o.connect(gain(ctx, 0.5)).connect(rasp.gain)
  n.connect(filter(ctx, 'bandpass', hz, 1.1)).connect(filter(ctx, 'highpass', hz * 0.5)).connect(rasp).connect(env).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
  n.stop(t + dur + 0.02)
}

// A tree coming down: the hinge letting go faster and faster, the top rushing through the air, the ground, and the
// branches breaking and settling. Returns when it is over.
export function treeFall(rig: Rig, out: AudioNode, t: number, amp: number): number {
  const ctx = rig.ctx
  const r = rig.rand
  let at = t, gap = 0.2
  for (let k = 0; k < 7; k++) {
    crack(rig, out, at, (0.22 + 0.07 * k) * amp)
    at += gap * vary(rig, 1, 0.25)
    gap *= 0.72
  }
  const groan = ctx.createOscillator()
  groan.type = 'sawtooth'
  groan.frequency.setValueAtTime(190, t + 0.1)
  groan.frequency.exponentialRampToValueAtTime(95, t + 1)
  const groanLevel = ctx.createGain()
  swell(groanLevel.gain, t + 0.1, 0.9, 0.1 * amp, 0.4, 0.3)
  groan.connect(filter(ctx, 'bandpass', 430, 3)).connect(groanLevel).connect(out)
  groan.start(t + 0.1)
  groan.stop(t + 1.05)

  const air = noiseSource(rig, t + 0.45)
  const sweep = filter(ctx, 'bandpass', 2200, 0.9)
  sweep.frequency.setValueAtTime(2200, t + 0.45)
  sweep.frequency.exponentialRampToValueAtTime(700, t + 1.55)
  const airLevel = ctx.createGain()
  swell(airLevel.gain, t + 0.45, 1.15, 0.3 * amp, 0.85, 0.25)
  air.connect(sweep).connect(airLevel).connect(out)
  air.stop(t + 1.65)

  const land = t + 1.55
  tone(rig, out, land, 95, 0.8 * amp, 0.006, 0.16, 48, 0.12)
  burst(rig, out, land, 1.1 * amp, 0.004, 0.09, filter(ctx, 'lowpass', 700))
  burst(rig, out, land, 0.55 * amp, 0.002, 0.05, filter(ctx, 'bandpass', 1800, 0.6))
  for (let k = 0; k < 12; k++) {
    const x = r()
    crack(rig, out, land + 0.03 + 0.9 * x * Math.sqrt(x), (0.4 - 0.25 * x) * amp * vary(rig, 1, 0.4), 2200)
  }
  burst(rig, out, land + 0.05, 0.22 * amp, 0.05, 0.3, filter(ctx, 'highpass', 2500), filter(ctx, 'lowpass', 7000))
  return land + 1.5
}

// A stone thrown on the stone boat: onto the stones already there, or onto its planks.
export function stone(rig: Rig, out: AudioNode, t: number, amp: number, onStone: boolean): void {
  const ctx = rig.ctx
  if (onStone) {
    ring(rig, out, t, 0.14 * amp, [[1, 1, 0.006], [1.47, 0.7, 0.005], [2.2, 0.5, 0.004], [3.1, 0.3, 0.003]], vary(rig, 2100, 0.25), 0.001)
    burst(rig, out, t, 0.3 * amp, 0.001, 0.003, filter(ctx, 'highpass', 1800), filter(ctx, 'lowpass', 9000))
    ring(rig, out, t, 0.12 * amp, BOAT, vary(rig, 1, 0.05))
  } else {
    ring(rig, out, t, 0.32 * amp, BOAT, vary(rig, 1, 0.06), 0.003)
    tone(rig, out, t, 110, 0.2 * amp, 0.004, 0.035, 70, 0.03)
    burst(rig, out, t, 0.35 * amp, 0.002, 0.008, filter(ctx, 'bandpass', 900, 0.8))
  }
}

// A hammer on a nail. As the nail goes in there is less of it free to ring, so each blow sounds higher, and more
// of the blow reaches the board. `sunk` runs 0 to 1.
export function hammer(rig: Rig, out: AudioNode, t: number, amp: number, sunk: number): void {
  const head = (1400 + 2800 * sunk) * vary(rig, 1, 0.03)
  ring(rig, out, t, 0.16 * amp, [[1, 1, 0.012 - 0.005 * sunk], [1.6, 0.5, 0.008], [2.45, 0.3, 0.005]], head, 0.0007)
  burst(rig, out, t, 0.25 * amp, 0.0005, 0.0025, filter(rig.ctx, 'highpass', 2500))
  ring(rig, out, t, 0.3 * amp * (0.7 + 0.5 * sunk), BOARD, vary(rig, 1, 0.04))
  tone(rig, out, t, 130, 0.2 * amp * (0.5 + 0.8 * sunk), 0.003, 0.03, 80, 0.03)
}

// A board dropped flat on the stack, and its one bounce.
export function plank(rig: Rig, out: AudioNode, t: number, amp: number): void {
  const ctx = rig.ctx
  const tune = vary(rig, 1, 0.08)
  ring(rig, out, t, 0.28 * amp, PLANK, tune, 0.003)
  burst(rig, out, t, 0.7 * amp, 0.002, 0.012, filter(ctx, 'lowpass', 2200))
  const b = t + vary(rig, 0.085, 0.2)
  ring(rig, out, b, 0.1 * amp, PLANK, tune * 1.02, 0.003)
  burst(rig, out, b, 0.25 * amp, 0.002, 0.008, filter(ctx, 'lowpass', 1800))
}

// The swing of a brush hook through stems, and a stem parting.
export function swish(rig: Rig, out: AudioNode, t: number, amp: number): void {
  const ctx = rig.ctx
  const n = noiseSource(rig, t)
  const bp = filter(ctx, 'bandpass', 900, 1.2)
  bp.frequency.setValueAtTime(900, t)
  bp.frequency.exponentialRampToValueAtTime(2800, t + 0.13)
  const env = ctx.createGain()
  swell(env.gain, t, 0.16, amp, 0.09, 0.05)
  n.connect(bp).connect(env).connect(out)
  n.stop(t + 0.2)
}

export function snap(rig: Rig, out: AudioNode, t: number, amp: number): void {
  burst(rig, out, t, amp, 0.0005, 0.004, filter(rig.ctx, 'bandpass', vary(rig, 2600, 0.3), 1))
  tone(rig, out, t, vary(rig, 1300, 0.3), amp * 0.3, 0.001, 0.008)
}

// A barrel let down the potato-house ramp on its bilge: the staves rumbling quicker as it goes, and stood on end.
// Returns when it is standing.
export function barrelRoll(rig: Rig, out: AudioNode, t: number, amp: number): number {
  const ctx = rig.ctx
  const dur = vary(rig, 1.2, 0.15)
  const n = noiseSource(rig, t)
  const env = ctx.createGain()
  swell(env.gain, t, dur, amp, 0.25, 0.18)
  const bump = gain(ctx, 0.55)
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(7, t)
  o.frequency.linearRampToValueAtTime(14, t + dur)
  o.connect(gain(ctx, 0.45)).connect(bump.gain)
  const low = filter(ctx, 'bandpass', 170, 1.2)
  const mid = filter(ctx, 'bandpass', 540, 1)
  n.connect(low).connect(bump)
  n.connect(mid).connect(gain(ctx, 0.35)).connect(bump)
  bump.connect(env).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
  n.stop(t + dur + 0.02)
  knock(rig, out, t + dur, 1.1 * amp, BARREL, 1, 105)
  return t + dur + 0.35
}

function step(rig: Rig, out: AudioNode, t: number, amp: number): void {
  const ctx = rig.ctx
  const tune = vary(rig, 1, 0.05)
  ring(rig, out, t, 0.3 * amp, PORCH, tune, 0.004)
  burst(rig, out, t, 0.35 * amp, 0.004, 0.018, filter(ctx, 'bandpass', 700, 0.7), filter(ctx, 'lowpass', 1800))
  // The sole follows the heel.
  burst(rig, out, t + 0.07, 0.2 * amp, 0.006, 0.02, filter(ctx, 'bandpass', 1100, 0.7), filter(ctx, 'lowpass', 2400))
  ring(rig, out, t + 0.07, 0.1 * amp, PORCH, tune * 1.3, 0.004)
}

function latch(rig: Rig, out: AudioNode, t: number, amp: number): void {
  click(rig, out, t, vary(rig, 2400, 0.04), amp, 0.012)
  click(rig, out, t + vary(rig, 0.1, 0.15), vary(rig, 1650, 0.04), amp * 1.2, 0.02)
}

function rap(rig: Rig, out: AudioNode, t: number, amp: number): void {
  ring(rig, out, t, 0.2 * amp, DOOR, vary(rig, 1, 0.02))
  burst(rig, out, t, 0.24 * amp, 0.001, 0.006, filter(rig.ctx, 'bandpass', 1700, 1), filter(rig.ctx, 'lowpass', 4000))
}

function stampDown(rig: Rig, out: AudioNode, t: number, amp: number): void {
  tone(rig, out, t, 160, 0.5 * amp, 0.004, 0.035, 85, 0.03)
  burst(rig, out, t, 0.6 * amp, 0.003, 0.012, filter(rig.ctx, 'lowpass', 900))
  ring(rig, out, t, 0.12 * amp, [[250, 1, 0.03], [440, 0.5, 0.02], [760, 0.3, 0.012]])
}

// A steel nib on ledger paper: a thin hiss that catches on the grain.
function penStroke(rig: Rig, out: AudioNode, t: number, dur: number, amp: number): void {
  const ctx = rig.ctx
  const n = noiseSource(rig, t)
  const env = ctx.createGain()
  swell(env.gain, t, dur, amp, dur * 0.25, dur * 0.4)
  const grain = gain(ctx, 0.65)
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = vary(rig, 38, 0.3)
  o.connect(gain(ctx, 0.35)).connect(grain.gain)
  n.connect(filter(ctx, 'bandpass', vary(rig, 5400, 0.12), 1.5)).connect(filter(ctx, 'highpass', 2500)).connect(grain).connect(env).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
  n.stop(t + dur + 0.02)
}

function write(rig: Rig, out: AudioNode, t: number, strokes: number[], amp: number): number {
  let at = t
  for (const d of strokes) {
    const dur = vary(rig, d, 0.15)
    penStroke(rig, out, at, dur, amp * vary(rig, 1, 0.2))
    at += dur + vary(rig, 0.035, 0.3)
  }
  return at
}

// Paper torn along a perforation: fibres giving way in fits.
function tear(rig: Rig, out: AudioNode, t: number, dur: number, amp: number): void {
  const ctx = rig.ctx
  const n = noiseSource(rig, t)
  const bp = filter(ctx, 'bandpass', 1800, 0.7)
  bp.frequency.setValueAtTime(1800, t)
  bp.frequency.exponentialRampToValueAtTime(4200, t + dur)
  const env = ctx.createGain()
  const pts = new Float32Array(Math.max(8, Math.floor(dur * 320)))
  for (let i = 0; i < pts.length; i++) {
    const x = i / (pts.length - 1)
    const edge = Math.min(1, x / 0.06, (1 - x) / 0.08)
    pts[i] = amp * edge * (0.35 + 0.65 * rig.rand())
  }
  pts[0] = 0
  pts[pts.length - 1] = 0
  env.gain.value = 0
  env.gain.setValueCurveAtTime(pts, t, dur)
  n.connect(filter(ctx, 'highpass', 1200)).connect(bp).connect(env).connect(out)
  n.stop(t + dur + 0.02)
}

function chain(rig: Rig, out: AudioNode, t: number, dur: number, amp: number): void {
  for (let k = 0; k < 9; k++) click(rig, out, t + dur * rig.rand(), vary(rig, 3600, 0.35), amp * vary(rig, 1, 0.4), 0.006 + 0.009 * rig.rand())
}

// One beat of an exhaust.
function puff(rig: Rig, out: AudioNode, t: number, amp: number, hz: number): void {
  tone(rig, out, t, hz * 1.5, amp, 0.004, 0.035, hz, 0.03)
  burst(rig, out, t, amp * 0.9, 0.004, 0.03, filter(rig.ctx, 'bandpass', 480, 0.7))
}

// ---------------------------------------------------------------- selection

// A field picked: one step onto worked ground.
export function pickField(rig: Rig, t: number): void {
  const out = voiceOut(rig, vary(rig, 0, 0.3), 0.05)
  const hz = vary(rig, 135, 0.06)
  tone(rig, out, t, hz * 1.6, 0.15, 0.004, 0.028, hz, 0.035)
  burst(rig, out, t, 0.22, 0.004, 0.018, filter(rig.ctx, 'bandpass', vary(rig, 520, 0.1), 1.1), filter(rig.ctx, 'lowpass', 1600))
}

// A tract of woods or brush picked: a twig underfoot and the leaves it stirs.
export function pickTract(rig: Rig, t: number): void {
  const out = voiceOut(rig, vary(rig, 0, 0.3), 0.12)
  snap(rig, out, t, 0.3)
  burst(rig, out, t + 0.012, 0.09, 0.012, 0.045, filter(rig.ctx, 'highpass', 2800), filter(rig.ctx, 'lowpass', 7000))
}

// A person picked: two taps of a tool handle, the second higher, as if asking. Each person has a pitch of their
// own, worked out from who they are, so a crew can be told apart by ear.
const PERSON_PITCH = [1, 1.122, 1.26, 1.498, 1.682, 0.891]
export function pickPerson(rig: Rig, t: number, id: number): void {
  const out = voiceOut(rig, vary(rig, 0, 0.2), 0.08)
  const tune = PERSON_PITCH[Math.abs(Math.floor(id)) % PERSON_PITCH.length]
  for (const [dt, up, amp] of [[0, 1, 0.115], [vary(rig, 0.1, 0.1), 1.26, 0.097]]) {
    ring(rig, out, t + dt, amp, HANDLE, tune * up)
    burst(rig, out, t + dt, amp * 1.2, 0.001, 0.004, filter(rig.ctx, 'bandpass', 2100, 1.2))
  }
}

// A yard picked: the gate's hinge and its latch. The Dufour gate is the bigger one.
export function pickYard(rig: Rig, t: number, yard: number): void {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, 0, 0.2), 0.15)
  const size = yard === -2 ? 0.84 : 1
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(510 * size, t)
  o.frequency.linearRampToValueAtTime(vary(rig, 700, 0.05) * size, t + 0.12)
  const env = ctx.createGain()
  swell(env.gain, t, 0.13, 0.05, 0.04, 0.06)
  o.connect(filter(ctx, 'bandpass', 1650 * size, 3)).connect(env).connect(out)
  o.start(t)
  o.stop(t + 0.15)
  click(rig, out, t + 0.15, 1650 * size, 0.07, 0.02)
}

// ---------------------------------------------------------------- people

// Someone taken on: the gate latch, and two steps up onto the porch.
export function hired(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, -0.2, 0.3), 0.2)
  latch(rig, out, t, 0.07)
  step(rig, out, t + 0.26, 0.48)
  step(rig, out, t + 0.26 + vary(rig, 0.3, 0.1), 0.64)
  return t + 0.9
}

// Someone gone: two steps down off the porch and the door pulled to behind them.
export function left(rig: Rig, t: number): number {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, 0.2, 0.3), 0.3)
  step(rig, out, t, 0.38)
  step(rig, out, t + vary(rig, 0.32, 0.1), 0.27)
  const d = t + 0.72
  tone(rig, out, d, 110, 0.17, 0.005, 0.07, 60, 0.06)
  ring(rig, out, d, 0.12, DOOR, 0.97, 0.003)
  burst(rig, out, d, 0.22, 0.003, 0.02, filter(ctx, 'lowpass', 1500))
  click(rig, out, d + 0.03, 1650, 0.05, 0.02)
  click(rig, out, d + 0.075, 1900, 0.03, 0.015)
  return d + 0.5
}

// Someone better at their work: a tap on the hot iron and a ring off the anvil's face, a fourth above.
export function better(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.1, 0.5), 0.25)
  const hz = vary(rig, 880, 0.03)
  ring(rig, out, t, 0.14, [[1, 1, 0.025], [2.76, 0.4, 0.015]], hz, 0.001)
  burst(rig, out, t, 0.2, 0.001, 0.005, filter(rig.ctx, 'bandpass', 2600, 0.8))
  const at = t + vary(rig, 0.16, 0.1)
  ring(rig, out, at, 0.11, ANVIL, hz * 1.335, 0.0015)
  burst(rig, out, at, 0.12, 0.001, 0.005, filter(rig.ctx, 'highpass', 4000))
  return at + 0.5
}

// The iron triangle on the porch post, struck to call attention to someone: once for worn out or unhappy, twice
// for someone hurt.
export function iron(rig: Rig, t: number, hz: number, strikes: number): number {
  const out = voiceOut(rig, 0, 0.4)
  for (let k = 0; k < strikes; k++) {
    const at = t + k * 0.24
    ring(rig, out, at, 0.075, IRON, hz * (1 + 0.004 * k))
    burst(rig, out, at, 0.12, 0.0005, 0.003, filter(rig.ctx, 'highpass', 3500))
  }
  return t + strikes * 0.24 + 0.6
}

// ---------------------------------------------------------------- paper

// A deal put on paper: a signature and its full stop.
export function signed(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, -0.1, 0.5), 0.05)
  const at = write(rig, out, t, [0.09, 0.07, 0.13, 0.06, 0.17], 0.24)
  ring(rig, out, at + 0.05, 0.1, [[250, 1, 0.03], [440, 0.5, 0.02], [760, 0.3, 0.012]])
  burst(rig, out, at + 0.05, 0.12, 0.001, 0.004, filter(rig.ctx, 'bandpass', 2400, 1))
  return at + 0.3
}

// A deed or a receipt: signed, then stamped.
export function stamped(rig: Rig, t: number, coins: boolean): number {
  const out = voiceOut(rig, vary(rig, -0.1, 0.5), 0.1)
  const at = write(rig, out, t, [0.08, 0.12], 0.26) + 0.08
  stampDown(rig, out, at, coins ? 0.55 : 0.7)
  if (coins) {
    const hz = vary(rig, 2150, 0.05)
    clink(rig, out, at + 0.24, hz, 0.09)
    clink(rig, out, at + 0.33, hz * 1.19, 0.07)
  }
  return at + (coins ? 0.75 : 0.35)
}

// The weigh ticket: the poise run out along the beam, the beam lifting to tap its stop and settling, and the ticket
// torn off the pad.
export function ticket(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.05, 0.6), 0.22)
  for (let k = 0; k < 4; k++) click(rig, out, t + 0.05 * k, vary(rig, 3200, 0.04), 0.06, 0.006)
  const beam: Mode[] = [[1, 1, 0.14], [1.74, 0.55, 0.08], [2.71, 0.3, 0.045]]
  const hz = vary(rig, 1880, 0.03)
  ring(rig, out, t + 0.3, 0.12, beam, hz, 0.001)
  burst(rig, out, t + 0.3, 0.2, 0.0005, 0.003, filter(rig.ctx, 'highpass', 3000))
  ring(rig, out, t + 0.3 + vary(rig, 0.17, 0.1), 0.06, beam, hz * 1.01, 0.001)
  tear(rig, out, t + 0.68, 0.24, 0.26)
  return t + 1.1
}

// ---------------------------------------------------------------- land

// A tract felled: the last tree down.
export function felled(rig: Rig, t: number): number {
  return treeFall(rig, voiceOut(rig, vary(rig, -0.2, 0.5), 0.35), t, 0.3)
}

// Rocks picked: three thrown on the stone boat, and one that settles.
export function rocks(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.15, 0.5), 0.14)
  stone(rig, out, t, 0.65, false)
  const b = t + vary(rig, 0.24, 0.15)
  stone(rig, out, b, 0.65, true)
  const c = b + vary(rig, 0.2, 0.15)
  stone(rig, out, c, 0.52, true)
  stone(rig, out, c + vary(rig, 0.11, 0.2), 0.23, true)
  return c + 0.4
}

// Hedgerows cut back: two swings of the brush hook.
export function brushed(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.2, 0.5), 0.12)
  swish(rig, out, t, 0.3)
  snap(rig, out, t + 0.13, 0.5)
  const b = t + vary(rig, 0.3, 0.1)
  swish(rig, out, b, 0.25)
  snap(rig, out, b + 0.12, 0.42)
  snap(rig, out, b + 0.17, 0.25)
  return b + 0.4
}

// The stumps out: the chain taking up, roots parting, the stump coming free and the soil falling off it.
export function stumped(rig: Rig, t: number): number {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, 0.15, 0.5), 0.25)
  chain(rig, out, t, 0.22, 0.05)
  let at = t + 0.26, gap = 0.14
  for (let k = 0; k < 5; k++) {
    crack(rig, out, at, 0.12 + 0.04 * k, 900)
    gap *= 0.7
    at += gap
  }
  const o = at + 0.04
  tone(rig, out, o, 90, 0.27, 0.006, 0.12, 50, 0.1)
  burst(rig, out, o, 0.34, 0.005, 0.07, filter(ctx, 'lowpass', 600))
  burst(rig, out, o + 0.08, 0.14, 0.04, 0.2, filter(ctx, 'bandpass', 1900, 0.6), filter(ctx, 'lowpass', 4500))
  return o + 0.9
}

// Tile drains in: two lengths of clay pipe laid end to end, and water finding them.
export function tiled(rig: Rig, t: number): number {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, -0.1, 0.5), 0.3)
  ring(rig, out, t, 0.07, TILE, vary(rig, 1, 0.03))
  ring(rig, out, t + 0.16, 0.06, TILE, vary(rig, 1.12, 0.03))
  const pipe = filter(ctx, 'bandpass', 640, 4)
  pipe.connect(gain(ctx, 2)).connect(out)
  let at = t + 0.38, gap = 0.12
  for (let k = 0; k < 6; k++) {
    const f = vary(rig, 620, 0.15)
    const amp = 0.12 * (1 - k / 9)
    tone(rig, out, at, f, amp, 0.003, 0.02, f * 2.1, 0.045)
    tone(rig, pipe, at, f, amp, 0.003, 0.02, f * 2.1, 0.045)
    gap *= 0.86
    at += gap * vary(rig, 1, 0.15)
  }
  return at + 0.4
}

// Logs sold: two rolled onto the mill's truck, and the mill's money.
export function logs(rig: Rig, t: number): number {
  const ctx = rig.ctx
  const out = voiceOut(rig, vary(rig, -0.2, 0.5), 0.25)
  const tune = vary(rig, 1, 0.05)
  for (const [dt, pitch, amp] of [[0, 1, 1], [vary(rig, 0.25, 0.1), 0.9, 0.8]]) {
    ring(rig, out, t + dt, 0.13 * amp, LOG, tune * pitch, 0.004)
    tone(rig, out, t + dt, 120, 0.12 * amp, 0.005, 0.05, 70, 0.04)
    burst(rig, out, t + dt, 0.18 * amp, 0.003, 0.012, filter(ctx, 'bandpass', 800, 0.7))
  }
  const hz = vary(rig, 2150, 0.05)
  clink(rig, out, t + 0.6, hz, 0.09)
  clink(rig, out, t + 0.69, hz * 1.19, 0.07)
  return t + 1.1
}

// ---------------------------------------------------------------- buildings and machines

// A building begun: the first two boards on the stack.
export function begun(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.1, 0.5), 0.18)
  plank(rig, out, t, 0.52)
  plank(rig, out, t + vary(rig, 0.3, 0.1), 0.35)
  return t + 0.75
}

// A building standing: the last nail driven home, each blow higher than the one before, and the hammer set down.
export function built(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.1, 0.5), 0.28)
  let at = t
  for (let k = 0; k < 4; k++) {
    hammer(rig, out, at, 0.42 + 0.055 * k, k / 3)
    at += vary(rig, k === 2 ? 0.24 : 0.3, 0.06)
  }
  plank(rig, out, at + 0.12, 0.35)
  return at + 0.6
}

// A tractor broken down: something lets go, and the engine runs down and stops.
export function brokeDown(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.2, 0.3), 0.15)
  ring(rig, out, t, 0.07, [[1, 1, 0.06], [2.61, 0.6, 0.035], [4.4, 0.3, 0.02]], vary(rig, 720, 0.05), 0.001)
  burst(rig, out, t, 0.25, 0.001, 0.01, filter(rig.ctx, 'bandpass', 2400, 0.8))
  let at = t + 0.12, gap = 0.075
  for (let k = 0; k < 6; k++) {
    puff(rig, out, at, 0.26 * (1 - k / 8), 95 - 6 * k)
    gap *= 1.35
    at += gap
  }
  return at + 0.2
}

// A tractor going again: a few clicks of the ratchet, then it catches and picks up.
export function repaired(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0.2, 0.3), 0.15)
  for (let k = 0; k < 5; k++) click(rig, out, t + 0.06 * k, vary(rig, 3100, 0.05), 0.04, 0.006)
  let at = t + 0.44, gap = 0.2
  for (let k = 0; k < 6; k++) {
    puff(rig, out, at, 0.13 + 0.02 * k, 70 + 5 * k)
    gap *= 0.78
    at += gap
  }
  return at + 0.2
}

// ---------------------------------------------------------------- the two that must not be missed

// A decision at the door: three knocks, unhurried.
export function atTheDoor(rig: Rig, t: number): number {
  const out = voiceOut(rig, 0, 0.3)
  let at = t
  for (const amp of [0.92, 0.85, 1]) {
    rap(rig, out, at, amp)
    at += vary(rig, 0.23, 0.06)
  }
  return at + 0.35
}

// The matter closed: the door eased shut and its latch dropping.
export function settled(rig: Rig, t: number): number {
  const out = voiceOut(rig, vary(rig, 0, 0.3), 0.2)
  ring(rig, out, t, 0.15, DOOR, 1.03, 0.004)
  burst(rig, out, t, 0.2, 0.004, 0.015, filter(rig.ctx, 'lowpass', 1200))
  click(rig, out, t + 0.07, 1650, 0.07, 0.02)
  return t + 0.4
}

// A goal met: the year-end amen in small (IV to I in F on the parlour organ) under four struck bars climbing the
// chord of F to its fifth. The one sound in the game written to be wanted again.
export function goalMet(rig: Rig, t: number): number {
  const ctx = rig.ctx
  const lp = filter(ctx, 'lowpass', 1500, 0.5)
  lp.connect(voiceOut(rig, 0, 0.3))
  for (const m of [58, 62, 65]) pad(rig, lp, t, midiHz(m), 0.34, 0.2, 0.04)
  for (const [j, m] of [53, 57, 60, 65].entries()) pad(rig, lp, t + 0.34 + 0.02 * j, midiHz(m), 0.95, 0.45, 0.042)
  const bars = filter(ctx, 'lowpass', 6000)
  bars.connect(voiceOut(rig, 0.1, 0.4))
  for (const [dt, m, amp] of [[0, 72, 0.06], [0.16, 77, 0.065], [0.34, 81, 0.075], [0.62, 84, 0.045]]) {
    ring(rig, bars, t + dt, amp, BAR, midiHz(m), 0.004)
  }
  return t + 2.6
}
