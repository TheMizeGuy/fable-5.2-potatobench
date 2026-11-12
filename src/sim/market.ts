// What a hundredweight is worth today, and selling.
import { dayIndex } from './calendar.ts'
import * as P from './params.ts'
import { hashNormal } from './rng.ts'
import type { Campaign, Grade, Lot, VarietyId, World } from './types.ts'
import { variety } from './varieties.ts'
import { clamp } from './weather.ts'

function seasonFactor(day: number): number {
  const c = P.SEASON_CURVE
  if (day <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    if (day <= c[i][0]) {
      const t = (day - c[i - 1][0]) / (c[i][0] - c[i - 1][0])
      return c[i - 1][1] + t * (c[i][1] - c[i - 1][1])
    }
  }
  return c[c.length - 1][1]
}

// The year's price level becomes known as the harvest comes in.
export function levelNow(world: World, c: Campaign): number {
  const level = world.priceLevel[String(c.year)] ?? 1
  if (c.phase !== 'season' || !c.season) return level
  return 1 + (level - 1) * clamp((c.season.day - 212) / 92, 0, 1)
}

function drift(c: Campaign): number {
  let w = 0
  for (let m = 1; m <= c.month; m++) w += hashNormal(c.seed, c.year, m, 991) * 0.035
  return 1 + clamp(w, -0.15, 0.15)
}

// Dollars per hundredweight of US No. 1 for a variety on the open market, now. The chipping variety finds only a
// processing price off contract, which moves a quarter as far as the market does.
export function basePrice(world: World, c: Campaign, id: VarietyId): number {
  const v = variety(id)
  if (v.contract) return v.price * P.PROCESSING_PRICE * (1 + (levelNow(world, c) - 1) * 0.25)
  const seasonal = c.phase === 'season' && c.season
    ? seasonFactor(c.season.day)
    : P.MONTH_CURVE[Math.min(c.month, P.MONTH_CURVE.length - 1)] * drift(c)
  return v.price * seasonal * levelNow(world, c)
}

export function gradePrice(world: World, c: Campaign, lot: Lot, grade: Grade): number {
  if (grade === 'cull') return P.CULL_PRICE
  const v = variety(lot.variety)
  let k = P.GRADE_PRICE[grade]
  if (grade === 'chef') k = v.chefBonus ? 1.15 : 0.8
  return basePrice(world, c, lot.variety) * k * (lot.sprouted ? 0.85 : 1)
}

// Thin-skinned tubers sell as new potatoes only straight from the field, early.
export function newPotatoWindow(c: Campaign, lot: Lot): boolean {
  if (c.phase !== 'season' || !c.season) return false
  const cut = dayIndex(c.year, P.NEW_POTATO_LAST.month, P.NEW_POTATO_LAST.dom)
  return c.season.day <= cut && c.season.day - lot.dugDay <= 6
}

// What a lot would fetch on the open market now. Of its No. 1 and B size, the share packed in the packing shed sells
// at a premium (PACK_NO1) and at three quarters of the No. 1 price.
export function lotValue(world: World, c: Campaign, lot: Lot): number {
  const g = lot.grades
  const skinnedAs: Grade = newPotatoWindow(c, lot) ? 'no1' : 'no2'
  const no1 = gradePrice(world, c, lot, 'no1'), b = gradePrice(world, c, lot, 'b')
  const pk = lot.packed
  return g.no1 * no1 * (1 + P.PACK_NO1 * pk) + g.chef * gradePrice(world, c, lot, 'chef') + g.b * (b + pk * (P.PACK_B * no1 - b)) +
    g.no2 * gradePrice(world, c, lot, 'no2') + lot.skinned * gradePrice(world, c, lot, skinnedAs) + g.cull * P.CULL_PRICE
}

export function sellLot(world: World, c: Campaign, lot: Lot, frac: number): number {
  const f = clamp(frac, 0, 1)
  const money = lotValue(world, c, lot) * f
  const g = lot.grades
  lot.sold += (g.no1 + g.chef + g.b + g.no2 + lot.skinned) * f
  g.no1 *= 1 - f; g.chef *= 1 - f; g.b *= 1 - f; g.no2 *= 1 - f; g.cull *= 1 - f
  lot.skinned *= 1 - f
  lot.revenue += money
  c.cash += money
  c.yearRevenue += money
  if (g.no1 + g.chef + g.b + g.no2 + lot.skinned < 0.5) {
    lot.open = false
    g.no1 = 0; g.chef = 0; g.b = 0; g.no2 = 0; g.cull = 0; lot.skinned = 0
  }
  return money
}

export interface StoreMonth { month: number; name: string; net: number; sprouted: boolean }

// What keeping a lot to each cellar month would usually bring, against selling it now: the usual price curve from
// today's quote (the chipping variety's processing price is one price all winter), the shrink, sprouting once the lot
// has been out of the ground longer than its dormancy in a cool cellar, and the storage charge from now. Rot that has
// not shown is not counted. net is dollars for the whole lot then, less the storage charge paid till then.
export function storeOutlook(world: World, c: Campaign, lot: Lot): { now: number; months: StoreMonth[]; best: StoreMonth | null } {
  const now = lotValue(world, c, lot)
  const months: StoreMonth[] = []
  if (c.phase !== 'season' && c.phase !== 'cellar') return { now, months, best: null }
  const v = variety(lot.variety)
  const vent = c.upgrades.vent
  const dormancy = v.dormancy + P.COOL_CELLAR_DAYS + (vent ? P.VENT_DAYS : 0)
  const shrink = vent ? P.SHRINK_VENT : P.SHRINK
  const inSeason = c.phase === 'season' && !!c.season
  const nov1 = dayIndex(lot.year, 10, 1)
  const today = inSeason ? c.season!.day : nov1 + c.month * 30
  const curveNow = inSeason ? seasonFactor(c.season!.day) : P.MONTH_CURVE[Math.min(c.month, P.MONTH_CURVE.length - 1)]
  const cwt = lot.grades.no1 + lot.grades.chef + lot.grades.b + lot.grades.no2 + lot.skinned
  for (let m = inSeason ? 0 : c.month + 1; m < P.MONTH_CURVE.length; m++) {
    const at = nov1 + m * 30
    const span = (at - today) / 30
    if (span <= 0) continue
    const sproutsAt = lot.dugDay + dormancy
    const sprouted = lot.sprouted || at > sproutsAt
    const sproutMonths = sprouted ? Math.min(span, (at - Math.max(today, lot.sprouted ? today : sproutsAt)) / 30) : 0
    const keep = Math.max(0, 1 - shrink * span - P.SPROUT_SHRINK * sproutMonths)
    const price = v.contract ? 1 : P.MONTH_CURVE[m] / curveNow
    const factor = sprouted && !lot.sprouted ? 0.85 : 1
    months.push({ month: m, name: P.CELLAR_MONTHS[m], net: now * price * factor * keep - P.STORE_COST * cwt * keep * span, sprouted })
  }
  let best: StoreMonth | null = null
  for (const x of months) if (!best || x.net > best.net) best = x
  return { now, months, best }
}
