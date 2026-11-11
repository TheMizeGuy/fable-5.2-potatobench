// Small DOM builders. Text always goes in as text nodes, never as markup.
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

function setAttrs(el: Element, attrs: Attrs | null | undefined): void {
  if (!attrs) return
  for (const [key, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (typeof v === 'function') { el.addEventListener(key.slice(2), v as EventListener); continue }
    const name = key === 'testid' ? 'data-testid' : key === 'k' ? 'data-k' : key
    el.setAttribute(name, v === true ? '' : String(v))
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  setAttrs(el, attrs)
  if (el.dataset.testid && !el.dataset.k) el.dataset.k = el.dataset.testid
  append(el, kids)
  return el
}

export function s(tag: string, attrs?: Attrs | null, ...kids: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement
  setAttrs(el, attrs)
  append(el, kids)
  return el
}

// Line icons, drawn in ink on a 20 unit grid.
const ICONS: Record<string, string[]> = {
  clear: ['M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z', 'M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4'],
  cloud: ['M7 7.5a3 3 0 1 0 0 0.01M8.5 5.2a3 3 0 0 1 5.3 1.3', 'M5.5 15h9a2.8 2.8 0 0 0 0-5.6a4 4 0 0 0-7.6 1A2.3 2.3 0 0 0 5.5 15z'],
  overcast: ['M4.5 13.5h10a3 3 0 0 0 0-6a4.2 4.2 0 0 0-8 1.1a2.5 2.5 0 0 0-2 4.9z', 'M3 17h14'],
  rain: ['M4.5 11.5h10a3 3 0 0 0 0-6a4.2 4.2 0 0 0-8 1.1a2.5 2.5 0 0 0-2 4.9z', 'M6.5 14l-1 2.5M10 14l-1 2.5M13.5 14l-1 2.5'],
  storm: ['M4.5 10.5h10a3 3 0 0 0 0-6a4.2 4.2 0 0 0-8 1.1a2.5 2.5 0 0 0-2 4.9z', 'M10.5 11.5l-2 3h3l-2 3.5', 'M5.5 13l-1 2.5M15 13l-1 2.5'],
  fog: ['M3 7h14M5 10h12M3 13h11M6 16h10'],
  snow: ['M4.5 10.5h10a3 3 0 0 0 0-6a4.2 4.2 0 0 0-8 1.1a2.5 2.5 0 0 0-2 4.9z', 'M6.5 14v.1M10 15.5v.1M13.5 14v.1M8 17.5v.1M12 17.5v.1'],
  drop: ['M10 3c3 4 5 6.4 5 9a5 5 0 0 1-10 0c0-2.6 2-5 5-9z'],
  spot: ['M10 3.5c3.5 0 6.5 2.6 6.5 6.5S13.5 16.5 10 16.5 3.5 13.9 3.5 10 6.5 3.5 10 3.5z', 'M8 8.5h.1M11.5 7.5h.1M12 11.5h.1M8.5 12h.1'],
  shield: ['M10 2.5l6 2.2v4.6c0 4-2.7 6.7-6 8.2-3.3-1.5-6-4.2-6-8.2V4.7z'],
  list: ['M7 5.5h10M7 10h10M7 14.5h10', 'M3.5 5.5h.1M3.5 10h.1M3.5 14.5h.1'],
  pause: ['M7 4.5v11M13 4.5v11'],
  play: ['M6.5 4.5l9 5.5-9 5.5z'],
  menu: ['M3.5 5.5h13M3.5 10h13M3.5 14.5h13'],
  help: ['M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z', 'M7.6 7.7a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6', 'M10 14.3v.1'],
  close: ['M5 5l10 10M15 5L5 15'],
  up: ['M10 15.5V4.5M5.5 9l4.5-4.5L14.5 9'],
  down: ['M10 4.5v11M5.5 11l4.5 4.5 4.5-4.5'],
  frost: ['M10 2.5v15M3.5 6.2l13 7.6M3.5 13.8l13-7.6', 'M8 4l2 1.5L12 4M8 16l2-1.5 2 1.5'],
  warn: ['M10 3l7.5 13.5h-15z', 'M10 8v4M10 14.2v.1'],
  check: ['M4 10.5l4 4 8-9'],
  back: ['M12.5 4.5L7 10l5.5 5.5'],
  sprout: ['M10 17v-7', 'M10 10c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z', 'M10 12c0-3 2-5 5.5-5 0 3-2 5-5.5 5z'],
  coin: ['M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M12.3 7.2c-.5-.8-1.3-1.2-2.3-1.2-1.4 0-2.3.8-2.3 1.8 0 2.4 4.8 1.2 4.8 3.9 0 1.1-1 1.9-2.5 1.9-1.1 0-2-.5-2.5-1.3M10 4.8v1.2M10 13.6v1.6'],
  plant: ['M3 15.5h14', 'M6 15.5c0-1.4.9-2.4 2-2.4s2 1 2 2.4', 'M12 15.5c0-1.4.9-2.4 2-2.4s2 1 2 2.4', 'M10 11V6.5M10 6.5c-1.2-1.9-2.8-2.5-4.5-2.5.3 1.8 1.9 2.9 4.5 2.5zM10 7.5c1-1.5 2.4-2 4-2-.3 1.6-1.7 2.4-4 2z'],
  hill: ['M2 16c2.5 0 3-5 6-5s3.5 5 6 5 3-3 4-3', 'M8 11V7.5M8 7.5c-1-1.5-2.4-2-3.6-2 .3 1.5 1.5 2.2 3.6 2z'],
  scout: ['M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z', 'M10 7.6a2.4 2.4 0 1 0 0 4.8a2.4 2.4 0 1 0 0-4.8z'],
  spray: ['M4 6.5h6v3H4z', 'M10 8h3', 'M15 5.5v.1M16.5 8h.1M15 10.5v.1M17.5 6.5v.1M17.5 9.5v.1', 'M6.5 9.5v7'],
  water: ['M10 3c3 4 5 6.4 5 9a5 5 0 0 1-10 0c0-2.6 2-5 5-9z', 'M7.6 12.4a2.5 2.5 0 0 0 2 2.2'],
  rogue: ['M7 17V9.5M7 9.5c-1.4-2.4-3.3-3-4.5-3 .3 2 1.8 3.2 4.5 3z', 'M11.5 5.5l5 5M16.5 5.5l-5 5'],
  sample: ['M10 2.5v8', 'M7 10.5h6l-1 5.5H8z', 'M8 2.5h4'],
  kill: ['M5 16V8.5M5 8.5C3.8 6.6 2.5 6 1.5 6c.2 1.6 1.3 2.6 3.5 2.5z', 'M9 4l8 12M17 4L9 16'],
  dig: ['M3 15h14', 'M5.5 15V7l2-2.5h5L14.5 7v8', 'M8 9.5h4'],
}

export function icon(name: string, cls = 'ic'): SVGElement {
  const paths = ICONS[name] ?? ICONS.help
  return s('svg', { class: cls, viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
    paths.map(d => s('path', { d })))
}

export function clear(el: Element): void {
  el.replaceChildren()
}

export function kbd(key: string): HTMLElement {
  return h('kbd', { 'aria-hidden': 'true' }, key)
}
