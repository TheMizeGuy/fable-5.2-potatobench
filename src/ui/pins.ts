// People on the land (design/season.html): a face pin for each, in their ring, at one size whatever the camera does,
// following them with transforms only. People standing together share one pin with a count that opens to them all;
// a pin gives way to a field's tag where they meet, unless it needs the player. A click on a pin picks the person.
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { doingWord, ringFor } from './crew.ts'
import { h } from './dom.ts'
import { firstName, personSign } from './rules.ts'
import { idleWithWork } from './people.ts'
import { pin, ringed, type PinState } from './system/people.ts'

interface Model { id: number; name: string; ring: string; state: PinState; label: string; rank: number }

// How close two people stand, in screen pixels, before they share a pin.
const NEAR = 40

export function pins(ctx: Ctx, layer: HTMLElement, o: { tags: () => DOMRect[]; covers: () => DOMRect[]; stopped: () => Set<number> }): { update(c: S.Campaign): void; frame(): void; escape(): boolean; dispose(): void } {
  const app = ctx.app
  const wraps = new Map<number, HTMLElement>()
  let models: Model[] = []
  let many = false
  // The pin whose people are shown in a list, and where.
  let open = -1
  let listFor = ''
  const list = h('div', { class: 'pin-list-at', hidden: true })
  layer.append(list)
  const closeList = (e: Event) => { if (open >= 0 && !(e.target as HTMLElement).closest?.('.pin-list-at, .pin')) { open = -1; list.hidden = true } }
  document.addEventListener('pointerdown', closeList, true)

  function pick(id: number): void {
    open = -1
    list.hidden = true
    if (app.unit === id && app.unitFrom === 'land') { app.selectUnit(-1); return }
    app.select(-1)
    app.selectYard(0)
    app.selectUnit(id, 'land')
  }

  function update(c: S.Campaign): void {
    const people = S.peopleInfo(c)
    const waits = S.jobWaits(app.world, c)
    const stopped = o.stopped()
    many = people.length > 1
    models = people.map(p => {
      const sign = personSign(p, idleWithWork(c, p, waits))
      const state: PinState = p.hurtUntil >= 0 ? 'hurt' : sign?.cls === 'bad' || stopped.has(p.id) ? 'needs' : app.unit === p.id ? 'picked' : 'rest'
      const word = sign?.cls === 'bad' ? sign.text : doingWord(c, p).toLowerCase()
      const label = `${p.kind === 'farmer' ? 'You' : firstName(p.name)}, ${word}${state === 'needs' ? ': needs you' : ''}`
      return { id: p.id, name: p.kind === 'farmer' ? 'You' : p.name, ring: ringFor(c, p.id), state: app.unit === p.id && state !== 'needs' && state !== 'hurt' ? 'picked' : state, label, rank: app.unit === p.id ? 0 : state === 'needs' ? 1 : state === 'hurt' ? 2 : 3 }
    })
    for (const [id, w] of wraps) if (!models.some(m => m.id === id)) { w.remove(); wraps.delete(id) }
    for (const m of models) {
      if (!wraps.has(m.id)) {
        const w = h('div', { class: 'pin-at gone' })
        layer.insertBefore(w, list)
        wraps.set(m.id, w)
      }
    }
  }

  function draw(w: HTMLElement, m: Model, count: number, members: Model[]): void {
    const picked = app.unit === m.id
    patch(w, JSON.stringify([m, count, picked, many, ctx.touch(), count > 1 ? members.map(x => [x.id, x.label]) : 0]), () => pin(m.name, m.state, {
      ring: m.ring, name: picked, testid: `pin-${m.id}`, count,
      label: count > 1 ? `${count} people here: ${members.map(x => x.label).join('; ')}. Press to choose one.` : `${m.label}${many ? `. ${picked ? 'Press to put their card away.' : 'Press for their card.'}` : ''}`,
      pressed: many && count === 1 ? picked : undefined,
      // the pointer over a pin names them, as it does over their body
      onenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.point({ x: 0, y: 0, unit: m.id, thing: null, field: -1, yard: 0, group: count > 1 ? members.map(x => x.id) : undefined }) },
      onleave: () => { if (app.pointing?.unit === m.id) app.point(null) },
      onclick: many ? () => {
        if (count > 1) { open = open === m.id ? -1 : m.id; listFor = ''; list.style.visibility = 'hidden'; drawList(members); return }
        pick(m.id)
      } : undefined,
    }))
    const b = w.firstElementChild as HTMLElement | null
    if (b && b.tagName === 'BUTTON') b.tabIndex = -1
  }

  function drawList(members: Model[]): void {
    list.hidden = open < 0
    if (open < 0) return
    list.replaceChildren(h('div', { class: 'pin-list sheet sys', role: 'group', 'aria-label': 'People here' },
      members.map(m => h('button', { class: `pl-row${app.unit === m.id ? ' is-picked' : ''}`, type: 'button', testid: `pin-pick-${m.id}`, onclick: () => pick(m.id) },
        ringed(m.name, m.ring, 30), h('span', { class: 'pl-name' }, m.name === 'You' ? 'You' : firstName(m.name)), h('span', { class: 't-label' }, m.label.split(', ').slice(1).join(', '))))))
  }

  function frame(): void {
    const ins = app.insets
    const covers = o.covers()
    const tags = o.tags()
    const at = new Map<number, { x: number; y: number }>()
    for (const m of models) {
      const a = ctx.view.unitAnchor(m.id)
      if (!a.visible || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue
      if (a.x < ins.left + 20 || a.x > innerWidth - ins.right - 20 || a.y < ins.top + 56 || a.y > innerHeight - ins.bottom) continue
      if (covers.some(r => a.x > r.left - 22 && a.x < r.right + 22 && a.y > r.top && a.y - 56 < r.bottom)) continue
      at.set(m.id, a)
    }
    // People standing together share a pin: the picked one, or the one who needs the player, leads it.
    const order = [...models].filter(m => at.has(m.id)).sort((p, q) => p.rank - q.rank || p.id - q.id)
    const taken = new Set<number>()
    const shown = new Map<number, { m: Model; x: number; y: number; members: Model[] }>()
    for (const m of order) {
      if (taken.has(m.id)) continue
      const p = at.get(m.id)!
      const members = order.filter(x => !taken.has(x.id) && Math.hypot(at.get(x.id)!.x - p.x, at.get(x.id)!.y - p.y) < NEAR)
      for (const x of members) taken.add(x.id)
      // A pin gives way to a tag it meets: it stands just above the tag, so the tag can be read and the person found.
      let y = p.y
      for (let k = 0; k < 3; k++) {
        const t = tags.find(r => p.x - 22 < r.right && p.x + 22 > r.left && y - 56 < r.bottom && y > r.top)
        if (!t) break
        y = t.top - 1
      }
      if (y - 56 < ins.top + 4) continue
      shown.set(m.id, { m, x: p.x, y, members })
    }
    for (const m of models) {
      const w = wraps.get(m.id)
      if (!w) continue
      const s0 = shown.get(m.id)
      w.classList.toggle('gone', !s0)
      if (!s0) continue
      draw(w, m, s0.members.length, s0.members)
      w.style.transform = `translate3d(${s0.x.toFixed(1)}px, ${s0.y.toFixed(1)}px, 0)`
      w.style.zIndex = String(10 - m.rank)
      if (open === m.id) {
        list.style.transform = `translate3d(${(s0.x + 26).toFixed(1)}px, ${(s0.y - 60).toFixed(1)}px, 0)`
        list.style.visibility = ''
        const key = s0.members.map(x => `${x.id}:${x.label}`).join('|')
        if (key !== listFor) { listFor = key; drawList(s0.members) }
      }
    }
    if (open >= 0 && !shown.has(open)) { open = -1; list.hidden = true }
  }

  return {
    update,
    frame,
    escape() { if (open < 0) return false; open = -1; list.hidden = true; return true },
    dispose() {
      document.removeEventListener('pointerdown', closeList, true)
      for (const w of wraps.values()) w.remove()
      list.remove()
    },
  }
}
