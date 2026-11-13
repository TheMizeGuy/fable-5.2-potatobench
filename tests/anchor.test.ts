// Where a card opens (src/ui/anchor.ts): beside the point clicked, by one rule for every card.
import { describe, expect, it } from 'vitest'
import { ASIDE, distance, GAP, holds, KEEP, meets, notchOf, placeCard, roomUnder, tetherOf, type Ask, type Box, type Pt } from '../src/ui/anchor.ts'

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
    // Its tag is spared too where the other side is free; with no other side to go to, the card lies over the tag.
    const tag: Box = { left: 560, top: 380, right: 700, bottom: 420 }
    expect(placeCard(ask(p, { spare: [tag] })).side).toBe('left')
    expect(placeCard(ask({ x: 300, y: 250 }, { spare: [{ left: 340, top: 240, right: 480, bottom: 280 }] })).side).toBe('right')
    // Short of room everywhere else, the card is cut short before it lies over the middle.
    const low = placeCard(ask({ x: 300, y: 300 }, { avoid: [{ left: 380, top: 290, right: 400, bottom: 310 }], size: { w: 430, h: 520 } }))
    expect(meets(rect(low), { left: 380, top: 290, right: 400, bottom: 310 })).toBe(false)
  })

  it('of two sides that will do, takes the one that hides fewer of the other tags', () => {
    const p = { x: 640, y: 400 }
    const tags: Box[] = [{ left: 700, top: 380, right: 860, bottom: 420 }, { left: 800, top: 520, right: 960, bottom: 560 }]
    expect(placeCard(ask(p)).side).toBe('right')
    expect(placeCard(ask(p, { others: tags })).side).toBe('left')
    // One tag on each side: to the right, as ever.
    expect(placeCard(ask(p, { others: [tags[0], { left: 300, top: 380, right: 460, bottom: 420 }] })).side).toBe('right')
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

  it('a card that grows keeps its corner: there is room under it down to the window\'s foot or the first bar', () => {
    expect(roomUnder(600, 300, 430, WIN, BARS)).toBe(WIN.bottom)
    expect(roomUnder(60, 200, 430, WIN, BARS)).toBe(BARS[0].top - 6)
    // (a bar above the card's top is not under it)
    expect(roomUnder(900, 260, 430, WIN, BARS)).toBe(WIN.bottom)
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

describe('keeping off the other tags and people', () => {
  const over = (c: { x: number; y: number; h: number }, tags: Box[]) => tags.filter(t => meets(rect(c), t)).length
  const p = { x: 560, y: 420 }

  it('slides up or down its side to step clear of a tag, and still stands beside the point', () => {
    // Level with the point, the card to its right would lie over a tag a little above it.
    const size = { w: 430, h: 260 }
    const tag: Box = { left: 640, top: 345, right: 800, bottom: 385 }
    expect(over(placeCard(ask(p, { size })), [tag])).toBe(1)
    const c = placeCard(ask(p, { size, others: [tag] }))
    expect(c.side).toBe('right')
    expect(c.over).toBe(0)
    expect(over(c, [tag])).toBe(0)
    expect(c.x).toBe(p.x + GAP)
    expect(c.y).toBe(tag.bottom + 3)
    expect(c.h).toBe(size.h)
    // the point is still within the card's height: the card has not left it
    expect(p.y).toBeGreaterThan(c.y)
    expect(p.y).toBeLessThan(c.y + c.h)
  })

  it('goes to another side when that hides fewer, and never further from the point to do it', () => {
    // A column of tags to the right that no slide clears; nothing to the left.
    const tags: Box[] = [{ left: 620, top: 200, right: 780, bottom: 240 }, { left: 620, top: 420, right: 780, bottom: 460 }, { left: 620, top: 640, right: 780, bottom: 680 }]
    const c = placeCard(ask(p, { others: tags }))
    expect(c.side).toBe('left')
    expect(c.over).toBe(0)
    for (const q of points(71)) {
      const d = placeCard(ask(q, { others: tags }))
      expect(distance(rect(d), q), `${q.x},${q.y}`).toBeLessThanOrEqual(60)
      expect(holds(rect(d), q), `${q.x},${q.y} covered`).toBe(false)
      expect(BARS.some(b => meets(rect(d), b)), `${q.x},${q.y} on a bar`).toBe(false)
    }
  })

  it('with no place clear of every tag, takes the one that lies over the fewest', () => {
    // Tags all round the point.
    const tags: Box[] = [
      { left: 600, top: 380, right: 760, bottom: 420 }, { left: 700, top: 500, right: 860, bottom: 540 }, { left: 620, top: 250, right: 780, bottom: 290 },
      { left: 300, top: 400, right: 460, bottom: 440 }, { left: 520, top: 520, right: 680, bottom: 560 }, { left: 420, top: 300, right: 580, bottom: 340 },
    ]
    const c = placeCard(ask(p, { others: tags }))
    expect(c.over).toBe(over(c, tags))
    // no side at its usual place does better
    for (const prev of ['right', 'left', 'below', 'above'] as const) {
      const plain = placeCard(ask(p, { prev }))
      expect(c.over, prev).toBeLessThanOrEqual(over(plain, tags))
    }
    expect(c.over).toBeLessThan(over(placeCard(ask(p)), tags))
  })

  it('does not count the thing\'s own tag, and never lies on the handle to spare another tag', () => {
    const own: Box = { left: 400, top: 400, right: 560, bottom: 440 }
    const size = { w: 430, h: 260 }
    const other: Box = { left: 620, top: 350, right: 780, bottom: 390 }
    expect(meets(rect(placeCard(ask({ x: 480, y: 420 }, { size, keep: own }))), other)).toBe(true)
    const c = placeCard(ask({ x: 480, y: 420 }, { size, keep: own, others: [own, other] }))
    expect(meets(rect(c), own)).toBe(false)
    expect(meets(rect(c), other)).toBe(false)
    expect(c.over).toBe(0)
  })

  it('fits the whole card before it stands level, and a card cut short is worse than a tag covered', () => {
    // Near the foot of the window: the card moves up to fit whole.
    const low = placeCard(ask({ x: 700, y: 690 }))
    expect(low.h).toBe(CARD.h)
    expect(low.y + low.h).toBeLessThanOrEqual(WIN.bottom)
    // The only place clear of the tag would cut the card: it keeps its height and lies over the tag.
    const tall = { w: 430, h: 540 }
    const at = { x: 600, y: 430 }
    const tags: Box[] = [{ left: 660, top: 300, right: 820, bottom: 340 }, { left: 660, top: 520, right: 820, bottom: 560 }]
    expect(placeCard(ask(at, { size: tall })).h).toBe(540)
    const c = placeCard(ask(at, { size: tall, others: tags }))
    expect(c.h).toBe(540)
    expect(c.over).toBeGreaterThan(0)
  })

  it('a field that takes orders counts for more than a field at rest or a face', () => {
    // One tag under the card on either side, whatever it does: to the right a potato field's, to the left a resting
    // field's. Counted alike it would go right, as ever; the potato field's counts for more, and it goes left.
    const right: (Box & { weight?: number })[] = [{ left: 620, top: 395, right: 780, bottom: 445 }]
    const left: (Box & { weight?: number })[] = [{ left: 300, top: 395, right: 460, bottom: 445 }]
    expect(placeCard(ask(p, { others: [...right, ...left] })).side).toBe('right')
    right[0].weight = 2
    left[0].weight = 1
    const c = placeCard(ask(p, { others: [...right, ...left] }))
    expect(c.side).toBe('left')
    expect(right.some(t => meets(rect(c), t))).toBe(false)
  })

  it('where the land beside the point is too short for the whole card, it steps along clear of the bar and stays whole', () => {
    // A short window: a slip hangs over the left of the land and the people bar stands under it.
    const win: Box = { left: 8, top: 171, right: 1272, bottom: 712 }
    const blocks: Box[] = [{ left: 33, top: 166, right: 365, bottom: 212 }, { left: 16, top: 592, right: 409, bottom: 704 }]
    const size = { w: 400, h: 480 }
    const at = { x: 280, y: 400 }
    const c = placeCard({ point: at, size, win, blocks })
    expect(c.h).toBe(480)
    expect(c.aside).toBe(true)
    expect(c.side).toBe('right')
    expect(c.x).toBe(blocks[1].right + 6)
    expect(blocks.some(b => meets({ left: c.x, top: c.y, right: c.x + size.w, bottom: c.y + c.h }, b))).toBe(false)
    expect(c.y).toBeGreaterThanOrEqual(win.top)
    expect(c.y + c.h).toBeLessThanOrEqual(win.bottom)
    expect(c.x - at.x).toBeLessThanOrEqual(ASIDE)
    // With room beside the point it never steps away.
    expect(placeCard({ point: { x: 700, y: 400 }, size, win, blocks }).aside).toBe(false)
    expect(placeCard({ point: { x: 700, y: 400 }, size, win, blocks }).x).toBe(700 + GAP)
    // Too far to step (the bar is wider than its reach): it stays beside the point, cut short.
    const wide: Box[] = [{ left: 16, top: 592, right: 900, bottom: 704 }]
    const d = placeCard({ point: { x: 200, y: 400 }, size: { w: 400, h: 520 }, win, blocks: wide })
    expect(d.aside).toBe(false)
    expect(d.h).toBeLessThan(520)
  })

  it('carried by the camera it lies as it lay: a tag passing under it does not make it jump', () => {
    const size = { w: 430, h: 260 }
    const tag: Box = { left: 640, top: 345, right: 800, bottom: 385 }
    const first = placeCard(ask(p, { size, others: [tag] }))
    const off = { x: first.x - first.at.x, y: first.y - first.at.y }
    expect(off.y).not.toBe(placeCard(ask(p, { size })).y - p.y)
    // The camera carries the point along; the tags are no longer asked about.
    for (let k = 1; k <= 30; k++) {
      const q = { x: p.x + k * 3, y: p.y - k * 2 }
      const c = placeCard(ask(q, { size, prev: first.side, prevOff: off }))
      expect(c.side).toBe(first.side)
      expect(c.x - q.x, `step ${k}`).toBeCloseTo(off.x, 6)
      expect(c.y - q.y, `step ${k}`).toBeCloseTo(off.y, 6)
    }
    // Where that place would run off the window it gives way, and the card is still whole and beside the point.
    const edge = placeCard(ask({ x: 1000, y: 400 }, { size, prev: first.side, prevOff: off }))
    expect(rect(edge).right).toBeLessThanOrEqual(WIN.right)
    expect(holds(rect(edge), { x: 1000, y: 400 })).toBe(false)
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
