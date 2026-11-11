// Developer smoke run: a plain calendar grower over chosen years, printing what the model does.
// Usage: node tools/dev/smoke.ts [years...]   with env V=1 (events), VAR=<variety>, HILL=0, SPRAY=0, CMP=1 (sprayed vs bare)
import { readFileSync } from 'node:fs'
import * as S from '../../src/sim/index.ts'

const weather = JSON.parse(readFileSync(new URL('../../src/data/weather/caribou.json', import.meta.url), 'utf8')) as S.WeatherData
const world = S.makeWorld(weather)
const args = process.argv.slice(2)
const years = args.length ? args.map(Number) : weather.playable
const verbose = process.env.V === '1'
const hill = process.env.HILL !== '0'
const killMonthDay = [8, Number(process.env.KILL ?? 8)]

function run(year: number, seed: number, spray: boolean) {
  const c = S.createCampaign(world, { seed, startYear: year })
  for (let i = 0; i < 6; i++) S.apply(world, c, { t: 'plan', field: i, plan: { crop: 'potato', variety: (process.env.VAR ?? 'katahdin') as S.VarietyId, seed: 'certified' } })
  S.apply(world, c, { t: 'begin' })
  const s = c.season!
  const may = S.dayIndex(year, 4, 12)
  let guard = 0, sprays = 0
  while (!S.seasonDone(c) && guard++ < 260) {
    for (let i = 0; i < 6; i++) {
      const f = S.fieldInfo(c, i)
      if (f.status === 'idle' && s.day >= may && s.soilT >= 7) S.apply(world, c, { t: 'job', kind: 'plant', field: i })
      if (f.status === 'growing') {
        if (hill && f.hillPasses === 0 && f.canopy > 0.12) S.apply(world, c, { t: 'job', kind: 'hill', field: i })
        if (hill && f.hillPasses === 1 && f.canopy > 0.45) S.apply(world, c, { t: 'job', kind: 'hill', field: i })
        if (spray && s.watchDay >= 0 && f.protect < 0.35 && S.apply(world, c, { t: 'job', kind: 'spray', field: i }).ok) sprays++
        if (s.day >= S.dayIndex(year, killMonthDay[0], killMonthDay[1]) && f.estimate) S.apply(world, c, { t: 'job', kind: 'kill', field: i })
      }
      if (f.status === 'dead' && (f.skin >= 1 || s.day >= S.dayIndex(year, 9, 8))) S.apply(world, c, { t: 'job', kind: 'dig', field: i })
    }
    const r = S.apply(world, c, { t: 'day' })
    if (verbose) for (const e of r.events) console.log(S.formatDay(year, e.day, true), e.text)
  }
  const lots = c.lots
  const cwt = lots.reduce((a, l) => a + S.lotCwt(l), 0)
  const no1 = lots.reduce((a, l) => a + l.grades.no1 + l.grades.chef, 0)
  const value = lots.reduce((a, l) => a + S.lotValue(world, c, l), 0)
  const cull = lots.reduce((a, l) => a + l.grades.cull, 0)
  const loss: Record<string, number> = {}
  for (const l of lots) for (const k of Object.keys(l.loss)) loss[k] = (loss[k] ?? 0) + (l.loss as Record<string, number>)[k]
  const peak = Math.max(...s.fields.map(f => f.sevPeak))
  const fld = s.fields[2]
  return {
    year, sprays: sprays / 6, rot: lots.reduce((a, l) => a + l.rot, 0) / Math.max(1, lots.length), no1: no1 / 30, value, market: cwt / 30, cull: cull / 30,
    peak, sv: s.sv, watch: s.watchDay, plant: fld.plantDay, emerge: fld.emergeDay, ti: fld.tiDay, close: fld.closeDay, mature: fld.matureDay,
    dead: fld.deadDay, dug: fld.dugDay, end: s.day, loss, cash: c.cash, lost: s.fields.filter(f => f.status === 'lost').length,
  }
}

const fmt = (y: number, d: number) => d < 0 ? '  -   ' : S.formatDay(y, d, true).padEnd(6)
const t0 = performance.now()
if (process.env.CMP === '1') {
  let a = 0, b = 0
  for (const y of years) {
    const on = run(y, 1, true)
    const off = run(y, 1, false)
    a += on.market; b += off.market
    console.log(`${y} sv ${String(on.sv).padStart(3)} watch ${fmt(y, on.watch)} | sprayed x${on.sprays.toFixed(0).padStart(2)} mkt ${on.market.toFixed(0).padStart(3)} peak ${(on.peak * 100).toFixed(0).padStart(3)}% $${Math.round(on.value / 1000)}k rot ${(on.rot * 100).toFixed(0)}% | bare mkt ${off.market.toFixed(0).padStart(3)} peak ${(off.peak * 100).toFixed(0).padStart(3)}% $${Math.round(off.value / 1000)}k blightcull ${Math.round((off.loss.blight ?? 0) / 30)} rot ${(off.rot * 100).toFixed(0)}% dead ${fmt(y, off.dead)}`)
  }
  console.log(`mean sprayed ${(a / years.length).toFixed(0)} bare ${(b / years.length).toFixed(0)} in ${(performance.now() - t0).toFixed(0)} ms`)
} else {
  const rows = years.map(y => run(y, 1, process.env.SPRAY !== '0'))
  for (const r of rows) {
    const l = Object.entries(r.loss).filter(([, v]) => v > 15).map(([k, v]) => `${k}:${Math.round(v / 30)}`).join(' ')
    console.log(`${r.year} mkt ${r.market.toFixed(0).padStart(4)} no1 ${r.no1.toFixed(0).padStart(4)} $${Math.round(r.value / 1000)}k cull ${r.cull.toFixed(0).padStart(3)} blight ${(r.peak * 100).toFixed(0).padStart(3)}% sv ${String(r.sv).padStart(3)} watch ${fmt(r.year, r.watch)} plant ${fmt(r.year, r.plant)} up ${fmt(r.year, r.emerge)} ti ${fmt(r.year, r.ti)} close ${fmt(r.year, r.close)} mat ${fmt(r.year, r.mature)} dead ${fmt(r.year, r.dead)} dug ${fmt(r.year, r.dug)} lost ${r.lost} | ${l}`)
  }
  const mean = rows.reduce((a, r) => a + r.market, 0) / rows.length
  const sd = Math.sqrt(rows.reduce((a, r) => a + (r.market - mean) ** 2, 0) / rows.length)
  console.log(`mean marketable ${mean.toFixed(0)} sd ${sd.toFixed(0)} min ${Math.min(...rows.map(r => r.market)).toFixed(0)} max ${Math.max(...rows.map(r => r.market)).toFixed(0)} cwt/acre over ${rows.length} years in ${(performance.now() - t0).toFixed(0)} ms`)
}
