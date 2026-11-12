// Trial runs for setting the expert's thresholds: variants of the expert, each a change from EXPERT, played on the
// same generated farms as the tournament and compared with the first variant.
// Usage: node tools/balance/trial.ts <spec.json>   (env SEEDS=40, FIRST_SEED=1, YEARS=10, WORKERS=n)
// The spec maps a variant name to its changes: { "expert": {}, "home": { "land": [] }, "nobunk": { "farm": { "build": { "bunk": false } } },
// "w6": { "tune": { "walkFrom": 6 } } }. The names "reference" and "naive" are those bots.
import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import * as S from '../../src/sim/index.ts'
import { EXPERT, FARMSTEAD, TUNING, expert, naive, play, reference, type BotFactory, type ExpertCfg, type Farmstead, type Outcome, type Tuning } from './bots.ts'
import { mean, quantile, rng } from './stats.ts'
import { loadWorld } from './world.ts'

type Variant = Partial<Omit<ExpertCfg, 'farm' | 'tune'>> & { farm?: Partial<Farmstead> & { build?: Partial<Farmstead['build']> }; tune?: Partial<Tuning> }
type Spec = Record<string, Variant>
interface Task { name: string; seed: number }

const YEARS = Number(process.env.YEARS ?? 10)

function make(name: string, v: Variant): BotFactory {
  if (name === 'reference') return reference()
  if (name === 'naive') return naive()
  const farm = { ...FARMSTEAD, ...(v.farm ?? {}), build: { ...FARMSTEAD.build, ...(v.farm?.build ?? {}) } }
  return expert({ ...EXPERT, ...v, years: YEARS, farm, tune: { ...TUNING, ...(v.tune ?? {}) } } as ExpertCfg)
}

if (!isMainThread) {
  const record = loadWorld()
  const spec = workerData as Spec
  const bots = new Map(Object.keys(spec).map(n => [n, make(n, spec[n])]))
  const worlds = new Map<number, S.World>()
  parentPort!.on('message', (tasks: Task[]) => {
    parentPort!.postMessage(tasks.map(t => {
      let w = worlds.get(t.seed)
      if (!w) { w = S.climateWorld(record, t.seed); worlds.set(t.seed, w) }
      return { task: t, out: play(w, t.name, bots.get(t.name)!, S.FARM_YEAR0 + 1, t.seed, YEARS) }
    }))
  })
} else {
  const t0 = performance.now()
  const spec = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Spec
  const names = Object.keys(spec)
  const first = Number(process.env.FIRST_SEED ?? 1)
  const seeds = Array.from({ length: Number(process.env.SEEDS ?? 40) }, (_, i) => first + i)
  const workers = Math.max(1, Number(process.env.WORKERS ?? Math.min(16, availableParallelism() - 1)))
  const tasks: Task[] = []
  for (const s of seeds) for (const name of names) tasks.push({ name, seed: s })
  const chunks: Task[][] = []
  for (let i = 0; i < tasks.length; i += names.length) chunks.push(tasks.slice(i, i + names.length))
  const res = new Map<string, Outcome>()
  let next = 0
  await Promise.all(Array.from({ length: workers }, () => new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: spec })
    const feed = () => { if (next >= chunks.length) { void w.terminate().then(() => resolve()); return } w.postMessage(chunks[next++]) }
    w.on('message', (rs: { task: Task; out: Outcome }[]) => { for (const r of rs) res.set(`${r.task.name}|${r.task.seed}`, r.out); feed() })
    w.on('error', reject)
    feed()
  })))
  const k = (n: number) => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
  const base = names[0]
  console.log(`${seeds.length} farms (seeds ${seeds[0]}-${seeds[seeds.length - 1]}), ${YEARS} seasons, ${tasks.length} campaigns in ${((performance.now() - t0) / 1000).toFixed(0)} s`)
  console.log('| Variant | Mean net worth | Kept 10 / 5 | Minus first (95% interval) | Ahead of first | Held | Hired | Wages | Building | Equipment | Land+mortgage | Pickers | Winter wages |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const n of names) {
    const rows = seeds.map(s => res.get(`${n}|${s}`)!)
    const ds = seeds.map(s => res.get(`${n}|${s}`)!.netWorth - res.get(`${base}|${s}`)!.netWorth)
    const rand = rng(12345)
    const means: number[] = []
    for (let r = 0; r < 2000; r++) { let sum = 0; for (let i = 0; i < ds.length; i++) sum += ds[Math.floor(rand() * ds.length)]; means.push(sum / ds.length) }
    const per = (f: (o: Outcome) => number) => mean(rows.map(f))
    const sp = (key: keyof Outcome['spend']) => per(o => o.spend[key].reduce((a, x) => a + x, 0))
    console.log(`| ${n} | ${k(per(o => o.netWorth))} | ${Math.round(per(o => Number(o.kept)) * 100)}% / ${Math.round(per(o => Number(o.kept5)) * 100)}% | ${n === base ? '' : `${k(mean(ds))} (${k(quantile(means, 0.025))} to ${k(quantile(means, 0.975))})`} | ${n === base ? '' : `${ds.filter(d => d > 0).length}/${seeds.length}`} | ${per(o => mean(o.held)).toFixed(1)} | ${per(o => mean(o.hands)).toFixed(1)} | ${k(sp('wages'))} | ${k(sp('building'))} | ${k(sp('equipment'))} | ${k(sp('land') + sp('mortgage'))} | ${k(sp('pickers'))} | ${k(sp('winterWages'))} |`)
  }
}
