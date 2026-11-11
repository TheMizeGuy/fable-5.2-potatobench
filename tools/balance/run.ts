// The balance tournament: every bot over every start year and several seeds, five-season campaigns.
// Evaluates verification gates 1 to 4 of docs/DESIGN.md and writes docs/balance/latest.md and latest.json.
// Usage: npm run balance   (env SEEDS=24, WORKERS=n)
import { writeFileSync, mkdirSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import * as S from '../../src/sim/index.ts'
import { ABLATIONS, BLOCK_BOTS, canPlay, lineup, play, type Entry, type Outcome } from './bots.ts'
import { bootstrapMeanCI, mean, median, quantile, rng } from './stats.ts'
import { loadWorld, repoPath } from './world.ts'

interface Task { bot: string; startYear: number; seed: number; goal: number }

interface Done { task: Task; out: Outcome }

async function runAll(tasks: Task[], workers: number): Promise<Done[]> {
  const chunks: Task[][] = []
  for (let i = 0; i < tasks.length; i += 24) chunks.push(tasks.slice(i, i + 24))
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

const key = (o: { bot: string; startYear: number; seed: number }) => `${o.bot}|${o.startYear}|${o.seed}`
const k = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n) / 1000)}k`
const pct = (x: number) => `${Math.round(x * 100)}%`

interface BotSummary {
  bot: string; group: string; campaigns: number; kept: number
  cash: { q1: number; median: number; q3: number }
  netWorth: { q1: number; median: number; q3: number; mean: number }
  yield: number; potatoFields: number
  held: number; hands: number; operator: number          // per season
  wages: number; rent: number; land: number; contracts: number; penalties: number; signed: number   // per campaign
  jobs: Record<string, number>
}

function summarize(e: Entry, rows: Outcome[]): BotSummary {
  const cash = rows.map(r => r.cash), nw = rows.map(r => r.netWorth)
  const jobs: Record<string, number> = {}
  for (const r of rows) for (const [kind, n] of Object.entries(r.jobs)) jobs[kind] = (jobs[kind] ?? 0) + n / rows.length
  for (const j of Object.keys(jobs)) jobs[j] = Math.round(jobs[j] * 10) / 10
  return {
    bot: e.name, group: e.group, campaigns: rows.length,
    kept: rows.filter(r => r.kept).length / rows.length,
    cash: { q1: quantile(cash, 0.25), median: median(cash), q3: quantile(cash, 0.75) },
    netWorth: { q1: quantile(nw, 0.25), median: median(nw), q3: quantile(nw, 0.75), mean: mean(nw) },
    yield: mean(rows.flatMap(r => r.yields)),
    potatoFields: mean(rows.flatMap(r => r.potatoFields)),
    held: mean(rows.flatMap(r => r.held)), hands: mean(rows.flatMap(r => r.hands)), operator: mean(rows.flatMap(r => r.operator)),
    wages: mean(rows.map(r => r.wages)), rent: mean(rows.map(r => r.rent)), land: mean(rows.map(r => r.land)),
    contracts: mean(rows.map(r => r.contracts)), penalties: mean(rows.map(r => r.penalties)), signed: mean(rows.map(r => r.signed)),
    jobs,
  }
}

// Paired comparison a - b over the campaigns both played; the interval resamples whole start years,
// since seeds within a year share its weather.
interface Paired { n: number; mean: number; lo: number; hi: number; aBetter: number; ties: number; keptA: number; keptB: number }

function paired(byKey: Map<string, Outcome>, a: string, b: string, years: number[], seeds: number[]): Paired {
  const perYear: number[][] = []
  let n = 0, better = 0, ties = 0, keptA = 0, keptB = 0
  const all: number[] = []
  for (const y of years) {
    const ds: number[] = []
    for (const s of seeds) {
      const ra = byKey.get(key({ bot: a, startYear: y, seed: s })), rb = byKey.get(key({ bot: b, startYear: y, seed: s }))
      if (!ra || !rb) continue
      const d = ra.netWorth - rb.netWorth
      ds.push(d); all.push(d); n++
      if (d > 0) better++
      if (d === 0) ties++
      if (ra.kept) keptA++
      if (rb.kept) keptB++
    }
    if (ds.length) perYear.push(ds)
  }
  const rand = rng(12345)
  const means: number[] = []
  for (let r = 0; r < 2000; r++) {
    let sum = 0, cnt = 0
    for (let i = 0; i < perYear.length; i++) {
      const ds = perYear[Math.floor(rand() * perYear.length)]
      for (const d of ds) { sum += d; cnt++ }
    }
    means.push(sum / cnt)
  }
  return { n, mean: mean(all), lo: quantile(means, 0.025), hi: quantile(means, 0.975), aBetter: better / n, ties: ties / n, keptA: keptA / n, keptB: keptB / n }
}

interface WinTable { wins: Record<string, number>; eligible: Record<string, number>; years: number; byYear: Record<string, string> }

function winners(scores: Map<number, Map<string, number>>): WinTable {
  const wins: Record<string, number> = {}, eligible: Record<string, number> = {}, byYear: Record<string, string> = {}
  for (const [y, m] of scores) {
    let best = '', bestV = -Infinity
    for (const [name, v] of m) {
      eligible[name] = (eligible[name] ?? 0) + 1
      if (v > bestV) { bestV = v; best = name }
    }
    wins[best] = (wins[best] ?? 0) + 1
    byYear[y] = best
  }
  return { wins, eligible, years: scores.size, byYear }
}

async function main(): Promise<void> {
  const t0 = performance.now()
  const world = loadWorld()
  const years = S.startYears(world)
  const seeds = Array.from({ length: Number(process.env.SEEDS ?? 24) }, (_, i) => i + 1)
  const entries = lineup()
  const workers = Math.max(1, Number(process.env.WORKERS ?? Math.min(16, availableParallelism() - 1)))

  const tasks: Task[] = []
  for (const e of entries) for (const y of years) if (canPlay(e, y)) for (const s of seeds) tasks.push({ bot: e.name, startYear: y, seed: s, goal: S.GOAL_YEARS })
  // One-season runs for the no-dominant-plan gate: each real year on its own.
  const seasonBots = entries.filter(e => e.group === 'variety' || e.group === 'block' || ['expert', 'calendar', 'no-expansion', 'all-contracts'].includes(e.name))
  const seasonTasks: Task[] = []
  for (const e of seasonBots) for (const y of world.weather.playable) if (!e.variety || S.variety(e.variety).released <= y) {
    for (const s of seeds) seasonTasks.push({ bot: e.name, startYear: y, seed: s, goal: 1 })
  }
  const results = await runAll([...tasks, ...seasonTasks], workers)
  const byKey = new Map<string, Outcome>()
  const seasonByKey = new Map<string, Outcome>()
  for (const r of results) (r.task.goal === 1 ? seasonByKey : byKey).set(key(r.task), r.out)

  const rowsOf = (bot: string) => tasks.filter(t => t.bot === bot).map(t => byKey.get(key(t))!).filter(Boolean)
  const summaries = entries.map(e => summarize(e, rowsOf(e.name)))
  const sum = (bot: string) => summaries.find(s => s.bot === bot)!

  // Gate 1: expert > reference > naive on survival and net worth, with the expert keeping at least 90% of farms,
  // the reference 65% to 80% and the naive bot at most 10%.
  const er = paired(byKey, 'expert', 'reference', years, seeds)
  const rn = paired(byKey, 'reference', 'naive', years, seeds)
  const keptOk = sum('expert').kept >= 0.9 && sum('reference').kept >= 0.65 && sum('reference').kept <= 0.8 && sum('naive').kept <= 0.1
  const g1 = sum('expert').kept > sum('reference').kept && sum('reference').kept > sum('naive').kept &&
    er.lo > 0 && rn.lo > 0 && keptOk
  // Gate 2: every ablation is worse than the expert.
  const abl = ABLATIONS.map(a => ({ ...a, p: paired(byKey, 'expert', a.name, years, seeds) }))
  const g2 = abl.every(a => a.p.lo > 0)
  // Gate 3: no single variety and no fixed calendar wins most years.
  const varietyBots = entries.filter(e => e.group === 'variety')
  const campScores = new Map<number, Map<string, number>>()
  for (const y of years) {
    const m = new Map<string, number>()
    for (const e of varietyBots) if (canPlay(e, y)) m.set(e.name, median(seeds.map(s => byKey.get(key({ bot: e.name, startYear: y, seed: s }))!.netWorth)))
    campScores.set(y, m)
  }
  const seasonScores = new Map<number, Map<string, number>>()
  const calSeason = new Map<number, Map<string, number>>()
  for (const y of world.weather.playable) {
    const m = new Map<string, number>()
    for (const e of varietyBots) if (S.variety(e.variety!).released <= y) m.set(e.name, mean(seeds.map(s => seasonByKey.get(key({ bot: e.name, startYear: y, seed: s }))!.netWorth)))
    seasonScores.set(y, m)
    const cm = new Map<string, number>()
    for (const b of ['expert', 'calendar']) cm.set(b, mean(seeds.map(s => seasonByKey.get(key({ bot: b, startYear: y, seed: s }))!.netWorth)))
    calSeason.set(y, cm)
  }
  const campWins = winners(campScores)
  const seasonWins = winners(seasonScores)
  const calCamp = new Map<number, Map<string, number>>()
  for (const y of years) {
    const cm = new Map<string, number>()
    for (const b of ['expert', 'calendar']) cm.set(b, median(seeds.map(s => byKey.get(key({ bot: b, startYear: y, seed: s }))!.netWorth)))
    calCamp.set(y, cm)
  }
  const calCampWins = winners(calCamp)
  const calSeasonWins = winners(calSeason)
  // Head to head by start year (median over seeds) and by single season (mean over seeds): the number of years the
  // first bot comes out ahead of the second.
  const headCamp = (a: string, b: string) => {
    let w = 0
    for (const y of years) if (median(seeds.map(s => byKey.get(key({ bot: a, startYear: y, seed: s }))!.netWorth - byKey.get(key({ bot: b, startYear: y, seed: s }))!.netWorth)) > 0) w++
    return { wins: w, years: years.length }
  }
  const headSeason = (a: string, b: string) => {
    let w = 0
    for (const y of world.weather.playable) if (mean(seeds.map(s => seasonByKey.get(key({ bot: a, startYear: y, seed: s }))!.netWorth - seasonByKey.get(key({ bot: b, startYear: y, seed: s }))!.netWorth)) > 0) w++
    return { wins: w, years: world.weather.playable.length }
  }
  // No block of land is always worth holding and none never: holding it every year beats the home farm alone in
  // BLOCK_LO to BLOCK_HI of the start years, and of the single seasons.
  const BLOCK_LO = 0.2, BLOCK_HI = 0.8
  const blocks = BLOCK_BOTS.map(b => ({ ...b, camp: headCamp(b.name, 'no-expansion'), season: headSeason(b.name, 'no-expansion') }))
  const inBand = (h: { wins: number; years: number }) => h.wins / h.years >= BLOCK_LO && h.wins / h.years <= BLOCK_HI
  const blocksOk = blocks.every(b => inBand(b.camp) && inBand(b.season))
  // Signing every contract offered is not better than choosing: it beats the expert in fewer than half the years.
  const allCamp = headCamp('all-contracts', 'expert'), allSeason = headSeason('all-contracts', 'expert')
  const allOk = allCamp.wins / allCamp.years < 0.5 && allSeason.wins / allSeason.years < 0.5
  const dominant = (w: WinTable) => Object.keys(w.wins).filter(b => (w.eligible[b] ?? 0) >= 5 && w.wins[b] / w.eligible[b] > 0.5)
  const calShare = (w: WinTable) => (w.wins.calendar ?? 0) / w.years
  const domCamp = dominant(campWins), domSeason = dominant(seasonWins)
  // At least four varieties must each be the best plan in some years, over campaigns and over single seasons.
  const MIN_WINNERS = 4
  const winnersOf = (w: WinTable) => Object.keys(w.wins).length
  const g3 = domCamp.length === 0 && domSeason.length === 0 && winnersOf(campWins) >= MIN_WINNERS && winnersOf(seasonWins) >= MIN_WINNERS &&
    calShare(calCampWins) < 0.5 && calShare(calSeasonWins) < 0.5 && blocksOk && allOk
  // Gate 4: the naive bot usually loses the farm and the expert usually keeps it.
  const naiveLost = 1 - sum('naive').kept
  const g4 = naiveLost > 0.5 && sum('expert').kept > 0.5

  const secs = (performance.now() - t0) / 1000
  const gates = [
    { gate: 1, name: 'Skill gradient', pass: g1, detail: `kept: expert ${pct(sum('expert').kept)} > reference ${pct(sum('reference').kept)} > naive ${pct(sum('naive').kept)} (targets: at least 90%, 65% to 80%, at most 10%); net worth expert - reference ${k(er.mean)} (95% CI ${k(er.lo)} to ${k(er.hi)}), reference - naive ${k(rn.mean)} (${k(rn.lo)} to ${k(rn.hi)})` },
    { gate: 2, name: 'Every verb earns its place', pass: g2, detail: abl.map(a => `${a.verb} ${a.p.lo > 0 ? 'earns' : 'does not'} (${k(a.p.mean)}, CI ${k(a.p.lo)} to ${k(a.p.hi)})`).join('; ') },
    { gate: 3, name: 'No dominant plan', pass: g3, detail: `campaigns: ${winText(campWins)}${domCamp.length ? ` (dominant: ${domCamp.join(', ')})` : ''}, ${winnersOf(campWins)} varieties win some years; single seasons: ${winText(seasonWins)}${domSeason.length ? ` (dominant: ${domSeason.join(', ')})` : ''}, ${winnersOf(seasonWins)} varieties win some years (at least ${MIN_WINNERS} needed); fixed calendar beats the expert in ${calCampWins.wins.calendar ?? 0}/${calCampWins.years} start years and ${calSeasonWins.wins.calendar ?? 0}/${calSeasonWins.years} seasons; holding a block every year beats the home farm alone in ${blocks.map(b => `${b.block} ${b.camp.wins}/${b.camp.years} start years and ${b.season.wins}/${b.season.years} seasons${inBand(b.camp) && inBand(b.season) ? '' : ' (outside ' + pct(BLOCK_LO) + ' to ' + pct(BLOCK_HI) + ')'}`).join(', ')}; signing every contract beats choosing in ${allCamp.wins}/${allCamp.years} start years and ${allSeason.wins}/${allSeason.years} seasons` },
    { gate: 4, name: 'Losable and winnable', pass: g4, detail: `naive loses ${pct(naiveLost)} of campaigns; expert keeps ${pct(sum('expert').kept)}` },
  ]

  const blockRows = blocks.map(b => ({ block: b.block, name: b.name, camp: b.camp, season: b.season, p: paired(byKey, b.name, 'no-expansion', years, seeds) }))
  const allP = paired(byKey, 'expert', 'all-contracts', years, seeds)
  const md = report({ years, seeds, summaries, gates, er, rn, abl, campWins, seasonWins, calCampWins, calSeasonWins, campaigns: tasks.length, seasons: seasonTasks.length, blockRows, allCamp, allSeason, allP, band: [BLOCK_LO, BLOCK_HI] })
  mkdirSync(repoPath('docs/balance/'), { recursive: true })
  writeFileSync(repoPath('docs/balance/latest.md'), md)
  const json = {
    setup: { startYears: years, seeds, goalYears: S.GOAL_YEARS, campaigns: tasks.length, seasons: seasonTasks.length },
    gates: gates.map(g => ({ gate: g.gate, name: g.name, pass: g.pass, detail: g.detail })),
    bots: summaries.map(s => ({
      ...s, cash: round(s.cash), netWorth: round(s.netWorth), yield: Math.round(s.yield * 10) / 10, potatoFields: Math.round(s.potatoFields * 100) / 100, kept: Math.round(s.kept * 1000) / 1000,
      held: Math.round(s.held * 100) / 100, hands: Math.round(s.hands * 100) / 100, operator: Math.round(s.operator * 100) / 100,
      wages: Math.round(s.wages), rent: Math.round(s.rent), land: Math.round(s.land), contracts: Math.round(s.contracts), penalties: Math.round(s.penalties), signed: Math.round(s.signed * 10) / 10,
    })),
    paired: { expertVsReference: roundP(er), referenceVsNaive: roundP(rn), ablations: abl.map(a => ({ bot: a.name, verb: a.verb, ...roundP(a.p) })) },
    dominance: { campaigns: campWins, seasons: seasonWins, calendarCampaigns: calCampWins, calendarSeasons: calSeasonWins },
    land: blockRows.map(b => ({ block: b.block, campaigns: b.camp, seasons: b.season, ...roundP(b.p) })),
    contracts: { allCampaigns: allCamp, allSeasons: allSeason, expertMinusAll: roundP(allP) },
    perStartYear: Object.fromEntries(years.map(y => [y, Object.fromEntries(entries.filter(e => canPlay(e, y)).map(e => [e.name, Math.round(median(seeds.map(s => byKey.get(key({ bot: e.name, startYear: y, seed: s }))!.netWorth)))]))])),
  }
  writeFileSync(repoPath('docs/balance/latest.json'), JSON.stringify(json, null, 1) + '\n')
  console.log(gateTable(gates))
  console.log(`\n${tasks.length} campaigns and ${seasonTasks.length} single seasons in ${secs.toFixed(1)} s on ${workers} workers. Wrote docs/balance/latest.md and latest.json.`)
}

function round(o: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(o).map(([a, b]) => [a, Math.round(b)]))
}

function roundP(p: Paired): Record<string, number> {
  return { n: p.n, mean: Math.round(p.mean), lo: Math.round(p.lo), hi: Math.round(p.hi), aBetter: Math.round(p.aBetter * 1000) / 1000, ties: Math.round(p.ties * 1000) / 1000, keptA: Math.round(p.keptA * 1000) / 1000, keptB: Math.round(p.keptB * 1000) / 1000 }
}

function winText(w: WinTable): string {
  return Object.entries(w.wins).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b.replace('only-', '')} ${n}/${w.eligible[b]}`).join(', ')
}

function gateTable(gates: { gate: number; name: string; pass: boolean; detail: string }[]): string {
  const lines = ['| Gate | | Result | Numbers |', '|---|---|---|---|']
  for (const g of gates) lines.push(`| ${g.gate} | ${g.name} | ${g.pass ? 'PASS' : 'FAIL'} | ${g.detail} |`)
  return lines.join('\n')
}

type Head = { wins: number; years: number }

interface ReportIn {
  years: number[]; seeds: number[]; summaries: BotSummary[]
  gates: { gate: number; name: string; pass: boolean; detail: string }[]
  er: Paired; rn: Paired; abl: { name: string; verb: string; p: Paired }[]
  campWins: WinTable; seasonWins: WinTable; calCampWins: WinTable; calSeasonWins: WinTable
  campaigns: number; seasons: number
  blockRows: { block: string; name: string; camp: Head; season: Head; p: Paired }[]
  allCamp: Head; allSeason: Head; allP: Paired; band: [number, number]
}

function report(r: ReportIn): string {
  const L: string[] = []
  L.push('# Balance tournament: latest run', '')
  L.push('Generated by `npm run balance` (tools/balance/run.ts). Do not edit by hand; rerun instead.', '')
  L.push('## Setup', '')
  L.push(`- ${r.years.length} start years (every year whose five seasons are all playable: ${r.years[0]} to ${r.years[r.years.length - 1]}, skipping those that would reach 1996), ${r.seeds.length} seeds each (${r.seeds.join(', ')}), five-season campaigns. ${r.campaigns} campaigns and ${r.seasons} single seasons.`)
  L.push('- Every bot reads the game only as a player can: the functions in `src/sim/view.ts` and `src/sim/advice.ts`, the market quote, the public campaign fields and the events the game reports. `tests/bots.test.ts` checks the bot source for the names of hidden state.')
  L.push('- Net worth is cash plus equipment at half its price and land the farm bought at its price. A farm is kept when it reaches the end of the fifth year without foreclosure. Marketable yield is the cwt per potato acre that came out of the ground graded saleable, before any storage shrink.')
  L.push('- Intervals are 95% bootstrap intervals that resample whole start years (seeds share their year\'s weather), 2000 resamples.', '')
  L.push('## Gates', '', gateTable(r.gates), '')
  L.push('## Bots', '')
  L.push('| Bot | Campaigns | Kept | Final cash, quartiles | Net worth, median (quartiles) | Mean net worth | Marketable yield, cwt/acre | Potato fields | Jobs done per campaign |')
  L.push('|---|---|---|---|---|---|---|---|---|')
  for (const s of r.summaries) {
    const jobs = Object.entries(s.jobs).filter(([, n]) => n > 0).map(([j, n]) => `${j} ${Math.round(n)}`).join(', ')
    L.push(`| ${s.bot} | ${s.campaigns} | ${pct(s.kept)} | ${k(s.cash.q1)} / ${k(s.cash.median)} / ${k(s.cash.q3)} | ${k(s.netWorth.median)} (${k(s.netWorth.q1)} to ${k(s.netWorth.q3)}) | ${k(s.netWorth.mean)} | ${s.yield.toFixed(0)} | ${s.potatoFields.toFixed(1)} | ${jobs} |`)
  }
  L.push('', '### The bigger farm', '')
  L.push('Per season: fields held, the most field hands on the crew at once, and the share of seasons with the tractor operator. Per campaign: wages, rent, land bought, money from contracts, penalties, and contracts signed.', '')
  L.push('| Bot | Fields held | Hands | Operator | Wages | Rent | Land bought | Contract sales | Penalties | Contracts signed |', '|---|---|---|---|---|---|---|---|---|---|')
  for (const s of r.summaries) L.push(`| ${s.bot} | ${s.held.toFixed(1)} | ${s.hands.toFixed(2)} | ${pct(s.operator)} | ${k(s.wages)} | ${k(s.rent)} | ${k(s.land)} | ${k(s.contracts)} | ${k(s.penalties)} | ${s.signed.toFixed(1)} |`)
  L.push('', '## Gate 1 and 4: the skill gradient', '')
  L.push('| Comparison | Pairs | Mean net-worth difference | 95% interval | First better | Kept, first / second |', '|---|---|---|---|---|---|')
  L.push(`| expert - reference | ${r.er.n} | ${k(r.er.mean)} | ${k(r.er.lo)} to ${k(r.er.hi)} | ${pct(r.er.aBetter)} | ${pct(r.er.keptA)} / ${pct(r.er.keptB)} |`)
  L.push(`| reference - naive | ${r.rn.n} | ${k(r.rn.mean)} | ${k(r.rn.lo)} to ${k(r.rn.hi)} | ${pct(r.rn.aBetter)} | ${pct(r.rn.keptA)} / ${pct(r.rn.keptB)} |`)
  L.push('', '## Gate 2: each verb removed from the expert', '')
  L.push('A verb earns its place when the expert beats the bot without it and the interval on the mean difference lies above zero.', '')
  L.push('| Ablation | Verb removed | Expert minus ablation, mean | 95% interval | Expert better | Same result | Kept, expert / ablation | Earns its place |', '|---|---|---|---|---|---|---|---|')
  for (const a of r.abl) L.push(`| ${a.name} | ${a.verb} | ${k(a.p.mean)} | ${k(a.p.lo)} to ${k(a.p.hi)} | ${pct(a.p.aBetter)} | ${pct(a.p.ties)} | ${pct(a.p.keptA)} / ${pct(a.p.keptB)} | ${a.p.lo > 0 ? 'yes' : 'no'} |`)
  L.push('', '## Gate 3: dominant plans', '')
  L.push('Each single-variety bot is the expert with every potato field in one variety. A variety competes only in years it had been released by. A plan dominates when it wins more than half of the years it could play (at least five of them). The gate also asks that at least four varieties win some years, over campaigns and over single seasons. The calendar bot is the expert held to the same dates every year; it must lose to the expert in most years.', '')
  L.push('| Plan | Wins over five-season campaigns (by start year) | Wins over single seasons |', '|---|---|---|')
  const names = new Set([...Object.keys(r.campWins.eligible), ...Object.keys(r.seasonWins.eligible)])
  for (const n of names) L.push(`| ${n.replace('only-', '')} | ${r.campWins.wins[n] ?? 0} of ${r.campWins.eligible[n] ?? 0} | ${r.seasonWins.wins[n] ?? 0} of ${r.seasonWins.eligible[n] ?? 0} |`)
  L.push(`| fixed calendar against the expert | ${r.calCampWins.wins.calendar ?? 0} of ${r.calCampWins.years} | ${r.calSeasonWins.wins.calendar ?? 0} of ${r.calSeasonWins.years} |`)
  L.push('', 'Best single variety by start year: ' + Object.entries(r.campWins.byYear).map(([y, b]) => `${y} ${b.replace('only-', '')}`).join(', ') + '.', '')
  L.push('### Land', '')
  L.push(`Each block bot is the expert holding the home farm and that block every year, rented or bought as the expert would, against the expert on the home farm alone (no-expansion). No block is always worth holding and none never: holding it must come out ahead in ${pct(r.band[0])} to ${pct(r.band[1])} of the start years and of the single seasons.`, '')
  L.push('| Block | Ahead in start years | Ahead in single seasons | Mean net-worth difference | 95% interval |', '|---|---|---|---|---|')
  for (const b of r.blockRows) L.push(`| ${b.block} | ${b.camp.wins} of ${b.camp.years} | ${b.season.wins} of ${b.season.years} | ${k(b.p.mean)} | ${k(b.p.lo)} to ${k(b.p.hi)} |`)
  L.push('', '### Contracts', '')
  L.push(`Signing every contract offered (all-contracts, planting to fill them) against the expert, who chooses: all-contracts comes out ahead in ${r.allCamp.wins} of ${r.allCamp.years} start years and ${r.allSeason.wins} of ${r.allSeason.years} single seasons; the expert leads it by ${k(r.allP.mean)} (${k(r.allP.lo)} to ${k(r.allP.hi)}). It must come out ahead in fewer than half.`, '')
  return L.join('\n') + '\n'
}

if (!isMainThread) {
  const world = loadWorld()
  const bots = new Map(lineup().map(e => [e.name, e]))
  parentPort!.on('message', (tasks: Task[]) => {
    parentPort!.postMessage(tasks.map(t => ({ task: t, out: play(world, t.bot, bots.get(t.bot)!.make, t.startYear, t.seed, t.goal) })))
  })
} else {
  await main()
}
