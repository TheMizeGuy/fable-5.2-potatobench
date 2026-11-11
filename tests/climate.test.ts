// Made-up years: a farm's own weather, put together from the record by its seed.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { neighborYear } from '../src/game/neighbor.ts'
import { loadWorld } from '../tools/balance/world.ts'

const record = loadWorld()
const year1 = S.FARM_YEAR0 + 1

function mayToSeptRain(y: S.YearWeather, year: number): number {
  let sum = 0
  for (let d = S.dayIndex(year, 4, 1); d <= S.dayIndex(year, 8, 30); d++) sum += y.prcp[d]
  return sum / 10
}

describe('made-up years', () => {
  it('are whole and well formed for every year of a farm', () => {
    const w = S.climateWorld(record, 12345)
    expect(w.weather.playable.length).toBe(S.FARM_YEARS)
    for (const year of w.weather.playable) {
      const y = w.weather.years[String(year)]
      expect(y.n).toBe(S.daysInYear(year))
      for (const f of ['tmax', 'tmin', 'prcp', 'snow', 'snwd', 'wetH', 'wetT', 'rh', 'wind', 'wdir', 'cloud', 'et0', 'dayl', 'q'] as const) {
        expect(y[f].length, `${f} ${year}`).toBe(y.n)
        expect(y[f].every(v => Number.isInteger(v)), `${f} ${year} integers`).toBe(true)
      }
      for (let d = 0; d < y.n; d++) {
        expect(y.tmax[d]).toBeGreaterThanOrEqual(y.tmin[d])
        expect(y.wetH[d]).toBeGreaterThanOrEqual(0)
        expect(y.wetH[d]).toBeLessThanOrEqual(24)
        expect(y.wetT[d] === -9999).toBe(y.wetH[d] === 0)
        expect(y.prcp[d]).toBeGreaterThanOrEqual(0)
      }
      const level = w.priceLevel[String(year)]
      expect(level).toBeGreaterThanOrEqual(0.6)
      expect(level).toBeLessThanOrEqual(1.6)
    }
  })

  it('are the same for the same seed and different for another', () => {
    const a = S.climateWorld(record, 7), b = S.climateWorld(record, 7), c = S.climateWorld(record, 8)
    expect(a.weather.years[String(year1)]).toEqual(b.weather.years[String(year1)])
    expect(a.priceLevel).toEqual(b.priceLevel)
    expect(a.weather.years[String(year1)].tmax).not.toEqual(c.weather.years[String(year1)].tmax)
  })

  it('have the climate of the record: summers as warm and about as wet, with dry years and wet ones', () => {
    const rains: number[] = []
    let july = 0, n = 0
    for (let seed = 1; seed <= 12; seed++) {
      const w = S.climateWorld(record, seed, 10)
      for (const year of w.weather.playable) {
        const y = w.weather.years[String(year)]
        rains.push(mayToSeptRain(y, year))
        for (let d = S.dayIndex(year, 6, 1); d <= S.dayIndex(year, 6, 31); d++) { july += (y.tmax[d] + y.tmin[d]) / 20; n++ }
      }
    }
    const mean = rains.reduce((a, b) => a + b, 0) / rains.length
    expect(mean).toBeGreaterThan(400)
    expect(mean).toBeLessThan(560)
    expect(july / n).toBeGreaterThan(17.5)
    expect(july / n).toBeLessThan(20.5)
    expect(Math.min(...rains)).toBeLessThan(360)
    expect(Math.max(...rains)).toBeGreaterThan(600)
  })

  it('price a dry year above a wet one, on average', () => {
    const dry: number[] = [], wet: number[] = []
    for (let seed = 1; seed <= 30; seed++) {
      const w = S.climateWorld(record, seed, 10)
      for (const year of w.weather.playable) {
        const rain = mayToSeptRain(w.weather.years[String(year)], year)
        if (rain < 380) dry.push(w.priceLevel[String(year)])
        else if (rain > 520) wet.push(w.priceLevel[String(year)])
      }
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(dry.length).toBeGreaterThan(5)
    expect(avg(dry)).toBeGreaterThan(avg(wet) + 0.1)
  })

  it('carry a farm through five seasons under reference practice, with a neighbor to compare with', () => {
    const seed = 2024
    const w = S.climateWorld(record, seed)
    const c = S.createCampaign(w, { seed, startYear: year1 })
    expect(S.yearLabel(c.year)).toBe('Year 1')
    for (let guard = 0; guard < 4000 && c.phase !== 'over' && c.history.length < 5; guard++) {
      if (c.phase === 'plan') {
        const nb = neighborYear(w, seed, c.year)
        expect(nb, `neighbor for ${c.year}`).not.toBeNull()
        expect(nb!.plant).toBeGreaterThan(0)
        expect(nb!.yieldCwtAcre).toBeGreaterThan(80)
        w.neighbor[String(c.year)] = nb!
        expect(S.apply(w, c, { t: 'begin' }).ok).toBe(true)
      } else if (c.phase === 'season') {
        for (const a of S.advise(w, c)) {
          if (a.act === 'wait') continue
          if (a.act === 'sell') S.apply(w, c, { t: 'sell', lot: a.lot, frac: 1 })
          else if (a.act === 'close') S.apply(w, c, { t: 'endSeason' })
          else S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
        }
        if (c.phase === 'season') S.apply(w, c, { t: 'day' })
      } else if (c.phase === 'cellar') {
        if (c.month >= 3) for (const l of S.openLots(c)) S.apply(w, c, { t: 'sell', lot: l.id, frac: 1 })
        S.apply(w, c, { t: 'month' })
      } else if (c.phase === 'ledger') {
        if (c.history.length >= 5) break
        S.apply(w, c, { t: 'next' })
      }
    }
    // Reference practice keeps the farm about seven times in ten, so a seed may end early; it must still play real seasons.
    expect(c.history.length).toBeGreaterThanOrEqual(3)
    expect(['kept', 'lost', '']).toContain(c.outcome)
    expect(c.history.every(h => h.yieldCwtAcre > 100)).toBe(true)
    expect(S.availableVarieties(c.year).length).toBe(S.VARIETIES.length)
  })
})
