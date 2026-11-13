// The money explains itself: every move of the year-end figure of MONEY_STEP or more has a cause the game names, the
// parts always sum to the figure, the spring plan's sum is exact, and a plan that leaves too little cash says so.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, World } from '../src/sim/index.ts'
import { causeLine, dueSays, loanSays, lowCashSays } from '../src/ui/money-words.ts'
import { loadWorld } from '../tools/balance/world.ts'

const base = loadWorld()

function ok(w: World, c: Campaign, cmd: Cmd): S.Result {
  const r = S.apply(w, c, cmd)
  expect(r.ok, `${JSON.stringify(cmd)}: ${r.err}`).toBe(true)
  return r
}

describe('the year-end figure', () => {
  it('over 12 seasons by the reference practice, every move of MONEY_STEP or more has a named cause carrying half of it, and the parts sum to the figure', () => {
    const unexplained: string[] = []
    const named: Record<string, number> = {}
    let moves = 0, looks = 0
    for (let seed = 1; seed <= 12; seed++) {
      const w = S.climateWorld(base, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      // A third of the farms take on a hand in spring, and another hires one in July.
      if (seed % 3 === 0) ok(w, c, { t: 'hire', kind: 'hand' })
      ok(w, c, { t: 'begin' })
      let was = S.moneyLook(w, c)
      const look = (what: string) => {
        const now = S.moneyLook(w, c)
        const m = S.moneyNow(w, c)
        looks++
        expect(Object.values(now.flows).reduce((a, x) => a + x, 0), `seed ${seed} ${what}: the flows`).toBeCloseTo(now.after, 6)
        expect(m.parts.reduce((a, p) => a + p.amount, 0), `seed ${seed} ${what}: the parts`).toBeCloseTo(m.after, 6)
        const why = S.moneyCause(was, now)
        const moved = now.after - was.after
        if (Math.abs(moved) >= S.MONEY_STEP && now.year === was.year && (c.phase === 'season' || c.phase === 'cellar')) {
          moves++
          const at = `seed ${seed} ${c.season ? S.formatDay(c.year, c.season.day) : ''} ${c.phase} ${what}: ${Math.round(moved)}`
          if (!why || why.share < 0.5 || !why.text) unexplained.push(`${at} ${why ? `${why.part} ${why.share.toFixed(2)}` : 'none'}`)
          else named[why.text] = (named[why.text] ?? 0) + 1
        }
        was = now
      }
      for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
        if (seed % 4 === 1 && c.season!.day === S.dayIndex(c.year, 6, 10)) { ok(w, c, { t: 'hire', kind: 'hand' }); look('hire') }
        for (const a of S.advise(w, c)) {
          if (a.act === 'wait' || a.act === 'close') continue
          S.apply(w, c, a.act === 'sell' ? { t: 'sell', lot: a.lot, frac: 1 } : { t: 'job', kind: a.act, field: a.field })
          look(a.act)
        }
        ok(w, c, { t: 'day' })
        look('day')
      }
      ok(w, c, { t: 'endSeason' })
      look('endSeason')
      for (let k = 0; k < 12 && c.phase === 'cellar'; k++) {
        for (const a of S.advise(w, c)) if (a.act === 'sell') { ok(w, c, { t: 'sell', lot: a.lot, frac: 1 }); look('sell') }
        ok(w, c, { t: 'month' })
        look('month')
      }
    }
    console.log(`${moves} moves of $${S.MONEY_STEP} or more over ${looks} looks`, named)
    expect(unexplained).toEqual([])
    expect(moves).toBeGreaterThan(20)
  }, 120000)

  it('a hand hired in July says their wages to the year end, by name, on the board\'s line', () => {
    const w = S.climateWorld(base, 2)
    const c = S.createCampaign(w, { seed: 2, startYear: S.FARM_YEAR0 + 1 })
    ok(w, c, { t: 'begin' })
    while (c.season!.day < S.dayIndex(c.year, 6, 1)) ok(w, c, { t: 'day' })
    const was = S.moneyLook(w, c)
    ok(w, c, { t: 'hire', kind: 'hand' })
    const why = S.moneyCause(was, S.moneyLook(w, c))!
    const name = c.crew[c.crew.length - 1].name.split(' ')[0]
    expect(why.part).toBe('wages')
    expect(why.share).toBeGreaterThanOrEqual(0.5)
    expect(causeLine(why)).toMatch(new RegExp(`^−\\$[\\d,]+: ${name}'s wages to the year end$`))
    // A spray order is a move of $110: under the step, so no line.
    const now = S.moneyLook(w, c)
    ok(w, c, { t: 'job', kind: 'spray', field: c.plans.findIndex(p => p.crop === 'potato') })
    ok(w, c, { t: 'day' })
    const after = S.moneyLook(w, c)
    if (Math.abs(after.after - now.after) < S.MONEY_STEP) expect(S.moneyCause(now, after)).toBeNull()
  })

  it('the figure counts the wages to the year end, the oats and clover, and the interest on what the year end leaves owed', () => {
    const w = S.climateWorld(base, 3)
    const c = S.createCampaign(w, { seed: 3, startYear: S.FARM_YEAR0 + 1 })
    ok(w, c, { t: 'hire', kind: 'hand' })
    ok(w, c, { t: 'begin' })
    const m = S.moneyNow(w, c)
    const hand = c.crew.find(u => u.kind !== 'farmer')!
    const close = S.dayIndex(c.year, 9, 15)
    let pays = 0
    for (let d = hand.paidTo; d <= close; d += S.WAGE_DAYS) pays++
    expect(m.wages).toBe(pays * hand.wage)
    expect(m.rest).toBe(c.season!.fields.filter(f => f.status === 'rest').length * S.REST_INCOME)
    const before = m.cash + m.stored + m.growing + m.rest - m.wages - m.penalties - m.due.note - m.due.household - m.due.mortgage
    expect(m.interest).toBeCloseTo(before < 0 ? -before * S.CREDIT_RATE : 0, 6)
    expect(m.after).toBeCloseTo(before - m.interest, 6)
  })
})

describe('the spring plan\'s money', () => {
  it('what is due at the year end is the $19,000 of every year plus this spring\'s loan and the mortgage, to the dollar', () => {
    for (const [seed, year] of [[1, 2002], [3, 2001], [7, 1999]]) {
      const c = S.createCampaign(base, { seed, startYear: year })
      for (const buy of [false, true]) {
        if (buy) ok(base, c, { t: 'buy', upgrade: 'vent' })
        const m = S.moneyNow(base, c)
        const due = dueSays(m.due, m.loan)
        expect(due.parts.reduce((a, x) => a + x, 0)).toBe(due.total)
        expect(due.total).toBe(Math.round(S.NOTE_PAYMENT + S.LIVING) + Math.round(m.loan) + Math.round(m.due.mortgage))
        expect(Math.abs(due.total - m.due.total)).toBeLessThan(1.5)
        expect(due.text).toContain(`$${(S.NOTE_PAYMENT + S.LIVING).toLocaleString('en-US')} you owe the bank and your family every year`)
        if (m.loan >= 0.5) expect(due.text).toContain(`$${Math.round(m.loan).toLocaleString('en-US')} loan`)
      }
    }
  })

  it('a plan that leaves less than a month of wages and field work says so and names the largest thing to leave out; more than that, nothing', () => {
    const c = S.createCampaign(base, { seed: 1, startYear: 2002 })
    ok(base, c, { t: 'hire', kind: 'hand' })
    const month = S.monthCost(c)
    const potato = c.plans.filter((p, i) => S.held(c, i) && p.crop === 'potato').length
    expect(month).toBe(c.crew.filter(u => u.kind !== 'farmer').reduce((a, u) => a + u.wage, 0) + potato * S.FIELD_WORK_MONTH)
    expect(lowCashSays(c, 8)).toMatch(/^That's less than a month of wages and field work \(about \$[\d,]+\), so the season starts on the loan\. Resting .+ would save about \$[\d,]+\.$/)
    expect(lowCashSays(c, month - 1)).not.toBe('')
    expect(lowCashSays(c, month)).toBe('')
    expect(lowCashSays(c, month * 3)).toBe('')
    // Already borrowing: the loan line says that, not this.
    expect(lowCashSays(c, -500)).toBe('')
    // The largest saving is named: resting a potato field saves its work and seed, more than a hand's season of wages.
    expect(S.planCut(c)!.saves).toBe(S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT - S.REST_COST)
  })

  it('a purchase says how it is paid: the cash first, the rest on the loan, or the plain price when all of it is', () => {
    expect(loanSays(6000, 5992)).toBe('$8 from cash, +$5,992 on the loan')
    expect(loanSays(12000, 12000)).toBe('+$12,000 on the loan')
    expect(loanSays(6000, 0)).toBe('')
  })
})
