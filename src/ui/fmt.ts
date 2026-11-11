// Every number the interface shows goes through here, so the unit switch reaches all of it.
import { formatDay, monthDay, MONTHS, MONTHS_SHORT } from '../sim/index.ts'

export type Units = 'us' | 'metric'
let units: Units = 'us'

export function setUnits(u: Units): void { units = u }
export function metric(): boolean { return units === 'metric' }

const T_PER_CWT = 0.0453592
const HA_PER_ACRE = 0.404686

function group(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function money(usd: number): string {
  const r = Math.round(usd)
  return r < 0 ? `−$${group(-r)}` : `$${group(r)}`
}

export function moneyShort(usd: number): string {
  const a = Math.abs(usd)
  const s = a >= 10000 ? `$${num(a / 1000, 0)}k` : a >= 1000 ? `$${num(a / 1000, 1)}k` : `$${group(a)}`
  return usd < 0 ? `−${s}` : s
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

export function degrees(c: number): number {
  return Math.round(metric() ? c : c * 9 / 5 + 32)
}

export function temp(c: number): string {
  return `${degrees(c)}°${metric() ? 'C' : 'F'}`
}

export function tempUnit(): string { return metric() ? '°C' : '°F' }

export function rain(mm: number): string {
  if (metric()) return mm < 0.5 ? '0 mm' : `${num(mm, mm < 10 ? 1 : 0)} mm`
  const inch = mm / 25.4
  if (inch < 0.005) return '0 in'
  return `${num(inch, 2)} in`
}

export function mass(cwt: number): string {
  if (metric()) {
    const t = cwt * T_PER_CWT
    return `${num(t, t < 10 ? 1 : 0)} t`
  }
  return `${group(cwt)} cwt`
}

export function massUnit(): string { return metric() ? 't' : 'cwt' }

export function massValue(cwt: number): number { return metric() ? cwt * T_PER_CWT : cwt }

export function perArea(cwtPerAcre: number): string {
  if (metric()) return `${num(cwtPerAcre * T_PER_CWT / HA_PER_ACRE, 1)} t/ha`
  return `${group(cwtPerAcre)} cwt/acre`
}

export function perAreaValue(cwtPerAcre: number): number {
  return metric() ? cwtPerAcre * T_PER_CWT / HA_PER_ACRE : cwtPerAcre
}

export function perAreaUnit(): string { return metric() ? 't/ha' : 'cwt/acre' }

export function price(usdPerCwt: number): string {
  if (metric()) return `$${num(usdPerCwt / T_PER_CWT, 0)}/t`
  return `$${num(usdPerCwt, 2)}/cwt`
}

export function area(acres: number): string {
  return metric() ? `${num(acres * HA_PER_ACRE, 1)} ha` : `${num(acres, 0)} acres`
}

export function grams(g: number): string {
  if (metric()) return `${Math.round(g)} g`
  const oz = g / 28.3495
  return `${num(oz, oz < 10 ? 1 : 0)} oz`
}

export function hillMass(g: number): string {
  return metric() ? `${num(g / 1000, 2)} kg` : `${num(g / 453.592, 1)} lb`
}

const QUARTERS = ['', '¼', '½', '¾']

export function days(d: number): string {
  const q = Math.round(d * 4)
  if (Math.abs(d * 4 - q) < 0.02 && q > 0) {
    const whole = Math.floor(q / 4), part = QUARTERS[q % 4]
    const n = whole ? `${whole}${part}` : part
    return `${n} ${q <= 4 ? 'day' : 'days'}`
  }
  if (d < 1) return `${num(Math.max(0.1, d), 1)} day`
  return `${num(d, 1)} days`
}

export function ago(n: number): string {
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}

export function weekday(year: number, day: number, short = false): string {
  const names = short ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return names[new Date(Date.UTC(year, 0, 1 + day)).getUTCDay()]
}

export function date(year: number, day: number, short = false): string {
  return formatDay(year, day, short)
}

export function dateLong(year: number, day: number): string {
  return `${weekday(year, day)}, ${formatDay(year, day)}`
}

export function monthName(m: number, short = false): string {
  return (short ? MONTHS_SHORT : MONTHS)[m]
}

export function dayOfMonth(year: number, day: number): number {
  return monthDay(year, day).dom
}

export function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`
}

// The simulation writes its messages in US units with bare dollar figures; this rewrites them for display.
export function localize(text: string): string {
  const t = text.replace(/\$(\d{4,})\b/g, (_, d) => `$${group(Number(d))}`).replace(/\b(\d{4,}) cwt\b/g, (_, d) => `${group(Number(d))} cwt`)
  if (!metric()) return t
  return t
    .replace(/(-?\d+)°F/g, (_, f) => `${Math.round((Number(f) - 32) * 5 / 9)}°C`)
    .replace(/(\d+(?:\.\d+)?) lb\b/g, (_, lb) => `${num(Number(lb) * 0.453592, 2)} kg`)
    .replace(/(\d[\d,]*) cwt\b/g, (_, c) => mass(Number(String(c).replace(/,/g, ''))))
    .replace(/about an inch/g, 'about 25 mm')
}
