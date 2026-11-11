import { hashNormal, hashUnit } from './rng.ts'
import { FROST_OFFSET, PD_MAX, PD_MIN, PD_OPT } from './params.ts'
import type { Day, World } from './types.ts'

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function hasYear(world: World, year: number): boolean {
  return world.weather.years[String(year)] !== undefined
}

export function getDay(world: World, year: number, day: number): Day {
  const y = world.weather.years[String(year)]
  const i = day < 0 ? 0 : day >= y.n ? y.n - 1 : day
  const tmax = y.tmax[i] / 10
  const tmin = y.tmin[i] / 10
  const tmean = (tmax + tmin) / 2
  const et0 = y.et0[i] / 10
  // Hargreaves radiation, recovered from the stored Hargreaves evapotranspiration (FAO-56 eq. 50 and 52).
  const denom = 0.0023 * (tmean + 17.8)
  const rs = denom > 0.01 ? clamp((0.16 * et0 / denom) * 2.45, 0, 34) : 0
  return {
    tmax, tmin, tmean,
    prcp: y.prcp[i] / 10,
    snwd: y.snwd[i],
    wetH: y.wetH[i],
    wetT: y.wetT[i] === -9999 ? tmean : y.wetT[i] / 10,
    rh: y.rh[i],
    wind: y.wind[i] < 0 ? 3 : y.wind[i] / 10,
    wdir: y.wdir[i] === -9999 ? -1 : y.wdir[i],
    cloud: y.cloud[i] === -9999 ? -1 : y.cloud[i] / 80,
    et0, rs,
    dayl: y.dayl[i],
  }
}

// Sands, Hackett and Nix (1979): daily development units from temperature, 0 to 10.
export function pUnit(t: number): number {
  if (t <= PD_MIN || t >= PD_MAX) return 0
  const span = t < PD_OPT ? PD_OPT - PD_MIN : PD_MAX - PD_OPT
  const x = (t - PD_OPT) / span
  return 10 * (1 - x * x)
}

export function pDays(tmin: number, tmax: number): number {
  return (5 * pUnit(tmin) + 8 * pUnit((2 * tmin + tmax) / 3) + 8 * pUnit((tmin + 2 * tmax) / 3) + 3 * pUnit(tmax)) / 24
}

// Wallin severity value for one noon-to-noon day (Blitecast, Krause et al. 1975).
export function wallin(wetHours: number, wetTemp: number): number {
  if (wetTemp < 7.2 || wetTemp > 26.6) return 0
  const h = wetHours
  if (wetTemp < 11.7) return h >= 25 ? 4 : h >= 22 ? 3 : h >= 19 ? 2 : h >= 16 ? 1 : 0
  if (wetTemp < 15.1) return h >= 22 ? 4 : h >= 19 ? 3 : h >= 16 ? 2 : h >= 13 ? 1 : 0
  return h >= 19 ? 4 : h >= 16 ? 3 : h >= 13 ? 2 : h >= 10 ? 1 : 0
}

// How much colder than the station a field gets on a still, clear night.
export function fieldTmin(d: Day, elev: number): number {
  const still = d.wind < 3 ? 1 : d.wind < 5 ? 0.6 : 0.25
  const clear = d.cloud < 0 ? 0.7 : 1 - 0.6 * d.cloud
  return d.tmin + FROST_OFFSET[elev] * still * clear
}

export interface ForecastDay {
  day: number
  hi: number            // C
  lo: number            // C
  spread: number        // C, about one standard deviation
  rainChance: number    // percent
  rainMm: number
  blight: number        // 0 none, 1 some, 2 high, 3 severe
  frostChance: number   // percent, for the coldest field
}

// The forecast for a day, as issued `lead` days before it. Stateless: asking does not change the game.
export function forecastFor(world: World, seed: number, year: number, day: number, lead: number): ForecastDay {
  const d = getDay(world, year, day)
  const sd = 0.7 + 0.45 * lead
  const hi = d.tmax + sd * hashNormal(seed, year, day, lead * 16 + 1)
  const lo = Math.min(hi - 1, d.tmin + sd * hashNormal(seed, year, day, lead * 16 + 2))
  const wobble = hashNormal(seed, year, day, lead * 16 + 3)
  // The forecaster calls each day wet or dry and is sometimes wrong, more often further out, so neither the
  // chance nor the amount settles whether it will rain.
  const wet = d.prcp >= 1
  const call = hashUnit(seed, year, day, lead * 16 + 5)
  const calledWet = wet ? call >= 0.04 + 0.035 * lead + (d.prcp < 3 ? 0.12 : 0) : call < 0.03 + 0.03 * lead
  const rainChance = Math.round((calledWet
    ? clamp((wet ? 80 : 58) - 5 * lead + 12 * wobble, 40, 95)
    : clamp((wet ? 28 : 8) + 3 * lead + 8 * wobble, 0, 35)) / 5) * 5
  const amount = wet ? d.prcp : 2 + 7 * hashUnit(seed, year, day, lead * 16 + 6)
  const rainMm = calledWet ? Math.max(1, Math.round(amount * clamp(1 + 0.25 * lead * wobble, 0.3, 2.2))) : 0
  const wetH = clamp(d.wetH + (0.8 + 0.7 * lead) * hashNormal(seed, year, day, lead * 16 + 4), 0, 24)
  const sev = wallin(wetH, d.wetT)
  const z = (lo + FROST_OFFSET[0] * 0.7) / (sd + 0.6)
  const frostChance = Math.round(clamp(0.5 - z / 3.2, 0, 1) * 20) * 5
  return { day, hi, lo, spread: sd, rainChance, rainMm, blight: sev >= 3 ? 3 : sev, frostChance }
}

// A stable "what was it like" label for a day.
export function skyOf(d: Day): 'clear' | 'cloud' | 'overcast' | 'rain' | 'storm' | 'fog' | 'snow' {
  if (d.prcp >= 20) return 'storm'
  if (d.prcp >= 1.5) return d.tmax <= 1 ? 'snow' : 'rain'
  if (d.wetH >= 13 && d.prcp < 1.5) return 'fog'
  const c = d.cloud < 0 ? (d.rs < 12 ? 0.8 : 0.3) : d.cloud
  return c >= 0.75 ? 'overcast' : c >= 0.4 ? 'cloud' : 'clear'
}

export function unitNoise(seed: number, a: number, b: number, c: number): number {
  return hashUnit(seed, a, b, c)
}
