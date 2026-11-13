// A stencilled manila tag on each field the farm holds (design/season.html): its name and where it is in its year,
// "on the list" once an order is given, and beside it the need's stamp, inked by kind. In spring, land that can be
// rented or bought carries a quieter tag. Tags follow their fields with transforms only and never scale.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { CODE } from './help.ts'
import { need, tag, type Ink } from './system/parts.ts'

export interface PlateModel {
  name: string
  glyph: string
  // A second word on the tag: the variety in spring, the barrels waiting in the fall.
  sub?: string
  // What else is true of the field; a screen reader hears it in `said`, the eye reads it on the field's card.
  marks: { glyph: string; cls: string; n?: string }[]
  // The orders on its list: the first one's cut goes on the tag beside "On the list".
  queue: { glyph: string; active: boolean }[]
  // What it needs. ink: the stamp's ink by kind (red blight or loss, blue water, ink other work); a need the goal or a
  // tip points at is the one next thing, ochre and ringed (taught).
  badge: { glyph: string; label: string; urgent: boolean; ink?: Ink } | null
  // What a screen reader hears for the tag.
  said: string
  // The need a tip or the goal is about holds its ring until it is put away.
  taught?: boolean
  // Land the farm could rent or buy: a quieter tag.
  land?: boolean
  // The number key that picks it.
  key?: string
  // 'tract' for woods and brush still to clear.
  cls?: string
  // What the field is, said beside its tag while the pointer is on it or it is in hand: "Resting: oats and clover".
  hoverName?: string
}

const GAP = 6
// What a stamp's ink says, as How to play has it.
const INK_SAYS = Object.fromEntries(CODE.map(([ink, , name, says]) => [ink || 'ink', `${name}: ${says}`])) as Record<Ink, string>
// Tags keep only their names, each on or beside its own field, once a field (14.4 plan units along its rows) is
// narrower on screen than a tag: below FAR_IN pixels a plan unit, and back above FAR_OUT.
const FAR_IN = 10, FAR_OUT = 12
// How far the camera may carry the tags with their fields before the crowding is settled again, in pixels, or zoom
// (the log of the change in scale).
const RESETTLE_PX = 24, RESETTLE_ZOOM = 0.06
// The room kept beside every tag for "on the list" and a stamp, so neither coming crowds the next tag.
const LIST_W = 96, STAMP_W = 52

// How far the face of a tag over a field in view may stand from the field's outline on the screen, in pixels; and
// the steps tried round where it would stand for a place clear of the other tags, over three rows down and up.
const NEAR = 4
const STEP_Y = 6, REACH_ROWS = 3
// The space kept between rows of tags far out, in pixels.
const ROW_GAP = 2
// How far the face of a tag keeps inside the free land, in pixels.
const EDGE = 4

// on: over its field. docked: pushed inside the free part of the window. shelf: its field has no place on the map
// yet, so it waits in a row under the top. gone: its field is out of view and nothing calls for it.
type Place = 'on' | 'docked' | 'shelf' | 'gone'
interface Box { x: number; y: number; place: Place }
// w, h: the tag. extra: the stamp beside it.
interface Size { w: number; h: number; extra: number }
interface Rect { l: number; t: number; r: number; b: number }
type Pt = { x: number; y: number }

function finite(a: { x: number; y: number }): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y)
}

function meet(a: Rect, b: Rect, px: number, py: number): boolean {
  return a.l < b.r + px && a.r + px > b.l && a.t < b.b + py && a.b + py > b.t
}

function within(p: Pt, poly: Pt[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

// How far a segment lies from a box: 0 where it crosses it.
function segGap(a: Pt, b: Pt, r: Rect): number {
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1, cut = true
  for (const [p, q] of [[-dx, a.x - r.l], [dx, r.r - a.x], [-dy, a.y - r.t], [dy, r.b - a.y]]) {
    if (p === 0) { if (q < 0) { cut = false; break } continue }
    const t = q / p
    if (p < 0) { if (t > t1) { cut = false; break } t0 = Math.max(t0, t) } else { if (t < t0) { cut = false; break } t1 = Math.min(t1, t) }
  }
  if (cut) return 0
  const toBox = (p: Pt) => Math.hypot(Math.max(r.l - p.x, 0, p.x - r.r), Math.max(r.t - p.y, 0, p.y - r.b))
  const toSeg = (p: Pt) => {
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  return Math.min(toBox(a), toBox(b), ...[[r.l, r.t], [r.r, r.t], [r.r, r.b], [r.l, r.b]].map(([x, y]) => toSeg({ x, y })))
}

// How far a box lies from a field's outline on the screen: 0 where they touch.
function gapTo(r: Rect, poly: Pt[]): number {
  if (poly.length > 2 && within({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 }, poly)) return 0
  let d = Infinity
  for (let k = 0; k < poly.length; k++) d = Math.min(d, segGap(poly[k], poly[(k + 1) % poly.length], r))
  return d
}

// A tag stays where it was put until the camera moves: a card opening or closing, an order given or a stamp coming
// never moves a tag the player may be reaching for. Crowding is settled only when the camera moves, against the room a
// tag takes with "on the list" and a stamp. What floats over the land (a card, the grid) lies over the tags; covers is
// not read.
export function plates(ctx: Ctx, layer: HTMLElement, o: { model: (i: number) => PlateModel | null; onBadge: (i: number) => void; covers?: () => DOMRect[] }): { update(): void; frame(): void; dispose(): void; boxes(): DOMRect[]; byField(): { field: number; box: DOMRect; need: boolean }[] } {
  const app = ctx.app
  const wraps: HTMLElement[] = []
  const models: (PlateModel | null)[] = []
  // size: the tags as drawn now. full: as drawn with their names, which is what decides whether they fit. face: where
  // the tag itself lies in the row it stands in.
  const size: Size[] = []
  const full: Size[] = []
  const face: { t: number; h: number }[] = []
  const listed: boolean[] = []
  const at: Box[] = []
  let compact = false
  let far = false
  // The camera and the window the tags were last settled for; and for each tag, where its field was when it was put.
  let laid: { key: string; anchors: { x: number; y: number }[]; k: number } | null = null
  const ref: { x: number; y: number }[] = []
  let lastAnchors: { x: number; y: number }[] | null = null
  let wasMoving = false
  // Tags that gave way to others on a phone, until the next settling.
  const yielded: boolean[] = new Array(S.FIELD_COUNT).fill(false)
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const wrap = h('div', { class: 'tag-wrap gone', hidden: true })
    wraps.push(wrap)
    models.push(null)
    size.push({ w: 150, h: 34, extra: 0 })
    full.push({ w: 150, h: 34, extra: 0 })
    face.push({ t: 0, h: 34 })
    listed.push(false)
    at.push({ x: -1, y: -1, place: 'gone' })
    layer.append(wrap)
  }

  // The wheel over a tag, a stamp or a face zooms the land as it would anywhere else on it.
  const wheel = (e: WheelEvent) => {
    const land = document.getElementById('field')
    if (!land || !(e.target as HTMLElement).closest?.('.tag-wrap, .pin-at, .pin-list-at, .yard-at')) return
    e.preventDefault()
    land.dispatchEvent(new WheelEvent('wheel', { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true }))
  }
  layer.addEventListener('wheel', wheel, { passive: false })
  const down = () => { app.pressing = true }
  const up = () => { app.pressing = false }
  layer.addEventListener('pointerdown', down)
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', up, true)
  // A stamp whose order was just given (or whose need went) stays a moment where it was, faded and inert, so the next
  // press of a run of stamp clicks lands on nothing rather than on the tag beside it.
  const lastBadge: ({ b: NonNullable<PlateModel['badge']>; until: number } | null)[] = []
  const FADE_MS = 1500

  // A stamp or "on the list" already there is drawn again without stamping it down a second time.
  const was: string[] = []

  function pick(i: number, add: boolean): void {
    const m = models[i]
    if (!m) return
    app.select(i, add && !m.land)
    // A tag standing in for a field out of view takes the camera there.
    if (at[i].place === 'docked' && !ctx.view.fieldAnchor(i).visible) app.focus(i)
  }

  function update(): void {
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const m = o.model(i)
      models[i] = m
      const wrap = wraps[i]
      wrap.hidden = !m
      if (!m) continue
      const on = app.selection.includes(i)
      const head = m.queue.find(q => q.active) ?? m.queue[0]
      const now = performance.now()
      if (m.badge) lastBadge[i] = { b: m.badge, until: 0 }
      else if (lastBadge[i] && !lastBadge[i]!.until) { lastBadge[i]!.until = now + FADE_MS; setTimeout(() => ctx.dirty(), FADE_MS + 30) }
      const fading = !m.badge && lastBadge[i] && now < lastBadge[i]!.until ? lastBadge[i]!.b : null
      const b = m.badge ?? fading
      patch(wrap, JSON.stringify([m, on, ctx.touch(), !!fading]), () => [tag({
        name: m.name, icon: m.glyph, selected: on, variety: m.sub, listed: head && !m.land ? { icon: head.glyph } : undefined,
        testid: m.land ? `land-${i}` : `field-${i}`, said: m.said, cls: `${m.land ? 'is-land' : ''}${m.cls ? ` ${m.cls}` : ''}${b ? ' has-need' : ''}`.trim() || undefined,
        attrs: {
          class: 'plate', 'data-k': `field-${i}`, 'aria-keyshortcuts': m.key || null, title: ctx.touch() ? undefined : m.said,
          ondblclick: () => { if (!m.land) app.selectLike(i) },
          oncontextmenu: (e: Event) => { e.preventDefault(); if (!m.land) o.onBadge(i) },
          onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.setHover(i) },
          onpointerleave: () => { if (app.hover === i) app.setHover(-1) },
        },
        onclick: (e: Event) => pick(i, (e as MouseEvent).shiftKey),
        need: b ? need({
          ink: m.taught ? 'ochre' : b.ink ?? 'ink', next: !!m.taught, icon: b.glyph, label: b.label, testid: fading ? `fading-${i}` : `badge-${i}`,
          attrs: { class: `badge${b.urgent ? ' urgent' : ''}${m.taught ? ' taught' : ''}${fading ? ' fading' : ''}`, title: ctx.touch() || fading ? undefined : `${b.label} (${INK_SAYS[m.taught ? 'ochre' : b.ink ?? 'ink']})`, 'aria-hidden': fading ? 'true' : null, tabindex: fading ? '-1' : null },
          onclick: () => { if (!fading) o.onBadge(i) },
        }) : null,
      }), m.hoverName ? h('p', { class: 'hover-name', 'aria-hidden': 'true' }, m.hoverName) : null])
      const look = `${b?.glyph ?? ''}|${head?.glyph ?? ''}`
      wrap.classList.toggle('still', was[i] === look)
      was[i] = look
      wrap.style.zIndex = on ? '5' : m.taught ? '4' : b ? '3' : m.land ? '1' : '2'
    }
    measure()
  }

  function measure(): void {
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (!models[i] || at[i].place === 'gone') continue
      const t = wraps[i].querySelector<HTMLElement>('.tag')
      const n = wraps[i].querySelector<HTMLElement>('.need')
      listed[i] = !!t?.querySelector('.listed')
      // h: the row the tag stands in (as tall as a stamp, whether or not one is there), so a stamp coming or going
      // leaves the tag where it is.
      const row = t?.parentElement
      if (t && t.offsetWidth) {
        size[i] = { w: t.offsetWidth, h: row?.offsetHeight || t.offsetHeight, extra: n ? n.offsetWidth + 7 : 0 }
        face[i] = { t: t.offsetTop, h: t.offsetHeight }
      }
      if (!compact) full[i] = size[i]
    }
  }

  // The room a tag is settled for: as drawn, with room kept for "on the list" and a stamp (far out, names only).
  function room(i: number, sz: Size[]): Size {
    const z = sz[i]
    // On a phone the tags settle again whenever anything changes (no pointer rests on them), and there is no width
    // to keep in reserve.
    const small = ctx.layout() === 'narrow' || ctx.layout() === 'short'
    if (far || small || models[i]?.land) return z
    return { w: z.w + (listed[i] ? 0 : LIST_W), h: z.h, extra: Math.max(z.extra, STAMP_W) }
  }

  // How far out the camera is, in screen pixels to a plan unit: the home fields' anchors are 16.2 plan units apart
  // across the slope and 26.4 down it.
  function scale(): number {
    const a = ctx.view.fieldAnchor(0), b = ctx.view.fieldAnchor(1), c = ctx.view.fieldAnchor(4)
    if (!finite(a) || !finite(b) || !finite(c)) return Infinity
    return Math.max(Math.hypot(a.x - b.x, a.y - b.y) / 16.2, Math.hypot(a.x - c.x, a.y - c.y) / 26.4)
  }

  // Where each field's tag goes before crowding is settled: over its field, held inside the free part of the window,
  // on the shelf, or gone. x is the middle of the tag as drawn, y its foot.
  function targets(sz: Size[]): Box[] {
    const ins = app.insets
    const want: Box[] = []
    // In view means on the land the interface leaves free: a field under a sheet or the boards is as good as out of view.
    const inView = (a: { x: number; y: number; visible: boolean }) => a.visible && a.x >= ins.left && a.x <= innerWidth - ins.right && a.y >= ins.top && a.y <= innerHeight - ins.bottom
    // Of the land out of view, one tag for each block waits at the edge, so the player knows which way it lies.
    const pointed = new Set<string>()
    for (let i = 0; i < S.FIELD_COUNT; i++) if (models[i]?.land && inView(ctx.view.fieldAnchor(i))) pointed.add(S.PARCELS[i].block)
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const m = models[i]
      if (!m) { want.push({ x: -1, y: -1, place: 'gone' }); continue }
      const a = ctx.view.fieldAnchor(i)
      if (!finite(a)) { want.push({ x: 0, y: 0, place: 'shelf' }); continue }
      const block = S.PARCELS[i].block
      const seen = inView(a)
      const first = !!m.land && !seen && !pointed.has(block)
      if (first) pointed.add(block)
      // A field the camera has on the screen, though under a sheet or the boards, is moved clear rather than dropped.
      const wanted = app.selection.includes(i) || !!m.badge || first || a.visible
      if (!seen && !wanted) { want.push({ x: a.x, y: a.y, place: 'gone' }); continue }
      const { w, h: hh, extra } = sz[i]
      const x0 = ins.left + GAP + w / 2, x1 = innerWidth - ins.right - GAP - w / 2 - extra
      const y0 = ins.top + GAP + hh + 6, y1 = innerHeight - ins.bottom - GAP - 5
      // No land left between the boards (a phone with a pop open over it): the tags wait until there is, all but the
      // field in hand's.
      if (y1 < y0 && !app.selection.includes(i)) { want.push({ x: a.x, y: a.y, place: 'gone' }); continue }
      const x = Math.max(x0, Math.min(Math.max(x0, x1), a.x)), y = Math.max(y0, Math.min(Math.max(y0, y1), a.y))
      want.push({ x, y, place: !seen || Math.abs(x - a.x) > 1 || Math.abs(y - a.y) > 1 ? 'docked' : 'on' })
    }
    return want
  }

  // Where each tag goes for tags of these sizes: over its field, clear of the boards and of each other.
  // over: there was not the room, and some had to overlap. final: the last fold, where a tag may give way (gave).
  function place(sz0: Size[], final = false): { want: Box[]; over: boolean; gave: number[] } {
    const ins = app.insets
    const sz = sz0.map((_, i) => room(i, sz0))
    const want = targets(sz)
    // The tag is drawn from its left edge as the room would put it, whatever it holds now.
    for (let i = 0; i < S.FIELD_COUNT; i++) if (want[i].place !== 'gone') want[i].x += (sz0[i].w - sz[i].w) / 2
    const shown: number[] = []
    const shelf: number[] = []
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (want[i].place === 'gone') continue
      shown.push(i)
      if (want[i].place === 'shelf') shelf.push(i)
    }
    if (shelf.length) {
      const rows: number[][] = [[]]
      let used = 0
      for (const i of shelf) {
        const w = sz[i].w + sz[i].extra + GAP
        if (used + w > innerWidth - GAP && rows[rows.length - 1].length) { rows.push([]); used = 0 }
        rows[rows.length - 1].push(i)
        used += w
      }
      let y = ins.top + GAP
      for (const row of rows) {
        const total = row.reduce((s0, i) => s0 + sz[i].w + sz[i].extra + GAP, -GAP)
        const tall = Math.max(...row.map(i => sz[i].h))
        let x = Math.max(GAP, (innerWidth - total) / 2)
        y += tall + 8
        for (const i of row) {
          want[i] = { x: x + sz0[i].w / 2, y, place: 'shelf' }
          x += sz[i].w + sz[i].extra + GAP
        }
      }
    }
    // Far out a tag never drifts from its field: the field in hand, then those with a stamp, then those whose field
    // lies under the boards (they have the least room), then the rest from the top down, each takes the nearest place
    // by its own field clear of the ones already put.
    if (far) {
      const taken = shelf.map(i => roomAt(i, want[i], sz0, sz))
      const kept = (i: number) => app.selection.includes(i) || !!models[i]?.badge
      const under = (i: number) => { const a = ctx.view.fieldAnchor(i); return a.visible && (a.y > innerHeight - ins.bottom || a.y < ins.top || a.x < ins.left || a.x > innerWidth - ins.right) }
      const rank = (i: number) => (app.selection.includes(i) ? 4 : 0) + (models[i]?.badge ? 2 : 0) + (under(i) ? 1 : 0)
      const order = shown.filter(i => want[i].place !== 'shelf').sort((p, q) => rank(q) - rank(p) || want[p].y - want[q].y || p - q)
      let over = false
      const gave: number[] = []
      for (const i of order) {
        let w = spot(i, want[i], sz0, sz, taken, false)
        if (!w) {
          over = true
          // Even folded to their cut there is not the room: a tag nothing calls for gives way rather than lie on
          // another or stray from its field; one the player needs takes the nearest free place.
          if (final && !kept(i)) { want[i] = { ...want[i], place: 'gone' }; gave.push(i); continue }
          if (final) w = spot(i, want[i], sz0, sz, taken, true)
        }
        if (w) want[i] = w
        taken.push(roomAt(i, want[i], sz0, sz))
      }
      return { want, over, gave }
    }
    // Lower tags give way downward to the ones above them; then any pushed past the bottom climb back, lifting what
    // they meet. Measured by the room from each tag's left edge.
    const left = (j: number) => want[j].x - sz0[j].w / 2
    const apart = (j: number, k: number) => left(j) < left(k)
      ? left(k) - (left(j) + sz[j].w + sz[j].extra)
      : left(j) - (left(k) + sz[k].w + sz[k].extra)
    const order = [...shown].sort((p, q) => want[p].y - want[q].y || p - q)
    for (let n = 1; n < order.length; n++) {
      const j = order[n]
      for (let m = 0; m < n; m++) {
        const k = order[m]
        if (apart(j, k) < GAP && want[j].y - sz[j].h - 12 < want[k].y) { want[j].y = want[k].y + sz[j].h + 12; if (want[j].place === 'on') want[j].place = 'docked' }
      }
    }
    const floor = innerHeight - ins.bottom - GAP - 5
    for (let n = order.length - 1; n >= 0; n--) {
      const j = order[n]
      if (want[j].y > floor) { want[j].y = floor; if (want[j].place === 'on') want[j].place = 'docked' }
      for (let m = n - 1; m >= 0; m--) {
        const k = order[m]
        if (apart(j, k) < GAP && want[j].y - sz[j].h - 12 < want[k].y) { want[k].y = want[j].y - sz[j].h - 12; if (want[k].place === 'on') want[k].place = 'docked' }
      }
    }
    const ceiling = ins.top + GAP
    let over = false
    for (const i of shown) {
      if (want[i].y < ceiling + sz[i].h + 5) over = true
      want[i].y = Math.max(want[i].y, ceiling + sz[i].h + 6)
    }
    return { want, over, gave: [] }
  }

  // The room a tag at w takes from the others: from its left edge, with its stamp beside it.
  function roomAt(i: number, w: Box, sz0: Size[], sz: Size[]): Rect {
    const l = w.x - sz0[i].w / 2
    return { l, t: w.y - sz[i].h, r: l + sz[i].w + sz[i].extra, b: w.y }
  }

  // The nearest place to w where tag i stands clear of what is taken and of the boards: over its own field or right
  // beside it while the field is on the screen (at the edge of the free land nearest it when the field lies under the
  // boards), never drifting off it; or, for a field out of view or when loose, up and down from where it waits.
  // null: there is no such place.
  function spot(i: number, w: Box, sz0: Size[], sz: Size[], taken: Rect[], loose: boolean): Box | null {
    const ins = app.insets
    // The free land, for the face of the tag; its row and its stamp may reach a little past.
    const land: Rect = { l: ins.left + EDGE, t: ins.top + EDGE, r: innerWidth - ins.right - EDGE, b: innerHeight - ins.bottom - EDGE }
    const below = sz0[i].h - face[i].t - face[i].h
    const a = ctx.view.fieldAnchor(i)
    const corners = a.visible ? ctx.view.fieldCorners(i).filter(finite) : []
    const outline: Pt[] = corners.length > 2 ? corners : [{ x: a.x, y: a.y }]
    const free = (v: Box) => {
      const r = roomAt(i, v, sz0, sz)
      return r.l >= land.l && r.r <= land.r && r.t + face[i].t >= land.t && r.b - below <= land.b && !taken.some(x => meet(r, x, GAP, ROW_GAP))
    }
    const toFace = (v: Box): Rect => { const l = v.x - sz0[i].w / 2, t = v.y - sz0[i].h + face[i].t; return { l, t, r: l + sz0[i].w, b: t + face[i].h } }
    if (a.visible) {
      const owed = gapTo(land, outline)
      const bx = Math.max(land.l + sz0[i].w / 2, Math.min(land.r - sz[i].w - sz[i].extra + sz0[i].w / 2, a.x + (sz0[i].w - sz[i].w) / 2))
      const by = Math.max(land.t - face[i].t + sz[i].h, Math.min(land.b + below, a.y))
      for (const t of steps(true, Math.ceil(REACH_ROWS * (sz[i].h + ROW_GAP) / STEP_Y), sz0[i].w)) {
        const v: Box = { x: bx + t.dx, y: by + t.dy, place: w.place === 'on' && by === a.y && !t.dx && !t.dy ? 'on' : 'docked' }
        if (free(v) && gapTo(toFace(v), outline) <= owed + NEAR) return v
      }
      if (!loose) return null
    }
    for (const t of steps(false, Math.ceil(innerHeight / STEP_Y), sz0[i].w)) {
      const v: Box = { x: w.x, y: w.y + t.dy, place: w.place }
      if (free(v)) return v
    }
    return null
  }

  // The steps tried round a tag, nearest first: down, then up, before across, or up and down an edge.
  const tried = new Map<string, { dx: number; dy: number; c: number }[]>()
  function steps(across: boolean, reach: number, w: number): { dx: number; dy: number; c: number }[] {
    const key = `${across} ${reach} ${Math.round(w)}`
    let out = tried.get(key)
    if (out) return out
    out = []
    for (let k = -reach; k <= reach; k++) {
      for (let s = across ? -5 : 0; s <= (across ? 5 : 0); s++) {
        const dx = s * Math.round(w) / 4, dy = k * STEP_Y
        out.push({ dx, dy, c: (dy < 0 ? 2 * -dy + 1 : dy) + 2 * Math.abs(dx) })
      }
    }
    out.sort((p, q) => p.c - q.c)
    if (tried.size > 200) tried.clear()
    tried.set(key, out)
    return out
  }

  // The tag's top left corner is fixed when it is put: a tag that grows afterwards grows to the right and down.
  const drawn: string[] = []
  function show(i: number, w: Box): void {
    at[i] = w
    const wrap = wraps[i]
    wrap.classList.toggle('gone', w.place === 'gone')
    wrap.classList.toggle('docked', w.place === 'docked' || w.place === 'shelf')
    if (w.place === 'gone') return
    const t = `translate3d(${(w.x - size[i].w / 2).toFixed(1)}px, ${(w.y - size[i].h).toFixed(1)}px, 0)`
    if (t !== drawn[i]) { wrap.style.transform = t; drawn[i] = t }
  }

  // The camera moved (or the window, or the boards): every tag is put again. Far out (a field narrower on the screen
  // than a tag), the tags keep only their names and stay on or right beside their own fields. Where named tags would
  // still have to overlap, or far out stray from their fields, all but the selected one fold down to their cut; the
  // test is made with the full sizes, so the fold cannot flicker.
  function settle(): void {
    const k = scale()
    const nowFar = far ? k < FAR_OUT : k < FAR_IN
    if (nowFar !== far) {
      far = nowFar
      compact = false
      layer.classList.toggle('far', far)
      layer.classList.remove('compact')
      measure()
    }
    // Tags coming into view are drawn first, so they are settled at their own size.
    const first = place(full).want
    let fresh = false
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (first[i].place === 'gone' || at[i].place !== 'gone') continue
      wraps[i].classList.remove('gone')
      at[i] = { ...first[i] }
      fresh = true
    }
    if (fresh) measure()
    const named = place(full)
    if (named.over !== compact) {
      compact = named.over
      layer.classList.toggle('compact', compact)
      measure()
    }
    const put = compact ? place(size, true) : named
    const want = put.want
    yielded.fill(false)
    for (const i of put.gave) yielded[i] = true
    // On a phone, where even folded tags cannot all be kept apart, a tag that stands in for a field out of view gives
    // way to the ones over their fields rather than lie on them.
    if (ctx.layout() === 'narrow' || ctx.layout() === 'short') {
      const box = (i: number) => ({ l: want[i].x - size[i].w / 2, r: want[i].x + size[i].w / 2 + size[i].extra, t: want[i].y - size[i].h, b: want[i].y })
      const kept: number[] = []
      const order = [...Array(S.FIELD_COUNT).keys()].filter(i => want[i].place !== 'gone')
        .sort((p, q) => Number(app.selection.includes(q)) - Number(app.selection.includes(p)) || Number(want[q].place === 'on') - Number(want[p].place === 'on') || p - q)
      for (const i of order) {
        const a = box(i)
        const hit = kept.some(j => { const b = box(j); return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t })
        if (hit && !app.selection.includes(i)) { want[i] = { ...want[i], place: 'gone' }; yielded[i] = true }
        else kept.push(i)
      }
    }
    for (let i = 0; i < S.FIELD_COUNT; i++) show(i, want[i])
  }

  // The camera has not moved: a tag that comes (a stamp on a field out of view, a field selected from the list) is put
  // where there is room for it, below the tags already there (far out, by its own field); the rest stay exactly where
  // they are.
  function arrivals(anchors: { x: number; y: number }[]): void {
    const want = targets(size)
    const floor = innerHeight - app.insets.bottom - GAP - 5
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (at[i].place !== 'gone') { if (want[i].place === 'gone') show(i, want[i]); continue }
      if (want[i].place === 'gone' || want[i].place === 'shelf' || wraps[i].hidden || (yielded[i] && !app.selection.includes(i))) continue
      wraps[i].classList.remove('gone')
      at[i] = { x: NaN, y: NaN, place: 'docked' }
      measure()
      const z = room(i, size)
      const w = { ...targets(size.map((_, j) => room(j, size)))[i] }
      w.x += (size[i].w - z.w) / 2
      if (far) {
        const taken: Rect[] = []
        for (let j = 0; j < S.FIELD_COUNT; j++) if (j !== i && at[j].place !== 'gone' && !wraps[j].hidden && finite(at[j])) taken.push(roomAt(j, at[j], size, size))
        show(i, spot(i, w, size, size, taken, true) ?? { ...w, y: Math.min(w.y, floor) })
        ref[i] = anchors[i]
        continue
      }
      const meets = (j: number) => {
        const b = at[j], l = w.x - size[i].w / 2, lj = b.x - size[j].w / 2
        return j !== i && b.place !== 'gone' && !wraps[j].hidden && l < lj + room(j, size).w + room(j, size).extra && l + z.w + z.extra > lj
          && w.y - z.h - 6 < b.y && w.y > b.y - size[j].h - 6
      }
      for (let n = 0; n < S.FIELD_COUNT; n++) {
        const hit = at.findIndex((_, j) => meets(j))
        if (hit < 0) break
        w.y = at[hit].y + z.h + 12
        w.place = 'docked'
      }
      if (w.y > floor) w.y = floor
      show(i, w)
      ref[i] = anchors[i]
    }
  }

  function frame(): void {
    for (let i = 0; i < S.FIELD_COUNT; i++) if (models[i]?.hoverName) wraps[i].classList.toggle('named', app.hover === i || app.selection.includes(i))
    const anchors: { x: number; y: number }[] = []
    for (let i = 0; i < S.FIELD_COUNT; i++) { const a = ctx.view.fieldAnchor(i); anchors.push(a.visible ? { x: a.x, y: a.y } : { x: NaN, y: NaN }) }
    // The boards' edges changing (the list filling, a sheet on a phone) moves no tag until the camera moves.
    const small = ctx.layout() === 'narrow' || ctx.layout() === 'short'
    const key = `${innerWidth}x${innerHeight} ${ctx.touch()}${small ? ` ${app.insets.bottom} ${app.insets.top} ${models.map(m => m ? `${m.badge?.glyph ?? ''}${m.queue.length}` : '').join(',')}` : ''}`
    // A field coming into view or leaving it, or the camera carrying the tags far, settles the crowding again; a small
    // move (the camera easing to rest, a turn begun) carries each tag with its field and leaves them as they were.
    // Only while the camera is moving: with it still, nothing is put again, whatever has gathered since.
    const moving = !lastAnchors || anchors.some((a, i) => { const b = lastAnchors![i]; return finite(a) !== finite(b) || (finite(a) && Math.hypot(a.x - b.x, a.y - b.y) > 0.25) })
    lastAnchors = anchors
    // On a phone, once the camera comes to rest the crowding is settled for where it stopped (riding the last small
    // moves can bring tags together); there is no pointer resting on a tag to keep still. Far out too, where the
    // fields are small beside the tags.
    const rested = (small || far) && wasMoving && !moving
    wasMoving = moving
    // Far out, a zoom changes the fields' size on the screen under tags that keep theirs, so it settles them too.
    const k = scale()
    const zoomed = !!laid && (far || k < FAR_OUT) && Number.isFinite(k) && Number.isFinite(laid.k) && Math.abs(Math.log(k / laid.k)) > RESETTLE_ZOOM
    const far0 = !laid || laid.key !== key || ((moving || rested) && (zoomed || anchors.some((a, i) => {
      const b = laid!.anchors[i]
      return finite(a) !== finite(b) || (finite(a) && Math.hypot(a.x - b.x, a.y - b.y) > (rested ? 0.5 : RESETTLE_PX))
    })))
    if (far0) {
      // Why the tags were put again, for the checks that hold them to it.
      const why = !laid ? 'first' : laid.key !== key ? 'window' : `camera${zoomed ? ' zoom' : ''} ${anchors.map((a, i) => { const b = laid!.anchors[i]; return finite(a) !== finite(b) ? `${i}:seen` : finite(a) && Math.hypot(a.x - b.x, a.y - b.y) > RESETTLE_PX ? `${i}:${Math.round(a.x - b.x)},${Math.round(a.y - b.y)}` : '' }).filter(Boolean).join(' ')}`
      layer.dataset.settled = `${(parseInt(layer.dataset.settled ?? '0', 10) || 0) + 1} ${why}`
      settle()
      laid = { key, anchors, k }
      for (let i = 0; i < S.FIELD_COUNT; i++) ref[i] = anchors[i]
      return
    }
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const a = anchors[i], r = ref[i], b = at[i]
      if (b.place === 'gone' || b.place === 'shelf' || !r || !finite(a) || !finite(r) || Math.hypot(a.x - r.x, a.y - r.y) < 0.25) continue
      show(i, { x: b.x + a.x - r.x, y: b.y + a.y - r.y, place: b.place })
      ref[i] = a
    }
    arrivals(anchors)
  }

  // Where the tags are now, for the pins to keep clear of; and each with its field, for a card to keep off them.
  function byField(): { field: number; box: DOMRect; need: boolean }[] {
    const out: { field: number; box: DOMRect; need: boolean }[] = []
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const b = at[i]
      if (!models[i] || b.place === 'gone' || wraps[i].hidden) continue
      out.push({ field: i, box: new DOMRect(b.x - size[i].w / 2, b.y - size[i].h - 5, size[i].w + size[i].extra, size[i].h + 10), need: !!models[i]!.badge })
    }
    return out
  }
  function boxes(): DOMRect[] {
    return byField().map(x => x.box)
  }

  return {
    update,
    frame,
    boxes,
    byField,
    dispose() {
      layer.classList.remove('compact', 'far')
      layer.removeEventListener('wheel', wheel)
      layer.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
      for (const w of wraps) w.remove()
      if (app.hover >= 0) app.setHover(-1)
    },
  }
}
