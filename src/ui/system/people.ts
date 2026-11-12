// People as the design system draws them: a portrait (design/portraits.svg, tinted in the colours their figure wears
// on the land) and a face pin that marks them on the land at one size whatever the camera does.
import { personLook, type PersonLook } from '../../game/looks.ts'
import { h, s } from '../dom.ts'

// Who: a person or applicant (anything with a name; the farmer's is 'You'), a name, or a look already worked out.
export type Who = { name: string } | string | PersonLook

function lookOf(who: Who): PersonLook {
  if (typeof who === 'string') return personLook(who)
  return 'cut' in who ? who : personLook(who.name)
}

export function lookStyle(look: PersonLook): string {
  return `--shirt:${look.shirt};--hat:${look.hat};--skin:${look.skin};--hair:${look.hair}`
}

// The ring that tells people on one farm apart: a colour from a fixed palette by the order they joined, the same on
// the pin, the time-book cell and the card. Looks are keyed on the name, so two people can share a shirt; never a ring.
export const RINGS = ['#b8402e', '#2f6f9f', '#d9a441', '#6b4c8a', '#e7e0cf', '#3f7d48', '#c4683a', '#5d8fa8', '#8a3a62', '#7d7a3a', '#3b3f45', '#e08f9a']

export function ringOf(order: number): string {
  return RINGS[((order % RINGS.length) + RINGS.length) % RINGS.length]
}

// A portrait. size in px; cls adds to 'bust'. It is a picture of someone already named beside it, so it is hidden from
// screen readers unless label is given.
export function portrait(who: Who, size = 46, cls = '', label?: string): SVGElement {
  const look = lookOf(who)
  return s('svg', {
    class: `bust${cls ? ` ${cls}` : ''}`, width: size, height: size, viewBox: '0 0 48 48', style: lookStyle(look),
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' }),
  }, s('use', { href: `#bust-${look.cut}` }))
}

// A portrait in its ring, as the time book and the cards show a person beside their pin.
export function ringed(who: Who, ring: string, size = 46, cls = ''): HTMLElement {
  return h('span', { class: `ringed${cls ? ` ${cls}` : ''}`, style: `--c:${ring}` }, portrait(who, size))
}

export type PinState = 'rest' | 'picked' | 'needs' | 'hurt'
const PIN_CLASS: Record<PinState, string> = { rest: '', picked: ' is-picked', needs: ' needs', hurt: ' is-hurt' }

// A person on the land. Place it with a transform on the element (its foot is at its own 0,0); never scale it.
// label: what a screen reader hears, such as 'Verna, worn out: needs you'. name: show the name tag (when picked).
// ring: the person's ring colour (ringOf); their shirt when not given. onclick: the pin is a button that picks them.
// count: a pin standing for several people together, with how many on its badge.
export function pin(who: { name: string } | string, state: PinState = 'rest', o: { label?: string; name?: boolean; testid?: string; ring?: string; onclick?: (e: Event) => void; count?: number; pressed?: boolean; onenter?: (e: Event) => void; onleave?: (e: Event) => void } = {}): HTMLElement {
  const look = lookOf(who)
  const name = typeof who === 'string' ? who : who.name
  const kids = [
    h('i', { class: 'foot' }), h('i', { class: 'stem' }),
    h('span', { class: 'head' }, portrait(look, 36)),
    o.count && o.count > 1 ? h('span', { class: 'badge count num', 'aria-hidden': 'true' }, String(o.count))
      : state === 'needs' || state === 'hurt' ? h('span', { class: 'badge', 'aria-hidden': 'true' }, state === 'hurt' ? '+' : '!') : null,
    o.name ? h('span', { class: 'name' }, name === 'You' ? 'You' : name.split(' ')[0]) : null,
  ]
  const cls = `pin sys${PIN_CLASS[state]}${o.count && o.count > 1 ? ' is-many' : ''}`
  const style = `--c:${o.ring ?? look.shirt}`
  // A pin that is a button is named by what it shows, its words for a screen reader after them.
  return o.onclick
    ? h('button', { class: cls, type: 'button', style, 'aria-pressed': o.pressed === undefined ? null : String(o.pressed), testid: o.testid, onclick: o.onclick, onpointerenter: o.onenter, onpointerleave: o.onleave }, kids, h('span', { class: 'sr' }, o.label ?? name))
    : h('span', { class: cls, style, role: 'img', 'aria-label': o.label ?? name, testid: o.testid }, kids)
}
