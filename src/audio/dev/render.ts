// Renders each case through an OfflineAudioContext, measures it, and on request hands back a WAV and pictures.
// Driven by tools/audio/check.ts and tools/audio/render.ts through window.__lab.
import { createRig, volumeGain } from '../synth.ts'
import * as A from './analyze.ts'
import { CASES, WORST_BED, type Case } from './cases.ts'
import { picture, wav } from './picture.ts'
import { DEFAULT_VOLUME, type Lab, type Metrics, type Rendered, type VoiceResult } from './report.ts'

const SR = 48000
const SEED = 20260611

async function render(c: Case, master: boolean, volume: number): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(c.seconds * SR), SR)
  const rig = createRig(ctx, ctx.destination, { seed: SEED, master })
  const v = volumeGain(volume)
  if (c.fadeIn) {
    rig.volume.gain.value = 0
    rig.volume.gain.setTargetAtTime(v, 0, 0.25)
  } else {
    rig.volume.gain.value = v
  }
  c.play(rig, c.seconds)
  const b = await ctx.startRendering()
  return [b.getChannelData(0), b.getChannelData(1)]
}

function samplePeak(chans: Float32Array[]): number {
  let p = 0
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a }
  return p
}

const profiles = new Map<string, Promise<Float64Array>>()

function profileOf(id: string): Promise<Float64Array> {
  let p = profiles.get(id)
  if (!p) {
    const c = CASES.find(x => x.id === id)
    if (!c) throw new Error(`no bed ${id}`)
    p = render(c, true, DEFAULT_VOLUME).then(ch => A.bedProfile(ch, SR, 6))
    profiles.set(id, p)
  }
  return p
}

const f0 = (x: number) => x.toFixed(0)
const f1 = (x: number) => x.toFixed(1)

function features(c: Case, chans: Float32Array[]): string[] {
  const out: string[] = []
  const m = A.mid(chans)
  for (const f of c.features ?? []) {
    if (f === 'notes') {
      for (const n of A.notes(m, SR, 1500, 8000, 14)) {
        out.push(`note at ${n.at.toFixed(3)} s, ${f0(n.dur * 1000)} ms, ${f0(n.hz0)} to ${f0(n.hz1)} Hz (range ${f0(n.lo)}-${f0(n.hi)}), ${f1(n.db)} dB`)
      }
    } else if (f === 'lines') {
      out.push('spectral lines: ' + A.spectralPeaks(m, SR, 16384, 60, 9000, 10).map(p => `${f0(p.hz)} Hz ${f1(p.db)} dB`).join(', '))
    } else if (f === 'engine') {
      const late = m.subarray(6 * SR)
      out.push('spectral lines 8-700 Hz: ' + A.spectralPeaks(late, SR, 65536, 8, 700, 14).map(p => `${f1(p.hz)} Hz ${f1(p.db)} dB`).join(', '))
      out.push('octave bands 31.5 Hz to 4 kHz, dB re the 125 Hz band: ' + A.octaves(late, SR).map(f1).join(' '))
    } else if (f === 'pulses') {
      const on = A.onsets(chans, SR, 0.25, 5)
      const chirps: number[][] = []
      for (const t of on) {
        const last = chirps[chirps.length - 1]
        if (last && t - last[last.length - 1] < 0.08) last.push(t); else chirps.push([t])
      }
      const inner: number[] = []
      for (const ch of chirps) for (let i = 1; i < ch.length; i++) inner.push(ch[i] - ch[i - 1])
      const gaps = chirps.slice(1).map((ch, i) => ch[0] - chirps[i][0])
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
      const sd = (a: number[]) => Math.sqrt(mean(a.map(x => (x - mean(a)) ** 2)))
      out.push(`${chirps.length} chirps; pulses in each: ${chirps.map(ch => ch.length).join(' ')}`)
      out.push(`pulse period ${f1(mean(inner) * 1000)} ms; chirp period ${f0(mean(gaps) * 1000)} ms (sd ${f0(sd(gaps) * 1000)} ms), ${f1(60 / mean(gaps))} chirps a minute`)
      out.push('carrier: ' + A.spectralPeaks(m, SR, 16384, 2000, 9000, 3).map(p => `${f0(p.hz)} Hz ${f1(p.db)} dB`).join(', '))
    } else if (f === 'knocks') {
      const on = A.onsets(chans, SR, 0.1, 25)
      const env = A.envelope(chans, SR)
      const lv = on.map(t => { let p = 0; for (let i = Math.round(t * 1000); i < Math.min(env.length, Math.round(t * 1000) + 40); i++) p = Math.max(p, env[i]); return p })
      out.push(`${on.length} knocks at ${on.map(t => t.toFixed(2)).join(' ')} s`)
      out.push(`gaps ${on.slice(1).map((t, i) => f0((t - on[i]) * 1000)).join(' ')} ms; levels ${lv.map(p => f1(A.db(p))).join(' ')} dB`)
      out.push('spectral lines: ' + A.spectralPeaks(m, SR, 8192, 50, 4000, 8).map(p => `${f0(p.hz)} Hz ${f1(p.db)} dB`).join(', '))
    } else if (f === 'rain') {
      const late = m.subarray(8 * SR)
      out.push(`level in 0.6-1.2 kHz ${f1(A.bandLevel(late, SR, 600, 1200))} dB, in 4.4-5.6 kHz ${f1(A.bandLevel(late, SR, 4400, 5600))} dB, in 6-8 kHz ${f1(A.bandLevel(late, SR, 6000, 8000))} dB`)
    } else if (f === 'ridge') {
      const p = A.bandPeak(m.subarray(8 * SR), SR, 150, 6000)
      out.push(`band peaks at ${f0(p.hz)} Hz, 3 dB down at ${f0(p.from)} and ${f0(p.to)} Hz`)
    } else if (f === 'gusts') {
      const w = A.levelWander(m, SR, 10)
      out.push(`level second by second: standard deviation ${f1(w.sd)} dB, from ${f1(w.lo)} to +${f1(w.hi)} dB about its mean`)
    }
  }
  return out
}

async function run(i: number, files: boolean): Promise<Rendered> {
  const c = CASES[i]
  const began = performance.now()
  const chans = await render(c, true, DEFAULT_VOLUME)
  const cost = (performance.now() - began) / 1000 / c.seconds
  const loud = A.loudness(chans, SR)
  const b = A.bands(chans, SR)
  const long = c.kind === 'bed' || c.kind === 'voice' || c.kind === 'scene'
  const m: Metrics = {
    truePeak: A.db(A.truePeak(chans)),
    lufs: loud.integrated, momentary: loud.momentaryMax, shortTerm: loud.shortTermMax,
    dc: A.dcOffset(chans),
    clicks: A.clicks(chans, SR),
    sub80: b.sub80, harsh: b.harsh, hiss: b.hiss, centroid: b.centroid,
    corr: A.stereoCorrelation(chans),
    wave: long && c.seconds >= 8 ? A.waveRepeat(chans, SR) : null,
    rhythm: long && c.seconds >= 8 ? A.rhythmRepeat(chans, SR) : null,
    shape: c.kind === 'cue' ? A.shape(chans, SR) : null,
    mask: null, worst: null, chain: { gain: 0, squash: 0 },
  }
  if (c.kind === 'cue') {
    const cp = A.cueProfile(chans, SR)
    if (c.over) m.mask = { ...A.masking(cp, await profileOf(c.over)), bed: c.over }
    m.worst = A.masking(cp, await profileOf(WORST_BED))
  }
  const peakMax = samplePeak(await render(c, true, 1))
  const raw = await render(c, false, 1)
  const rawPeak = samplePeak(raw)
  const rms = (ch: Float32Array[]) => Math.sqrt(ch.reduce((sum, d) => sum + d.reduce((q, v) => q + v * v, 0), 0))
  if (!c.fadeIn && rawPeak > 0) {
    const gain = A.db(rms(chans) / (rms(raw) * volumeGain(DEFAULT_VOLUME)))
    m.chain = { gain, squash: A.db(samplePeak(chans) / (rawPeak * volumeGain(DEFAULT_VOLUME))) - gain }
  }
  const result: VoiceResult = {
    id: c.id, name: c.name, kind: c.kind, seconds: c.seconds, solo: c.solo, ticks: c.ticks === true, periodic: c.periodic === true, song: c.song === true, plan: c.plan,
    m, peakMax, rawPeak, cost, features: features(c, chans),
  }
  if (!files) return { result, wav: '', png: '', small: '', zoom: '' }
  const win = c.win ?? (c.seconds <= 4 ? 2048 : 4096)
  const note = `${c.seconds} s   ${f1(m.lufs)} LUFS   peak ${f1(m.truePeak)} dBTP   FFT ${win}`
  return {
    result,
    wav: wav(chans, SR),
    png: picture(chans, SR, { title: c.name, note, win, scale: 1 }),
    // The small picture for the write-up: the close-up for a single bird or cricket, the whole spectrum otherwise.
    small: picture(chans, SR, {
      title: c.name, note: `${c.seconds} s  ${f1(m.lufs)} LUFS`, scale: 0.5, levels: 16, cell: 2,
      win: c.band && c.solo ? Math.min(win, 1024) : win, band: c.band && c.solo ? c.band : undefined,
    }),
    zoom: c.band ? picture(chans, SR, { title: `${c.name}, ${c.band[0]} to ${c.band[1]} Hz`, note, win: Math.min(win, 1024), scale: 1, band: c.band }) : '',
  }
}

// The smallest step, in dBFS, that the click test finds when one `len` samples wide is planted in a clean render.
function smallestStep(clean: Float32Array[], len: number): number {
  const at = Math.floor(clean[0].length / 2)
  for (let dbfs = -66; dbfs <= -20; dbfs += 2) {
    const size = Math.pow(10, dbfs / 20)
    const bad = clean.map(ch => ch.slice())
    for (const ch of bad) for (let i = at; i < ch.length; i++) ch[i] += size * Math.min(1, (i - at + 1) / len)
    const k = A.clicks(bad, SR)
    if (k.count >= 1 && Math.abs(k.at - at / SR) <= 0.01) return dbfs
  }
  return 0
}

// Proves the instruments can see. A step planted in a clean render must be found, a clean render must pass, and
// the loudness meter must read a known signal correctly. Each [case, seconds in, one-sample limit, 1 ms limit]
// is the largest planted step, in dBFS, allowed to go unfound in that kind of sound (0: none is required; a step
// smeared over a millisecond hides in noise from this test).
const SEEN: [string, number, number, number][] = [
  ['cue-warn-watch', 2, -50, -30],
  ['tractor-working', 8, -48, -16],
  ['bed-june', 12, -34, 0],
]

async function selfTest(): Promise<{ fails: string[]; report: string[] }> {
  const fails: string[] = []
  const report: string[] = []
  for (const [id, from, oneLimit, wideLimit] of SEEN) {
    const c = CASES.find(x => x.id === id)!
    const clean = (await render(c, true, DEFAULT_VOLUME)).map(ch => ch.slice(from * SR, (from + 3) * SR))
    if (A.clicks(clean, SR).count !== 0) fails.push(`click test flags the clean render of ${c.name}`)
    const one = smallestStep(clean, 1), wide = smallestStep(clean, 48)
    report.push(`click test in ${c.name}: finds a one-sample step from ${one} dBFS, a step 1 ms wide ${wide ? `from ${wide} dBFS` : 'not at all up to -20 dBFS'}`)
    if (one > oneLimit) fails.push(`click test needs a one-sample step of ${one} dBFS in ${c.name}; the limit is ${oneLimit}`)
    if (wide > wideLimit) fails.push(`click test needs a 1 ms step of ${wide} dBFS in ${c.name}; the limit is ${wideLimit}`)
  }
  // How hard the engine is to run. Every continuous voice is built and runs whatever the weather, so a gale
  // stands for all of them; sounds scheduled a moment ahead in the game are all built at once in a render, and
  // would overstate it.
  const busy = CASES.find(x => x.id === 'bed-october-gale')!
  const began = performance.now()
  await render(busy, true, DEFAULT_VOLUME)
  report.push(`cost: ${busy.seconds} s of a gale, every continuous voice running, renders in ${((performance.now() - began) / 1000).toFixed(1)} s, building the engine included`)
  const tone = new Float32Array(SR)
  for (let i = 0; i < SR; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 997 * i) / SR)
  const l = A.loudness([tone, tone], SR).integrated
  // A 997 Hz sine at -6 dBFS in both channels reads -6.0 LUFS on a BS.1770 meter.
  report.push(`loudness meter: a -6.0 dBFS 997 Hz stereo sine reads ${l.toFixed(2)} LUFS`)
  if (Math.abs(l - -6.0) > 0.15) fails.push(`loudness meter reads ${l.toFixed(2)} LUFS for a -6 dBFS 997 Hz stereo sine, not -6.0`)
  return { fails, report }
}

const lab: Lab = {
  cases: CASES.map(c => ({ id: c.id, name: c.name, kind: c.kind, seconds: c.seconds })),
  defaultVolume: DEFAULT_VOLUME,
  run, selfTest,
}
;(window as unknown as { __lab: Lab }).__lab = lab
document.getElementById('out')!.textContent = `${CASES.length} cases ready. Run tools/audio/check.ts or tools/audio/render.ts.`
