// Where a card goes: beside the point that was clicked. To the right of it and level with it by preference; flipped
// left, below or above to stay in the window, off the bars, off the handle that was clicked and off the thing's own
// middle; and, of the places beside the point where the whole card fits, the one that lies over the fewest of the
// other tags and people on the land (slid up or down its side, or along over or under the point, to step clear of
// them). Geometry only (tie.ts holds a card to its thing with it); every card on the land is placed by this one rule.

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
  // The other tags and people on the land: of the places that will do, the one that hides the fewest of them.
  // weight: how much one counts beside the rest (a field that takes orders more than a field at rest).
  others?: (Box & { weight?: number })[]
  // The side it lies on now: held while it still serves, so a small move of the camera never flips it.
  prev?: Side | null
  // Where it lies now, from the point: with `prev`, it goes on lying just so (the camera is carrying the land by)
  // unless that place no longer serves at all.
  prevOff?: Pt | null
  gap?: number
}

export interface Placed {
  x: number
  y: number
  // The height there is room for (the card's own, or less: then it scrolls).
  h: number
  side: Side
  // How many of the other tags and people it lies over.
  over: number
  // It stands further off than beside the point: the land beside the point is too short for the whole card (a bar
  // under it, a slip over it), and it stepped along clear of them to fit whole. Its tether says whose it is.
  aside: boolean
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
// Lying over one more tag or person: worse than any side, better than a card cut short by more than a line or two.
const OVER = 110
// A card cut short has to be scrolled to reach what is under the cut: the last resort, after lying over any number
// of tags (though not over the thing's own middle). And so much again for each pixel cut.
const SHORT = 1500, CUT = 6
// Each pixel a card is slid from level with the point (or, over and under it, from its usual place along).
const SLIDE = 0.12
// Going on lying where it lay, from the point, while the camera moves.
const SAME = 700
// The furthest a card steps along from the point to fit whole clear of a bar.
export const ASIDE = 190

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

  // The free height of a column of the window: between the bars above the point and the bars below it. A handle on
  // a bar (a chip in the people bar) is not on the land at all: every bar of the foot is then under the land, the
  // list that stands between the chip and the land with them, and every bar of the top over it.
  const onBar = blocks.some(b => holds(b, p, 1))
  const band = (x0: number, x1: number) => {
    let top = win.top, bottom = win.bottom
    for (const b of blocks) {
      if (b.right <= x0 - 4 || b.left >= x1 + 4) continue
      const from = onBar ? (win.top + win.bottom) / 2 : p.y
      if ((b.top + b.bottom) / 2 < from) top = Math.max(top, b.bottom + 6)
      else bottom = Math.min(bottom, b.top - 6)
    }
    return { top, bottom: Math.max(top, bottom) }
  }

  // The other tags that are not the thing's own (its tag is in keep or spare).
  const own = [...(keep ? [keep] : []), ...(a.spare ?? [])]
  const share = (o: Box, k: Box) => Math.max(0, Math.min(o.right, k.right) - Math.max(o.left, k.left)) * Math.max(0, Math.min(o.bottom, k.bottom) - Math.max(o.top, k.top)) / Math.max(1, (o.right - o.left) * (o.bottom - o.top))
  const others = (a.others ?? []).filter(o => !own.some(k => share(o, k) > 0.5))

  interface Lay { side: Side; x: number; y: number; h: number; slid: number; forced?: boolean; same?: boolean; aside?: boolean }
  // Beside the point: right or left of it, level with it or slid up or down that side; under or over it, slid along.
  // at: where along (null: its usual place). off: stepped that far from the point, to stand clear of a bar.
  const lay = (side: Side, at: number | null, off: number | null = null): Lay => {
    if (side === 'right' || side === 'left') {
      const x = off !== null ? off : clamp(side === 'right' ? Math.max(p.x + gap, keep ? keep.right + KEEP : -Infinity) : Math.min(p.x - gap, keep ? keep.left - KEEP : Infinity) - w, win.left, win.right - w)
      const b = band(x, x + w)
      const h = Math.min(h0, b.bottom - b.top)
      const level = clamp(p.y - Math.min(h * LEVEL, 96), b.top, b.bottom - h)
      // Slid, it still stands beside the point: the point (some of the handle) lies within its height.
      const lo = (keep ? keep.top : p.y) - h + 12, hi = (keep ? keep.bottom : p.y) - 12
      const y = at === null ? level : clamp(clamp(at, lo, hi), b.top, b.bottom - h)
      return { side, x, y, h, slid: Math.abs(y - level) }
    }
    const usual = clamp(p.x - w * 0.3, win.left, win.right - w)
    const x = at === null ? usual : clamp(clamp(at, p.x - w + 16, p.x - 16), win.left, win.right - w)
    const b = band(x, x + w)
    if (side === 'below') {
      const top = Math.max(p.y + gap, keep ? keep.bottom + KEEP : -Infinity, b.top)
      const room = b.bottom - top
      if (room >= Math.min(h0, LEAST)) return { side, x, y: top, h: Math.min(h0, room), slid: Math.abs(x - usual) }
    } else {
      const foot = Math.min(p.y - gap, keep ? keep.top - KEEP : Infinity, b.bottom)
      const room = foot - b.top
      if (room >= Math.min(h0, LEAST)) { const h = Math.min(h0, room); return { side, x, y: foot - h, h, slid: Math.abs(x - usual) } }
    }
    // No room on that side: what it would be, to be marked down below.
    const h = Math.min(h0, b.bottom - b.top)
    return { side, x, y: side === 'below' ? b.bottom - h : b.top, h, slid: Math.abs(x - usual), forced: true }
  }

  const tries: Lay[] = []
  for (const side of SIDES) {
    const upright = side === 'right' || side === 'left'
    const usual = lay(side, null)
    const starts: { off: number | null; aside: boolean }[] = [{ off: null, aside: false }]
    if (upright && !usual.forced) {
      // Beside a tag whose own field's middle lies just past it, the card stands a step further along, past the middle.
      for (const v of a.avoid ?? []) {
        const x = side === 'right' ? v.right + 3 : v.left - 3 - w
        const step = side === 'right' ? x - usual.x : usual.x - x
        if (step > 0 && step <= 44 && x >= win.left && x + w <= win.right) starts.push({ off: x, aside: false })
      }
      // Cut short by a bar under it or a slip over it: stepped along that side until it stands clear of them, whole.
      if (usual.h < h0 - 2) {
        for (const b of blocks) {
          if (b.right <= usual.x - 4 || b.left >= usual.x + w + 4) continue
          const x = side === 'right' ? b.right + 6 : b.left - 6 - w
          // (beside the very bar or panel its handle stands on is never too far: a chip in a wide people bar, a
          // row of the grid)
          const own = !!keep && meets(b, keep)
          if (x < win.left || x + w > win.right || (!own && Math.abs(x - usual.x) > ASIDE - gap)) continue
          if (lay(side, null, x).h >= h0 - 2) starts.push({ off: x, aside: true })
        }
      }
    }
    for (const st of starts) {
      const first = st.off === null ? usual : lay(side, null, st.off)
      tries.push({ ...first, aside: st.aside })
      if (first.forced) continue
      // Slid to step just clear of each tag it would lie over, one way and the other.
      const r: Box = { left: first.x, top: first.y, right: first.x + w, bottom: first.y + first.h }
      for (const o of others) {
        if (upright ? o.right <= r.left || o.left >= r.right : o.bottom <= r.top || o.top >= r.bottom) continue
        for (const at of upright ? [o.bottom + 3, o.top - 3 - first.h] : [o.right + 3, o.left - 3 - w]) {
          const c = lay(side, at, upright ? st.off : null)
          if (st.aside && c.h < h0 - 2) continue
          if (!tries.some(t => t.side === side && Math.abs(t.x - c.x) < 1 && Math.abs(t.y - c.y) < 1)) tries.push({ ...c, aside: st.aside })
        }
      }
    }
  }
  // Where it lay, from the point, on the side it lay on.
  if (a.prev && a.prevOff) {
    const upright = a.prev === 'right' || a.prev === 'left'
    const c = lay(a.prev, upright ? p.y + a.prevOff.y : p.x + a.prevOff.x)
    if (Math.abs(c.x - (p.x + a.prevOff.x)) < 1 && Math.abs(c.y - (p.y + a.prevOff.y)) < 1) tries.push({ ...c, same: true })
  }

  let best: { c: Lay; s: number; over: number } | null = null
  for (const c of tries) {
    const side = c.side
    const r: Box = { left: c.x, top: c.y, right: c.x + w, bottom: c.y + c.h }
    let s = COST[side] - (side === a.prev ? STAY : 0) - (c.same ? SAME : 0) + c.slid * SLIDE
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
    const under = others.filter(v => meets(r, v))
    const over = under.length
    s += under.reduce((t, v) => t + (v.weight ?? 1), 0) * OVER
    // How far it stands from what was clicked: the point, or the whole handle when it was one.
    s += Math.max(0, (keep ? boxGap(r, keep) : distance(r, p)) - gap - 2) * 4
    // The whole card before anything else that is a matter of taste: a card cut short has to be scrolled.
    if (c.h < h0 - 2) s += SHORT + (h0 - c.h) * CUT
    if (!best || s < best.s) best = { c, s, over }
  }
  const c = best!.c
  return { x: c.x, y: c.y, h: c.h, side: c.side, over: best!.over, aside: !away && !!c.aside, away, at: p }
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

// How much of a tether is drawn, from the card's end. To a thing that stands on a bar (a chip in the people bar) the
// line runs only as far as the first bar it meets: it never crosses the bar's other keys, or the work list's orders.
// The pin on the thing still says which one.
export function tetherShown(from: Pt, to: Pt, bars: Box[]): number {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  if (!bars.some(b => holds(b, to, 1))) return len
  let first = 1
  const dx = to.x - from.x, dy = to.y - from.y
  for (const b of bars) {
    // Where the line comes into the box (the slab test), as a share of its length.
    let t0 = 0, t1 = 1
    for (const [d, lo, hi, o] of [[dx, b.left, b.right, from.x], [dy, b.top, b.bottom, from.y]] as const) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break } continue }
      const a = (lo - o) / d, c = (hi - o) / d
      t0 = Math.max(t0, Math.min(a, c))
      t1 = Math.min(t1, Math.max(a, c))
    }
    if (t0 <= t1 && t0 < first) first = t0
  }
  return len * Math.max(0, first)
}

// Where a notch stands on the edge of a sheet at the foot (or a panel at the side): as near the thing as the edge goes.
export function notchOf(sheet: Box, to: Pt, edge: 'top' | 'left', inset = 22): Pt {
  return edge === 'top'
    ? { x: clamp(to.x, sheet.left + inset, sheet.right - inset), y: sheet.top }
    : { x: sheet.left, y: clamp(to.y, sheet.top + inset, sheet.bottom - inset) }
}
