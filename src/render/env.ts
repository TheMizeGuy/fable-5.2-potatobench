// Light, air and weather as numbers that ease from one day to the next, and the light worked out from them.
import { Color, Vector3 } from 'three'
import { clamp, smooth } from './noise.ts'
import { clearSky, sunLight, type Air } from './sky.ts'
import type { Snapshot } from './state.ts'

export interface Env {
  sunEl: number            // radians above the horizon
  sunAz: number            // radians from due west (up the slope), positive toward the south (the farmstead side)
  sunScale: number         // share of the direct sun that gets through the weather
  turbidity: number
  mie: number
  cloud: number            // share of the sky under cloud
  cloudShadow: number      // how dark the shadows of clouds lie on the land
  deck: number             // brightness of an overcast sky
  key: number              // how bright the picture is held: overcast is flat, not dark
  haze: number             // density of the air at the brook, per unit of distance
  mist: number             // ground mist in the low fields, 0..1
  mistDeep: number         // 0: a thin sheet on the brook; 1: fog filling the bottom land and thinning up the slope
  rain: number
  snowfall: number
  wind: number
  windDir: number          // radians, the direction the wind blows toward, in the xz plane
  rime0: number            // rime on the ridge, mid-slope and bottom land
  rime1: number
  rime2: number
  snow: number             // snow lying on the ground
  wet: number
  dry: number              // how dusty the ground is
  grass: Color
  leaf: number             // leaves on the hardwoods, 0..1
  gold: number             // autumn colour, 0..1
  oats: number             // growth of the rest-year cover
  oatsRipe: number
  ice: number
  smoke: number
  lens: number             // how shallow the focus is, 0..1
}

export function makeEnv(): Env {
  return {
    sunEl: 0.7, sunAz: -0.66, sunScale: 1, turbidity: 2.2, mie: 0.004, cloud: 0.2, cloudShadow: 0.5, deck: 1, key: 1, haze: 0.0006,
    mist: 0, mistDeep: 0, rain: 0, snowfall: 0, wind: 0.3, windDir: 0.4, rime0: 0, rime1: 0, rime2: 0, snow: 0, wet: 0, dry: 0,
    grass: new Color('#6f8a45'), leaf: 1, gold: 0, oats: 1, oatsRipe: 0, ice: 0, smoke: 0, lens: 0.2,
  }
}

// By day of the year: how high the late-afternoon sun stands (degrees), and the colour of the grass.
const SEASON: [number, number, string][] = [
  [0, 11, '#8f8768'], [60, 14, '#91876a'], [95, 19, '#93865c'], [125, 23, '#7f8a52'], [150, 26, '#6b8a42'], [196, 27, '#68833f'],
  [228, 25, '#72853f'], [258, 21, '#868541'], [288, 16, '#8e7d4c'], [318, 12, '#877c5e'], [366, 11, '#8f8768'],
]

interface Sky { sun: number; cover: number; shadow: number; deck: number; haze: number; key: number; turbidity: number; mie: number }
const SKY: Record<string, Sky> = {
  clear: { sun: 1, cover: 0.22, shadow: 0.22, deck: 1, haze: 0.00055, key: 1, turbidity: 2.2, mie: 0.004 },
  cloud: { sun: 0.95, cover: 0.5, shadow: 0.34, deck: 1, haze: 0.0007, key: 0.98, turbidity: 2.8, mie: 0.005 },
  overcast: { sun: 0.06, cover: 1, shadow: 0, deck: 1.05, haze: 0.0012, key: 0.86, turbidity: 4, mie: 0.006 },
  rain: { sun: 0.025, cover: 1, shadow: 0, deck: 0.66, haze: 0.0017, key: 0.76, turbidity: 6, mie: 0.006 },
  storm: { sun: 0.015, cover: 1, shadow: 0, deck: 0.42, haze: 0.0024, key: 0.64, turbidity: 8, mie: 0.006 },
  fog: { sun: 0.1, cover: 0.92, shadow: 0, deck: 1.35, haze: 0.0034, key: 0.92, turbidity: 6, mie: 0.006 },
  snow: { sun: 0.05, cover: 1, shadow: 0, deck: 1.05, haze: 0.0026, key: 0.92, turbidity: 4, mie: 0.006 },
}

const tmp = new Color()

export function envTarget(snap: Snapshot, out: Env): Env {
  const w = snap.weather
  const d = snap.day
  let k = 0
  while (k < SEASON.length - 2 && SEASON[k + 1][0] <= d) k++
  const a = SEASON[k], b = SEASON[k + 1]
  const t = clamp((d - a[0]) / (b[0] - a[0]), 0, 1)
  const sky = SKY[w.sky] ?? SKY.clear
  out.sunEl = ((a[1] + (b[1] - a[1]) * t) * Math.PI) / 180
  out.sunAz = -1.25
  out.grass.set(a[2]).lerp(tmp.set(b[2]), t)
  out.sunScale = sky.sun
  out.cloud = sky.cover
  out.cloudShadow = sky.shadow
  out.deck = sky.deck
  out.key = sky.key
  out.haze = sky.haze
  out.turbidity = sky.turbidity
  out.mie = sky.mie
  // September's air is dusty and gold; the light goes amber as the sun drops through it.
  const harvest = smooth(235, 262, d) * (1 - smooth(292, 312, d))
  if (w.sky === 'clear' || w.sky === 'cloud') {
    out.turbidity += 2.6 * harvest
    out.mie += 0.004 * harvest
    out.haze += 0.0003 * harvest
  }
  out.rain = w.sky === 'rain' || w.sky === 'storm' ? clamp(w.prcp / 14, 0.3, 1) : 0
  out.snowfall = w.sky === 'snow' ? 1 : 0
  out.wind = clamp(w.wind / 8, 0.08, 1.4) * (w.sky === 'storm' ? 1.4 : 1)
  out.windDir = w.wdir < 0 ? 0.6 : ((w.wdir + 180) * Math.PI) / 180
  const growing = d > 130 && d < 290 && w.tmin > 2
  out.mist = w.sky === 'fog' ? 1 : growing && w.wetH >= 10 ? Math.min(0.8, (w.wetH - 9) / 9) : 0
  out.mistDeep = w.sky === 'fog' ? 1 : 0.35
  // In the season each part of the slope frosts as its own fields did last night; otherwise the picture of the time of year.
  const rime = w.tmin < 0 && w.snwd < 20 ? Math.min(1, 0.35 + -w.tmin / 4) : 0
  out.rime0 = snap.rime ? snap.rime[0] : rime
  out.rime1 = snap.rime ? snap.rime[1] : rime
  out.rime2 = snap.rime ? snap.rime[2] : rime
  // A frost shows in the first low light of a clear morning: long shadows off the spruce, rime white in them.
  const frosty = Math.max(out.rime0, out.rime1, out.rime2)
  if (frosty > 0 && (w.sky === 'clear' || w.sky === 'cloud')) {
    out.sunEl += (0.2 - out.sunEl) * Math.min(1, frosty * 1.3)
    out.cloud *= 1 - 0.6 * frosty
    out.mist = Math.max(out.mist, 0.2 * frosty)
  }
  out.snow = Math.min(1, w.snwd / 200)
  if (snap.mode === 'plan') out.snow = 0.3
  if (snap.mode === 'ledger') out.snow = 0.36
  out.wet = w.sky === 'rain' || w.sky === 'storm' ? 1 : w.sky === 'fog' ? 0.6 : snap.mode === 'plan' || snap.mode === 'ledger' ? 0.8 : snap.wetGround
  out.dry = w.sky === 'clear' || w.sky === 'cloud' ? clamp(1 - snap.wetGround * 2.2, 0, 1) * (out.snow > 0.05 ? 0 : 1) : 0
  out.leaf = d > 132 && d < 296 ? Math.min(1, (d - 132) / 14, (296 - d) / 12) : 0
  out.gold = clamp((d - 250) / 24, 0, 1)
  out.oats = snap.mode === 'season' || snap.mode === 'title' ? clamp((d - 128) / 58, 0.06, 1) : snap.mode === 'plan' ? 0.04 : 0.12
  out.oatsRipe = clamp((d - 205) / 30, 0, 1)
  out.ice = snap.mode === 'cellar' && snap.month >= 1 && snap.month <= 4 ? 1 : 0
  out.smoke = snap.mode === 'cellar' || snap.mode === 'plan' || snap.mode === 'ledger' || w.tmax < 8 ? 1 : 0
  out.lens = 0.22
  if (snap.mode === 'title') {
    // The key frame: about seven on a July evening.
    out.sunEl = 0.21
    out.sunAz = -0.35
    out.cloud = 0.34
    out.cloudShadow = 0.6
    out.turbidity = 3.4
    out.mie = 0.007
    out.haze = 0.0011
    out.mist = 0.62
    out.mistDeep = 0
    out.key = 0.94
    out.dry = 1
    out.lens = 1
  } else if (snap.mode === 'cellar') {
    out.sunEl = Math.max(out.sunEl, 0.24)
    out.key *= 1.04
  } else if (snap.mode === 'over') {
    out.wind = 0.1
    out.cloud = Math.max(out.cloud, 0.6)
  }
  return out
}

const NUM_KEYS = [
  'sunEl', 'sunAz', 'sunScale', 'turbidity', 'mie', 'cloud', 'cloudShadow', 'deck', 'key', 'haze', 'mist', 'mistDeep', 'rain', 'snowfall', 'wind',
  'rime0', 'rime1', 'rime2', 'snow', 'wet', 'dry', 'leaf', 'gold', 'oats', 'oatsRipe', 'ice', 'smoke', 'lens',
] as const

// Ease `cur` toward `target`; k is the share of the gap closed this frame.
export function easeEnv(cur: Env, target: Env, k: number): void {
  for (const key of NUM_KEYS) cur[key] += (target[key] - cur[key]) * k
  let dw = target.windDir - cur.windDir
  while (dw > Math.PI) dw -= Math.PI * 2
  while (dw < -Math.PI) dw += Math.PI * 2
  cur.windDir += dw * k
  cur.grass.lerp(target.grass, k)
}

export function copyEnv(cur: Env, target: Env): void {
  easeEnv(cur, target, 1)
}

export interface Light {
  air: Air
  sunDir: Vector3
  sun: Color               // the sun on a surface square to it, as the weather lets it through
  deck: Color              // the lit and the shaded sides of the cloud
  deckDark: Color
  hazeSun: Color
  hazeAway: Color
  mist: Color
  ground: Color            // what the land sends back up, for the undersides of things
  skyGain: number
  skySat: number
  skyCap: number           // the brightest any part of the sky may be when it lights the scene
  skyShow: number          // how bright the sky is drawn
  exposure: number
}

export function makeLight(): Light {
  return {
    air: { turbidity: 2.2, rayleigh: 1.3, mie: 0.004, g: 0.8 }, sunDir: new Vector3(0, 1, 0), sun: new Color(), deck: new Color(),
    deckDark: new Color(), hazeSun: new Color(), hazeAway: new Color(), mist: new Color(), ground: new Color(), skyGain: 1, skySat: 0.8, skyCap: 4, skyShow: 1, exposure: 1,
  }
}

const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
const c1 = new Color(), c2 = new Color(), c3 = new Color(), grey = new Color()

// The light that follows from the air: the sun's colour through it, what the sky gives, the colour of distance, and
// the exposure that holds the land at the same brightness whatever the weather.
// `drift` moves the sun a little through the day (-1 morning side, 1 evening side).
export function light(env: Env, drift: number, out: Light): Light {
  const el = clamp(env.sunEl - 0.03 * Math.abs(drift), 0.05, 1.4), az = env.sunAz - 0.12 * drift
  out.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
  const air = out.air
  air.turbidity = env.turbidity
  air.mie = env.mie
  const overcast = smooth(0.62, 0.97, env.cloud)
  const full = sunLight(out.sunDir, air, c1)
  out.sun.copy(full).multiplyScalar(env.sunScale)
  // The clear sky toward and away from the sun, low down, and overhead.
  const sx = out.sunDir.x, sz = out.sunDir.z, sl = Math.hypot(sx, sz) || 1
  const toward = clearSky(sx / sl, 0.09, sz / sl, out.sunDir, air, c2).clone()
  const away = clearSky(-sx / sl, 0.1, -sz / sl, out.sunDir, air, c2).clone()
  const side = clearSky(-sz / sl, 0.5, sx / sl, out.sunDir, air, c2).clone()
  const zenith = clearSky(0, 1, 0, out.sunDir, air, c2).clone()
  out.skySat = 0.8
  // The sky model is too bright beside its own sun, most of all toward evening, and would fill every shadow.
  // Hold a clear sky to about a third of what the sun puts on level ground.
  const rawE = (lum(zenith) * 0.38 + lum(side) * 0.42 + lum(away) * 0.2) * Math.PI
  out.skyGain = clamp((0.4 * lum(full) * Math.max(out.sunDir.y, 0.16)) / Math.max(rawE, 1e-3), 0.08, 1.2)
  // The sky that is seen keeps more of its brightness than the sky that lights.
  out.skyShow = Math.sqrt(out.skyGain)
  out.skyCap = 3.4 * out.skyGain * Math.max(lum(zenith), lum(side), lum(away)) * (1 - overcast) + 8 * overcast
  // Cloud: lit by the sun on top and by the sky beneath when broken, an even grey deck when the sky is closed.
  grey.setRGB(0.93, 0.96, 1).multiplyScalar(env.deck * 1.0)
  out.deck.copy(full).multiplyScalar(0.25).add(c3.copy(zenith).multiplyScalar(0.6)).lerp(grey, overcast)
  out.deckDark.copy(full).multiplyScalar(0.07).add(c3.copy(side).multiplyScalar(0.75)).lerp(c3.copy(grey).multiplyScalar(0.6), overcast)
  // The light of the whole sky on level ground.
  const clearE = out.skyGain * (lum(zenith) * 0.38 + lum(side) * 0.42 + lum(away) * 0.2) * Math.PI * (1 - 0.35 * env.cloud) + lum(out.deck) * env.cloud * 0.9
  const skyE = clearE * (1 - overcast) + lum(grey) * 0.82 * Math.PI * overcast
  const flat = lum(out.sun) * out.sunDir.y * (1 - 0.3 * env.cloud * (1 - overcast)) + skyE
  // Low sun: meter partly on what faces it, or the evening would be held as bright as noon.
  const facing = lum(out.sun) * 0.45 + skyE
  const metered = flat * 0.62 + facing * 0.38
  // Snow in the sun is the brightest thing there is: hold it below white.
  out.exposure = (env.key * 2.9) / Math.max(metered, 0.02) * (1 - 0.3 * Math.min(1, env.snow * 1.5) * (1 - overcast))
  // Distance takes the colour of the low sky; fog and rain take the colour of the cloud.
  const thick = smooth(0.0012, 0.004, env.haze)
  const veil = Math.max(overcast, thick)
  out.hazeAway.copy(away).lerp(side, 0.35).multiplyScalar(0.9 * out.skyGain).lerp(c3.copy(grey).multiplyScalar(0.86), veil)
  const cap = lum(out.hazeAway) * 3.2
  out.hazeSun.copy(toward).multiplyScalar(Math.min(1, cap / Math.max(lum(toward), 1e-4))).lerp(c3.copy(grey).multiplyScalar(0.9), veil)
  // Mist is lit: it takes the low sun's colour where the sun reaches it.
  out.mist.copy(out.hazeAway).lerp(out.hazeSun, 0.35).multiplyScalar(0.9).add(c3.copy(out.sun).multiplyScalar(0.012))
  out.ground.copy(env.grass).multiplyScalar(flat / Math.PI * 0.55)
  if (env.snow > 0.02) out.ground.lerp(c3.setRGB(0.8, 0.85, 0.92).multiplyScalar(flat / Math.PI * 0.8), Math.min(1, env.snow * 1.4))
  return out
}
