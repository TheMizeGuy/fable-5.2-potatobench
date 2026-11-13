// What a contract is shown to be getting: the crop expected at the harvest from its fields, only the No. 1 and large it
// takes; a shortfall said only when even the top of that falls short, with why; and no offer or telegram for 0 cwt.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, GameEvent, World } from '../src/sim/index.ts'
import { shortWhy } from '../src/ui/contract-words.ts'
import { loadWorld } from '../tools/balance/world.ts'

const base = loadWorld()

function ok(w: World, c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(w, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

function playing(c: Campaign): boolean {
  return c.phase === 'season' && !S.seasonDone(c)
}

// The coach's commands for the day, nothing sold.
function tend(w: World, c: Campaign): void {
  for (const a of S.advise(w, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') S.apply(w, c, { t: 'job', kind: a.act, field: a.field })
}

// A spring with the first offer signed and two home fields planned to its variety, as a first-time player did.
function signed(w: World, seed: number, startYear: number): { c: Campaign; k: S.ContractInfo } {
  const c = S.createCampaign(w, { seed, startYear })
  const o = c.offers[0]
  ok(w, c, { t: 'accept', offer: o.id })
  for (const i of [0, 2]) ok(w, c, { t: 'plan', field: i, plan: { crop: 'potato', variety: o.variety, seed: 'certified' } })
  return { c, k: S.contractInfo(c)[0] }
}

// The No. 1 and large of a variety the farm has at the end of the season, delivered or not.
function got(c: Campaign, k: S.ContractInfo): number {
  return S.contractInfo(c).find(x => x.id === k.id)!.delivered + S.openLots(c).filter(l => l.variety === k.variety).reduce((a, l) => a + l.grades.no1 + l.grades.chef, 0)
}

describe('a contract\'s forecast', () => {
  it('signed in spring with nothing planted yet shows no loss, before the season or once it begins', () => {
    for (const [seed, year] of [[1, 2002], [4, 2002], [7, 1999]]) {
      const { c, k } = signed(base, seed, year)
      const at = `seed ${seed} ${year}`
      const spring = S.contractOutlook(c, k.variety, k.cwt)
      expect(spring.fields, at).toBe(2)
      expect(spring.lo, at).toBeLessThan(spring.mean)
      expect(spring.hi, at).toBeGreaterThan(spring.mean)
      ok(base, c, { t: 'begin' })
      expect(c.season!.fields.filter(f => f.status === 'planted' || f.status === 'growing').length, at).toBe(0)
      // The season's first day reads as the plan did: the same fields at a usual crop, nothing short.
      const now = S.contractOutlook(c, k.variety, k.cwt)
      expect(now.fields, at).toBe(2)
      expect(now.mean, at).toBeCloseTo(spring.mean, 6)
      expect(now.hi, at).toBeCloseTo(spring.hi, 6)
      if (now.hi >= k.cwt) expect(shortWhy(c, S.contractInfo(c)[0]), at).toBe('')
      // What it would owe were it due today is still the contract's own figure, but not said as a loss.
      expect(S.contractInfo(c)[0].penalty).toBeCloseTo(k.cwt * k.price * S.CONTRACT_PENALTY, 9)
    }
    // With no field of its variety in the plan, spring says what to do and names no penalty.
    const c = S.createCampaign(base, { seed: 1, startYear: 2002 })
    const o = c.offers.find(x => c.plans.every(p => p.crop !== 'potato' || p.variety !== x.variety))!
    ok(base, c, { t: 'accept', offer: o.id })
    const why = shortWhy(c, S.contractInfo(c)[0])
    expect(why).toMatch(/give it a field/)
    expect(why).not.toMatch(/\$|penalty|short/i)
  })

  it('a shortfall is said only when even the top of the range falls short, and says why', () => {
    const { c, k } = signed(base, 1, 2002)
    // One field planned for twice what two fields usually give.
    ok(base, c, { t: 'plan', field: 2, plan: { crop: 'rest', variety: k.variety, seed: 'certified' } })
    const big = { ...k, cwt: Math.ceil(S.contractOutlook(c, k.variety, 0).hi + 100), needed: Math.ceil(S.contractOutlook(c, k.variety, 0).hi + 100) }
    expect(S.contractOutlook(c, k.variety, big.cwt).short).toBe('acres')
    expect(shortWhy(c, big)).toMatch(/^Too few acres of .+ are planned/)
    expect(shortWhy(c, big)).not.toMatch(/\$/)
    ok(base, c, { t: 'begin' })
    expect(shortWhy(c, big)).toMatch(/^Too few acres of .+ are planted to fill this even in a good year, so expect a penalty of at least \$[\d,]+\.$/)
    // Within reach of the top of the range: nothing said.
    const near = { ...k, cwt: Math.floor(S.contractOutlook(c, k.variety, 0).hi - 1) }
    expect(shortWhy(c, { ...near, needed: near.cwt })).toBe('')
  })

  it('in July is the No. 1 expected at the harvest from its fields, not the tubers there today, and the dig bears it out', () => {
    let inside = 0, n = 0
    for (let seed = 1; seed <= 40; seed++) {
      const w = S.climateWorld(base, seed)
      const { c, k } = signed(w, seed, S.FARM_YEAR0 + 1)
      ok(w, c, { t: 'begin' })
      let july: S.ContractOutlook | null = null
      for (let g = 0; g < 400 && playing(c); g++) {
        tend(w, c)
        const s = c.season!
        if (!july && s.day >= S.dayIndex(c.year, 6, 15)) {
          july = S.contractOutlook(c, k.variety, k.cwt)
          const at = `seed ${seed} July`
          // The expected-at-harvest outlook (harvestYield) of each of its fields, its No. 1 share only.
          let mean = 0, today = 0, all = 0
          for (let i = 0; i < S.FIELD_COUNT; i++) {
            const f = s.fields[i]
            if (f.variety !== k.variety || !(f.status === 'planted' || f.status === 'growing' || f.status === 'dead')) continue
            const e = S.harvestYield(c, i)!
            const odds = S.markOdds(f, c.fields[i].soil)
            const no2 = f.tiDay < 0 ? S.NO2_USUAL : odds.scab + (1 - odds.scab) * odds.knob
            const share = S.NO1_SHARE[k.variety] - S.NO1_NO2 * no2
            mean += e.mean * S.FIELD_ACRES * share
            all += e.mean * S.FIELD_ACRES
            today += (S.fieldInfo(c, i).estimate?.mean ?? 0) * S.FIELD_ACRES * share
          }
          expect(july.fields, at).toBeGreaterThanOrEqual(2)
          expect(july.mean, at).toBeCloseTo(mean, 6)
          expect(july.lo, at).toBeLessThan(july.mean)
          expect(july.hi, at).toBeGreaterThan(july.mean)
          // Not every grade: the No. 1 and large are well under the whole crop.
          expect(july.mean, at).toBeLessThan(all * 0.9)
          // Not the tubers in the ground today: the bulking still to come is counted.
          expect(july.mean, at).toBeGreaterThan(today * 1.2)
        }
        ok(w, c, { t: 'day' })
      }
      expect(july, `seed ${seed}`).not.toBeNull()
      n++
      const end = got(c, k)
      if (end >= july!.lo && end <= july!.hi) inside++
    }
    expect(inside / n).toBeGreaterThanOrEqual(0.8)
  })
})

describe('no offer or telegram for 0 cwt', () => {
  it('across a seeded multi-year run, with lots sold and delivered while a buyer waits', () => {
    let offers = 0, frosts = 0
    for (let seed = 1; seed <= 12; seed++) {
      const c = S.createCampaign(base, { seed, startYear: 1995 + seed })
      const said: string[] = []
      const go = (cmd: Cmd) => {
        const r = S.apply(base, c, cmd)
        for (const e of r.events as GameEvent[]) {
          said.push(`${c.year} ${e.type}: ${e.text}`)
          if (e.type === 'incident' && e.data?.kind === 'buyer') offers++
          if (e.type === 'frozenInField') frosts++
        }
        for (const inc of c.incidents) {
          if (inc.kind !== 'buyer') continue
          const lot = c.lots.find(l => l.id === inc.lot)
          expect(lot && lot.open && S.lotCwt(lot) >= S.BUYER_MIN_CWT, `seed ${seed} ${c.year}: ${S.incidentText(c, inc)}`).toBe(true)
          said.push(S.incidentText(c, inc))
        }
        return r
      }
      for (let g = 0; g < 30000 && c.history.length < 4 && c.outcome !== 'lost'; g++) {
        if (c.phase === 'plan') {
          for (const o of [...c.offers]) go({ t: 'accept', offer: o.id })
          go({ t: 'begin' })
        } else if (c.phase === 'season') {
          const s = c.season!
          if (s.day % 3 === 0) for (const k of c.contracts) for (const l of S.openLots(c)) if (!k.settled && l.variety === k.variety) go({ t: 'deliver', lot: l.id, contract: k.id })
          if (s.day % 5 === 0) for (const l of S.openLots(c)) go({ t: 'sell', lot: l.id, frac: 0.7 })
          // A buyer's telegram is left two days unanswered.
          for (const inc of [...c.incidents]) if (inc.kind !== 'buyer' || s.day - inc.day >= 2) go({ t: 'answer', incident: inc.id, choice: inc.choices[inc.choices.length - 1] })
          go(S.seasonDone(c) ? { t: 'endSeason' } : { t: 'day' })
        } else if (c.phase === 'cellar') {
          for (const l of S.openLots(c)) go({ t: 'sell', lot: l.id, frac: 1 })
          go({ t: 'month' })
        } else if (c.phase === 'ledger') go({ t: 'next' })
        else break
      }
      expect(said.filter(t => /(^|[^\d,.])0 cwt/.test(t)), `seed ${seed}`).toEqual([])
    }
    expect(offers).toBeGreaterThan(0)
    expect(frosts).toBeGreaterThan(0)
  }, 120000)
})
