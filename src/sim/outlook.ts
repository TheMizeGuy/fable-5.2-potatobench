// What the player needs to see the farm's position: the fate of each order, the work the season cannot wait for, where
// the money stands, the year's story, what goals cost, what keeping the fields sprayed would take, and the one rule
// for planting.
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import { buildBlock, buildCost } from './buildings.ts'
import { apply, held, mortgageDue, openLots, planCosts, stumpBlock, tileBlock } from './campaign.ts'
import { HOME_YARD, PARCELS, TRACTS } from './farm.ts'
import { basePrice, gradePrice, harvestPrice, lotValue } from './market.ts'
import { lotCwt, markOdds, skinAt, skinnedShare } from './harvest.ts'
import * as P from './params.ts'
import { housingLimit, hiredCount, hurt, jobSkill, resting, SKILL_LABEL, subject, willDo } from './people.ts'
import { JOB_LABEL, jobCost, placeName, pressingWhy, standingBy, tractorsRunning, waitFor, workday } from './season.ts'
import { asks, killByItself } from './advice.ts'
import type { BuildingKind, Campaign, Cmd, Job, JobKind, KillWhy, Unit, UpgradeId, VarietyId, World, YearSummary } from './types.ts'
import { estimateYield, fieldInfo } from './view.ts'
import { getDay } from './weather.ts'
import { variety } from './varieties.ts'

// ---------------------------------------------------------------- each order's fate

export interface JobOutlook {
  id: number
  unit: number                     // who will do it: a person's id, or -1 when nobody will
  when: 'now' | 'next' | 'waiting' // worked on the next day; taken once the work ahead of it is done; held up
  why: string                      // in plain words
  leaves?: boolean                 // it comes off the list in the morning: nobody takes it because it is not wanted
}

// For each order on the list, who will take it and when, or why nobody will: the next day played out on a copy of
// the farm, and for what it does not reach, the reason.
export function jobOutlook(world: World, c: Campaign): JobOutlook[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const copy = structuredClone(c)
  const r = apply(world, copy, { t: 'day' })
  const worked = copy.season!.worked
  const dropped = new Map<number, string>()
  for (const e of r.events) if (e.type === 'dropped' && typeof e.data?.job === 'number') dropped.set(e.data.job, String(e.data.why ?? ''))
  const d = getDay(world, s.year, s.day)
  const working = workday(c, s) || copy.season!.frostHaul === s.day
  return s.jobs.map((j, place) => {
    const w = worked.find(x => x.kind === j.kind && x.field === j.field)
    if (w) return { id: j.id, unit: w.unit, when: 'now', why: says(c, w.unit, 'is working on it.', 'You\'re working on it.') }
    if (dropped.has(j.id)) return { id: j.id, unit: -1, when: 'waiting', why: `It comes off the work list in the morning. ${dropped.get(j.id)}`, leaves: true }
    const who = takers(c, j)
    if (!who.length) return { id: j.id, unit: -1, when: 'waiting', why: nobody(c, j) }
    if (!working) return { id: j.id, unit: who[0], when: 'next', why: 'It\'s Sunday, so nobody works today.' }
    const weather = waitFor(c, s, j, d)
    if (weather) {
      const [held, until] = WAITING[weather] ?? [`Waiting: ${weather} today.`, 'the weather allows']
      return { id: j.id, unit: who[0], when: 'waiting', why: `${held} ${says(c, who[0], 'will do it', 'You\'ll do it')} once ${until}.` }
    }
    if (jobSkill(j.kind) === 'machine' && tractorsRunning(c, s.day) === 0 && !(j.kind === 'haul' && c.upgrades.truck)) {
      return { id: j.id, unit: who[0], when: 'waiting', why: 'Waiting for a tractor, because every tractor is broken down.' }
    }
    // Held by work they are in the middle of: that work by name, how long it has to go, and for work that cannot wait
    // with only one person to do it, what would get it done sooner.
    const u = c.crew.find(x => x.id === who[0])!
    const cur = u.job >= 0 && u.job !== j.id ? s.jobs.find(x => x.id === u.job) : undefined
    if (cur) {
      const days = Math.ceil(Math.max(0, cur.need - cur.done) - 1e-6)
      const alone = takers(c, { ...j, unit: -1 }).length === 1 && !!pressingWhy(c, s, j)
      const sooner = alone && days >= 2 ? ` Nobody else on the farm does ${SKILL_LABEL[jobSkill(j.kind)]}, so a second person would get to it sooner.` : ''
      const after = `${u.kind === 'farmer' ? 'you\'ve' : 'they\'ve'} finished ${FINISHING[cur.kind]} ${placeName(cur.field)}`
      return { id: j.id, unit: who[0], when: 'next', why: `${says(c, who[0], 'will', 'You\'ll')} get to this${days >= 2 ? ` in about ${days} days,` : ''} once ${after}.${sooner}` }
    }
    const ahead = place
    return { id: j.id, unit: who[0], when: 'next', why: `${says(c, who[0], 'will do it', 'You\'ll do it')} ${ahead ? `after the ${ahead === 1 ? 'order' : `${ahead} orders`} ahead of it` : 'next'}.` }
  })
}

// A person and what is said of them: "Ada will do it", or the farmer's own wording ("You'll do it").
function says(c: Campaign, id: number, one: string, you: string): string {
  const u = c.crew.find(x => x.id === id)
  return u ? subject(u, one, you) : `Someone ${one}`
}

// What holds an order up today, and what it waits for, by the word waitFor gives.
const WAITING: Record<string, [string, string]> = {
  raining: ['Waiting because it\'s raining today.', 'the rain stops'],
  'ground too wet': ['Waiting because the ground is too wet today.', 'the ground dries out'],
  'heavy rain': ['Waiting because it\'s raining hard today.', 'the rain eases'],
  'too windy': ['Waiting because it\'s too windy today.', 'the wind drops'],
  'the soil is too cold': ['Waiting because the soil is too cold.', 'the soil warms up'],
  'waiting for the digger': ['Waiting for the digger to lift more of the crop.', 'there\'s more in barrels'],
}

// The work someone is in the middle of, before the place's name: "finished digging North Ridge".
const FINISHING: Record<JobKind, string> = {
  plant: 'planting', hill: 'hilling', scout: 'walking', spray: 'spraying', water: 'watering', rogue: 'pulling blighted plants in',
  sample: 'the test dig in', kill: 'killing the vines in', dig: 'digging', fell: 'felling', rocks: 'picking rocks off',
  brush: 'cutting brush along', build: 'building in', haul: 'hauling from',
}

// "you, and you're" or "Ada, who is", after "It was given to".
function givenTo(u: Unit): string {
  return u.kind === 'farmer' ? 'you, and you\'re' : `${u.name}, who is`
}

// Who could do an order now, best first: those who may take it, are not hurt or resting, by their priority for it.
function takers(c: Campaign, j: Job): number[] {
  const day = c.season?.day ?? 0
  const skill = jobSkill(j.kind)
  return c.crew.filter(u => !u.foreman && willDo(u, j.kind) && (j.unit < 0 || j.unit === u.id) && !hurt(u, day) && !resting(u))
    .sort((a, b) => a.prio[skill] - b.prio[skill]).map(u => u.id)
}

function nobody(c: Campaign, j: Job): string {
  const day = c.season?.day ?? 0
  const label = SKILL_LABEL[jobSkill(j.kind)]
  if (j.unit >= 0) {
    const u = c.crew.find(x => x.id === j.unit)
    if (!u) return 'Nobody will do it, because the person it was given to has left.'
    if (hurt(u, day)) return `It was given to ${givenTo(u)} hurt.`
    if (resting(u)) return `It was given to ${givenTo(u)} resting.`
    return `It was given to ${givenTo(u)} set to never do ${label}.`
  }
  const willing = c.crew.filter(u => !u.foreman && willDo(u, j.kind))
  if (!willing.length) return `Nobody on the farm will do ${label}, so set someone's priority for it.`
  if (willing.every(u => hurt(u, day))) return `Everyone who does ${label} is hurt.`
  return `Everyone who does ${label} is resting or hurt.`
}

// ---------------------------------------------------------------- work the season cannot wait for

export interface Pressing {
  kind: JobKind
  field: number
  job: number                      // the order on the list, or -1 when it is not ordered
  why: string                      // why it cannot wait
  inWay: string                    // what is in its way
  fix: Cmd | null                  // the one command that clears the way, when there is one
}

// Work the season cannot wait for (spraying under a blight watch, planting, the haul ahead of a frost, the late dig)
// that nobody will take, or that is not ordered, with what is in its way and the fix. Taken ahead of work that can
// wait whatever the priorities (src/sim/season.ts, choose), so a willing person never leaves it for the woods.
export function pressing(world: World, c: Campaign): Pressing[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const out: Pressing[] = []
  const fate = new Map(jobOutlook(world, c).map(o => [o.id, o]))
  for (const j of s.jobs) {
    const why = pressingWhy(c, s, j)
    const o = fate.get(j.id)
    if (!why || !o || o.leaves || o.when === 'now' || (o.when === 'next' && o.unit >= 0 && !/Sunday/.test(o.why))) continue
    if (o.unit >= 0) continue
    const skill = jobSkill(j.kind)
    const best = c.crew.filter(u => !u.foreman).sort((a, b) => b.skills[skill] - a.skills[skill])[0]
    out.push({ kind: j.kind, field: j.field, job: j.id, why, inWay: o.why, fix: best ? { t: 'priority', unit: best.id, work: skill, level: 1 } : null })
  }
  // A spray is pressing where the coach asks for one under a blight watch and the routine does not order it.
  const all = asks(world, c)
  const sprays = s.watchDay >= 0 ? new Set(all.filter(a => a.act === 'spray').map(a => a.field)) : new Set<number>()
  const kills: Pressing[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    if (!held(c, i)) continue
    const f = s.fields[i]
    const queued = (k: JobKind) => s.jobs.some(j => j.kind === k && j.field === i)
    const want = (kind: JobKind, why: string, inWay: string) => out.push({ kind, field: i, job: -1, why, inWay, fix: { t: 'job', kind, field: i } })
    if (sprays.has(i) && !standingBy(c, 'spray', i)) {
      want('spray', 'blight weather won\'t wait', f.lastSpray >= 0
        ? `You last sprayed on ${formatDay(s.year, f.lastSpray)} and it's wearing off. Each order is a single spray, so order another.`
        : 'Not sprayed yet this season. Your crew won\'t spray until you order it.')
    }
    // After the rest: the date the crew kills by itself is days off.
    const kill = killByItself(c, i, all)
    if (kill >= 0 && !queued('kill')) {
      kills.push({ kind: 'kill', field: i, job: -1, why: 'the vines are due to be killed', fix: { t: 'job', kind: 'kill', field: i },
        inWay: `The crew kills the vines on ${formatDay(s.year, Math.max(kill, s.day))} unless you keep them up, so the skins set before harvest.` })
    }
    if (f.inField >= 0.5 && !f.weighed && s.frostHaul === s.day && !queued('haul')) want('haul', 'frost is coming for the crop in barrels', 'Your crew won\'t haul until you order it.')
  }
  return [...out, ...kills]
}

// ---------------------------------------------------------------- money

export interface MoneyPart { label: string; amount: number }

export interface MoneyNow {
  cash: number                     // in hand, or owed on the spring loan when below zero
  loan: number                     // owed on the spring loan now (in spring: what beginning the season will borrow)
  stored: number                   // the crop in the potato houses and the cellar, at today's price
  growing: number                  // the crop still in the ground, by the estimate, at today's price
  range: { lo: number; hi: number }   // after, give or take what the crop in the ground may come to
  callRisk: 'none' | 'possible' | 'likely'   // the bank's limit against that: under the middle, or under even the top
  due: { note: number; household: number; mortgage: number; loan: number; total: number }   // what the year end takes, the loan included
  after: number                    // what the farm would have after the year-end bills if every lot sold today
  parts: MoneyPart[]               // the why of after, largest first
}

// "Am I all right?": what the farm would have after the year-end bills if the crop sold today. In spring the plan's
// cost, borrowed when the season begins, is counted as owed.
export function moneyNow(world: World, c: Campaign): MoneyNow {
  const spring = c.phase === 'plan' ? planCosts(c).total : 0
  const cash = c.cash - spring
  const loan = Math.max(0, -cash)
  let stored = 0
  for (const l of openLots(c)) stored += lotValue(world, c, l)
  let growing = 0, lo = 0, hi = 0
  const s = c.season
  if (c.phase === 'season' && s) {
    for (let i = 0; i < P.FIELD_COUNT; i++) {
      const f = s.fields[i]
      // What the digger has lifted, in barrels or hauled in, counts at today's price until its lot is made up, less
      // the No. 1 the skins will cost it at the weigh-in (harvest.ts, finishLot).
      const lifting = f.lotId >= 0 ? c.lots.find(l => l.id === f.lotId) : undefined
      const lifted = lifting && !lifting.open && !f.weighed
        ? lotValue(world, c, lifting) - skinnedShare(skinAt(f, lifting.dugDay)) * lifting.grades.no1 * (gradePrice(world, c, lifting, 'no1') - gradePrice(world, c, lifting, 'no2'))
        : 0
      growing += lifted
      const toPlant = f.status === 'idle' && c.plans[i]?.crop === 'potato'
      if (!toPlant && f.status !== 'planted' && f.status !== 'growing' && f.status !== 'dead' && f.status !== 'digging') continue
      const e = harvestYield(c, i)
      if (!e) continue
      const left = f.status === 'digging' ? 1 - f.digDone / P.HILLS : 1
      // The rest at what a cwt of the usual crop brings, leaning on what this field's own has brought as the digger
      // gets further in; it cannot be sold before it is lifted, by when the year's price level has come further in.
      const dug = lifting ? lotCwt(lifting) + lifting.grades.cull : 0
      const usual = (P.MARKETABLE_SHARE - P.MARKETABLE_NO2 * no2Share(c, i)) * basePrice(world, c, f.variety)
      const own = dug >= 1 ? 1 - left : 0
      const perCwt = (usual * (1 - own) + (own > 0 ? lifted / dug : 0) * own) * harvestPrice(world, c, f.variety) / basePrice(world, c, f.variety)
      const spread = (1 - own) * P.MARKETABLE_SPREAD / P.MARKETABLE_SHARE
      const cwt = P.FIELD_ACRES * left
      const dig = f.status === 'digging' ? 0 : jobCost(c, 'dig')
      growing += e.mean * cwt * perCwt - dig
      lo += e.mean * cwt * perCwt - e.lo * cwt * perCwt * (1 - 1.5 * spread)
      hi += e.hi * cwt * perCwt * (1 + 1.5 * spread) - e.mean * cwt * perCwt
    }
  }
  const m = mortgageDue(c)
  const mortgage = m.principal + m.interest
  const bills = P.NOTE_PAYMENT + P.LIVING + mortgage
  const due = { note: P.NOTE_PAYMENT, household: P.LIVING, mortgage, loan, total: bills + loan }
  const after = cash + stored + growing - bills
  const parts: MoneyPart[] = [
    { label: cash >= 0 ? 'Cash on hand' : 'Owed on the spring loan', amount: cash },
    { label: 'Stored crop at today\'s price', amount: stored },
    { label: 'Estimated crop in the ground', amount: growing },
    { label: 'The yearly bank payment', amount: -P.NOTE_PAYMENT },
    { label: 'Your family\'s living costs', amount: -P.LIVING },
    { label: 'The land mortgage', amount: -mortgage },
  ].filter(p => Math.abs(p.amount) >= 0.5).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const range = { lo: after - lo, hi: after + hi }
  const callRisk = range.hi < P.CREDIT_LIMIT ? 'likely' : after < P.CREDIT_LIMIT ? 'possible' : 'none'
  return { cash, loan, stored, growing, range, callRisk, due, after, parts }
}

// What a field's crop should come to at the dig, total cwt an acre with its give-or-take: before the tubers set, what
// the variety usually gives on this ground (worn soil and raw ground give less); after, the tubers there now by the
// estimate, and while the vines live, the usual yield's share of the bulking still to come by the warmth to senescence.
export function harvestYield(c: Campaign, field: number): { mean: number; lo: number; hi: number } | null {
  const f = c.season!.fields[field]
  const v = variety(f.variety)
  const usual = usualYield(c, field, f.variety)
  const e = estimateYield(c, field)
  if (!e && f.tiDay >= 0) return null
  const s = c.season!
  // The days of bulking left, to the day the vines are expected to come off (killOutlook), of all it would have had.
  let toCome = e ? 0 : 1
  if (e && f.deadDay < 0) {
    const age = f.pdAir - f.pdEmerge
    const pace = s.day > f.emergeDay ? age / (s.day - f.emergeDay) : 0
    const span = s.day - f.tiDay + (pace > 0 ? Math.max(0, v.matPd - age) / pace : 0) + P.KILL_MADE_DAYS
    const off = killOutlook(c, field)?.day ?? s.day
    toCome = span > 0 ? Math.min(1, Math.max(0, off - s.day) / span) : 0
  }
  const more = toCome * usual
  return {
    mean: (e?.mean ?? 0) + more,
    lo: (e?.lo ?? 0) + more * (1 - 1.5 * P.USUAL_SPREAD),
    hi: (e?.hi ?? 0) + more * (1 + 1.5 * P.USUAL_SPREAD),
  }
}

// What a variety usually gives on this field, total cwt an acre: worn soil and raw ground give less.
function usualYield(c: Campaign, field: number, id: VarietyId): number {
  const fp = c.fields[field]
  return variety(id).usual * (1 - P.SOIL_YIELD * (1 - fp.soil)) * (fp.raw ? P.RAW_GROUND : 1)
}

// The share of a field's tubers expected to go to No. 2: a usual season's before they set, after it the field's own
// scab and knob odds.
function no2Share(c: Campaign, field: number): number {
  const f = c.season!.fields[field]
  if (f.tiDay < 0) return P.NO2_USUAL
  const odds = markOdds(f, c.fields[field].soil)
  return odds.scab + (1 - odds.scab) * odds.knob
}

// ---------------------------------------------------------------- what a contract looks like getting

export interface ContractOutlook {
  lo: number; mean: number; hi: number   // cwt of US No. 1 and large by the due date, give or take
  fields: number                          // its variety's fields still to harvest (in spring, planned)
  // Why even the top falls short of the promise, or '': no field of its variety, too few acres for it at a usual
  // crop, a crop lighter than that, or a harvest already in that came to less.
  short: '' | 'none' | 'acres' | 'crop' | 'dug'
}

// What a contract for this much of a variety looks like getting by its due date: what is delivered, the US No. 1 and
// large of that variety in hand and being lifted, and the crop its fields are expected to give at the harvest
// (harvestYield; in spring, the plan's fields at a usual crop), only the share that grades No. 1 or large.
export function contractOutlook(c: Campaign, id: VarietyId, cwt: number, delivered = 0): ContractOutlook {
  let mean = delivered, lo = delivered, hi = delivered, fields = 0, grown = false, set = false
  for (const l of openLots(c)) if (l.variety === id) { const n = l.grades.no1 + l.grades.chef; mean += n; lo += n; hi += n }
  const add = (acres: number, share: number, yl: { mean: number; lo: number; hi: number }) => {
    mean += yl.mean * acres * share
    lo += yl.lo * acres * share * (1 - 1.5 * P.NO1_SPREAD)
    hi += yl.hi * acres * share * (1 + 1.5 * P.NO1_SPREAD)
  }
  const s = c.season
  if (c.phase === 'plan') {
    const share = P.NO1_SHARE[id] - P.NO1_NO2 * P.NO2_USUAL
    for (let i = 0; i < P.FIELD_COUNT; i++) {
      const p = c.plans[i]
      if (!held(c, i) || p?.crop !== 'potato' || p.variety !== id) continue
      const u = usualYield(c, i, id)
      add(P.FIELD_ACRES, share, { mean: u, lo: u * (1 - 1.5 * P.USUAL_SPREAD), hi: u * (1 + 1.5 * P.USUAL_SPREAD) })
      fields++
      grown = true
    }
  } else if (s) {
    for (let i = 0; i < P.FIELD_COUNT; i++) {
      const f = s.fields[i]
      const toPlant = f.status === 'idle' && c.plans[i]?.crop === 'potato'
      if (!held(c, i) || f.variety !== id || f.status === 'off' || f.status === 'rest' || (f.status === 'idle' && !toPlant)) continue
      grown = true
      if (c.phase !== 'season') continue
      // What the digger has lifted and not yet weighed, less the No. 1 its skins will cost at the weigh-in.
      const lifting = f.lotId >= 0 && !f.weighed ? c.lots.find(l => l.id === f.lotId && !l.open) : undefined
      if (lifting) {
        const n = lifting.grades.no1 * (1 - skinnedShare(skinAt(f, lifting.dugDay))) + lifting.grades.chef
        mean += n; lo += n; hi += n
      }
      if (!toPlant && f.status !== 'planted' && f.status !== 'growing' && f.status !== 'dead' && f.status !== 'digging') continue
      const e = harvestYield(c, i)
      if (!e) continue
      add(P.FIELD_ACRES * (f.status === 'digging' ? 1 - f.digDone / P.HILLS : 1), P.NO1_SHARE[id] - P.NO1_NO2 * no2Share(c, i), e)
      fields++
      if (f.tiDay >= 0) set = true
    }
  }
  const short = hi >= cwt - 1e-6 ? '' : fields ? (set ? 'crop' : 'acres') : grown ? 'dug' : 'none'
  return { lo, mean, hi, fields, short }
}

export interface YearStory { year: number; began: number; ended: number; reasons: MoneyPart[] }

// The year-end sentence: began with, ends with, and the three largest reasons, from the year's ledger.
export function yearStory(y: YearSummary): YearStory {
  const other = y.revenue - y.restIncome - y.contracts - y.logs - y.stand
  const growingCost = y.costs - y.wages - y.rent - y.land - y.storage - y.building - y.works - y.mortgage - y.penalties - y.packing
  const lines: MoneyPart[] = [
    { label: 'Potato sales', amount: other },
    { label: 'Contract deliveries', amount: y.contracts },
    { label: 'Oats and clover', amount: y.restIncome },
    { label: 'Logs and the farm stand', amount: y.logs + y.stand },
    { label: 'Growing costs, equipment and field work', amount: -growingCost },
    { label: 'Wages', amount: -y.wages },
    { label: 'Rent and land', amount: -(y.rent + y.land + y.mortgage) },
    { label: 'Buildings and contractors', amount: -(y.building + y.works) },
    { label: 'Storage and packing', amount: -(y.storage + y.packing) },
    { label: 'Contract penalties', amount: -y.penalties },
    { label: 'The bank payment and your family\'s living costs', amount: -(y.note + y.living) },
    { label: 'Interest on the loan', amount: -y.interest },
  ]
  const reasons = lines.filter(l => Math.abs(l.amount) >= 0.5).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3)
  return { year: y.year, began: y.cashStart, ended: y.cashEnd, reasons }
}

// ---------------------------------------------------------------- what goals cost

export interface GoalCost { id: string; label: string; cost: number; can: boolean; why: string }

// What each thing a goal can ask for costs now, and whether the farm can pay for it now ('' why when it can).
export function goalCosts(c: Campaign): GoalCost[] {
  const out: GoalCost[] = []
  const cash = (cost: number) => c.cash - cost >= 0 ? '' : `It costs $${withCommas(cost)}, and you have $${withCommas(Math.max(0, c.cash))} on hand.`
  const tract = TRACTS.find(i => c.fields[i].tenure !== 'none' && c.fields[i].cover === 'stumps') ?? -1
  out.push({ id: 'stump', label: 'Pull the stumps', cost: P.STUMP_FEE, can: tract >= 0 && !stumpBlock(c, tract), why: tract < 0 ? 'You have no felled tract with stumps to pull.' : stumpBlock(c, tract) })
  const bottom = c.fields.findIndex((f, i) => f.tenure === 'owned' && f.cover === 'open' && f.elev === 0 && !f.tiled && i >= 0)
  out.push({ id: 'tile', label: 'Lay tile drains', cost: P.TILE_FEE, can: bottom >= 0 && !tileBlock(c, bottom), why: bottom < 0 ? 'You don\'t own any bottom land that still needs tile.' : tileBlock(c, bottom) })
  for (const kind of P.BUILDING_KINDS as BuildingKind[]) {
    const cost = buildCost(c, kind).total
    const why = buildBlock(c, kind, HOME_YARD, holdsAnyDufour(c))
    out.push({ id: `build:${kind}`, label: P.BUILDINGS[kind].name, cost, can: !why, why })
  }
  for (const id of Object.keys(P.UPGRADES) as UpgradeId[]) {
    const u = P.UPGRADES[id]
    const why = c.upgrades[id] ? 'You already own it.' : c.phase !== 'plan' ? 'You can only buy equipment in spring.' : cash(u.cost)
    out.push({ id: `buy:${id}`, label: u.name, cost: u.cost, can: !why, why })
  }
  const roomWhy = hiredCount(c) >= housingLimit(c) ? 'Every place to live is taken, and a bunkhouse adds six more.' : c.phase !== 'plan' && c.phase !== 'season' ? 'You can hire in spring or during the season.' : ''
  out.push({ id: 'hire', label: 'Hire someone', cost: P.HAND_WAGE, can: !roomWhy, why: roomWhy })
  const hand = c.crew.find(u => u.kind !== 'farmer' && !u.foreman)
  const foremanWhy = !hand ? 'A foreman has to be one of your hired people, so hire someone first.' : ''
  out.push({ id: 'foreman', label: 'Name a foreman', cost: hand ? Math.round(hand.wage * (P.FOREMAN_PAY - 1)) : Math.round(P.HAND_WAGE * (P.FOREMAN_PAY - 1)), can: !foremanWhy, why: foremanWhy })
  const field = PARCELS.findIndex((p, i) => p.holding === 'field' && c.fields[i].tenure === 'none')
  if (field >= 0) {
    const rent = PARCELS[field].rent
    out.push({ id: 'rent', label: 'Rent a field', cost: rent, can: c.phase === 'plan', why: c.phase === 'plan' ? '' : 'You can only rent land in spring.' })
  }
  return out
}

function holdsAnyDufour(c: Campaign): boolean {
  return PARCELS.some((p, i) => p.block === 'dufour' && p.holding === 'field' && c.fields[i].tenure !== 'none')
}

// ---------------------------------------------------------------- the spray question

export interface SprayOutlook { fields: number; days: number; passes: number; dollars: number; perPass: number }

// About what keeping every growing field sprayed for the rest of the season would take: a pass each time the
// protectant wears thin (it loses a tenth a day and washes off in rain), until the vines are due to be killed.
export function sprayOutlook(world: World, c: Campaign): SprayOutlook {
  const s = c.season
  const perPass = jobCost(c, 'spray')
  if (c.phase !== 'season' || !s) return { fields: 0, days: 0, passes: 0, dollars: 0, perPass }
  const until = dayIndex(s.year, 8, 8)
  // Days a fresh spray lasts before it is thin (0.35 left), with rain taking about a fifth off that.
  let every = 0
  for (let r = P.SPRAY_BASE; r >= 0.35 && every < 60; r *= P.RESIDUE_DECAY) every++
  every = Math.max(4, Math.round(every * 0.8))
  let fields = 0, passes = 0, days = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status !== 'growing' && f.status !== 'planted') continue
    if (f.deadDay >= 0) continue
    const left = Math.max(0, until - Math.max(s.day, f.emergeDay >= 0 ? s.day : s.day + 14))
    if (left <= 0) continue
    fields++
    days = Math.max(days, left)
    passes += Math.ceil(left / every)
  }
  return { fields, days, passes, dollars: passes * perPass, perPass }
}

// ---------------------------------------------------------------- the vine kill, judged against the coach

export interface KillTiming { asked: number; killed: number; early: number; why: KillWhy | '' }

// When reference practice first asked for this field's vines to be killed and why (blight winning, frost coming, the
// crop made, the late date), when they were killed, and how many days early that was. For a kill nobody had asked for
// the due day is the one the coach was coming to (the crop made, else the late date). A kill within KILL_GRACE days
// of it counts as asked, on the day it was due.
export function killTiming(c: Campaign, field: number): KillTiming {
  const f = c.season?.fields[field]
  let asked = f?.killAsked ?? -1
  let why: KillWhy | '' = asked >= 0 ? f?.killWhy ?? '' : ''
  const killed = f?.killDay ?? -1
  if (!f || killed < 0) return { asked, killed, early: 0, why }
  const late = dayIndex(c.year, P.KILL_BY.month, P.KILL_BY.dom)
  const made = f.matureDay >= 0 && f.matureDay <= killed ? f.matureDay + P.KILL_MADE_DAYS : -1
  const by = asked >= 0 ? asked : made >= 0 && made < late ? made : late
  const early = Math.max(0, by - killed)
  if (early > P.KILL_GRACE) return { asked, killed, early, why }
  if (asked < 0) { asked = by; why = made >= 0 && made < late ? 'made' : 'late' }
  return { asked, killed, early: 0, why }
}

export interface KillOutlook { day: number; why: KillWhy; asked: boolean }

// The day the coach expects to ask for this field's vines to be killed, from what is known now: the day it asked, if
// it has; else the crop made (KILL_MADE_DAYS after the vines start to die back, reckoned from the warmth so far at the
// pace since the plants came up), or the late date, whichever is first. Blight winning or a frost coming can bring it
// sooner. null for a field with no vines up.
export function killOutlook(c: Campaign, field: number): KillOutlook | null {
  const s = c.season
  const f = s?.fields[field]
  if (!s || !f || f.status !== 'growing' || f.deadDay >= 0) return null
  if (f.killSince !== undefined || (f.killAsked !== undefined && s.jobs.some(j => j.kind === 'kill' && j.field === field))) {
    return { day: f.killSince ?? f.killAsked!, why: f.killWhy ?? 'made', asked: true }
  }
  const late = dayIndex(s.year, P.KILL_BY.month, P.KILL_BY.dom)
  let made = -1
  if (f.matureDay >= 0) made = f.matureDay + P.KILL_MADE_DAYS
  else if (f.emergeDay >= 0 && s.day > f.emergeDay) {
    const age = f.pdAir - f.pdEmerge
    const pace = age / (s.day - f.emergeDay)
    if (pace > 0) made = s.day + Math.ceil(Math.max(0, variety(f.variety).matPd - age) / pace) + P.KILL_MADE_DAYS
  }
  return made >= 0 && made < late ? { day: Math.max(made, s.day), why: 'made', asked: false } : { day: Math.max(late, s.day), why: 'late', asked: false }
}

// ---------------------------------------------------------------- planting: one rule

export interface PlantReady { ok: boolean; soilT: number; need: number; rots: number; why: string }

// The one rule for planting, used by the advice and so the routine: the field's own soil (the station's, a degree
// more on the ridge and less on the bottom land) at the planting temperature, not before the season's earliest date,
// and the ground fit to work.
export function plantReady(world: World, c: Campaign, field: number): PlantReady {
  const s = c.season
  const need = P.PLANT_SOIL_C, rots = P.PLANT_ROT_C
  if (!s) return { ok: false, soilT: 0, need, rots, why: 'Planting happens during the season.' }
  const soilT = s.soilT
  const f = (x: number) => Math.round(x * 9 / 5 + 32)
  if (s.day < dayIndex(s.year, P.PLANT_FROM.month, P.PLANT_FROM.dom)) return { ok: false, soilT, need, rots, why: 'It\'s too early. Seed just sits and rots in cold ground.' }
  if (soilT < need) return { ok: false, soilT, need, rots, why: `The soil here is ${f(soilT)}°F. Seed needs ${f(need)}°F, and below ${f(rots)}°F it rots.` }
  if (fieldInfo(c, field).tooWet) return { ok: false, soilT, need, rots, why: 'It\'s too wet to work, but it\'ll dry in a day or two.' }
  return { ok: true, soilT, need, rots, why: `The soil here is ${f(soilT)}°F and dry enough to work.` }
}

