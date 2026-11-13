// Where a card opens (src/ui/anchor.ts): beside the point clicked, by one rule for every card.
import { describe, expect, it } from 'vitest'
import { ASIDE, distance, GAP, holds, KEEP, meets, notchOf, placeCard, roomUnder, tetherOf, tetherShown, type Ask, type Box, type Pt } from '../src/ui/anchor.ts'

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

  it('a card with a pinned head and foot is given its least height before it keeps off its own tag', () => {
    // Spring at 1280 by 720: the land left of the catalogue, a tag in the middle of it, a record 445 px wide whose
    // head and foot take 230 px. Beside the tag there is no room for its width; over the tag, 300 px of height.
    const win: Box = { left: 8, top: 129, right: 778, bottom: 712 }
    const tag: Box = { left: 190, top: 437, right: 372, bottom: 481 }
    const at = { x: 281, y: 459 }
    const size = { w: 445, h: 700 }
    const cb = (c: { x: number; y: number; h: number }): Box => ({ left: c.x, top: c.y, right: c.x + 445, bottom: c.y + c.h })
    // With no least height of its own it stands over its tag, cut to the slit between the tag and the boards.
    const slit = placeCard({ point: at, size, win, keep: tag })
    expect(slit.side).toBe('above')
    expect(slit.h).toBeLessThan(310)
    // Saying it needs 430 px (its head, its foot and 200 px of its middle), it is given the land's whole height
    // beside the tag, part of the tag under it, and never the point itself.
    const c = placeCard({ point: at, size, least: 430, win, keep: tag })
    expect(c.h).toBe(win.bottom - win.top)
    expect(c.h).toBeGreaterThanOrEqual(430)
    expect(holds(cb(c), at)).toBe(false)
    expect(cb(c).right).toBeLessThanOrEqual(win.right)
    expect(cb(c).left).toBeGreaterThanOrEqual(win.left)
    // Where a side has its least height clear of the tag, it takes that side and stays off the tag.
    const roomy = placeCard({ point: { x: 151, y: 459 }, size, least: 430, win, keep: { left: 60, top: 437, right: 242, bottom: 481 } })
    expect(roomy.side).toBe('right')
    expect(meets(cb(roomy), { left: 60, top: 437, right: 242, bottom: 481 })).toBe(false)
    expect(roomy.h).toBe(win.bottom - win.top)
    // A bar is never lain on to gain height.
    const bar: Box = { left: 8, top: 560, right: 778, bottom: 712 }
    const held = placeCard({ point: at, size, least: 430, win, blocks: [bar], keep: tag })
    expect(meets(cb(held), bar)).toBe(false)
  })

  it('someone at the window\'s foot beside the bars: their card is whole over them, slid along clear of a chip in its way', () => {
    // 1280 by 720: the work list and the people bar at the left of the foot, the clock's chip under the cash board,
    // and a hand standing at the very foot of the window. A card 470 px tall.
    const win: Box = { left: 8, top: 171, right: 1272, bottom: 712 }
    const blocks: Box[] = [{ left: 16, top: 537, right: 474, bottom: 581 }, { left: 16, top: 589, right: 406, bottom: 704 }, { left: 1062, top: 222, right: 1264, bottom: 262 }, { left: 34, top: 166, right: 364, bottom: 212 }]
    const at = { x: 862, y: 708 }
    const c = placeCard({ point: at, size: { w: 452, h: 470 }, least: 440, win, blocks })
    const r: Box = { left: c.x, top: c.y, right: c.x + 452, bottom: c.y + c.h }
    expect(c.h).toBe(470)
    expect(c.side).toBe('above')
    expect(blocks.some(b => meets(r, b))).toBe(false)
    expect(holds(r, at)).toBe(false)
    expect(at.x).toBeGreaterThan(r.left)
    expect(at.x).toBeLessThan(r.right)
    expect(r.top).toBeGreaterThanOrEqual(win.top)
    expect(distance(r, at)).toBeLessThanOrEqual(60)
    // Never the sliver under the bars.
    const beside = placeCard({ point: { x: 500, y: 708 }, size: { w: 452, h: 470 }, least: 440, win, blocks })
    expect(beside.h).toBeGreaterThan(300)
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

  it('someone standing on the land right over the people bar: their card steps to the bar\'s end and is whole', () => {
    // 1280 by 800: the two boards and the slip at the top, the people bar at the foot, a hand at the foot of the land.
    const win: Box = { left: 8, top: 8, right: 1272, bottom: 792 }
    const bar: Box = { left: 16, top: 669, right: 406, bottom: 784 }
    const blocks: Box[] = [bar, { left: 1062, top: 223, right: 1264, bottom: 263 }, { left: 1220, top: 559, right: 1264, bottom: 603 }, { left: 34, top: 165, right: 364, bottom: 215 },
      { left: 16, top: 0, right: 408, bottom: 170 }, { left: 948, top: 0, right: 1264, bottom: 213 }]
    const size = { w: 452, h: 474 }
    for (const x of [40, 133, 300]) {
      const at = { x, y: 656 }
      const c = placeCard({ point: at, size, least: 451, win, blocks })
      expect(c.h, `${x}`).toBe(474)
      expect(c.aside, `${x}`).toBe(true)
      expect(c.side, `${x}`).toBe('right')
      // (clear of the bar, or over it where the slip's end leaves the height)
      expect([blocks[3].right + 6, bar.right + 6], `${x}`).toContain(c.x)
      expect(blocks.some(b => meets({ left: c.x, top: c.y, right: c.x + size.w, bottom: c.y + c.h }, b)), `${x}`).toBe(false)
      expect(at.y, `${x}: level with them`).toBeGreaterThanOrEqual(c.y)
      expect(at.y, `${x}: level with them`).toBeLessThanOrEqual(c.y + c.h)
    }
    // A card that can be whole nowhere stays by its thing, cut: a step along is for a whole card only.
    const tall = placeCard({ point: { x: 1036, y: 424 }, size: { w: 440, h: 895 }, least: 271, win: { ...win, bottom: 712 }, blocks: [{ ...bar, top: 589, bottom: 704 }, ...blocks.slice(1)] })
    expect(tall.aside).toBe(false)
    expect(tall.h).toBeLessThan(895)
    // A shorter window, where the land over the bar is shorter than the card wherever it stands in it.
    const low = placeCard({ point: { x: 133, y: 576 }, size: { w: 452, h: 492 }, least: 451, win: { ...win, bottom: 712 }, blocks: [{ ...bar, top: 589, bottom: 704 }, ...blocks.slice(1)] })
    expect(low.h).toBe(492)
    expect(low.x).toBe(bar.right + 6)
  })

  it('beside a tag whose field lies just past it, the card stands a step further along, off the field\'s middle', () => {
    // A field small on the screen: its middle is a few pixels from its tag's end, where the card would begin.
    const tag: Box = { left: 447, top: 561, right: 613, bottom: 605 }
    const middle: Box = { left: 630, top: 566, right: 654, bottom: 590 }
    const win: Box = { left: 8, top: 193, right: 1912, bottom: 1072 }
    // (to its left another potato field's tag, which the card would lie over there)
    const others = [{ left: 173, top: 672, right: 335, bottom: 726, weight: 3 }]
    const c = placeCard({ point: { x: 523, y: 581 }, size: { w: 430, h: 579 }, win, keep: tag, avoid: [middle], others })
    expect(c.side).toBe('right')
    expect(c.x).toBe(middle.right + 3)
    expect(c.over).toBe(0)
    expect(c.aside).toBe(false)
    // and no further from the tag than a card ever stands
    expect(c.x - tag.right).toBeLessThanOrEqual(60)
  })

  it('a chip in the people bar, with the work list between it and the land: the card is whole, above the list or beside the bars', () => {
    // As a player had it at 1280 by 800: the slip under the date board, the work list over the people bar, a toast.
    const win: Box = { left: 8, top: 171, right: 1272, bottom: 792 }
    const slip: Box = { left: 35, top: 166, right: 483, bottom: 214 }
    const list: Box = { left: 16, top: 617, right: 348, bottom: 661 }
    const bar: Box = { left: 16, top: 668, right: 240, bottom: 784 }
    const chip: Box = { left: 106, top: 676, right: 189, bottom: 776 }
    const blocks = [list, bar, slip, { left: 1059, top: 276, right: 1264, bottom: 316 }]
    const toast = { left: 364, top: 740, right: 739, bottom: 782, weight: 4 }
    const at = { x: 147, y: 725 }
    const box = (c: { x: number; y: number; h: number }, w: number): Box => ({ left: c.x, top: c.y, right: c.x + w, bottom: c.y + c.h })
    // A card short enough stands right over the list, over its chip.
    const small = placeCard({ point: at, size: { w: 452, h: 360 }, win, blocks, keep: chip, others: [toast] })
    expect(small.side).toBe('above')
    expect(small.h).toBe(360)
    expect(small.y + small.h).toBe(list.top - 6)
    expect(small.aside).toBe(false)
    // A person's whole page is taller than the land over the list: it stands beside the list and the bar, whole.
    for (const h of [474, 530]) {
      const c = placeCard({ point: at, size: { w: 452, h }, win, blocks, keep: chip, others: [toast] })
      const r = box(c, 452)
      expect(c.h, `${h}`).toBe(h)
      expect(blocks.some(b => meets(r, b)), `${h} on a bar`).toBe(false)
      expect(r.top, `${h}`).toBeGreaterThanOrEqual(win.top)
      expect(r.bottom, `${h}`).toBeLessThanOrEqual(win.bottom)
      expect(c.aside, `${h}`).toBe(true)
      expect(c.x - chip.right, `${h}`).toBeLessThanOrEqual(ASIDE)
    }
    // With room to, it keeps off the toast as well.
    expect(meets(box(placeCard({ point: at, size: { w: 452, h: 474 }, win, blocks, keep: chip, others: [toast] }), 452), toast)).toBe(false)
    // A wider bar (four people) or a panel (the grid of who does what): beside the bar its chip stands on, however
    // far along that is.
    const wide: Box = { left: 16, top: 592, right: 406, bottom: 704 }
    const c4 = placeCard({ point: { x: 147, y: 650 }, size: { w: 452, h: 474 }, win: { left: 8, top: 171, right: 1272, bottom: 712 }, blocks: [{ left: 16, top: 541, right: 190, bottom: 585 }, wide, slip], keep: { left: 106, top: 600, right: 189, bottom: 696 } })
    expect(c4.h).toBe(474)
    expect(c4.x).toBe(wide.right + 6)
    expect(c4.aside).toBe(true)
    const grid: Box = { left: 16, top: 231, right: 528, bottom: 603 }
    const row: Box = { left: 35, top: 428, right: 140, bottom: 472 }
    const cg = placeCard({ point: { x: 90, y: 450 }, size: { w: 452, h: 474 }, win, blocks: [grid, bar, slip], keep: row })
    expect(cg.h).toBe(474)
    expect(cg.x).toBe(grid.right + 6)
    expect(meets(box(cg, 452), grid)).toBe(false)
    // A work list wider than the bar, and a card that can be whole nowhere (its foreman's choices open, at 720
    // lines): beside the list, at the land's whole height, never the slit over the list.
    const win720: Box = { left: 8, top: 171, right: 1272, bottom: 712 }
    const list4: Box = { left: 16, top: 537, right: 474, bottom: 581 }
    const bar4: Box = { left: 16, top: 588, right: 406, bottom: 704 }
    const chip4: Box = { left: 106, top: 596, right: 189, bottom: 696 }
    const tall4 = placeCard({ point: { x: 147, y: 645 }, size: { w: 452, h: 600 }, least: 520, win: win720, blocks: [list4, bar4, { left: 34, top: 166, right: 364, bottom: 212 }], keep: chip4 })
    expect(tall4.x).toBe(list4.right + 6)
    expect(tall4.h).toBe(win720.bottom - win720.top)
    expect(tall4.aside).toBe(true)
    // The same from a row of the grid, the grid over the list and the bar: beside the grid, as tall as the land.
    const grid4: Box = { left: 16, top: 231, right: 528, bottom: 603 }
    const tallg = placeCard({ point: { x: 90, y: 450 }, size: { w: 452, h: 660 }, least: 520, win, blocks: [grid4, { left: 16, top: 617, right: 474, bottom: 661 }, bar, slip], keep: { left: 35, top: 428, right: 140, bottom: 472 } })
    expect(tallg.x).toBe(grid4.right + 6)
    expect(tallg.h).toBe(win.bottom - win.top)
    // A chip pressed while the grid of who does what is open over the list and the bar: between the grid and the
    // list there is a slit; the card stands past the grid, whole.
    const win900: Box = { left: 8, top: 171, right: 1432, bottom: 892 }
    const grid9: Box = { left: 16, top: 231, right: 528, bottom: 603 }
    const list9: Box = { left: 16, top: 737, right: 190, bottom: 781 }
    const bar9: Box = { left: 16, top: 788, right: 406, bottom: 884 }
    const chip9: Box = { left: 106, top: 796, right: 189, bottom: 876 }
    const open9 = placeCard({ point: { x: 147, y: 836 }, size: { w: 452, h: 520 }, least: 480, win: win900, blocks: [grid9, list9, bar9, { left: 34, top: 166, right: 364, bottom: 212 }], keep: chip9 })
    expect(open9.h).toBe(520)
    expect(open9.x).toBe(grid9.right + 6)
    expect([grid9, list9, bar9].some(b => meets(box(open9, 452), b))).toBe(false)
    // Tags on the land are no reason to carry a chip's card off across the window to stand beside some other bar:
    // it stays at the edge of its own.
    const chipFar: Box = { left: 1062, top: 222, right: 1264, bottom: 262 }
    const tagsNear = [{ left: 430, top: 300, right: 590, bottom: 340, weight: 3 }, { left: 440, top: 420, right: 600, bottom: 460, weight: 3 }]
    const stay = placeCard({ point: { x: 147, y: 645 }, size: { w: 452, h: 474 }, least: 440, win: win720, blocks: [{ left: 16, top: 537, right: 182, bottom: 581 }, bar4, chipFar, { left: 34, top: 166, right: 364, bottom: 212 }], keep: chip4, others: tagsNear })
    expect(stay.x).toBe(bar4.right + 6)
    expect(stay.h).toBe(474)
    // Never a strip: whatever the height asked, it is given at least the land over the list.
    const tall = placeCard({ point: at, size: { w: 452, h: 700 }, win, blocks, keep: chip })
    expect(tall.h).toBeGreaterThanOrEqual(380)
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

  it('to a chip on a bar the line stops at the bar\'s edge and never crosses its other keys', () => {
    const list: Box = { left: 16, top: 617, right: 348, bottom: 661 }
    const bar: Box = { left: 16, top: 668, right: 240, bottom: 784 }
    // A card beside the bar, its chip's right edge 51 px inside the bar (the hire key stands between).
    expect(tetherShown({ x: 286, y: 725 }, { x: 189, y: 725 }, [list, bar])).toBeCloseTo(46, 6)
    // A card over the work list: the line stops at the list.
    expect(tetherShown({ x: 147, y: 611 }, { x: 147, y: 676 }, [list, bar])).toBeCloseTo(6, 6)
    // A thing on the land: the whole line, whatever bars there are.
    expect(tetherShown({ x: 514, y: 360 }, { x: 500, y: 360 }, [list, bar])).toBe(14)
    // A slanting line into the bar's corner.
    const d = tetherShown({ x: 300, y: 600 }, { x: 189, y: 700 }, [bar])
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(Math.hypot(111, 100))
  })

  it('a notch stands on the sheet edge as near the thing as the edge goes', () => {
    const sheet: Box = { left: 10, top: 500, right: 402, bottom: 780 }
    expect(notchOf(sheet, { x: 200, y: 300 }, 'top')).toEqual({ x: 200, y: 500 })
    expect(notchOf(sheet, { x: -50, y: 300 }, 'top').x).toBe(32)
    expect(notchOf(sheet, { x: 900, y: 300 }, 'top').x).toBe(380)
    expect(notchOf({ left: 480, top: 150, right: 840, bottom: 380 }, { x: 200, y: 900 }, 'left')).toEqual({ x: 480, y: 358 })
  })
})
