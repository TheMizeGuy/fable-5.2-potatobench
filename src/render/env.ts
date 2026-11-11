// Light, sky and weather as numbers that ease from one day to the next.
import { Color } from 'three'
import type { Snapshot } from './state.ts'

export interface Env {
  sunElev: number
  sunAz: number
  sunI: number
  hemiI: number
  sun: Color
  hemiSky: Color
  hemiGround: Color
  skyTop: Color
  skyHorizon: Color
  fog: number              // haze, 0 clear to 1 thick fog
  rain: number
  snowfall: number
  wind: number
  windDir: number          // radians, the direction the wind blows toward, in the xz plane
  mist: number
  rime0: number            // rime on the ridge, mid-slope and bottom terraces
  rime1: number
  rime2: number
  snow: number             // snow lying on the ground
  wet: number              // general wetness of grass and road
  grass: Color
  birch: number            // leaves on the birches, 0..1
  gold: number             // autumn colour, 0..1
  oats: number             // growth of the rest-year cover
  oatsRipe: number
  ice: number
  smoke: number
  cloud: number            // drifting cloud shadow
}

export function makeEnv(): Env {
  return {
    sunElev: 0.8, sunAz: -2.2, sunI: 2.6, hemiI: 1.1,
    sun: new Color('#fff2dc'), hemiSky: new Color('#bcd3e0'), hemiGround: new Color('#5a4a38'),
    skyTop: new Color('#a9c6d9'), skyHorizon: new Color('#e9eee6'), fog: 0.05,
    rain: 0, snowfall: 0, wind: 0.3, windDir: 0.4, mist: 0, rime0: 0, rime1: 0, rime2: 0, snow: 0, wet: 0,
    grass: new Color('#6f8a45'), birch: 1, gold: 0, oats: 1, oatsRipe: 0, ice: 0, smoke: 0, cloud: 0,
  }
}

// Keyframes by day of year: [day, sun elevation (deg), sun colour, sun strength, grass colour]
const SEASON: [number, number, string, number, string][] = [
  [0, 13, '#f1ede4', 2.5, '#7f7c66'],
  [95, 28, '#eef0ea', 2.3, '#7d7a58'],
  [125, 38, '#fbf2e2', 2.5, '#77804f'],
  [150, 46, '#fff4e2', 2.4, '#627845'],
  [196, 52, '#fff0d6', 2.4, '#5f6b3f'],
  [228, 44, '#fde3b8', 2.45, '#67733f'],
  [258, 30, '#f7c784', 2.7, '#7c7a45'],
  [288, 22, '#efc189', 2.3, '#857552'],
  [318, 15, '#d9d6cf', 1.9, '#7c7562'],
  [366, 13, '#f1ede4', 2.5, '#7f7c66'],
]

// haze: 0 clear air, 1 thick fog. Sun and sky light are multipliers on the season's values.
const SKY: Record<string, { top: string; hor: string; sun: number; hemi: number; haze: number; cloud: number }> = {
  clear: { top: '#a7c4d8', hor: '#e9eee6', sun: 1, hemi: 1, haze: 0.05, cloud: 0 },
  cloud: { top: '#b1c2cc', hor: '#e1e5df', sun: 0.72, hemi: 1.08, haze: 0.1, cloud: 0.75 },
  overcast: { top: '#98a2a5', hor: '#bec2bd', sun: 0.26, hemi: 1.3, haze: 0.22, cloud: 0 },
  rain: { top: '#879194', hor: '#a9afab', sun: 0.16, hemi: 1.15, haze: 0.38, cloud: 0 },
  storm: { top: '#677073', hor: '#8b9290', sun: 0.1, hemi: 0.95, haze: 0.5, cloud: 0 },
  fog: { top: '#c3c7c2', hor: '#d9dbd5', sun: 0.22, hemi: 1.3, haze: 0.62, cloud: 0 },
  snow: { top: '#b4bcc1', hor: '#dde1e1', sun: 0.25, hemi: 1.3, haze: 0.45, cloud: 0 },
}

const tmp = new Color()

export function envTarget(snap: Snapshot, out: Env): Env {
  const w = snap.weather
  const d = snap.day
  let k = 0
  while (k < SEASON.length - 2 && SEASON[k + 1][0] <= d) k++
  const a = SEASON[k], b = SEASON[k + 1]
  const t = Math.max(0, Math.min(1, (d - a[0]) / (b[0] - a[0])))
  const sky = SKY[w.sky] ?? SKY.clear
  out.sunElev = ((a[1] + (b[1] - a[1]) * t) * Math.PI) / 180
  out.sunAz = 3.0
  out.sun.set(a[2]).lerp(tmp.set(b[2]), t)
  out.sunI = (a[3] + (b[3] - a[3]) * t) * sky.sun
  out.grass.set(a[4]).lerp(tmp.set(b[4]), t)
  out.hemiI = 0.95 * sky.hemi * (snap.mode === 'cellar' ? 1.25 : 1)
  out.skyTop.set(sky.top)
  out.skyHorizon.set(sky.hor)
  // September and October warm the horizon; November greys it.
  const goldLight = bump(d, 240, 268, 300)
  if (w.sky === 'clear' || w.sky === 'cloud') out.skyHorizon.lerp(tmp.set('#f1d9b0'), 0.45 * goldLight)
  if (snap.mode === 'cellar') out.skyTop.lerp(tmp.set('#9fb0bd'), 0.3)
  out.hemiSky.copy(out.skyTop).lerp(out.skyHorizon, 0.4)
  out.hemiGround.set('#4a3f33')
  out.fog = sky.haze
  out.cloud = sky.cloud
  out.rain = w.sky === 'rain' || w.sky === 'storm' ? Math.max(0.3, Math.min(1, w.prcp / 14)) : 0
  out.snowfall = w.sky === 'snow' ? 1 : 0
  out.wind = Math.max(0.08, Math.min(1.4, w.wind / 8)) * (w.sky === 'storm' ? 1.4 : 1)
  out.windDir = w.wdir < 0 ? 0.6 : ((w.wdir + 180) * Math.PI) / 180
  const growing = d > 130 && d < 290 && w.tmin > 2
  out.mist = w.sky === 'fog' ? 1 : growing && w.wetH >= 10 ? Math.min(0.8, (w.wetH - 9) / 9) : 0
  // In the season each terrace frosts as its own fields did last night; otherwise the picture of the time of year.
  const rime = w.tmin < 0 && w.snwd < 20 ? Math.min(1, 0.35 + -w.tmin / 4) : 0
  out.rime0 = snap.rime ? snap.rime[0] : rime
  out.rime1 = snap.rime ? snap.rime[1] : rime
  out.rime2 = snap.rime ? snap.rime[2] : rime
  // A frosty morning's light is cold, so the rime reads white rather than straw under the autumn sun.
  const frosty = Math.max(out.rime0, out.rime1, out.rime2)
  if (frosty > 0) {
    out.sun.lerp(tmp.set('#eef2f6'), 0.7 * frosty)
    out.skyHorizon.lerp(tmp.set('#e4ebf0'), 0.5 * frosty)
  }
  out.snow = Math.min(1, w.snwd / 200)
  if (snap.mode === 'plan') out.snow = 0.24
  if (snap.mode === 'ledger') out.snow = 0.22
  out.wet = w.sky === 'rain' || w.sky === 'storm' ? 1 : w.sky === 'fog' ? 0.6 : snap.mode === 'plan' || snap.mode === 'ledger' ? 0.8 : 0.15
  out.birch = d > 138 && d < 292 ? Math.min(1, (d - 138) / 12, (292 - d) / 10) : 0
  out.gold = Math.max(0, Math.min(1, (d - 250) / 25))
  out.oats = snap.mode === 'season' || snap.mode === 'title' ? Math.max(0.08, Math.min(1, (d - 128) / 60)) : snap.mode === 'plan' ? 0.05 : 0.15
  out.oatsRipe = Math.max(0, Math.min(1, (d - 205) / 30))
  out.ice = snap.mode === 'cellar' && snap.month >= 1 && snap.month <= 4 ? 1 : 0
  out.smoke = snap.mode === 'cellar' || snap.mode === 'plan' || snap.mode === 'ledger' || w.tmax < 6 ? 1 : 0
  if (snap.mode === 'over') {
    out.sun.set('#ece6da')
    out.sunI = 1.9
    out.grass.set('#8a875c')
  }
  return out
}

function bump(x: number, a: number, peak: number, b: number): number {
  if (x <= a || x >= b) return 0
  return x < peak ? (x - a) / (peak - a) : (b - x) / (b - peak)
}

const NUM_KEYS = ['sunElev', 'sunAz', 'sunI', 'hemiI', 'fog', 'rain', 'snowfall', 'wind', 'mist', 'rime0', 'rime1', 'rime2', 'snow', 'wet', 'birch', 'gold', 'oats', 'oatsRipe', 'ice', 'smoke', 'cloud'] as const
const COLOR_KEYS = ['sun', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'grass'] as const

// Ease `cur` toward `target`; k is the share of the gap closed this frame.
export function easeEnv(cur: Env, target: Env, k: number): void {
  for (const key of NUM_KEYS) cur[key] += (target[key] - cur[key]) * k
  let dw = target.windDir - cur.windDir
  while (dw > Math.PI) dw -= Math.PI * 2
  while (dw < -Math.PI) dw += Math.PI * 2
  cur.windDir += dw * k
  for (const key of COLOR_KEYS) cur[key].lerp(target[key], k)
}

export function copyEnv(cur: Env, target: Env): void {
  easeEnv(cur, target, 1)
}
