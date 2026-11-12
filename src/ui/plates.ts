// A plate on each field the farm holds: its name, where it is in its year, what is wrong with it, what is queued, and
// what it needs. In spring, land that can be rented or bought carries a quiet marker instead.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'

export interface PlateModel {
  name: string
  glyph: string
  // A second line, for the spring plan.
  sub?: string
  // n: a small figure beside the mark, such as the hundredweight still in barrels.
  marks: { glyph: string; cls: string; n?: string }[]
  queue: { glyph: string; active: boolean }[]
  badge: { glyph: string; label: string; urgent: boolean } | null
  // What a screen reader hears for the plate.
  said: string
  // The badge a tip is about holds a ring until the tip is put away.
  taught?: boolean
  // Land the farm could rent or buy: a marker, not a plate.
  land?: boolean
  // The number key that picks it.
  key?: string
  // A kind of plate drawn its own way: 'tract' for woods and brush still to clear.
  cls?: string
}

const GAP = 6
// With more fields in view than the home six, plates keep only their names once a field is narrower on screen than a
// plate (a field is about 14 ground units across): below FAR_IN pixels a unit, and back above FAR_OUT.
const FAR_IN = 8.5, FAR_OUT = 10

// on: over its field. docked: pushed inside the free part of the window. shelf: its field has no place on the map
// yet, so it waits in a row under the top bar. gone: its field is off screen and nothing calls for it.
type Place = 'on' | 'docked' | 'shelf' | 'gone'
interface Box { x: number; y: number; place: Place }
// w, h: the plate. extra: the badge hanging off its right end.
interface Size { w: number; h: number; extra: number }

function finite(a: { x: number; y: number }): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y)
}

export function plates(ctx: Ctx, layer: HTMLElement, o: { model: (i: number) => PlateModel | null; onBadge: (i: number) => void }): { update(): void; frame(): void; dispose(): void } {
  const app = ctx.app
  const wraps: HTMLElement[] = []
  const models: (PlateModel | null)[] = []
  // size: the plates as drawn now. full: as drawn with their names, which is what decides whether they fit.
  const size: Size[] = []
  const full: Size[] = []
  const at: Box[] = []
  let compact = false
  let far = false
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const wrap = h('div', { class: 'plate-wrap gone', hidden: true })
    wraps.push(wrap)
    models.push(null)
    size.push({ w: 120, h: 30, extra: 0 })
    full.push({ w: 120, h: 30, extra: 0 })
    at.push({ x: -1, y: -1, place: 'gone' })
    layer.append(wrap)
  }

  function pick(i: number, add: boolean): void {
    const m = models[i]
    if (!m) return
    app.select(i, add && !m.land)
    // A plate standing in for a field off screen takes the camera there.
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
      patch(wrap, JSON.stringify([m, on, ctx.touch()]), () => [
        h('button', {
          class: `plate${on ? ' on' : ''}${m.land ? ' land' : ''}${m.cls ? ` ${m.cls}` : ''}`, type: 'button', testid: m.land ? `land-${i}` : `field-${i}`, 'aria-pressed': String(on), 'aria-label': m.said,
          'aria-keyshortcuts': m.key || null, title: ctx.touch() ? undefined : m.said,
          onclick: (e: Event) => pick(i, (e as MouseEvent).shiftKey),
          ondblclick: () => { if (!m.land) app.selectLike(i) },
          oncontextmenu: (e: Event) => { e.preventDefault(); if (!m.land) o.onBadge(i) },
          onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.setHover(i) },
          onpointerleave: () => { if (app.hover === i) app.setHover(-1) },
        },
        h('span', { class: 'plate-in' },
          icon(m.glyph, 'ic s plate-glyph'),
          h('span', { class: 'plate-name' }, m.name),
          m.sub ? [' ', h('span', { class: 'plate-sub' }, m.sub)] : null,
          m.marks.length ? h('span', { class: 'plate-marks' }, m.marks.map(k => k.n ? h('span', { class: `mark-n ${k.cls}` }, icon(k.glyph, 'ic s'), h('span', { class: 'num' }, k.n)) : icon(k.glyph, `ic s ${k.cls}`))) : null,
          m.queue.length ? h('span', { class: 'plate-queue' }, m.queue.map(q => icon(q.glyph, `ic s${q.active ? ' active' : ''}`))) : null)),
        m.badge ? h('button', {
          class: `badge${m.badge.urgent ? ' urgent' : ''}${m.taught ? ' taught' : ''}`, type: 'button', testid: `badge-${i}`, 'aria-label': m.badge.label,
          title: ctx.touch() ? undefined : m.badge.label,
          onclick: () => o.onBadge(i),
        }, icon(m.badge.glyph)) : null,
      ])
      wrap.style.zIndex = on ? '4' : m.badge ? '3' : m.land ? '1' : '2'
    }
    measure()
  }

  function measure(): void {
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      if (!models[i] || at[i].place === 'gone') continue
      const plate = wraps[i].firstElementChild as HTMLElement | null
      const badge = wraps[i].querySelector<HTMLElement>('.badge')
      if (plate && plate.offsetWidth) size[i] = { w: plate.offsetWidth, h: plate.offsetHeight, extra: badge ? badge.offsetWidth + 4 : 0 }
      if (!compact) full[i] = size[i]
    }
  }

  // How far out the camera is: the home fields' plates are 16.2 ground units apart across the slope and 26.4 down it.
  function scale(): number {
    const a = ctx.view.fieldAnchor(0), b = ctx.view.fieldAnchor(1), c = ctx.view.fieldAnchor(4)
    if (!finite(a) || !finite(b) || !finite(c)) return Infinity
    return Math.max(Math.hypot(a.x - b.x, a.y - b.y) / 16.2, Math.hypot(a.x - c.x, a.y - c.y) / 26.4)
  }

  // Where each plate goes for plates of these sizes: on the top centre of its field, clear of the instruments and of
  // each other. over: there was not the room, and some had to overlap.
  function place(sz: Size[]): { want: Box[]; over: boolean } {
    const ins = app.insets
    const want: Box[] = []
    const shown: number[] = []
    const shelf: number[] = []
    // Of the land off screen, one marker for each block waits at the edge, so the player knows which way it lies.
    const pointed = new Set<string>()
    for (let i = 0; i < S.FIELD_COUNT; i++) if (models[i]?.land && ctx.view.fieldAnchor(i).visible) pointed.add(S.PARCELS[i].block)
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const m = models[i]
      if (!m) { want.push({ x: -1, y: -1, place: 'gone' }); continue }
      const a = ctx.view.fieldAnchor(i)
      if (!finite(a)) { want.push({ x: 0, y: 0, place: 'shelf' }); shelf.push(i); shown.push(i); continue }
      const block = S.PARCELS[i].block
      const first = !!m.land && !a.visible && !pointed.has(block)
      if (first) pointed.add(block)
      const wanted = app.selection.includes(i) || !!m.badge || first
      if (!a.visible && !wanted) { want.push({ x: a.x, y: a.y, place: 'gone' }); continue }
      const { w, h: hh, extra } = sz[i]
      const x0 = GAP + w / 2, x1 = innerWidth - GAP - w / 2 - extra
      const y0 = ins.top + GAP + hh + 6, y1 = innerHeight - ins.bottom - GAP
      const x = Math.max(x0, Math.min(Math.max(x0, x1), a.x)), y = Math.max(y0, Math.min(Math.max(y0, y1), a.y))
      want.push({ x, y, place: !a.visible || Math.abs(x - a.x) > 1 || Math.abs(y - a.y) > 1 ? 'docked' : 'on' })
      shown.push(i)
    }
    // Plates with nowhere on the map to go stand in rows under the top bar, in the middle.
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
        const total = row.reduce((a, i) => a + sz[i].w + sz[i].extra + GAP, -GAP)
        const tall = Math.max(...row.map(i => sz[i].h))
        let x = Math.max(GAP, (innerWidth - total) / 2)
        y += tall + 6
        for (const i of row) {
          want[i] = { x: x + sz[i].w / 2, y, place: 'shelf' }
          x += sz[i].w + sz[i].extra + GAP
        }
      }
    }
    // Lower plates give way downward to the ones above them; then any pushed past the bottom edge climb back,
    // lifting what they meet.
    const apart = (j: number, k: number) => want[j].x < want[k].x
      ? want[k].x - sz[k].w / 2 - (want[j].x + sz[j].w / 2 + sz[j].extra)
      : want[j].x - sz[j].w / 2 - (want[k].x + sz[k].w / 2 + sz[k].extra)
    const order = [...shown].sort((p, q) => want[p].y - want[q].y || p - q)
    for (let n = 1; n < order.length; n++) {
      const j = order[n]
      for (let m = 0; m < n; m++) {
        const k = order[m]
        if (apart(j, k) < GAP && want[j].y - sz[j].h - 8 < want[k].y) { want[j].y = want[k].y + sz[j].h + 8; if (want[j].place === 'on') want[j].place = 'docked' }
      }
    }
    const floor = innerHeight - ins.bottom - GAP
    for (let n = order.length - 1; n >= 0; n--) {
      const j = order[n]
      if (want[j].y > floor) { want[j].y = floor; if (want[j].place === 'on') want[j].place = 'docked' }
      for (let m = n - 1; m >= 0; m--) {
        const k = order[m]
        if (apart(j, k) < GAP && want[j].y - sz[j].h - 8 < want[k].y) { want[k].y = want[j].y - sz[j].h - 8; if (want[k].place === 'on') want[k].place = 'docked' }
      }
    }
    // Where there is no room for them all, they overlap: the selected plate and the ones with a need stay on top.
    const ceiling = ins.top + GAP
    let over = false
    for (const i of shown) {
      if (want[i].y < ceiling + sz[i].h + 5) over = true
      want[i].y = Math.max(want[i].y, ceiling + sz[i].h + 6)
    }
    return { want, over }
  }

  // Every frame. Far out, the plates keep only their names. Where named plates would still have to overlap, all but
  // the selected one fold down to their glyphs; the test is always made with the full sizes, so the fold cannot flicker.
  function frame(): void {
    const k = scale()
    let inView = 0
    for (let i = 0; i < S.FIELD_COUNT; i++) if (models[i] && ctx.view.fieldAnchor(i).visible) inView++
    const nowFar = inView > S.HOME_FIELDS && (far ? k < FAR_OUT : k < FAR_IN)
    if (nowFar !== far) {
      far = nowFar
      compact = false
      layer.classList.toggle('far', far)
      layer.classList.remove('compact')
      measure()
    }
    const named = place(full)
    if (named.over !== compact) {
      compact = named.over
      layer.classList.toggle('compact', compact)
      measure()
    }
    const want = compact ? place(size).want : named.want
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const w = want[i], was = at[i]
      if (w.place === was.place && (w.place === 'gone' || (Math.abs(w.x - was.x) < 0.25 && Math.abs(w.y - was.y) < 0.25))) continue
      at[i] = w
      const wrap = wraps[i]
      wrap.classList.toggle('gone', w.place === 'gone')
      wrap.classList.toggle('docked', w.place === 'docked' || w.place === 'shelf')
      if (w.place !== 'gone') wrap.style.transform = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px) translate(-50%, -100%)`
      if (was.place === 'gone' && w.place !== 'gone') measure()
    }
  }

  return {
    update,
    frame,
    dispose() {
      layer.classList.remove('compact', 'far')
      for (const w of wraps) w.remove()
      if (app.hover >= 0) app.setHover(-1)
    },
  }
}
