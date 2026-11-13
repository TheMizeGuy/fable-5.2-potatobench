// What the player needs to see the farm's position: the fate of each order, the work the season cannot wait for, where
// the money stands, the year's story, what goals cost, what keeping the fields sprayed would take, and the one rule
// for planting.
import { dayIndex, formatDay, isLeap, SUNDAY, weekday, withCommas } from './calendar.ts'
import { buildBlock, buildCost } from './buildings.ts'
import { apply, held, mortgageDue, openLots, planCosts, sprayWayNow, stumpBlock, tileBlock } from './campaign.ts'
import { HOME_YARD, PARCELS, TRACTS } from './farm.ts'
import { basePrice, gradePrice, harvestPrice, lotValue } from './market.ts'
import { lotCwt, markOdds, skinAt, skinnedShare } from './harvest.ts'
import * as P from './params.ts'
import { housingLimit, hiredCount, hurt, jobSkill, payOf, resting, SKILL_LABEL, subject, willDo } from './people.ts'
import { FIELD_NAMES, JOB_LABEL, jobCost, placeName, pressingWhy, seasonDone, standingBy, tractorsRunning, waitFor, workday } from './season.ts'
import { asks, killByItself } from './advice.ts'
import { H_ROGUED, type BuildingKind, type Campaign, type Cmd, type Job, type JobKind, type KillWhy, type Unit, type UpgradeId, type VarietyId, type World, type YearSummary } from './types.ts'
import { estimateYield, fieldInfo, forecast, today } from './view.ts'
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
  // Asked again of the same farm (the time book, the board's calls and the work that cannot wait each ask at a day's
  // turn), it is answered from the last reckoning: the farm as text says whether anything at all has changed.
  const key = JSON.stringify(c)
  if (last && last.world === world && last.key === key) return last.out.map(o => ({ ...o }))
  const out = outlookOf(world, c, s)
  last = { world, key, out }
  return out.map(o => ({ ...o }))
}
let last: { world: World; key: string; out: JobOutlook[] } | null = null

function outlookOf(world: World, c: Campaign, s: NonNullable<Campaign['season']>): JobOutlook[] {
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
// (outlook: the orders' fates where the caller has just reckoned them)
export function pressing(world: World, c: Campaign, outlook?: JobOutlook[]): Pressing[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const out: Pressing[] = []
  const fate = new Map((outlook ?? jobOutlook(world, c)).map(o => [o.id, o]))
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
    if (f.inField >= 0.5 && !f.weighed && s.frostHaul === s.day && !queued('haul')) want('haul', 'frost is coming for the crop in barrels', 'Your crew won\'t haul until you order it.')
  }
  // After the rest: the date the crew kills by itself is days off.
  return [...out, ...killsAhead(world, c, all)]
}

// The fields whose vines the crew will kill by itself with no order for it, and the day: asked for alone at every
// day's turn (the note that says a date), it does not need the next day played out as the rest of pressing does.
export function killsAhead(world: World, c: Campaign, all = asks(world, c)): Pressing[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const kills: Pressing[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    if (!held(c, i)) continue
    const kill = killByItself(c, i, all)
    if (kill >= 0 && !s.jobs.some(j => j.kind === 'kill' && j.field === i)) {
      kills.push({ kind: 'kill', field: i, job: -1, why: 'the vines are due to be killed', fix: { t: 'job', kind: 'kill', field: i },
        inWay: `The crew kills the vines on ${formatDay(s.year, Math.max(kill, s.day))} unless you keep them up, so the skins set before harvest.` })
    }
  }
  return kills
}

// ---------------------------------------------------------------- money

export interface MoneyPart { label: string; amount: number; id?: string; of?: MoneyPart[] }

export interface MoneyNow {
  cash: number                     // in hand, or owed on the spring loan when below zero
  loan: number                     // owed on the spring loan now (in spring: what beginning the season will borrow)
  stored: number                   // the crop in the potato houses and the cellar, at today's price
  growing: number                  // the crop still in the ground, by the estimate, at today's price
  rest: number                     // what the resting fields' oats and clover bring at the season's close
  wages: number                    // wages still to pay before the year end: the season's, and anyone kept on over the winter
  sprays: number                   // the sprays still to come while the crew keeps the fields sprayed by itself (sprayOutlook)
  penalties: number                // what the open contracts look like costing in penalties (contractOutlook's middle)
  interest: number                 // the bank's interest on what the year end would leave owed
  range: { lo: number; hi: number }   // after, give or take what the crop in the ground may come to
  callRisk: 'none' | 'possible' | 'likely'   // the bank's limit against that: under the middle, or under even the top
  due: { note: number; household: number; mortgage: number; loan: number; total: number }   // what the year end takes, the loan included
  after: number                    // what the farm would have after the year-end bills if every lot sold today
  parts: MoneyPart[]               // the sum that makes after, from the cash in hand
}

// The season is reckoned to close by this day for the wages still to pay, unless its crop is in sooner.
const SEASON_CLOSE = { month: 9, dom: 15 }

// Wages still to pay before the year end: each hired person's pay days to the season's close, the pickers' days to the
// end of the school break, and the winter months of anyone kept on.
function wagesAhead(c: Campaign): number {
  const s = c.season
  let out = 0
  if (c.phase === 'season' && s) {
    const end = s.frozen || seasonDone(c) ? s.day : Math.max(s.day, dayIndex(s.year, SEASON_CLOSE.month, SEASON_CLOSE.dom))
    for (const u of c.crew) {
      if (u.kind === 'farmer' || u.wage <= 0) continue
      for (let d = u.paidTo; d <= end; d += P.WAGE_DAYS) out += payOf(u)
    }
    if (s.pickers) {
      const to = dayIndex(s.year, P.PICKERS_TO.month, P.PICKERS_TO.dom)
      for (let d = s.day; d <= to; d++) if (!(c.sundaysOff && weekday(s.year, d) === SUNDAY)) out += P.PICKER_DAY
    }
  } else if (c.phase === 'cellar') {
    for (const u of c.crew) if (u.kind !== 'farmer' && u.winter !== 'off') out += payOf(u) * Math.max(0, P.WINTER_MONTHS - c.month)
  }
  return out
}

// What a field's crop is worth now, sold and held: what its lots brought, what they would fetch today, what the digger
// has lifted, and the crop still in the ground less the dig. base and harvest: the part valued at today's price and at
// the harvest price, for telling a price's move from the crop's.
interface FieldMoney { revenue: number; base: number; harvest: number; dig: number; lo: number; hi: number }

// "Am I all right?": what the farm would have after the year-end bills if the crop sold today. In spring the plan's
// cost, borrowed when the season begins, is counted as owed.
export function moneyNow(world: World, c: Campaign): MoneyNow {
  return moneyBook(world, c).now
}

function moneyBook(world: World, c: Campaign): { now: MoneyNow; fields: Map<number, FieldMoney> } {
  const fields = new Map<number, FieldMoney>()
  const of = (i: number) => { let x = fields.get(i); if (!x) { x = { revenue: 0, base: 0, harvest: 0, dig: 0, lo: 0, hi: 0 }; fields.set(i, x) } return x }
  const spring = c.phase === 'plan' ? planCosts(c).total : 0
  const cash = c.cash - spring
  const loan = Math.max(0, -cash)
  let stored = 0
  for (const l of c.lots) {
    of(l.field).revenue += l.revenue
    if (!l.open) continue
    const v = lotValue(world, c, l)
    stored += v
    of(l.field).base += v
  }
  let growing = 0, lo = 0, hi = 0, rest = 0
  const s = c.season
  if (c.phase === 'season' && s) {
    for (let i = 0; i < P.FIELD_COUNT; i++) {
      const f = s.fields[i]
      if (f.status === 'rest') rest += P.REST_INCOME
      // What the digger has lifted, in barrels or hauled in, counts at today's price until its lot is made up, less
      // the No. 1 the skins will cost it at the weigh-in (harvest.ts, finishLot).
      const lifting = f.lotId >= 0 ? c.lots.find(l => l.id === f.lotId) : undefined
      const lifted = lifting && !lifting.open && !f.weighed
        ? lotValue(world, c, lifting) - skinnedShare(skinAt(f, lifting.dugDay)) * lifting.grades.no1 * (gradePrice(world, c, lifting, 'no1') - gradePrice(world, c, lifting, 'no2'))
        : 0
      growing += lifted
      if (lifted) of(i).base += lifted
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
      of(i).harvest += e.mean * cwt * perCwt
      of(i).dig += dig
      const fl = e.mean * cwt * perCwt - e.lo * cwt * perCwt * (1 - 1.5 * spread)
      const fh = e.hi * cwt * perCwt * (1 + 1.5 * spread) - e.mean * cwt * perCwt
      lo += fl; hi += fh
      of(i).lo += fl; of(i).hi += fh
    }
  }
  const wages = wagesAhead(c)
  const sprays = c.phase === 'season' && sprayWayNow(c) === 'auto' ? sprayOutlook(world, c).dollars : 0
  // On a due date the buyer charges for what is still short (campaign.ts, settleContracts).
  let penalties = 0
  for (const k of c.contracts) {
    if (k.settled || c.phase === 'plan') continue
    const g = contractOutlook(c, k.variety, k.cwt, k.delivered)
    penalties += Math.max(0, k.cwt - g.mean) * k.price * P.CONTRACT_PENALTY
  }
  const m = mortgageDue(c)
  const mortgage = m.principal + m.interest
  const bills = P.NOTE_PAYMENT + P.LIVING + mortgage
  const due = { note: P.NOTE_PAYMENT, household: P.LIVING, mortgage, loan, total: bills + loan }
  // Debt left after the year end carries at CREDIT_RATE, charged then (campaign.ts, closeYear).
  const owedAt = (x: number) => x < 0 ? -x * P.CREDIT_RATE : 0
  const before = cash + stored + growing + rest - wages - sprays - penalties - bills
  const interest = owedAt(before)
  const after = before - interest
  // The cash now, walked from the year's start: what was sold and what was spent, the spending by kind.
  const spent = c.yearCosts + spring
  const other = c.yearStorage + c.yearRent + c.yearLand + c.yearMortgage + c.yearWorks + c.yearBuilding + c.yearPacking + c.yearPenalties
  const kinds: MoneyPart[] = [
    { label: 'seed and field work', amount: spent - c.yearWages - other - (c.yearEquip ?? 0) }, { label: 'equipment', amount: c.yearEquip ?? 0 },
    { label: 'wages', amount: c.yearWages }, { label: 'rent', amount: c.yearRent }, { label: 'land', amount: c.yearLand },
    { label: 'storage', amount: c.yearStorage }, { label: 'building', amount: c.yearBuilding + c.yearWorks }, { label: 'packing', amount: c.yearPacking },
    { label: 'penalties', amount: c.yearPenalties }, { label: 'mortgage', amount: c.yearMortgage },
  ].filter(p => p.amount >= 0.5).sort((a, b) => b.amount - a.amount)
  const parts: MoneyPart[] = [
    { id: 'start', label: 'Cash at the start of the year', amount: cash - c.yearRevenue + spent },
    { id: 'sold', label: 'Sold so far', amount: c.yearRevenue },
    { id: 'spent', label: 'Spent so far', amount: -spent, of: kinds },
    { id: 'stored', label: 'Stored crop', amount: stored },
    { id: 'growing', label: 'Crop in the ground', amount: growing },
    { id: 'rest', label: 'Oats and clover', amount: rest },
    { id: 'wages', label: 'Wages to the year end', amount: -wages },
    { id: 'sprays', label: 'Sprays still to come', amount: -sprays },
    { id: 'penalties', label: 'Contract penalties', amount: -penalties },
    { id: 'bills', label: 'The bank payment and living costs', amount: -(P.NOTE_PAYMENT + P.LIVING) },
    { id: 'mortgage', label: 'The land mortgage', amount: -mortgage },
    { id: 'interest', label: 'Interest on what\'s left owed', amount: -interest },
  ].filter(p => Math.abs(p.amount) >= 0.5)
  const range = { lo: before - lo - owedAt(before - lo), hi: before + hi - owedAt(before + hi) }
  const callRisk = range.hi < P.CREDIT_LIMIT ? 'likely' : after < P.CREDIT_LIMIT ? 'possible' : 'none'
  return { now: { cash, loan, stored, growing, rest, wages, sprays, penalties, interest, range, callRisk, due, after, parts }, fields }
}

// ---------------------------------------------------------------- the spring plan's cash

// About what a month of the season costs on this plan: the hired people's wages and the potato fields' work.
export function monthCost(c: Campaign): number {
  let wages = 0, potato = 0
  for (const u of c.crew) if (u.kind !== 'farmer') wages += payOf(u)
  c.plans.forEach((p, i) => { if (held(c, i) && p.crop === 'potato') potato++ })
  return wages + potato * P.FIELD_WORK_MONTH
}

// The largest thing the spring plan could leave out, and about what that would save by the season's close: a hired
// person's wages, a rented field with its planting, or a potato field rested instead.
export function planCut(c: Campaign): { what: string; saves: number } | null {
  const pays = 1 + Math.floor((dayIndex(c.year, SEASON_CLOSE.month, SEASON_CLOSE.dom) - dayIndex(c.year, P.SEASON_START.month, P.SEASON_START.dom)) / P.WAGE_DAYS)
  const out: { what: string; saves: number }[] = []
  for (const u of c.crew) if (u.kind !== 'farmer' && u.wage > 0) out.push({ what: `Letting ${u.name.split(' ')[0]} go`, saves: payOf(u) * pays })
  c.plans.forEach((p, i) => {
    if (!held(c, i) || c.fields[i].cover !== 'open') return
    const planting = p.crop === 'potato' ? P.FIELD_COST + (p.seed === 'certified' ? P.SEED_CWT_PER_FIELD * P.CERT_SEED_PER_CWT : 0) : P.REST_COST
    if (c.fields[i].tenure === 'rented') out.push({ what: `Giving up ${FIELD_NAMES[i]}`, saves: PARCELS[i].rent + planting })
    else if (p.crop === 'potato') out.push({ what: `Resting ${FIELD_NAMES[i]}`, saves: planting - P.REST_COST })
  })
  return out.sort((a, b) => b.saves - a.saves)[0] ?? null
}

// The year-end figure as the season will open with it: in spring, the plan begun on a copy of the farm, so the plan and
// the season's first day are one reckoning; through the season and the winter, moneyNow.
export function moneyPlan(world: World, c: Campaign): MoneyNow {
  return begun(world, c) ?? moneyNow(world, c)
}

// The plan begun on a copy, or null when the season could not begin on it (the bank would not lend for it).
function begun(world: World, c: Campaign): MoneyNow | null {
  if (c.phase !== 'plan') return moneyNow(world, c)
  const copy = structuredClone(c)
  return apply(world, copy, { t: 'begin' }).ok ? moneyNow(world, copy) : null
}

// What a command would do to the year-end figure (moneyPlan's), tried on a copy of the farm; null when it can't be given,
// or when it would leave a spring plan the season could not begin on.
export function moneyEffect(world: World, c: Campaign, cmd: Cmd, was = moneyPlan(world, c).after): number | null {
  const copy = structuredClone(c)
  if (!apply(world, copy, cmd).ok) return null
  const now = begun(world, copy)
  return now ? now.after - was : null
}

// The one change to the spring plan that would raise the year-end figure most, and by how much: not buying or hiring
// what this spring added, letting someone go, giving up rented land, planting a resting field or resting a planted one,
// saved seed for certified. null when nothing would raise it.
export function planRescue(world: World, c: Campaign): { what: string; gains: number } | null {
  if (c.phase !== 'plan') return null
  const was = moneyPlan(world, c).after
  const tries: { what: string; cmd: Cmd }[] = []
  for (const b of c.spring?.bought ?? []) tries.push({ what: `Not buying the ${P.UPGRADES[b.upgrade].name.toLowerCase()}`, cmd: { t: 'unbuy', upgrade: b.upgrade } })
  for (const u of c.crew) {
    if (u.kind === 'farmer' || u.wage <= 0) continue
    const fresh = c.spring?.hired.some(x => x.unit === u.id)
    tries.push({ what: `${fresh ? 'Not hiring' : 'Letting'} ${u.name.split(' ')[0]}${fresh ? '' : ' go'}`, cmd: fresh ? { t: 'unhire', unit: u.id } : { t: 'dismiss', unit: u.id } })
  }
  const grown = c.plans.find((p, i) => held(c, i) && p.crop === 'potato')?.variety ?? 'katahdin'
  c.plans.forEach((p, i) => {
    if (!held(c, i) || c.fields[i].cover !== 'open') return
    if (c.fields[i].tenure === 'rented') tries.push({ what: `Giving up ${FIELD_NAMES[i]}`, cmd: { t: 'release', field: i } })
    if (p.crop === 'potato') {
      tries.push({ what: `Resting ${FIELD_NAMES[i]}`, cmd: { t: 'plan', field: i, plan: { ...p, crop: 'rest' } } })
      if (p.seed === 'certified') tries.push({ what: `Saved seed in ${FIELD_NAMES[i]}`, cmd: { t: 'plan', field: i, plan: { ...p, seed: 'saved' } } })
    } else tries.push({ what: `Planting ${FIELD_NAMES[i]}`, cmd: { t: 'plan', field: i, plan: { crop: 'potato', variety: grown, seed: 'certified' } } })
  })
  let best: { what: string; gains: number } | null = null
  for (const t of tries) {
    const d = moneyEffect(world, c, t.cmd, was)
    if (d !== null && d >= 0.5 && (!best || d > best.gains)) best = { what: t.what, gains: d }
  }
  return best
}

// ---------------------------------------------------------------- why the year-end figure moved

// A move of the year-end figure at least this large is said with its cause: about 5% of the yearly bills.
export const MONEY_STEP = 1000

// What happened to a field, and what the grower can see of it that day (fieldInfo): what the cause of a move is read from.
interface FieldFacts {
  status: string; samples: number; set: boolean; dead: boolean; killed: boolean; rogued: number; frost: number; dug: number; weighed: boolean; revenue: number
  sprouted: number; broke: number
  moisture: number; wilt: number; blight: number; blightHills: number; protect: number; unsprayed: number; frosted: number; stunted: number; weedy: boolean
  scab: number; scabbing: boolean
}

// The year-end figure as parts that hold still when crop turns into cash: the year's opening cash, each field's crop
// (what it brought, what is held, what is in the ground), and the year's spending and income by kind, each counting
// what is still to come. They sum to MoneyNow.after.
export interface MoneyLook {
  year: number; phase: string; after: number; day: number
  flows: Record<string, number>
  // Each field's crop held at today's price and at the harvest price, with its variety and what has happened to it.
  fields: Record<number, { base: number; harvest: number; variety: VarietyId; facts: FieldFacts | null }>
  prices: Record<string, { base: number; harvest: number }>
  crew: { id: number; name: string }[]
  pickers: boolean; contracts: number; sold: number
}

export function moneyLook(world: World, c: Campaign): MoneyLook {
  const { now, fields } = moneyBook(world, c)
  let lotRevenue = 0
  for (const l of c.lots) lotRevenue += l.revenue
  const otherCosts = c.yearStorage + c.yearRent + c.yearLand + c.yearMortgage + c.yearWorks + c.yearBuilding + c.yearPacking + c.yearPenalties
  const flows: Record<string, number> = {
    start: now.cash - c.yearRevenue + c.yearCosts,
    wages: -(c.yearWages + now.wages),
    orders: -(c.yearCosts - c.yearWages - otherCosts),
    sprays: -now.sprays,
    rest: c.yearRest + now.rest,
    penalties: -(c.yearPenalties + now.penalties),
    storage: -c.yearStorage, rent: -c.yearRent, land: -c.yearLand, contractor: -c.yearWorks, building: -c.yearBuilding, packing: -c.yearPacking,
    mortgage: -(c.yearMortgage + now.due.mortgage),
    bills: -(P.NOTE_PAYMENT + P.LIVING),
    logs: c.yearLogs,
    other: c.yearRevenue - lotRevenue - c.yearRest - c.yearLogs,
    interest: -now.interest,
  }
  const out: MoneyLook['fields'] = {}
  const prices: MoneyLook['prices'] = {}
  const s = c.season
  for (const [i, m] of fields) {
    flows[`crop:${i}`] = m.revenue + m.base + m.harvest - m.dig
    const f = s?.fields[i]
    const lot = c.lots.find(l => l.field === i)
    const id = f && f.status !== 'off' && f.status !== 'rest' ? f.variety : lot?.variety ?? 'katahdin'
    prices[id] ??= { base: basePrice(world, c, id), harvest: harvestPrice(world, c, id) }
    let rogued = 0
    if (f) for (let h = 0; h < f.hState.length; h++) if (f.hState[h] & H_ROGUED) rogued++
    const fi = f && s ? fieldInfo(c, i) : null
    out[i] = {
      base: m.base, harvest: m.harvest, variety: id,
      facts: f && s && fi ? {
        status: f.status, samples: f.samples.length, set: f.tiDay >= 0, dead: f.deadDay >= 0, killed: f.killDay >= 0, rogued,
        frost: c.lots.filter(l => l.field === i).reduce((a, l) => a + l.loss.frost, 0), dug: f.digDone, weighed: f.weighed, revenue: m.revenue,
        sprouted: c.lots.filter(l => l.field === i && l.sprouted).length, broke: c.lots.filter(l => l.field === i && l.broke).length,
        moisture: fi.moisture, wilt: fi.wilt, blight: fi.blightKnown, blightHills: fi.blightHills, protect: fi.protect,
        unsprayed: f.lastSpray >= 0 ? s.day - f.lastSpray : -1, frosted: fi.frosted, stunted: fi.stunted,
        weedy: !f.weeded && f.closeDay >= 0, scab: f.tiDay >= 0 ? markOdds(f, c.fields[i].soil).scab : 0,
        scabbing: f.tiDay >= 0 && s.day - f.tiDay <= P.SCAB_DAYS,
      } : null,
    }
  }
  return {
    year: c.year, phase: c.phase, after: now.after, day: s?.day ?? c.month, flows, fields: out, prices,
    crew: c.crew.filter(u => u.kind !== 'farmer').map(u => ({ id: u.id, name: u.name })), pickers: !!s?.pickers, contracts: c.yearContracts, sold: lotRevenue,
  }
}

export interface MoneyCause {
  amount: number                   // the move of the year-end figure
  part: string                     // the part that moved it (a MoneyLook flow, 'price', or 'crops' for several fields)
  share: number                    // that part's share of the move
  text: string                     // why, in a few words: "Brook Field dry"
  field?: number                   // the field it is in, when it is one field's
  remedy?: JobKind                 // the order that would help, when there is one
  why?: FieldWhy                   // what was seen in that field to say so
}

// What the grower can see that is taking a field's crop down, worst first: drying out, scab being set by dry soil while
// the potatoes size up, blight on the leaf (with how long since it was sprayed), frost on the leaf, virus, weeds
// where it was never hilled. '' when nothing seen explains it.
export type FieldWhy = '' | 'dry' | 'scab' | 'blight' | 'frost' | 'virus' | 'weeds'

export function fieldWhy(now: FieldFacts, was?: FieldFacts | null): FieldWhy {
  const seen: [FieldWhy, number][] = [
    ['scab', was && now.scab > was.scab + 0.005 ? 1 : 0],
    ['dry', now.dead ? 0 : Math.max(now.wilt, (0.45 - now.moisture) / 0.45)],
    ['blight', now.dead ? 0 : now.blight * 4 + (now.blightHills > 0 ? 0.15 : 0)],
    ['frost', now.frosted],
    ['virus', now.stunted],
    ['weeds', now.weedy && !now.dead ? 0.2 : 0],
  ]
  const top = seen.filter(([, x]) => x >= 0.15).sort((p, q) => q[1] - p[1])[0]
  return top ? top[0] : ''
}

// The order that helps with what was seen, while it still can.
function remedyFor(why: FieldWhy, f: FieldFacts): JobKind | undefined {
  if (why === 'dry' || (why === 'scab' && f.scabbing && f.moisture < 0.5)) return 'water'
  if (why === 'blight' && f.protect < 0.35) return 'spray'
  return undefined
}

// Why the year-end figure moved between two looks in the same year, when it moved by MONEY_STEP or more: the part
// that moved most the same way, a price's move told from the crop's, and the fields together when no one field
// carries half of it. Its words are five or so, for the board's word budget.
export function moneyCause(a: MoneyLook, b: MoneyLook): MoneyCause | null {
  const amount = b.after - a.after
  if (a.year !== b.year || Math.abs(amount) < MONEY_STEP) return null
  const d: Record<string, number> = {}
  for (const k of new Set([...Object.keys(a.flows), ...Object.keys(b.flows)])) d[k] = (b.flows[k] ?? 0) - (a.flows[k] ?? 0)
  // A price's move: what the crop held before is worth at the new prices.
  let price = 0
  const moved: Record<string, number> = {}
  for (const [key, was] of Object.entries(a.fields)) {
    const pa = a.prices[was.variety], pb = b.prices[was.variety]
    if (!pa || !pb) continue
    const p = (pa.base > 0 ? was.base * (pb.base / pa.base - 1) : 0) + (pa.harvest > 0 ? was.harvest * (pb.harvest / pa.harvest - 1) : 0)
    d[`crop:${key}`] -= p
    price += p
    moved[was.variety] = (moved[was.variety] ?? 0) + p
  }
  d.price = price
  const sign = Math.sign(amount)
  const ranked = Object.entries(d).filter(([, x]) => x * sign > 0).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
  let [part, x] = ranked[0] ?? ['other', amount]
  // No one part carries half: the fields together, or in the winter a month of keeping (the charge, shrink and rot).
  const crops = Object.entries(d).filter(([k]) => k.startsWith('crop:')).reduce((t, [, v]) => t + v, 0)
  const keeping = b.phase === 'cellar' ? crops + d.storage + d.packing : 0
  if (Math.abs(x) < Math.abs(amount) / 2) {
    if (keeping * sign >= Math.abs(amount) / 2) { part = 'keeping'; x = keeping }
    else if (crops * sign >= Math.abs(amount) / 2) { part = 'crops'; x = crops }
  }
  const out: MoneyCause = { amount, part, share: x / amount, text: '' }
  out.text = causeText(a, b, part, x, d, moved, out)
  return out
}

// The cause as a person says it, its subject first: "Brook Field dry", "Lucien's wages to year end". A field's fall
// is put down to what the grower can see in it (fieldWhy), with the order that helps; only when nothing seen explains
// it is it the plain "looks lighter".
function causeText(a: MoneyLook, b: MoneyLook, part: string, x: number, d: Record<string, number>, moved: Record<string, number>, out: MoneyCause): string {
  const up = x > 0
  const first = (name: string) => name.split(' ')[0]
  const seen = (i: number, name: string, many: boolean): string => {
    const was = a.fields[i]?.facts, now = b.fields[i]?.facts
    const why = now && !up ? fieldWhy(now, was) : ''
    if (!now || !why) return ''
    out.field = i
    out.why = why
    out.remedy = remedyFor(why, now)
    const days = now.unsprayed
    switch (why) {
      case 'dry': return many ? `Fields dry, ${name} worst` : `${name} dry`
      case 'scab': return `Scab in ${name}, dry soil`
      case 'blight': return now.protect >= 0.35 ? `Blight in ${name}` : days < 0 ? `Blight in ${name}, never sprayed` : `${name} unsprayed ${days} days`
      case 'frost': return `Frost hit ${name}`
      case 'virus': return `Virus in ${name}`
      default: return `Weeds in ${name}, never hilled`
    }
  }
  if (part === 'price') {
    const ids = Object.entries(moved).filter(([, p]) => Math.sign(p) === Math.sign(x)).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))
    return ids.length === 1 || (ids.length && Math.abs(ids[0][1]) >= Math.abs(x) * 0.8) ? `${variety(ids[0][0] as VarietyId).name} price ${up ? 'rose' : 'fell'}` : `Potato prices ${up ? 'rose' : 'fell'}`
  }
  if (part === 'keeping') {
    const facts = (l: MoneyLook) => Object.values(l.fields).map(f => f.facts).filter(f => !!f)
    const count = (l: MoneyLook, k: 'sprouted' | 'broke') => facts(l).reduce((t, f) => t + f![k], 0)
    if (!up && count(b, 'broke') > count(a, 'broke')) return 'Rot in the potato house'
    if (!up && count(b, 'sprouted') > count(a, 'sprouted')) return 'Stored crop sprouted'
    return up ? 'Stored crop' : 'Storage, shrink and rot'
  }
  if (part === 'crops') {
    const top = Object.entries(d).filter(([k, v]) => k.startsWith('crop:') && Math.sign(v) === Math.sign(x)).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0]
    if (!top) return `Fields look ${up ? 'heavier' : 'lighter'}`
    const i = Number(top[0].slice(5))
    return seen(i, FIELD_NAMES[i], true) || `Fields look ${up ? 'heavier' : 'lighter'}, ${FIELD_NAMES[i]} most`
  }
  if (part.startsWith('crop:')) {
    const i = Number(part.slice(5))
    const name = FIELD_NAMES[i]
    const was = a.fields[i]?.facts, now = b.fields[i]?.facts
    if (!now) return `Crop from ${name}`
    if (was && was.status !== 'lost' && now.status === 'lost') return `${name} left in the ground`
    if (now.revenue > (was?.revenue ?? 0) + 0.5) return b.contracts > a.contracts + 0.5 ? `${name} delivered on contract` : `${name} sold`
    if (now.weighed && !was?.weighed) return `${name} weighed in ${up ? 'heavy' : 'light'}`
    if (now.killed && !was?.killed) return `Vines killed in ${name}`
    if (now.dead && !was?.dead) return `Vines died in ${name}`
    if (now.rogued > (was?.rogued ?? 0)) return `Blight pulled in ${name}`
    if (now.frost > (was?.frost ?? 0) + 0.5) return `Barrels froze in ${name}`
    if (now.dug > (was?.dug ?? 0)) return `${name} dug ${up ? 'heavy' : 'light'}`
    const told = seen(i, name, false)
    if (told) return told
    if (now.samples > (was?.samples ?? 0)) return `${name}'s test dig came ${up ? 'heavy' : 'light'}`
    if (now.set && !was?.set) return `Tubers set in ${name}`
    return `${name} looks ${up ? 'heavier' : 'lighter'}`
  }
  if (part === 'wages') {
    const hired = b.crew.filter(u => !a.crew.some(w => w.id === u.id))
    const gone = a.crew.filter(u => !b.crew.some(w => w.id === u.id))
    if (!up && hired.length) return `${first(hired[0].name)}'s wages to year end`
    if (up && gone.length) return `No more wages for ${first(gone[0].name)}`
    if (!up && b.pickers && !a.pickers) return 'Pickers\' wages'
    return up ? 'Less to pay in wages' : 'More to pay in wages'
  }
  const WORDS: Record<string, [string, string]> = {
    orders: ['Field work', 'Field work'], sprays: ['Fewer sprays to pay for', 'Keeping the fields sprayed'], rest: ['Oats and clover', 'Oats and clover'],
    penalties: ['Contract nearer filled', 'Contract looks short'], storage: ['Storage', 'Storage'], rent: ['Rent', 'Rent'], land: ['Land', 'Land bought'],
    contractor: ['Contractors', 'Contractors'], building: ['Building', 'Building'], packing: ['Packing', 'Packing'], mortgage: ['Land mortgage', 'Land mortgage'],
    bills: ['Year-end bills', 'Year-end bills'], logs: ['Logs sold', 'Logs'], other: ['Other sales', 'Other costs'],
    interest: ['Less interest owed', 'Interest on what\'s owed'], start: ['Opening cash', 'Opening cash'],
  }
  return (WORDS[part] ?? [part, part])[up ? 0 : 1]
}

// The board's watch on the year-end figure. since: the look the last cause was said from; before: the one before that,
// and part: what that cause was; counted: the year a sale that left the figure where it was has been said.
export interface MoneyWatch { since: MoneyLook; before: MoneyLook | null; part?: string; counted: number }

// A move of MONEY_STEP or more since the last line said, however slowly it came, is said with its cause. Field work
// spent that only takes back the crop's last rise (a cost counted ahead, then paid) is not a change of the figure: it
// is not said, and the line it undoes goes (cancel). A sale that leaves the figure where it was is said once a year. A new year or a
// spring plan starts the watch again.
export function moneyWatch(w: MoneyWatch | null, now: MoneyLook): { cause: MoneyCause | null; watch: MoneyWatch; cancel: boolean } {
  if (!w || w.since.year !== now.year || w.since.phase === 'plan' || now.phase === 'plan') {
    return { cause: null, watch: { since: now, before: null, counted: w && w.since.year === now.year ? w.counted : -1 }, cancel: false }
  }
  const cause = moneyCause(w.since, now)
  if (cause && cause.part === 'orders' && /^(crop|sprays)/.test(w.part ?? '') && w.before && Math.abs(now.after - w.before.after) < MONEY_STEP / 2) {
    return { cause: null, watch: { since: now, before: null, counted: w.counted }, cancel: true }
  }
  if (cause) return { cause, watch: { since: now, before: w.since, part: cause.part, counted: w.counted }, cancel: false }
  if (w.counted !== now.year && now.sold - w.since.sold >= MONEY_STEP && Math.abs(now.after - w.since.after) < MONEY_STEP) {
    return { cause: { amount: 0, part: 'sold', share: 1, text: 'Sold what was already counted' }, watch: { since: now, before: null, counted: now.year }, cancel: false }
  }
  return { cause: null, watch: w, cancel: false }
}

// What a field's crop should come to at the dig, total cwt an acre with its give-or-take: before the tubers set, what
// the variety usually gives on this ground (worn soil and raw ground give less); after, the tubers there now by the
// estimate, and while the vines live, the usual yield's share of the bulking still ahead between tuber set and the day
// the vines are expected to come off (killOutlook). Counted in days from the tubers setting, not by the warmth so far,
// and slow at first as bulking is (x^1.5 (1 - x) + x^2 of it done at x of the days), so the figure neither falls when the
// tubers set nor slides through July and climbs back by September.
export function harvestYield(c: Campaign, field: number): { mean: number; lo: number; hi: number } | null {
  const f = c.season!.fields[field]
  const usual = usualYield(c, field, f.variety)
  const e = estimateYield(c, field)
  if (!e && f.tiDay >= 0) return null
  const s = c.season!
  let toCome = e ? 0 : 1
  if (e && f.deadDay < 0) {
    const off = killOutlook(c, field)?.day ?? s.day
    const span = off - f.tiDay
    const x = span > 0 ? Math.min(1, Math.max(0, s.day - f.tiDay) / span) : 1
    toCome = 1 - (x * Math.sqrt(x) * (1 - x) + x * x)
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
// Days until the ground is fit to plant, as a grower would reckon it: the soil drawn toward each day's mean, from the
// forecast for five days and the usual weather after, and never before the season's earliest planting date. -1 when
// it cannot be told within three months.
export function plantingIn(world: World, c: Campaign): number {
  const s = c.season
  const t = today(world, c)
  if (!s || !t) return -1
  const earliest = dayIndex(s.year, P.PLANT_FROM.month, P.PLANT_FROM.dom)
  const fc = forecast(world, c, 5)
  const nm = world.weather.normals
  let soil = t.soilT
  for (let k = 1; k <= 90; k++) {
    const day = s.day + k
    const f = fc[k - 1]
    const slot = !isLeap(s.year) && day >= 59 ? day + 1 : day
    const mean = f ? (f.hi + f.lo) / 2 : (nm.tmax[slot] + nm.tmin[slot]) / 20
    soil += P.SOIL_T_GAIN * (mean - soil)
    if (day >= earliest && soil >= P.PLANT_SOIL_C) return k
  }
  return -1
}

export function plantReady(world: World, c: Campaign, field: number): PlantReady {
  const s = c.season
  const need = P.PLANT_SOIL_C, rots = P.PLANT_ROT_C
  if (!s) return { ok: false, soilT: 0, need, rots, why: 'Planting happens during the season.' }
  const soilT = s.soilT
  const f = (x: number) => Math.round(x * 9 / 5 + 32)
  // Too early or too cold, said once with the soil's reading and the day to wait for: the card, the advice and the
  // coach all read this sentence.
  if (s.day < dayIndex(s.year, P.PLANT_FROM.month, P.PLANT_FROM.dom) || soilT < need) {
    const wait = plantingIn(world, c)
    const until = wait > 0 ? `wait until about ${formatDay(s.year, s.day + wait)}` : 'wait for it to warm up'
    return { ok: false, soilT, need, rots, why: soilT < need ? `The soil here is ${f(soilT)}°F and seed needs ${f(need)}°F or it can rot, so ${until}.` : `It's too early, since a cold spell can still rot the seed, so ${until}.` }
  }
  if (fieldInfo(c, field).tooWet) return { ok: false, soilT, need, rots, why: 'It\'s too wet to work, but it\'ll dry in a day or two.' }
  return { ok: true, soilT, need, rots, why: `The soil here is ${f(soilT)}°F and dry enough to work.` }
}

