// Light, air and weather as numbers that ease from one day to the next, and the light worked out from them.
import { Color, Vector3 } from 'three'
import { clamp, smooth } from './noise.ts'
import { NIGHT_HORIZON, NIGHT_ZENITH, clearSky, sunLight, type Air } from './sky.ts'
import type { Snapshot } from './state.ts'

export interface Env {
  // The scene's own clock, which is not the game's (a game day lasts under two seconds): -1 is the low sun of early
  // morning, 0 noon, 1 the low sun of evening; past 1 the sun sets, and from 1.3 round to -1.3 it is night.
  hour: number
  elLow: number            // how high the low sun of morning and evening stands, radians
  elNoon: number
  azShift: number          // the sun's path turned about the farm, radians
  sunScale: number         // share of the direct sun that gets through the weather
  turbidity: number
  mie: number
  cloud: number            // share of the sky under cloud
  cloudShadow: number      // how dark the shadows of clouds lie on the land
  high: number             // high thin cloud, 0..1
  storm: number            // how dark and torn the cloud's underside is
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
  fall: number             // leaves coming down, 0..1
  oats: number             // growth of the rest-year cover
  oatsRipe: number
  ice: number
  smoke: number
  lens: number             // how shallow the focus is, 0..1
}

export const EVENING = 1, MORNING = -1, NIGHT = 1.36
const CYCLE = 3.2

export function makeEnv(): Env {
  return {
    hour: EVENING, elLow: 0.24, elNoon: 1, azShift: 0, sunScale: 1, turbidity: 2.2, mie: 0.004, cloud: 0.2, cloudShadow: 0.5, high: 0.3, storm: 0,
    deck: 1, key: 1, haze: 0.0006, mist: 0, mistDeep: 0, rain: 0, snowfall: 0, wind: 0.3, windDir: 0.4, rime0: 0, rime1: 0, rime2: 0, snow: 0,
    wet: 0, dry: 0, grass: new Color('#6f8a45'), leaf: 1, gold: 0, fall: 0, oats: 1, oatsRipe: 0, ice: 0, smoke: 0, lens: 0.2,
  }
}

// By day of the year: how high the low sun of the playing light stands (degrees), and the colour of the grass. The game
// is played in the long light at the end of the day, when every plant, wall and tree throws a shadow.
const SEASON: [number, number, string][] = [
  [0, 9.5, '#8f8768'], [60, 10, '#91876a'], [95, 10.5, '#93865c'], [125, 11.5, '#7f8a52'], [150, 12, '#6b8a42'], [196, 12, '#68833f'],
  [228, 12, '#72853f'], [258, 11.5, '#868541'], [288, 10.5, '#8e7d4c'], [318, 10, '#877c5e'], [366, 9.5, '#8f8768'],
]

interface Sky { sun: number; cover: number; shadow: number; high: number; deck: number; haze: number; key: number; turbidity: number; mie: number; storm: number }
const SKY: Record<string, Sky> = {
  clear: { sun: 1, cover: 0.31, shadow: 0.8, high: 0.42, deck: 1, haze: 0.0008, key: 1, turbidity: 2.8, mie: 0.0045, storm: 0 },
  cloud: { sun: 0.97, cover: 0.52, shadow: 0.84, high: 0.3, deck: 1, haze: 0.0009, key: 0.98, turbidity: 3.1, mie: 0.005, storm: 0.12 },
  overcast: { sun: 0.06, cover: 1, shadow: 0, high: 0, deck: 0.96, haze: 0.001, key: 0.8, turbidity: 4, mie: 0.006, storm: 0.4 },
  rain: { sun: 0.025, cover: 1, shadow: 0, high: 0, deck: 0.6, haze: 0.0015, key: 0.66, turbidity: 6, mie: 0.006, storm: 0.8 },
  storm: { sun: 0.015, cover: 1, shadow: 0, high: 0, deck: 0.4, haze: 0.002, key: 0.56, turbidity: 8, mie: 0.006, storm: 1 },
  fog: { sun: 0.6, cover: 0.48, shadow: 0, high: 0.3, deck: 1.3, haze: 0.0016, key: 0.98, turbidity: 6, mie: 0.007, storm: 0 },
  snow: { sun: 0.05, cover: 1, shadow: 0, high: 0, deck: 1.05, haze: 0.0026, key: 0.92, turbidity: 4, mie: 0.006, storm: 0.15 },
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
  const fair = w.sky === 'clear' || w.sky === 'cloud'
  out.hour = EVENING
  out.elLow = ((a[1] + (b[1] - a[1]) * t) * Math.PI) / 180
  out.elNoon = 0.72 + 0.34 * Math.cos(((d - 172) / 365) * Math.PI * 2)
  out.azShift = 0
  out.grass.set(a[2]).lerp(tmp.set(b[2]), t)
  out.sunScale = sky.sun
  out.cloud = sky.cover
  out.cloudShadow = sky.shadow
  out.high = sky.high
  out.storm = sky.storm
  out.deck = sky.deck
  out.key = sky.key
  out.haze = sky.haze
  out.turbidity = sky.turbidity
  out.mie = sky.mie
  // Evening air holds a little dust; September's more, and the light goes amber as the sun drops through it.
  const harvest = smooth(235, 262, d) * (1 - smooth(292, 312, d))
  if (fair) {
    out.turbidity += 0.7 + 2.6 * harvest
    out.mie += 0.0015 + 0.004 * harvest
    out.haze += 0.0003 * harvest
  }
  out.rain = w.sky === 'rain' || w.sky === 'storm' ? clamp(w.prcp / 14, 0.3, 1) : 0
  out.snowfall = w.sky === 'snow' ? 1 : 0
  out.wind = clamp(w.wind / 8, 0.08, 1.4) * (w.sky === 'storm' ? 1.4 : 1)
  out.windDir = w.wdir < 0 ? 0.6 : ((w.wdir + 180) * Math.PI) / 180
  const growing = d > 130 && d < 290 && w.tmin > 2
  out.mist = w.sky === 'fog' ? 0.8 : growing && w.wetH >= 10 ? Math.min(0.8, (w.wetH - 9) / 9) : 0
  out.mistDeep = w.sky === 'fog' ? 0.6 : 0.35
  // In the season each part of the slope frosts as its own fields did last night; otherwise the picture of the time of year.
  const rime = w.tmin < 0 && w.snwd < 20 ? Math.min(1, 0.35 + -w.tmin / 4) : 0
  out.rime0 = snap.rime ? snap.rime[0] : rime
  out.rime1 = snap.rime ? snap.rime[1] : rime
  out.rime2 = snap.rime ? snap.rime[2] : rime
  const frosty = Math.max(out.rime0, out.rime1, out.rime2)
  out.snow = Math.min(1, w.snwd / 200)
  if (snap.mode === 'plan') out.snow = 0.3
  if (snap.mode === 'ledger') out.snow = 0.36
  out.wet = w.sky === 'rain' || w.sky === 'storm' ? 1 : w.sky === 'fog' ? 0.6 : snap.mode === 'plan' || snap.mode === 'ledger' ? 0.8 : snap.wetGround
  out.dry = fair ? clamp(1 - snap.wetGround * 2.2, 0, 1) * (out.snow > 0.05 ? 0 : 1) : 0
  out.leaf = d > 132 && d < 296 ? Math.min(1, (d - 132) / 14, (296 - d) / 12) : 0
  out.gold = clamp((d - 250) / 24, 0, 1)
  out.fall = snap.mode === 'season' || snap.mode === 'over' ? smooth(258, 272, d) * (1 - smooth(292, 300, d)) : 0
  out.oats = snap.mode === 'season' || snap.mode === 'title' ? clamp((d - 128) / 58, 0.06, 1) : snap.mode === 'plan' ? 0.04 : 0.12
  out.oatsRipe = clamp((d - 205) / 30, 0, 1)
  out.ice = snap.mode === 'cellar' && snap.month >= 1 && snap.month <= 4 ? 1 : 0
  // The kitchen fire: all day in the cold, and for supper on any evening.
  out.smoke = snap.mode === 'cellar' || snap.mode === 'plan' || snap.mode === 'ledger' || w.tmax < 8 ? 1 : 0.45
  out.lens = 0.22
  if (snap.mode === 'season') {
    // The morning after rain: the cloud breaking up dark, the air washed, the low sun under it.
    if (fair && snap.wetGround > 0.55) {
      const clearing = smooth(0.55, 0.85, snap.wetGround)
      out.storm = Math.max(out.storm, 0.7 * clearing)
      out.cloud = Math.min(0.66, out.cloud + 0.16 * clearing)
      out.mie += 0.002 * clearing
    }
    // A morning is shown as a morning when the day has something a morning shows: fog, a white frost, mist lying deep.
    if (w.sky === 'fog' || (frosty > 0.05 && fair) || out.mist > 0.6) {
      out.hour = MORNING
      if (frosty > 0.05 && fair) {
        out.elLow += (0.19 - out.elLow) * Math.min(1, frosty * 1.3)
        out.cloud *= 1 - 0.6 * frosty
        out.mist = Math.max(out.mist, 0.25 * frosty)
      }
    }
    // Snow lying under an open sky is the brightest day of the year.
    if (out.snow > 0.1 && fair) out.cloud *= 0.7
  } else if (snap.mode === 'title') {
    // The key frame: the last of the light on a July evening, mist starting by the water.
    out.elLow = 0.128
    out.cloud = 0.4
    out.cloudShadow = 0.75
    out.high = 0.7
    out.turbidity = 3
    out.mie = 0.006
    out.haze = 0.00065
    out.mist = 1
    out.mistDeep = 0.12
    out.key = 0.96
    out.dry = 1
    out.smoke = 0.7
    out.lens = 1
  } else if (snap.mode === 'cellar') {
    // The cellar months: the short days are shown at their blue end, lamps lit, the moon up when the sky is open.
    out.hour = snap.month >= 1 && snap.month <= 4 ? NIGHT : EVENING
    out.elLow = Math.max(out.elLow, 0.2)
    out.high = fair ? 0.25 : 0
  } else if (snap.mode === 'plan' || snap.mode === 'ledger') {
    out.hour = 0.9
  } else if (snap.mode === 'over') {
    out.wind = 0.1
    out.cloud = Math.max(out.cloud, 0.6)
  }
  return out
}

const NUM_KEYS = [
  'elLow', 'elNoon', 'azShift', 'sunScale', 'turbidity', 'mie', 'cloud', 'cloudShadow', 'high', 'storm', 'deck', 'key', 'haze', 'mist', 'mistDeep',
  'rain', 'snowfall', 'wind', 'rime0', 'rime1', 'rime2', 'snow', 'wet', 'dry', 'leaf', 'gold', 'fall', 'oats', 'oatsRipe', 'ice', 'smoke', 'lens',
] as const

// Between two hours of daylight the sun goes over the top, whichever way that is: the picture never goes dark between
// one day of the season and the next. Out of the night it goes forward, through the dawn.
export function stepHour(cur: number, target: number, dt: number): number {
  let gap = target - cur
  const daylight = Math.abs(cur) <= 1.05 && Math.abs(target) <= 1.05
  if (!daylight && gap < -0.5) gap += CYCLE
  if (!daylight && gap > CYCLE - 0.5) gap -= CYCLE
  const rate = Math.max(0.3, Math.abs(gap) / 2.4)
  let h = cur + Math.sign(gap) * Math.min(Math.abs(gap), rate * dt)
  if (h > CYCLE / 2) h -= CYCLE
  if (h < -CYCLE / 2) h += CYCLE
  return h
}

// Ease `cur` toward `target`; k is the share of the gap closed this frame, dt the seconds it took.
export function easeEnv(cur: Env, target: Env, k: number, dt: number): void {
  for (const key of NUM_KEYS) cur[key] += (target[key] - cur[key]) * k
  let dw = target.windDir - cur.windDir
  while (dw > Math.PI) dw -= Math.PI * 2
  while (dw < -Math.PI) dw += Math.PI * 2
  cur.windDir += dw * k
  cur.grass.lerp(target.grass, k)
  cur.hour = k >= 1 ? target.hour : stepHour(cur.hour, target.hour, dt)
}

export function copyEnv(cur: Env, target: Env): void {
  easeEnv(cur, target, 1, 0)
}

export interface Light {
  air: Air
  sunDir: Vector3          // where the light on the land comes from: the sun, or the moon once it has set
  skySun: Vector3          // where the sun itself is; it may be below the horizon
  moon: Vector3
  sun: Color               // the light on a surface square to it, as the weather lets it through
  deck: Color              // the lit and the shaded sides of the cloud
  deckDark: Color
  rim: Color               // thin cloud with the sun behind it
  high: Color              // high cloud
  glow: Color              // the sky where the sun went down
  hazeSun: Color
  hazeAway: Color
  mist: Color
  ground: Color            // what the land sends back up, for the undersides of things
  skyGain: number
  skySat: number
  skyCap: number           // the brightest any part of the sky may be when it lights the scene
  skyShow: number          // how bright the sky is drawn
  exposure: number
  night: number            // 0 by day, 1 when the sun is well down
  low: number              // 1 when the sun is near the horizon, 0 when it is high
  day: number              // share of the sun's own light still falling
}

// The moon stands where the evening sun did, over the open ground, so its light lies along the snow.
const MOON = new Vector3(Math.sin(-1.16) * Math.cos(0.24), Math.sin(0.24), -Math.cos(-1.16) * Math.cos(0.24))

export function makeLight(): Light {
  return {
    air: { turbidity: 2.2, rayleigh: 1.3, mie: 0.004, g: 0.8 }, sunDir: new Vector3(0, 1, 0), skySun: new Vector3(0, 1, 0), moon: MOON.clone(),
    sun: new Color(), deck: new Color(), deckDark: new Color(), rim: new Color(), high: new Color(), glow: new Color(),
    hazeSun: new Color(), hazeAway: new Color(), mist: new Color(), ground: new Color(),
    skyGain: 1, skySat: 0.8, skyCap: 4, skyShow: 1, exposure: 1, night: 0, low: 1, day: 1,
  }
}

const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
const c1 = new Color(), c2 = new Color(), c3 = new Color(), grey = new Color(), moonlight = new Color()
const lit = new Vector3()
// The sun passes behind the playing camera at noon and comes low on either hand: in the evening over the neighbours'
// open ground beyond the north wall, a little behind the farm, so crops and trees are lit from behind; in the morning
// along the slope from the south, past the farmstead. From anywhere else the woods on the ridge would keep a low sun
// off the fields.
const AZ_EVENING = 1.2, AZ_MORNING = 1.5

// The light that follows from the hour and the air: where the sun is and its colour through the air, what the sky
// gives, the colour of distance, and the exposure that holds the land at the same brightness whatever the weather.
// `toSun`: how far the camera looks toward the sun, -1..1; looking into it, the lens is stopped down a little.
export function light(env: Env, toSun: number, out: Light): Light {
  const ah = Math.abs(env.hour)
  const azLow = env.hour >= 0 ? AZ_EVENING : AZ_MORNING
  const round = ah <= 1 ? azLow + (Math.PI - azLow) * (1 - Math.pow(ah, 1.3)) : azLow - (ah - 1) * 0.5
  const az = (env.hour >= 0 ? -round : round) + env.azShift
  const elTrue = ah <= 1 ? env.elLow + (env.elNoon - env.elLow) * (1 - Math.pow(ah, 1.7)) : env.elLow - ((ah - 1) / 0.3) * (env.elLow + 0.16)
  const day = smooth(-0.025, 0.06, elTrue)
  const night = smooth(0.01, -0.12, elTrue)
  const el = clamp(elTrue, 0.06, 1.4)
  out.night = night
  out.day = day
  out.low = smooth(0.75, 0.12, Math.sin(el))
  out.skySun.set(Math.sin(az) * Math.cos(elTrue), Math.sin(elTrue), -Math.cos(az) * Math.cos(elTrue))
  lit.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
  out.sunDir.copy(elTrue < -0.025 ? MOON : lit)
  out.moon.copy(MOON)
  const air = out.air
  air.turbidity = env.turbidity
  air.mie = env.mie
  const overcast = smooth(0.62, 0.97, env.cloud)
  const full = sunLight(lit, air, c1).multiplyScalar(day)
  moonlight.setRGB(0.46, 0.6, 0.92).multiplyScalar(0.17 * smooth(-0.03, -0.13, elTrue) * (1 - 0.8 * overcast))
  // A low sun through the model's air comes out nearer orange than a white flower can stand: keep a share of white in it.
  out.sun.copy(full).lerp(c3.setScalar(lum(full)), 0.2).multiplyScalar(env.sunScale).add(moonlight)
  // The clear sky toward and away from the sun, low down, and overhead.
  const sx = lit.x, sz = lit.z, sl = Math.hypot(sx, sz) || 1
  const toward = clearSky(sx / sl, 0.09, sz / sl, out.skySun, air, c2).clone()
  const away = clearSky(-sx / sl, 0.1, -sz / sl, out.skySun, air, c2).clone()
  const side = clearSky(-sz / sl, 0.5, sx / sl, out.skySun, air, c2).clone()
  const zenith = clearSky(0, 1, 0, out.skySun, air, c2).clone()
  out.skySat = 0.8
  // The sky model is too bright beside its own sun, most of all toward evening, and would fill every shadow.
  // Hold a clear sky to a share of what the sun puts on level ground; with the sun gone the sky is all there is.
  const rawE = (lum(zenith) * 0.38 + lum(side) * 0.42 + lum(away) * 0.2) * Math.PI
  const held = clamp((0.28 * lum(full) * Math.max(lit.y, 0.16)) / Math.max(rawE, 1e-3), 0.08, 1.2)
  out.skyGain = held + (1 - held) * (1 - day)
  // The sky that is seen keeps more of its brightness than the sky that lights.
  out.skyShow = Math.sqrt(out.skyGain)
  // Cloud: lit by the sun on top and by the sky beneath when broken, an even grey deck when the sky is closed.
  const nightSky = c3.copy(NIGHT_HORIZON).lerp(NIGHT_ZENITH, 0.55).clone()
  grey.setRGB(0.93, 0.96, 1).multiplyScalar(env.deck * (day + 0.05 * night)).add(c3.copy(nightSky).multiplyScalar(2.2 * night * env.deck))
  out.deck.copy(full).multiplyScalar(0.25).add(c3.copy(zenith).multiplyScalar(0.6)).add(c3.copy(nightSky).multiplyScalar(1.6 * night)).add(c3.copy(moonlight).multiplyScalar(0.16)).lerp(grey, overcast)
  out.deckDark.copy(full).multiplyScalar(0.06).add(c3.copy(side).multiplyScalar(0.7)).add(c3.copy(nightSky).multiplyScalar(0.8 * night)).lerp(c3.copy(grey).multiplyScalar(0.62 - 0.2 * env.storm), overcast)
  out.deckDark.multiplyScalar(1 - 0.35 * env.storm * (1 - overcast))
  // Thin cloud before the sun, and ice cloud far above everything, take the sun's own colour.
  out.rim.copy(full).multiplyScalar(0.5 * (1 - overcast))
  out.high.copy(full).multiplyScalar(0.2).add(c3.copy(zenith).multiplyScalar(0.55)).add(c3.copy(nightSky).multiplyScalar(1.3 * night)).add(c3.copy(moonlight).multiplyScalar(0.07))
  // After sunset the sky above where it went keeps its colour for a while.
  const dusk = smooth(0.08, -0.02, elTrue) * smooth(-0.22, -0.05, elTrue)
  out.glow.setRGB(1, 0.42, 0.16).multiplyScalar(0.07 * dusk * (1 - overcast))
  // The light of the whole sky on level ground.
  const skyNight = lum(nightSky) * Math.PI * night
  const clearE = out.skyGain * (lum(zenith) * 0.38 + lum(side) * 0.42 + lum(away) * 0.2) * Math.PI * (1 - 0.35 * env.cloud) + lum(out.deck) * env.cloud * 0.9 + skyNight
  const skyE = clearE * (1 - overcast) + lum(grey) * 0.82 * Math.PI * overcast
  const flat = lum(out.sun) * out.sunDir.y * (1 - 0.3 * env.cloud * (1 - overcast)) + skyE
  // Low sun: meter partly on what faces it, or the evening would be held as bright as noon.
  const facing = lum(out.sun) * 0.45 + skyE
  const metered = flat * 0.62 + facing * 0.38
  out.skyCap = (3.4 * out.skyGain * Math.max(lum(zenith), lum(side), lum(away)) + 4 * skyNight) * (1 - overcast) + 8 * overcast * Math.max(day, 0.02 + lum(grey))
  // Snow in the sun is the brightest thing there is: hold it below white. Night is held dark, and blue.
  out.exposure = ((env.key * 2.9) / Math.max(metered, 0.004)) * (1 - 0.3 * Math.min(1, env.snow * 1.5) * (1 - overcast) * day) * (1 - 0.74 * night)
  // Into the sun the lens is stopped down a little, so the sky keeps its colour; away from it, opened.
  out.exposure *= 1 - 0.16 * out.low * day * (1 - overcast) * clamp(toSun, -0.5, 1)
  // The sky is far brighter than the land a low sun lights, and a picture exposed for the land would show its cloud as
  // one pale mass. As a graduated filter does, hold the cloud to what the lens can show: tops just under white, bodies
  // in the middle, so a cloud has a lit edge and a base.
  const broken = 1 - overcast
  const top = lum(out.deck) * out.exposure, body = lum(out.deckDark) * out.exposure
  if (top > 0.95) out.deck.multiplyScalar(0.95 / top)
  const want = 0.4 - 0.13 * env.storm
  if (body > want) out.deckDark.multiplyScalar(1 + (want / body - 1) * broken)
  const edge = lum(out.rim) * out.exposure
  if (edge > 1.5) out.rim.multiplyScalar(1.5 / edge)
  const ice = lum(out.high) * out.exposure
  if (ice > 0.9) out.high.multiplyScalar(0.9 / ice)
  // Distance takes the colour of the low sky; fog and rain take the colour of the cloud.
  const thick = smooth(0.0012, 0.004, env.haze)
  const veil = Math.max(overcast, thick)
  const dark = c3.copy(NIGHT_HORIZON).multiplyScalar(night).clone()
  out.hazeAway.copy(away).lerp(side, 0.35).multiplyScalar(0.9 * out.skyGain).add(dark).lerp(c3.copy(grey).multiplyScalar(0.86), veil)
  const cap = lum(out.hazeAway) * 1.9
  out.hazeSun.copy(toward).multiplyScalar(Math.min(1, cap / Math.max(lum(toward), 1e-4))).add(dark).add(c3.copy(out.glow).multiplyScalar(0.5)).lerp(c3.copy(grey).multiplyScalar(0.9), veil)
  // Mist is lit: it takes the low sun's colour where the sun reaches it.
  out.mist.copy(out.hazeAway).lerp(out.hazeSun, 0.35).multiplyScalar(0.9).add(c3.copy(out.sun).multiplyScalar(0.03))
  out.ground.copy(env.grass).multiplyScalar(flat / Math.PI * 0.55)
  if (env.snow > 0.02) out.ground.lerp(c3.setRGB(0.8, 0.85, 0.92).multiplyScalar(flat / Math.PI * 0.8), Math.min(1, env.snow * 1.4))
  return out
}
