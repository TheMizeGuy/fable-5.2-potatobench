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

// A portrait. size in px; cls adds to 'bust'. It is a picture of someone already named beside it, so it is hidden from
// screen readers unless label is given.
export function portrait(who: Who, size = 46, cls = '', label?: string): SVGElement {
  const look = lookOf(who)
  return s('svg', {
    class: `bust${cls ? ` ${cls}` : ''}`, width: size, height: size, viewBox: '0 0 48 48', style: lookStyle(look),
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' }),
  }, s('use', { href: `#bust-${look.cut}` }))
}

export type PinState = 'rest' | 'picked' | 'needs' | 'hurt'
const PIN_CLASS: Record<PinState, string> = { rest: '', picked: ' is-picked', needs: ' needs', hurt: ' is-hurt' }

// A person on the land. Place it with a transform on the element (its foot is at its own 0,0); never scale it.
// label: what a screen reader hears, such as 'Verna, worn out: needs you'. name: show the name tag (when picked).
export function pin(who: { name: string } | string, state: PinState = 'rest', o: { label?: string; name?: boolean; testid?: string } = {}): HTMLElement {
  const look = lookOf(who)
  const name = typeof who === 'string' ? who : who.name
  return h('span', { class: `pin sys${PIN_CLASS[state]}`, style: `--c:${look.shirt}`, role: 'img', 'aria-label': o.label ?? name, testid: o.testid },
    h('i', { class: 'foot' }), h('i', { class: 'stem' }),
    h('span', { class: 'head' }, portrait(look, 36)),
    state === 'needs' || state === 'hurt' ? h('span', { class: 'badge', 'aria-hidden': 'true' }, state === 'hurt' ? '+' : '!') : null,
    o.name ? h('span', { class: 'name' }, name === 'You' ? 'You' : name.split(' ')[0]) : null)
}
