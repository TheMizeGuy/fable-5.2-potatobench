// The design system's components that have structure, built so they cannot be put together wrongly: each carries its
// classes (design/system.css), its words for a screen reader and its keyboard behaviour. Every root is marked .sys,
// which keeps the old stylesheets off it.
import { h, type Attrs, type Child } from '../dom.ts'
import { icon } from '../icons.ts'

type Click = (e: Event) => void
export type Ink = 'red' | 'ochre' | 'blue' | 'ink'

// A rubber stamp: only where the moment earns it (weighed, paid, a decision lapsing, an order on the list).
export function stamp(text: string, o: { ink?: 'ink' | 'red' | 'violet'; small?: boolean } = {}): HTMLElement {
  return h('span', { class: `stamp sys${o.small ? ' sm' : ''}${o.ink && o.ink !== 'ink' ? ` ${o.ink}` : ''}` }, text)
}

// A key on the keyboard, printed: 'S', '1', 'Space'.
export function key(k: string): HTMLElement {
  return h('span', { class: 'key', 'aria-hidden': 'true' }, k)
}

// The printer's fist: the one next thing.
export function fist(cls = ''): SVGElement {
  return icon('fist', `i fist${cls ? ` ${cls}` : ''}`)
}

// A need on the land, inked by kind: red blight or loss, ochre the suggested next order (ringed when it is the one
// next thing), blue water, ink other work due. Always its order's cut, never colour alone; label says it in words.
// attrs: more for the button (handlers, a title, a class), for a live screen.
export function need(o: { ink: Ink; icon: string; label: string; next?: boolean; testid?: string; onclick?: Click; attrs?: Attrs }): HTMLElement {
  const more = o.attrs ?? {}
  return h('button', {
    ...more, class: `need sys${o.ink === 'ink' ? '' : ` ${o.ink}`}${o.next ? ' is-next' : ''}${more.class ? ` ${more.class}` : ''}`, type: 'button', 'aria-label': o.label,
    title: more.title === undefined ? o.label : more.title, testid: o.testid, onclick: o.onclick,
  }, icon(o.icon))
}

// A field's tag on the land: stencilled name and stage, an order on its list, the need stamp beside it. Place the
// returned element with a transform; it is centred on its own 0,0. attrs: more for the tag's button; cls: more for
// its root ('is-land' for land to be had, quieter); said: the tag's words for a screen reader, after its name.
export function tag(o: {
  name: string; icon: string; selected?: boolean; listed?: { icon: string }; variety?: string; need?: HTMLElement | null
  testid?: string; label?: string; onclick?: Click; attrs?: Attrs; cls?: string; said?: string
}): HTMLElement {
  const more = o.attrs ?? {}
  return h('div', { class: `tag-at sys${o.selected ? ' is-sel' : ''}${o.cls ? ` ${o.cls}` : ''}` },
    h('button', {
      ...more, class: `tag${more.class ? ` ${more.class}` : ''}`, type: 'button', testid: o.testid, 'aria-pressed': String(!!o.selected),
      'aria-label': o.said ? null : o.label ?? o.name, onclick: o.onclick,
    },
    h('i', { class: 'eyelet' }), icon(o.icon, 'i'), h('span', { class: 'nm' }, o.name),
    o.variety ? h('span', { class: 'var' }, o.variety) : null,
    o.listed ? h('span', { class: 'listed' }, icon(o.listed.icon, 'i'), stamp('On the list', { small: true })) : null,
    o.said ? h('span', { class: 'sr' }, `. ${o.said}`) : null),
    o.need ?? null)
}

// An order on a command bar: a real button with its key, its cost and its catch. suggested: filled, with the fist.
// given: on the list (pencil, stamped). The key also works from the keyboard anywhere on the screen; that is the
// screen's to wire, this says so to assistive technology.
// refused: the catch turns red and says why (MOTION.md: a refused order shakes nothing). key may be '' (no key);
// icon may be '' (a building chosen by its number). attrs: more for the button.
export function order(o: {
  key: string; icon: string; name: Child; cost?: string; catch: Child; suggested?: boolean; given?: boolean; refused?: boolean
  testid?: string; title?: string; onclick?: Click; disabled?: boolean; attrs?: Attrs; said?: string
}): HTMLElement {
  const more = o.attrs ?? {}
  return h('button', {
    ...more, class: `order sys${o.suggested ? ' is-suggested' : ''}${o.given ? ' is-given' : ''}${o.refused ? ' is-refused' : ''}${o.icon ? '' : ' no-icon'}${more.class ? ` ${more.class}` : ''}`,
    type: 'button', testid: o.testid, title: o.title, 'aria-keyshortcuts': o.key || null, disabled: o.disabled, onclick: o.onclick,
  },
  o.suggested ? fist() : null,
  o.key ? key(o.key) : h('span', { class: 'key blank', 'aria-hidden': 'true' }), o.icon ? icon(o.icon, 'i') : null,
  h('span', { class: 'name' }, o.name),
  o.given ? stamp('On the list', { small: true }) : o.cost ? h('span', { class: 'cost num' }, o.cost) : h('span'),
  h('span', { class: 'catch' }, o.catch),
  o.said ? h('span', { class: 'sr' }, `. ${o.said}`) : null,
  o.suggested ? h('span', { class: 'sr' }, '. Suggested now.') : null)
}

// A fold of a sheet (the spring catalogue): a button that opens its part, with what it holds in a few words.
export function fold(o: { icon: string; name: string; state?: string; figure?: string; open: boolean; controls?: string; testid?: string; onclick?: Click }): HTMLElement {
  return h('button', { class: `fold sys${o.open ? ' open' : ''}`, type: 'button', 'aria-expanded': String(o.open), 'aria-controls': o.controls, testid: o.testid, onclick: o.onclick },
    icon(o.icon, 'i'), h('b', null, o.name),
    o.state ? h('span', { class: 'quiet it' }, o.state) : null,
    h('span', { style: 'flex:1' }),
    o.figure ? h('span', { class: 'num' }, o.figure) : null,
    h('span', { class: 'chev', 'aria-hidden': 'true' }, o.open ? '⌄' : '›'))
}

// A way to take something (the weigh ticket's three): a tear-off coupon with its own button line and key.
// best: the one that brings most, tabbed and filled.
export function coupon(o: { icon: string; label: string; amount: Child; does: string; take: string; key: string; best?: boolean; testid?: string; onclick?: Click }): HTMLElement {
  return h('button', { class: `way sys${o.best ? ' is-best' : ''}`, type: 'button', testid: o.testid, 'aria-keyshortcuts': o.key, onclick: o.onclick },
    o.best ? h('span', { class: 'brings' }, fist(), 'Brings most') : null,
    h('span', { class: 't-label' }, icon(o.icon, 'i'), o.label),
    h('span', { class: 'amount num' }, o.amount),
    h('span', { class: 'does' }, o.does),
    h('span', { class: 'take' }, h('span', null, o.take), key(o.key)))
}

// A meter: a ruled scale filled in ink, or in the ink of its warning. half: a tick at the middle (hilled once of two).
export function meter(value: number, o: { label: string; text?: string; kind?: 'warn' | 'bad' | 'wet'; half?: boolean } ): HTMLElement {
  const v = Math.max(0, Math.min(1, value))
  return h('span', {
    class: `meter${o.kind ? ` ${o.kind}` : ''}${o.half ? ' half' : ''}`, role: 'meter', 'aria-label': o.label,
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v * 100), 'aria-valuetext': o.text,
  }, h('i', { style: `width:${(v * 100).toFixed(1)}%` }))
}

// A range: hatched between its ends, a violet mark where something came out, a rule where something was promised.
// lo, hi, mark and promise are on the same scale as max. label says the whole of it in words.
export function range(o: { lo: number; hi: number; max: number; mark?: number; promise?: number; label: string; cls?: string }): HTMLElement {
  const x = (v: number) => `${(Math.max(0, Math.min(1, v / o.max)) * 100).toFixed(1)}%`
  return h('span', { class: `range${o.cls ? ` ${o.cls}` : ''}`, role: 'img', 'aria-label': o.label },
    h('span', { class: 'band', style: `left:${x(o.lo)};width:calc(${x(o.hi)} - ${x(o.lo)})` }),
    o.promise !== undefined ? h('span', { class: 'promise', style: `left:${x(o.promise)}` }) : null,
    o.mark !== undefined ? h('span', { class: 'mark', style: `left:${x(o.mark)}` }) : null)
}

// A skill in ten boxes: the levels inked, the next filled in pencil as far as the work has gone.
export function tens(level: number, progress = 0, o: { best?: boolean; label?: string } = {}): HTMLElement {
  return h('span', { class: `tens${o.best ? ' best' : ''}`, style: `--lv:${level};--xp:${progress.toFixed(2)}`, role: 'img', 'aria-label': o.label ?? `${level} of 10` })
}

// A slip from the order book: an alert. bad: a red rule down its edge.
export function slip(text: Child, o: { icon: string; kind?: 'bad' | 'water'; testid?: string; onclick?: Click } ): HTMLElement {
  const kids = [icon(o.icon), h('span', null, text)]
  return o.onclick
    ? h('button', { class: `alert sys${o.kind ? ` ${o.kind}` : ''}`, type: 'button', testid: o.testid, onclick: o.onclick }, kids)
    : h('p', { class: `alert sys${o.kind ? ` ${o.kind}` : ''}`, testid: o.testid }, kids)
}

// A tooltip: a slip with a pointer. Give it an id and point aria-describedby at it.
export function tip(id: string, ...kids: Child[]): HTMLElement {
  return h('div', { class: 'tip sys', role: 'tooltip', id }, kids)
}
