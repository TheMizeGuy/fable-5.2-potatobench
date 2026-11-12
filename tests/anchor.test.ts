// Where a card opens (src/ui/anchor.ts): beside the point clicked, by one rule for every card.
import { describe, expect, it } from 'vitest'
import { distance, GAP, holds, KEEP, meets, notchOf, placeCard, tetherOf, type Ask, type Box, type Pt } from '../src/ui/anchor.ts'

const WIN: Box = { left: 8, top: 158, right: 1272, bottom: 712 }
// The list and the people bar at the foot's left, a chip under the bank board at the right.
const BARS: Box[] = [{ left: 16, top: 560, right: 520, bottom: 704 }, { left: 1090, top: 166, right: 1264, bottom: 210 }]
const CARD = { w: 430, h: 380 }
const rect = (p: { x: number; y: number; h: number }, w = CARD.w): Box => ({ left: p.x, top: p.y, right: p.x + w, bottom: p.y + p.h })
const ask = (point: Pt, more: Partial<Ask> = {}): Ask => ({ point, size: CARD, win: WIN, blocks: BARS, ...more })

// A grid of points over the free land, and a little beyond it.
function points(step = 37): Pt[] {
  const out: Pt[] = []
  for (let y = WIN.top + 3; y < WIN.bottom; y += step) for (let x = WIN.left + 3; x < WIN.right; x += step) out.push({ x, y })
  // (not in the slivers between a bar and the window's edge, where nothing on the land is)
  return out.filter(p => !BARS.some(b => holds(b, p, 16)))
}

describe('a card beside the point clicked', () => {
  it('opens to the right of the point and level with it when there is room', () => {
    const p = { x: 500, y: 360 }
    const c = placeCard(ask(p))
    expect(c.side).toBe('right')
    expect(c.x).toBe(p.x + GAP)
    expect(c.away).toBe(false)
    // level: the point lies beside the upper part of the card, not above or below it
    expect(p.y).toBeGreaterThan(c.y)
    expect(p.y).toBeLessThan(c.y + c.h / 2)
    expect(c.h).toBe(CARD.h)
  })

  it('flips to the left when the right would leave the window', () => {
    const p = { x: 1100, y: 400 }
    const c = placeCard(ask(p))
    expect(c.side).toBe('left')
    expect(c.x + CARD.w).toBe(p.x - GAP)
  })

  it('stands beside a handle that was clicked, never on it: a tag on the land, a chip in the people bar', () => {
    // A tag clicked in its middle: the card stands off the tag's own edge, at its full height.
    const tag: Box = { left: 300, top: 300, right: 500, bottom: 340 }
    const beside = placeCard(ask({ x: 400, y: 320 }, { keep: tag }))
    expect(beside.side).toBe('right')
    expect(beside.x).toBe(tag.right + KEEP)
    expect(beside.h).toBe(CARD.h)
    expect(meets(rect(beside), tag)).toBe(false)
    // At the window's right, on the tag's other side.
    const far: Box = { left: 900, top: 300, right: 1100, bottom: 340 }
    const other = placeCard(ask({ x: 1000, y: 320 }, { keep: far }))
    expect(other.side).toBe('left')
    expect(other.x + CARD.w).toBe(far.left - KEEP)
    // A chip in the people bar: the card stands over the bar and its list, not on them, and the chip is not "away".
    const chip: Box = { left: 130, top: 610, right: 242, bottom: 700 }
    const over = placeCard(ask({ x: 186, y: 655 }, { keep: chip }))
    expect(over.side).toBe('above')
    expect(over.away).toBe(false)
    expect(over.y + over.h).toBe(BARS[0].top - 6)
    expect(BARS.some(b => meets(rect(over), b))).toBe(false)
    // Its lower half clicked, the same.
    expect(placeCard(ask({ x: 186, y: 690 }, { keep: chip })).side).toBe('above')
  })

  it('stays wholly inside the window and off the bars, wherever the point is', () => {
    for (const p of points()) {
      const c = placeCard(ask(p))
      const r = rect(c)
      expect(r.left, `${p.x},${p.y}`).toBeGreaterThanOrEqual(WIN.left)
      expect(r.right, `${p.x},${p.y}`).toBeLessThanOrEqual(WIN.right)
      expect(r.top, `${p.x},${p.y}`).toBeGreaterThanOrEqual(WIN.top)
      expect(r.bottom, `${p.x},${p.y}`).toBeLessThanOrEqual(WIN.bottom)
      expect(BARS.some(b => meets(r, b)), `${p.x},${p.y} on a bar`).toBe(false)
    }
  })

  it('never covers the point, and stands within reach of it', () => {
    for (const p of points()) {
      const c = placeCard(ask(p))
      const r = rect(c)
      expect(holds(r, p), `${p.x},${p.y} covered`).toBe(false)
      expect(distance(r, p), `${p.x},${p.y} far`).toBeLessThanOrEqual(60)
    }
  })

  it('keeps off the middle of the thing when another side will do', () => {
    // Clicked at the left of a field: the card to the right would lie over the field's middle.
    const p = { x: 520, y: 400 }
    const middle: Box = { left: 630, top: 370, right: 650, bottom: 390 }
    const c = placeCard(ask(p, { avoid: [middle] }))
    expect(c.side).toBe('left')
    expect(meets(rect(c), middle)).toBe(false)
  })

  it('holds its side and moves no further than the point does under a small move of the camera', () => {
    for (const p of points(53)) {
      const first = placeCard(ask(p))
      // (where the window's edge already holds the card, a move may be the one that turns it to the other side)
      if (first.x !== p.x + GAP && first.x + CARD.w !== p.x - GAP) continue
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]]) {
        const q = { x: p.x + dx, y: p.y + dy }
        if (!holds(WIN, q) || BARS.some(b => holds(b, q, 1))) continue
        const next = placeCard(ask(q, { prev: first.side }))
        expect(next.side, `${p.x},${p.y} by ${dx},${dy}`).toBe(first.side)
        // (a column that comes clear of a bar is given its room back: there the card may step by more)
        const level = (c: { y: number; h: number }, at: Pt) => Math.abs(c.y - (at.y - Math.min(c.h * 0.22, 96))) < 1e-6
        if (next.h !== first.h || !level(first, p) || !level(next, q)) continue
        expect(Math.abs(next.x - first.x), `${p.x},${p.y} by ${dx},${dy}`).toBeLessThanOrEqual(Math.abs(dx) + 1e-6)
        expect(Math.abs(next.y - first.y), `${p.x},${p.y} by ${dx},${dy}`).toBeLessThanOrEqual(Math.abs(dy) + 1e-6)
      }
    }
  })

  it('does not flip back and forth at the place where it flipped', () => {
    // Carried right until the card has to go to the left of the point, then a little way back: it stays on the left.
    let side = placeCard(ask({ x: 700, y: 400 })).side
    expect(side).toBe('right')
    let flippedAt = 0
    for (let x = 700; x < 1000 && !flippedAt; x += 2) { const c = placeCard(ask({ x, y: 400 }, { prev: side })); if (c.side !== side) flippedAt = x; side = c.side }
    expect(flippedAt).toBeGreaterThan(0)
    expect(side).toBe('left')
    for (let x = flippedAt; x > flippedAt - 40; x -= 2) expect(placeCard(ask({ x, y: 400 }, { prev: side })).side).toBe('left')
  })

  it('is less tall, never off the window, where the column is short', () => {
    // Over the people bar the land is 400 px high: a taller card is given that much and scrolls.
    const c = placeCard(ask({ x: 60, y: 300 }, { size: { w: 430, h: 520 } }))
    const r = rect(c)
    expect(c.h).toBeLessThan(520)
    expect(BARS.some(b => meets(r, b))).toBe(false)
    expect(r.top).toBeGreaterThanOrEqual(WIN.top)
  })

  it('waits at the nearest edge when the thing has left the window', () => {
    for (const p of [{ x: 1500, y: 400 }, { x: -200, y: 300 }, { x: 640, y: -90 }, { x: 640, y: 1200 }]) {
      const c = placeCard(ask(p))
      const r = rect(c)
      expect(c.away).toBe(true)
      expect(holds(WIN, c.at, 1)).toBe(true)
      expect(r.left).toBeGreaterThanOrEqual(WIN.left)
      expect(r.right).toBeLessThanOrEqual(WIN.right)
      expect(r.top).toBeGreaterThanOrEqual(WIN.top)
      expect(r.bottom).toBeLessThanOrEqual(WIN.bottom)
      expect(distance(r, c.at)).toBeLessThanOrEqual(60)
    }
    expect(placeCard(ask({ x: 300, y: 650 })).away, 'under the people bar').toBe(true)
  })
})

describe('the tether and the notch', () => {
  it('runs from the nearest edge of the card to the point', () => {
    const card: Box = { left: 514, top: 300, right: 944, bottom: 680 }
    const t = tetherOf(card, { x: 500, y: 360 })
    expect(t.from).toEqual({ x: 514, y: 360 })
    expect(t.to).toEqual({ x: 500, y: 360 })
    expect(t.len).toBe(14)
  })

  it('ends on the edge of a handle, not across it', () => {
    const card: Box = { left: 500, top: 350, right: 930, bottom: 650 }
    const tag: Box = { left: 500, top: 300, right: 700, bottom: 340 }
    const t = tetherOf(card, tag)
    expect(t.to.y).toBe(tag.bottom)
    expect(t.from.y).toBe(card.top)
    expect(t.len).toBe(10)
  })

  it('a notch stands on the sheet edge as near the thing as the edge goes', () => {
    const sheet: Box = { left: 10, top: 500, right: 402, bottom: 780 }
    expect(notchOf(sheet, { x: 200, y: 300 }, 'top')).toEqual({ x: 200, y: 500 })
    expect(notchOf(sheet, { x: -50, y: 300 }, 'top').x).toBe(32)
    expect(notchOf(sheet, { x: 900, y: 300 }, 'top').x).toBe(380)
    expect(notchOf({ left: 480, top: 150, right: 840, bottom: 380 }, { x: 200, y: 900 }, 'left')).toEqual({ x: 480, y: 358 })
  })
})
