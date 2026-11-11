// Seasons made to order. A farm's weather is put together year by year from stretches of a long record,
// chosen by the farm's seed, so every farm has years of its own and none of them can be looked up.
import { dayIndex, daysInYear, monthDay } from './calendar.ts'
import { hash32, hashUnit } from './rng.ts'
import type { WeatherData, World, YearWeather } from './types.ts'
import { wallin } from './weather.ts'

// A made-up farm counts its years from here, far from any year in the record.
export const FARM_YEAR0 = 3000
export const FARM_YEARS = 40

const FIELDS = ['tmax', 'tmin', 'prcp', 'snow', 'snwd', 'wetH', 'wetT', 'rh', 'wind', 'wdir', 'cloud', 'et0', 'dayl', 'q'] as const
const BLOCK_MIN = 10          // days of one stretch of weather, at least
const BLOCK_SPAN = 15
const OWN_DONORS = 3          // the years that give a made-up year most of its weather, and so its character
const STRAY = 0.2             // share of stretches taken from any year at all

export function isFarmYear(year: number): boolean {
  return year > FARM_YEAR0 - 100
}

// "Year 3" for a made-up farm; the year itself for one played on the record.
export function yearLabel(year: number): string {
  return isFarmYear(year) ? `Year ${year - FARM_YEAR0}` : String(year)
}

function donorDay(record: WeatherData, donor: number, year: number, day: number): number {
  const { month, dom } = monthDay(year, day)
  const d = dayIndex(donor, month, month === 1 && dom === 29 ? 28 : dom)
  const n = record.years[String(donor)].n
  return d < n ? d : n - 1
}

export function makeYear(record: WeatherData, seed: number, year: number): YearWeather {
  const pool = record.playable
  const n = daysInYear(year)
  const out = { n } as YearWeather
  for (const f of FIELDS) out[f] = new Array<number>(n)
  const own: number[] = []
  for (let k = 0; own.length < OWN_DONORS && k < 40; k++) {
    const y = pool[hash32(seed, year, 11, k) % pool.length]
    if (!own.includes(y)) own.push(y)
  }
  let t = 0, block = 0, prev = -1
  while (t < n) {
    const len = BLOCK_MIN + Math.floor(hashUnit(seed, year, 21, block) * BLOCK_SPAN)
    const stray = hashUnit(seed, year, 31, block) < STRAY
    const donor = stray ? pool[hash32(seed, year, 41, block) % pool.length] : own[hash32(seed, year, 51, block) % own.length]
    const src = record.years[String(donor)]
    const before = prev >= 0 ? record.years[String(prev)] : null
    for (let k = 0; k < len && t < n; k++, t++) {
      const d = donorDay(record, donor, year, t)
      for (const f of FIELDS) out[f][t] = src[f][d]
      // Ease the temperature across the join so a new stretch arrives like a change in the weather, not a cut.
      if (before && k < 2) {
        const p = donorDay(record, prev, year, t)
        const w = k === 0 ? 2 / 3 : 1 / 3
        out.tmax[t] = Math.round(src.tmax[d] + (before.tmax[p] - src.tmax[d]) * w)
        out.tmin[t] = Math.round(src.tmin[d] + (before.tmin[p] - src.tmin[d]) * w)
        if (out.tmin[t] > out.tmax[t]) out.tmin[t] = out.tmax[t]
      }
    }
    prev = donor
    block++
  }
  return out
}

function growingRain(y: YearWeather, year: number): number {
  let sum = 0
  for (let d = dayIndex(year, 4, 1); d <= dayIndex(year, 8, 30); d++) sum += y.prcp[d]
  return sum
}

function blightWeather(y: YearWeather, year: number): number {
  let sum = 0
  for (let d = dayIndex(year, 5, 1); d <= dayIndex(year, 8, 15); d++) sum += wallin(y.wetH[d], y.wetT[d] / 10)
  return sum
}

// A hard season for the whole district is a short crop, and a short crop is a dear one.
export function priceLevelFor(y: YearWeather, year: number, seed: number, normalRain: number): number {
  const rain = growingRain(y, year)
  const dry = Math.min(1, Math.max(0, (0.82 * normalRain - rain) / (0.45 * normalRain)))
  const blight = Math.min(1, Math.max(0, (blightWeather(y, year) - 80) / 50))
  const luck = (hashUnit(seed, year, 61) - 0.5) * 0.3
  const level = 0.9 + 0.5 * dry + 0.25 * blight + luck
  return Math.round(Math.min(1.6, Math.max(0.6, level)) * 100) / 100
}

// The world a made-up farm lives in: its own years of weather and the prices that go with them.
export function climateWorld(base: World, seed: number, years = FARM_YEARS): World {
  const record = base.weather
  let normal = 0
  for (const y of record.playable) normal += growingRain(record.years[String(y)], y)
  normal /= record.playable.length
  const made: Record<string, YearWeather> = {}
  const priceLevel: Record<string, number> = {}
  const playable: number[] = []
  for (let k = 1; k <= years; k++) {
    const year = FARM_YEAR0 + k
    const y = makeYear(record, seed, year)
    made[String(year)] = y
    priceLevel[String(year)] = priceLevelFor(y, year, seed, normal)
    playable.push(year)
  }
  return {
    weather: { station: record.station, sources: [], built: record.built, years: made, normals: record.normals, playable },
    priceLevel, records: {}, neighbor: {}, notes: {},
  }
}
