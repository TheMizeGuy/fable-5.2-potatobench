export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInYear(year: number): number {
  return isLeap(year) ? 366 : 365
}

// Day index (0 = January 1) for a month (0-11) and day of month (1-31).
export function dayIndex(year: number, month: number, dom: number): number {
  return CUM[month] + (isLeap(year) && month > 1 ? 1 : 0) + dom - 1
}

export function monthDay(year: number, day: number): { month: number; dom: number } {
  const leap = isLeap(year)
  let month = 11
  for (let m = 0; m < 12; m++) {
    const end = (m === 11 ? (leap ? 366 : 365) : CUM[m + 1] + (leap && m >= 1 ? 1 : 0))
    if (day < end) { month = m; break }
  }
  const start = CUM[month] + (leap && month > 1 ? 1 : 0)
  return { month, dom: day - start + 1 }
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const SUNDAY = 6

// Day of the week, 0 Monday to 6 Sunday, by counting days from Monday, January 1 of the year 1 (proleptic Gregorian).
export function weekday(year: number, day: number): number {
  const y = year - 1
  const n = 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + day
  return ((n % 7) + 7) % 7
}

// Thousands separators without Intl, so every engine writes the same text.
export function withCommas(n: number): string {
  const neg = n < 0
  let s = String(Math.round(Math.abs(n)))
  let out = ''
  while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3) }
  return (neg ? '-' : '') + s + out
}

export function formatDay(year: number, day: number, short = false): string {
  const { month, dom } = monthDay(year, day)
  return `${(short ? MONTHS_SHORT : MONTHS)[month]} ${dom}`
}
