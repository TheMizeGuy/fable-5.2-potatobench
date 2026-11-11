// Trial runs for setting the expert's thresholds: variants of the expert, each a change from EXPERT, played over
// the tournament's start years and compared with the first variant on the same campaigns.
// Usage: node tools/balance/trial.ts <spec.json>   (env SEEDS=6, FIRST_SEED=1, WORKERS=n, YEARS=every nth start year, GOAL=5)
// The spec maps a variant name to its changes: { "expert": {}, "home": { "land": [] }, "h3": { "tune": { "hands": { "from": 3, "per": 5 } } } }.
// The names "reference" and "naive" are those bots. A variant's "economy": { "rent": { "ridge": 3000 }, "price": { ... } }
// sets the rent and price of every field of a block while it plays, for sizing a change before making it; an entry
// "_economy" does the same for every variant without one.
import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import * as S from '../../src/sim/index.ts'
import { EXPERT, expert, naive, play, reference, type BotFactory, type ExpertCfg, type Outcome } from './bots.ts'
import { mean, quantile, rng } from './stats.ts'
import { loadWorld } from './world.ts'

type Economy = { rent?: Record<string, number>; price?: Record<string, number>; upgrade?: Record<string, number> }
type Spec = Record<string, Partial<ExpertCfg> & { tune?: Partial<ExpertCfg['tune']>; economy?: Economy }>

const LAND = S.PARCELS.map(p => ({ rent: p.rent, price: p.price }))
const KIT = Object.fromEntries(Object.entries(S.UPGRADES).map(([id, u]) => [id, u.cost]))

function economy(spec: Spec, name: string): void {
  const e = spec[name]?.economy ?? (spec as unknown as { _economy?: Economy })._economy
  S.PARCELS.forEach((p, i) => {
    p.rent = e?.rent?.[p.block] ?? LAND[i].rent
    p.price = e?.price?.[p.block] ?? LAND[i].price
  })
  for (const [id, u] of Object.entries(S.UPGRADES)) u.cost = e?.upgrade?.[id] ?? KIT[id]
}
interface Task { name: string; startYear: number; seed: number; goal: number }

function make(name: string, spec: Spec): BotFactory {
  if (name === 'reference') return reference()
  if (name === 'naive') return naive()
  const v = spec[name] ?? {}
  const { economy: _e, ...cfg } = v
  return expert({ ...EXPERT, ...cfg, tune: { ...EXPERT.tune, ...(cfg.tune ?? {}) } } as ExpertCfg)
}

if (!isMainThread) {
  const world = loadWorld()
  const spec = workerData as Spec
  const bots = new Map(Object.keys(spec).filter(n => n !== '_economy').map(n => [n, make(n, spec)]))
  parentPort!.on('message', (tasks: Task[]) => {
    parentPort!.postMessage(tasks.map(t => { economy(spec, t.name); return { task: t, out: play(world, t.name, bots.get(t.name)!, t.startYear, t.seed, t.goal) } }))
  })
} else {
  const t0 = performance.now()
  const spec = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Spec
  const names = Object.keys(spec).filter(n => n !== '_economy')
  const world = loadWorld()
  const stride = Number(process.env.YEARS ?? 1)
  const years = (process.env.GOAL === "1" ? world.weather.playable : S.startYears(world)).filter((_, i) => i % stride === 0)
  const first = Number(process.env.FIRST_SEED ?? 1)
  const seeds = Array.from({ length: Number(process.env.SEEDS ?? 6) }, (_, i) => first + i)
  const goal = Number(process.env.GOAL ?? S.GOAL_YEARS)
  const workers = Math.max(1, Number(process.env.WORKERS ?? Math.min(12, availableParallelism() - 1)))
  const tasks: Task[] = []
  for (const name of names) for (const y of years) for (const s of seeds) tasks.push({ name, startYear: y, seed: s, goal })
  const chunks: Task[][] = []
  for (let i = 0; i < tasks.length; i += 8) chunks.push(tasks.slice(i, i + 8))
  const res = new Map<string, Outcome>()
  const key = (n: string, y: number, s: number) => `${n}|${y}|${s}`
  let next = 0
  await Promise.all(Array.from({ length: workers }, () => new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: spec })
    const feed = () => { if (next >= chunks.length) { void w.terminate().then(() => resolve()); return } w.postMessage(chunks[next++]) }
    w.on('message', (rs: { task: Task; out: Outcome }[]) => { for (const r of rs) res.set(key(r.task.name, r.task.startYear, r.task.seed), r.out); feed() })
    w.on('error', reject)
    feed()
  })))
  const k = (n: number) => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
  const base = names[0]
  console.log(`${years.length} start years, seeds ${seeds[0]}-${seeds[seeds.length - 1]}, ${goal} seasons, ${tasks.length} campaigns in ${((performance.now() - t0) / 1000).toFixed(0)} s`)
  console.log('| Variant | Mean net worth | Kept | Minus first (95% interval) | Beats first, start years | Fields held (by season) | Hands | Operator | Wages | Rent | Land bought | Contract sales | Penalties | Signed |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const n of names) {
    const rows = years.flatMap(y => seeds.map(s => res.get(key(n, y, s))!))
    const perYear = years.map(y => seeds.map(s => res.get(key(n, y, s))!.netWorth - res.get(key(base, y, s))!.netWorth))
    const wins = perYear.filter(ds => quantile(ds, 0.5) > 0).length
    const rand = rng(12345)
    const means: number[] = []
    for (let r = 0; r < 2000; r++) {
      let sum = 0, cnt = 0
      for (let i = 0; i < perYear.length; i++) for (const d of perYear[Math.floor(rand() * perYear.length)]) { sum += d; cnt++ }
      means.push(sum / cnt)
    }
    const diff = mean(perYear.flat())
    const per = (f: (o: Outcome) => number) => mean(rows.map(f))
    console.log(`| ${n} | ${k(per(o => o.netWorth))} | ${Math.round(per(o => Number(o.kept)) * 100)}% | ${n === base ? '' : `${k(diff)} (${k(quantile(means, 0.025))} to ${k(quantile(means, 0.975))})`} | ${n === base ? '' : `${wins}/${years.length}`} | ${per(o => mean(o.held)).toFixed(1)} (${[0, 1, 2, 3, 4].map(y => mean(rows.filter(o => o.held.length > y).map(o => o.held[y])).toFixed(1)).join(' ')}) | ${per(o => mean(o.hands)).toFixed(2)} | ${per(o => mean(o.operator)).toFixed(2)} | ${k(per(o => o.wages))} | ${k(per(o => o.rent))} | ${k(per(o => o.land))} | ${k(per(o => o.contracts))} | ${k(per(o => o.penalties))} | ${per(o => o.signed).toFixed(1)} |`)
  }
}
