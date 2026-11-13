// What a day's turn asks of the page's thread, timed outside the browser: the day itself, the save, and each of the
// reckonings the interface asks for when a day has turned. A farm of four people at midsummer.
// Usage: node tools/render/daycost.ts
import * as S from '../../src/sim/index.ts'
import { serialize } from '../../src/game/save.ts'
import { loadWorld } from '../balance/world.ts'

const world = loadWorld()
const c = S.createCampaign(world, { seed: 3, startYear: 1987 })
const go = (cmd: unknown) => S.apply(world, c, cmd as never)
for (const a of [...c.applicants]) go({ t: 'hire', applicant: a.id })
go({ t: 'begin' })
for (let d = 0; d < 90; d++) {
  for (const a of S.advise(world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') go({ t: 'job', kind: a.act, field: a.field })
  go({ t: 'day' })
}
console.log(`day ${c.season?.day}, ${c.crew.length} people`)
const time = (name: string, f: () => unknown, n = 10): void => {
  const t = performance.now()
  let r: unknown
  for (let i = 0; i < n; i++) r = f()
  console.log(`${name.padEnd(14)} ${((performance.now() - t) / n).toFixed(2).padStart(8)} ms${typeof r === 'string' ? `  ${(r.length / 1024).toFixed(0)} KB` : ''}`)
}
time('save', () => serialize(c, 1))
time('advise', () => S.advise(world, c))
time('a day', () => S.apply(world, structuredClone(c), { t: 'day' } as never), 5)
time('copy', () => structuredClone(c), 5)
// The spring plan's reckonings, each tried on copies of the farm: asked for every time the plan's sheet is drawn.
{
  const p = S.createCampaign(world, { seed: 3, startYear: 1987 })
  time('plan: year end', () => S.moneyPlan(world, p), 5)
  time('plan: rescue', () => S.planRescue(world, p), 3)
  time('plan: a key', () => S.moneyEffect(world, p, { t: 'buy', upgrade: 'sprayer' } as never), 5)
  time('plan: as text', () => JSON.stringify(p), 20)
}
const fns = S as unknown as Record<string, (...a: unknown[]) => unknown>
for (const k of ['moneyNow', 'moneyLook', 'moneyWatch', 'pressing', 'jobOutlook', 'goalCosts', 'routineInfo', 'yearStory', 'standingOrders', 'needs', 'remedies']) {
  const f = fns[k]
  if (!f) { console.log(`${k.padEnd(14)} (not there)`); continue }
  try { time(k, () => (f.length >= 2 ? f(world, c) : f(c)), 5) } catch (e) { console.log(`${k.padEnd(14)} threw ${String(e).slice(0, 70)}`) }
}
