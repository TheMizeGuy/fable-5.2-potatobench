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
  { weight: 4, arbitrary: fc.record({ t: fc.constant('seedPick' as const), k: fc.nat(20), fields: amount }) },
  { weight: 3, arbitrary: fc.constant({ t: 'month' as const }) },
  { weight: 2, arbitrary: fc.constant({ t: 'next' as const }) },
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
    const taw = S.TAW_MM[c.fields[fi].elev]
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
  for (const f of c.fields) check(f.soil >= 0 && f.soil <= 1 && f.vert > 0 && f.vert < 1, `soil ${f.soil} vert ${f.vert}`)
  check(c.fields.length === S.FIELD_COUNT && c.plans.length === S.FIELD_COUNT, 'one field and one plan per parcel')
  check(c.fields.slice(0, S.HOME_FIELDS).every(f => f.tenure === 'owned'), 'the home six stay owned')
  // The crew: one farmer, id 0; at most four hands and one operator, and an operator only with the second tractor.
  const crew = c.crew
  const place = (p: number) => Number.isInteger(p) && p >= -2 && p < S.FIELD_COUNT
  check(crew.filter(u => u.kind === 'farmer').length === 1 && crew[0].id === 0 && crew[0].kind === 'farmer', 'one farmer, first')
  check(new Set(crew.map(u => u.id)).size === crew.length && crew.every(u => u.id < c.nextUnit || u.id === 0), 'unit ids unique')
  check(crew.filter(u => u.kind === 'hand').length <= S.MAX_HANDS && crew.filter(u => u.kind === 'operator').length <= S.MAX_OPERATORS, 'crew limits')
  check(!crew.some(u => u.kind === 'operator') || c.upgrades.tractor2, 'an operator needs the second tractor')
  for (const u of crew) check(place(u.at) && place(u.to) && u.road >= 0 && u.road < 1, `unit ${u.id} at ${u.at} to ${u.to} road ${u.road}`)
  const held = crew.filter(u => u.job >= 0).map(u => u.job)
  check(new Set(held).size === held.length, `two crews hold one order: ${held}`)
  for (const k of c.contracts) check(k.delivered >= 0 && k.delivered <= k.cwt + 1e-6 && k.paid >= 0 && k.penalty >= 0, `contract ${k.id} ${k.delivered}/${k.cwt}`)
  const s = c.season
  if (s && c.phase === 'season') {
    for (let i = 0; i < S.FIELD_COUNT; i++) check((c.fields[i].tenure === 'none') === (s.fields[i].status === 'off'), `field ${i} tenure ${c.fields[i].tenure} status ${s.fields[i].status}`)
    for (const j of s.jobs) {
      check(s.fields[j.field].status !== 'off', `order on land the farm does not hold: ${j.kind} ${j.field}`)
      const u = crew.find(x => x.id === j.unit)
      check(j.unit === -1 || (!!u && S.canDo(u.kind, j.kind)), `order ${j.id} pinned to ${j.unit}`)
    }
    // Two crews never work the same order: each order (one kind on one field) was worked by one crew in a day.
    const by = new Map<string, number>()
    for (const w of s.worked) {
      const key = `${w.kind}:${w.field}`
      check(!by.has(key) || by.get(key) === w.unit, `${key} worked by ${by.get(key)} and ${w.unit}`)
      by.set(key, w.unit)
      const u = crew.find(x => x.id === w.unit)
      check(!u || S.canDo(u.kind, w.kind), `${u?.kind} did ${w.kind}`)
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
  const seen = { sellOk: 0, seedOk: 0, closed: 0, digOk: 0, seasons: 0, landOk: 0, hireOk: 0, pinOk: 0, acceptOk: 0, deliverOk: 0 }

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
      { t: 'buyLand', field: 0 }, { t: 'buyLand', field: 99 }, { t: 'hire', kind: 'farmer' }, { t: 'hire', kind: 'operator' },
      { t: 'dismiss', unit: 0 }, { t: 'dismiss', unit: 99 }, { t: 'accept', offer: -1 }, { t: 'assign', id: 99999, unit: 0 },
      { t: 'deliver', lot: 99999, contract: 1 }, { t: 'deliver', lot: c.lots[0]?.id ?? 1, contract: -7 },
    ]
    if (c.phase !== 'plan') {
      out.push({ t: 'begin' }, { t: 'buy', upgrade: 'vent' }, { t: 'plan', field: 0, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
      out.push({ t: 'rent', field: 8 }, { t: 'buyLand', field: 8 }, { t: 'release', field: 7 })
      for (const o of c.offers) out.push({ t: 'accept', offer: o.id })
    }
    if (c.phase === 'plan') {
      out.push({ t: 'plan', field: 0, plan: { crop: 'potato', variety: 'caribou', seed: 'certified' } }, { t: 'plan', field: 0, plan: { crop: 'potato', variety: 'katahdin', seed: 'saved' } })
      if (c.cash < S.PARCELS[6].price) out.push({ t: 'buyLand', field: 6 })
    }
    if (c.phase !== 'plan' && c.phase !== 'season') out.push({ t: 'hire', kind: 'hand' }, ...c.crew.map(u => ({ t: 'dismiss' as const, unit: u.id })))
    if (c.phase !== 'season') out.push({ t: 'day' }, { t: 'endSeason' }, { t: 'job', kind: 'plant', field: 0 }, { t: 'assign', id: 1, unit: -1 })
    if (c.phase !== 'cellar') out.push({ t: 'month' }, { t: 'seed', lot: 1, fields: 1 })
    if (c.phase !== 'ledger') out.push({ t: 'next' })
    if (c.phase === 'cellar') for (const l of S.openLots(c)) out.push({ t: 'seed', lot: l.id, fields: 0 }, { t: 'seed', lot: l.id, fields: 1000 })
    if (c.phase === 'season' && c.season) {
      // A hand does no machine work; nobody else's pin is taken; a dig cannot be pinned to the farmer's absent twin.
      for (const u of c.crew.filter(x => x.kind === 'hand')) {
        for (const kind of ['plant', 'hill', 'spray', 'water', 'kill', 'dig'] as const) for (let f = 0; f < S.HOME_FIELDS; f++) out.push({ t: 'job', kind, field: f, unit: u.id })
        for (const j of c.season.jobs) if (!S.canDo('hand', j.kind)) out.push({ t: 'assign', id: j.id, unit: u.id })
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
