// Developer run: follow the in-game advice for a whole campaign and print the ledger.
import { readFileSync } from 'node:fs'
import * as S from '../../src/sim/index.ts'

const root = new URL('../../', import.meta.url)
const read = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'))
const world = S.makeWorld(read('src/data/weather/caribou.json'), { priceLevel: read('src/data/prices.json'), records: read('src/data/records.json') })
const sellMonth = Number(process.env.SELL ?? 5)

function play(startYear: number, seed: number, verbose: boolean) {
  const c = S.createCampaign(world, { seed, startYear })
  let guard = 0
  while (c.phase !== 'over' && c.history.length < 5 && guard++ < 4000) {
    if (c.phase === 'plan') { const r = S.apply(world, c, { t: 'begin' }); if (!r.ok) throw new Error(r.err) }
    else if (c.phase === 'season') {
      for (const a of S.advise(world, c)) {
        if (a.act === 'wait') continue
        if (a.act === 'sell') S.apply(world, c, { t: 'sell', lot: a.lot, frac: 1 })
        else if (a.act === 'close') S.apply(world, c, { t: 'endSeason' })
        else S.apply(world, c, { t: 'job', kind: a.act, field: a.field })
      }
      if (c.phase === 'season') S.apply(world, c, { t: 'day' })
    } else if (c.phase === 'cellar') {
      if (c.month >= sellMonth) for (const l of S.openLots(c)) S.apply(world, c, { t: 'sell', lot: l.id, frac: 1 })
      S.apply(world, c, { t: 'month' })
    } else if (c.phase === 'ledger') {
      const h = c.history[c.history.length - 1]
      if (verbose) console.log(`  ${h.year} fields ${h.potatoFields} yield ${h.yieldCwtAcre.toFixed(0)} cwt/a revenue ${Math.round(h.revenue)} costs ${Math.round(h.costs)} cash ${Math.round(h.cashEnd)} blight ${(h.blightPeak * 100).toFixed(0)}% record ${world.records[h.year]?.yieldCwtAcre}`)
      if (c.history.length >= 5) break
      S.apply(world, c, { t: 'next' })
    }
  }
  return c
}

const years = process.argv.slice(2).map(Number)
const list = years.length ? years : S.startYears(world)
let kept = 0, sum = 0
const t0 = performance.now()
for (const y of list) {
  const c = play(y, 7, years.length > 0)
  if (c.outcome === 'kept') kept++
  sum += c.cash
  console.log(`${y}: ${c.outcome || 'playing'} cash ${Math.round(c.cash)} after ${c.history.length} years | ${c.history.map(h => Math.round(h.yieldCwtAcre)).join(' ')}`)
}
console.log(`kept ${kept}/${list.length}, mean cash ${Math.round(sum / list.length)}, ${(performance.now() - t0).toFixed(0)} ms`)
