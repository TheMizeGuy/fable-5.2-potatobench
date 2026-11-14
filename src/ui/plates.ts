// A stencilled manila tag on each field the farm holds (design/season.html): its name and where it is in its year,
// "on the list" once an order is given, and beside it the need's stamp, inked by kind. In spring, land that can be
// rented or bought carries a quieter tag. Tags follow their fields with transforms only and never scale.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { CODE } from './help.ts'
import { need, tag, type Ink } from './system/parts.ts'
import { toLocal, toScreen } from './scale.ts'

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
// (the log of the change in scale). Often, so that what each settling changes is small.
const RESETTLE_PX = 12, RESETTLE_ZOOM = 0.04
// A tag put somewhere else comes to its new place on a spring (critically damped, at rest in about a quarter of a
// second), so being put again is seen as a glide and never as a jump. Further than FAR_MOVE it does not cross the
// land: it fades in where it now stands.
const SPRING = 1 / 0.052, FAR_MOVE = 130
// How long a tag that goes is still carried with its field while it fades (season.css: .tag-wrap.gone).
const FADE_OUT_MS = 180
// The room kept beside every tag for "on the list" and a stamp, so neither coming crowds the next tag.
const LIST_W = 96, STAMP_W = 52

// How far the face of a tag over a field in view may stand from the field's outline on the screen, in pixels; and
// the steps tried round where it would stand for a place clear of the other tags, over three rows down and up.
const NEAR = 4
const STEP_X = 8, STEP_Y = 6, REACH_ROWS = 3
// The space kept between rows of tags, in pixels.
const ROW_GAP = 4
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
// keep: what a tag moved by its field steps clear of (the people on the land). yards: the yards' tags, which a tag
// steps clear of too, but lies over before it would leave its own field.
export function plates(ctx: Ctx, layer: HTMLElement, o: { model: (i: number) => PlateModel | null; onBadge: (i: number) => void; covers?: () => DOMRect[]; keep?: () => DOMRect[]; yards?: () => DOMRect[]; boards?: () => DOMRect[] }): { update(): void; frame(): void; dispose(): void; boxes(): DOMRect[]; byField(): { field: number; box: DOMRect; need: boolean }[] } {
  const app = ctx.app
  const wraps: HTMLElement[] = []
  const models: (PlateModel | null)[] = []
  // size: the tags as drawn now. full: as drawn whole, which is what decides whether they fit; brief: with their names
  // only. face: where
  // the tag itself lies in the row it stands in, and its eyelet (the end it points from) across it.
  const size: Size[] = []
  const full: Size[] = []
  const brief: Size[] = []
  const face: { t: number; h: number; eye: number }[] = []
  const listed: boolean[] = []
  const at: Box[] = []
  let compact = false
  let far = false
  // The camera and the window the tags were last settled for; and for each tag, where its field was when it was put.
  let laid: { key: string; anchors: { x: number; y: number }[]; k: number } | null = null
  const ref: { x: number; y: number }[] = []
  let lastAnchors: { x: number; y: number }[] | null = null
  let wasMoving = false
  // How far each tag is drawn from where it is put, and how fast that is closing (the spring).
  const lag: { x: number; y: number; vx: number; vy: number }[] = []
  // The top left corner each tag was last put at; and, for a tag that went, where it fades and until when.
  const corner: ({ x: number; y: number } | null)[] = []
  const out: ({ x: number; y: number; until: number } | null)[] = []
  let clock = 0
  let resting = true
  // Tags that gave way to others on a phone, until the next settling.
  const yielded: boolean[] = new Array(S.FIELD_COUNT).fill(false)
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const wrap = h('div', { class: 'tag-wrap gone', hidden: true })
    wraps.push(wrap)
    models.push(null)
    size.push({ w: 150, h: 34, extra: 0 })
    full.push({ w: 150, h: 34, extra: 0 })
    brief.push({ w: 150, h: 34, extra: 0 })
    face.push({ t: 0, h: 34, eye: 15 })
    listed.push(false)
    at.push({ x: -1, y: -1, place: 'gone' })
    lag.push({ x: 0, y: 0, vx: 0, vy: 0 })
    corner.push(null)
    out.push(null)
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
        size[i] = { w: toScreen(t.offsetWidth), h: toScreen(row?.offsetHeight || t.offsetHeight), extra: n ? toScreen(n.offsetWidth + 7) : 0 }
        const eye = t.querySelector<HTMLElement>('.eyelet')
        face[i] = { t: toScreen(t.offsetTop), h: toScreen(t.offsetHeight), eye: toScreen(eye ? eye.offsetLeft + eye.offsetWidth / 2 : 15) }
      }
      if (!compact) (far ? brief : full)[i] = size[i]
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
  // snug: no room kept beside any tag (nearer in, when keeping it would carry a tag off its field).
  // fresh: every tag is put as if for the first time. Otherwise a tag keeps the place it has while that serves
  // (spot); that is tried first, and given up for a fresh putting whenever it leaves some tag without a place by its
  // own field.
  function place(sz0: Size[], final = false, snug = false, tight = false, fresh = false): { want: Box[]; over: boolean; gave: number[] } {
    close = tight
    sticky = !fresh
    try { return placed(sz0, final, snug) } finally { close = false; sticky = true }
  }

  function placed(sz0: Size[], final: boolean, snug: boolean): { want: Box[]; over: boolean; gave: number[] } {
    const ins = app.insets
    const sz = sz0.map((_, i) => snug ? sz0[i] : room(i, sz0))
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
    // Each tag stands on or right beside its own field: the field in hand, then those with a stamp, then those whose
    // field lies under the bars (they have the least room), then the rest from the top down, each takes the nearest
    // place by its own field clear of the ones already put and of the people on the land.
    const keep = (o.keep?.() ?? []).map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }))
    const yards = (o.yards?.() ?? []).map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }))
    const taken = [...keep, ...yards, ...shelf.map(i => roomAt(i, want[i], sz0, sz))]
    // (the same without the yards' tags)
    const firm = [...keep, ...shelf.map(i => roomAt(i, want[i], sz0, sz))]
    const kept = (i: number) => app.selection.includes(i) || !!models[i]?.badge
    const under = (i: number) => { const a = ctx.view.fieldAnchor(i); return a.visible && (a.y > innerHeight - ins.bottom || a.y < ins.top || a.x < ins.left || a.x > innerWidth - ins.right) }
    // Nearer in, what is in hand or stamped does not change the order, so a card opening or an order given leaves the
    // tags as they are.
    const rankOf = (i: number) => (far ? (app.selection.includes(i) ? 4 : 0) + (models[i]?.badge ? 2 : 0) : 0) + (under(i) ? 1 : 0)
    const ranks = new Map(shown.map(i => [i, rankOf(i)]))
    const rank = (i: number) => ranks.get(i)!
    const order = shown.filter(i => want[i].place !== 'shelf').sort((p, q) => rank(q) - rank(p) || want[p].y - want[q].y || p - q)
    let over = false
    const gave: number[] = []
    const tags: Rect[] = shelf.map(i => roomAt(i, want[i], sz0, sz))
    // Where the tags not yet put stand now: a tag goes back over its field only when no other stands there, so one
    // tag going home never sends its neighbour across the land.
    const standing = new Map<number, Rect>()
    for (const i of order) { const c = at[i]; if ((c.place === 'on' || c.place === 'docked') && finite(c)) standing.set(i, roomAt(i, c, sz0, sz)) }
    for (const i of order) {
      standing.delete(i)
      const rest = [...standing.values()]
      let w = spot(i, want[i], sz0, sz, taken, false, false, rest)
      if (!far) {
        // Nearer in tags stay whole and off the people on the land: looking further round the field, and only then as
        // near its field as there is room (over: a tag had to leave its field).
        if (!w) w = spot(i, want[i], sz0, sz, taken, false, true, rest)
        // (over a yard's tag sooner than off its own field)
        if (!w) w = spot(i, want[i], sz0, sz, firm, false, true, rest)
        if (!w) { over = true; w = spot(i, want[i], sz0, sz, taken, true, false, rest) }
        if (w) want[i] = w
        taken.push(roomAt(i, want[i], sz0, sz))
        firm.push(roomAt(i, want[i], sz0, sz))
        tags.push(roomAt(i, want[i], sz0, sz))
        continue
      }
      // Folded to their cut and still no room: a tag may lie over a person or a yard's tag (their pins stand above it)
      // rather than leave its field.
      if (!w && final) w = spot(i, want[i], sz0, sz, tags, false, true)
      // A field under the bars has its tag at the edge of the free land, as near it as there is room.
      if (!w && under(i)) w = spot(i, want[i], sz0, sz, taken, true)
      if (!w) {
        over = true
        // Even folded to their cut there is not the room: a tag nothing calls for gives way rather than lie on another
        // or stray from its field; one the player needs takes the nearest free place.
        if (final && !kept(i)) { want[i] = { ...want[i], place: 'gone' }; gave.push(i); continue }
        if (final) w = spot(i, want[i], sz0, sz, taken, true)
      }
      if (w) want[i] = w
      taken.push(roomAt(i, want[i], sz0, sz))
      firm.push(roomAt(i, want[i], sz0, sz))
      tags.push(roomAt(i, want[i], sz0, sz))
    }
    return { want, over, gave }
  }

  // The free land the face of a tag keeps to (its row and its stamp may reach a little past).
  function freeLand(): Rect {
    const ins = app.insets
    return { l: ins.left + EDGE, t: ins.top + EDGE, r: innerWidth - ins.right - EDGE, b: innerHeight - ins.bottom - EDGE }
  }

  // The field's outline on the screen (its anchor alone when that is all there is), or null when it is not in view.
  function outlineOf(i: number): Pt[] | null {
    const a = ctx.view.fieldAnchor(i)
    if (!a.visible) return null
    const corners = ctx.view.fieldCorners(i).filter(finite)
    return corners.length > 2 ? corners : [{ x: a.x, y: a.y }]
  }

  // The end of tag i a player reads as pointing at its field: its eyelet, with the tag standing at w.
  function eyelet(i: number, w: Box, sz0: Size[]): Pt {
    return { x: w.x - sz0[i].w / 2 + face[i].eye, y: w.y - sz0[i].h + face[i].t + face[i].h / 2 }
  }

  // Whether tag i at a place points at its own field: its eyelet on the field's outline or inside it, wherever any of
  // the field is on the free land; as near it as the free land allows where the field lies under the bars. A field out
  // of view has nothing to point at. Worked out once for the many places tried.
  function aim(i: number, sz0: Size[]): ((w: Box, slack?: number) => boolean) & { within?: Rect } {
    const outline = outlineOf(i)
    if (!outline) return () => true
    // Where an eyelet can be with its tag wholly on the free land.
    const land = freeLand(), half = face[i].h / 2
    const reach = { l: land.l + face[i].eye, t: land.t + half, r: land.r - sz0[i].w + face[i].eye, b: land.b - half }
    const most = gapTo(reach, outline) + NEAR
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y)
    const box = { l: Math.min(...xs) - most, t: Math.min(...ys) - most, r: Math.max(...xs) + most, b: Math.max(...ys) + most }
    // (slack: how far off its field the eyelet may be beyond what the free land forces; a place kept from before is
    // held to none, since the camera may carry it a little further before the tags are next put)
    const near: ((w: Box, slack?: number) => boolean) & { within?: Rect } = (w: Box, slack = NEAR) => {
      const p = eyelet(i, w, sz0)
      return p.x >= box.l && p.x <= box.r && p.y >= box.t && p.y <= box.b && gapTo({ l: p.x, t: p.y, r: p.x, b: p.y }, outline) <= most - NEAR + slack
    }
    // (where the eyelet may be at all, for the search to leave out every place outside it without trying it)
    near.within = box
    return near
  }


  // The room a tag at w takes from the others: from its left edge, with its stamp beside it.
  // close: the last resort nearer in, before a tag would leave its field: a tag with no stamp takes only its own
  // face's height from the others, not the row kept for a stamp.
  let close = false
  let sticky = true
  function roomAt(i: number, w: Box, sz0: Size[], sz: Size[]): Rect {
    const l = w.x - sz0[i].w / 2
    if (close && !sz0[i].extra) { const t = w.y - sz0[i].h + face[i].t; return { l, t, r: l + sz[i].w, b: t + face[i].h } }
    return { l, t: w.y - sz[i].h, r: l + sz[i].w + sz[i].extra, b: w.y }
  }

  // The nearest place to w where tag i stands clear of what is taken and of the boards: over its own field or right
  // beside it while the field is on the screen (at the edge of the free land nearest it when the field lies under the
  // boards), never drifting off it; or, for a field out of view or when loose, up and down from where it waits.
  // null: there is no such place.
  // wide: look twice as far round the field before giving up on it.
  function spot(i: number, w: Box, sz0: Size[], sz: Size[], taken: Rect[], loose: boolean, wide = false, standing: Rect[] = []): Box | null {
    const land = freeLand()
    const below = sz0[i].h - face[i].t - face[i].h
    const a = ctx.view.fieldAnchor(i)
    const free = (v: Box) => {
      const r = roomAt(i, v, sz0, sz)
      return r.l >= land.l && r.r <= land.r && v.y - sz[i].h + face[i].t >= land.t && v.y - below <= land.b && !taken.some(x => meet(r, x, GAP, ROW_GAP))
    }
    if (a.visible) {
      const bx = Math.max(land.l + sz0[i].w / 2, Math.min(land.r - sz[i].w - sz[i].extra + sz0[i].w / 2, a.x + (sz0[i].w - sz[i].w) / 2))
      const by = Math.max(land.t - face[i].t + sz[i].h, Math.min(land.b + below, a.y))
      const near = aim(i, sz0)
      // The steps that could neither stand on the free land nor point at the field are passed over untried: with a
      // field under the bars that is all of them, and thousands of places were each tried in full on every settling.
      let x0 = land.l + sz0[i].w / 2 - bx, x1 = land.r - sz[i].w - sz[i].extra + sz0[i].w / 2 - bx
      let y0 = land.t - face[i].t + sz[i].h - by, y1 = land.b + below - by
      const k = near.within
      if (k) {
        const ex = sz0[i].w / 2 - face[i].eye - bx, ey = sz0[i].h - face[i].t - face[i].h / 2 - by
        x0 = Math.max(x0, k.l + ex); x1 = Math.min(x1, k.r + ex)
        y0 = Math.max(y0, k.t + ey); y1 = Math.min(y1, k.b + ey)
      }
      // A tag keeps the place it has beside its field while that place still serves, and goes back over its field as
      // soon as there is room there: it never changes sides because another place came a little nearer.
      const cur = at[i]
      if (sticky && (cur.place === 'on' || cur.place === 'docked')) {
        const home: Box = { x: bx, y: by, place: w.place === 'on' && by === a.y ? 'on' : 'docked' }
        if (near(home) && free(home) && !standing.some(x => meet(roomAt(i, home, sz0, sz), x, GAP, ROW_GAP))) return home
        const stay: Box = { x: cur.x, y: cur.y, place: 'docked' }
        if (finite(stay) && near(stay, 0) && free(stay)) return stay
      }
      for (const t of x1 < x0 || y1 < y0 ? [] : steps(Math.round((wide ? 2.5 : 1.25) * sz0[i].w / STEP_X), Math.ceil((wide ? 2 : 1) * REACH_ROWS * (sz[i].h + ROW_GAP) / STEP_Y))) {
        if (t.dx < x0 - 1e-6 || t.dx > x1 + 1e-6 || t.dy < y0 - 1e-6 || t.dy > y1 + 1e-6) continue
        const v: Box = { x: bx + t.dx, y: by + t.dy, place: w.place === 'on' && by === a.y && !t.dx && !t.dy ? 'on' : 'docked' }
        if (near(v) && free(v)) return v
      }
      if (!loose) return null
    }
    for (const t of steps(0, Math.ceil(innerHeight / STEP_Y))) {
      const v: Box = { x: w.x, y: w.y + t.dy, place: w.place }
      if (free(v)) return v
    }
    return null
  }

  // The steps tried round a tag, nearest first: down, then up, before across, or up and down an edge.
  const tried = new Map<string, { dx: number; dy: number; c: number }[]>()
  // across: how many steps either way.
  function steps(across: number, reach: number): { dx: number; dy: number; c: number }[] {
    const key = `${across} ${reach}`
    let out = tried.get(key)
    if (out) return out
    out = []
    for (let k = -reach; k <= reach; k++) {
      for (let s = -across; s <= across; s++) {
        const dx = s * STEP_X, dy = k * STEP_Y
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
  const topLeft = (i: number, w: Box) => ({ x: w.x - size[i].w / 2, y: w.y - size[i].h })
  // Put somewhere (again): from where it is drawn now it glides there; from far off, or from nowhere, it fades in.
  function show(i: number, w: Box): void {
    const was = at[i], from = corner[i], g = lag[i]
    at[i] = w
    const wrap = wraps[i]
    wrap.classList.toggle('gone', w.place === 'gone')
    wrap.classList.toggle('docked', w.place === 'docked' || w.place === 'shelf')
    if (w.place === 'gone') {
      // (a tag that goes keeps its place beside its field while it fades)
      if (was.place !== 'gone' && from) out[i] = { x: from.x + g.x, y: from.y + g.y, until: performance.now() + FADE_OUT_MS }
      corner[i] = null
      g.x = g.y = g.vx = g.vy = 0
      return
    }
    out[i] = null
    const to = topLeft(i, w)
    const dx = from ? from.x - to.x : 0, dy = from ? from.y - to.y : 0
    if (was.place === 'gone' || !from || !Number.isFinite(dx + dy) || ctx.reduced()) g.x = g.y = g.vx = g.vy = 0
    else if (Math.hypot(dx + g.x, dy + g.y) > FAR_MOVE) {
      g.x = g.y = g.vx = g.vy = 0
      wrap.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
    } else { g.x += dx; g.y += dy }
    corner[i] = to
    draw(i)
  }

  // Carried with its field: no glide, it is where its field is.
  function ride(i: number, w: Box): void {
    at[i] = w
    corner[i] = topLeft(i, w)
  }

  // On whole pixels once the camera and the tag are at rest (sharp letters); to the tenth of one while either moves.
  function draw(i: number): void {
    const c = corner[i] ?? out[i]
    if (!c) return
    const g = lag[i], still = resting && !g.x && !g.y
    const x = c.x + (corner[i] ? g.x : 0), y = c.y + (corner[i] ? g.y : 0)
    const t = still ? `translate3d(${toLocal(Math.round(x)).toFixed(3)}px, ${toLocal(Math.round(y)).toFixed(3)}px, 0)` : `translate3d(${toLocal(x).toFixed(2)}px, ${toLocal(y).toFixed(2)}px, 0)`
    if (t !== drawn[i]) { wraps[i].style.transform = t; drawn[i] = t }
  }

  function spring(dt: number): void {
    if (!(dt > 0)) return
    const k = Math.exp(-SPRING * dt)
    for (const g of lag) {
      if (!g.x && !g.y && !g.vx && !g.vy) continue
      const ax = g.vx + SPRING * g.x, ay = g.vy + SPRING * g.y
      g.x = (g.x + ax * dt) * k; g.vx = (g.vx - SPRING * ax * dt) * k
      g.y = (g.y + ay * dt) * k; g.vy = (g.vy - SPRING * ay * dt) * k
      if (Math.abs(g.x) < 0.08 && Math.abs(g.y) < 0.08 && Math.abs(g.vx) < 2 && Math.abs(g.vy) < 2) g.x = g.y = g.vx = g.vy = 0
    }
  }

  // The camera moved (or the window, or the boards): every tag is put again, on or right beside its own field. Far out
  // (a field narrower on the screen than a tag), the tags keep only their names, and where named tags would still have to
  // overlap or stray, all but the selected one fold down to their cut; the test is made with the named sizes, so the
  // fold cannot flicker. Nearer in the tags stay whole and only where they stand changes. data-fold says which.
  function folds(): void {
    layer.classList.toggle('far', far)
    layer.classList.toggle('compact', compact)
    layer.dataset.fold = compact ? 'cut' : far ? 'names' : 'whole'
  }

  function settle(): void {
    const k = scale()
    const nowFar = far ? k < FAR_OUT : k < FAR_IN
    if (nowFar !== far) {
      far = nowFar
      compact = false
      folds()
      measure()
    }
    const tier = () => far ? brief : full
    // Tags coming into view are drawn first, so they are settled at their own size.
    const first = place(tier()).want
    let fresh = false
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (first[i].place === 'gone' || at[i].place !== 'gone') continue
      wraps[i].classList.remove('gone')
      at[i] = { ...first[i] }
      fresh = true
    }
    if (fresh) measure()
    let named = place(tier())
    if (named.over) named = place(tier(), false, false, false, true)
    // Nearer in, the room kept beside the tags goes before any tag leaves its field; they never fold.
    // (and, if a tag would still leave its field, the row kept over and under a tag that has no stamp)
    if (!far && named.over) {
      const snug = place(full, false, true, false, true)
      named = { ...(snug.over ? place(full, false, true, true, true) : snug), over: false }
    }
    if (named.over !== compact) {
      compact = named.over
      folds()
      measure()
    }
    const put = compact ? place(size, true, false, false, true) : named
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
  // in the nearest room by its own field clear of the tags already there; the rest stay exactly where they are.
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
      const sz = size.map((_, j) => room(j, size))
      const w = { ...targets(sz)[i] }
      w.x += (size[i].w - z.w) / 2
      const keep = [...(o.keep?.() ?? []), ...(o.yards?.() ?? [])].map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }))
      const others = at.flatMap((b, j) => j !== i && b.place !== 'gone' && !wraps[j].hidden && finite(b) ? [roomAt(j, b, size, sz)] : [])
      show(i, spot(i, w, size, sz, [...keep, ...others], true) ?? { ...w, y: Math.min(w.y, floor) })
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
    // A zoom changes the fields' size on the screen under tags that keep theirs, so it settles them too.
    const k = scale()
    const zoomed = !!laid && Number.isFinite(k) && Number.isFinite(laid.k) && Math.abs(Math.log(k / laid.k)) > RESETTLE_ZOOM
    const far0 = !laid || laid.key !== key || ((moving || rested) && (zoomed || anchors.some((a, i) => {
      const b = laid!.anchors[i]
      return finite(a) !== finite(b) || (finite(a) && Math.hypot(a.x - b.x, a.y - b.y) > (rested ? 0.5 : RESETTLE_PX))
    })))
    const now = performance.now()
    spring(Math.min(0.05, clock ? (now - clock) / 1000 : 0))
    clock = now
    resting = !moving
    // First each tag goes with its field, exactly. A tag held at the edge of the free land for a field under the
    // boards stays at that edge while the field moves beneath them: it rides only as far as the field's place on the
    // free land moves. A tag that went rides on while it fades.
    const land = freeLand()
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const a = anchors[i], r = ref[i], b = at[i]
      if (!r || !finite(a) || !finite(r)) continue
      const gone = out[i]
      if (gone) {
        if (now > gone.until) out[i] = null
        else { gone.x += a.x - r.x; gone.y += a.y - r.y }
        ref[i] = a
        continue
      }
      if (b.place === 'gone' || b.place === 'shelf' || Math.hypot(a.x - r.x, a.y - r.y) < 0.01) continue
      const top = land.t - face[i].t + size[i].h, foot = Math.max(top, land.b + size[i].h - face[i].t - face[i].h)
      const held = (y: number) => Math.max(top, Math.min(foot, y))
      ride(i, { x: b.x + a.x - r.x, y: b.y + held(a.y) - held(r.y), place: b.place })
      ref[i] = a
    }
    if (far0) {
      // Why the tags were put again, for the checks that hold them to it.
      const why = !laid ? 'first' : laid.key !== key ? 'window' : `camera${zoomed ? ' zoom' : ''} ${anchors.map((a, i) => { const b = laid!.anchors[i]; return finite(a) !== finite(b) ? `${i}:seen` : finite(a) && Math.hypot(a.x - b.x, a.y - b.y) > RESETTLE_PX ? `${i}:${Math.round(a.x - b.x)},${Math.round(a.y - b.y)}` : '' }).filter(Boolean).join(' ')}`
      layer.dataset.settled = `${(parseInt(layer.dataset.settled ?? '0', 10) || 0) + 1} ${why}`
      settle()
      laid = { key, anchors, k }
      for (let i = 0; i < S.FIELD_COUNT; i++) ref[i] = anchors[i]
    } else arrivals(anchors)
    for (let i = 0; i < S.FIELD_COUNT; i++) draw(i)
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

  // A tag that a card or a board lies over is put away whole: half a name showing from under paper reads as a fault.
  // (The field in hand keeps its tag: its card stands beside it.)
  function under(): void {
    const cv = [...(o.covers?.() ?? []), ...(o.boards?.() ?? [])]
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const w = at[i]
      if (!models[i] || !w || w.place === 'gone' || !size[i]) { wraps[i].classList.remove('under'); continue }
      const l = w.x - size[i].w / 2, t = w.y - size[i].h, r = l + size[i].w + size[i].extra, b = w.y
      const hit = !app.selection.includes(i) && cv.some(c => {
        const ox = Math.min(r, c.right) - Math.max(l, c.left), oy = Math.min(b, c.bottom) - Math.max(t, c.top)
        return ox > 6 && oy > 6
      })
      wraps[i].classList.toggle('under', hit)
    }
  }

  return {
    update,
    frame() { frame(); under() },
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
