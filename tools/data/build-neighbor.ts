// The neighbour: reference practice for each real year, played once with a fixed seed and reported as
// seen from the road. Writes src/data/neighbor.json. Usage: node tools/data/build-neighbor.ts
import { writeFileSync } from 'node:fs'
import * as S from '../../src/sim/index.ts'
import { play, reference } from '../balance/bots.ts'
import { loadWorld, repoPath } from '../balance/world.ts'

const SEED = 1
// The neighbour's dates are those of a mid-slope field, potatoes in the opening plan.
const FIELD = 2

const world = loadWorld()
const out: Record<string, S.NeighborYear> = {}
for (const year of world.weather.playable) {
  const n: S.NeighborYear = { plant: -1, hill1: -1, hill2: -1, firstSpray: -1, sprays: 0, kill: -1, dig: -1, yieldCwtAcre: 0, blightPct: 0, variety: '' }
  let seen = 0
  const r = play(world, 'neighbour', reference(), year, SEED, 1, (c, events) => {
    // What blight a passer-by would know of: the share the grower has found, on the worst field.
    for (let i = 0; i < S.FIELD_COUNT; i++) seen = Math.max(seen, S.fieldInfo(c, i).blightKnown)
    for (const e of events) {
      if (e.field !== FIELD) continue
      if (e.type === 'planted') { n.plant = e.day; n.variety = c.plans[FIELD].variety }
      else if (e.type === 'hilled') { if (n.hill1 < 0) n.hill1 = e.day; else if (n.hill2 < 0) n.hill2 = e.day }
      else if (e.type === 'sprayed') { if (n.firstSpray < 0) n.firstSpray = e.day; n.sprays++ }
      else if (e.type === 'killed') n.kill = e.day
      else if (e.type === 'dug') n.dig = e.day
    }
  })
  n.yieldCwtAcre = Math.round(r.yields[0] ?? 0)
  n.blightPct = Math.round(seen * 1000) / 10
  out[String(year)] = n
}
writeFileSync(repoPath('src/data/neighbor.json'), JSON.stringify(out, null, 1) + '\n')
const ys = Object.values(out)
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
console.log(`Wrote src/data/neighbor.json: ${ys.length} years, median plant ${S.formatDay(2001, med(ys.map(n => n.plant)), true)}, median dig ${S.formatDay(2001, med(ys.map(n => n.dig)), true)}, median yield ${med(ys.map(n => n.yieldCwtAcre))} cwt/acre, ${ys.filter(n => n.blightPct > 0).length} years with blight seen.`)
