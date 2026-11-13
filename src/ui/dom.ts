// Small DOM builders. Text always goes in as text nodes, never as markup.
import { weigh } from './system/weight.ts'

export type Child = Node | string | number | null | undefined | false | Child[]
type Value = string | number | boolean | null | undefined | ((e: Event) => void)
export type Attrs = Record<string, Value>

const SVG_NS = 'http://www.w3.org/2000/svg'

function append(el: Element, kids: Child[]): void {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue
    if (Array.isArray(k)) append(el, k)
    else if (k instanceof Node) el.append(k)
    else el.append(String(k))
  }
}

// Handlers live in a table on the element and one listener per event type looks them up, so a re-render
// can hand an element its new handlers without replacing the element under the pointer.
type Handlers = Record<string, EventListener>
const HANDLERS = new WeakMap<Element, Handlers>()

function listen(el: Element, type: string): void {
  el.addEventListener(type, e => HANDLERS.get(el)?.[type]?.(e))
}

function setHandler(el: Element, type: string, fn: EventListener): void {
  let table = HANDLERS.get(el)
  if (!table) { table = {}; HANDLERS.set(el, table) }
  if (!(type in table)) listen(el, type)
  table[type] = fn
}

function sameNode(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType !== 1) return true
  const x = a as HTMLElement, y = b as HTMLElement
  return x.nodeName === y.nodeName && x.namespaceURI === y.namespaceURI && x.nodeName !== 'CANVAS' &&
    (x.getAttribute('data-k') ?? '') === (y.getAttribute('data-k') ?? '')
}

function morphNode(old: Node, next: Node): void {
  if (old.nodeType !== 1) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue
    return
  }
  const a = old as HTMLElement, b = next as HTMLElement
  // A node marked data-keep is drawn once and then left alone, so an animation inside it is not restarted.
  if (a.hasAttribute('data-keep') && a.getAttribute('data-keep') === b.getAttribute('data-keep')) return
  for (const name of a.getAttributeNames()) if (!b.hasAttribute(name)) a.removeAttribute(name)
  for (const name of b.getAttributeNames()) {
    const v = b.getAttribute(name)!
    if (a.getAttribute(name) !== v) a.setAttribute(name, v)
  }
  const mine = HANDLERS.get(a), theirs = HANDLERS.get(b)
  if (mine) for (const type of Object.keys(mine)) if (!theirs || !(type in theirs)) mine[type] = () => {}
  if (theirs) for (const type of Object.keys(theirs)) setHandler(a, type, theirs[type])
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
    if (a.checked !== b.checked) a.checked = b.checked
    if (a !== document.activeElement && a.value !== b.value) a.value = b.value
  }
  morphChildren(a, b)
}

// Makes parent's children match those of next, reusing the nodes already on screen wherever they line up.
export function morphChildren(parent: Node, next: Node): void {
  const olds = [...parent.childNodes], news = [...next.childNodes]
  const n = Math.max(olds.length, news.length)
  for (let i = 0; i < n; i++) {
    const o = olds[i], w = news[i]
    if (!w) o.parentNode?.removeChild(o)
    else if (!o) parent.appendChild(w)
    else if (sameNode(o, w)) morphNode(o, w)
    else parent.replaceChild(w, o)
  }
}

function setAttrs(el: Element, attrs: Attrs | null | undefined): void {
  if (!attrs) return
  for (const [key, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (typeof v === 'function') { setHandler(el, key.slice(2), v as EventListener); continue }
    const name = key === 'testid' ? 'data-testid' : key === 'k' ? 'data-k' : key
    el.setAttribute(name, v === true ? '' : String(v))
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  setAttrs(el, attrs)
  if (el.dataset.testid && !el.dataset.k) el.dataset.k = el.dataset.testid
  // Every control says what its press costs (system/weight.ts); what is only read says nothing.
  if (tag === 'button' || (tag === 'a' && el.hasAttribute('href'))) weigh(el)
  append(el, kids)
  return el
}

export function s(tag: string, attrs?: Attrs | null, ...kids: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement
  setAttrs(el, attrs)
  append(el, kids)
  return el
}

export function kbd(key: string): HTMLElement {
  return h('kbd', null, key)
}
