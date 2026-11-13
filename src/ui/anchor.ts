// Where a card goes: beside the point that was clicked. To the right of it and level with it by preference; flipped
// left, below or above to stay in the window, off the bars, off the handle that was clicked and off the thing's own
// middle. Geometry only (tie.ts holds a card to its thing with it); every card on the land is placed by this one rule.

export interface Pt { x: number; y: number }
export interface Box { left: number; top: number; right: number; bottom: number }
export type Side = 'right' | 'left' | 'below' | 'above'

export interface Ask {
  // Where the thing was clicked, as it is on the screen now.
  point: Pt
  // The card as it would stand with all the room it wants.
  size: { w: number; h: number }
  // The part of the window a card may use.
  win: Box
  // What a card never lies over: the bars at the foot, a chip under the boards.
  blocks?: Box[]
  // The handle that was clicked, when it was one (a tag, a chip): the card lies beside it, never on it.
  keep?: Box | null
  // What it keeps off unless nothing else will do: the thing's own middle.
  avoid?: Box[]
  // What it would rather not lie over: the thing's tag, a person's pin.
  spare?: Box[]
  // The other tags on the land: of two sides that will do, the one that hides fewer of them.
  others?: Box[]
  // The side it lies on now: held while it still serves, so a small move of the camera never flips it.
  prev?: Side | null
  gap?: number
}

export interface Placed {
  x: number
  y: number
  // The height there is room for (the card's own, or less: then it scrolls).
  h: number
  side: Side
  // The thing is out of the window or under a bar: the card waits at the nearest edge.
  away: boolean
  // The point the card was laid beside (the thing's, brought inside the window).
  at: Pt
}

export const GAP = 14
// Beside a handle the card stands this far off its edge.
export const KEEP = 10
// The least height worth opening a card at.
const LEAST = 220
// How far down the card the point lies when the card is level with it.
const LEVEL = 0.22
const SIDES: Side[] = ['right', 'left', 'below', 'above']
const COST: Record<Side, number> = { right: 0, left: 30, below: 60, above: 90 }
const STAY = 50

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v))
export const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
export const holds = (b: Box, p: Pt, pad = 0) => p.x > b.left - pad && p.x < b.right + pad && p.y > b.top - pad && p.y < b.bottom + pad

// The nearest point of a box to a point (the point itself when it is inside).
export function nearest(b: Box, p: Pt): Pt {
  return { x: Math.max(b.left, Math.min(b.right, p.x)), y: Math.max(b.top, Math.min(b.bottom, p.y)) }
}

export function distance(b: Box, p: Pt): number {
  const n = nearest(b, p)
  return Math.hypot(n.x - p.x, n.y - p.y)
}

// The clear distance between two boxes (0 when they touch or overlap).
export function boxGap(a: Box, b: Box): number {
  return Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom))
}

export function placeCard(a: Ask): Placed {
  const gap = a.gap ?? GAP
  const { w, h: h0 } = a.size
  const win = a.win
  const blocks = a.blocks ?? []
  const keep = a.keep ?? null
  // A handle on a bar is where it belongs; a point of the land under one is out of sight.
  const under = keep ? undefined : blocks.find(b => holds(b, a.point))
  const away = !holds(win, a.point, 0.5) || !!under
  let p: Pt = { x: clamp(a.point.x, win.left, win.right), y: clamp(a.point.y, win.top, win.bottom) }
  // Under a bar: the nearest free edge of it.
  if (under) p = { x: p.x, y: (under.top + under.bottom) / 2 < (win.top + win.bottom) / 2 ? Math.min(win.bottom, under.bottom) : Math.max(win.top, under.top) }

  // The free height of a column of the window: between the bars above the point and the bars below it.
  const band = (x0: number, x1: number) => {
    let top = win.top, bottom = win.bottom
    for (const b of blocks) {
      if (b.right <= x0 - 4 || b.left >= x1 + 4) continue
      const from = holds(b, p, 1) ? (win.top + win.bottom) / 2 : p.y
      if ((b.top + b.bottom) / 2 < from) top = Math.max(top, b.bottom + 6)
      else bottom = Math.min(bottom, b.top - 6)
    }
    return { top, bottom: Math.max(top, bottom) }
  }

  const lay = (side: Side): { x: number; y: number; h: number; forced?: boolean } => {
    if (side === 'right' || side === 'left') {
      const x = clamp(side === 'right' ? Math.max(p.x + gap, keep ? keep.right + KEEP : -Infinity) : Math.min(p.x - gap, keep ? keep.left - KEEP : Infinity) - w, win.left, win.right - w)
      const b = band(x, x + w)
      const h = Math.min(h0, b.bottom - b.top)
      return { x, y: clamp(p.y - Math.min(h * LEVEL, 96), b.top, b.bottom - h), h }
    }
    const x = clamp(p.x - w * 0.3, win.left, win.right - w)
    const b = band(x, x + w)
    if (side === 'below') {
      const top = Math.max(p.y + gap, keep ? keep.bottom + KEEP : -Infinity, b.top)
      const room = b.bottom - top
      if (room >= Math.min(h0, LEAST)) return { x, y: top, h: Math.min(h0, room) }
    } else {
      const foot = Math.min(p.y - gap, keep ? keep.top - KEEP : Infinity, b.bottom)
      const room = foot - b.top
      if (room >= Math.min(h0, LEAST)) { const h = Math.min(h0, room); return { x, y: foot - h, h } }
    }
    // No room on that side: what it would be, to be marked down below.
    const h = Math.min(h0, b.bottom - b.top)
    return { x, y: side === 'below' ? b.bottom - h : b.top, h, forced: true }
  }

  let best: { x: number; y: number; h: number; side: Side; s: number } | null = null
  for (const side of SIDES) {
    const c = lay(side)
    const r: Box = { left: c.x, top: c.y, right: c.x + w, bottom: c.y + c.h }
    let s = COST[side] - (side === a.prev ? STAY : 0)
    if (!away && holds(r, p, 2)) s += 10000
    // Pushed by the window's edge or a bar until it no longer stands on its side of the point: marked down.
    const beside = side === 'right' || side === 'left'
      ? (side === 'right' ? r.left >= p.x : r.right <= p.x) && p.y >= r.top - gap && p.y <= r.bottom + gap
      : p.x >= r.left && p.x <= r.right
    if (!beside || c.forced) s += 200
    if (keep && meets(r, keep)) s += 8000
    if (blocks.some(b => meets(r, b))) s += 6000
    if (c.h < Math.min(h0, LEAST)) s += 3000
    for (const v of a.avoid ?? []) if (meets(r, v)) s += 2000
    for (const v of a.spare ?? []) if (meets(r, v)) s += 300
    for (const v of a.others ?? []) if (meets(r, v)) s += 35
    // How far it stands from what was clicked: the point, or the whole handle when it was one.
    s += Math.max(0, (keep ? boxGap(r, keep) : distance(r, p)) - gap - 2) * 4
    // A card cut short has to be scrolled to reach its orders: worse than standing a little further off.
    s += (h0 - c.h) * 3
    if (!best || s < best.s) best = { x: c.x, y: c.y, h: c.h, side, s }
  }
  return { x: best!.x, y: best!.y, h: best!.h, side: best!.side, away, at: p }
}

// How far down a card whose top left corner stays where it is may reach: the window's foot, or the first bar under it.
export function roomUnder(x: number, y: number, w: number, win: Box, blocks: Box[] = []): number {
  let bottom = win.bottom
  for (const b of blocks) if (b.right > x - 4 && b.left < x + w + 4 && b.bottom > y && b.top < bottom) bottom = Math.max(y, b.top - 6)
  return bottom
}

// The tether: from the card's edge to the thing. to: the point on the thing (or the nearest edge of the handle).
export function tetherOf(card: Box, to: Pt | Box): { from: Pt; to: Pt; len: number; angle: number } {
  let end: Pt
  if ('left' in to) {
    const mid = { x: (to.left + to.right) / 2, y: (to.top + to.bottom) / 2 }
    end = nearest(to, nearest(card, mid))
  } else end = to
  const from = nearest(card, end)
  return { from, to: end, len: Math.hypot(end.x - from.x, end.y - from.y), angle: Math.atan2(end.y - from.y, end.x - from.x) }
}

// Where a notch stands on the edge of a sheet at the foot (or a panel at the side): as near the thing as the edge goes.
export function notchOf(sheet: Box, to: Pt, edge: 'top' | 'left', inset = 22): Pt {
  return edge === 'top'
    ? { x: clamp(to.x, sheet.left + inset, sheet.right - inset), y: sheet.top }
    : { x: sheet.left, y: clamp(to.y, sheet.top + inset, sheet.bottom - inset) }
}
