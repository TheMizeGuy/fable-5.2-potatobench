// A card tied to its thing. A click on a thing opens its card beside the point clicked (anchor.ts has the rule); the
// card says which thing it is about (data-thing), a tether runs from it to the thing, it goes with the thing as the
// camera moves, and when the thing leaves the picture it waits at the nearest edge with a Show key. On a phone the
// card is a sheet at the foot with a notch on its edge toward the thing.
import type { Place, Thing } from '../game/contracts.ts'
import { holds, meets, notchOf, placeCard, roomUnder, tetherOf, type Box, type Placed, type Pt, type Side } from './anchor.ts'
import type { Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import './tie.css'

// Where a thing is now. keep: the handle that was clicked (a tag, a chip); end: where the tether ends when that is
// not the point itself; avoid: the thing's own middle; spare: its tag or pin, kept clear when that costs nothing; mark: where a thing with no mark of its own on the land is ringed.
export interface Tied { point: Pt; keep?: Box | null; end?: Pt; avoid?: Box[]; spare?: Box[]; mark?: Pt }
export interface Tie {
  // What the card is about, as its data-thing says it.
  thing: string
  // null: nowhere to be found on this screen (the card stays where it is, with no tether).
  at(): Tied | null
  // Brings the thing back into the picture.
  show(): void
  // The thing moves by itself (a person, a machine): the card is not carried along with every step.
  loose?: boolean
}

// tags: the other tags and people's pins on the land now, which a card hides as few of as it can.
export interface Land { win: Box; blocks: Box[]; tags?: () => (Box & { weight?: number })[] }

export interface Ties {
  field(): Tie | null
  yard(): Tie | null
  unit(): Tie | null
  thing(): Tie | null
  land(): Land
  // The screen says what its cards keep off; null gives the boards' and the foot's edges back.
  setLand(fn: (() => Land) | null): void
  // The camera moved since the last frame.
  moving(): boolean
  frame(): void
  dispose(): void
}

const box = (r: { left: number; top: number; right: number; bottom: number }): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
const round = (p: Pt, r: number): Box => ({ left: p.x - r, top: p.y - r, right: p.x + r, bottom: p.y + r })
const finite = (p: { x: number; y: number } | null | undefined): p is { x: number; y: number } => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
const inQuad = (q: Pt[], p: Pt): boolean => {
  let sign = 0
  for (let k = 0; k < q.length; k++) {
    const a = q[k], b = q[(k + 1) % q.length]
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(c) < 1e-9) continue
    if (sign && Math.sign(c) !== sign) return false
    sign = Math.sign(c)
  }
  return true
}

let now: Ties | null = null
export function ties(): Ties {
  if (!now) throw new Error('the ties are not mounted')
  return now
}

export function mountTies(ctx: Ctx, root: HTMLElement): Ties {
  const app = ctx.app, view = ctx.view
  // The last press: where, on what. A selection made in the same breath was made by it.
  let press: { x: number; y: number; t: number; el: Element | null } = { x: 0, y: 0, t: -1e9, el: null }
  const onPress = (e: Event) => {
    const m = e as MouseEvent
    const el = e.target instanceof Element ? e.target : null
    // A key on a focused control: its middle stands for the pointer.
    if (e.type === 'click' && m.detail === 0 && el) { const r = el.getBoundingClientRect(); press = { x: r.left + r.width / 2, y: r.top + r.height / 2, t: performance.now(), el } }
    else press = { x: m.clientX, y: m.clientY, t: performance.now(), el }
  }
  // A click on the field already in hand selects nothing new: its card comes to the point clicked all the same.
  let down: { x: number; y: number } | null = null
  let used = -1
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
  const onUp = (e: PointerEvent) => {
    onPress(e)
    const p = press
    const tap = e.button === 0 && !e.shiftKey && !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && p.el?.tagName === 'CANVAS'
    if (tap) queueMicrotask(() => {
      const last = app.selected
      if (used === p.t || last < 0 || !fieldNow || fieldNow.last !== last || !inQuad(view.fieldCorners(last), p)) return
      fieldNow = { last, tie: fieldTie(fieldNow.tie.thing, last, p, true) }
      ctx.dirty()
    })
  }
  addEventListener('pointerdown', onDown, true)
  addEventListener('pointerup', onUp, true)
  addEventListener('click', onPress, true)
  // A selection is made inside the press's own event: a press older than that made something else.
  const fresh = () => { if (performance.now() - press.t >= 50) return null; used = press.t; return press }

  const find = (sel: string): HTMLElement | null => {
    for (const el of root.querySelectorAll<HTMLElement>(sel)) if (el.offsetParent !== null && !el.closest('[hidden], .gone, .leaving, .out')) return el
    return null
  }
  const ground = (p: Pt): Place | null => view.groundAt?.(p.x, p.y) ?? null
  const onLand = (w: Place): Pt => { const s = view.screenOf!(w); return { x: s.x, y: s.y } }

  // A handle on the screen (a tag, a chip): the card stands beside it, tied to its edge. at: the point of it that was
  // pressed. Gone from the screen, the tie falls back to the thing itself. The handle is taken at the size it has
  // when its card first stands beside it: a tag that then grows ("on the list") moves neither the card nor the point.
  function handle(thing: string, sel: string, at: Pt | null, fall: Tie, hold?: (el: HTMLElement) => HTMLElement): Tie {
    const first = find(sel)
    const b0 = first?.getBoundingClientRect()
    const d = at && b0 ? { x: at.x - b0.left, y: at.y - b0.top } : null
    let size: { w: number; h: number } | null = null
    return {
      thing, show: fall.show,
      at() {
        const el = find(sel)
        if (!el) { size = null; return fall.at() }
        const b = el.getBoundingClientRect()
        const k = (hold?.(el) ?? el).getBoundingClientRect()
        size ??= { w: k.width, h: k.height }
        const point = d ? { x: b.left + Math.max(0, Math.min(b.width, d.x)), y: b.top + Math.max(0, Math.min(b.height, d.y)) } : { x: b.left + Math.min(b.width, size.w) / 2, y: b.top + b.height / 2 }
        return { point, keep: { left: k.left, top: k.top, right: k.left + size.w, bottom: k.top + size.h }, avoid: fall.at()?.avoid }
      },
    }
  }

  // ---------------------------------------------------------------- a field, a tract
  const TAG = (i: number) => `.plate-layer .plate[data-k="field-${i}"]`
  const tagBox = (el: HTMLElement) => el.closest<HTMLElement>('.tag-at') ?? el
  function fieldMiddle(i: number): Box[] {
    const q = view.fieldCorners(i)
    if (q.length !== 4 || !q.every(c => c.visible && finite(c))) return []
    return [round({ x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 }, 12)]
  }
  // sure: the press is known to be the one that selected it (a click on a tree's crown lies outside its ground).
  function fieldTie(thing: string, i: number, p: typeof press | null, sure = false): Tie {
    const show = () => app.focus(i)
    // The field itself: its tag's point on the near edge.
    const self: Tie = { thing, show, at() { const a = view.fieldAnchor(i); return finite(a) ? { point: { x: a.x, y: a.y }, avoid: fieldMiddle(i) } : null } }
    const tag = handle(thing, TAG(i), null, self, tagBox)
    if (!p) return tag
    if (p.el?.closest('.plate')?.getAttribute('data-k') === `field-${i}`) return handle(thing, TAG(i), p, self, tagBox)
    if (p.el?.tagName !== 'CANVAS' || !(sure || inQuad(view.fieldCorners(i), p))) return tag
    const w = ground(p)
    const a0 = view.fieldAnchor(i)
    const d = { x: p.x - a0.x, y: p.y - a0.y }
    return {
      thing, show,
      at() {
        const a = view.fieldAnchor(i)
        const point = w ? onLand(w) : finite(a) ? { x: a.x + d.x, y: a.y + d.y } : null
        if (!finite(point)) return null
        const t = find(TAG(i))
        return { point, avoid: fieldMiddle(i), spare: t ? [box(tagBox(t).getBoundingClientRect())] : [] }
      },
    }
  }

  // ---------------------------------------------------------------- a yard and what stands in it
  const YARD = (y: number) => `.plate-layer [data-testid="${y === -1 ? 'yard-home' : 'yard-dufour'}"]`
  function yardTie(y: number, p: typeof press | null): Tie {
    const thing = y === -1 ? 'yard-home' : 'yard-dufour'
    const show = () => view.show?.({ yard: y })
    const middle = (): Box[] => { const a = view.yardAnchor(y); return a.visible && finite(a) ? [round(a, 12)] : [] }
    const self: Tie = { thing, show, at() { const a = view.yardAnchor(y); return finite(a) && (a.visible || a.x !== 0 || a.y !== 0) ? { point: { x: a.x, y: a.y }, avoid: middle() } : null } }
    const tag = handle(thing, YARD(y), null, self)
    if (!p) return tag
    if (p.el?.closest('.yard-tag')) return handle(thing, YARD(y), p, self)
    const w = p.el?.tagName === 'CANVAS' ? ground(p) : null
    if (!w) return tag
    return {
      thing, show,
      at() {
        const point = onLand(w)
        if (!finite(point)) return null
        const t = find(YARD(y))
        return { point, avoid: middle(), spare: t ? [box(t.getBoundingClientRect())] : [] }
      },
    }
  }

  // ---------------------------------------------------------------- a person
  const CHIP = (id: number) => `.screen-layer [data-testid="unit-${id}"]`
  const ROW = (id: number) => `.screen-layer [data-testid="grid-person-${id}"]`
  function body(id: number): { mid: Pt; top: Pt } | null {
    const a = view.unitAnchor(id)
    if (!finite(a) || (!a.visible && a.x === 0 && a.y === 0)) return null
    const f = view.unitFoot(id)
    return { mid: finite(f) && (f.x !== 0 || f.y !== 0) ? { x: (a.x + f.x) / 2, y: (a.y + f.y) / 2 } : { x: a.x, y: a.y + 24 }, top: { x: a.x, y: a.y } }
  }
  function unitTie(id: number, p: typeof press | null, from: 'land' | 'list', was: Tie | null): Tie {
    const thing = `person-${id}`
    const show = () => { if (view.show) view.show({ unit: id }); else view.follow(id) }
    // Nowhere on the land (indoors) and no chip on this screen: null, and the card stays where it is.
    const onChip = (fall: Tie, at: Pt | null) => handle(thing, CHIP(id), at, fall)
    const nowhere: Tie = { thing, show, at: () => null }
    const beside = (d: Pt): Tie => {
      const chip = onChip(nowhere, null)
      return {
        thing, show, loose: true,
        at() {
          const b = body(id)
          if (!b) return chip.at()
          const far = Math.hypot(d.x, d.y) > 32
          return { point: { x: b.mid.x + d.x, y: b.mid.y + d.y }, end: far ? b.mid : undefined, avoid: [round(b.mid, 10)], spare: [{ left: b.top.x - 12, top: b.top.y - 50, right: b.top.x + 12, bottom: b.top.y }] }
        },
      }
    }
    if (p) {
      // A key in a card already open on them: the card stays where it is tied.
      if (was && was.thing === thing && p.el?.closest('.anchored')) return was
      // The press counts only when it was on them: their chip, their row, their pin, or the land within reach of them
      // (a press a moment earlier on something else never carries their card off to where it was).
      if (p.el?.closest(`[data-testid="unit-${id}"]`)) return onChip(beside({ x: 0, y: 0 }), p)
      if (p.el?.closest(`[data-testid="grid-person-${id}"]`)) return handle(thing, ROW(id), p, beside({ x: 0, y: 0 }))
      const b = body(id)
      const d = b ? { x: p.x - b.mid.x, y: p.y - b.mid.y } : null
      if (d && (p.el?.closest(`[data-testid="pin-${id}"], [data-testid="pin-pick-${id}"]`) || (p.el?.tagName === 'CANVAS' && Math.hypot(d.x, d.y) < 90))) return beside(d)
    }
    return from === 'land' ? beside({ x: 0, y: 0 }) : onChip(beside({ x: 0, y: 0 }), null)
  }

  // ---------------------------------------------------------------- a machine, a caller, an animal, a neighbour's thing
  function thingTie(t: Thing, x: number, y: number): Tie {
    const thing = `thing-${t.kind}-${t.k}`
    const show = () => view.show?.({ thing: t })
    const w = ground({ x, y })
    const a0 = view.thingAnchor(t)
    const d = a0.visible ? { x: x - a0.x, y: y - a0.y } : { x: 0, y: 0 }
    return {
      thing, show, loose: t.kind !== 'yard',
      at() {
        const a = view.thingAnchor(t)
        if (t.kind !== 'yard' && finite(a) && (a.visible || a.x !== 0 || a.y !== 0)) return { point: { x: a.x + d.x, y: a.y + d.y }, mark: { x: a.x, y: a.y }, avoid: [round(a, 10)] }
        const point = w ? onLand(w) : { x, y }
        return finite(point) ? { point } : null
      },
    }
  }

  let fieldNow: { tie: Tie; last: number } | null = null
  let had: number[] = []
  let yardNow: { tie: Tie; y: number } | null = null
  let unitNow: { tie: Tie; id: number; from: string } | null = null
  let thingNow: { tie: Tie; t: Thing } | null = null
  const fieldId = (sel: number[]) => (sel.length === 1 ? `field-${sel[0]}` : `fields-${sel.join('+')}`)

  const off = app.on(e => {
    if (e.type === 'select') {
      const last = app.selected
      if (last < 0) { fieldNow = null; had = []; return }
      const p = fresh()
      const onIt = !!p && (p.el?.closest('.plate')?.getAttribute('data-k') === `field-${last}` || (p.el?.tagName === 'CANVAS' && inQuad(view.fieldCorners(last), p)))
      // Another field let go with Shift: the card stays tied where it was, to the one last clicked.
      if (fieldNow && fieldNow.last === last && !onIt) fieldNow = { last, tie: { ...fieldNow.tie, thing: fieldId(app.selection) } }
      else fieldNow = { last, tie: fieldTie(fieldId(app.selection), last, p, !had.includes(last) && !!p && performance.now() - p.t < 8) }
      had = [...app.selection]
    } else if (e.type === 'yard') {
      yardNow = e.yard !== 0 ? { y: e.yard, tie: yardTie(e.yard, fresh()) } : null
    } else if (e.type === 'unit') {
      unitNow = e.unit >= 0 ? { id: e.unit, from: app.unitFrom, tie: unitTie(e.unit, fresh(), app.unitFrom, unitNow?.tie ?? null) } : null
    } else if (e.type === 'inspect') {
      thingNow = app.thing ? { t: app.thing.thing, tie: thingTie(app.thing.thing, app.thing.x, app.thing.y) } : null
    } else if (e.type === 'screen') {
      fieldNow = yardNow = unitNow = thingNow = null
    }
  })

  let land: (() => Land) | null = null
  let ref: Pt | null = null
  let moved = false

  now = {
    field() {
      if (!app.selection.length) return null
      const id = fieldId(app.selection)
      if (!fieldNow || fieldNow.tie.thing !== id) fieldNow = { last: app.selected, tie: fieldTie(id, app.selected, null) }
      return fieldNow.tie
    },
    yard() {
      if (app.yard === 0) return null
      if (!yardNow || yardNow.y !== app.yard) yardNow = { y: app.yard, tie: yardTie(app.yard, null) }
      return yardNow.tie
    },
    unit() {
      if (app.unit < 0) return null
      if (!unitNow || unitNow.id !== app.unit || unitNow.from !== app.unitFrom) unitNow = { id: app.unit, from: app.unitFrom, tie: unitTie(app.unit, null, app.unitFrom, null) }
      return unitNow.tie
    },
    thing() {
      const t = app.thing
      if (!t) return null
      if (!thingNow || thingNow.t.kind !== t.thing.kind || thingNow.t.k !== t.thing.k) thingNow = { t: t.thing, tie: thingTie(t.thing, t.x, t.y) }
      return thingNow.tie
    },
    land() {
      if (land) return land()
      const i = app.insets
      const blocks: Box[] = i.bottom > 0 ? [{ left: 0, top: innerHeight - i.bottom, right: innerWidth, bottom: innerHeight }] : []
      return { win: { left: i.left + 8, top: i.top + 8, right: innerWidth - i.right - 8, bottom: innerHeight - 8 }, blocks }
    },
    setLand(fn) { land = fn },
    moving: () => moved,
    frame() {
      const a = view.screenOf ? view.screenOf({ x: 0, y: 0, z: 0 }) : view.fieldAnchor(0)
      const at = finite(a) ? { x: a.x, y: a.y } : null
      moved = !!at && !!ref && Math.hypot(at.x - ref.x, at.y - ref.y) > 0.2
      ref = at
    },
    dispose() {
      off()
      removeEventListener('pointerdown', onDown, true)
      removeEventListener('pointerup', onUp, true)
      removeEventListener('click', onPress, true)
      now = null
    },
  }
  return now
}

// ---------------------------------------------------------------- a card held to its tie

export type Mode = 'float' | 'sheet' | 'side' | 'plain'

export interface Anchored {
  // The tether, its end, the notch and the Show key: laid in the same layer as the card.
  parts: HTMLElement[]
  // After the card is drawn: what it is tied to, and its size taken again.
  update(tie: Tie | null): void
  // Every frame. float: beside its thing on the land; sheet: at the foot (a notch on its top edge); side: a panel at
  // the right (a notch on its left edge); plain: where its screen puts it, untied. quiet: something holds the floor.
  frame(mode: Mode, quiet?: boolean): void
  dispose(): void
}

// How far a thing that moves by itself may go before its card steps after it.
const HOLD = 44

export function anchored(ctx: Ctx, card: HTMLElement, o: { mark?: boolean } = {}): Anchored {
  const name = card.dataset.testid ?? 'card'
  const line = h('i', { class: 'tether', 'aria-hidden': 'true', testid: `tether-${name}`, hidden: true })
  const dot = h('i', { class: 'tether-end', 'aria-hidden': 'true', testid: `tether-end-${name}`, hidden: true })
  const notch = h('i', { class: 'tether-notch', 'aria-hidden': 'true', testid: `notch-${name}`, hidden: true })
  const mark = o.mark ? h('i', { class: 'thing-mark', 'aria-hidden': 'true', testid: 'thing-mark', hidden: true }) : null
  const arrow = icon('arrow', 'i')
  // The key stands on a tab of the card's own paper, so it reads over the land.
  const show = h('span', { class: 'tether-tab sheet sys', hidden: true },
    h('button', { class: 'btn', type: 'button', testid: `show-${name}`, 'aria-label': 'Show it on the land', onclick: () => tie?.show() }, arrow, 'Show'))
  const parts = [line, dot, notch, show, ...(mark ? [mark] : [])]
  let tie: Tie | null = null
  let size = { w: card.offsetWidth || 320, h: 240 }
  let placed: (Placed & { for: Pt; win: string; size: string }) | null = null
  let side: Side | null = null
  let hopUntil = 0
  const drawn = { card: '', max: '', line: '', dot: '', notch: '', show: '', mark: '' }
  card.classList.add('anchored')

  const set = (el: HTMLElement, key: keyof typeof drawn, t: string) => { if (drawn[key] !== t) { el.style.transform = t; drawn[key] = t } }
  const hide = (...els: (HTMLElement | null)[]) => { for (const el of els) if (el && !el.hidden) el.hidden = true }
  const reveal = (el: HTMLElement) => { if (el.hidden) el.hidden = false }

  function update(next: Tie | null): void {
    if (next?.thing !== tie?.thing) { placed = null; side = null }
    tie = next
    if (tie) card.dataset.thing = tie.thing
    else delete card.dataset.thing
    if (card.hidden || !tie) return
    // Its own height, with all the room it wants: the frame gives it that, or less where the land is short.
    const was = card.style.maxHeight
    card.style.maxHeight = 'none'
    size = { w: card.offsetWidth || size.w, h: card.offsetHeight || size.h }
    card.style.maxHeight = was
  }

  function frame(mode: Mode, quiet = false): void {
    const live = !!tie && !card.hidden && !quiet
    if (!live || card.classList.contains('out')) {
      hide(line, dot, notch, show, mark)
      if (card.hidden) { placed = null; side = null }
      return
    }
    const t = tie!.at()
    if (mode !== 'float') {
      if (drawn.card) { card.style.transform = ''; drawn.card = '' }
      if (drawn.max) { card.style.maxHeight = ''; drawn.max = '' }
      card.classList.remove('hop')
      placed = null
      hide(line, dot, show, mark)
      if (mode === 'plain' || !t) { hide(notch); return }
      const edge = mode === 'sheet' ? 'top' : 'left'
      const n = notchOf(box(card.getBoundingClientRect()), t.end ?? t.point, edge)
      reveal(notch)
      notch.dataset.edge = edge
      set(notch, 'notch', `translate3d(${n.x.toFixed(1)}px, ${n.y.toFixed(1)}px, 0)`)
      return
    }
    hide(notch)
    const land = ties().land()
    const win = `${innerWidth}x${innerHeight}`
    const sized = `${size.w}x${size.h}`
    if (!t) {
      // Nowhere to tie it: it stays where it was, or stands in the middle of the land.
      hide(line, dot, show, mark)
      if (!placed) {
        const x = Math.max(land.win.left, (land.win.left + land.win.right - size.w) / 2), y = Math.max(land.win.top, (land.win.top + land.win.bottom - size.h) / 2)
        set(card, 'card', `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`)
      }
      return
    }
    const cardBox = (p: Placed): Box => ({ left: p.x, top: p.y, right: p.x + size.w, bottom: p.y + p.h })
    const at = placed ? Math.hypot(t.point.x - placed.for.x, t.point.y - placed.for.y) : Infinity
    // Where it lies still serves: in the window, off the bars (a list that grew, the grid opened), off its handle.
    let fits = !!placed && placed.win === win && !placed.away && holds(land.win, t.point, 0.5)
    if (fits && placed!.size !== sized) {
      // Its own height changed (an order given, a line more under the orders): its top left corner stays where it
      // is, so nothing in it moves under the pointer; it grows downward, or scrolls.
      const h = Math.min(size.h, roomUnder(placed!.x, placed!.y, size.w, land.win, land.blocks) - placed!.y)
      if (h >= Math.min(size.h, 220)) placed = { ...placed!, h, size: sized }
      else fits = false
    }
    if (fits) {
      const b = cardBox(placed!)
      fits = b.right <= land.win.right + 0.5 && b.bottom <= land.win.bottom + 0.5 && !land.blocks.some(k => meets(b, k)) && !(t.keep && meets(b, t.keep)) && !holds(b, t.point, 2)
    }
    // Nothing moved: it stays. A person walking, a tractor at work: the card waits while they are still close by,
    // then steps after them.
    const keep = fits && !ties().moving() && (at < 0.05 || (!!tie!.loose && at < HOLD))
    if (!keep) {
      const stepped = !!tie!.loose && !!placed && !ties().moving()
      // Laid for the first time, the card takes the place beside its thing that hides the fewest other tags and
      // people. Carried by the camera after that it lies as it lay, so a tag passing under it never makes it jump.
      const fresh = !placed || placed.away
      const p = placeCard({
        point: t.point, size, win: land.win, blocks: land.blocks, keep: t.keep, avoid: t.avoid, spare: t.spare, others: fresh ? land.tags?.() : undefined,
        prev: side, prevOff: fresh ? null : { x: placed!.x - placed!.at.x, y: placed!.y - placed!.at.y },
      })
      placed = { ...p, for: t.point, win, size: sized }
      side = p.side
      if (stepped && !ctx.reduced()) { hopUntil = performance.now() + 220; card.classList.add('hop') }
    }
    if (hopUntil && performance.now() > hopUntil) { hopUntil = 0; card.classList.remove('hop') }
    const p = placed!
    set(card, 'card', `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`)
    const max = p.h < size.h - 0.5 ? `${Math.floor(p.h)}px` : ''
    if (drawn.max !== max) { card.style.maxHeight = max; drawn.max = max }
    if (card.dataset.side !== p.side) card.dataset.side = p.side
    if (card.dataset.over !== String(p.over)) card.dataset.over = String(p.over)
    if ((card.dataset.aside === '1') !== p.aside) { if (p.aside) card.dataset.aside = '1'; else delete card.dataset.aside }
    if (p.away) {
      // Out of the picture: no tether to draw, only the way it lies and the key that brings it back.
      hide(line, dot, mark)
      reveal(show)
      const b = cardBox(p)
      const tall = show.offsetHeight || 40
      const above = b.top - tall - 4 >= land.win.top - 4
      set(show, 'show', `translate3d(${(b.left + 10).toFixed(1)}px, ${(above ? b.top - tall - 4 : b.bottom + 4).toFixed(1)}px, 0)`)
      const way = Math.atan2(t.point.y - (b.top + b.bottom) / 2, t.point.x - (b.left + b.right) / 2)
      arrow.style.transform = `rotate(${way.toFixed(3)}rad)`
      return
    }
    hide(show)
    const tt = tetherOf(cardBox(p), t.keep ?? t.end ?? t.point)
    if (tt.len < 2) hide(line)
    else { reveal(line); set(line, 'line', `translate3d(${tt.from.x.toFixed(1)}px, ${tt.from.y.toFixed(1)}px, 0) rotate(${tt.angle.toFixed(4)}rad) scaleX(${(tt.len / 100).toFixed(4)})`) }
    reveal(dot)
    set(dot, 'dot', `translate3d(${tt.to.x.toFixed(1)}px, ${tt.to.y.toFixed(1)}px, 0)`)
    if (mark) {
      if (t.mark) { reveal(mark); set(mark, 'mark', `translate3d(${t.mark.x.toFixed(1)}px, ${t.mark.y.toFixed(1)}px, 0)`) }
      else hide(mark)
    }
  }

  return { parts, update, frame, dispose() { for (const el of parts) el.remove(); card.classList.remove('anchored') } }
}
