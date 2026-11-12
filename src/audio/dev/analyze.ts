// Measurements on rendered audio: what a listener would catch, as numbers. Pure functions on sample arrays at 48 kHz.

export const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity)
export const pdb = (p: number): number => (p > 0 ? 10 * Math.log10(p) : -Infinity)

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}

export function mid(chans: Float32Array[]): Float32Array {
  if (chans.length === 1) return chans[0]
  const n = chans[0].length
  const m = new Float32Array(n)
  for (const c of chans) for (let i = 0; i < n; i++) m[i] += c[i] / chans.length
  return m
}

const hannCache = new Map<number, Float64Array>()
function hann(n: number): Float64Array {
  let w = hannCache.get(n)
  if (!w) {
    w = new Float64Array(n)
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
    hannCache.set(n, w)
  }
  return w
}

// Hann-windowed power spectrum of n samples centred on `centre`, scaled so a full-scale sine reads 1 in its bin.
export function frameSpectrum(x: Float32Array, centre: number, n: number, re: Float64Array, im: Float64Array, out: Float64Array): void {
  const w = hann(n)
  const start = Math.round(centre - n / 2)
  for (let i = 0; i < n; i++) {
    const j = start + i
    re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0
    im[i] = 0
  }
  fft(re, im)
  const k = 16 / (n * n)
  for (let i = 0; i <= n / 2; i++) out[i] = (re[i] * re[i] + im[i] * im[i]) * k
}

export interface Stft { n: number; hop: number; frames: Float64Array[] }

export function stft(x: Float32Array, n: number, hop: number): Stft {
  const re = new Float64Array(n), im = new Float64Array(n)
  const frames: Float64Array[] = []
  for (let c = n / 2; c + n / 2 <= x.length || frames.length === 0; c += hop) {
    const p = new Float64Array(n / 2 + 1)
    frameSpectrum(x, c, n, re, im, p)
    frames.push(p)
    if (c + n / 2 > x.length) break
  }
  return { n, hop, frames }
}

function biquad(x: Float32Array | Float64Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float64Array {
  const y = new Float64Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

export interface Loudness { integrated: number; momentaryMax: number; shortTermMax: number }

// ITU-R BS.1770-4: K-weighting (the standard's 48 kHz coefficients), 400 ms blocks at 75% overlap,
// gated at -70 LUFS absolute and 10 LU under the ungated mean. Momentary is the loudest 400 ms block,
// short-term the loudest 3 s.
export function loudness(chans: Float32Array[], sr: number): Loudness {
  if (sr !== 48000) throw new Error('K-weighting coefficients are for 48 kHz')
  const k = chans.map(c => biquad(
    biquad(c, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585),
    1, -2, 1, -1.99004745483398, 0.99007225036621,
  ))
  const hop = sr / 10
  const n = k[0].length
  const tenths = Math.floor(n / hop)
  const e = new Float64Array(tenths)
  for (const c of k) for (let t = 0; t < tenths; t++) {
    let s = 0
    for (let i = t * hop; i < (t + 1) * hop; i++) s += c[i] * c[i]
    e[t] += s / hop
  }
  const blocks = (len: number): number[] => {
    const out: number[] = []
    for (let t = 0; t + len <= tenths; t++) {
      let s = 0
      for (let j = 0; j < len; j++) s += e[t + j]
      out.push(s / len)
    }
    return out
  }
  const lk = (p: number) => -0.691 + pdb(p)
  const m = blocks(4)
  const momentaryMax = m.length ? lk(Math.max(...m)) : -Infinity
  const st = blocks(30)
  const shortTermMax = st.length ? lk(Math.max(...st)) : -Infinity
  const abs = m.filter(p => lk(p) > -70)
  if (!abs.length) return { integrated: -Infinity, momentaryMax, shortTermMax }
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
  const kept = abs.filter(p => lk(p) > rel)
  return { integrated: lk(kept.reduce((a, b) => a + b, 0) / kept.length), momentaryMax, shortTermMax }
}

// True peak: the largest value on a 4x oversampled copy (windowed-sinc interpolation, 16 taps a phase).
export function truePeak(chans: Float32Array[]): number {
  const taps: Float64Array[] = []
  for (let p = 1; p < 4; p++) {
    const h = new Float64Array(16)
    for (let j = 0; j < 16; j++) {
      const t = j - 7 - p / 4
      const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / 8.5)
      h[j] = (Math.sin(Math.PI * t) / (Math.PI * t)) * win
    }
    taps.push(h)
  }
  let peak = 0
  for (const x of chans) {
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i])
      if (a > peak) peak = a
      if (Math.max(a, Math.abs(x[i + 1] ?? 0)) < peak * 0.5) continue
      for (const h of taps) {
        let s = 0
        for (let j = 0; j < 16; j++) {
          const q = i + j - 7
          if (q >= 0 && q < x.length) s += x[q] * h[j]
        }
        if (Math.abs(s) > peak) peak = Math.abs(s)
      }
    }
  }
  return peak
}

export interface Clicks { count: number; worst: number; at: number; jump: number; scale: number }

const CLICK_RATIO = 6
const CLICK_ABS = 0.0015
const CLICK_FLOOR = 0.0002

// Discontinuities: a break from the straight line through the samples before it (the second difference, taken
// 1, 4, 16 and 64 samples apart) that stands far outside every other such break within 80 ms either side.
// A step in a smooth signal shows at 1; one smeared by a filter shows at the wider spacings.
// Dense noise hides small steps from this test, as it hides them from the ear.
export function clicks(chans: Float32Array[], sr: number): Clicks {
  const B = 32
  const W = Math.round((0.08 * sr) / B)
  const out: Clicks = { count: 0, worst: 0, at: 0, jump: 0, scale: 0 }
  const flagged = new Set<number>()
  for (const k of [1, 4, 16, 64]) {
    const ex = Math.ceil((3 * k) / B) + 1
    for (const x of chans) {
      const nb = Math.floor(x.length / B)
      const M = new Float32Array(nb)
      for (let b = 0; b < nb; b++) {
        let m = 0
        for (let i = Math.max(2 * k, b * B); i < (b + 1) * B; i++) {
          const d = Math.abs(x[i] - 2 * x[i - k] + x[i - 2 * k])
          if (d > m) m = d
        }
        M[b] = m
      }
      for (let b = 0; b < nb; b++) {
        if (M[b] < CLICK_ABS) continue
        const top = [0, 0, 0, 0]
        for (let j = Math.max(0, b - W); j <= Math.min(nb - 1, b + W); j++) {
          if (Math.abs(j - b) <= ex) continue
          const v = M[j]
          if (v <= top[3]) continue
          let q = 3
          while (q > 0 && top[q - 1] < v) { top[q] = top[q - 1]; q-- }
          top[q] = v
        }
        const ratio = M[b] / Math.max(top[3], CLICK_FLOOR)
        if (ratio < CLICK_RATIO) continue
        if (ratio > out.worst) { out.worst = ratio; out.at = (b * B) / sr; out.jump = M[b]; out.scale = k }
        flagged.add(Math.round((b * B) / (sr * 0.005)))
      }
    }
  }
  out.count = flagged.size
  return out
}

export interface Bands { sub80: number; harsh: number; hiss: number; centroid: number }

// Share of the energy below 80 Hz, between 2 and 5 kHz, and above 8 kHz; and the spectral centroid in Hz.
export function bands(chans: Float32Array[], sr: number): Bands {
  const n = 8192
  let total = 0, sub = 0, harsh = 0, hiss = 0, cen = 0
  for (const x of chans) {
    const s = stft(x, n, n / 2)
    for (const p of s.frames) {
      for (let i = 1; i < p.length; i++) {
        const f = (i * sr) / n
        total += p[i]
        cen += p[i] * f
        if (f < 80) sub += p[i]
        else if (f >= 2000 && f < 5000) harsh += p[i]
        else if (f >= 8000) hiss += p[i]
      }
    }
  }
  if (total <= 0) return { sub80: 0, harsh: 0, hiss: 0, centroid: 0 }
  return { sub80: sub / total, harsh: harsh / total, hiss: hiss / total, centroid: cen / total }
}

export function dcOffset(chans: Float32Array[]): number {
  let worst = 0
  for (const x of chans) {
    let s = 0
    for (let i = 0; i < x.length; i++) s += x[i]
    worst = Math.max(worst, Math.abs(s / x.length))
  }
  return worst
}

export function stereoCorrelation(chans: Float32Array[]): number {
  if (chans.length < 2) return 1
  const [l, r] = chans
  let ll = 0, rr = 0, lr = 0
  for (let i = 0; i < l.length; i++) { ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i] }
  return ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1
}

export interface Repeat { peak: number; lag: number; salience: number }

// Normalised autocorrelation of x over lags from minLag to half its length (in samples of x). `peak` is the
// largest value and `lag` where; `salience` is how far that stands above the 99.5th percentile of all the lags
// more than 50 ms away from it, which separates one repeat from a steady tone that correlates at every period.
function autocorr(x: Float64Array, minLag: number, rate: number): Repeat {
  const n = x.length
  let size = 1
  while (size < 2 * n) size <<= 1
  const re = new Float64Array(size), im = new Float64Array(size)
  let mean = 0
  for (let i = 0; i < n; i++) mean += x[i] / n
  for (let i = 0; i < n; i++) re[i] = x[i] - mean
  const cum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + re[i] * re[i]
  fft(re, im)
  for (let i = 0; i < size; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0 }
  fft(re, im)
  const maxLag = Math.floor(n / 2)
  const r = new Float64Array(maxLag + 1)
  let peak = -1, lag = 0
  for (let k = minLag; k <= maxLag; k++) {
    const e0 = cum[n - k], e1 = cum[n] - cum[k]
    r[k] = e0 > 0 && e1 > 0 ? re[k] / size / Math.sqrt(e0 * e1) : 0
    if (r[k] > peak) { peak = r[k]; lag = k }
  }
  if (peak < 0) return { peak: 0, lag: 0, salience: 0 }
  const guard = Math.round(0.05 * rate)
  const rest: number[] = []
  for (let k = minLag; k <= maxLag; k++) if (Math.abs(k - lag) > guard) rest.push(r[k])
  rest.sort((a, b) => a - b)
  const p = rest.length ? rest[Math.floor(rest.length * 0.995)] : 0
  return { peak, lag: lag / rate, salience: peak - p }
}

// An exact repeat of the waveform (a noise loop coming round), looked for at lags of 1 s and more.
export function waveRepeat(chans: Float32Array[], sr: number): Repeat {
  const m = mid(chans)
  const dec = 4
  const n = Math.floor(m.length / dec)
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < dec; j++) s += m[i * dec + j]
    x[i] = s / dec
  }
  return autocorr(x, sr / dec, sr / dec)
}

// A repeat in the rhythm (the same pattern of events coming round), from the level in 20 ms steps.
export function rhythmRepeat(chans: Float32Array[], sr: number): Repeat {
  const m = mid(chans)
  const hop = Math.round(sr / 50)
  const n = Math.floor(m.length / hop)
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < hop; j++) s += m[i * hop + j] * m[i * hop + j]
    x[i] = Math.sqrt(s / hop)
  }
  return autocorr(x, 50, 50)
}

// Level over time: RMS in 2 ms windows, one value a millisecond, loudest channel.
export function envelope(chans: Float32Array[], sr: number): Float64Array {
  const hop = Math.round(sr / 1000)
  const win = hop * 2
  const n = Math.floor((chans[0].length - win) / hop) + 1
  const env = new Float64Array(Math.max(0, n))
  for (const x of chans) {
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let j = i * hop; j < i * hop + win; j++) s += x[j] * x[j]
      const v = Math.sqrt(s / win)
      if (v > env[i]) env[i] = v
    }
  }
  return env
}

export interface Shape { attackMs: number; decayMs: number; lengthMs: number; tail: number }

// attack: 10% to 90% of the peak level. decay: from the peak to the last moment within 20 dB of it.
// length: first to last moment within 40 dB of the peak. tail: the level over the last 10 ms of the render.
export function shape(chans: Float32Array[], sr: number): Shape {
  const env = envelope(chans, sr)
  let peak = 0, at = 0
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; at = i }
  if (peak <= 0) return { attackMs: 0, decayMs: 0, lengthMs: 0, tail: 0 }
  const first = (lv: number) => { for (let i = 0; i < env.length; i++) if (env[i] >= lv * peak) return i; return 0 }
  const last = (lv: number) => { for (let i = env.length - 1; i >= 0; i--) if (env[i] >= lv * peak) return i; return 0 }
  let tail = 0
  for (let i = Math.max(0, env.length - 10); i < env.length; i++) tail = Math.max(tail, env[i])
  return { attackMs: first(0.9) - first(0.1), decayMs: last(0.1) - at, lengthMs: last(0.01) - first(0.01), tail }
}

export const THIRD_OCTAVES = Array.from({ length: 25 }, (_, i) => 1000 * Math.pow(2, (i - 13) / 3))

// Power in each third-octave band from 50 Hz to 12.5 kHz, frame by frame (8192-sample frames, about 170 ms).
function bandFrames(x: Float32Array, sr: number, from: number): Float64Array[] {
  const n = 8192
  const s = stft(x.subarray(Math.min(x.length, Math.floor(from * sr))), n, 1024)
  return s.frames.map(p => {
    const out = new Float64Array(THIRD_OCTAVES.length)
    THIRD_OCTAVES.forEach((fc, b) => {
      const lo = Math.max(1, Math.round((fc / Math.pow(2, 1 / 6)) * n / sr)), hi = Math.round((fc * Math.pow(2, 1 / 6)) * n / sr)
      let e = 0
      for (let i = lo; i <= hi; i++) e += p[i]
      // Hann frames overlap their neighbouring bins by a factor of 1.5.
      out[b] = e / 1.5
    })
    return out
  })
}

// Mean band levels of a bed, after its first seconds of fade-in.
export function bedProfile(chans: Float32Array[], sr: number, skip: number): Float64Array {
  const f = bandFrames(mid(chans), sr, skip)
  const out = new Float64Array(THIRD_OCTAVES.length)
  for (const p of f) for (let b = 0; b < out.length; b++) out[b] += p[b] / f.length
  return out
}

// Loudest frame of a cue in each band.
export function cueProfile(chans: Float32Array[], sr: number): Float64Array {
  const f = bandFrames(mid(chans), sr, 0)
  const out = new Float64Array(THIRD_OCTAVES.length)
  for (const p of f) for (let b = 0; b < out.length; b++) out[b] = Math.max(out[b], p[b])
  return out
}

export interface Masking { domHz: number; snrDom: number; bestHz: number; snrBest: number; bandsOver: number; smallHz: number; snrSmall: number }

// Cue against bed, band by band: in the cue's strongest band, in the band where it stands furthest clear (among
// those within 20 dB of its strongest, so a trace of the cue in an empty band does not count), how many such
// bands top the bed by 6 dB or more, and how far it stands clear in the bands a small speaker can play.
export function masking(cue: Float64Array, bed: Float64Array): Masking {
  let dom = 0
  for (let b = 0; b < cue.length; b++) if (cue[b] > cue[dom]) dom = b
  const snr = (b: number) => pdb(cue[b]) - pdb(Math.max(bed[b], 1e-14))
  let best = dom, over = 0, small = -1
  for (let b = 0; b < cue.length; b++) {
    // What a phone's speaker can play: 500 Hz and up, down to 30 dB under the cue's strongest band.
    if (THIRD_OCTAVES[b] >= 490 && pdb(cue[b]) >= pdb(cue[dom]) - 30 && (small < 0 || snr(b) > snr(small))) small = b
    if (pdb(cue[b]) < pdb(cue[dom]) - 20) continue
    if (snr(b) > snr(best)) best = b
    if (snr(b) >= 6) over++
  }
  return {
    domHz: THIRD_OCTAVES[dom], snrDom: snr(dom), bestHz: THIRD_OCTAVES[best], snrBest: snr(best), bandsOver: over,
    smallHz: small < 0 ? 0 : THIRD_OCTAVES[small], snrSmall: small < 0 ? -Infinity : snr(small),
  }
}

export interface Peak { hz: number; db: number }

// The strongest spectral lines between two frequencies, from a long averaged spectrum.
export function spectralPeaks(x: Float32Array, sr: number, n: number, lo: number, hi: number, count: number): Peak[] {
  const s = stft(x, n, n / 2)
  const avg = new Float64Array(n / 2 + 1)
  for (const p of s.frames) for (let i = 0; i < avg.length; i++) avg[i] += p[i] / s.frames.length
  const found: Peak[] = []
  const a = Math.max(2, Math.floor((lo * n) / sr)), b = Math.min(avg.length - 3, Math.ceil((hi * n) / sr))
  for (let i = a; i <= b; i++) {
    if (avg[i] > avg[i - 1] && avg[i] >= avg[i + 1] && avg[i] > avg[i - 2] && avg[i] > avg[i + 2]) {
      const l = Math.log(avg[i - 1]), c = Math.log(avg[i]), r = Math.log(avg[i + 1])
      const off = (0.5 * (l - r)) / (l - 2 * c + r)
      found.push({ hz: ((i + off) * sr) / n, db: pdb(avg[i]) })
    }
  }
  return found.sort((p, q) => q.db - p.db).slice(0, count).sort((p, q) => p.hz - q.hz)
}

export interface Note { at: number; dur: number; hz0: number; hz1: number; lo: number; hi: number; db: number }

// Whistled notes: runs of frames where one spectral line between lo and hi stands within `range` dB of the loudest.
export function notes(x: Float32Array, sr: number, lo: number, hi: number, range = 26): Note[] {
  const n = 1024, hop = 96
  const s = stft(x, n, hop)
  const a = Math.floor((lo * n) / sr), b = Math.ceil((hi * n) / sr)
  const track = s.frames.map(p => {
    let k = a
    for (let i = a; i <= b; i++) if (p[i] > p[k]) k = i
    const l = Math.log(p[k - 1] + 1e-30), c = Math.log(p[k] + 1e-30), r = Math.log(p[k + 1] + 1e-30)
    const den = l - 2 * c + r
    return { hz: ((k + (den ? (0.5 * (l - r)) / den : 0)) * sr) / n, p: p[k] }
  })
  const top = Math.max(...track.map(t => t.p))
  const floor = top * Math.pow(10, -range / 10)
  const out: Note[] = []
  let start = -1
  for (let i = 0; i <= track.length; i++) {
    const on = i < track.length && track[i].p >= floor
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      const seg = track.slice(start, i)
      const inner = seg.length > 6 ? seg.slice(2, -2) : seg
      const hz = inner.map(t => t.hz)
      out.push({
        at: (n / 2 + start * hop) / sr - n / (4 * sr),
        dur: Math.max(hop / sr, ((i - start) * hop) / sr - n / (2 * sr)),
        hz0: hz[0], hz1: hz[hz.length - 1], lo: Math.min(...hz), hi: Math.max(...hz),
        db: pdb(Math.max(...seg.map(t => t.p))),
      })
      start = -1
    }
  }
  return out
}

// Onsets of separate sounds: moments the level climbs through `frac` of the peak after `gapMs` below it.
export function onsets(chans: Float32Array[], sr: number, frac: number, gapMs: number): number[] {
  const env = envelope(chans, sr)
  let peak = 0
  for (let i = 0; i < env.length; i++) peak = Math.max(peak, env[i])
  const out: number[] = []
  let quiet = gapMs
  for (let i = 0; i < env.length; i++) {
    if (env[i] >= frac * peak) {
      if (quiet >= gapMs) out.push(i / 1000)
      quiet = 0
    } else quiet++
  }
  return out
}

// Level in each octave band from 31.5 Hz to 4 kHz, in dB relative to the 125 Hz band.
export function octaves(x: Float32Array, sr: number): number[] {
  const n = 16384
  const st = stft(x, n, n / 2)
  const centres = [31.5, 63, 125, 250, 500, 1000, 2000, 4000]
  const e = centres.map(fc => {
    const lo = Math.max(1, Math.round((fc / Math.SQRT2) * n / sr)), hi = Math.round((fc * Math.SQRT2) * n / sr)
    let sum = 0
    for (const p of st.frames) for (let i = lo; i <= hi; i++) sum += p[i]
    return sum
  })
  return e.map(v => pdb(v / e[2]))
}

// Mean level, in dB, of the part of a signal between two frequencies.
export function bandLevel(x: Float32Array, sr: number, lo: number, hi: number): number {
  const n = 8192
  const st = stft(x, n, n / 2)
  const a = Math.max(1, Math.round((lo * n) / sr)), b = Math.round((hi * n) / sr)
  let sum = 0
  for (const p of st.frames) for (let i = a; i <= b; i++) sum += p[i]
  return pdb(sum / (1.5 * st.frames.length))
}

// Where a broad band of noise peaks, and where it falls 3 dB either side, from the average spectrum smoothed
// over a third of an octave.
export function bandPeak(x: Float32Array, sr: number, lo: number, hi: number): { hz: number; from: number; to: number } {
  const n = 8192
  const st = stft(x, n, n / 2)
  const avg = new Float64Array(n / 2 + 1)
  for (const p of st.frames) for (let i = 0; i < avg.length; i++) avg[i] += p[i]
  const smooth = (i: number) => {
    const a = Math.max(1, Math.floor(i / 1.122)), b = Math.min(avg.length - 1, Math.ceil(i * 1.122))
    let v = 0
    for (let k = a; k <= b; k++) v += avg[k]
    return v / (b - a + 1)
  }
  const a = Math.round((lo * n) / sr), b = Math.round((hi * n) / sr)
  let top = a
  for (let i = a; i <= b; i++) if (smooth(i) > smooth(top)) top = i
  let from = top, to = top
  while (from > a && smooth(from) > smooth(top) / 2) from--
  while (to < b && smooth(to) > smooth(top) / 2) to++
  return { hz: (top * sr) / n, from: (from * sr) / n, to: (to * sr) / n }
}

// How the level wanders: the standard deviation and the spread, in dB, of the level second by second.
export function levelWander(x: Float32Array, sr: number, skip: number): { sd: number; lo: number; hi: number } {
  const lv: number[] = []
  for (let a = Math.floor(skip * sr); a + sr <= x.length; a += sr) {
    let sum = 0
    for (let i = a; i < a + sr; i++) sum += x[i] * x[i]
    lv.push(pdb(sum / sr))
  }
  const mean = lv.reduce((p, q) => p + q, 0) / lv.length
  return { sd: Math.sqrt(lv.reduce((p, q) => p + (q - mean) ** 2, 0) / lv.length), lo: Math.min(...lv) - mean, hi: Math.max(...lv) - mean }
}

// What a stretch of sound is like in the large: where its energy lies, as third-octave levels in dB under its own
// strongest band (so loudness alone is no difference), and how much each band comes and goes, as the spread in
// dB of its level from one 170 ms frame to the next (a steady hiss is near 0; birdsong, a knock, a honk are large).
export interface Print { level: Float64Array; move: Float64Array }

const PRINT_FLOOR = -45

export function fingerprint(chans: Float32Array[], sr: number, skip: number): Print {
  const f = bandFrames(mid(chans), sr, skip)
  const nb = THIRD_OCTAVES.length
  const mean = new Float64Array(nb)
  for (const p of f) for (let b = 0; b < nb; b++) mean[b] += p[b] / f.length
  let top = 0
  for (let b = 0; b < nb; b++) top = Math.max(top, mean[b])
  const level = new Float64Array(nb), move = new Float64Array(nb)
  const quiet = top * Math.pow(10, PRINT_FLOOR / 10)
  for (let b = 0; b < nb; b++) {
    level[b] = Math.max(PRINT_FLOOR, pdb(mean[b] / top))
    // A band that never rises out of the floor does not move.
    let s = 0, s2 = 0
    for (const p of f) {
      const v = pdb(Math.max(p[b], quiet) / top)
      s += v
      s2 += v * v
    }
    move[b] = Math.sqrt(Math.max(0, s2 / f.length - (s / f.length) ** 2))
  }
  return { level, move }
}

// How far apart two prints are: the root-mean-square difference across the bands, in dB, of where the energy lies
// and of how much it moves.
export function printDistance(a: Print, b: Print): { level: number; move: number; both: number } {
  let l = 0, m = 0
  const n = a.level.length
  for (let i = 0; i < n; i++) {
    l += (a.level[i] - b.level[i]) ** 2
    m += (a.move[i] - b.move[i]) ** 2
  }
  const level = Math.sqrt(l / n), move = Math.sqrt(m / n)
  return { level, move, both: Math.sqrt(level * level + move * move) }
}

// A cue's mark: its loudest moment in each band, in dB under its strongest band, and its rhythm, the level in
// 20 ms steps over the two seconds from its first sound.
export interface Mark { level: Float64Array; rhythm: Float64Array }

const MARK_FLOOR = -40

export function mark(chans: Float32Array[], sr: number): Mark {
  const p = cueProfile(chans, sr)
  let top = 0
  for (let b = 0; b < p.length; b++) top = Math.max(top, p[b])
  const level = new Float64Array(p.length)
  for (let b = 0; b < p.length; b++) level[b] = Math.max(MARK_FLOOR, pdb(p[b] / Math.max(top, 1e-30)))
  const env = envelope(chans, sr)
  let peak = 0
  for (let i = 0; i < env.length; i++) peak = Math.max(peak, env[i])
  let first = 0
  while (first < env.length && env[first] < 0.05 * peak) first++
  const rhythm = new Float64Array(100)
  let sum = 0
  for (let k = 0; k < rhythm.length; k++) {
    let v = 0
    for (let i = first + k * 20; i < Math.min(env.length, first + (k + 1) * 20); i++) v = Math.max(v, env[i])
    rhythm[k] = v
    sum += v * v
  }
  const norm = Math.sqrt(sum) || 1
  for (let k = 0; k < rhythm.length; k++) rhythm[k] /= norm
  return { level, rhythm }
}

// Two cues side by side: how far apart their spectra are (dB, root mean square across the bands either sounds
// in) and how alike their rhythms (1 is the same pattern of blows, allowing 60 ms of slip).
export function markDistance(a: Mark, b: Mark): { level: number; rhythm: number } {
  let l = 0, n = 0
  for (let i = 0; i < a.level.length; i++) {
    if (a.level[i] <= MARK_FLOOR && b.level[i] <= MARK_FLOOR) continue
    l += (a.level[i] - b.level[i]) ** 2
    n++
  }
  let best = 0
  for (let lag = -3; lag <= 3; lag++) {
    let dot = 0
    for (let k = 0; k < a.rhythm.length; k++) {
      const j = k + lag
      if (j >= 0 && j < b.rhythm.length) dot += a.rhythm[k] * b.rhythm[j]
    }
    best = Math.max(best, dot)
  }
  return { level: Math.sqrt(l / Math.max(1, n)), rhythm: best }
}
