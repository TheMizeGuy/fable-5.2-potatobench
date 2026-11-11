import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd } from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'
import { REPLAY, runReplay } from './replay.ts'

const world = loadWorld()
const YEARS = S.startYears(world)
const VARIETIES = S.VARIETIES.map(v => v.id)
const H_MAX = S.H_EMERGED | S.H_VIRUS | S.H_ROGUED | S.H_SAMPLED | S.H_DUG | S.H_KNOWN | S.H_SEEDBLIGHT | S.H_DECAYED | S.H_WILT

type Step = Cmd | { t: 'days'; n: number } | { t: 'sellPick'; k: number; frac: number } | { t: 'seedPick'; k: number; fields: number }
  | { t: 'assignPick'; k: number; unit: number } | { t: 'acceptPick'; k: number } | { t: 'deliverPick'; k: number; j: number }
  | { t: 'dismissPick'; k: number } | { t: 'jobPick'; kind: S.JobKind; field: number; k: number }
  | { t: 'hirePick'; k: number } | { t: 'raisePick'; k: number; wage: number } | { t: 'priorityPick'; k: number; work: string; level: number }
  | { t: 'foremanPick'; k: number; block: string | null } | { t: 'winterPick'; k: number; work: string; field: number }

const index = fc.integer({ min: -2, max: S.FIELD_COUNT + 1 })
const id = fc.integer({ min: -1, max: 60 })
const unit = fc.integer({ min: -2, max: 6 })
const amount = fc.oneof(fc.double({ min: -1, max: 3 }), fc.constantFrom(0, 0.25, 0.5, 1, 1.5, 2, NaN, Infinity, -Infinity, -0))
const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ t: fc.constant('plan' as const), field: index, plan: fc.record({ crop: fc.constantFrom('potato' as const, 'rest' as const), variety: fc.constantFrom(...VARIETIES), seed: fc.constantFrom('certified' as const, 'saved' as const) }) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('buy' as const), upgrade: fc.constantFrom('boom' as const, 'harvester' as const, 'vent' as const, 'reel' as const, 'tractor2' as const, 'house2' as const) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constantFrom('rent' as const, 'release' as const, 'buyLand' as const), field: index }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('hire' as const), kind: fc.constantFrom('hand' as const, 'operator' as const, 'farmer' as const) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('dismiss' as const), unit }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('dismissPick' as const), k: fc.nat(8) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('acceptPick' as const), k: fc.nat(5) }) },
  { weight: 3, arbitrary: fc.constant({ t: 'begin' as const }) },
  { weight: 6, arbitrary: fc.record({ t: fc.constant('job' as const), kind: fc.constantFrom(...S.JOBS), field: index }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('job' as const), kind: fc.constantFrom(...S.JOBS), field: index, unit }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('jobPick' as const), kind: fc.constantFrom(...S.JOBS), field: index, k: fc.nat(8) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('assignPick' as const), k: fc.nat(20), unit }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('deliverPick' as const), k: fc.nat(20), j: fc.nat(5) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('deliver' as const), lot: fc.integer({ min: -1, max: 14 }), contract: fc.integer({ min: -1, max: 3 }) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('cancel' as const), id }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('bump' as const), id }) },
  { weight: 3, arbitrary: fc.constant({ t: 'day' as const }) },
  { weight: 5, arbitrary: fc.record({ t: fc.constant('days' as const), n: fc.integer({ min: 1, max: 45 }) }) },
  { weight: 1, arbitrary: fc.constant({ t: 'endSeason' as const }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('sell' as const), lot: fc.integer({ min: -1, max: 14 }), frac: amount }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('seed' as const), lot: fc.integer({ min: -1, max: 14 }), fields: amount }) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('sellPick' as const), k: fc.nat(20), frac: amount }) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('job' as const), kind: fc.constantFrom('dig' as const, 'kill' as const), field: fc.integer({ min: 0, max: 7 }) }) },
  { weight: 6, arbitrary: fc.record({ t: fc.constant('seedPick' as const), k: fc.nat(20), fields: amount }) },
  { weight: 3, arbitrary: fc.constant({ t: 'month' as const }) },
  { weight: 2, arbitrary: fc.constant({ t: 'next' as const }) },
  // People.
  { weight: 2, arbitrary: fc.record({ t: fc.constant('hirePick' as const), k: fc.nat(5) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('hire' as const), applicant: fc.integer({ min: -1, max: 300000 }) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('raisePick' as const), k: fc.nat(8), wage: fc.oneof(fc.integer({ min: -100, max: 5000 }), fc.constantFrom(NaN, Infinity, 450, 450.4, 99, 4001)) }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('priorityPick' as const), k: fc.nat(8), work: fc.constantFrom(...S.SKILLS, 'golf'), level: fc.oneof(fc.integer({ min: -1, max: 5 }), fc.constant(1.5)) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('foremanPick' as const), k: fc.nat(8), block: fc.constantFrom('home', 'brook', 'ridge', 'dufour', 'moon', null) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('sundays' as const), off: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('pickers' as const), on: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('winterPick' as const), k: fc.nat(8), work: fc.constantFrom('off', 'woods', 'pack', 'build', 'golf'), field: index }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('winterPick' as const), k: fc.nat(8), work: fc.constant('woods'), field: fc.constantFrom(...S.TRACTS) }) },
  // Land and materials.
  { weight: 3, arbitrary: fc.record({ t: fc.constant('job' as const), kind: fc.constantFrom('fell' as const, 'rocks' as const, 'brush' as const), field: fc.oneof(index, fc.constantFrom(...S.TRACTS)) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constantFrom('stump' as const, 'tile' as const), field: fc.oneof(index, fc.constantFrom(...S.TRACTS)) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('tile' as const), field: fc.constantFrom(4, 5, 6, 7) }) },
  // Buildings.
  { weight: 3, arbitrary: fc.record({ t: fc.constant('build' as const), kind: fc.constantFrom(...S.BUILDING_KINDS, 'castle' as S.BuildingKind), yard: fc.constantFrom(-1, -1, -2, 0, -3) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('buy' as const), upgrade: fc.constantFrom('tractor3' as const, 'truck' as const) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('sellLogs' as const), loads: fc.oneof(fc.double({ min: -2, max: 60 }), fc.constantFrom(NaN, Infinity, 0, 1, 5)) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('payMortgage' as const), amount: fc.oneof(fc.double({ min: -100, max: 30000 }), fc.constantFrom(NaN, Infinity, 0, 1000)) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant('buyLand' as const), field: fc.constantFrom(...S.TRACTS) }) },
)

function nonFinite(v: unknown, path: string, out: string[]): void {
  if (out.length > 3) return
  if (typeof v === 'number') { if (!Number.isFinite(v)) out.push(`${path} = ${v}`); return }
  if (Array.isArray(v)) { v.forEach((x, i) => nonFinite(x, `${path}[${i}]`, out)); return }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) nonFinite(x, `${path}.${k}`, out)
}

// Every hill and field quantity inside its range; returns what is out of range.
function outOfRange(c: Campaign): string[] {
  const bad: string[] = []
  const check = (ok: boolean, what: string) => { if (!ok && bad.length < 4) bad.push(what) }
  for (const [fi, f] of (c.season?.fields ?? []).entries()) {
    for (let i = 0; i < f.hState.length; i++) {
      check(Number.isInteger(f.hState[i]) && f.hState[i] >= 0 && f.hState[i] <= H_MAX, `field ${fi} hState[${i}] ${f.hState[i]}`)
      check(f.hC[i] >= 0 && f.hC[i] <= 1, `field ${fi} hC[${i}] ${f.hC[i]}`)
      check(f.hLes[i] >= 0 && f.hLes[i] <= 1, `field ${fi} hLes[${i}] ${f.hLes[i]}`)
      check(f.hLat[i] >= 0, `field ${fi} hLat[${i}] ${f.hLat[i]}`)
      check(f.hMass[i] >= 0, `field ${fi} hMass[${i}] ${f.hMass[i]}`)
      check(Number.isInteger(f.hN[i]) && f.hN[i] >= 0, `field ${fi} hN[${i}] ${f.hN[i]}`)
      check(f.hTb[i] >= 0, `field ${fi} hTb[${i}] ${f.hTb[i]}`)
    }
    const taw = S.TAW_MM[c.fields[fi].elev]   // a tiled field holds less, so this is the most any field can hold
    check(f.canopy >= 0 && f.canopy <= 1 && f.green >= 0 && f.green <= f.canopy + 1e-12, `field ${fi} canopy ${f.canopy} green ${f.green}`)
    check(f.residue >= 0 && f.residue <= 1, `field ${fi} residue ${f.residue}`)
    check(f.dr >= 0 && f.dr <= taw, `field ${fi} dr ${f.dr}`)
    check(f.wet >= 0 && f.cover >= 0 && f.cover <= 1, `field ${fi} wet ${f.wet} cover ${f.cover}`)
    check(f.sev >= 0 && f.sev <= 1 && f.knownSev >= 0 && f.knownSev <= 1, `field ${fi} sev ${f.sev}`)
    check(f.frostT >= 0 && f.frostT <= 0.9, `field ${fi} frostT ${f.frostT}`)
  }
  for (const l of c.lots) {
    for (const [g, v] of Object.entries(l.grades)) check(v >= 0, `lot ${l.id} ${g} ${v}`)
    check(l.skinned >= 0 && l.sold >= 0 && l.revenue >= 0, `lot ${l.id} skinned ${l.skinned} sold ${l.sold}`)
  }
  for (const f of c.fields) {
    check(f.soil >= 0 && f.soil <= 1 && f.vert > 0 && f.vert < 1, `soil ${f.soil} vert ${f.vert}`)
    check(f.stones >= 0 && f.stones <= 1 && f.felled >= 0 && ['open', 'woods', 'brush', 'stumps'].includes(f.cover), `stones ${f.stones} felled ${f.felled} cover ${f.cover}`)
    check(!f.works || (f.works.left > 0 && Number.isInteger(f.works.left)), `works ${JSON.stringify(f.works)}`)
  }
  check(c.logs >= 0 && c.stone >= 0, `logs ${c.logs} stone ${c.stone}`)
  check(c.pond >= 0 && c.pond <= S.POND_CAP, `pond ${c.pond}`)
  for (const b of c.buildings) {
    check(b.done >= 0 && b.done <= b.need && b.built === (b.done >= b.need), `building ${JSON.stringify(b)}`)
    check(c.buildings.filter(x => x.kind === b.kind && x.yard === b.yard).length === 1, `two ${b.kind} at ${b.yard}`)
    check(b.yard === -1 || (b.yard === -2 && S.BUILDINGS[b.kind].dufour), `${b.kind} at ${b.yard}`)
  }
  for (const l of c.lots) check(l.packed >= 0 && l.packed <= 1, `lot ${l.id} packed ${l.packed}`)
  for (const m of c.mortgages) check(m.owed > 0 && m.owed <= m.loan + 1e-6 && c.fields[m.field].tenure === 'owned', `mortgage ${JSON.stringify(m)}`)
  check(c.fields.length === S.FIELD_COUNT && c.plans.length === S.FIELD_COUNT, 'one field and one plan per parcel')
  check(c.fields.slice(0, S.HOME_FIELDS).every(f => f.tenure === 'owned'), 'the home six stay owned')
  // The people: one farmer, id 0; no more hired than the farm can house; each person's numbers in range.
  const crew = c.crew
  const place = (p: number) => Number.isInteger(p) && p >= -2 && p < S.FIELD_COUNT
  check(crew.filter(u => u.kind === 'farmer').length === 1 && crew[0].id === 0 && crew[0].kind === 'farmer', 'one farmer, first')
  check(new Set(crew.map(u => u.id)).size === crew.length && crew.every(u => u.id < c.nextUnit || u.id === 0), 'unit ids unique')
  check(S.hiredCount(c) <= S.housingLimit(c), `${S.hiredCount(c)} hired, room for ${S.housingLimit(c)}`)
  for (const u of crew) {
    check(place(u.at) && place(u.to) && u.road >= 0 && u.road < 1, `unit ${u.id} at ${u.at} to ${u.to} road ${u.road}`)
    check(u.tired >= 0 && u.tired <= 1 && u.mood >= 0 && u.mood <= 1, `unit ${u.id} tired ${u.tired} mood ${u.mood}`)
    for (const k of S.SKILLS) {
      check(Number.isInteger(u.skills[k]) && u.skills[k] >= 0 && u.skills[k] <= S.SKILL_MAX && u.xp[k] >= 0, `unit ${u.id} ${k} ${u.skills[k]} xp ${u.xp[k]}`)
      check(Number.isInteger(u.prio[k]) && u.prio[k] >= 0 && u.prio[k] <= S.PRIORITY_MAX, `unit ${u.id} priority ${k} ${u.prio[k]}`)
    }
    check(u.rig === '' || u.job >= 0, `unit ${u.id} drives a ${u.rig} for no order`)
    check(!u.foreman || u.kind !== 'farmer', 'the farmer is no foreman')
    check(u.wage >= 0 && Number.isFinite(u.wage), `unit ${u.id} wage ${u.wage}`)
  }
  const foremen = crew.filter(u => u.foreman).map(u => u.foreman)
  check(new Set(foremen).size === foremen.length, `two foremen of one block: ${foremen}`)
  check(crew.filter(u => u.rig === 'tractor').length <= S.tractorsOwned(c), 'more tractors driven than the farm owns')
  const held = crew.filter(u => u.job >= 0).map(u => u.job)
  check(new Set(held).size === held.length, `two crews hold one order: ${held}`)
  for (const k of c.contracts) check(k.delivered >= 0 && k.delivered <= k.cwt + 1e-6 && k.paid >= 0 && k.penalty >= 0, `contract ${k.id} ${k.delivered}/${k.cwt}`)
  const s = c.season
  if (s && c.phase === 'season') {
    // Land the farm does not hold is no field; a field in season is held, open ground.
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (c.fields[i].tenure === 'none') check(s.fields[i].status === 'off', `field ${i} not held but ${s.fields[i].status}`)
      if (s.fields[i].status !== 'off') check(c.fields[i].tenure !== 'none' && c.fields[i].cover === 'open', `field ${i} ${s.fields[i].status} on ${c.fields[i].cover}`)
    }
    for (const f of s.fields) check(f.inField >= 0 && (f.inField < 0.5 || f.status === 'digging' || (f.status === 'dug' && !f.weighed)), `crop in the field ${f.inField} ${f.status}`)
    for (const j of s.jobs) {
      if (j.kind === 'build') {
        check(c.buildings.some(b => b.id === j.building && !b.built && b.yard === j.field), `build order ${JSON.stringify(j)}`)
        continue
      }
      check(c.fields[j.field].tenure !== 'none', `order on land the farm does not hold: ${j.kind} ${j.field}`)
      check(s.fields[j.field].status !== 'off' || ['fell', 'rocks', 'brush'].includes(j.kind), `crop order on land that is no field: ${j.kind} ${j.field}`)
      if (j.kind === 'haul') check(!s.fields[j.field].weighed, `haul order for a weighed field ${j.field}`)
      const u = crew.find(x => x.id === j.unit)
      check(j.unit === -1 || (!!u && S.willDo(u, j.kind)), `order ${j.id} pinned to ${j.unit}`)
    }
    // Two crews never work the same order: each order (one kind on one field) was worked by one crew in a day.
    const by = new Map<string, number>()
    // (Two buildings going up in one yard are two orders on the same place; a hauler who empties the barrels lets the
    // order go, and someone else can take it up once more is dug the same day.)
    for (const w of s.worked) {
      if (w.kind === 'build' || w.kind === 'haul') continue
      const key = `${w.kind}:${w.field}`
      check(!by.has(key) || by.get(key) === w.unit, `${key} worked by ${by.get(key)} and ${w.unit}`)
      by.set(key, w.unit)
    }
  }
  return bad
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))

// Cash minus the year's revenue plus its costs: fixed through a year until the ledger closes it.
const ledgerBase = (c: Campaign) => c.cash - c.yearRevenue + c.yearCosts

type Concrete = Cmd | { t: 'days'; n: number }

// Picks name a lot, an order, a unit, an offer or a contract that exists now, so random play sells, keeps seed,
// signs and delivers often enough to matter.
function resolve(c: Campaign, s: Step): Concrete {
  const lot = (k: number) => c.lots.length ? c.lots[k % c.lots.length].id : -1
  const unitAt = (k: number) => c.crew[k % c.crew.length].id
  const jobs = c.season?.jobs ?? []
  if (s.t === 'sellPick') return { t: 'sell', lot: lot(s.k), frac: s.frac }
  if (s.t === 'seedPick') return { t: 'seed', lot: lot(s.k), fields: s.fields }
  if (s.t === 'assignPick') return { t: 'assign', id: jobs.length ? jobs[s.k % jobs.length].id : -1, unit: s.unit < 0 ? -1 : unitAt(s.unit) }
  if (s.t === 'acceptPick') return { t: 'accept', offer: c.offers.length ? c.offers[s.k % c.offers.length].id : -1 }
  if (s.t === 'deliverPick') return { t: 'deliver', lot: lot(s.k), contract: c.contracts.length ? c.contracts[s.j % c.contracts.length].id : -1 }
  if (s.t === 'dismissPick') return { t: 'dismiss', unit: unitAt(s.k) }
  if (s.t === 'jobPick') return { t: 'job', kind: s.kind, field: s.field, unit: unitAt(s.k) }
  if (s.t === 'hirePick') return { t: 'hire', applicant: c.applicants.length ? c.applicants[s.k % c.applicants.length].id : -1 }
  if (s.t === 'raisePick') return { t: 'raise', unit: unitAt(s.k), wage: s.wage }
  if (s.t === 'priorityPick') return { t: 'priority', unit: unitAt(s.k), work: s.work as S.Skill, level: s.level }
  if (s.t === 'foremanPick') return { t: 'foreman', unit: unitAt(s.k), block: s.block as S.BlockId | null }
  if (s.t === 'winterPick') return { t: 'winter', unit: unitAt(s.k), work: s.work as S.WinterWork, field: s.field }
  return s
}

function applyStep(c: Campaign, s: Concrete): { ok: boolean; err: string } {
  if (s.t !== 'days') return S.apply(world, c, s)
  let r = { ok: true, err: '' }
  for (let k = 0; k < s.n && r.ok; k++) r = S.apply(world, c, { t: 'day' })
  return r
}

// The scripted campaign paused at moments when lots are in hand.
function snapshot(stopAt: (c: Campaign) => boolean): Campaign {
  return runReplay(S, world, { ...REPLAY, stopAt }).campaign
}

describe('random command sequences', () => {
  // Random play rarely gets far on its own, so runs also start from points across the scripted campaign.
  const starts = [
    snapshot(c => c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 4, 25)),
    snapshot(c => c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 7, 1)),
    snapshot(c => c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 8, 20)),
    snapshot(c => c.phase === 'season' && c.yearIdx === 2 && c.season!.day >= S.dayIndex(c.year, 8, 1)),
    snapshot(c => c.phase === 'season' && c.yearIdx === 1 && c.season!.day >= S.dayIndex(c.year, 9, 5)),
    snapshot(c => c.phase === 'cellar' && c.month === 0),
    snapshot(c => c.phase === 'cellar' && c.yearIdx === 2 && c.month === 0),
    snapshot(c => c.phase === 'cellar' && c.yearIdx === 1 && c.month === 4),
    snapshot(c => c.phase === 'ledger'),
    snapshot(c => c.phase === 'plan' && c.yearIdx === 2),
    snapshot(c => c.phase === 'season' && c.yearIdx === 1 && c.season!.day >= S.dayIndex(c.year, 8, 25)),
    // A contract still open and a dug lot of its variety in hand.
    snapshot(c => c.phase === 'season' && c.contracts.some(k => !k.settled && k.delivered < k.cwt &&
      S.openLots(c).some(l => l.variety === k.variety && c.season!.fields[l.field].status === 'dug' && l.grades.no1 > 0))),
  ]
  const seen = { sellOk: 0, seedOk: 0, closed: 0, digOk: 0, seasons: 0, landOk: 0, hireOk: 0, pinOk: 0, acceptOk: 0, deliverOk: 0, applicantOk: 0, peopleOk: 0, pickersOk: 0, landWorkOk: 0, worksOk: 0, logsOk: 0, mortgageOk: 0, buildOk: 0 }

  it('never throw, never produce NaN or out-of-range state, and move cash only by what is reported', () => {
    const start = fc.oneof(
      fc.tuple(fc.constantFrom(...YEARS), fc.integer()).map(([year, seed]) => () => S.createCampaign(world, { seed, startYear: year })),
      fc.integer({ min: 0, max: starts.length - 1 }).map(i => () => structuredClone(starts[i])),
    )
    fc.assert(fc.property(start, fc.array(step, { minLength: 10, maxLength: 150, size: 'max' }), (make, steps) => {
      const c = make()
      for (const picked of steps) {
        const s = resolve(c, picked)
        if (c.phase === 'season') seen.seasons++
        const hash = S.hashCampaign(c)
        const base = ledgerBase(c)
        const cashBefore = c.cash
        const logsBefore = c.logs, stoneBefore = c.stone, logMoney = c.yearLogs, buildMoney = c.yearBuilding
        const years = c.history.length
        const lot = s.t === 'sell' ? c.lots.find(l => l.id === s.lot) : undefined
        // A sale in season first settles the time the lot has sat since its dig: the pile shrinks by the stated rate.
        const sat = lot && c.phase === 'season' && c.season ? Math.max(0, (c.season.day - lot.aged) / 30) : 0
        const shrunk = 1 - (c.upgrades.vent ? S.SHRINK_VENT : S.SHRINK) * sat
        const before = lot ? { have: S.lotCwt(lot) * shrunk, sold: lot.sold } : null
        const dLot = s.t === 'deliver' ? c.lots.find(l => l.id === s.lot) : undefined
        const dK = s.t === 'deliver' ? c.contracts.find(k => k.id === s.contract) : undefined
        const delivery = dLot && dK ? { sold: dLot.sold, delivered: dK.delivered, money: c.yearContracts } : null
        let r: { ok: boolean; err: string }
        try { r = applyStep(c, s) } catch (e) { throw new Error(`${JSON.stringify(s)} threw ${(e as Error).message}`) }
        if (!r.ok && s.t !== 'days') expect(S.hashCampaign(c), `${JSON.stringify(s)} failed (${r.err}) but changed the state`).toBe(hash)
        const bad: string[] = []
        nonFinite(c, 'campaign', bad)
        expect(bad, JSON.stringify(s)).toEqual([])
        expect(outOfRange(c), JSON.stringify(s)).toEqual([])
        if (r.ok && s.t === 'sell') seen.sellOk++
        if (r.ok && s.t === 'seed') seen.seedOk++
        if (r.ok && s.t === 'job' && s.kind === 'dig') seen.digOk++
        if (r.ok && (s.t === 'rent' || s.t === 'buyLand')) seen.landOk++
        if (r.ok && s.t === 'hire') seen.hireOk++
        if (r.ok && ((s.t === 'job' && (s.unit ?? -1) >= 0) || s.t === 'assign')) seen.pinOk++
        if (r.ok && s.t === 'accept') seen.acceptOk++
        if (r.ok && s.t === 'hire' && 'applicant' in s) seen.applicantOk++
        if (r.ok && (s.t === 'raise' || s.t === 'priority' || s.t === 'foreman' || s.t === 'winter' || s.t === 'sundays')) seen.peopleOk++
        if (r.ok && s.t === 'pickers') seen.pickersOk++
        if (r.ok && s.t === 'job' && (s.kind === 'fell' || s.kind === 'rocks' || s.kind === 'brush')) seen.landWorkOk++
        if (r.ok && (s.t === 'stump' || s.t === 'tile')) seen.worksOk++
        if (r.ok && s.t === 'payMortgage') seen.mortgageOk++
        // Logs leave the yard only when sold, at the mill's price, or into a building; stone only into a building, which
        // takes what it needs and buys the rest.
        if (r.ok && s.t === 'sellLogs') {
          seen.logsOk++
          expect(close(logsBefore - c.logs, s.loads), 'sold the loads asked').toBe(true)
          expect(close(c.yearLogs - logMoney, s.loads * S.LOG_PRICE), 'at the log price').toBe(true)
        } else if (r.ok && s.t === 'build') {
          seen.buildOk++
          const spec = S.BUILDINGS[s.kind]
          expect(close(logsBefore - c.logs, Math.min(logsBefore, spec.logs)), 'took its logs').toBe(true)
          expect(close(stoneBefore - c.stone, Math.min(stoneBefore, spec.stone)), 'took its stone').toBe(true)
          const bought = Math.max(0, spec.logs - logsBefore) * S.MILL_PRICE + Math.max(0, spec.stone - stoneBefore) * S.QUARRY_PRICE
          expect(close(c.yearBuilding - buildMoney, spec.cash + bought), 'paid its cash and the bought materials').toBe(true)
        } else {
          expect(c.logs, `${JSON.stringify(s)} took logs`).toBeGreaterThanOrEqual(logsBefore - 1e-9)
          expect(c.stone, `${JSON.stringify(s)} took stone`).toBeGreaterThanOrEqual(stoneBefore - 1e-9)
        }
        if (r.ok && s.t === 'deliver') {
          seen.deliverOk++
          // Hundredweight leave the lot for the contract one for one, and the money is the contract price for them.
          const moved = dK!.delivered - delivery!.delivered
          expect(moved).toBeGreaterThan(0)
          expect(close(dLot!.sold - delivery!.sold, moved), 'delivered what left the lot').toBe(true)
          expect(close(c.yearContracts - delivery!.money, moved * dK!.price), 'paid the contract price').toBe(true)
        }
        if (c.history.length > years) {
          seen.closed++
          const h = c.history[c.history.length - 1]
          expect(close(h.cashStart, base), `year opened with ${h.cashStart}, ledger base ${base}`).toBe(true)
          expect(close(c.cash, h.cashStart + h.revenue - h.costs - h.note - h.living - h.interest), `ledger for ${h.year}`).toBe(true)
          expect(close(h.cashEnd, c.cash)).toBe(true)
        } else if (s.t === 'next' && r.ok) {
          // A new year opens fresh books on the cash the ledger closed with.
          expect(c.cash).toBe(cashBefore)
          if (c.phase === 'plan') expect([c.yearRevenue, c.yearCosts]).toEqual([0, 0])
        } else {
          expect(close(ledgerBase(c), base), `${JSON.stringify(s)} moved cash by ${c.cash - base} outside the books`).toBe(true)
        }
        if (lot && before && r.ok && s.t === 'sell') {
          const f = Math.min(1, Math.max(0, s.frac))
          const soldNow = lot.sold - before.sold
          expect(close(soldNow, before.have * f), 'sold what was asked').toBe(true)
          const left = S.lotCwt(lot)
          expect(close(left + soldNow, before.have) || (left === 0 && before.have - soldNow < 0.5), `kept ${left} of ${before.have} after selling ${soldNow}`).toBe(true)
        }
      }
    }), { numRuns: Number(process.env.PROPERTY_RUNS ?? 150) })
  }, 600_000)

  it('reached the harvest, the cellar and the ledger along the way', () => {
    const all = JSON.stringify(seen)
    expect(seen.seasons, all).toBeGreaterThan(100)
    expect(seen.sellOk, all).toBeGreaterThan(10)
    expect(seen.seedOk, all).toBeGreaterThan(3)
    expect(seen.digOk, all).toBeGreaterThan(3)
    expect(seen.closed, all).toBeGreaterThan(3)
    expect(seen.landOk, all).toBeGreaterThan(3)
    expect(seen.hireOk, all).toBeGreaterThan(3)
    expect(seen.pinOk, all).toBeGreaterThan(3)
    expect(seen.acceptOk, all).toBeGreaterThan(3)
    expect(seen.deliverOk, all).toBeGreaterThan(0)
    expect(seen.applicantOk, all).toBeGreaterThan(3)
    expect(seen.peopleOk, all).toBeGreaterThan(10)
    expect(seen.pickersOk, all).toBeGreaterThan(0)
    expect(seen.landWorkOk, all).toBeGreaterThan(5)
    expect(seen.worksOk, all).toBeGreaterThan(0)
    expect(seen.logsOk, all).toBeGreaterThan(0)
    expect(seen.buildOk, all).toBeGreaterThan(5)
  })
})

describe('selling', () => {
  const cellar = snapshot(c => c.phase === 'cellar' && c.month === 1 && S.openLots(c).length > 1)

  it('conserves hundredweight for any fraction of any lot', () => {
    expect(S.openLots(cellar).length).toBeGreaterThan(1)
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.nat(), (frac, k) => {
      const c = structuredClone(cellar)
      const lot = S.openLots(c)[k % S.openLots(c).length]
      const have = S.lotCwt(lot), sold = lot.sold, cash = c.cash
      const value = S.lotValue(world, c, lot)
      expect(S.apply(world, c, { t: 'sell', lot: lot.id, frac }).ok).toBe(true)
      const left = S.lotCwt(lot)
      expect(close(lot.sold - sold, have * frac)).toBe(true)
      expect(close(left + (lot.sold - sold), have) || (left === 0 && have * (1 - frac) < 0.5)).toBe(true)
      expect(close(c.cash - cash, value * frac)).toBe(true)
    }), { numRuns: 200 })
  })
})

describe('invalid commands', () => {
  const states: [string, Campaign][] = [
    ['spring', S.createCampaign(world, { seed: 3, startYear: 1999 })],
    ['mid-season', snapshot(c => c.phase === 'season' && c.season!.day >= S.dayIndex(c.year, 6, 20))],
    ['cellar', snapshot(c => c.phase === 'cellar' && c.month === 2)],
    ['ledger', snapshot(c => c.phase === 'ledger')],
    ['second spring', snapshot(c => c.phase === 'plan' && c.yearIdx === 1)],
    ['season with a hand and a contract', snapshot(c => c.phase === 'season' && c.yearIdx === 1 && c.season!.day >= S.dayIndex(c.year, 7, 10))],
    ['winter with a contract', snapshot(c => c.phase === 'cellar' && c.yearIdx === 2 && c.month === 1)],
  ]
  const invalid = (c: Campaign): Cmd[] => {
    const out: Cmd[] = [
      { t: 'plan', field: 7, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } },
      { t: 'plan', field: -1, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } },
      { t: 'plan', field: 1.5, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } },
      { t: 'job', kind: 'dig', field: 9 }, { t: 'job', kind: 'scout', field: S.FIELD_COUNT }, { t: 'cancel', id: 99999 }, { t: 'bump', id: -5 },
      { t: 'sell', lot: 99999, frac: 1 }, { t: 'seed', lot: 99999, fields: 1 },
      { t: 'rent', field: 0 }, { t: 'rent', field: -1 }, { t: 'rent', field: S.FIELD_COUNT }, { t: 'release', field: 0 }, { t: 'release', field: 13 },
      { t: 'buyLand', field: 0 }, { t: 'buyLand', field: 99 }, { t: 'hire', kind: 'farmer' }, { t: 'hire', applicant: -1 },
      { t: 'raise', unit: 0, wage: 500 }, { t: 'raise', unit: 99, wage: 500 }, { t: 'priority', unit: 99, work: 'field', level: 1 },
      { t: 'priority', unit: 0, work: 'field', level: 7 }, { t: 'priority', unit: 0, work: 'field', level: 0.5 }, { t: 'priority', unit: 0, work: 'golf' as S.Skill, level: 1 },
      { t: 'priority', unit: 0, work: 'field', level: c.crew[0].prio.field }, { t: 'foreman', unit: 0, block: 'home' }, { t: 'foreman', unit: 0, block: null },
      { t: 'sundays', off: c.sundaysOff }, { t: 'winter', unit: 99, work: 'off' }, { t: 'winter', unit: 0, work: 'golf' as S.WinterWork },
      { t: 'winter', unit: 0, work: c.crew[0].winter, field: c.crew[0].winterField },
      // Land: nothing to fell or stump on a field, no rocks on woods, no hedgerows on the ridge, no tile on the slope,
      // tracts are not let, the back lot goes with Dufour land, woods are not planted.
      { t: 'job', kind: 'fell', field: 0 }, { t: 'job', kind: 'rocks', field: 14 }, { t: 'job', kind: 'brush', field: 0 },
      { t: 'stump', field: 0 }, { t: 'stump', field: 16 }, { t: 'stump', field: -1 }, { t: 'tile', field: 0 }, { t: 'tile', field: 16 }, { t: 'tile', field: 99 },
      { t: 'rent', field: 16 }, { t: 'rent', field: 14 }, { t: 'plan', field: 14, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } },
      { t: 'sellLogs', loads: c.logs + 1 }, { t: 'sellLogs', loads: 0 }, { t: 'sellLogs', loads: NaN }, { t: 'payMortgage', amount: 1e9 },
      { t: 'winter', unit: 0, work: 'woods', field: 0 }, { t: 'winter', unit: 0, work: 'woods', field: 16 },
      // Buildings: no such kind or yard, a pond only at home, nothing ordered as a job.
      { t: 'build', kind: 'castle' as S.BuildingKind, yard: -1 }, { t: 'build', kind: 'shed', yard: 0 }, { t: 'build', kind: 'pond', yard: -2 },
      { t: 'build', kind: 'shed', yard: -3 }, { t: 'job', kind: 'haul', field: 0 }, { t: 'job', kind: 'build', field: -1 }, { t: 'job', kind: 'build', field: 0 },
      { t: 'dismiss', unit: 0 }, { t: 'dismiss', unit: 99 }, { t: 'accept', offer: -1 }, { t: 'assign', id: 99999, unit: 0 },
      { t: 'deliver', lot: 99999, contract: 1 }, { t: 'deliver', lot: c.lots[0]?.id ?? 1, contract: -7 },
    ]
    if (c.phase !== 'plan') {
      out.push({ t: 'begin' }, { t: 'buy', upgrade: 'vent' }, { t: 'plan', field: 0, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
      out.push({ t: 'rent', field: 8 }, { t: 'buyLand', field: 8 }, { t: 'release', field: 7 })
      for (const o of c.offers) out.push({ t: 'accept', offer: o.id })
    }
    if (c.phase === 'plan') {
      if (S.variety('caribou').released > c.year) out.push({ t: 'plan', field: 0, plan: { crop: 'potato', variety: 'caribou', seed: 'certified' } })
      if (!c.seedStock.some(x => x.variety === 'katahdin' && x.fields > 0)) out.push({ t: 'plan', field: 0, plan: { crop: 'potato', variety: 'katahdin', seed: 'saved' } })
      if (c.cash < S.PARCELS[6].price * S.MORTGAGE_DOWN) out.push({ t: 'buyLand', field: 6 })
    }
    if (c.phase !== 'plan' && c.phase !== 'season') out.push({ t: 'hire', kind: 'hand' }, ...c.crew.map(u => ({ t: 'dismiss' as const, unit: u.id })))
    if (c.phase !== 'season') out.push({ t: 'day' }, { t: 'endSeason' }, { t: 'job', kind: 'plant', field: 0 }, { t: 'assign', id: 1, unit: -1 }, { t: 'pickers', on: true })
    if (c.phase === 'season' && c.season && !S.labourInfo(c).pickers.ok && !c.season.pickers) out.push({ t: 'pickers', on: true })
    if (c.phase === 'season' && c.season && !c.season.pickers) out.push({ t: 'pickers', on: false })
    if (S.hiredCount(c) >= S.housingLimit(c)) out.push({ t: 'hire', kind: 'hand' }, { t: 'hire', kind: 'operator' })
    for (const u of c.crew) {
      if (u.kind !== 'farmer') out.push({ t: 'raise', unit: u.id, wage: u.wage }, { t: 'raise', unit: u.id, wage: 20 }, { t: 'raise', unit: u.id, wage: NaN }, { t: 'foreman', unit: u.id, block: 'moon' as S.BlockId })
      if (u.kind !== 'farmer' && !u.foreman) out.push({ t: 'foreman', unit: u.id, block: null })
    }
    if (c.fields[17].tenure !== 'owned' && (!S.holdsDufour(c) || c.phase !== 'plan')) out.push({ t: 'buyLand', field: 17 })
    if (!S.hasBuilt(c, 'shed') && !c.upgrades.tractor2) out.push({ t: 'buy', upgrade: 'tractor2' })
    if (!c.upgrades.tractor2 && !c.upgrades.tractor3) out.push({ t: 'buy', upgrade: 'tractor3' })
    if (!S.holdsDufour(c)) out.push({ t: 'build', kind: 'house', yard: -2 })
    for (const b of c.buildings) out.push({ t: 'build', kind: b.kind, yard: b.yard })
    for (const j of c.season?.jobs ?? []) if (j.kind === 'haul') out.push({ t: 'cancel', id: j.id })
    if (c.phase !== 'plan' || S.mortgageOwed(c) === 0) out.push({ t: 'payMortgage', amount: 100 })
    if (c.phase !== 'cellar') out.push({ t: 'month' }, { t: 'seed', lot: 1, fields: 1 })
    if (c.phase !== 'ledger') out.push({ t: 'next' })
    if (c.phase === 'cellar') for (const l of S.openLots(c)) out.push({ t: 'seed', lot: l.id, fields: 0 }, { t: 'seed', lot: l.id, fields: 1000 })
    if (c.phase === 'season' && c.season) {
      // Someone set never to do machine work is given none; nobody else's pin is taken; a dig cannot be pinned to the
      // farmer's absent twin.
      for (const u of c.crew.filter(x => x.prio.machine === 0)) {
        for (const kind of ['plant', 'hill', 'spray', 'water', 'kill', 'dig'] as const) for (let f = 0; f < S.HOME_FIELDS; f++) out.push({ t: 'job', kind, field: f, unit: u.id })
        for (const j of c.season.jobs) if (!S.willDo(u, j.kind)) out.push({ t: 'assign', id: j.id, unit: u.id })
      }
      for (const j of c.season.jobs) out.push({ t: 'assign', id: j.id, unit: 99 }, { t: 'assign', id: j.id, unit: -2 }, { t: 'assign', id: j.id, unit: 0.5 })
    }
    if (c.phase === 'season' || c.phase === 'cellar') {
      // Deliveries of the wrong variety, or to a contract that has closed or is filled.
      for (const k of c.contracts) for (const l of S.openLots(c)) if (l.variety !== k.variety || k.settled || k.delivered >= k.cwt) out.push({ t: 'deliver', lot: l.id, contract: k.id })
    }
    return out
  }
  for (const [name, c] of states) {
    it(`are refused in the ${name} and leave the state hash unchanged`, () => {
      for (const cmd of invalid(c)) {
        const before = S.hashCampaign(c)
        const r = S.apply(world, c, cmd)
        expect(r.ok, JSON.stringify(cmd)).toBe(false)
        expect(r.err.length, JSON.stringify(cmd)).toBeGreaterThan(0)
        expect(S.hashCampaign(c), JSON.stringify(cmd)).toBe(before)
      }
    })
  }
})
