// A plate on each field: its name, where it is in its year, what is wrong with it, what is queued, and what it needs.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'

export interface PlateModel {
  name: string
  glyph: string
  // A second line, for the spring plan.
  sub?: string
  marks: { glyph: string; cls: string }[]
  queue: { glyph: string; active: boolean }[]
  badge: { glyph: string; label: string; urgent: boolean } | null
  // What a screen reader hears for the plate.
  said: string
  // The badge a tip is about holds a ring until the tip is put away.
  taught?: boolean
}

const GAP = 6

interface Box { x: number; y: number; docked: boolean }

export function plates(ctx: Ctx, layer: HTMLElement, o: { model: (i: number) => PlateModel; onBadge: (i: number) => void }): { update(): void; frame(): void; dispose(): void } {
  const app = ctx.app
  const wraps: HTMLElement[] = []
  // w, h: the plate. extra: the badge hanging off its right end.
  const size: { w: number; h: number; extra: number }[] = []
  const at: Box[] = []
  let compact = false
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const wrap = h('div', { class: 'plate-wrap' })
    wraps.push(wrap)
    size.push({ w: 120, h: 30, extra: 0 })
    at.push({ x: -1, y: -1, docked: false })
    layer.append(wrap)
  }

  function update(): void {
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const m = o.model(i)
      const on = app.selection.includes(i)
      const wrap = wraps[i]
      patch(wrap, JSON.stringify([m.name, m.glyph, m.sub, m.marks, m.queue, m.badge, m.said, on, m.taught, ctx.touch()]), () => [
        h('button', {
          class: `plate${on ? ' on' : ''}`, type: 'button', testid: `field-${i}`, 'aria-pressed': String(on), 'aria-label': m.said,
          'aria-keyshortcuts': String(i + 1), title: ctx.touch() ? undefined : m.said,
          onclick: (e: Event) => app.select(i, (e as MouseEvent).shiftKey),
          ondblclick: () => app.selectLike(i),
          oncontextmenu: (e: Event) => { e.preventDefault(); o.onBadge(i) },
          onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.setHover(i) },
          onpointerleave: () => { if (app.hover === i) app.setHover(-1) },
        },
        h('span', { class: 'plate-in' },
          icon(m.glyph, 'ic s'),
          h('span', { class: 'plate-name' }, m.name),
          m.sub ? [' ', h('span', { class: 'plate-sub' }, m.sub)] : null,
          m.marks.length ? h('span', { class: 'plate-marks' }, m.marks.map(k => icon(k.glyph, `ic s ${k.cls}`))) : null,
          m.queue.length ? h('span', { class: 'plate-queue' }, m.queue.map(q => icon(q.glyph, `ic s${q.active ? ' active' : ''}`))) : null)),
        m.badge ? h('button', {
          class: `badge${m.badge.urgent ? ' urgent' : ''}${m.taught ? ' taught' : ''}`, type: 'button', testid: `badge-${i}`, 'aria-label': m.badge.label,
          title: ctx.touch() ? undefined : m.badge.label,
          onclick: () => o.onBadge(i),
        }, icon(m.badge.glyph)) : null,
      ])
      wrap.style.zIndex = on ? '3' : m.badge ? '2' : '1'
    }
    measure()
  }

  function measure(): void {
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const plate = wraps[i].firstElementChild as HTMLElement | null
      const badge = wraps[i].querySelector<HTMLElement>('.badge')
      if (plate) size[i] = { w: plate.offsetWidth, h: plate.offsetHeight, extra: badge ? badge.offsetWidth + 4 : 0 }
    }
  }

  // Every frame: each plate sits on the top centre of its field, stays clear of the instruments, and never
  // covers another plate. A field out of frame keeps its plate at the nearest edge.
  function frame(): void {
    const ins = app.insets
    // Where six named plates cannot stand clear of each other, all but the selected one fold down to their glyphs.
    const room = innerHeight - ins.top - ins.bottom
    const tight = room < S.FIELD_COUNT * (size[0].h + 8) + 8
    if (tight !== compact) {
      compact = tight
      layer.classList.toggle('compact', compact)
      measure()
    }
    const want: Box[] = []
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const a = ctx.view.fieldAnchor(i)
      const { w, h: hh, extra } = size[i]
      const x0 = GAP + w / 2, x1 = innerWidth - GAP - w / 2 - extra
      const y0 = ins.top + GAP + hh + 6, y1 = innerHeight - ins.bottom - GAP
      const x = Math.max(x0, Math.min(Math.max(x0, x1), a.x)), y = Math.max(y0, Math.min(Math.max(y0, y1), a.y))
      want.push({ x, y, docked: !a.visible || Math.abs(x - a.x) > 1 || Math.abs(y - a.y) > 1 })
    }
    // Lower plates give way downward to the ones above them; then any pushed past the bottom edge climb back,
    // lifting what they meet.
    const apart = (j: number, k: number) => want[j].x < want[k].x
      ? want[k].x - size[k].w / 2 - (want[j].x + size[j].w / 2 + size[j].extra)
      : want[j].x - size[j].w / 2 - (want[k].x + size[k].w / 2 + size[k].extra)
    const order = want.map((_, i) => i).sort((p, q) => want[p].y - want[q].y || p - q)
    for (let n = 1; n < order.length; n++) {
      const j = order[n]
      for (let m = 0; m < n; m++) {
        const k = order[m]
        if (apart(j, k) < GAP && want[j].y - size[j].h - 8 < want[k].y) want[j].y = want[k].y + size[j].h + 8
      }
    }
    const floor = innerHeight - ins.bottom - GAP
    for (let n = order.length - 1; n >= 0; n--) {
      const j = order[n]
      if (want[j].y > floor) { want[j].y = floor; want[j].docked = true }
      for (let m = n - 1; m >= 0; m--) {
        const k = order[m]
        if (apart(j, k) < GAP && want[j].y - size[j].h - 8 < want[k].y) { want[k].y = want[j].y - size[j].h - 8; want[k].docked = true }
      }
    }
    // Where there is no room for six, they overlap: the selected plate and the ones with a need stay on top.
    const ceiling = ins.top + GAP
    for (let i = 0; i < S.FIELD_COUNT; i++) want[i].y = Math.max(want[i].y, ceiling + size[i].h + 6)
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const w = want[i], was = at[i]
      if (Math.abs(w.x - was.x) < 0.25 && Math.abs(w.y - was.y) < 0.25 && w.docked === was.docked) continue
      at[i] = w
      const wrap = wraps[i]
      wrap.style.transform = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px) translate(-50%, -100%)`
      wrap.classList.toggle('docked', w.docked)
    }
  }

  return {
    update,
    frame,
    dispose() {
      layer.classList.remove('compact')
      for (const w of wraps) w.remove()
      if (app.hover >= 0) app.setHover(-1)
    },
  }
}
