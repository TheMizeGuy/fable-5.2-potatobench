// The model against the outside record: yields against USDA's Maine series, the blight forecast against the
// documented epidemic years, and reference dates against the usual Maine calendar.
// Writes docs/verification/model-vs-record.md. Usage: npm run validate   (env SEEDS=8)
import { mkdirSync, writeFileSync } from 'node:fs'
import * as S from '../../src/sim/index.ts'
import { play, reference, type BotFactory } from '../balance/bots.ts'
import { mean, median, olsFit, pearson, permutationP, quantile, sd, spearman, theilSen } from '../balance/stats.ts'
import { loadWorld, repoPath } from '../balance/world.ts'

const world = loadWorld()
const years = world.weather.playable
const seeds = Array.from({ length: Number(process.env.SEEDS ?? 8) }, (_, i) => i + 1)
const qa = (world.weather as unknown as { qa: Record<string, { sev: number }> }).qa

interface Season {
  yield: number
  sv: number
  peak: number            // the season's peak blight share, from the year-end ledger
  sprays: number
  plant: number[]; emerge: number[]; kill: number[]; dig: number[]   // day of year, potato fields
}

function season(make: BotFactory, year: number, seed: number): Season {
  const out: Season = { yield: 0, sv: 0, peak: 0, sprays: 0, plant: [], emerge: [], kill: [], dig: [] }
  const r = play(world, 'validate', make, year, seed, 1, (c, events) => {
    out.sv = c.season!.sv
    for (const e of events) {
      if (e.type === 'planted') out.plant.push(e.day)
      else if (e.type === 'emerged') out.emerge.push(e.day)
      else if (e.type === 'killed') out.kill.push(e.day)
      else if (e.type === 'dug') out.dig.push(e.day)
      else if (e.type === 'sprayed') out.sprays++
    }
  })
  out.yield = r.yields[0] ?? 0
  out.peak = r.blightPeak[0] ?? 0
  return out
}

function runAll(make: BotFactory): Map<number, Season[]> {
  const m = new Map<number, Season[]>()
  for (const y of years) m.set(y, seeds.map(s => season(make, y, s)))
  return m
}

const t0 = performance.now()
const ref = runAll(reference())
const bare = runAll(reference(4, ['spray', 'rogue', 'kill']))
const refPeak = ref
const dry = runAll(reference(4, ['water']))
const wet = runAll(reference(4, [], 0.6))

// ------------------------------------------------------------ yield
const rec = (y: number) => world.records[String(y)]?.yieldCwtAcre ?? NaN
const ys = years.filter(y => Number.isFinite(rec(y)))
const model = ys.map(y => mean(ref.get(y)!.map(s => s.yield)))
const modelSd = ys.map(y => sd(ref.get(y)!.map(s => s.yield)))
const record = ys.map(rec)
const ols = olsFit(ys, record)
const ts = theilSen(ys, record)
const residOls = record.map((v, i) => v - (ols.a + ols.b * ys[i]))
const residTs = record.map((v, i) => v - (ts.a + ts.b * ys[i]))
const mOls = olsFit(ys, model)
const modelResid = model.map((v, i) => v - (mOls.a + mOls.b * ys[i]))
const dryModel = ys.map(y => mean(dry.get(y)!.map(s => s.yield)))

interface Corr { name: string; r: number; pr: number; rho: number; prho: number }
function corr(name: string, a: number[], b: number[]): Corr {
  return { name, r: pearson(a, b), pr: permutationP(a, b, pearson, 10000, 11), rho: spearman(a, b), prho: permutationP(a, b, spearman, 10000, 13) }
}
const corrs = [
  corr('Model against the raw record', model, record),
  corr('Model against the record detrended by least squares', model, residOls),
  corr('Model against the record detrended by Theil-Sen', model, residTs),
  corr('Both detrended by least squares', modelResid, residOls),
  corr('Dryland model against the record detrended by least squares', dryModel, residOls),
  corr('Dryland model against the record detrended by Theil-Sen', dryModel, residTs),
]

const zModel = model.map(v => (v - mean(model)) / sd(model))
const zRec = residOls.map(v => v / sd(residOls))
const wrong = ys.map((y, i) => ({ y, d: zModel[i] - zRec[i], zm: zModel[i], zr: zRec[i], m: model[i], r: record[i] }))
  .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8)
const rankOf = (y: number) => {
  const order = ys.map((yy, i) => ({ yy, v: model[i] })).sort((a, b) => a.v - b.v)
  return order.findIndex(o => o.yy === y) + 1
}
const dryRankOf = (y: number) => {
  const order = ys.map((yy, i) => ({ yy, v: dryModel[i] })).sort((a, b) => a.v - b.v)
  return order.findIndex(o => o.yy === y) + 1
}
const recRankOf = (y: number) => {
  const order = ys.map((yy, i) => ({ yy, v: residOls[i] })).sort((a, b) => a.v - b.v)
  return order.findIndex(o => o.yy === y) + 1
}
const n = ys.length
const notable = [
  { y: 1995, what: 'drought, the worst year against trend', want: 'bottom fifth', ok: (r: number) => r <= Math.ceil(n / 5) },
  { y: 2020, what: 'drought, second worst against trend', want: 'bottom fifth', ok: (r: number) => r <= Math.ceil(n / 5) },
  { y: 1991, what: 'driest July on record', want: 'bottom third', ok: (r: number) => r <= Math.ceil(n / 3) },
  { y: 2011, what: 'waterlogged, wettest summer', want: 'bottom third', ok: (r: number) => r <= Math.ceil(n / 3) },
  { y: 1985, what: 'cool summer, best against trend', want: 'top third', ok: (r: number) => r > n - Math.ceil(n / 3) },
  { y: 1992, what: 'cool and wet, best against trend', want: 'top third', ok: (r: number) => r > n - Math.ceil(n / 3) },
]
const eras = [[1973, 1982], [1983, 1992], [1993, 2002], [2003, 2012], [2013, 2024]]

// Irrigation response against the University of Maine trials (Bulletin 2439, in 07-practice-place).
const umaine: Record<number, number> = { 1992: 4, 1993: 8, 1994: 26, 1995: 37, 1997: 23, 1998: 23, 1999: 7, 2000: 19, 2002: 16, 2003: 6 }
const irr = Object.keys(umaine).map(Number).filter(y => years.includes(y)).map(y => {
  const w = mean(wet.get(y)!.map(s => s.yield)), d = mean(dry.get(y)!.map(s => s.yield))
  return { y, model: (w / d - 1) * 100, trial: umaine[y], w, d }
})
const allIrr = years.map(y => mean(wet.get(y)!.map(s => s.yield)) / mean(dry.get(y)!.map(s => s.yield)) - 1)

// ------------------------------------------------------------ blight
const documented: Record<number, { status: 'severe' | 'present' | 'light'; text: string }> = {
  1974: { status: 'severe', text: 'Ithaca, NY: unsprayed Katahdin reached 89% foliar blight (Fry 1977). Not a Maine record.' },
  1975: { status: 'severe', text: 'Severe in southeastern Pennsylvania; Ithaca weather very conducive 3-17 Aug (MacKenzie 1981; Fry 1977). Not a Maine record.' },
  1993: { status: 'present', text: 'US-8 found, in 1993 only in Maine (Fry and Goodwin 1997).' },
  1994: { status: 'severe', text: 'Especially severe in the northeastern US, with severe tuber blight; severe in Maine (Fry and Goodwin 1997; Tucker).' },
  1995: { status: 'light', text: 'Drier; the 1994 losses were usually not repeated (Fry and Goodwin 1997).' },
  2006: { status: 'present', text: 'Diseased samples from northern and central Aroostook (Olanya et al. 2015).' },
  2007: { status: 'light', text: 'Good weather; chemical applications kept to a minimum (Maine Potato Board 2008).' },
  2008: { status: 'present', text: 'Threat of blight required larger and more frequent applications (Maine Potato Board 2008).' },
  2009: { status: 'light', text: 'Outbreak from tomato transplants; commercial potatoes largely unaffected (BDN 2009; Fry et al. 2013).' },
  2010: { status: 'light', text: 'No late blight reported in Maine (Spudman 2011).' },
  2011: { status: 'light', text: 'Found around Bridgewater, Caribou, Fort Fairfield; "by no means an epidemic" (BDN 2011).' },
  2024: { status: 'present', text: 'Found 9 Aug in Presque Isle; all areas to 5-day sprays (BDN 2024).' },
}
const EPIDEMIC = 0.5
const blightRows = years.map(y => {
  const b = bare.get(y)!, r = refPeak.get(y)!
  const peak = mean(b.map(s => s.peak))
  return {
    y, sv: mean(ref.get(y)!.map(s => s.sv)), doc: qa[String(y)]?.sev ?? NaN,
    bare: peak, epidemicShare: b.filter(s => s.peak >= EPIDEMIC).length / b.length,
    ref: mean(r.map(s => s.peak)), sprays: mean(ref.get(y)!.map(s => s.sprays)) / 4,
    flag: peak >= EPIDEMIC,
  }
})
const svs = blightRows.map(b => b.sv)
const svRankOf = (y: number) => [...blightRows].sort((a, b) => b.sv - a.sv).findIndex(b => b.y === y) + 1
const flagged = blightRows.filter(b => b.flag).map(b => b.y)
const docSevere = Object.entries(documented).filter(([, d]) => d.status === 'severe').map(([y]) => Number(y))
const docLight = Object.entries(documented).filter(([, d]) => d.status === 'light').map(([y]) => Number(y))
const docPresent = Object.entries(documented).filter(([, d]) => d.status === 'present').map(([y]) => Number(y))

// ------------------------------------------------------------ calendar
const common = (y: number, d: number) => { const { month, dom } = S.monthDay(y, d); return S.dayIndex(2001, month, dom) }
const pool = (pick: (s: Season) => number[]) => years.flatMap(y => ref.get(y)!.flatMap(s => pick(s).map(d => common(y, d))))
const plantAll = pool(s => s.plant), emergeAll = pool(s => s.emerge), killAll = pool(s => s.kill), digAll = pool(s => s.dig)
const date = (d: number) => S.formatDay(2001, Math.round(d), true)
const pcts = (xs: number[]) => [0.05, 0.5, 0.95].map(q => date(quantile(xs, q)))
// NASS weekly planting progress, Maine 2008-2013 (07-practice-place), weeks ending these dates.
const nassWeeks = ['May 1', 'May 8', 'May 15', 'May 22', 'May 29', 'Jun 5']
const nassDays = [[3, 30], [4, 8], [4, 15], [4, 22], [4, 29], [5, 5]].map(([m, d]) => S.dayIndex(2001, m, d))
const nassPct: Record<number, number[]> = {
  2008: [0, 1, 17, 56, 86, 99], 2009: [2, 7, 40, 85, 99, 100], 2010: [10, 40, 70, 90, 95, 100],
  2011: [0, 2, 10, 40, 60, 90], 2012: [2, 22, 52, 72, 96, 99], 2013: [4, 26, 61, 82, 87, 92],
}
function nassHalf(y: number): number {
  const p = nassPct[y]
  for (let i = 1; i < p.length; i++) if (p[i] >= 50) return nassDays[i - 1] + ((50 - p[i - 1]) / (p[i] - p[i - 1])) * (nassDays[i] - nassDays[i - 1])
  return NaN
}
const plantYear = Object.keys(nassPct).map(Number).map(y => ({ y, model: median(ref.get(y)!.flatMap(s => s.plant.map(d => common(y, d)))), nass: nassHalf(y) }))

// ------------------------------------------------------------ report
const f0 = (x: number) => Number.isFinite(x) ? x.toFixed(0) : '-'
const f2 = (x: number) => x.toFixed(2)
const p3 = (x: number) => x < 0.001 ? '<0.001' : x.toFixed(3)
const sign = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`
const L: string[] = []
L.push('# The model against the outside record', '')
L.push('Generated by `npm run validate` (tools/validate/run.ts). Every number below comes from that run; rerun it after any change to `src/sim`. The comparisons are reported whatever they show; nothing in the model was tuned toward them.', '')
L.push('## Setup', '')
L.push(`- Each playable year (${years.length}: ${years[0]} to ${years[years.length - 1]}, without 1996) is played as a single season from the opening farm, ${seeds.length} seeds each (${seeds.join(', ')}), averaged.`)
L.push('- **Reference practice** is the in-game advice followed as given (`reference` bot in tools/balance/bots.ts): the default plan (four fields of certified Katahdin, the two worn fields resting), planting, two hillings, weekly scouting, spraying on the blight watch, watering below 38% of available water, two test digs, vine kill and digging when the advice says.')
L.push('- **Marketable yield** is cwt per potato acre graded saleable at the dig (US No. 1, chef, B, No. 2 and thin-skinned), before storage shrink. The USDA figure is production over harvested acres for the whole state (src/data/records.json).')
L.push('- **Unsprayed** is the same practice with no fungicide, no roguing and no vine kill, so the epidemic runs until the vines die. **Peak blight** is the season peak of the true blighted share of leaf on the worst field, read from the year-end ledger.')
L.push('- **Dryland** skips all watering; **irrigated** waters whenever a bulking field falls below 60% of available water (the UMaine pivot trigger is 55-65%).', '')

L.push('## Yield', '')
L.push(`USDA trend over these ${n} years: least squares ${sign(ols.b)} cwt/acre a year (residual SD ${f0(sd(residOls))}); Theil-Sen ${sign(ts.b)}. The model has no technology trend: its own least-squares slope is ${sign(mOls.b)} cwt/acre a year.`, '')
L.push('| Comparison | Pearson r | permutation p | Spearman rho | permutation p |', '|---|---|---|---|---|')
for (const c of corrs) L.push(`| ${c.name} | ${f2(c.r)} | ${p3(c.pr)} | ${f2(c.rho)} | ${p3(c.prho)} |`)
L.push('', 'Permutation p-values are two-sided, from 10,000 shuffles of the record against the model.', '')
L.push('| Era | Model mean | USDA mean | Model / USDA |', '|---|---|---|---|')
for (const [a, b] of eras) {
  const idx = ys.map((y, i) => (y >= a && y <= b ? i : -1)).filter(i => i >= 0)
  const mm = mean(idx.map(i => model[i])), rr = mean(idx.map(i => record[i]))
  L.push(`| ${a}-${b} | ${f0(mm)} | ${f0(rr)} | ${f2(mm / rr)} |`)
}
L.push('', '### Years the model gets most wrong', '')
L.push('Standardized: the model\'s yield as a z-score of its own series, against the USDA departure from trend as a z-score of the residuals.', '')
L.push('| Year | Model cwt/acre | Model z | USDA cwt/acre | USDA z (detrended) | Gap |', '|---|---|---|---|---|---|')
for (const w of wrong) L.push(`| ${w.y} | ${f0(w.m)} | ${sign(w.zm)} | ${f0(w.r)} | ${sign(w.zr)} | ${sign(w.d)} |`)
L.push('', '### Notable years (07-practice-place, section 1.7)', '')
L.push(`Rank 1 is the lowest yield of the ${n} years.`, '')
L.push('| Year | What happened | Model cwt/acre | Model rank | Right? | Dryland cwt/acre | Dryland rank | Right? | USDA rank against trend | Expected |', '|---|---|---|---|---|---|---|---|---|---|')
for (const x of notable) {
  const i = ys.indexOf(x.y)
  const r = rankOf(x.y), rd = dryRankOf(x.y)
  L.push(`| ${x.y} | ${x.what} | ${f0(model[i])} | ${r} | ${x.ok(r) ? 'yes' : 'no'} | ${f0(dryModel[i])} | ${rd} | ${x.ok(rd) ? 'yes' : 'no'} | ${recRankOf(x.y)} | ${x.want} |`)
}
L.push('', `Under reference practice ${notable.filter(x => x.ok(rankOf(x.y))).length} of ${notable.length} notable years land where the record puts them; dryland, ${notable.filter(x => x.ok(dryRankOf(x.y))).length} of ${notable.length}.`, '')
L.push('### Irrigation response against the University of Maine trials', '')
L.push(`Irrigated over dryland yield under the same practice. Over all ${years.length} years the model's mean response is ${sign(mean(allIrr) * 100)}% (UMaine trial average: +17%, +49 cwt/acre).`, '')
L.push('| Year | Model dryland | Model irrigated | Model response | UMaine trial |', '|---|---|---|---|---|')
for (const r of irr) L.push(`| ${r.y} | ${f0(r.d)} | ${f0(r.w)} | ${sign(r.model)}% | +${r.trial}% |`)
L.push('', `Across these ${irr.length} trial years: Pearson r ${f2(pearson(irr.map(r => r.model), irr.map(r => r.trial)))}, Spearman rho ${f2(spearman(irr.map(r => r.model), irr.map(r => r.trial)))}.`, '')

L.push('## Late blight', '')
L.push(`Season severity values are the model's Blitecast total from May 25 to freeze-up. The weather report's total (00-weather-data, June 1 to September 15, the same wet-hour data) is beside it. MacKenzie (1981) found 81% of Pennsylvania station-seasons below 90 and 42% below 60; at Caribou in the model, ${Math.round(svs.filter(v => v < 90).length / svs.length * 100)}% of seasons are below 90 and ${Math.round(svs.filter(v => v < 60).length / svs.length * 100)}% below 60.`, '')
L.push(`A season is flagged an **epidemic** when the unsprayed peak averages ${EPIDEMIC * 100}% of leaf or more. The model flags ${flagged.length} of ${years.length} seasons: ${flagged.join(', ') || 'none'}.`, '')
L.push('### Documented years', '')
L.push('| Year | Documented | Status | Model severity values (rank of ' + years.length + ') | Unsprayed peak | Epidemic seeds | Reference peak | Flagged |', '|---|---|---|---|---|---|---|---|')
for (const y of Object.keys(documented).map(Number)) {
  const b = blightRows.find(r => r.y === y)
  if (!b) continue
  L.push(`| ${y} | ${documented[y].text} | ${documented[y].status} | ${f0(b.sv)} (${svRankOf(y)}) | ${f0(b.bare * 100)}% | ${f0(b.epidemicShare * 100)}% | ${f0(b.ref * 100)}% | ${b.flag ? 'yes' : 'no'} |`)
}
const hitSevere = docSevere.filter(y => flagged.includes(y))
const hitLight = docLight.filter(y => flagged.includes(y))
const hitPresent = docPresent.filter(y => flagged.includes(y))
L.push('', `The model flags ${hitSevere.length} of the ${docSevere.length} documented severe years (${docSevere.join(', ')}${hitSevere.length ? `; flagged: ${hitSevere.join(', ')}` : ''}), ${hitPresent.length} of the ${docPresent.length} years with blight present (${docPresent.join(', ')}), and ${hitLight.length} of the ${docLight.length} documented light years (${docLight.join(', ')}${hitLight.length ? `; flagged: ${hitLight.join(', ')}` : ''}). No source covers Maine year by year before 1993, so most flagged years cannot be checked.`, '')
L.push('### Every year', '')
L.push('| Year | Model severity values | Weather report Jun 1-Sep 15 | Unsprayed peak | Epidemic seeds | Reference peak | Reference sprays per field |', '|---|---|---|---|---|---|---|')
for (const b of blightRows) L.push(`| ${b.y} | ${f0(b.sv)} | ${f0(b.doc)} | ${f0(b.bare * 100)}% | ${f0(b.epidemicShare * 100)}% | ${f0(b.ref * 100)}% | ${b.sprays.toFixed(1)} |`)
L.push('', `Model severity totals against the weather report's: Pearson r ${f2(pearson(svs, blightRows.map(b => b.doc)))}.`, '')

L.push('## Calendar', '')
L.push('Dates are pooled over every potato field, year and seed, and shown on a common (non-leap) calendar.', '')
L.push('| Operation | Model 5% | Model 50% | Model 95% | Usual Maine dates |', '|---|---|---|---|---|')
L.push(`| Planting | ${pcts(plantAll).join(' | ')} | NASS: begins May 9-10, most active May 14-Jun 3, ends Jun 9-10; half planted by about May 15 in 2008-2013 and May 26-28 in the 2018-2023 averages |`)
L.push(`| Emergence (field half up) | ${pcts(emergeAll).join(' | ')} | NASS 2018-2023 averages: half emerged about Jun 17 |`)
L.push(`| Vine kill | ${pcts(killAll).join(' | ')} | Tablestock and processing: most growers killing vines the week ending Sep 4 (2011); seed fields in August; kill 14-21 days before digging |`)
L.push(`| Digging done | ${pcts(digAll).join(' | ')} | NASS: begins Sep 6-7, most active Sep 20-Oct 10, ends Oct 17-19; half dug by Sep 25-Oct 1 |`)
L.push('', '### Planting by year, 2008-2013', '')
L.push('| Year | Model median planting | NASS half planted (interpolated from weekly progress) | Difference, days |', '|---|---|---|---|')
for (const p of plantYear) L.push(`| ${p.y} | ${date(p.model)} | ${date(p.nass)} | ${sign(p.model - p.nass)} |`)
L.push('', `Spearman rho across the six years: ${f2(spearman(plantYear.map(p => p.model), plantYear.map(p => p.nass)))}.`, '')

L.push('## Yield by year', '')
L.push('| Year | Model mean | Model SD over seeds | Dryland | Irrigated | USDA | USDA departure from trend |', '|---|---|---|---|---|---|---|')
for (const [i, y] of ys.entries()) L.push(`| ${y} | ${f0(model[i])} | ${f0(modelSd[i])} | ${f0(mean(dry.get(y)!.map(s => s.yield)))} | ${f0(mean(wet.get(y)!.map(s => s.yield)))} | ${f0(record[i])} | ${sign(residOls[i])} |`)
L.push('')

mkdirSync(repoPath('docs/verification/'), { recursive: true })
writeFileSync(repoPath('docs/verification/model-vs-record.md'), L.join('\n'))

console.log(`Yield, ${n} years, ${seeds.length} seeds:`)
for (const c of corrs) console.log(`  ${c.name}: r ${f2(c.r)} (p ${p3(c.pr)}), rho ${f2(c.rho)} (p ${p3(c.prho)})`)
console.log(`  model mean ${f0(mean(model))} cwt/acre, USDA mean ${f0(mean(record))}`)
console.log(`  notable years right: ${notable.filter(x => x.ok(rankOf(x.y))).length}/${notable.length} under reference practice (${notable.map(x => `${x.y} rank ${rankOf(x.y)}`).join(", ")}); dryland ${notable.filter(x => x.ok(dryRankOf(x.y))).length}/${notable.length} (${notable.map(x => `${x.y} rank ${dryRankOf(x.y)}`).join(", ")})`)
console.log(`  irrigation response mean ${sign(mean(allIrr) * 100)}%; trial years r ${f2(pearson(irr.map(r => r.model), irr.map(r => r.trial)))}`)
console.log(`Blight: ${flagged.length} of ${years.length} seasons flagged epidemic; documented severe flagged ${hitSevere.length}/${docSevere.length}, present ${hitPresent.length}/${docPresent.length}, light flagged ${hitLight.length}/${docLight.length}`)
console.log(`Calendar: planting ${pcts(plantAll).join(' / ')}, emergence ${pcts(emergeAll).join(' / ')}, kill ${pcts(killAll).join(' / ')}, dug ${pcts(digAll).join(' / ')}`)
console.log(`Wrote docs/verification/model-vs-record.md in ${((performance.now() - t0) / 1000).toFixed(0)} s.`)
