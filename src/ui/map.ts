// The land as the interface names it: the blocks, the fields the farm holds, and a small map of where a thing is.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'
import { s } from './dom.ts'

export const BLOCK_NAME: Record<S.BlockId, string> = {
  home: 'The home farm',
  brook: 'The intervale, across the brook',
  ridge: 'The ridge lots, north',
  dufour: 'The Dufour place, up the road',
}

export const BLOCK_NOTE: Record<S.BlockId, string> = {
  home: 'The six fields on the slope below the house.',
  brook: 'Deep wet bottom land: heavy crops, but frost, blight and standing water.',
  ridge: 'Early, dry ground under the spruce.',
  dufour: 'A second farmstead with its own potato house, a long drive from home.',
}

// The fields the farm holds this year, in order: the number keys go down this list.
export function heldFields(c: S.Campaign): number[] {
  const out: number[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i)) out.push(i)
  return out
}

// The fields a number key can pick: those held and open to the plough. Woods and brush still to clear are reached on the land.
function keyFields(c: S.Campaign): number[] {
  return heldFields(c).filter(i => S.isField(c, i))
}

// The field a number key picks: 1 to 9, then 0 for the tenth.
export function fieldForDigit(c: S.Campaign, digit: number): number {
  const list = keyFields(c)
  const k = digit === 0 ? 9 : digit - 1
  return k < list.length ? list[k] : -1
}

export function digitFor(c: S.Campaign, field: number): string {
  const k = keyFields(c).indexOf(field)
  return k < 0 || k > 9 ? '' : String((k + 1) % 10)
}

// Whether a parcel is a tract: woods, brush or new ground that was never a field when the game began.
export function isTract(field: number): boolean {
  return field >= 0 && S.PARCELS[field]?.holding !== 'field'
}

// Where a crew is: a field's name, or the yard it is in.
export function placeName(place: number): string {
  if (place >= 0) return S.FIELD_NAMES[place] ?? ''
  return place === S.DUFOUR_YARD ? 'the Dufour yard' : 'the home yard'
}

// Next field after `from` in `list`, walking forward or back and coming round at the ends; -1 for an empty list.
export function step(list: number[], from: number, back: boolean): number {
  if (!list.length) return -1
  if (back) return [...list].reverse().find(i => i < from) ?? list[list.length - 1]
  return list.find(i => i > from) ?? list[0]
}

const FW = S.COLS * 1.2, FD = S.ROWS * 1.36

// A map of the farm a few pixels high: every field it holds, its tracts still to clear, its yards, and the one place lit.
// here: a field, or a yard (-1, -2). people: dots for where each person is, in their own shirt colours.
export function where(c: S.Campaign, here: number, high = 14, people?: { at: number; colour: string; ring: boolean }[]): SVGElement {
  const parts: { x: number; z: number; w: number; d: number; lit: boolean; tract: boolean }[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    if (!S.held(c, i) && i !== here) continue
    const p = S.PARCELS[i]
    parts.push({ x: p.x - FW / 2, z: p.z - FD / 2, w: FW, d: FD, lit: i === here, tract: !S.isField(c, i) && isTract(i) })
  }
  const yards = [S.HOME_YARD, ...(S.holdsDufour(c) || here === S.DUFOUR_YARD ? [S.DUFOUR_YARD] : [])]
  const pts = yards.map(y => ({ y, ...S.placeXZ(y) }))
  const xs = [...parts.flatMap(p => [p.x, p.x + p.w]), ...pts.map(p => p.x)], zs = [...parts.flatMap(p => [p.z, p.z + p.d]), ...pts.map(p => p.z)]
  const x0 = Math.min(...xs) - 4, x1 = Math.max(...xs) + 4
  const z0 = Math.min(...zs) - 4, z1 = Math.max(...zs) + 4
  const width = Math.max(10, Math.min(high * 3, Math.round(high * (x1 - x0) / (z1 - z0))))
  const dot = (at: number) => { const p = S.placeXZ(at); return { cx: p.x.toFixed(1), cy: p.z.toFixed(1) } }
  return s('svg', { class: 'where', viewBox: `${x0.toFixed(1)} ${z0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(z1 - z0).toFixed(1)}`, width, height: high, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    parts.map(p => s('rect', { class: p.lit ? 'here' : p.tract ? 'tract' : '', x: p.x.toFixed(1), y: p.z.toFixed(1), width: p.w.toFixed(1), height: p.d.toFixed(1) })),
    pts.map(p => s('circle', { class: here === p.y ? 'yard here' : 'yard', cx: p.x.toFixed(1), cy: p.z.toFixed(1), r: 4 })),
    (people ?? []).map(p => s('circle', { class: p.ring ? 'who ring' : 'who', ...dot(p.at), r: p.ring ? 5 : 3.4, style: `fill:${p.colour}` })))
}

// Time on the road, as the card says it.
export function roadTime(days: number): string {
  return days < 0.05 ? 'a few minutes' : `about ${F.days(days)}`
}
