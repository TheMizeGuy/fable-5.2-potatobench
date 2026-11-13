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

// Why the year-end figure moved, as the board says it under the figure: "−$13,400: the test dig in Brook Field came
// in light".
export function causeLine(why: S.MoneyCause): string {
  return `${why.amount > 0 ? '+' : ''}${F.money(Math.round(why.amount / 100) * 100)}: ${why.text}`
}

// How a purchase is paid in spring: the cash first, the rest on the spring loan. '' when the cash covers it.
export function loanSays(cost: number, onLoan: number): string {
  if (onLoan < 0.5) return ''
  if (onLoan >= cost - 0.5) return `+${F.money(cost)} on the loan`
  return `${F.money(cost - onLoan)} from cash, +${F.money(onLoan)} on the loan`
}
