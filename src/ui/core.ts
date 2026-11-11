import type { App } from '../game/app.ts'
import type { FieldView } from '../game/contracts.ts'
import type { Cmd, Estimate, Lot, Result } from '../sim/index.ts'
import { h, morphChildren, type Child } from './dom.ts'
import { icon } from './icons.ts'
import { localize } from './fmt.ts'

// wide: everything on one line along each edge. mid: the command card gets a row to itself.
// narrow: a phone or tablet held upright. short: a phone on its side.
export type Layout = 'wide' | 'mid' | 'narrow' | 'short'
export type Level = 'info' | 'good' | 'warn' | 'bad'

// What could be seen of a field before the digger went in.
export interface Seen { stunted: number; stand: number }

export interface Ctx {
  app: App
  view: FieldView
  papers: Papers
  notes: Notes
  // A short line by the alerts, read out to screen readers too.
  say(text: string, level?: Level): void
  // Read out to screen readers only: what a sighted player can already see happen.
  announce(text: string): void
  run(cmd: Cmd): Result
  layout(): Layout
  touch(): boolean
  reduced(): boolean
  // What the grower knew a moment ago, for "before and after" displays.
  memo: {
    estimates: (Estimate | null)[]; soilT: number; digSoilT: Record<string, number>; lots: Record<string, Lot>
    seen: (Seen | null)[]; digEst: Record<string, Estimate | null>; digSeen: Record<string, Seen | null>
    sampleBefore: Record<string, Estimate | null>
  }
  // "Run until needed" is a way of playing, not one press: while it is on, the days run on again by themselves
  // once nothing is asked for. Choosing a speed by hand turns it off.
  clock: { auto: boolean }
  dirty(): void
}

export interface Screen {
  el: HTMLElement
  update(): void
  insets(): [number, number, number, number]
  frame?(dt: number): void
  key?(e: KeyboardEvent): boolean
  // Where the alerts sit on this screen.
  notes?: HTMLElement
  dispose?(): void
}

export function layoutNow(): Layout {
  const w = innerWidth, hh = innerHeight
  if (hh <= 500 && w > hh) return 'short'
  if (w < 900) return 'narrow'
  return w < 1400 ? 'mid' : 'wide'
}

const keys = new WeakMap<Element, string>()
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]'

// Rebuilds a section only when what it shows has changed, keeping keyboard focus where it was:
// on the same control if it is still there and usable, otherwise on the one now in its place.
export function patch(el: HTMLElement, key: string, render: () => Child): void {
  if (keys.get(el) === key) return
  keys.set(el, key)
  const active = document.activeElement as HTMLElement | null
  const inside = !!active && el.contains(active)
  const fk = inside ? active!.dataset.k : undefined
  const at = inside ? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].indexOf(active!) : -1
  const scrolls = [...el.querySelectorAll<HTMLElement>('[data-scroll]')].map(x => [x.dataset.scroll, x.scrollTop] as const)
  const box = h('div', null, render())
  morphChildren(el, box)
  for (const [name, top] of scrolls) {
    const x = el.querySelector<HTMLElement>(`[data-scroll="${name}"]`)
    if (x) x.scrollTop = top
  }
  if (!inside) return
  const same = fk ? el.querySelector<HTMLElement>(`[data-k="${CSS.escape(fk)}"]`) : null
  if (same && same.matches(FOCUSABLE)) { same.focus({ preventScroll: true }); return }
  const now = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const next = now[Math.min(Math.max(at, 0), now.length - 1)]
  if (next) next.focus({ preventScroll: true })
  else active?.blur()
}

export function forget(el: HTMLElement): void {
  keys.delete(el)
}

function reducedNow(): boolean {
  return document.documentElement.classList.contains('reduce-motion')
}

// Counts a figure from one value to another, and marks it as changed.
export function count(el: HTMLElement, from: number, to: number, show: (n: number) => string, ms = 600): void {
  if (reducedNow() || from === to) { el.textContent = show(to); return }
  el.textContent = show(from)
  const t0 = performance.now()
  const step = (now: number) => {
    if (!el.isConnected) return
    const p = Math.min(1, (now - t0) / ms)
    const e = 1 - (1 - p) ** 3
    el.textContent = show(from + (to - from) * e)
    if (p < 1) requestAnimationFrame(step)
    else { el.textContent = show(to); el.classList.remove('changed'); void el.offsetWidth; el.classList.add('changed') }
  }
  requestAnimationFrame(step)
}

// ---------------------------------------------------------------- papers (modal)

export interface PaperSpec {
  title: string
  testid?: string
  cls?: string
  size?: 'small' | 'medium' | 'wide'
  // A result the player has to answer: a tap outside does not close it.
  sticky?: boolean
  // The paper draws its own heading; the title is still its accessible name.
  bare?: boolean
  body: (close: () => void) => Child
  // Actions that stay in view below the scrolling body.
  foot?: (close: () => void) => Child
  onClose?: () => void
  closeLabel?: string
}

interface Open { el: HTMLElement; back: HTMLElement | null; spec: PaperSpec; at: number }

let paperSeq = 0
const EXIT_MS = 160

export class Papers {
  private stack: Open[] = []
  private queue: PaperSpec[] = []
  private leaving = 0
  private layer: HTMLElement
  private shade: HTMLElement
  private covered: HTMLElement[]
  private app: App
  private resume: { speed: 0 | 1 | 2 | 3; running: boolean } | null = null

  constructor(layer: HTMLElement, covered: HTMLElement[], app: App) {
    this.layer = layer
    this.covered = covered
    this.app = app
    this.shade = h('div', { class: 'shade', hidden: true })
    // A tap meant for what was under the paper a moment ago must not close it unseen.
    this.shade.addEventListener('click', () => {
      const top = this.stack[this.stack.length - 1]
      if (top && !top.spec.sticky && performance.now() - top.at >= 500) this.remove(top)
    })
    layer.append(this.shade)
    document.addEventListener('keydown', e => this.trap(e))
  }

  // True while a paper is up or on its way out.
  isOpen(): boolean { return this.stack.length > 0 || this.leaving > 0 }
  top(): HTMLElement | null { return this.stack[this.stack.length - 1]?.el ?? null }

  open(spec: PaperSpec): () => void {
    const id = `paper-${++paperSeq}`
    const back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      this.remove(entry)
    }
    const el = h('section', {
      class: `paper dialog ${spec.size ?? 'medium'}${spec.cls ? ` ${spec.cls}` : ''}`,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, testid: spec.testid, tabindex: '-1',
    },
    h('header', { class: `paper-head${spec.bare ? ' bare' : ''}` },
      h('h2', { id: `${id}-t`, class: spec.bare ? 'sr' : 't-title' }, spec.title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': spec.closeLabel ?? 'Close', testid: 'paper-close', onclick: close }, icon('close'))),
    h('div', { class: 'paper-body', 'data-scroll': 'paper' }, spec.body(close)),
    spec.foot ? h('div', { class: 'paper-foot' }, spec.foot(close)) : null)
    const entry: Open = { el, back, spec, at: performance.now() }
    if (this.stack.length === 0 && this.app.screen === 'season' && !this.resume) {
      this.resume = { speed: this.app.speed, running: this.app.running }
      if (this.app.speed > 0) this.app.setSpeed(0)
    }
    this.stack.push(entry)
    this.layer.append(el)
    this.sync()
    // A body long enough to scroll has to be reachable from the keyboard.
    const body = el.querySelector<HTMLElement>('.paper-body')!
    const reach = () => { if (body.isConnected && body.scrollHeight > body.clientHeight + 1) { body.tabIndex = 0; body.setAttribute('role', 'group'); body.setAttribute('aria-label', spec.title) } }
    reach()
    setTimeout(reach, 700)
    ;(el.querySelector<HTMLElement>('[autofocus]') ?? el).focus({ preventScroll: true })
    return close
  }

  // Papers raised by the game wait their turn behind whatever is open.
  enqueue(spec: PaperSpec): void {
    if (!this.isOpen()) this.open(spec)
    else this.queue.push(spec)
  }

  pending(): number { return this.queue.length }

  closeTop(): void {
    const top = this.stack[this.stack.length - 1]
    if (top) this.remove(top)
  }

  closeAll(): void {
    this.queue = []
    this.resume = null
    while (this.stack.length) this.remove(this.stack[this.stack.length - 1], true)
  }

  private remove(entry: Open, now = false): void {
    const k = this.stack.indexOf(entry)
    if (k < 0) return
    this.stack.splice(k, 1)
    const gone = () => {
      entry.el.remove()
      this.leaving--
      this.sync()
      if (this.stack.length === 0 && this.leaving === 0 && this.queue.length) this.open(this.queue.shift()!)
    }
    this.leaving++
    entry.el.inert = true
    entry.spec.onClose?.()
    if (this.stack.length === 0 && !this.queue.length && this.resume) {
      const r = this.resume
      this.resume = null
      // The clock goes back to what it was doing, unless something else has set it since.
      if (this.app.screen === 'season' && this.app.speed === 0 && this.app.pauseReason === '' && r.speed > 0) {
        if (r.running) this.app.runUntilNeeded()
        else this.app.setSpeed(r.speed)
      }
    }
    if (now || reducedNow()) gone()
    else {
      entry.el.classList.add('out')
      if (this.stack.length === 0 && !this.queue.length) this.shade.classList.add('out')
      setTimeout(gone, EXIT_MS)
    }
    const top = this.stack[this.stack.length - 1]
    const target = entry.back && entry.back.isConnected && !entry.back.closest('[inert]') ? entry.back : top ? top.el : null
    if (target) target.focus({ preventScroll: true })
    else (document.activeElement as HTMLElement | null)?.blur?.()
  }

  private sync(): void {
    const n = this.stack.length
    const up = n > 0 || this.leaving > 0
    if (n > 0) this.shade.classList.remove('out')
    this.shade.hidden = !up
    for (const c of this.covered) c.inert = n > 0
    this.stack.forEach((d, i) => { d.el.inert = i < n - 1 })
    document.documentElement.classList.toggle('has-paper', n > 0)
  }

  // Tab is moved by hand so the cycle is the same in every engine (Safari skips buttons by default).
  private trap(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return
    const top = this.stack[this.stack.length - 1]
    if (!top) return
    const items = [...top.el.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')]
      .filter(x => !(x as HTMLButtonElement).disabled && x.offsetParent !== null && x.tabIndex >= 0)
    if (!items.length) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = at < 0 ? (e.shiftKey ? items.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length
    items[next].focus()
  }
}

export function confirmPaper(ctx: Ctx, o: { title: string; text: Child; yes: string; no?: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    let answered = false
    ctx.papers.open({
      title: o.title,
      testid: 'confirm',
      size: 'small',
      body: () => h('div', { class: 'stack' }, o.text),
      foot: close => [
        h('button', { class: `btn ${o.danger ? 'danger solid' : ''}`, type: 'button', testid: 'confirm-ok', onclick: () => { answered = true; resolve(true); close() } }, o.yes),
        h('button', { class: 'btn primary', type: 'button', testid: 'confirm-cancel', autofocus: true, onclick: () => { answered = true; resolve(false); close() } }, o.no ?? 'Cancel'),
      ],
      onClose: () => { if (!answered) resolve(false) },
    })
  })
}

// ---------------------------------------------------------------- alerts and notices

export interface Note { id: string; level: Level; glyph: string; text: string; full: string; field: number; day: number; born: number; ttl: number }

const LEVEL_GLYPH: Record<Level, string> = { info: 'flat', good: 'check', warn: 'warn', bad: 'blight' }

// The last few things that happened, newest lowest. One with a field goes there when clicked.
export class Notes {
  readonly el: HTMLElement
  private live: HTMLElement
  private items: Note[] = []
  private seq = 0
  private hovered = false
  keep = 3
  // Where the rows sit over the land itself, each one goes after this long (0: it stays).
  maxAge = 0
  onGo: (field: number) => void = () => {}

  constructor() {
    this.el = h('div', { class: 'notes' })
    this.live = h('div', { class: 'sr', 'aria-live': 'polite', role: 'status' })
    this.el.addEventListener('pointerenter', () => { this.hovered = true })
    this.el.addEventListener('pointerleave', () => { this.hovered = false })
  }

  get liveRegion(): HTMLElement { return this.live }

  // text: what the row shows. full: what a screen reader hears (the whole sentence).
  push(o: { level?: Level; glyph?: string; text: string; full?: string; field?: number; day?: number; ttl?: number }): void {
    const level = o.level ?? 'info'
    const text = localize(o.text)
    const full = localize(o.full ?? o.text)
    const dup = this.items.find(n => n.full === full)
    if (dup) this.drop(dup)
    this.items.push({ id: `n${++this.seq}`, level, glyph: o.glyph ?? LEVEL_GLYPH[level], text, full, field: o.field ?? -1, day: o.day ?? -1, born: performance.now(), ttl: o.ttl ?? 0 })
    while (this.items.length > this.keep) this.items.shift()
    this.live.textContent = full
    this.draw()
  }

  // Drops what has gone stale: a notice after its time, an alert once it is days old.
  prune(day: number): void {
    const now = performance.now()
    const gone = this.items.filter(n => (n.ttl > 0 && !this.hovered && now - n.born > n.ttl) || (n.day >= 0 && day >= 0 && day - n.day > 6) ||
      (this.maxAge > 0 && !this.hovered && now - n.born > this.maxAge))
    if (!gone.length) return
    for (const n of gone) this.drop(n)
    this.draw()
  }

  clear(): void {
    this.items = []
    this.el.replaceChildren()
  }

  // How many rows this screen has room for.
  limit(n: number): void {
    this.keep = n
    if (this.items.length <= n) return
    this.items.splice(0, this.items.length - n)
    this.draw()
  }

  count(): number { return this.items.length }
  has(full: string): boolean { return this.items.some(n => n.full === localize(full)) }

  private drop(n: Note): void {
    const k = this.items.indexOf(n)
    if (k >= 0) this.items.splice(k, 1)
  }

  private draw(): void {
    const before = new Map<string, number>()
    for (const row of this.el.children) before.set((row as HTMLElement).dataset.id!, row.getBoundingClientRect().top)
    const have = new Map([...this.el.children].map(row => [(row as HTMLElement).dataset.id!, row as HTMLElement]))
    const rows = this.items.map(n => have.get(n.id) ?? this.row(n))
    this.el.replaceChildren(...rows)
    if (reducedNow()) return
    // Rows that were already there glide to their new place.
    for (const row of rows) {
      const was = before.get(row.dataset.id!)
      if (was === undefined) continue
      const dy = was - row.getBoundingClientRect().top
      if (Math.abs(dy) < 1) continue
      row.style.transition = 'none'
      row.style.transform = `translateY(${dy}px)`
      void row.offsetWidth
      row.style.transition = ''
      row.style.transform = ''
    }
  }

  private row(n: Note): HTMLElement {
    const inner = [icon(n.glyph, 'ic s'), h('span', null, n.text)]
    const row = n.field >= 0
      ? h('button', { class: `alert lv-${n.level}`, type: 'button', testid: 'alert', onclick: () => this.onGo(n.field) }, inner, h('span', { class: 'sr' }, '. Go there.'))
      : h('div', { class: `alert lv-${n.level}`, testid: 'notice' }, inner)
    row.dataset.id = n.id
    return row
  }
}

// ---------------------------------------------------------------- small shared pieces

// The one gauge: a track, a fill, and what it says to a screen reader.
export function gauge(value: number, o: { label: string; text?: string; cls?: string; mark?: number }): HTMLElement {
  const v = Math.max(0, Math.min(1, value))
  return h('span', {
    class: `gauge ${o.cls ?? ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v * 100),
    'aria-label': o.label, 'aria-valuetext': o.text ?? `${Math.round(v * 100)}%`,
  },
  h('i', { style: `width:${(v * 100).toFixed(1)}%` }),
  o.mark !== undefined ? h('b', { style: `left:${(Math.max(0, Math.min(1, o.mark)) * 100).toFixed(1)}%` }) : null)
}

export function btn(label: Child, onclick: () => void, o: { cls?: string; testid?: string; disabled?: boolean; aria?: string; k?: string; autofocus?: boolean } = {}): HTMLButtonElement {
  return h('button', {
    class: `btn ${o.cls ?? ''}`, type: 'button', testid: o.testid, disabled: o.disabled, 'aria-label': o.aria, k: o.k ?? o.testid, autofocus: o.autofocus,
    onclick: () => onclick(),
  }, label)
}
