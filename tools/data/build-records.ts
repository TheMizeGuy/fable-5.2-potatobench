// Turns the USDA NASS table into the game's record and price-level files.
// Price level = that year's season-average price over the trend around it (the mean of log price in the
// nine years centred on it), so it carries how good or bad the year's price was, free of inflation.
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const rows = readFileSync(new URL('data/records/maine_potato_nass.csv', root), 'utf8').trim().split('\n').slice(1)
  .map(line => line.split(','))
  .map(c => ({ year: Number(c[0]), yieldCwt: c[1] === '' ? null : Number(c[1]), price: c[2] === '' ? null : Number(c[2]) }))

const records: Record<string, { yieldCwtAcre: number | null; priceUsdCwt: number | null }> = {}
const level: Record<string, number> = {}
for (const r of rows) {
  records[r.year] = { yieldCwtAcre: r.yieldCwt, priceUsdCwt: r.price }
  if (r.price === null) continue
  const near = rows.filter(o => o.price !== null && Math.abs(o.year - r.year) <= 4)
  const trend = Math.exp(near.reduce((a, o) => a + Math.log(o.price as number), 0) / near.length)
  level[r.year] = Math.round(Math.min(1.6, Math.max(0.55, r.price / trend)) * 100) / 100
}
writeFileSync(new URL('src/data/records.json', root), JSON.stringify(records) + '\n')
writeFileSync(new URL('src/data/prices.json', root), JSON.stringify(level) + '\n')
console.log(Object.entries(level).map(([y, v]) => `${y}:${v}`).join(' '))
