// Developer trace: weekly state of each field for one unsprayed year.
import { readFileSync } from 'node:fs'
import * as S from '../../src/sim/index.ts'
const weather = JSON.parse(readFileSync(new URL('../../src/data/weather/caribou.json', import.meta.url), 'utf8')) as S.WeatherData
const world = S.makeWorld(weather)
const year = Number(process.argv[2] ?? 1977)
const c = S.createCampaign(world, { seed: Number(process.argv[3] ?? 1), startYear: year })
for (let i = 0; i < 6; i++) S.apply(world, c, { t: 'plan', field: i, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } })
S.apply(world, c, { t: 'begin' })
const s = c.season!
let n = 0
while (!S.seasonDone(c) && n++ < 230) {
  for (let i = 0; i < 6; i++) {
    const f = S.fieldInfo(c, i)
    if (f.status === 'idle' && s.day >= S.dayIndex(year, 4, 12) && s.soilT >= 7) S.apply(world, c, { t: 'job', kind: 'plant', field: i })
    if (f.status === 'growing' && f.hillPasses === 0 && f.canopy > 0.12) S.apply(world, c, { t: 'job', kind: 'hill', field: i })
    if (f.status === 'growing' && f.hillPasses === 1 && f.canopy > 0.45) S.apply(world, c, { t: 'job', kind: 'hill', field: i })
  }
  S.apply(world, c, { t: 'day' })
  if (s.day >= S.dayIndex(year, 5, 20) && n % 7 === 0) {
    const d = S.getDay(world, year, s.day)
    console.log(S.formatDay(year, s.day, true).padEnd(7), `sv ${String(s.sv).padStart(3)} soil ${s.soilT.toFixed(0).padStart(2)}C rs ${d.rs.toFixed(0).padStart(2)} |`, s.fields.map(f => `${(f.sev * 100).toFixed(0).padStart(3)}% g${(f.green * 100).toFixed(0).padStart(3)} w${(100 * (1 - f.dr / S.TAW_MM[1])).toFixed(0).padStart(3)} ${(f.hMass.reduce((a, b) => a + b, 0) * S.CWT_PER_HILL_GRAM / 5).toFixed(0).padStart(3)}`).join(' | '))
  }
  if (s.day > S.dayIndex(year, 9, 5)) break
}
