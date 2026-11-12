// What the ambience should be doing, from where the player is, the time of year and the day's weather. Pure, so
// it can be checked offline.
import { clamp01 } from './synth.ts'

export type Sky = 'clear' | 'cloud' | 'overcast' | 'rain' | 'storm' | 'fog' | 'snow'
export type Place = 'title' | 'plan' | 'season' | 'cellar' | 'yearEnd'

export interface WeatherNow { wind: number; prcp: number; sky: Sky; tmean: number }

export interface SceneInput {
  place: Place
  month: number             // 0 = January
  dom?: number              // day of the month; the middle when not given
  weather: WeatherNow | null
}

export interface Scene {
  wind: number      // 0..1
  cold: number      // 0..1, the thin whistle of a cold wind
  rain: number      // 0..1
  heavy: number     // 0..1, how much of the rain is a downpour
  birds: number     // how freely the birds sing: 5 is a fair June morning, 0 is none
  crickets: number  // 0..1
  chirps: number    // cricket chirps per second, the average over the crickets in earshot
  pulse: number     // seconds from one pulse of a chirp to the next
  month: number
  leaf: number      // 0..1, how much leaf is on the hardwoods for the wind to move
  dry: number       // 0..1, how much of it is dry and loose: the rattle and skitter of October
  brook: number     // 0..1, how full the brook runs
  peepers: number   // 0..1, the frogs along it in spring
  peeps: number     // peeps a second from each frog
  bees: number      // 0..1, bumblebees working the blossom
  geese: number     // 0..1, how often a skein goes over
  crows: number     // 0..1
  frost: number     // 0..1, trees cracking in deep cold
}

export const QUIET: Scene = {
  wind: 0.2, cold: 0, rain: 0, heavy: 0, birds: 0, crickets: 0, chirps: 0, pulse: 0.05, month: 5,
  leaf: 0, dry: 0, brook: 0, peepers: 0, peeps: 1, bees: 0, geese: 0, crows: 0, frost: 0,
}

// How freely the birds sing on a fair day. Song from April to July; from September to March only the chickadees'
// call from the wood's edge, now and then.
const BIRDS_BY_MONTH: Record<number, number> = { 3: 0.8, 4: 4, 5: 5, 6: 3, 8: 0.5, 9: 0.6, 10: 0.5 }
const CELLAR_WIND = [0.27, 0.3, 0.27, 0.22, 0.2, 0, 0, 0, 0, 0, 0.2, 0.24]
// The brook: in flood with the snowmelt, low in August, up a little with the fall rains.
const BROOK_BY_MONTH = [0, 0, 0.3, 1, 0.75, 0.45, 0.25, 0.15, 0.2, 0.3, 0.3, 0]

// 0 before a, rising to 1 at b, 1 until c, falling to 0 at d. All in months and fractions of one (4.5 is mid-May).
function span(when: number, a: number, b: number, c: number, d: number): number {
  if (when <= a || when >= d) return 0
  if (when < b) return (when - a) / (b - a)
  if (when > c) return (d - when) / (d - c)
  return 1
}

// What the time of year alone decides, whatever the weather.
function calendar(when: number): Pick<Scene, 'leaf' | 'dry' | 'brook'> {
  const m = Math.floor(when) % 12
  const next = (m + 1) % 12
  const x = when - Math.floor(when)
  return {
    leaf: span(when, 4.3, 5.2, 8.6, 9.8),
    dry: span(when, 8.5, 9.2, 10.2, 11),
    brook: BROOK_BY_MONTH[m] + (BROOK_BY_MONTH[next] - BROOK_BY_MONTH[m]) * x,
  }
}

export function sceneFor(input: SceneInput): Scene {
  const m = input.month
  const when = m + ((input.dom ?? 15) - 1) / 30.5
  const cal = calendar(when)
  switch (input.place) {
    case 'title': return { ...QUIET, wind: 0.18, birds: 3, month: 5, leaf: 1, brook: 0.45 }
    case 'plan': return { ...QUIET, wind: 0.22, birds: 0.8, month: 3, brook: 0.9, peepers: 0.5, peeps: 1.2 }
    case 'yearEnd': return { ...QUIET, wind: 0.2, birds: 1, month: 4, brook: 0.7, leaf: 0.2 }
    case 'cellar': {
      const winter = m >= 10 || m <= 2
      const deep = m === 11 || m <= 1
      return {
        ...QUIET, ...cal, month: m,
        wind: CELLAR_WIND[m] || 0.18,
        cold: winter ? 0.7 : m === 3 ? 0.3 : 0,
        birds: m === 4 ? 1.5 : 0.5,
        crows: winter ? 0.35 : 0,
        frost: deep ? 1 : winter ? 0.4 : 0,
      }
    }
    case 'season': break
  }
  const w = input.weather
  if (!w) return { ...QUIET, ...cal, wind: 0.3, birds: BIRDS_BY_MONTH[m] ?? 0, month: m }

  const wet = w.sky === 'rain' || w.sky === 'storm'
  let wind = clamp01((w.wind - 1) / 6.5)
  if (w.sky === 'storm') wind = Math.min(1, wind + 0.25)
  if (w.sky === 'fog') wind *= 0.5

  let rain = 0, heavy = 0
  if (wet) {
    rain = 0.3 + 0.7 * clamp01((w.prcp - 1.5) / 18)
    heavy = clamp01((w.prcp - 8) / 20)
    if (w.sky === 'storm') { rain = Math.max(rain, 0.9); heavy = 1 }
  } else if (w.prcp >= 0.3 && w.sky !== 'snow') {
    rain = 0.12
  }

  let cold = m === 9 ? 0.25 : m >= 10 ? 0.5 : 0
  if (w.sky === 'snow') cold = Math.max(cold, 0.6)
  if (w.tmean < 2) cold = Math.max(cold, 0.4)

  const fair = (w.sky === 'clear' || w.sky === 'cloud') && w.prcp < 1 && w.wind < 8
  const birds = fair ? (BIRDS_BY_MONTH[m] ?? 0) * (w.sky === 'cloud' ? 0.6 : 1) : 0

  // Fall field crickets, adult from late July until the frosts, quiet below about 12 C. Their chirps come about
  // twice a second at 25 C and their pulses 46 ms apart at 24 C; both slow in the cold, the chirps faster than
  // the pulses (docs/quality/sound.md has the sources).
  let crickets = 0, chirps = 0, pulse = QUIET.pulse
  const grown = span(when, 6.55, 6.95, 8.6, 9.3)
  if (grown > 0 && !wet && w.tmean > 11.5) {
    crickets = clamp01((w.tmean - 11) / 6) * (m === 8 ? 0.75 : 1) * grown
    chirps = (1.9 * (Math.min(30, w.tmean) - 6)) / 19
    pulse = (0.046 * 30.4) / (Math.min(30, w.tmean) + 6)
  }

  // Spring peepers call from the thaw into June, hardest in mild wet weather and least under a bright sky.
  const mild = clamp01((w.tmean - 4) / 6)
  const peepers = w.sky === 'storm' ? 0 : span(when, 3.55, 3.9, 5.15, 5.9) * mild * (w.sky === 'clear' ? 0.45 : w.sky === 'cloud' ? 0.7 : 1)
  const peeps = 0.76 + 0.054 * Math.max(0, Math.min(22, w.tmean))

  // Bumblebees work the potato blossom on fair warm days from late June into August.
  const bees = fair && w.tmean > 14 ? span(when, 5.8, 6.3, 7.6, 8.3) : 0

  // Geese go over from mid September until the ground freezes; crows work the dug fields. Neither in a storm.
  const flying = w.sky !== 'storm' && w.sky !== 'fog' && w.wind < 10
  const geese = flying ? span(when, 8.35, 8.9, 10, 10.6) : 0
  const crows = flying && !wet ? span(when, 8, 8.6, 10.6, 11.2) : 0

  return {
    wind, cold, rain, heavy, birds, crickets, chirps, pulse, month: m,
    leaf: cal.leaf,
    dry: cal.dry * (wet ? 0.25 : rain > 0 ? 0.6 : 1),
    brook: Math.min(1, cal.brook + (w.prcp > 6 ? 0.2 : 0)),
    peepers, peeps, bees, geese, crows,
    frost: w.tmean < -3 ? 0.6 : 0,
  }
}
