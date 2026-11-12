// What the player needs to see the farm's position: the fate of each order, the work the season cannot wait for, where
// the money stands, the year's story, what goals cost, what keeping the fields sprayed would take, and the one rule
// for planting.
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import { buildBlock, buildCost } from './buildings.ts'
import { apply, held, mortgageDue, openLots, planCosts, stumpBlock, tileBlock } from './campaign.ts'
import { HOME_YARD, PARCELS, TRACTS } from './farm.ts'
import { basePrice, gradePrice, levelToCome, lotValue } from './market.ts'
import { lotCwt, markOdds, skinAt, skinnedShare } from './harvest.ts'
import * as P from './params.ts'
import { housingLimit, hiredCount, hurt, jobSkill, resting, SKILL_LABEL, willDo } from './people.ts'
import { jobCost, pressingWhy, standingBy, tractorsRunning, waitFor, workday } from './season.ts'
import { asks, killByItself } from './advice.ts'
import type { BuildingKind, Campaign, Cmd, Job, JobKind, KillWhy, UpgradeId, World, YearSummary } from './types.ts'
import { estimateYield, fieldInfo } from './view.ts'
import { getDay } from './weather.ts'
import { variety } from './varieties.ts'

// ---------------------------------------------------------------- each order's fate

export interface JobOutlook {
  id: number
  unit: number                     // who will take it: a person's id, or -1 when nobody will
  when: 'now' | 'next' | 'waiting' // worked on the next day; taken once the work ahead of it is done; held up
  why: string                      // in plain words
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
    if (w) return { id: j.id, unit: w.unit, when: 'now', why: `${nameOf(c, w.unit)} is on it.` }
    if (dropped.has(j.id)) return { id: j.id, unit: -1, when: 'waiting', why: `It leaves the list in the morning: ${dropped.get(j.id)}` }
    const who = takers(c, j)
    if (!who.length) return { id: j.id, unit: -1, when: 'waiting', why: nobody(c, j) }
    if (!working) return { id: j.id, unit: who[0], when: 'next', why: 'Sunday: nobody works today.' }
    const weather = waitFor(c, s, j, d)
    if (weather) return { id: j.id, unit: who[0], when: 'waiting', why: `Waiting: ${weather}.` }
    if (jobSkill(j.kind) === 'machine' && tractorsRunning(c, s.day) === 0 && !(j.kind === 'haul' && c.upgrades.truck)) {
      return { id: j.id, unit: who[0], when: 'waiting', why: 'Waiting for a tractor: every tractor is broken down.' }
    }
    const ahead = place
    return { id: j.id, unit: who[0], when: 'next', why: ahead ? `${nameOf(c, who[0])} takes it once the ${ahead === 1 ? 'order' : `${ahead} orders`} ahead of it are done.` : `${nameOf(c, who[0])} takes it next.` }
  })
}

function nameOf(c: Campaign, id: number): string {
  return c.crew.find(u => u.id === id)?.name ?? 'Someone'
}

// Who could take an order now, best first: those who may take it, are not hurt or resting, by their priority for it.
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
    if (!u) return 'Nobody: the person it was given to has gone.'
    if (hurt(u, day)) return `${u.name}, who it was given to, is hurt.`
    if (resting(u)) return `${u.name}, who it was given to, is resting.`
    return `${u.name}, who it was given to, will not do ${label}.`
  }
  const willing = c.crew.filter(u => !u.foreman && willDo(u, j.kind))
  if (!willing.length) return `Nobody on the farm will do ${label}: set someone's priority for it.`
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
    if (!why || !o || o.when === 'now' || (o.when === 'next' && o.unit >= 0 && !/Sunday/.test(o.why))) continue
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
      want('spray', 'blight weather will not wait', f.lastSpray >= 0
        ? `Sprayed on ${formatDay(s.year, f.lastSpray)}, and that has worn thin. Each order is one pass: spraying waits for your order.`
        : 'Not sprayed yet this season. Spraying waits for your order.')
    }
    // After the rest: the date the crew kills by itself is days off.
    const kill = killByItself(c, i, all)
    if (kill >= 0 && !queued('kill')) {
      kills.push({ kind: 'kill', field: i, job: -1, why: 'the vines are due to come off', fix: { t: 'job', kind: 'kill', field: i },
        inWay: `The crew kills the vines on ${formatDay(s.year, Math.max(kill, s.day))} unless you keep them up, so the skins set before the dig.` })
    }
    if (f.inField >= 0.5 && !f.weighed && s.frostHaul === s.day && !queued('haul')) want('haul', 'a frost is coming on the barrels', 'Hauling waits for your order.')
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
      if (f.status !== 'growing' && f.status !== 'dead' && f.status !== 'digging') continue
      const e = estimateYield(c, i)
      if (!e) continue
      const left = f.status === 'digging' ? 1 - f.digDone / P.HILLS : 1
      // The rest at what a cwt of the usual crop brings, leaning on what this field's own has brought as the digger
      // gets further in; it cannot be sold before it is lifted, by when the year's price level has come further in.
      const dug = lifting ? lotCwt(lifting) + lifting.grades.cull : 0
      const odds = markOdds(f, c.fields[i].soil)
      const usual = (P.MARKETABLE_SHARE - P.MARKETABLE_NO2 * (odds.scab + (1 - odds.scab) * odds.knob)) * basePrice(world, c, f.variety)
      const own = dug >= 1 ? 1 - left : 0
      const perCwt = (usual * (1 - own) + (own > 0 ? lifted / dug : 0) * own) * levelToCome(world, c, f.variety)
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
    { label: cash >= 0 ? 'Cash in hand' : 'Owed on the spring loan', amount: cash },
    { label: 'The crop in store, at today\'s price', amount: stored },
    { label: 'The crop in the ground, by the estimate', amount: growing },
    { label: 'The note', amount: -P.NOTE_PAYMENT },
    { label: 'The household', amount: -P.LIVING },
    { label: 'The land mortgage', amount: -mortgage },
  ].filter(p => Math.abs(p.amount) >= 0.5).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  return { cash, loan, stored, growing, range: { lo: after - lo, hi: after + hi }, due, after, parts }
}

export interface YearStory { year: number; began: number; ended: number; reasons: MoneyPart[] }

// The year-end sentence: began with, ends with, and the three largest reasons, from the year's ledger.
export function yearStory(y: YearSummary): YearStory {
  const other = y.revenue - y.restIncome - y.contracts - y.logs - y.stand
  const growingCost = y.costs - y.wages - y.rent - y.land - y.storage - y.building - y.works - y.mortgage - y.penalties - y.packing
  const lines: MoneyPart[] = [
    { label: 'Potatoes sold', amount: other },
    { label: 'Contract deliveries', amount: y.contracts },
    { label: 'Oats and clover', amount: y.restIncome },
    { label: 'Logs and the farm stand', amount: y.logs + y.stand },
    { label: 'Growing the fields, equipment and the jobs', amount: -growingCost },
    { label: 'Wages', amount: -y.wages },
    { label: 'Rent and land', amount: -(y.rent + y.land + y.mortgage) },
    { label: 'Buildings and contractors', amount: -(y.building + y.works) },
    { label: 'Storage and packing', amount: -(y.storage + y.packing) },
    { label: 'Contract penalties', amount: -y.penalties },
    { label: 'The note and the household', amount: -(y.note + y.living) },
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
  const cash = (cost: number) => c.cash - cost >= 0 ? '' : `It costs $${withCommas(cost)}; the farm has $${withCommas(Math.max(0, c.cash))} in hand.`
  const tract = TRACTS.find(i => c.fields[i].tenure !== 'none' && c.fields[i].cover === 'stumps') ?? -1
  out.push({ id: 'stump', label: 'Pull the stumps', cost: P.STUMP_FEE, can: tract >= 0 && !stumpBlock(c, tract), why: tract < 0 ? 'No tract the farm holds is felled to the stumps.' : stumpBlock(c, tract) })
  const bottom = c.fields.findIndex((f, i) => f.tenure === 'owned' && f.cover === 'open' && f.elev === 0 && !f.tiled && i >= 0)
  out.push({ id: 'tile', label: 'Lay tile drains', cost: P.TILE_FEE, can: bottom >= 0 && !tileBlock(c, bottom), why: bottom < 0 ? 'The farm owns no bottom land without tile.' : tileBlock(c, bottom) })
  for (const kind of P.BUILDING_KINDS as BuildingKind[]) {
    const cost = buildCost(c, kind).total
    const why = buildBlock(c, kind, HOME_YARD, holdsAnyDufour(c))
    out.push({ id: `build:${kind}`, label: P.BUILDINGS[kind].name, cost, can: !why, why })
  }
  for (const id of Object.keys(P.UPGRADES) as UpgradeId[]) {
    const u = P.UPGRADES[id]
    const why = c.upgrades[id] ? 'Owned already.' : c.phase !== 'plan' ? 'Equipment is bought in spring.' : cash(u.cost)
    out.push({ id: `buy:${id}`, label: u.name, cost: u.cost, can: !why, why })
  }
  const roomWhy = hiredCount(c) >= housingLimit(c) ? 'Every place to live is taken: a bunkhouse gives six more.' : c.phase !== 'plan' && c.phase !== 'season' ? 'People are hired in spring or during the season.' : ''
  out.push({ id: 'hire', label: 'Hire someone', cost: P.HAND_WAGE, can: !roomWhy, why: roomWhy })
  const hand = c.crew.find(u => u.kind !== 'farmer' && !u.foreman)
  const foremanWhy = !hand ? 'A foreman is someone hired: hire someone first.' : ''
  out.push({ id: 'foreman', label: 'Name a foreman', cost: hand ? Math.round(hand.wage * (P.FOREMAN_PAY - 1)) : Math.round(P.HAND_WAGE * (P.FOREMAN_PAY - 1)), can: !foremanWhy, why: foremanWhy })
  const field = PARCELS.findIndex((p, i) => p.holding === 'field' && c.fields[i].tenure === 'none')
  if (field >= 0) {
    const rent = PARCELS[field].rent
    out.push({ id: 'rent', label: 'Rent a field', cost: rent, can: c.phase === 'plan', why: c.phase === 'plan' ? '' : 'Land is rented in spring.' })
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
  if (!s) return { ok: false, soilT: 0, need, rots, why: 'Planting is in the season.' }
  const soilT = s.soilT
  const f = (x: number) => Math.round(x * 9 / 5 + 32)
  if (s.day < dayIndex(s.year, P.PLANT_FROM.month, P.PLANT_FROM.dom)) return { ok: false, soilT, need, rots, why: 'It is early. Seed sits and rots in cold ground.' }
  if (soilT < need) return { ok: false, soilT, need, rots, why: `The soil here is ${f(soilT)}°F. Seed wants ${f(need)}°F; below ${f(rots)}°F it rots.` }
  if (fieldInfo(c, field).tooWet) return { ok: false, soilT, need, rots, why: 'Too wet to work: it will dry in a day or two.' }
  return { ok: true, soilT, need, rots, why: `The soil here is ${f(soilT)}°F and fit to work.` }
}

