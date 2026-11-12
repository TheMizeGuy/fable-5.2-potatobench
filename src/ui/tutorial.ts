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
// The pause reason the guide's own hold leaves on the clock.
const HOLD = 'The county agent has a note for you.'
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
function hardOnes(root: HTMLElement): Box[] {
  const hard: Box[] = []
  for (const el of root.querySelectorAll('.clock, .command, .telegram, .dialog, [data-testid="paused"], .tray-paper, .person-card, .work, .pin-list-at, .tb-pop, .queue, .cat-open')) {
    if (shown(el)) hard.push(box(el.getBoundingClientRect()))
  }
  return hard
}

function obstacles(root: HTMLElement): { hard: Box[]; soft: Box[]; costs: { b: Box; cost: number }[] } {
  const hard = hardOnes(root)
  const soft: Box[] = []
  const costs: { b: Box; cost: number }[] = []
  const main = root.querySelector<HTMLElement>('.screen-layer > main:not(.leaving)')
  const walk = (el: Element, depth: number) => {
    for (const k of el.children) {
      // A veil dims the land behind a telegram; it is not a panel.
      if (!shown(k) || k.classList.contains('veil')) continue
      const r = k.getBoundingClientRect()
      const cs = getComputedStyle(k)
      const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none' && cs.boxShadow === 'none'
      if (clear && depth < 4 && (r.width > innerWidth * 0.6 || r.height > innerHeight * 0.6 || k.children.length)) walk(k, depth + 1)
      else {
        soft.push(box(r))
        // The boards at the top repeat what the screen below says; a sheet of words does not.
        costs.push({ b: box(r), cost: k.closest('.topbar, .top') ? 1 : 4 })
      }
    }
  }
  if (main) walk(main, 0)
  for (const el of root.querySelectorAll('.notes .alert')) if (shown(el)) soft.push(box(el.getBoundingClientRect()))
  return { hard, soft, costs }
}

// The first free place for a box this size, nearest the top of the land and its middle; null when there is none.
// over: panels it may lie over if it must, each with what covering it costs (a board little, a sheet of words more).
function findPlace(w: number, hgt: number, avoid: Box[], over: { b: Box; cost: number }[] = []): { x: number; y: number } | null {
  const m = 12, step = 16
  let best: { x: number; y: number; s: number } | null = null
  const area = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  for (let y = m; y + hgt <= innerHeight - m; y += step) {
    for (let x = m; x + w <= innerWidth - m; x += step) {
      const b = { left: x, top: y, right: x + w, bottom: y + hgt }
      if (avoid.some(a => meets(b, a))) continue
      const s = y + Math.abs(x + w / 2 - innerWidth / 2) * 0.35 + over.reduce((t, o) => t + area(b, o.b) * o.cost / 40, 0)
      if (!best || s < best.s) best = { x, y, s }
    }
  }
  return best
}

// Everything on the screen a player reads or presses: words, figures, faces, keys, tags, stamps and controls, as boxes.
// Read from the elements themselves (the layers over the land let the pointer through, so asking the page what lies
// at a point would find only the land), and only the boxes of the words, not the paragraphs round them.
const BUSY = 'svg, img, button, a, input, label, .tag, .need, .pin, .portrait, .key, .t-figure'
export function busyBoxes(root: HTMLElement): Box[] {
  const out: Box[] = []
  const range = document.createRange()
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.closest('.guide-layer, .leaving, [hidden], .gone, .sr')) continue
    if (el.matches(BUSY)) {
      if (el.parentElement?.closest(BUSY)) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) out.push(box(r))
      continue
    }
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !(n.nodeValue ?? '').trim()) continue
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) out.push(box(r))
    }
  }
  return out
}

// Whether a box lies over nothing a player reads or presses.
export function bareAt(busy: Box[], b: Box): boolean {
  return !busy.some(a => meets(b, a))
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
    h('p', { class: 'guide-ask' }, 'New here? I will show you each thing as it comes.'),
    h('footer', { class: 'guide-foot' },
      h('button', { class: 'btn guide-yes', type: 'button', testid: 'guide-accept', onclick: () => { guide.accept(); ctx.dirty() } }, fist(), 'Guide my first year'),
      h('button', { class: 'btn quiet', type: 'button', testid: 'guide-refuse', onclick: () => { guide.refuse(); ctx.dirty() } }, 'Straight in')),
  ]
}

// ---------------------------------------------------------------- the camera, read from the scene's anchors

// Where each parcel's anchor is on the screen, by parcel: two of these, taken a gesture apart, say how the view moved.
type Sig = Map<number, { x: number; y: number }>

function signature(ctx: Ctx): Sig {
  const pts: Sig = new Map()
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const a = ctx.view.fieldAnchor(i)
    if (a.visible && Number.isFinite(a.x) && Number.isFinite(a.y) && Math.abs(a.x) < innerWidth * 20 && Math.abs(a.y) < innerHeight * 20) pts.set(i, { x: a.x, y: a.y })
  }
  return pts
}

// Pan, zoom, turn and tip between two signatures, over the parcels seen in both; null with fewer than two.
function moved(b: Sig, s: Sig): { pan: number; zoom: number; turn: number; tip: number } | null {
  const ids = [...b.keys()].filter(i => s.has(i))
  if (ids.length < 2) return null
  const stat = (m: Sig) => {
    const ps = ids.map(i => m.get(i)!)
    const cx = ps.reduce((t, p) => t + p.x, 0) / ps.length, cy = ps.reduce((t, p) => t + p.y, 0) / ps.length
    const sx = Math.sqrt(ps.reduce((t, p) => t + (p.x - cx) ** 2, 0) / ps.length), sy = Math.sqrt(ps.reduce((t, p) => t + (p.y - cy) ** 2, 0) / ps.length)
    const a = ps[0], z = ps[ps.length - 1]
    return { cx, cy, spread: Math.max(1, Math.hypot(sx, sy)), angle: Math.atan2(z.y - a.y, z.x - a.x), ratio: sy / Math.max(1, sx) }
  }
  const p = stat(b), q = stat(s)
  return {
    pan: Math.hypot(q.cx - p.cx, q.cy - p.cy), zoom: Math.abs(q.spread / p.spread - 1),
    turn: Math.abs(Math.atan2(Math.sin(q.angle - p.angle), Math.cos(q.angle - p.angle))), tip: Math.abs(q.ratio / Math.max(0.01, p.ratio) - 1),
  }
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
  // A coarse pointer is a finger, whatever the event calls itself.
  const onPointer = (e: PointerEvent) => setInput(e.pointerType === 'touch' || ctx.touch() ? 'touch' : 'mouse')
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
  let placedAt = 0
  let busy: Box[] | null = null
  let busyAt = 0
  const cam: { base: Sig | null; until: number; kind: 'pan' | 'zoom' | 'turn' | 'two'; travel: number } = { base: null, until: 0, kind: 'pan', travel: 0 }

  function papers(): string[] {
    return [...root.querySelectorAll<HTMLElement>('.paper-layer > .dialog:not(.out)')].map(d => d.dataset.testid ?? 'paper')
  }

  function lookNow(): Look {
    const ps = papers()
    return {
      c: app.campaign, world: app.world, screen: app.screen, selection: app.selection, unit: app.unit, yard: app.yard, speed: app.speed,
      needs: app.campaign?.phase === 'season' ? app.needs().map(n => n.need) : [], paper: ps[ps.length - 1] ?? '', papers: ps, input,
      stopped: app.pauseReason === HOLD ? '' : app.pauseReason,
    }
  }

  // The camera moved by the player: drag or keys (pan), wheel or pinch (zoom), right-drag, twist or Q and E (turn), and
  // the tip. Read from the scene's anchors as each gesture on the land starts and while it goes on, so the camera's own
  // settling is never taken for the player's.
  // What the gesture was by its input (a left drag or the arrows pans, the wheel zooms, the right button, two fingers,
  // Q, E and the page keys turn or tip), and whether the land on screen really moved that way.
  function camMoved(): void {
    const b = cam.base
    if (!b) return
    const m = moved(b, signature(ctx))
    const k = cam.kind
    // The farm all but out of view, before or after: the gesture's own travel says it moved the view.
    if (!m) { if (cam.travel >= 40) guide.note(k === 'two' ? 'turn' : k); return }
    if (k === 'pan' && m.pan > 40) guide.note('pan')
    if ((k === 'zoom' || k === 'two') && m.zoom > 0.1) guide.note('zoom')
    if ((k === 'turn' || k === 'two') && m.turn > 0.1) guide.note('turn')
    if (k === 'turn' && m.tip > 0.08) guide.note('tip')
  }
  const CAM_KEYS: Record<string, 'pan' | 'turn'> = { ArrowLeft: 'pan', ArrowRight: 'pan', ArrowUp: 'pan', ArrowDown: 'pan', q: 'turn', Q: 'turn', e: 'turn', E: 'turn', PageUp: 'turn', PageDown: 'turn' }
  const touches = new Set<number>()
  function gesture(on: boolean, kind: 'pan' | 'zoom' | 'turn' | 'two'): void {
    if (app.screen !== 'season' || !(now?.id === 'watch' || now?.id === 'turn')) { cam.base = null; return }
    if (on) {
      if (!cam.base || (kind !== cam.kind && kind !== 'pan')) { cam.base = signature(ctx); cam.kind = kind; cam.travel = 0 }
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
    if (e.type === 'pointermove') cam.travel += Math.hypot(p.movementX || 0, p.movementY || 0)
    gesture(e.type !== 'pointerup', kind)
  }
  const onLift = (e: PointerEvent) => touches.delete(e.pointerId)
  const onCamKey = (e: KeyboardEvent) => { const k = CAM_KEYS[e.key]; if (k) { if (e.type === 'keydown') cam.travel += 20; gesture(e.type === 'keydown', k) } }
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

  // 20: a lesson that asks for a click on something the days move holds the clock while it shows, and lets it go on at
  // the speed it had once it passes. A player who starts the clock themselves is not stopped again for that lesson.
  let holding: { id: string; speed: number } | null = null
  const overridden = new Set<string>()
  function hold(): void {
    const want = now && now.holds && app.screen === 'season' && !overridden.has(now.id) ? now.id : ''
    if (holding && app.speed > 0) { overridden.add(holding.id); holding = null }
    if (want && !holding) {
      // Already stopped (by the player, or a question): it stays so, and the player starting it again is their call.
      holding = { id: want, speed: app.speed }
      if (app.speed > 0) { app.setSpeed(0); app.pauseReason = HOLD; ctx.dirty() }
    } else if (want && holding) holding.id = want
    else if (!want && holding && !resting) {
      const back = holding.speed
      holding = null
      if (back > 0 && app.speed === 0 && app.pauseReason === HOLD) app.setSpeed(back as 1 | 2 | 3)
    }
  }

  // 22: one lesson at a time and never a step ahead of the click. After one passes, the next waits a moment, and waits
  // while a panel its click opened (a catalogue fold, a paper, a person's card, the grid) is still open.
  let lastId = ''
  let restUntil = 0
  let waitFor: string[] = []
  let resting = false
  const PANELS = ['.cat-open', '.paper-layer > .dialog:not(.out)', '.person-card:not([hidden])', '.work:not([hidden])']
  const panelsOpen = () => PANELS.filter(sel => !!root.querySelector(sel))
  function paced(x: Lesson | null): Lesson | null {
    const t = performance.now()
    resting = false
    if (x?.id !== lastId) {
      if (lastId && guide.passed(lastId)) { restUntil = t + 1200; waitFor = panelsOpen() }
      lastId = x?.id ?? ''
    }
    if (!x || x.urgent || x.paper) return x
    waitFor = waitFor.filter(sel => !!root.querySelector(sel))
    resting = t < restUntil || waitFor.length > 0
    if (resting) { stale = true; return null }
    return x
  }

  function render(): void {
    const c = app.campaign
    // Started with the offer unanswered: straight in.
    if (c && app.screen === 'season' && !guide.p.offered && guide.p.offerSeed === c.seed) guide.refuse()
    if (app.screen === 'plan') notePlan()
    if (app.screen === 'season') noteOpen()
    if (shown(root.querySelector('#raise-list'))) guide.note('fold:raise')
    const l = lookNow()
    offer = guide.offerFor(c, app.screen)
    now = offer ? null : paced(guide.showing(l))
    hold()
    const docked = app.screen === 'plan'
    const held = !!now && app.screen === 'season' && app.speed === 0 && (guide.holdsClock(c) || app.pauseReason === HOLD || !!now?.holds)
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
      const up: [number, number, string] = [cx - s / 2, t.at.top - s - g, 'd'], down: [number, number, string] = [cx - s / 2, t.at.bottom + g, 'u']
      // Beside it, else toward the middle of the screen from it.
      const tries: [number, number, string][] = [[t.at.left - s - g, cy - s / 2, 'r'], [t.at.right + g, cy - s / 2, 'l'], ...(cy < innerHeight / 2 ? [down, up] : [up, down])]
      // In spring the slip is in the catalogue: the fist keeps off it.
      const docked = slot?.isConnected ? slot.querySelector('.guide')?.getBoundingClientRect() : undefined
      const inside = ([x, y]: [number, number, string]) => x >= 4 && y >= 4 && x + s <= innerWidth - 4 && y + s <= innerHeight - 4
      const free = ([x, y]: [number, number, string]) => !docked || !meets({ left: x, top: y, right: x + s, bottom: y + s }, box(docked))
      // Never over another control it would hide (a clock, a command bar, a paper), nor over anything to be read.
      const hard = [...hardOnes(root), ...[...root.querySelectorAll('.goal')].filter(shown).map(e => box(e.getBoundingClientRect()))]
      const t0 = performance.now()
      if (!busy || t0 - busyAt > 250) { busy = busyBoxes(root); busyAt = t0 }
      const words = busy
      const clear = ([x, y]: [number, number, string]) => !hard.some(a => meets({ left: x, top: y, right: x + s, bottom: y + s }, a)) && bareAt(words, pad({ left: x, top: y, right: x + s, bottom: y + s }, 2))
      // And off the field tags where it can be, so the name of what it points at stays readable.
      const tags = [...root.querySelectorAll('.plate-layer .tag')].filter(shown).map(e => box(e.getBoundingClientRect()))
      const bare = ([x, y]: [number, number, string]) => !tags.some(a => meets({ left: x, top: y, right: x + s, bottom: y + s }, a))
      // With no clear place beside it (inside a telegram, under the order blank on a phone) the slip's words do alone.
      const small = ctx.layout() === 'narrow' || ctx.layout() === 'short'
      const fit = docked && small ? null : tries.find(f => inside(f) && free(f) && clear(f) && bare(f)) ?? tries.find(f => inside(f) && free(f) && clear(f)) ?? null
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
    // Every frame: nothing it must never cover has come over it (a card sliding in, a telegram).
    const must = [...hardOnes(root), ...(t.at ? [pad(t.at, 10)] : []), ...(fistBox ? [pad(fistBox, 4)] : [])]
    const at = place ? { left: place.x, top: place.y, right: place.x + slip.offsetWidth, bottom: place.y + slip.offsetHeight } : null
    if (placedFor === key && t0 - checked < 250 && (!at || !must.some(a => meets(at, a)))) return
    checked = t0
    const { hard, soft, costs } = obstacles(root)
    if (t.at) hard.push(pad(t.at, 10))
    if (fistBox) hard.push(pad(fistBox, 4))
    const w = slip.offsetWidth, ht = slip.offsetHeight
    const here = place ? { left: place.x, top: place.y, right: place.x + w, bottom: place.y + ht } : null
    // Stay put while the place is still clear; move only when something comes over it.
    const retry = tier !== 0 && t0 - placedAt > 1000
    if (here && placedFor === key && !retry && !(tier === 0 ? [...hard, ...soft] : hard).some(a => meets(here, pad(a, 6)))) return
    let found: { x: number; y: number } | null = null
    // First off every panel and every field tag; then off the panels; then off only what it must never cover.
    const tags = [...root.querySelectorAll('.plate-layer .tag')].filter(shown).map(e => box(e.getBoundingClientRect()))
    // Over a panel only when it must, and then short, where it hides least.
    for (const [k, compact, also] of [[0, false, tags], [0, false, []], [0, true, []], [1, true, []], [1, false, []]] as const) {
      slip.classList.toggle('compact', compact)
      found = findPlace(slip.offsetWidth, slip.offsetHeight, [...(k === 0 ? [...hard, ...soft] : hard), ...also].map(a => pad(a, 8)), k === 1 ? costs : [])
      if (found) { tier = k; break }
    }
    slip.classList.toggle('gone', !found)
    place = found
    placedFor = `${l.id}|${innerWidth}x${innerHeight}|${slip.offsetWidth}x${slip.offsetHeight}`
    placedAt = t0
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
      if (now && (now.id === 'watch' || now.id === 'turn') && app.screen === 'season') watchCamera()
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

