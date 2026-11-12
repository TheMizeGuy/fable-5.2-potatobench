// The guided first year on screen (src/game/tutorial.ts holds the lessons): the county agent's printed slip, one at a
// time, set where it covers nothing it is about, and the printer's fist on the one control it asks for. In spring the
// slip is tucked into the seed catalogue above the order blank; elsewhere it floats over the land.
import { Guide, LESSONS, localStore, PART_NAME, type Input, type Lesson, type Look, type Part, type Point } from '../game/tutorial.ts'
import * as S from '../sim/index.ts'
import { patch, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { fist } from './system/parts.ts'
import './system/tutorial.css'

export const guide = new Guide(localStore())
// For the browser tests and the capture tool, as window.__county is.
;(globalThis as Record<string, unknown>).__countyGuide = guide

// ---------------------------------------------------------------- hooks for the screens

// A farm started from the title: its first spring carries the offer, once.
export function startedFarm(seed: number): void { guide.newFarm(seed) }

// Start the season leaves the clock stopped while the guided opening holds it.
export function holdsClock(c: S.Campaign | null): boolean { return guide.holdsClock(c) }

// The first-time tips for the orders say what the guide says; while it is on they keep quiet.
export function quietTips(): boolean { return guide.quiet() }

let slot: HTMLElement | null = null
// The place in the spring catalogue, above the order blank, where the offer and the spring's notes are tucked.
export function springSlot(): HTMLElement {
  slot = h('div', { class: 'guide-slot sys' })
  return slot
}

// ---------------------------------------------------------------- the guide's own paper: every lesson, to see again

const PARTS: Part[] = ['opening', 'year', 'spring']
const by = (i: Input, mouse: string, touch: string, keys: string) => i === 'touch' ? touch : i === 'keys' ? keys : mouse

export function openGuide(ctx: Ctx): void {
  ctx.papers.open({
    title: 'The guided first year',
    kicker: 'From the county agent',
    testid: 'guide',
    size: 'medium',
    body: close => {
      const box = h('div', { class: 'guide-list' })
      const draw = () => box.replaceChildren(
        h('label', { class: 'check guide-on' },
          h('span', { class: 'check-in' }, h('input', {
            type: 'checkbox', checked: guide.on, testid: 'guide-on',
            onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) guide.resume(); else guide.stop(); draw(); ctx.dirty() },
          }), h('i', { class: `tick${guide.on ? ' on' : ''}` })),
          h('span', null, h('b', null, 'Guide me through the year'), ' ', h('span', { class: 'quiet' }, 'each thing the first time it comes'))),
        ...PARTS.map(part => h('section', { class: 'guide-part' },
          h('h3', { class: 't-label' }, PART_NAME[part]),
          h('ul', null, LESSONS.filter(x => x.part === part).map(x => {
            const state = guide.p.passed[x.id]
            return h('li', { class: 'lead' },
              h('i', { class: `tick bare${state === 'done' ? ' on' : ''}`, 'aria-hidden': 'true' }),
              h('span', { class: state ? 'pencil' : null }, x.name, h('span', { class: 'sr' }, state === 'done' ? ', done' : state === 'skip' ? ', skipped' : guide.replaying(x.id) ? ', to be shown again' : ', still to come')),
              h('span', { class: 'dots' }),
              h('button', {
                class: 'btn quiet', type: 'button', testid: `guide-again-${x.id}`, 'aria-label': `Show ${x.name.toLowerCase()} again`,
                onclick: () => { guide.replay(x.id); close(); ctx.say(`${x.name}: shown again when its moment comes.`); ctx.dirty() },
              }, guide.replaying(x.id) ? 'Coming' : 'Again'))
          })))))
      draw()
      return [h('p', { class: 'dlg-lead' }, 'One thing at a time, each the first time the year brings it. Any of them can be seen again.'), box]
    },
    foot: shut => [
      h('button', { class: 'btn', type: 'button', testid: 'guide-restart', onclick: () => { guide.restart(); shut(); ctx.say('The guide starts again from the beginning.'); ctx.dirty() } }, 'Start the guide again'),
      h('button', { class: 'btn go', type: 'button', testid: 'guide-close', autofocus: true, onclick: shut }, 'Back', icon('arrow', 'i')),
    ],
  })
}

// ---------------------------------------------------------------- where things are on the screen

interface Box { left: number; top: number; right: number; bottom: number }
const box = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
const pad = (b: Box, p: number): Box => ({ left: b.left - p, top: b.top - p, right: b.right + p, bottom: b.bottom + p })
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

function shown(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
  if (el.closest('.leaving, [inert], .guide-layer, .out')) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
}

function byTestid(root: HTMLElement, ids: string[]): HTMLElement | null {
  for (const id of ids) {
    const sel = id.endsWith('*') ? `[data-testid^="${id.slice(0, -1)}"]` : `[data-testid="${id}"]`
    for (const el of root.querySelectorAll(sel)) if (shown(el)) return el
  }
  return null
}

// What a lesson points at, as an element on screen, or a point from the scene's anchors when no element marks it.
function resolve(ctx: Ctx, root: HTMLElement, p: Point | null): { el: HTMLElement | null; at: Box | null; id: string } {
  if (!p) return { el: null, at: null, id: '' }
  const found = (ids: string[]) => { const el = byTestid(root, ids); return { el, at: el ? box(el.getBoundingClientRect()) : null, id: el?.dataset.testid ?? ids[0] } }
  if ('testid' in p) return found(p.testid)
  if ('badge' in p) { const r = found([`badge-${p.badge}`, `field-${p.badge}`]); return r.el ? r : { ...r, id: `badge-${p.badge}` } }
  if ('field' in p) return found([`field-${p.field}`])
  if ('fields' in p) return found(p.fields.map(i => `field-${i}`))
  const r = found([`pin-${p.unit}`, `unit-${p.unit}`])
  if (r.el) return r
  const a = ctx.view.unitAnchor(p.unit)
  if (a.visible && a.x > 0 && a.y > 0 && a.x < innerWidth && a.y < innerHeight) return { el: null, at: { left: a.x - 22, top: a.y - 56, right: a.x + 22, bottom: a.y }, id: `pin-${p.unit}` }
  return { el: null, at: null, id: `pin-${p.unit}` }
}

// Everything on the current screen the slip should not lie over: the panels themselves, not the clear boxes that hold
// them. hard: what it must never cover (a clock, a command bar, a telegram, a paper, a test-dig tray, a person's card).
function obstacles(root: HTMLElement): { hard: Box[]; soft: Box[] } {
  const hard: Box[] = []
  const soft: Box[] = []
  for (const el of root.querySelectorAll('.clock, .command, .telegram, .dialog, [data-testid="paused"], .tray-paper, .person-card, .work, .pin-list-at, .tb-pop')) {
    if (shown(el)) hard.push(box(el.getBoundingClientRect()))
  }
  const main = root.querySelector<HTMLElement>('.screen-layer > main:not(.leaving)')
  const walk = (el: Element, depth: number) => {
    for (const k of el.children) {
      if (!shown(k)) continue
      const r = k.getBoundingClientRect()
      const cs = getComputedStyle(k)
      const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none' && cs.boxShadow === 'none'
      if (clear && depth < 4 && (r.width > innerWidth * 0.6 || r.height > innerHeight * 0.6 || k.children.length)) walk(k, depth + 1)
      else soft.push(box(r))
    }
  }
  if (main) walk(main, 0)
  for (const el of root.querySelectorAll('.notes .alert')) if (shown(el)) soft.push(box(el.getBoundingClientRect()))
  return { hard, soft }
}

// The first free place for a box this size, nearest the top of the land and its middle; null when there is none.
function findPlace(w: number, hgt: number, avoid: Box[]): { x: number; y: number } | null {
  const m = 12, step = 16
  let best: { x: number; y: number; s: number } | null = null
  for (let y = m; y + hgt <= innerHeight - m; y += step) {
    for (let x = m; x + w <= innerWidth - m; x += step) {
      const b = { left: x, top: y, right: x + w, bottom: y + hgt }
      if (avoid.some(a => meets(b, a))) continue
      const s = y + Math.abs(x + w / 2 - innerWidth / 2) * 0.35
      if (!best || s < best.s) best = { x, y, s }
    }
  }
  return best
}

// ---------------------------------------------------------------- the slip

function holdLine(): HTMLElement {
  return h('span', { class: 't-label guide-held', testid: 'guide-held' }, icon('pause', 'i'), 'Clock held')
}

// lost: what it points at is on the land but out of view, so the slip says how to bring the farm back.
function slipBody(ctx: Ctx, x: Lesson, l: Look, held: boolean, lost = false): (HTMLElement | null)[] {
  const at = guide.place(x)
  const again = guide.replaying(x.id)
  const where = x.part === 'opening' ? `${PART_NAME.opening}, ${at.n} of ${at.of}` : PART_NAME[x.part]
  const done = () => { guide.noted(x.id); ctx.dirty() }
  return [
    h('header', { class: 'guide-head' },
      h('p', { class: 't-label' }, 'The county agent'),
      held ? holdLine() : h('p', { class: 't-label guide-n' }, where)),
    h('p', { class: 'guide-ask', id: 'guide-ask' }, x.ask(l)),
    h('p', { class: 'guide-why t-caption' }, x.why(l)),
    lost ? h('p', { class: 'guide-lost t-caption', testid: 'guide-lost' }, icon('field', 'i'), by(l.input, 'Out of view: Home, or a double-click on open ground, brings the farm back.', 'Out of view: a double-tap on open ground brings the farm back.', 'Out of view: Home brings the farm back.')) : null,
    h('footer', { class: 'guide-foot' },
      x.read || again ? h('button', { class: 'btn', type: 'button', testid: 'guide-noted', onclick: done }, icon('check', 'i'), x.read ? 'Noted' : 'Got it') : null,
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-skip', onclick: () => { guide.skip(x.id); ctx.dirty() } }, 'Skip'),
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-stop', onclick: () => { guide.stop(); ctx.say('The guide is put away. How to play brings it back.'); ctx.dirty() } }, 'Stop the guide')),
  ]
}

function offerBody(ctx: Ctx): HTMLElement[] {
  return [
    h('p', { class: 't-label' }, 'The county agent'),
    h('p', { class: 'guide-ask' }, 'First year here? I will show you each thing as the year brings it.'),
    h('footer', { class: 'guide-foot' },
      h('button', { class: 'btn guide-yes', type: 'button', testid: 'guide-accept', onclick: () => { guide.accept(); ctx.dirty() } }, fist(), 'Guide my first year'),
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-refuse', onclick: () => { guide.refuse(); ctx.dirty() } }, 'Straight in')),
  ]
}

// ---------------------------------------------------------------- the camera, read from the scene's anchors

interface Sig { cx: number; cy: number; spread: number; angle: number; ratio: number }

function signature(ctx: Ctx): Sig | null {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < S.HOME_FIELDS; i++) {
    const a = ctx.view.fieldAnchor(i)
    if (a.visible && Number.isFinite(a.x) && Number.isFinite(a.y) && Math.abs(a.x) < innerWidth * 6 && Math.abs(a.y) < innerHeight * 6) pts.push(a)
  }
  if (pts.length < 3) return null
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const sx = Math.sqrt(pts.reduce((s, p) => s + (p.x - cx) ** 2, 0) / pts.length)
  const sy = Math.sqrt(pts.reduce((s, p) => s + (p.y - cy) ** 2, 0) / pts.length)
  const a = pts[0], b = pts[pts.length - 1]
  return { cx, cy, spread: Math.hypot(sx, sy), angle: Math.atan2(b.y - a.y, b.x - a.x), ratio: sy / Math.max(1, sx) }
}

// ---------------------------------------------------------------- mounting

export function mountGuide(ctx: Ctx, layer: HTMLElement): { frame(dt: number): void; dispose(): void } {
  const app = ctx.app
  const root = layer.parentElement as HTMLElement
  const slip = h('section', { class: 'guide floating sheet sys', 'aria-labelledby': 'guide-ask', hidden: true })
  const hand = h('div', { class: 'guide-fist sys', testid: 'guide-fist', 'aria-hidden': 'true', hidden: true }, fist())
  layer.append(slip, hand)

  let input: Input = ctx.touch() ? 'touch' : 'mouse'
  let stale = true
  const onKey = (e: KeyboardEvent) => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) && !(e.target as HTMLElement).closest?.('input')) setInput('keys') }
  const onPointer = (e: PointerEvent) => setInput(e.pointerType === 'touch' ? 'touch' : 'mouse')
  function setInput(i: Input): void { if (input !== i) { input = i; stale = true } }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onPointer, true)
  const off = app.on(() => { stale = true })

  let since = 0
  let now: Lesson | null = null
  let offer = false
  let said = ''
  let target = ''
  let place: { x: number; y: number } | null = null
  let placedFor = ''
  // 0: clear of every panel; 1: clear only of what it must never cover.
  let tier = 0
  let checked = 0
  const cam: { base: Sig | null; until: number; kind: 'pan' | 'zoom' | 'turn' | 'two' } = { base: null, until: 0, kind: 'pan' }

  function papers(): string[] {
    return [...root.querySelectorAll<HTMLElement>('.paper-layer > .dialog:not(.out)')].map(d => d.dataset.testid ?? 'paper')
  }

  function lookNow(): Look {
    const ps = papers()
    return {
      c: app.campaign, world: app.world, screen: app.screen, selection: app.selection, unit: app.unit, yard: app.yard, speed: app.speed,
      needs: app.campaign?.phase === 'season' ? app.needs().map(n => n.need) : [], paper: ps[ps.length - 1] ?? '', papers: ps, input,
    }
  }

  // The camera moved by the player: drag or keys (pan), wheel or pinch (zoom), right-drag, twist or Q and E (turn), and
  // the tip. Read from the scene's anchors as each gesture on the land starts and while it goes on, so the camera's own
  // settling is never taken for the player's.
  // What the gesture was by its input (a left drag or the arrows pans, the wheel zooms, the right button, two fingers,
  // Q, E and the page keys turn or tip), and whether the land on screen really moved that way.
  function camMoved(): void {
    const b = cam.base
    const s = signature(ctx)
    if (!b || !s) return
    const turn = Math.atan2(Math.sin(s.angle - b.angle), Math.cos(s.angle - b.angle))
    const k = cam.kind
    if (k === 'pan' && Math.hypot(s.cx - b.cx, s.cy - b.cy) > 40) guide.note('pan')
    if ((k === 'zoom' || k === 'two') && Math.abs(s.spread / b.spread - 1) > 0.1) guide.note('zoom')
    if ((k === 'turn' || k === 'two') && Math.abs(turn) > 0.1) guide.note('turn')
    if (k === 'turn' && Math.abs(s.ratio / b.ratio - 1) > 0.08) guide.note('tip')
  }
  const CAM_KEYS: Record<string, 'pan' | 'turn'> = { ArrowLeft: 'pan', ArrowRight: 'pan', ArrowUp: 'pan', ArrowDown: 'pan', q: 'turn', Q: 'turn', e: 'turn', E: 'turn', PageUp: 'turn', PageDown: 'turn' }
  const touches = new Set<number>()
  function gesture(on: boolean, kind: 'pan' | 'zoom' | 'turn' | 'two'): void {
    if (app.screen !== 'season' || !(now?.id === 'look' || now?.id === 'turn')) { cam.base = null; return }
    if (on) {
      if (!cam.base || (kind !== cam.kind && kind !== 'pan')) { cam.base = signature(ctx); cam.kind = kind }
      cam.until = performance.now() + 900
    } else cam.until = performance.now() + 400
  }
  const onCanvas = (e: Event) => {
    if ((e.target as Element)?.id !== 'field') return
    if (e.type === 'wheel') { gesture(true, 'zoom'); return }
    const p = e as PointerEvent
    if (p.pointerType === 'touch') { if (e.type === 'pointerdown') touches.add(p.pointerId); else if (e.type === 'pointerup') touches.delete(p.pointerId) }
    if (e.type === 'pointermove' && !p.buttons) return
    const kind = touches.size >= 2 ? 'two' : p.buttons & 2 || p.button === 2 ? 'turn' : 'pan'
    gesture(e.type !== 'pointerup', kind)
  }
  const onLift = (e: PointerEvent) => touches.delete(e.pointerId)
  const onCamKey = (e: KeyboardEvent) => { const k = CAM_KEYS[e.key]; if (k) gesture(e.type === 'keydown', k) }
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) document.addEventListener(t, onCanvas, { capture: true, passive: true })
  document.addEventListener('pointercancel', onLift, true)
  document.addEventListener('keydown', onCamKey, true)
  document.addEventListener('keyup', onCamKey, true)
  function watchCamera(): void {
    if (!cam.base) return
    camMoved()
    if (performance.now() > cam.until) cam.base = null
  }

  function notePlan(): void {
    for (const id of ['crew', 'land']) if (root.querySelector(`.catalogue [data-testid="${id}"]`)) guide.note(`fold:${id}`)
  }

  function noteOpen(): void {
    if (shown(root.querySelector('[data-testid="work-grid"]'))) guide.note('open:work-grid')
  }

  function render(): void {
    const c = app.campaign
    // Started with the offer unanswered: straight in.
    if (c && app.screen === 'season' && !guide.p.offered && guide.p.offerSeed === c.seed) guide.refuse()
    if (app.screen === 'plan') notePlan()
    if (app.screen === 'season') noteOpen()
    const l = lookNow()
    offer = guide.offerFor(c, app.screen)
    now = offer ? null : guide.showing(l)
    const docked = app.screen === 'plan'
    const held = !!now && app.screen === 'season' && guide.holdsClock(c) && app.speed === 0
    const p = now?.point?.(l) ?? null
    const t = resolve(ctx, root, p)
    target = t.id
    // Something on the land to point at, none of it in view.
    const lost = !!p && !('testid' in p) && !t.at && app.screen === 'season'
    // The spring's notes go into the catalogue; everything else floats.
    if (slot) {
      const inSlot = docked && slot.isConnected
      patch(slot, JSON.stringify([inSlot && offer, inSlot && now ? [now.id, now.ask(l), now.why(l), guide.replaying(now.id), lost] : 0, input]), () =>
        inSlot && offer ? h('section', { class: 'guide docked offer', testid: 'guide-offer', 'aria-label': 'A guided first year' }, offerBody(ctx))
          : inSlot && now ? h('section', { class: 'guide docked', testid: 'guide-slip', 'data-lesson': now.id, 'data-target': target, 'aria-labelledby': 'guide-ask' }, slipBody(ctx, now, l, held, lost)) : null)
      if (inSlot && now) slot.querySelector<HTMLElement>('.guide')?.setAttribute('data-target', target)
    }
    const floating = !!now && !docked
    slip.hidden = !floating
    if (floating && now) {
      patch(slip, JSON.stringify([now.id, now.ask(l), now.why(l), held, guide.replaying(now.id), input, lost]), () => slipBody(ctx, now!, l, held, lost))
      slip.dataset.lesson = now.id
      slip.dataset.target = target
      slip.dataset.testid = 'guide-slip'
    } else {
      delete slip.dataset.testid
      delete slip.dataset.lesson
      patch(slip, '', () => null)
    }
    // Each lesson is read out once, politely.
    const words = offer ? 'The county agent offers a guided first year, beside Start the season.' : now ? `${now.ask(l)} ${now.why(l)}` : ''
    const key = offer ? 'offer' : now?.id ?? ''
    if (key && key !== said) ctx.announce(words)
    said = key
  }

  function placeAll(): void {
    const l = now
    if (!l) { hand.hidden = true; place = null; return }
    const lk = lookNow()
    const t = resolve(ctx, root, l.point?.(lk) ?? null)
    // The fist beside the target, pointing at it: left of it, else right, above, below.
    let fistBox: Box | null = null
    if (t.at) {
      const cx = (t.at.left + t.at.right) / 2, cy = (t.at.top + t.at.bottom) / 2, s = 44, g = 6
      const tries: [number, number, string][] = [
        [t.at.left - s - g, cy - s / 2, 'r'], [t.at.right + g, cy - s / 2, 'l'], [cx - s / 2, t.at.top - s - g, 'd'], [cx - s / 2, t.at.bottom + g, 'u'],
      ]
      // In spring the slip is in the catalogue: the fist keeps off it.
      const docked = slot?.isConnected ? slot.querySelector('.guide')?.getBoundingClientRect() : undefined
      const inside = ([x, y]: [number, number, string]) => x >= 4 && y >= 4 && x + s <= innerWidth - 4 && y + s <= innerHeight - 4
      const free = ([x, y]: [number, number, string]) => !docked || !meets({ left: x, top: y, right: x + s, bottom: y + s }, box(docked))
      const fit = tries.find(f => inside(f) && free(f)) ?? tries.find(inside) ?? null
      if (fit) {
        fistBox = { left: fit[0], top: fit[1], right: fit[0] + s, bottom: fit[1] + s }
        hand.style.transform = `translate3d(${fit[0].toFixed(1)}px, ${fit[1].toFixed(1)}px, 0)`
        hand.dataset.to = fit[2]
      }
    }
    hand.hidden = !fistBox
    if (slip.hidden) return
    const key = `${l.id}|${innerWidth}x${innerHeight}|${slip.offsetWidth}x${slip.offsetHeight}`
    const t0 = performance.now()
    if (placedFor === key && t0 - checked < 250) return
    checked = t0
    const { hard, soft } = obstacles(root)
    if (t.at) hard.push(pad(t.at, 10))
    if (fistBox) hard.push(pad(fistBox, 4))
    const w = slip.offsetWidth, ht = slip.offsetHeight
    const here = place ? { left: place.x, top: place.y, right: place.x + w, bottom: place.y + ht } : null
    // Stay put while the place is still clear; move only when something comes over it.
    if (here && placedFor === key && !(tier === 0 ? [...hard, ...soft] : hard).some(a => meets(here, pad(a, 6)))) return
    let found: { x: number; y: number } | null = null
    for (const [k, compact] of [[0, false], [0, true], [1, false], [1, true]] as const) {
      slip.classList.toggle('compact', compact)
      found = findPlace(slip.offsetWidth, slip.offsetHeight, (k === 0 ? [...hard, ...soft] : hard).map(a => pad(a, 8)))
      if (found) { tier = k; break }
    }
    slip.classList.toggle('gone', !found)
    place = found
    placedFor = `${l.id}|${innerWidth}x${innerHeight}|${slip.offsetWidth}x${slip.offsetHeight}`
    if (found) slip.style.transform = `translate3d(${found.x}px, ${found.y}px, 0)`
  }

  return {
    frame(dt: number) {
      since += dt
      if (stale || since > 300) {
        stale = false
        since = 0
        render()
      }
      if (now && (now.id === 'look' || now.id === 'turn') && app.screen === 'season') watchCamera()
      placeAll()
    },
    dispose() {
      off()
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) document.removeEventListener(t, onCanvas, true)
      document.removeEventListener('pointercancel', onLift, true)
      document.removeEventListener('keydown', onCamKey, true)
      document.removeEventListener('keyup', onCamKey, true)
      slip.remove()
      hand.remove()
    },
  }
}

