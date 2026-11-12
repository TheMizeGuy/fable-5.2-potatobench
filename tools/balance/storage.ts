// What keeping the crop to spring really does, over generated farms: the price in each cellar month against the price
// at the dig, the month-to-month moves the cellar card calls "usual", and what a stored lot nets after shrink, the
// storage charge and sprouting. Usage: node tools/balance/storage.ts   (env SEEDS=200)
import * as S from '../../src/sim/index.ts'
import type { Campaign, VarietyId } from '../../src/sim/index.ts'
import { mean, quantile } from './stats.ts'
import { loadWorld } from './world.ts'

const record = loadWorld()
const seeds = Array.from({ length: Number(process.env.SEEDS ?? 200) }, (_, i) => i + 1)
const DIG = { month: 9, dom: 1 }   // October 1, the middle of the dig
const VARIETIES: VarietyId[] = ['katahdin', 'kennebec', 'caribou', 'burbank']

const priceAt = (world: S.World, c: Campaign, id: VarietyId, phase: 'season' | 'cellar', at: number) => {
  c.phase = phase
  if (phase === 'season') c.season = { day: at } as Campaign['season']
  else c.month = at
  return S.basePrice(world, c, id)
}

const april: number[] = [], up: number[][] = Array.from({ length: S.MONTH_CURVE.length - 1 }, () => [])
const net: Record<string, number[]> = Object.fromEntries(VARIETIES.map(v => [v, []]))
const best: Record<string, number[]> = Object.fromEntries(VARIETIES.map(v => [v, []]))
const bestMonth: Record<string, number[]> = Object.fromEntries(VARIETIES.map(v => [v, []]))
for (const seed of seeds) {
  const world = S.climateWorld(record, seed)
  const c = S.createCampaign(world, { seed, startYear: S.FARM_YEAR0 + 1 })
  for (let k = 0; k < 10; k++) {
    c.year = S.FARM_YEAR0 + 1 + k
    const dig = S.dayIndex(c.year, DIG.month, DIG.dom)
    const now = priceAt(world, c, 'katahdin', 'season', dig)
    april.push(priceAt(world, c, 'katahdin', 'cellar', 5) / now - 1)
    for (let m = 0; m + 1 < S.MONTH_CURVE.length; m++) up[m].push(priceAt(world, c, 'katahdin', 'cellar', m + 1) / priceAt(world, c, 'katahdin', 'cellar', m) - 1)
    for (const id of VARIETIES) {
      // A sound lot dug on October 1 into the cool cellar without ventilation, sold in April.
      const v = S.variety(id)
      const dugNow = priceAt(world, c, id, 'season', dig)
      // From October 1 to November 1 a month in the house, then month by month.
      let keep = 1 - S.SHRINK, sprouted = false, top = -Infinity, topM = 0
      for (let m = 0; m < S.MONTH_CURVE.length - 1; m++) {
        if (m > 0) {
          if (!sprouted && 30 + m * 30 > v.dormancy + S.COOL_CELLAR_DAYS) sprouted = true
          keep *= 1 - S.SHRINK - (sprouted ? S.SPROUT_SHRINK : 0)
        }
        const value = (priceAt(world, c, id, 'cellar', m) * (sprouted ? 0.85 : 1) * keep - S.STORE_COST * (m + 1)) / dugNow - 1
        if (value > top) { top = value; topM = m }
        if (m === 5) net[id].push(value)
      }
      best[id].push(top)
      bestMonth[id].push(topM)
    }
  }
}
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const dist = (xs: number[]) => `median ${pct(quantile(xs, 0.5))}, middle half ${pct(quantile(xs, 0.25))} to ${pct(quantile(xs, 0.75))}, one year in ten under ${pct(quantile(xs, 0.1))}, above it in ${Math.round(xs.filter(x => x > 0).length / xs.length * 100)}% of years`
console.log(`${seeds.length} farms, ten years each.`)
console.log(`Katahdin's price in April against October 1: ${dist(april)}.`)
for (let m = 0; m < up.length; m++) {
  const want = S.MONTH_CURVE[m + 1] / S.MONTH_CURVE[m] - 1
  console.log(`${S.CELLAR_MONTHS[m]} to ${S.CELLAR_MONTHS[m + 1]}: the curve says ${pct(want)}; the move ${dist(up[m])}; mean ${pct(mean(up[m]))}.`)
}
for (const id of VARIETIES) {
  const months = S.CELLAR_MONTHS.map((n, m) => [n, bestMonth[id].filter(x => x === m).length] as const).filter(x => x[1] > 0).map(([n, k]) => `${n} ${Math.round(k / bestMonth[id].length * 100)}%`).join(', ')
  console.log(`${S.variety(id).name}, stored from October 1 into the cool cellar without ventilation, against selling at the dig: sold in April ${dist(net[id])}; sold in its best month (${months}) ${dist(best[id])}.`)
}
