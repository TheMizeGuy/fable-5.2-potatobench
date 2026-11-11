import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

// docs/research/02-late-blight.md, section 1.1: Wallin severity values by mean temperature during the
// RH >= 90% period (C) and its length (hours). Each band lists the first hour of SV 1, 2, 3 and 4.
const WALLIN_TABLE = [
  { lo: 7.2, hi: 11.6, firstHour: [16, 19, 22, 25] },   // <=15 h 0, 16-18 1, 19-21 2, 22-24 3, 25+ 4
  { lo: 11.7, hi: 15.0, firstHour: [13, 16, 19, 22] },  // <=12 h 0, 13-15 1, 16-18 2, 19-21 3, 22+ 4
  { lo: 15.1, hi: 26.6, firstHour: [10, 13, 16, 19] },  // <=9 h 0, 10-12 1, 13-15 2, 16-18 3, 19+ 4
]

describe('Wallin severity values', () => {
  for (const band of WALLIN_TABLE) {
    it(`reproduces the ${band.lo}-${band.hi} C row cell by cell`, () => {
      // Temperatures at the data's 0.1 C resolution, every one in the band.
      for (let t10 = Math.round(band.lo * 10); t10 <= Math.round(band.hi * 10); t10++) {
        const t = t10 / 10
        for (let h = 0; h <= 30; h++) {
          const sv = band.firstHour.filter(first => h >= first).length
          expect(S.wallin(h, t), `${h} h at ${t} C`).toBe(sv)
        }
      }
    })
  }

  it('gives 0 below 7.2 C and above 26.6 C, however long the wet spell', () => {
    for (const t of [-5, 0, 5, 7.1, 26.7, 27, 30, 35]) for (let h = 0; h <= 30; h++) expect(S.wallin(h, t), `${h} h at ${t} C`).toBe(0)
  })

  it('agrees with the bulletin worked example: 18 hours gives 3 SV at 65 F, 2 at 56 F, 1 at 50 F, 0 at 40 F and 85 F', () => {
    const c = (f: number) => Math.round(((f - 32) * 5) / 9 * 10) / 10
    expect([65, 56, 50, 40, 85].map(f => S.wallin(18, c(f)))).toEqual([3, 2, 1, 0, 0])
  })
})

describe('physiological days (Sands, Hackett and Nichols 1979)', () => {
  // Worked by hand: P(t) = 10 (1 - x^2), x = (t - 21) / 14 below 21 C and (t - 21) / 9 above, 0 outside 7-30 C;
  // the day is (5 P(tmin) + 8 P((2 tmin + tmax) / 3) + 8 P((tmin + 2 tmax) / 3) + 3 P(tmax)) / 24.
  it('matches hand-computed daily values', () => {
    expect(S.pDays(21, 21)).toBeCloseTo(10, 12)
    expect(S.pDays(14, 14)).toBeCloseTo(7.5, 12)                        // x = -1/2
    expect(S.pDays(25.5, 25.5)).toBeCloseTo(7.5, 12)                    // x = 1/2
    expect(S.pDays(0, 7)).toBe(0)
    expect(S.pDays(30, 35)).toBe(0)
    // tmin 5, tmax 30: the thirds are 40/3 (x = -23/42) and 65/3 (x = 2/27); the ends give 0.
    expect(S.pDays(5, 30)).toBeCloseTo((8 * (12350 / 1764) + 8 * (7250 / 729)) / 24, 12)
    // tmin 10, tmax 25: P(10) = 750/196, P(15) = 400/49, P(20) = 1950/196, P(25) = 650/81.
    expect(S.pDays(10, 25)).toBeCloseTo((5 * 750 / 196 + 8 * 400 / 49 + 8 * 1950 / 196 + 3 * 650 / 81) / 24, 12)
    expect(S.pDays(10, 25)).toBeCloseTo(7.8377, 4)
  })

  it('pUnit is zero at and beyond the limits and peaks at the optimum', () => {
    expect(S.pUnit(S.PD_MIN)).toBe(0)
    expect(S.pUnit(S.PD_MAX)).toBe(0)
    expect(S.pUnit(S.PD_OPT)).toBe(10)
    for (let t = -10; t <= 40; t += 0.25) {
      expect(S.pUnit(t)).toBeGreaterThanOrEqual(0)
      expect(S.pUnit(t)).toBeLessThanOrEqual(10)
    }
  })
})

describe('calendar', () => {
  for (const year of [1900, 1996, 2000, 2023, 2024]) {
    it(`round-trips every day of ${year} (${S.isLeap(year) ? 'leap' : 'common'})`, () => {
      const n = S.daysInYear(year)
      expect(n).toBe(S.isLeap(year) ? 366 : 365)
      for (let d = 0; d < n; d++) {
        const { month, dom } = S.monthDay(year, d)
        expect(S.dayIndex(year, month, dom)).toBe(d)
      }
      expect(S.monthDay(year, n - 1)).toEqual({ month: 11, dom: 31 })
      expect(S.dayIndex(year, 11, 31)).toBe(n - 1)
    })
  }

  it('places March 1 after February 29 only in leap years', () => {
    expect(S.isLeap(1900)).toBe(false)
    expect(S.isLeap(2000)).toBe(true)
    expect(S.dayIndex(2024, 1, 29)).toBe(59)
    expect(S.dayIndex(2024, 2, 1)).toBe(60)
    expect(S.dayIndex(2023, 2, 1)).toBe(59)
    expect(S.formatDay(2024, 59)).toBe('February 29')
    expect(S.formatDay(2023, 59)).toBe('March 1')
    expect(S.formatDay(2023, 0, true)).toBe('Jan 1')
  })
})

describe('the weather file', () => {
  const world = loadWorld()
  const w = world.weather
  const KEYS = ['tmax', 'tmin', 'prcp', 'snow', 'snwd', 'wetH', 'wetT', 'rh', 'wind', 'wdir', 'cloud', 'et0', 'dayl', 'q'] as const

  it('lists playable years in order, each present in the file', () => {
    expect(w.playable.length).toBeGreaterThan(40)
    for (let i = 1; i < w.playable.length; i++) expect(w.playable[i]).toBeGreaterThan(w.playable[i - 1])
    for (const y of w.playable) expect(w.years[String(y)], String(y)).toBeDefined()
    for (const k of ['tmax', 'tmin', 'prcp', 'wetH'] as const) expect(w.normals[k].length).toBe(366)
  })

  it('has full integer arrays for every playable year', () => {
    for (const y of w.playable) {
      const Y = w.years[String(y)]
      expect(Y.n, String(y)).toBe(S.daysInYear(y))
      for (const k of KEYS) {
        expect(Y[k].length, `${y} ${k}`).toBe(Y.n)
        expect(Y[k].every(v => Number.isInteger(v)), `${y} ${k} integers`).toBe(true)
      }
    }
  })

  it('keeps every value in its range', () => {
    for (const y of w.playable) {
      const Y = w.years[String(y)]
      for (let i = 0; i < Y.n; i++) {
        const at = `${y} day ${i}`
        expect(Y.tmax[i] >= Y.tmin[i], `${at} tmax >= tmin`).toBe(true)
        expect(Y.wetH[i] >= 0 && Y.wetH[i] <= 24, `${at} wetH`).toBe(true)
        expect(Y.wetH[i] === 0, `${at} wetT missing exactly when wetH is 0`).toBe(Y.wetT[i] === -9999)
        expect(Y.rh[i] >= 0 && Y.rh[i] <= 100, `${at} rh`).toBe(true)
        expect(Y.prcp[i] >= 0 && Y.snow[i] >= 0 && Y.snwd[i] >= 0 && Y.et0[i] >= 0 && Y.wind[i] >= 0, `${at} non-negative`).toBe(true)
        expect(Y.dayl[i] > 0 && Y.dayl[i] < 1440, `${at} day length`).toBe(true)
        expect(Y.wdir[i] === -9999 || (Y.wdir[i] >= 1 && Y.wdir[i] <= 360), `${at} wdir`).toBe(true)
        expect(Y.cloud[i] === -9999 || (Y.cloud[i] >= 0 && Y.cloud[i] <= 80), `${at} cloud`).toBe(true)
        expect(Y.q[i] >= 0 && Y.q[i] <= 31, `${at} quality bits`).toBe(true)
      }
    }
  })

  it('marks a year playable exactly when May to October has under 5% estimated humidity and under 2% filled temperatures', () => {
    for (const ys of Object.keys(w.years)) {
      const y = Number(ys), Y = w.years[ys]
      const a = S.dayIndex(y, 4, 1), b = S.dayIndex(y, 9, 31)
      let b8 = 0, b1 = 0
      for (let i = a; i <= b; i++) { if (Y.q[i] & 8) b8++; if (Y.q[i] & 1) b1++ }
      const n = b - a + 1
      const ok = Y.n === S.daysInYear(y) && b8 / n < 0.05 && b1 / n < 0.02
      expect(w.playable.includes(y), `${y}: ${b8} estimated, ${b1} filled of ${n}`).toBe(ok)
    }
  })

  it('turns every day of every playable year into finite weather', () => {
    for (const y of w.playable) {
      for (let d = 0; d < S.daysInYear(y); d++) {
        const day = S.getDay(world, y, d)
        for (const [k, v] of Object.entries(day)) expect(Number.isFinite(v), `${y} ${d} ${k}`).toBe(true)
        expect(day.rs >= 0 && day.rs <= 34, `${y} ${d} rs`).toBe(true)
      }
    }
  })
})
