import type { App } from '../game/app.ts'
import type { FieldView } from '../game/contracts.ts'
import type { Cmd, Estimate, Lot, Result } from '../sim/index.ts'
import { h, icon, type Child } from './dom.ts'
import { localize } from './fmt.ts'

export interface Ctx {
  app: App
  view: FieldView
  dialogs: Dialogs
  toast(text: string, level?: Level): void
  run(cmd: Cmd): Result
  phone(): boolean
  // What the grower knew a moment ago, for "before and after" displays.
  memo: { estimates: (Estimate | null)[]; soilT: number; digSoilT: Record<number, number>; lots: Record<number, Lot> }
  sheet: { tab: string; open: boolean }
  dirty(): void
}

export type Level = 'info' | 'good' | 'warn' | 'bad'

export interface Screen {
  el: HTMLElement
  update(): void
  insets(): [number, number, number, number]
  frame?(dt: number): void
  dispose?(): void
}

const keys = new WeakMap<Element, string>()

// Rebuilds a section only when what it shows has changed, keeping keyboard focus where it was.
export function patch(el: HTMLElement, key: string, render: () => Child): void {
  if (keys.get(el) === key) return
  keys.set(el, key)
  const active = document.activeElement as HTMLElement | null
  const fk = active && el.contains(active) ? active.dataset.k : undefined
  const scrolls = [...el.querySelectorAll<HTMLElement>('[data-scroll]')].map(x => [x.dataset.scroll, x.scrollTop] as const)
  const box = h('div', null, render())
  el.replaceChildren(...box.childNodes)
  for (const [name, top] of scrolls) {
    const x = el.querySelector<HTMLElement>(`[data-scroll="${name}"]`)
    if (x) x.scrollTop = top
  }
  if (fk) {
    const t = el.querySelector<HTMLElement>(`[data-k="${CSS.escape(fk)}"]`)
    if (t && !(t as HTMLButtonElement).disabled) t.focus({ preventScroll: true })
  }
}

export function forget(el: HTMLElement): void {
  keys.delete(el)
}

// ---------------------------------------------------------------- dialogs

export interface DialogSpec {
  title: string
  testid?: string
  cls?: string
  wide?: boolean
  body: (close: () => void) => Child
  // Actions that stay in view below the scrolling body.
  foot?: (close: () => void) => Child
  onClose?: () => void
  label?: string
}

interface Open { el: HTMLElement; back: HTMLElement | null; spec: DialogSpec }

let dialogSeq = 0

export class Dialogs {
  private stack: Open[] = []
  private queue: DialogSpec[] = []
  private layer: HTMLElement
  private shade: HTMLElement
  private covered: HTMLElement[]

  constructor(layer: HTMLElement, covered: HTMLElement[]) {
    this.layer = layer
    this.covered = covered
    this.shade = h('div', { class: 'shade', hidden: true })
    this.shade.addEventListener('click', () => this.closeTop())
    layer.append(this.shade)
    layer.addEventListener('keydown', e => this.trap(e))
  }

  isOpen(): boolean { return this.stack.length > 0 }
  pending(): number { return this.queue.length }

  open(spec: DialogSpec): () => void {
    const id = `dlg-${++dialogSeq}`
    const back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      this.remove(entry)
    }
    const el = h('section', {
      class: `dialog paper${spec.wide ? ' wide' : ''}${spec.cls ? ` ${spec.cls}` : ''}`,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, testid: spec.testid, tabindex: '-1',
    },
    h('header', { class: 'dialog-head' },
      h('h2', { id: `${id}-t` }, spec.title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': spec.label ?? 'Close', testid: 'dialog-close', onclick: close }, icon('close'))),
    h('div', { class: 'dialog-body', 'data-scroll': 'dialog' }, spec.body(close)),
    spec.foot ? h('div', { class: 'dialog-foot' }, spec.foot(close)) : null)
    const entry: Open = { el, back, spec }
    this.stack.push(entry)
    this.layer.append(el)
    this.sync()
    const first = el.querySelector<HTMLElement>('[autofocus]') ?? el.querySelector<HTMLElement>('.dialog-body button:not(:disabled), .dialog-body [href], .dialog-body input, .dialog-body select, .dialog-foot button')
    ;(first ?? el).focus({ preventScroll: true })
    return close
  }

  // Event-driven dialogs wait their turn behind whatever is open.
  enqueue(spec: DialogSpec): void {
    if (this.stack.length === 0) this.open(spec)
    else this.queue.push(spec)
  }

  closeTop(): void {
    const top = this.stack[this.stack.length - 1]
    if (top) this.remove(top)
  }

  closeAll(): void {
    this.queue = []
    while (this.stack.length) this.remove(this.stack[this.stack.length - 1])
  }

  private remove(entry: Open): void {
    const k = this.stack.indexOf(entry)
    if (k < 0) return
    this.stack.splice(k, 1)
    entry.el.remove()
    entry.spec.onClose?.()
    this.sync()
    if (this.stack.length === 0 && this.queue.length) {
      this.open(this.queue.shift()!)
      return
    }
    const top = this.stack[this.stack.length - 1]
    const target = entry.back && entry.back.isConnected ? entry.back : top ? top.el : null
    target?.focus({ preventScroll: true })
  }

  private sync(): void {
    const n = this.stack.length
    this.shade.hidden = n === 0
    for (const c of this.covered) c.inert = n > 0
    this.stack.forEach((d, i) => { d.el.inert = i < n - 1 })
    document.documentElement.classList.toggle('has-dialog', n > 0)
  }

  private trap(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return
    const top = this.stack[this.stack.length - 1]
    if (!top) return
    const items = [...top.el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(x => !(x as HTMLButtonElement).disabled && x.offsetParent !== null)
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === top.el)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

export function confirmDialog(ctx: Ctx, o: { title: string; text: Child; yes: string; no?: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    let answered = false
    ctx.dialogs.open({
      title: o.title,
      testid: 'confirm',
      body: () => h('div', { class: 'confirm-text' }, o.text),
      foot: close => [
        h('button', { class: 'btn', type: 'button', testid: 'confirm-cancel', autofocus: true, onclick: () => { answered = true; resolve(false); close() } }, o.no ?? 'Cancel'),
        h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, type: 'button', testid: 'confirm-ok', onclick: () => { answered = true; resolve(true); close() } }, o.yes),
      ],
      onClose: () => { if (!answered) resolve(false) },
    })
  })
}

// ---------------------------------------------------------------- toasts

export class Toasts {
  readonly el: HTMLElement
  constructor() {
    this.el = h('div', { class: 'toasts', 'aria-live': 'polite', 'aria-relevant': 'additions', role: 'status' })
  }

  show(text: string, level: Level = 'info'): void {
    const glyph = level === 'bad' ? 'spot' : level === 'warn' ? 'warn' : level === 'good' ? 'check' : null
    const t = h('div', { class: `toast ${level}` },
      glyph ? icon(glyph, `ic lv-${level}`) : null,
      h('span', null, localize(text)),
      h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Dismiss', onclick: () => t.remove() }, icon('close')))
    this.el.append(t)
    const keep = innerWidth <= 760 ? 2 : 3
    while (this.el.children.length > keep) this.el.firstElementChild?.remove()
    const ms = level === 'bad' ? 14000 : level === 'warn' ? 10000 : 6000
    let left = ms
    let last = performance.now()
    let hover = false
    t.addEventListener('pointerenter', () => { hover = true })
    t.addEventListener('pointerleave', () => { hover = false; last = performance.now() })
    const tick = () => {
      if (!t.isConnected) return
      const now = performance.now()
      if (!hover) left -= now - last
      last = now
      if (left <= 0) t.remove()
      else setTimeout(tick, 500)
    }
    setTimeout(tick, 500)
  }

  clear(): void {
    this.el.replaceChildren()
  }

  // Keeps the toasts over open land rather than over the panels.
  place(top: number, right: number, left: number): void {
    const free = innerWidth - left - right
    const w = Math.min(460, Math.max(260, free - 24))
    const x = free >= w ? left + free / 2 : innerWidth / 2
    this.el.style.left = `${Math.round(x)}px`
    this.el.style.width = `${Math.round(Math.min(w, innerWidth - 16))}px`
    this.el.style.top = `${Math.round(top + 8)}px`
  }
}

// ---------------------------------------------------------------- small shared pieces

export function meter(value: number, o: { label: string; cls?: string; text?: string }): HTMLElement {
  const v = Math.max(0, Math.min(1, value))
  return h('div', { class: `meter ${o.cls ?? ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v * 100), 'aria-label': o.label, 'aria-valuetext': o.text ?? `${Math.round(v * 100)}%` },
    h('span', { class: 'meter-fill', style: `width:${(v * 100).toFixed(1)}%` }))
}

export function stat(label: string, value: Child, extra?: Child): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), extra ? h('span', { class: 'sub' }, extra) : null)
}

export function btn(label: Child, onclick: () => void, o: { cls?: string; testid?: string; disabled?: boolean; aria?: string; k?: string; title?: string } = {}): HTMLButtonElement {
  return h('button', {
    class: `btn ${o.cls ?? ''}`, type: 'button', testid: o.testid, disabled: o.disabled, 'aria-label': o.aria, k: o.k ?? o.testid, title: o.title,
    onclick: () => onclick(),
  }, label)
}
