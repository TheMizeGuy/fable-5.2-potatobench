// The money explains itself: every move of the year-end figure of MONEY_STEP or more has a cause the game names, the
// parts always sum to the figure, the spring plan's sum is exact, and a plan that leaves too little cash says so.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import type { Campaign, Cmd, World } from '../src/sim/index.ts'
import { causeLine, dueSays, effectSays, limitSays, loanNoteNow, loanSays, lowCashSays, rangeSays, sumLines, verdictSays, yearWalk } from '../src/ui/money-words.ts'
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
          else { named[why.text] = (named[why.text] ?? 0) + 1; if (causeLine(why).split(/\s+/).length > 7) unexplained.push(`${at}: "${causeLine(why)}" is more than 7 words`) }
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
    expect(causeLine(why)).toMatch(new RegExp(`^${name}'s wages to year end: −\\$[\\d,]+$`))
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
    const before = m.cash + m.stored + m.growing + m.rest - m.wages - m.sprays - m.penalties - m.due.note - m.due.household - m.due.mortgage
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

// A year played by the coach's commands, everything sold when it says, through the winter to the ledger.
function playYear(w: World, c: Campaign, each?: () => void): void {
  for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
    for (const a of S.advise(w, c)) {
      if (a.act === 'wait' || a.act === 'close') continue
      S.apply(w, c, a.act === 'sell' ? { t: 'sell', lot: a.lot, frac: 1 } : { t: 'job', kind: a.act, field: a.field })
      each?.()
    }
    ok(w, c, { t: 'day' })
    each?.()
  }
  if (c.phase === 'season') { ok(w, c, { t: 'endSeason' }); each?.() }
  for (let k = 0; k < 12 && c.phase === 'cellar'; k++) {
    for (const a of S.advise(w, c)) if (a.act === 'sell') ok(w, c, { t: 'sell', lot: a.lot, frac: 1 })
    ok(w, c, { t: 'month' })
    each?.()
  }
}

describe('round seven', () => {
  it('3a: a second spring plan shows the year-end figure the season opens with, and says so exactly when the likely figure is past the bank\'s limit', () => {
    let past = 0, inside = 0
    for (let seed = 1; seed <= 12; seed++) {
      const w = S.climateWorld(base, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      ok(w, c, { t: 'begin' })
      playYear(w, c)
      if (c.phase !== 'ledger') continue
      ok(w, c, { t: 'next' })
      expect(c.phase).toBe('plan')
      // Some springs rest most of the farm and buy the harvester, as a player who sank year two did, and some owe more.
      if (seed % 4 === 0) c.cash -= 25000
      if (seed % 3 === 0) {
        c.plans.forEach((p, i) => { if (S.held(c, i) && p.crop === 'potato' && i % 2) S.apply(w, c, { t: 'plan', field: i, plan: { ...p, crop: 'rest' } }) })
        S.apply(w, c, { t: 'buy', upgrade: 'harvester' })
      }
      const plan = S.moneyPlan(w, c)
      const rescue = S.planRescue(w, c)
      const said = limitSays(plan, rescue)
      expect(said !== '', `seed ${seed}: ${Math.round(plan.after)}`).toBe(plan.after < S.CREDIT_LIMIT)
      if (said) { past++; if (rescue) expect(said).toContain(rescue.what) } else inside++
      ok(w, c, { t: 'begin' })
      const day = S.moneyNow(w, c)
      expect(plan.after, `seed ${seed}`).toBeCloseTo(day.after, 6)
      expect(plan.range.lo).toBeCloseTo(day.range.lo, 6)
      expect(plan.range.hi).toBeCloseTo(day.range.hi, 6)
      if (rescue) expect(rescue.gains).toBeGreaterThan(0)
    }
    expect(past + inside).toBeGreaterThanOrEqual(10)
    expect(past).toBeGreaterThan(0)
    expect(inside).toBeGreaterThan(0)
  }, 120000)

  it('3b and 8: over 12 two-year runs no stretch loses more than twice the step unsaid, and a field\'s fall names what is seen in it, with the order that helps', () => {
    let lines = 0, falls = 0, named = 0, plain = 0, remedies = 0, cancels = 0
    const kinds: Record<string, number> = {}
    for (let seed = 1; seed <= 12; seed++) {
      const w = S.climateWorld(base, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      ok(w, c, { t: 'begin' })
      let watch: S.MoneyWatch | null = null
      const look = () => {
        if (c.phase !== 'season' && c.phase !== 'cellar') return
        const now = S.moneyLook(w, c)
        const was: S.MoneyWatch | null = watch
        const r = S.moneyWatch(watch, now)
        const at = `seed ${seed} ${c.year} ${c.season ? S.formatDay(c.year, c.season.day) : c.month}`
        if (r.cancel) cancels++
        const why = r.cause
        if (why) {
          lines++
          expect(why.text.length).toBeGreaterThan(3)
          if (why.amount <= -S.MONEY_STEP && (why.part.startsWith('crop:') || why.part === 'crops')) {
            falls++
            if (why.why) {
              named++
              kinds[why.why] = (kinds[why.why] ?? 0) + 1
              // What it names is what the field shows that day.
              const facts = now.fields[why.field!].facts!
              expect(S.fieldWhy(facts, was?.since.fields[why.field!]?.facts), `${at}: ${why.text}`).toBe(why.why)
              if (why.remedy) { remedies++; expect(why.remedy, `${at}: ${why.text}`).toBe(why.why === 'blight' ? 'spray' : 'water') }
            } else if (/looks (lighter|heavier)/.test(why.text)) plain++
          }
        }
        watch = r.watch
        expect(watch.since.after - now.after, at).toBeLessThanOrEqual(2 * S.MONEY_STEP)
      }
      for (let year = 0; year < 2 && c.phase !== 'over'; year++) {
        playYear(w, c, look)
        if (c.phase !== 'ledger' || c.outcome === 'lost') break
        ok(w, c, { t: 'next' })
        ok(w, c, { t: 'begin' })
      }
    }
    console.log(`${lines} lines, ${falls} falls from fields: ${named} named by what was seen ${JSON.stringify(kinds)}, ${remedies} with a remedy, ${plain} plain; ${cancels} pairs that cancelled`)
    expect(lines).toBeGreaterThan(50)
    expect(named).toBeGreaterThan(0)
    expect(remedies).toBeGreaterThan(0)
  }, 180000)

  it('4: the loan\'s note is said once a season, the first time what is borrowed grows', () => {
    for (const seed of [1, 2, 3]) {
      const w = S.climateWorld(base, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      let saidIn = -1, says = 0, was = Math.round(c.cash)
      ok(w, c, { t: 'begin' })
      playYear(w, c, () => {
        if (loanNoteNow(c, was, saidIn)) { saidIn = c.year; says++ }
        was = Math.round(c.cash)
      })
      expect(says, `seed ${seed}`).toBe(1)
    }
  }, 60000)

  it('5: each Buy and Hire says what it does to the year-end figure, and that is what pressing it does', () => {
    for (const [seed, year] of [[1, 2002], [4, 2002], [7, 1999]]) {
      for (const cmd of [{ t: 'buy', upgrade: 'harvester' }, { t: 'buy', upgrade: 'boom' }, { t: 'hire', kind: 'hand' }, { t: 'hire', kind: 'operator' }] as Cmd[]) {
        const c = S.createCampaign(base, { seed, startYear: year })
        const was = S.moneyPlan(base, c).after
        const d = S.moneyEffect(base, c, cmd)
        if (d === null) continue
        expect(effectSays(d)).toMatch(/^year end [+−]\$[\d,]+$/)
        ok(base, c, cmd)
        expect(S.moneyPlan(base, c).after - was, `${seed} ${JSON.stringify(cmd)}`).toBeCloseTo(d, 6)
        if (cmd.t === 'buy') expect(d).toBeLessThan(0)
      }
    }
    // A hand kept on to fell in the winter: their wages to March.
    const w = S.climateWorld(base, 2)
    const c = S.createCampaign(w, { seed: 2, startYear: S.FARM_YEAR0 + 1 })
    ok(w, c, { t: 'hire', kind: 'hand' })
    ok(w, c, { t: 'begin' })
    for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) ok(w, c, { t: 'day' })
    ok(w, c, { t: 'endSeason' })
    const hand = c.crew.find(u => u.kind !== 'farmer')!
    const woods = { t: 'winter', unit: hand.id, work: 'woods', field: S.timberTracts(c)[0] } as Cmd
    const d = S.moneyEffect(w, c, woods)!
    expect(d).toBeLessThan(-hand.wage * 3)
    const was = S.moneyNow(w, c).after
    ok(w, c, woods)
    expect(S.moneyNow(w, c).after - was).toBeCloseTo(d, 6)
  })

  it('6: over 24 year ends the ledger\'s verdict agrees with its figure, and its first line walks from sold to kept', () => {
    let down = 0, up = 0
    for (let seed = 1; seed <= 24; seed++) {
      const w = S.climateWorld(base, seed)
      const c = S.createCampaign(w, { seed, startYear: S.FARM_YEAR0 + 1 })
      if (seed % 2) ok(w, c, { t: 'hire', kind: 'operator' })
      if (seed % 4 === 1) ok(w, c, { t: 'buy', upgrade: 'harvester' })
      ok(w, c, { t: 'begin' })
      playYear(w, c)
      const y = c.history[0]
      if (!y || c.outcome === 'lost') continue
      const said = verdictSays(y, 4, false)
      if (y.cashEnd < 0) { down++; expect(said, `seed ${seed}`).toMatch(/^You ended \$[\d,]+ in debt, inside what the bank allows/); expect(said).not.toMatch(/happy/) }
      else { up++; expect(said, `seed ${seed}`).toMatch(/^You ended the year with \$[\d,]+ left, and the bank is satisfied\./) }
      expect(y.cashEnd).toBeGreaterThanOrEqual(S.CREDIT_LIMIT)
      expect(Math.round(y.cashStart + y.revenue - y.costs - y.note - y.living - y.interest)).toBe(Math.round(y.cashEnd))
      expect(yearWalk(y)).toMatch(/^You sold \$[\d,]+, spent \$[\d,]+ on the farm and \$[\d,]+ on the bank and your family, and ended with -?.?\$[\d,]+/)
    }
    expect(down + up).toBeGreaterThanOrEqual(20)
    expect(down).toBeGreaterThan(0)
    expect(up).toBeGreaterThan(0)
  }, 120000)
})

describe('round eight', () => {
  it('9: a sale that leaves the figure where it was is said once; a move that takes back the last one is not said', () => {
    const w = S.climateWorld(base, 1)
    const c = S.createCampaign(w, { seed: 1, startYear: S.FARM_YEAR0 + 1 })
    ok(w, c, { t: 'begin' })
    for (let g = 0; g < 400 && c.phase === 'season' && !S.openLots(c).some(l => c.season!.fields[l.field].weighed); g++) ok(w, c, { t: 'day' })
    let watch = S.moneyWatch(null, S.moneyLook(w, c)).watch
    const lots = S.openLots(c).filter(l => c.season!.fields[l.field].weighed)
    ok(w, c, { t: 'sell', lot: lots[0].id, frac: 1 })
    const r = S.moneyWatch(watch, S.moneyLook(w, c))
    expect(r.cause?.text).toBe('Sold what was already counted')
    expect(causeLine(r.cause!)).toBe('Sold what was already counted')
    watch = r.watch
    // Said once a year: the next sale that moves nothing says nothing.
    for (let g = 0; g < 60 && c.phase === 'season' && !S.openLots(c).some(l => c.season!.fields[l.field].weighed); g++) ok(w, c, { t: 'day' })
    const next = S.openLots(c).find(l => c.season!.fields[l.field].weighed)
    if (next) {
      ok(w, c, { t: 'sell', lot: next.id, frac: 1 })
      expect(S.moneyWatch(watch, S.moneyLook(w, c)).cause?.text ?? '').not.toBe('Sold what was already counted')
    }
    // The crop's rise and the field work that takes it back: the second is not said, and the first line goes.
    const a = S.moneyLook(w, c)
    const crop = Object.keys(a.flows).find(k => k.startsWith('crop:'))!
    const up = structuredClone(a); up.after += 1500; up.flows[crop] += 1500
    const back = structuredClone(up); back.after -= 1400; back.flows.orders -= 1400
    const first = S.moneyWatch({ since: a, before: null, counted: c.year }, up)
    expect(first.cause?.part).toBe(crop)
    const second = S.moneyWatch(first.watch, back)
    expect(second.cause).toBeNull()
    expect(second.cancel).toBe(true)
    // A hire after a rise is a change of its own, and is said.
    const hire = structuredClone(up); hire.after -= 1400; hire.flows.wages -= 1400
    expect(S.moneyWatch(first.watch, hire).cause?.part).toBe('wages')
  })

  it('9: a sale says what it did to the spring loan', () => {
    const w = S.climateWorld(base, 1)
    const c = S.createCampaign(w, { seed: 1, startYear: S.FARM_YEAR0 + 1 })
    ok(w, c, { t: 'begin' })
    for (let g = 0; g < 400 && c.phase === 'season' && !S.openLots(c).some(l => c.season!.fields[l.field].weighed); g++) ok(w, c, { t: 'day' })
    const lot = S.openLots(c).find(l => c.season!.fields[l.field].weighed)!
    expect(c.cash).toBeLessThan(0)
    const said = ok(w, c, { t: 'sell', lot: lot.id, frac: 1 }).events[0].text
    const money = (n: number) => `\\$${Math.round(n).toLocaleString('en-US')}`
    expect(said).toMatch(c.cash < 0 ? new RegExp(`\\. The loan is down to ${money(-c.cash)}\\.$`) : new RegExp(`\\. That pays off the loan, and you have ${money(c.cash)} in cash\\.$`))
  })

  it('9: the breakdown names only the costs there were, and opens on the cash the ledger said, to the dollar', () => {
    const w = S.climateWorld(base, 2)
    const c = S.createCampaign(w, { seed: 2, startYear: S.FARM_YEAR0 + 1 })
    ok(w, c, { t: 'begin' })
    for (let g = 0; g < 60; g++) ok(w, c, { t: 'day' })
    const m = S.moneyNow(w, c)
    const spent = m.parts.find(p => p.id === 'spent')!
    expect(spent.of!.map(p => p.label)).not.toContain('equipment')
    expect(spent.of!.map(p => p.label)).toContain('seed and field work')
    const figure = Math.round(m.after / 100) * 100
    const lines = sumLines(m.parts, figure)
    expect(lines.reduce((a, p) => a + p.amount, 0)).toBe(figure)
    expect(lines.find(p => p.id === 'start')!.amount).toBe(Math.round(m.parts.find(p => p.id === 'start')!.amount))
    // With equipment bought this spring, it is named apart.
    const d = S.createCampaign(w, { seed: 2, startYear: S.FARM_YEAR0 + 1 })
    ok(w, d, { t: 'buy', upgrade: 'boom' })
    ok(w, d, { t: 'begin' })
    expect(S.moneyNow(w, d).parts.find(p => p.id === 'spent')!.of!.find(p => p.label === 'equipment')!.amount).toBe(S.UPGRADES.boom.cost)
    expect(rangeSays({ lo: -10100, hi: 27500 })).toBe('Most years like this end between −$10,100 and +$27,500.')
  })
})
