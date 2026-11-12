// The balance tournament: every bot on farms with seasons of their own (one generated world per seed, as the shipped
// game makes them), ten-season campaigns, and a smaller run of the main bots on the record's real years. Judges the
// gates of docs/balance/README.md and writes docs/balance/latest.md and latest.json.
// Usage: npm run balance   (env SEEDS=100, YEARS=10, RECORD_SEEDS=6, WORKERS=n)
import { writeFileSync, mkdirSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import * as S from '../../src/sim/index.ts'
import { ABLATIONS, BLOCK_BOTS, HIRES, ORDERS, SPEND, TALLY, lineup, play, type Entry, type Outcome, type SpendKey, type TallyKey } from './bots.ts'
import { mean, median, quantile, rng } from './stats.ts'
import { loadWorld, repoPath } from './world.ts'

interface Task { bot: string; seed: number; startYear: number; goal: number; record: boolean }
interface Done { task: Task; out: Outcome }

const YEARS = Number(process.env.YEARS ?? 10)
const FARM_START = S.FARM_YEAR0 + 1

async function runAll(tasks: Task[], workers: number): Promise<Done[]> {
  const chunks: Task[][] = []
  for (let i = 0; i < tasks.length; i += 6) chunks.push(tasks.slice(i, i + 6))
  const out: Done[] = []
  let next = 0
  await Promise.all(Array.from({ length: workers }, () => new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url))
    const feed = () => {
      if (next >= chunks.length) { void w.terminate().then(() => resolve()); return }
      w.postMessage(chunks[next++])
    }
    w.on('message', (rs: Done[]) => { out.push(...rs); feed() })
    w.on('error', reject)
    feed()
  })))
  return out
}

const key = (bot: string, seed: number, startYear = FARM_START) => `${bot}|${startYear}|${seed}`
const k = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n) / 1000)}k`
const k1 = (n: number) => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
const pct = (x: number) => `${Math.round(x * 100)}%`

// Paired comparison a - b on the same farms; the interval resamples farms (each seed is its own weather).
interface Paired { n: number; mean: number; lo: number; hi: number; aBetter: number; keptA: number; keptB: number; kept5A: number; kept5B: number }

function paired(byKey: Map<string, Outcome>, a: string, b: string, seeds: number[]): Paired {
  const ds: number[] = []
  let better = 0, keptA = 0, keptB = 0, k5a = 0, k5b = 0
  for (const s of seeds) {
    const ra = byKey.get(key(a, s)), rb = byKey.get(key(b, s))
    if (!ra || !rb) continue
    const d = ra.netWorth - rb.netWorth
    ds.push(d)
    if (d > 0) better++
    if (ra.kept) keptA++
    if (rb.kept) keptB++
    if (ra.kept5) k5a++
    if (rb.kept5) k5b++
  }
  const rand = rng(12345)
  const means: number[] = []
  for (let r = 0; r < 2000; r++) {
    let sum = 0
    for (let i = 0; i < ds.length; i++) sum += ds[Math.floor(rand() * ds.length)]
    means.push(sum / ds.length)
  }
  const n = ds.length
  return { n, mean: mean(ds), lo: quantile(means, 0.025), hi: quantile(means, 0.975), aBetter: better / n, keptA: keptA / n, keptB: keptB / n, kept5A: k5a / n, kept5B: k5b / n }
}

// Of a family of fixed plans, which one does best on each farm.
function winners(byKey: Map<string, Outcome>, bots: string[], seeds: number[]): Record<string, number> {
  const wins: Record<string, number> = Object.fromEntries(bots.map(b => [b, 0]))
  for (const s of seeds) {
    let best = '', v = -Infinity
    for (const b of bots) { const o = byKey.get(key(b, s)); if (o && o.netWorth > v) { v = o.netWorth; best = b } }
    if (best) wins[best]++
  }
  return wins
}

interface BotSummary {
  bot: string; group: string; campaigns: number; kept: number; kept5: number; kept1: number; revenue1: number
  netWorth: { q1: number; median: number; q3: number; mean: number }
  worth: number[]                 // median net worth at each year end, over farms still going
  yield: number; potatoFields: number; held: number; hands: number
  spend: Record<SpendKey, number> // per campaign
  tally: Record<TallyKey, number> // per campaign
  jobs: Record<string, number>
  buildings: Record<string, number>   // share of campaigns ending with it standing
  upgrades: Record<string, number>
}

function summarize(e: Entry, rows: Outcome[]): BotSummary {
  const nw = rows.map(r => r.netWorth)
  const jobs: Record<string, number> = {}
  for (const r of rows) for (const [kind, n] of Object.entries(r.jobs)) jobs[kind] = (jobs[kind] ?? 0) + n / rows.length
  const share = (pick: (r: Outcome) => string[]) => {
    const m: Record<string, number> = {}
    for (const r of rows) for (const x of pick(r)) m[x] = (m[x] ?? 0) + 1 / rows.length
    return m
  }
  const worth: number[] = []
  for (let y = 0; y < YEARS; y++) {
    const at = rows.filter(r => r.worth.length > y).map(r => r.worth[y])
    worth.push(at.length ? median(at) : NaN)
  }
  return {
    bot: e.name, group: e.group, campaigns: rows.length,
    kept: rows.filter(r => r.kept).length / rows.length, kept5: rows.filter(r => r.kept5).length / rows.length,
    kept1: rows.filter(r => r.years > 1 || r.kept).length / rows.length, revenue1: mean(rows.map(r => r.revenue[0] ?? 0)),
    netWorth: { q1: quantile(nw, 0.25), median: median(nw), q3: quantile(nw, 0.75), mean: mean(nw) },
    worth,
    yield: mean(rows.flatMap(r => r.yields)), potatoFields: mean(rows.flatMap(r => r.potatoFields)),
    held: mean(rows.flatMap(r => r.held)), hands: mean(rows.flatMap(r => r.hands)),
    spend: Object.fromEntries(SPEND.map(s => [s, mean(rows.map(r => r.spend[s].reduce((a, x) => a + x, 0)))])) as Record<SpendKey, number>,
    tally: Object.fromEntries(TALLY.map(t => [t, mean(rows.map(r => r.tally[t]))])) as Record<TallyKey, number>,
    jobs, buildings: share(r => r.buildings), upgrades: share(r => r.upgrades),
  }
}

async function main(): Promise<void> {
  const t0 = performance.now()
  const record = loadWorld()
  const seeds = Array.from({ length: Number(process.env.SEEDS ?? 100) }, (_, i) => i + 1)
  const recSeeds = Array.from({ length: Number(process.env.RECORD_SEEDS ?? 6) }, (_, i) => i + 1)
  const recYears = S.startYears(record)
  const entries = lineup(YEARS)
  const workers = Math.max(1, Number(process.env.WORKERS ?? Math.min(16, availableParallelism() - 1)))

  const tasks: Task[] = []
  for (const s of seeds) for (const e of entries) tasks.push({ bot: e.name, seed: s, startYear: FARM_START, goal: YEARS, record: false })
  const recTasks: Task[] = []
  for (const b of ['naive', 'reference', 'expert']) for (const y of recYears) for (const s of recSeeds) recTasks.push({ bot: b, seed: s, startYear: y, goal: S.GOAL_YEARS, record: true })
  const results = await runAll([...tasks, ...recTasks], workers)
  const byKey = new Map<string, Outcome>()
  const recByKey = new Map<string, Outcome>()
  for (const r of results) (r.task.record ? recByKey : byKey).set(key(r.task.bot, r.task.seed, r.task.startYear), r.out)

  const rowsOf = (bot: string) => seeds.map(s => byKey.get(key(bot, s))!).filter(Boolean)
  const summaries = entries.map(e => summarize(e, rowsOf(e.name)))
  const sum = (bot: string) => summaries.find(s => s.bot === bot)!

  // G1: the naive bot fails and the reference keeps the farm about two times in three over the game's five seasons.
  const er = paired(byKey, 'expert', 'reference', seeds)
  const rn = paired(byKey, 'reference', 'naive', seeds)
  const g1 = sum('naive').kept5 <= 0.1 && sum('reference').kept5 >= 0.6 && sum('reference').kept5 <= 0.8 && er.lo > 0 && rn.lo > 0

  // G2: every mechanic earns its place (using it beats not using it, interval above zero).
  const abl = ABLATIONS.map(a => {
    const user = a.uses === 'variant' ? a.name : 'expert', other = a.uses === 'variant' ? 'expert' : a.name
    const p = paired(byKey, user, other, seeds)
    const su = sum(user), so = sum(other)
    const costs = SPEND.map(sp => ({ sp, d: su.spend[sp] - so.spend[sp] })).filter(x => x.d > 50 && !['logs', 'stand'].includes(x.sp)).sort((x, y) => y.d - x.d).slice(0, 3)
    const tallies = TALLY.map(t => ({ t, d: su.tally[t] - so.tally[t] })).filter(x => Math.abs(x.d) >= 0.05).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3)
    return { ...a, user, other, p, costs, tallies, verdict: p.lo > 0 ? 'earns' : p.hi < 0 ? 'trap' : 'unproven' }
  })
  const gated = abl.filter(a => a.group !== 'verb')
  const g2 = gated.every(a => a.verdict === 'earns')

  // G3: no fixed plan that is always right. A building order or a hiring rule dominates when it does best on more
  // than half the farms; a block of land must beat the home farm alone on 20% to 80% of them; and no farm rule or
  // building is worth having on 90% or more of the farms.
  const orderBots = ['expert', ...ORDERS.map(o => o.name)]
  const hireBots = ['expert', 'no-applicants', ...HIRES.map(h => h.name)]
  const orderWins = winners(byKey, orderBots, seeds), hireWins = winners(byKey, hireBots, seeds)
  const dominant = (w: Record<string, number>) => Object.entries(w).filter(([, n]) => n / seeds.length > 0.5).map(([b]) => b)
  const blocks = BLOCK_BOTS.map(b => ({ ...b, p: paired(byKey, b.name, 'no-expansion', seeds) }))
  const blocksOk = blocks.every(b => b.p.aBetter >= 0.2 && b.p.aBetter <= 0.8)
  // Winter work is the whole winter's labour, not a rule; land and hiring at all are the bigger farm itself.
  const always = gated.filter(a => a.group === 'farmstead' && a.name !== 'no-winter' && a.p.aBetter >= 0.9).map(a => a.name)
  const varietyBots = entries.filter(e => e.group === 'variety').map(e => e.name)
  const varietyWins = winners(byKey, varietyBots, seeds)
  const allP = paired(byKey, 'all-contracts', 'expert', seeds)
  const calP = paired(byKey, 'calendar', 'expert', seeds)
  const g3 = !dominant(orderWins).length && !dominant(hireWins).filter(b => b !== 'expert').length && blocksOk && always.length === 0

  // G4: the expert's farm keeps growing to year ten, and its cash does not pile up unused.
  const ew = sum('expert').worth
  const expertRows = rowsOf('expert')
  const byYear = (pick: (o: Outcome, y: number) => number) => Array.from({ length: YEARS }, (_, y) => mean(expertRows.filter(o => o.worth.length > y).map(o => pick(o, y))))
  const invest = byYear((o, y) => o.spend.land[y] + o.spend.building[y] + o.spend.equipment[y] + o.spend.works[y])
  const growing = ew.slice(1).every((w, y) => w > ew[y])
  const lateInvest = invest.slice(5).filter(x => x > 2000).length
  const cash10 = median(expertRows.filter(o => o.kept).map(o => o.cash))
  const idle = cash10 > 0.5 * ew[YEARS - 1]
  const g4 = growing && lateInvest >= 3 && !idle
  const lines: Record<string, number[]> = {
    'net worth': byYear((o, y) => o.worth[y]), 'cash at year end': byYear((o, y) => o.cashBy[y]), 'revenue': byYear((o, y) => o.revenue[y]),
    'investment (land down, buildings, equipment, contractors)': invest,
  }
  for (const sp of SPEND) lines[sp] = byYear((o, y) => o.spend[sp][y])
  lines['fields held'] = byYear((o, y) => o.held[y])
  lines['potato fields'] = byYear((o, y) => o.potatoFields[y] ?? 0)
  lines['hired people'] = byYear((o, y) => o.hands[y])

  // The record's years: the main bots over every start year, five seasons.
  const recSum = ['naive', 'reference', 'expert'].map(b => {
    const rows = recYears.flatMap(y => recSeeds.map(s => recByKey.get(key(b, s, y))!)).filter(Boolean)
    return { bot: b, n: rows.length, kept: rows.filter(r => r.kept).length / rows.length, nw: median(rows.map(r => r.netWorth)), mean: mean(rows.map(r => r.netWorth)) }
  })

  const secs = (performance.now() - t0) / 1000
  const gates = [
    { gate: 'G1', name: 'The first-time player\'s game', pass: g1, detail: `kept after five seasons: naive ${pct(sum('naive').kept5)} (at most 10%), reference ${pct(sum('reference').kept5)} (60% to 80%), expert ${pct(sum('expert').kept5)}; after ten: naive ${pct(sum('naive').kept)}, reference ${pct(sum('reference').kept)}, expert ${pct(sum('expert').kept)}. Ten-year net worth expert - reference ${k(er.mean)} (${k(er.lo)} to ${k(er.hi)}), reference - naive ${k(rn.mean)} (${k(rn.lo)} to ${k(rn.hi)})` },
    { gate: 'G2', name: 'Every mechanic earns its place', pass: g2, detail: `${gated.filter(a => a.verdict === 'earns').length} of ${gated.length} earn; traps: ${gated.filter(a => a.verdict === 'trap').map(a => a.name).join(', ') || 'none'}; unproven: ${gated.filter(a => a.verdict === 'unproven').map(a => a.name).join(', ') || 'none'}` },
    { gate: 'G3', name: 'No dominant plan', pass: g3, detail: `building orders: ${Object.entries(orderWins).map(([b, n]) => `${b} ${n}`).join(', ')}; hiring: ${Object.entries(hireWins).map(([b, n]) => `${b} ${n}`).join(', ')} (of ${seeds.length} farms, dominant above half); blocks beat the home farm alone on ${blocks.map(b => `${b.block} ${pct(b.p.aBetter)}`).join(', ')} of farms (20% to 80%); worth having on 90% of farms or more: ${always.join(', ') || 'none'}` },
    { gate: 'G4', name: 'The long game holds', pass: g4, detail: `expert median net worth by year ${ew.map(w => k(w)).join(', ')}${growing ? '' : ' (not rising every year)'}; investment by year ${invest.map(x => k(x)).join(', ')} (${lateInvest} of years 6 to 10 over $2k); median cash at year ten ${k(cash10)}${idle ? ', more than half of net worth' : ''}` },
  ]

  const md = report({ seeds, recSeeds, recYears, summaries, gates, er, rn, abl, orderWins, hireWins, blocks, varietyWins, allP, calP, invest, lines, recSum, campaigns: tasks.length, recCampaigns: recTasks.length, secs, workers })
  mkdirSync(repoPath('docs/balance/'), { recursive: true })
  writeFileSync(repoPath('docs/balance/latest.md'), md)
  const r0 = (x: number) => Math.round(x)
  const json = {
    setup: { seeds: seeds.length, years: YEARS, campaigns: tasks.length, recordStartYears: recYears, recordSeeds: recSeeds.length },
    gates,
    bots: summaries.map(s => ({ ...s, netWorth: { q1: r0(s.netWorth.q1), median: r0(s.netWorth.median), q3: r0(s.netWorth.q3), mean: r0(s.netWorth.mean) }, worth: s.worth.map(r0) })),
    paired: { expertVsReference: er, referenceVsNaive: rn },
    ablations: abl.map(a => ({ name: a.name, mechanic: a.mechanic, group: a.group, user: a.user, verdict: a.verdict, ...a.p, costs: a.costs, tallies: a.tallies })),
    dominance: { orders: orderWins, hires: hireWins, varieties: varietyWins, blocks: blocks.map(b => ({ block: b.block, ...b.p })), allContracts: allP, calendar: calP },
    expertByYear: lines,
    record: recSum,
  }
  writeFileSync(repoPath('docs/balance/latest.json'), JSON.stringify(json, null, 1) + '\n')
  console.log(gateTable(gates))
  console.log('\n' + ablationTable(abl))
  console.log(`\n${tasks.length} ten-season campaigns and ${recTasks.length} record campaigns in ${secs.toFixed(0)} s on ${workers} workers. Wrote docs/balance/latest.md and latest.json.`)
}

function gateTable(gates: { gate: string; name: string; pass: boolean; detail: string }[]): string {
  const lines = ['| Gate | | Result | Numbers |', '|---|---|---|---|']
  for (const g of gates) lines.push(`| ${g.gate} | ${g.name} | ${g.pass ? 'PASS' : 'FAIL'} | ${g.detail} |`)
  return lines.join('\n')
}

type Abl = { name: string; mechanic: string; group: string; user: string; other: string; p: Paired; costs: { sp: string; d: number }[]; tallies: { t: string; d: number }[]; verdict: string }

function ablationTable(abl: Abl[]): string {
  const lines = ['| Mechanic | Compared | Using it minus not, ten-year net worth | 95% interval | Farms where it is ahead | Kept 10 yr, using / not | Kept 5 yr, using / not | Verdict | Its catch: costs higher when used (per campaign) | Tallies, using minus not |',
    '|---|---|---|---|---|---|---|---|---|---|']
  for (const a of abl) {
    lines.push(`| ${a.mechanic} | ${a.user} vs ${a.other} | ${k1(a.p.mean)} | ${k1(a.p.lo)} to ${k1(a.p.hi)} | ${pct(a.p.aBetter)} | ${pct(a.p.keptA)} / ${pct(a.p.keptB)} | ${pct(a.p.kept5A)} / ${pct(a.p.kept5B)} | ${a.verdict} | ${a.costs.map(x => `${x.sp} ${k1(x.d)}`).join(', ') || '-'} | ${a.tallies.map(x => `${x.t} ${x.d > 0 ? '+' : ''}${x.d.toFixed(1)}`).join(', ') || '-'} |`)
  }
  return lines.join('\n')
}

interface ReportIn {
  seeds: number[]; recSeeds: number[]; recYears: number[]; summaries: BotSummary[]
  gates: { gate: string; name: string; pass: boolean; detail: string }[]
  er: Paired; rn: Paired; abl: Abl[]
  orderWins: Record<string, number>; hireWins: Record<string, number>; blocks: { block: string; name: string; p: Paired }[]
  varietyWins: Record<string, number>; allP: Paired; calP: Paired; invest: number[]; lines: Record<string, number[]>
  recSum: { bot: string; n: number; kept: number; nw: number; mean: number }[]
  campaigns: number; recCampaigns: number; secs: number; workers: number
}

function report(r: ReportIn): string {
  const L: string[] = []
  const sum = (b: string) => r.summaries.find(s => s.bot === b)!
  L.push('# Balance tournament: latest run', '')
  L.push('Generated by `npm run balance` (tools/balance/run.ts). Do not edit by hand; rerun instead.', '')
  L.push('## Setup', '')
  L.push(`- ${r.seeds.length} farms, each with seasons of its own made from its seed as the shipped game makes them (src/sim/climate.ts), every bot on every farm, ${YEARS}-season campaigns from Year 1: ${r.campaigns} campaigns. A smaller run plays the main bots over the record's ${r.recYears.length} real start years (${r.recYears[0]} to ${r.recYears[r.recYears.length - 1]}), ${r.recSeeds.length} seeds, five seasons: ${r.recCampaigns} campaigns.`)
  L.push('- Every bot reads the game only as a player can: the functions in `src/sim/view.ts` and `src/sim/advice.ts`, the market quote, the public campaign fields and the events the game reports. `tests/bots.test.ts` checks the bot source for the names of hidden state.')
  L.push('- Net worth is cash plus equipment at half its price and land the farm bought at its price, less what is owed on the land mortgage. A farm is kept when it reaches the end of the campaign without foreclosure; "kept 5 yr" is the game\'s own goal, five seasons.')
  L.push('- Intervals are 95% bootstrap intervals over farms (each seed is its own weather and prices), 2000 resamples.', '')
  L.push(`Run time ${r.secs.toFixed(0)} s on ${r.workers} worker threads.`, '')
  L.push('## Gates', '', gateTable(r.gates), '')
  L.push('## Bots', '')
  L.push('| Bot | Kept 5 yr | Kept 10 yr | Net worth, median (quartiles) | Mean net worth | Yield, cwt/acre | Potato fields | Fields held | Hired | Wages | Building | Land down + mortgage | Equipment |')
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const s of r.summaries) {
    L.push(`| ${s.bot} | ${pct(s.kept5)} | ${pct(s.kept)} | ${k(s.netWorth.median)} (${k(s.netWorth.q1)} to ${k(s.netWorth.q3)}) | ${k(s.netWorth.mean)} | ${s.yield.toFixed(0)} | ${s.potatoFields.toFixed(1)} | ${s.held.toFixed(1)} | ${s.hands.toFixed(1)} | ${k(s.spend.wages)} | ${k(s.spend.building)} | ${k(s.spend.land + s.spend.mortgage)} | ${k(s.spend.equipment)} |`)
  }
  L.push('', '### The routine: an untended farm, a player who answers only the calls, and the reference', '')
  L.push('Each with the routine on (the game as it is) and off (the game before it: nothing is ordered by itself). Year one is the first season\'s revenue and whether the farm saw the second spring.', '')
  L.push('| Player | Routine | Kept 1 yr | Kept 5 yr | Kept 10 yr | Year-one revenue | Ten-year net worth, median | Mean |', '|---|---|---|---|---|---|---|---|')
  for (const [name, label, on] of [['untended', 'untended', 'on'], ['untended-before', 'untended', 'off'], ['calls-only', 'calls only', 'on'], ['calls-before', 'calls only', 'off'], ['reference', 'reference', 'on'], ['reference-before', 'reference', 'off']] as const) {
    const s = r.summaries.find(x => x.bot === name)
    if (s) L.push(`| ${label} | ${on} | ${pct(s.kept1)} | ${pct(s.kept5)} | ${pct(s.kept)} | ${k(s.revenue1)} | ${k(s.netWorth.median)} | ${k(s.netWorth.mean)} |`)
  }
  L.push('', '### Net worth by year, median over farms still going', '')
  L.push(`| Bot | ${Array.from({ length: YEARS }, (_, y) => `Year ${y + 1}`).join(' | ')} |`, `|---|${'---|'.repeat(YEARS)}`)
  for (const b of ['naive', 'reference', 'expert']) L.push(`| ${b} | ${sum(b).worth.map(w => Number.isFinite(w) ? k(w) : '-').join(' | ')} |`)
  L.push('', '## G1: the skill gradient', '')
  L.push('| Comparison | Farms | Mean ten-year net-worth difference | 95% interval | First better | Kept 10 yr, first / second | Kept 5 yr, first / second |', '|---|---|---|---|---|---|---|')
  L.push(`| expert - reference | ${r.er.n} | ${k(r.er.mean)} | ${k(r.er.lo)} to ${k(r.er.hi)} | ${pct(r.er.aBetter)} | ${pct(r.er.keptA)} / ${pct(r.er.keptB)} | ${pct(r.er.kept5A)} / ${pct(r.er.kept5B)} |`)
  L.push(`| reference - naive | ${r.rn.n} | ${k(r.rn.mean)} | ${k(r.rn.lo)} to ${k(r.rn.hi)} | ${pct(r.rn.aBetter)} | ${pct(r.rn.keptA)} / ${pct(r.rn.keptB)} | ${pct(r.rn.kept5A)} / ${pct(r.rn.kept5B)} |`)
  L.push('', '## G2: each mechanic, used and not used', '')
  L.push('Each row compares the expert using the mechanic as well as it can with the same expert without it (for a mechanic the expert does not use, the expert with it against the expert). It earns its place when the interval lies above zero, and is a trap when it lies below. The last two columns are where its catch shows: the cost lines that are higher when it is used, and the counts that change.', '')
  L.push(ablationTable(r.abl), '')
  L.push('## G3: dominant plans', '')
  L.push(`Building orders (the expert's own and four fixed ones), best on how many of the ${r.seeds.length} farms: ${Object.entries(r.orderWins).map(([b, n]) => `${b} ${n}`).join(', ')}.`, '')
  L.push(`Hiring (the expert's fit for each opening, the hiring hall only, always the best at machine work, always the best at field work, always the cheapest): ${Object.entries(r.hireWins).map(([b, n]) => `${b} ${n}`).join(', ')}.`, '')
  L.push('| Block held every year | Ahead of the home farm alone | Mean difference | 95% interval |', '|---|---|---|---|')
  for (const b of r.blocks) L.push(`| ${b.block} | ${pct(b.p.aBetter)} | ${k(b.p.mean)} | ${k(b.p.lo)} to ${k(b.p.hi)} |`)
  L.push('', `Single-variety experts, best on how many farms: ${Object.entries(r.varietyWins).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b.replace('only-', '')} ${n}`).join(', ')}.`, '')
  L.push(`Signing every contract against choosing: ahead on ${pct(r.allP.aBetter)} of farms, ${k(r.allP.mean)} (${k(r.allP.lo)} to ${k(r.allP.hi)}). The fixed calendar against the expert: ahead on ${pct(r.calP.aBetter)}, ${k(r.calP.mean)} (${k(r.calP.lo)} to ${k(r.calP.hi)}).`, '')
  L.push('## G4: the expert\'s farm by year', '')
  L.push('Mean over the farms still going, per year: what the expert spends and earns on the farmstead.', '')
  L.push(`| Line | ${Array.from({ length: YEARS }, (_, y) => `Y${y + 1}`).join(' | ')} |`, `|---|${'---|'.repeat(YEARS)}`)
  const count = new Set(['fields held', 'potato fields', 'hired people'])
  for (const [name, xs] of Object.entries(r.lines)) L.push(`| ${name} | ${xs.map(x => count.has(name) ? x.toFixed(1) : k1(x)).join(' | ')} |`)
  L.push('')
  L.push('## The record\'s years', '')
  L.push('| Bot | Campaigns | Kept 5 yr | Median net worth | Mean net worth |', '|---|---|---|---|---|')
  for (const x of r.recSum) L.push(`| ${x.bot} | ${x.n} | ${pct(x.kept)} | ${k(x.nw)} | ${k(x.mean)} |`)
  L.push('')
  return L.join('\n')
}

if (!isMainThread) {
  const record = loadWorld()
  const worlds = new Map<number, S.World>()
  const bots = new Map(lineup(YEARS).map(e => [e.name, e]))
  const recBots = new Map(lineup(S.GOAL_YEARS).filter(e => e.group === 'main').map(e => [e.name, e]))
  parentPort!.on('message', (tasks: Task[]) => {
    parentPort!.postMessage(tasks.map(t => {
      if (t.record) return { task: t, out: play(record, t.bot, recBots.get(t.bot)!.make, t.startYear, t.seed, t.goal) }
      let w = worlds.get(t.seed)
      if (!w) { w = S.climateWorld(record, t.seed); worlds.set(t.seed, w); if (worlds.size > 40) worlds.delete(worlds.keys().next().value!) }
      return { task: t, out: play(w, t.bot, bots.get(t.bot)!.make, t.startYear, t.seed, t.goal) }
    }))
  })
} else {
  await main()
}

