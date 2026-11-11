// Draws a render so it can be looked at: a spectrogram (time across, frequency up, level as brightness), the
// average spectrum beside it, and the waveform under it. Also writes the render as a 16-bit WAV.
import { frameSpectrum, mid, pdb } from './analyze.ts'
import { prng } from '../synth.ts'

export const F_LO = 40
export const F_HI = 16000
const DB_TOP = -20
const DB_FLOOR = -110

const STOPS = [[0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164]]

function colour(v: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, v)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(x))
  const f = x - i
  return [0, 1, 2].map(c => Math.round(STOPS[i][c] + f * (STOPS[i + 1][c] - STOPS[i][c]))) as [number, number, number]
}

export interface PictureOptions {
  title: string
  note: string
  win: number                  // FFT length
  scale: number                // 1 for the working picture, less for the small one kept in the repository
  band?: [number, number]      // a linear-frequency close-up of this band instead of the 40 Hz to 16 kHz log axis
  levels?: number              // quantise brightness to this many steps (smaller files)
  cell?: number                // draw the spectrogram in blocks of this many pixels (smaller files)
}

const hzLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`)

export function picture(chans: Float32Array[], sr: number, o: PictureOptions): string {
  const s = o.scale
  const px = (v: number) => Math.round(v * s)
  const W = px(1500), left = px(62), right = px(150), top = px(30)
  const sh = px(o.band ? 420 : 500), gap = px(12), wh = px(o.band ? 0 : 104), bottom = px(34)
  const sw = W - left - right
  const H = top + sh + (wh ? gap + wh : 0) + bottom
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#14161a'
  g.fillRect(0, 0, W, H)
  g.font = `${px(13)}px ui-monospace, Menlo, monospace`
  g.textBaseline = 'middle'

  const x = mid(chans)
  const secs = x.length / sr
  const n = o.win
  const re = new Float64Array(n), im = new Float64Array(n), p = new Float64Array(n / 2 + 1)
  const lo = o.band ? o.band[0] : F_LO, hi = o.band ? o.band[1] : F_HI
  const rowHz = (r: number) => (o.band ? hi - (r / sh) * (hi - lo) : hi * Math.pow(lo / hi, r / sh))
  const hzRow = (f: number) => (o.band ? ((hi - f) / (hi - lo)) * sh : (Math.log(hi / f) / Math.log(hi / lo)) * sh)
  const img = g.createImageData(sw, sh)
  const avg = new Float64Array(sh)
  const cell = o.cell ?? 1
  for (let c = 0; c < sw; c += cell) {
    frameSpectrum(x, (Math.min(sw, c + cell / 2) / sw) * x.length, n, re, im, p)
    for (let r = 0; r < sh; r += cell) {
      const b0 = (rowHz(Math.min(sh, r + cell)) * n) / sr, b1 = (rowHz(r) * n) / sr
      let v: number
      if (b1 - b0 < 1) {
        const b = (b0 + b1) / 2, i = Math.floor(b), f = b - i
        v = p[i] * (1 - f) + p[i + 1] * f
      } else {
        v = 0
        const a = Math.ceil(b0), z = Math.floor(b1)
        for (let i = a; i <= z; i++) v += p[i]
        v /= z - a + 1
      }
      let t = (pdb(v) - DB_FLOOR) / (DB_TOP - DB_FLOOR)
      if (o.levels) t = Math.round(t * o.levels) / o.levels
      const [cr, cg, cb] = colour(t)
      for (let rr = r; rr < Math.min(sh, r + cell); rr++) {
        avg[rr] += (v * Math.min(cell, sw - c)) / sw
        for (let cc = c; cc < Math.min(sw, c + cell); cc++) {
          const k = (rr * sw + cc) * 4
          img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb; img.data[k + 3] = 255
        }
      }
    }
  }
  g.putImageData(img, left, top)

  g.fillStyle = '#e8e6df'
  g.textAlign = 'left'
  g.fillText(o.title, left, top / 2)
  g.textAlign = 'right'
  g.fillStyle = '#a9a79f'
  g.fillText(o.note, W - px(8), top / 2)

  g.strokeStyle = 'rgba(255,255,255,0.16)'
  g.lineWidth = 1
  const ticks = o.band
    ? Array.from({ length: Math.floor((hi - lo) / 500) + 1 }, (_, i) => lo + i * 500).filter(f => f % 1000 === 0 || hi - lo <= 4000)
    : [50, 100, 200, 500, 1000, 2000, 5000, 10000]
  for (const f of ticks) {
    const y = top + Math.round(hzRow(f)) + 0.5
    g.beginPath(); g.moveTo(left - px(4), y); g.lineTo(left + sw, y); g.stroke()
    g.fillStyle = '#c9c7bf'
    g.textAlign = 'right'
    g.fillText(hzLabel(f), left - px(7), y)
  }
  g.save()
  g.translate(px(12), top + sh / 2)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'center'
  g.fillStyle = '#a9a79f'
  g.fillText('Hz', 0, 0)
  g.restore()

  const step = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].find(t => secs / t <= 14) ?? 10
  const tx = (t: number) => left + (t / secs) * sw
  const tBase = top + sh + (wh ? gap + wh : 0)
  for (let t = 0; t <= secs + 1e-9; t += step) {
    const xx = Math.round(tx(t)) + 0.5
    g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, tBase + px(4)); g.stroke()
    g.fillStyle = '#c9c7bf'
    g.textAlign = 'center'
    g.fillText(`${Number(t.toFixed(2))}`, xx, tBase + px(14))
  }
  g.fillStyle = '#a9a79f'
  g.textAlign = 'left'
  g.fillText('seconds', left, tBase + px(27))

  // Average spectrum, sharing the frequency axis.
  const ax = left + sw + px(10), aw = right - px(20)
  g.strokeStyle = 'rgba(255,255,255,0.16)'
  for (let d = DB_FLOOR + 10; d <= DB_TOP; d += 30) {
    const xx = Math.round(ax + ((d - DB_FLOOR) / (DB_TOP - DB_FLOOR)) * aw) + 0.5
    g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, top + sh); g.stroke()
    g.fillStyle = '#c9c7bf'
    g.textAlign = 'center'
    g.fillText(`${d}`, xx, top + sh + px(12))
  }
  g.fillStyle = '#a9a79f'
  g.fillText('mean, dB', ax + aw / 2, top + sh + px(27))
  g.strokeStyle = '#f9c932'
  g.lineWidth = Math.max(1, s * 1.5)
  g.beginPath()
  for (let r = 0; r < sh; r++) {
    const xx = ax + Math.max(0, Math.min(1, (pdb(avg[r]) - DB_FLOOR) / (DB_TOP - DB_FLOOR))) * aw
    if (r === 0) g.moveTo(xx, top + r); else g.lineTo(xx, top + r)
  }
  g.stroke()

  if (wh) {
    const wy = top + sh + gap
    let peak = 1e-6
    for (const c of chans) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]))
    g.fillStyle = '#1d2026'
    g.fillRect(left, wy, sw, wh)
    const lanes = chans.length
    chans.forEach((c, k) => {
      const h = wh / lanes, cy = wy + h * (k + 0.5)
      g.fillStyle = k === 0 ? '#9cc4e4' : '#e4b89c'
      for (let col = 0; col < sw; col++) {
        const a = Math.floor((col / sw) * c.length), b = Math.max(a + 1, Math.floor(((col + 1) / sw) * c.length))
        let mn = 1, mx = -1
        for (let i = a; i < b; i++) { if (c[i] < mn) mn = c[i]; if (c[i] > mx) mx = c[i] }
        const y0 = cy - (mx / peak) * h * 0.47, y1 = cy - (mn / peak) * h * 0.47
        g.fillRect(left + col, y0, 1, Math.max(1, y1 - y0))
      }
    })
    g.fillStyle = '#a9a79f'
    g.textAlign = 'left'
    g.fillText('L over R,', ax, wy + wh * 0.3)
    g.fillText(`${(20 * Math.log10(peak)).toFixed(1)} dBFS high`, ax, wy + wh * 0.7)
  }
  return cv.toDataURL('image/png')
}

// 16-bit stereo WAV with triangular dither, as base64.
export function wav(chans: Float32Array[], sr: number): string {
  const n = chans[0].length, nch = chans.length
  const bytes = new Uint8Array(44 + n * nch * 2)
  const v = new DataView(bytes.buffer)
  const text = (o: number, t: string) => { for (let i = 0; i < t.length; i++) bytes[o + i] = t.charCodeAt(i) }
  text(0, 'RIFF'); v.setUint32(4, 36 + n * nch * 2, true); text(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true)
  text(36, 'data'); v.setUint32(40, n * nch * 2, true)
  const r = prng(0x7a11)
  let o = 44
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const q = Math.round(chans[c][i] * 32767 + r() - r())
      v.setInt16(o, Math.max(-32768, Math.min(32767, q)), true)
      o += 2
    }
  }
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
