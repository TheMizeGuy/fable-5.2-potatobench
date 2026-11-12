// What a year usually does to the balance on a farm worked as the guide works it: the middle half of farms, from
// playing the coach's advice through each year (tests/usual-year.test.ts measures it again). Said before the first
// Start so a year that ends down is not a surprise, and at each year end against the year just closed.
import * as F from './fmt.ts'

export const USUAL_YEAR = { lo: -24000, mid: -14000, hi: -4000 }

const range = () => `${F.money(-USUAL_YEAR.hi)} to ${F.money(-USUAL_YEAR.lo)}`

// Short, for the order blank; the whole of it for the hover.
export function usualFirstYear(bills: number): { short: string; full: string } {
  return {
    short: `A first year usually ends ${range()} down.`,
    full: `A first year played the way the tutorial suggests usually ends ${range()} below where it started. The crop covers what it costs to grow, but the bank payment and your family's living costs take ${F.money(bills)} no matter what it earns.`,
  }
}

// change: the year's cash at its end less its cash at the start.
export function againstUsual(change: number): string {
  if (change > USUAL_YEAR.hi) return `Better than a usual year, which ends ${range()} down.`
  if (change < USUAL_YEAR.lo) return `Worse than a usual year, which ends ${range()} down.`
  return `A usual year. Most end ${range()} down.`
}
