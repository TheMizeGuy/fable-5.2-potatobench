// What the ambience should be doing, from where the player is and the day's weather. Pure, so it can be checked offline.
import { clamp01 } from './synth.ts'

export type Sky = 'clear' | 'cloud' | 'overcast' | 'rain' | 'storm' | 'fog' | 'snow'
export type Place = 'title' | 'plan' | 'season' | 'cellar' | 'yearEnd'

export interface WeatherNow { wind: number; prcp: number; sky: Sky; tmean: number }

export interface SceneInput {
  place: Place
  month: number             // 0 = January
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
}

const QUIET: Scene = { wind: 0.2, cold: 0, rain: 0, heavy: 0, birds: 0, crickets: 0, chirps: 0, pulse: 0.05, month: 5 }

// How freely the birds sing on a fair day, April to July.
const BIRDS_BY_MONTH: Record<number, number> = { 3: 0.8, 4: 4, 5: 5, 6: 3 }
const CELLAR_WIND = [0.27, 0.3, 0.27, 0.22, 0.2, 0, 0, 0, 0, 0, 0.2, 0.24]

export function sceneFor(input: SceneInput): Scene {
  const m = input.month
  switch (input.place) {
    case 'title': return { ...QUIET, wind: 0.18, birds: 3, month: 5 }
    case 'plan': return { ...QUIET, wind: 0.22, birds: 0.8, month: 3 }
    case 'yearEnd': return { ...QUIET, wind: 0.2, birds: 1, month: 4 }
    case 'cellar': {
      const winter = m >= 10 || m <= 2
      return {
        ...QUIET, month: m,
        wind: CELLAR_WIND[m] || 0.18,
        cold: winter ? 0.7 : m === 3 ? 0.3 : 0,
        birds: m === 3 ? 0.5 : m === 4 ? 1.5 : 0,
      }
    }
    case 'season': break
  }
  const w = input.weather
  if (!w) return { ...QUIET, wind: 0.3, birds: BIRDS_BY_MONTH[m] ?? 0, month: m }

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
  if ((m === 7 || m === 8) && !wet && w.tmean > 11.5) {
    crickets = clamp01((w.tmean - 11) / 6) * (m === 8 ? 0.75 : 1)
    chirps = (1.9 * (Math.min(30, w.tmean) - 6)) / 19
    pulse = (0.046 * 30.4) / (Math.min(30, w.tmean) + 6)
  }

  return { wind, cold, rain, heavy, birds, crickets, chirps, pulse, month: m }
}
