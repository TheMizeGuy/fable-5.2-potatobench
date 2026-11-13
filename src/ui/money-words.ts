// The spring plan's money in words: what the year end takes and what it is made of, a plan that leaves too little
// cash, and how a purchase is paid for.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// What is due at the year end, whatever the crop, as the figure and the sentence under it. The parts are each to the
// dollar and the figure is their sum: the yearly $19,000 for the bank and the family, then this spring's loan and the
// land mortgage.
export function dueSays(due: S.MoneyNow['due'], loan: number): { total: number; parts: number[]; text: string } {
  const bills = Math.round(due.note + due.household)
  const lent = Math.round(loan)
  const mortgage = Math.round(due.mortgage)
  const more = F.list([lent ? `this spring's ${F.money(lent)} loan` : '', mortgage ? `${F.money(mortgage)} for the land mortgage` : ''].filter(Boolean))
  return {
    total: bills + lent + mortgage, parts: [bills, lent, mortgage],
    text: `That's the ${F.money(bills)} you owe the bank and your family every year${more ? `, plus ${more}` : ''}. You keep whatever's left.`,
  }
}

// When the plan leaves less cash than about a month of the season costs, one line that says so and names the largest
// thing that could be left out; '' otherwise. left: the cash the plan leaves.
export function lowCashSays(c: S.Campaign, left: number): string {
  const month = S.monthCost(c)
  if (left < 0 || left >= month) return ''
  const cut = S.planCut(c)
  return `That's less than a month of wages and field work (about ${F.money(Math.round(month / 100) * 100)}), so the season starts on the loan.${cut ? ` ${cut.what} would save about ${F.money(Math.round(cut.saves / 100) * 100)}.` : ''}`
}

// Why the year-end figure moved, as the board says it under the figure: "Brook Field dug light: −$2,000".
export function causeLine(why: S.MoneyCause): string {
  return `${why.text}: ${signedMoney(why.amount)}`
}

// A figure to the $100 with its sign: "+$25,000", "−$11,800".
export function signedMoney(n: number): string {
  const r = Math.round(n / 100) * 100
  return `${r > 0 ? '+' : ''}${F.money(r)}`
}

// Where the year-end figure is likely to end, as a person reads a range.
export function rangeSays(range: { lo: number; hi: number }): string {
  return `likely between ${signedMoney(range.lo)} and ${signedMoney(range.hi)}`
}

// The spring loan, said under the pointer on Borrowed, and once a season as a note the first time it grows.
export const BORROWED_SAYS = `This is the bank's spring loan. Wages and field work go on it until the crop sells, it costs no interest until the end of the year, and the crop's sales pay it back. Whatever is still owed then carries at ${F.pct(S.CREDIT_RATE)}.`
export const LOAN_NOTE = 'Wages and field work go on the spring loan until the crop sells.'

// Whether the loan's note is due now: in the season, the first time this year that what is borrowed grows (not the
// spring loan's own start).
export function loanNoteNow(c: S.Campaign, cashWas: number, saidIn: number): boolean {
  return c.phase === 'season' && saidIn !== c.year && cashWas < 0 && Math.round(c.cash) < cashWas
}

// What a press would do to this year's year-end figure, for a key's second line: "year end −$12,000"; a hire's as
// what it takes to the year end: "about $3,300 to the year end".
export function effectSays(d: number | null, hire = false): string {
  if (d === null || Math.abs(d) < 50) return ''
  return hire && d < 0 ? `about ${F.money(-Math.round(d / 100) * 100)} to the year end` : `year end ${signedMoney(d)}`
}

// The spring plan's year-end figure past the bank's limit: one line, and the change that would bring it back most.
export function limitSays(m: S.MoneyNow, rescue: { what: string; gains: number } | null): string {
  if (m.after >= S.CREDIT_LIMIT) return ''
  return `That's past the bank's limit of ${F.money(S.CREDIT_LIMIT)}, so it would call in the loan.${rescue ? ` ${rescue.what} would bring it up about ${F.money(Math.round(rescue.gains / 100) * 100)}.` : ''}`
}

// The ledger's verdict, by the bank's own rule (campaign.ts, closeYear): in hand, or down but inside the limit.
export function verdictSays(y: S.YearSummary, left: number, kept: boolean): string {
  const more = left > 0 ? ` ${F.upper(F.plural(left, 'season'))} to go.` : ''
  if (kept) return y.cashEnd >= 0 ? 'The farm is yours, and the bank is happy.' : `The farm is yours. You ended ${F.money(-y.cashEnd)} down, inside what the bank allows.`
  if (y.cashEnd >= 0) return `You ended the year with ${F.money(y.cashEnd)} in hand, so the bank is happy.${more}`
  return `You ended ${F.money(-y.cashEnd)} down, inside what the bank allows, so it carries you another year.${more}`
}

// The ledger's first line: from what was sold to what was kept.
export function yearWalk(y: S.YearSummary): string {
  const bills = y.note + y.living + y.interest
  const gap = Math.round(y.cashEnd - y.cashStart)
  const kept = (y.land ?? 0) + (y.building ?? 0) + (y.works ?? 0)
  return `You sold ${F.money(y.revenue)}, spent ${F.money(y.costs)} on the farm and ${F.money(bills)} on the bank and your family, and ended with ${F.money(y.cashEnd)}, ${gap === 0 ? 'the same as you started' : `${F.money(Math.abs(gap))} ${gap < 0 ? 'less' : 'more'} than you started with`}.${kept && gap < 0 ? ` ${F.money(kept)} of it paid for land, buildings and clearing, which you keep.` : ''}`
}

// How a purchase is paid in spring: the cash first, the rest on the spring loan. '' when the cash covers it.
export function loanSays(cost: number, onLoan: number): string {
  if (onLoan < 0.5) return ''
  if (onLoan >= cost - 0.5) return `+${F.money(cost)} on the loan`
  return `${F.money(cost - onLoan)} from cash, +${F.money(onLoan)} on the loan`
}
