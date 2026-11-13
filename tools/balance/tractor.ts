// How much a small farm gets done in its first year with one tractor and with two: twelve seeded farms of their own,
// the reference practice, the farmer with a hired operator and a field hand. For checking a change to the crews' day.
// Usage: node tools/balance/tractor.ts
import * as S from '../../src/sim/index.ts'
import { play, reference, type BotFactory } from './bots.ts'
import { loadWorld } from './world.ts'

const record = loadWorld()
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)

// The sprays the practice ordered this season (each one wanted), counted as they go on the list.
let ordered = 0

// The reference practice, with the crew (and for two, the second tractor and its shed) taken on in spring.
function crewed(tractors: number): BotFactory {
  const base = reference()
  return () => {
    const bot = base()
    return {
      ...bot,
      day(world, c, events) {
        const had = new Set(c.season?.jobs.map(j => j.id))
        bot.day(world, c, events)
        if (c.history.length === 0) for (const j of c.season?.jobs ?? []) if (j.kind === 'spray' && !had.has(j.id)) ordered++
      },
      plan(world, c) {
        if (c.history.length === 0) {
          S.apply(world, c, { t: 'hire', kind: 'operator' })
          S.apply(world, c, { t: 'hire', kind: 'hand' })
          if (tractors > 1) {
            c.buildings.push({ id: c.nextBuilding++, kind: 'shed', yard: S.HOME_YARD, done: 1, need: 1, built: true })
            c.upgrades.tractor2 = true
          }
        }
        bot.plan(world, c)
      },
    }
  }
}

interface Row { plantDays: number; sprays: number; wanted: number; digDays: number; frozen: number; cash: number; leftIn: number; called: boolean }

function measure(tractors: number, seed: number): Row {
  const world = S.climateWorld(record, seed)
  let firstPlant = -1, lastPlant = -1, firstDig = -1, lastDug = -1, sprays = 0, frozen = 0, leftIn = 0
  ordered = 0
  const out = play(world, `tractor${tractors}`, crewed(tractors), S.FARM_YEAR0 + 1, seed, 1, (c, events) => {
    const s = c.season
    if (!s || c.history.length > 0) return
    for (const e of events) {
      if (e.type === 'planted') { if (firstPlant < 0) firstPlant = e.day; lastPlant = e.day }
      if (e.type === 'sprayed') sprays++
      if (e.type === 'dug') lastDug = e.day
      if (e.type === 'frozenInField') frozen += Number(e.data?.cwt ?? 0)
    }
    if (firstDig < 0 && s.worked.some(w => w.kind === 'dig')) firstDig = s.day - 1
    if (S.seasonDone(c) || s.frozen) leftIn = s.fields.filter(f => f.status === 'growing' || f.status === 'dead' || f.status === 'planted' || f.status === 'digging').length
  })
  return {
    plantDays: firstPlant < 0 ? 0 : lastPlant - firstPlant + 1, sprays, wanted: ordered,
    digDays: firstDig < 0 || lastDug < 0 ? 0 : lastDug - firstDig + 1, frozen, cash: out.cashBy[0] ?? out.cash, leftIn, called: !out.kept,
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
for (const tractors of [1, 2]) {
  const rows = SEEDS.map(seed => measure(tractors, seed))
  console.log(`${tractors} tractor${tractors > 1 ? 's' : ''}: planting ${avg(rows.map(r => r.plantDays)).toFixed(1)} days, sprays ${rows.reduce((a, r) => a + r.sprays, 0)} of ${rows.reduce((a, r) => a + r.wanted, 0)} wanted, digging ${avg(rows.map(r => r.digDays)).toFixed(1)} days, frozen ${Math.round(rows.reduce((a, r) => a + r.frozen, 0))} cwt, year-end cash $${Math.round(avg(rows.map(r => r.cash)))}, fields left in ${rows.reduce((a, r) => a + r.leftIn, 0)}, bank called ${rows.filter(r => r.called).length}`)
  console.log('  by seed: ' + rows.map((r, i) => `${SEEDS[i]}:${r.plantDays}/${r.sprays}of${r.wanted}/${r.digDays}/${Math.round(r.frozen)}/$${Math.round(r.cash / 100) * 100}`).join(' '))
}
