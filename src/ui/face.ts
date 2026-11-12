// A person drawn small, in the colours their figure wears on the land, and their five skills as short bars.
import type { PersonLook } from '../game/looks.ts'
import type { Skill } from '../sim/index.ts'
import { h, s } from './dom.ts'

export const SKILL_SHORT: Record<Skill, string> = { machine: 'Machines', field: 'Field', woods: 'Woods', build: 'Building', pack: 'Packing' }
export const SKILL_ORDER: Skill[] = ['machine', 'field', 'woods', 'build', 'pack']

export function face(look: PersonLook, size = 36, cls = ''): SVGElement {
  const hat = look.hatKind === 'brim'
    ? [s('ellipse', { cx: 12, cy: 7.6, rx: 6.4, ry: 1.5, fill: look.hat }), s('path', { d: 'M8.7 7.6c0-2.3 1.5-3.8 3.3-3.8s3.3 1.5 3.3 3.8z', fill: look.hat })]
    : look.hatKind === 'cap'
      ? [s('path', { d: 'M7.9 8.2c0-2.6 1.8-4.2 4.1-4.2s4.1 1.6 4.1 4.2z', fill: look.hat }), s('path', { d: 'M15.4 7.6h3.4c.5 0 .6.6.1.8l-3.5.6z', fill: look.hat })]
      : []
  return s('svg', { class: `face ${cls}`, width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { class: 'face-ground', cx: 12, cy: 12, r: 11.5 }),
    s('path', { d: `M${12 - 7.4 * look.build} 23.6c0-4.6 3.3-7.8 ${7.4 * look.build}-7.8s${7.4 * look.build} 3.2 ${7.4 * look.build} 7.8z`, fill: look.shirt }),
    s('ellipse', { cx: 12, cy: 9.6, rx: 4.6, ry: 4.4, fill: look.hair }),
    s('circle', { cx: 12, cy: 11, r: 4.1, fill: look.skin }),
    hat)
}

// Five short bars, the strongest skill marked. A screen reader hears the levels in words.
export function skillBars(skills: Record<Skill, number>, best?: Skill): HTMLElement {
  return h('ul', { class: 'skills', 'aria-label': SKILL_ORDER.map(k => `${SKILL_SHORT[k]} ${skills[k]}`).join(', ') },
    SKILL_ORDER.map(k => h('li', { class: k === best ? 'best' : '', 'aria-hidden': 'true' },
      h('span', { class: 'sk-name' }, SKILL_SHORT[k]),
      h('span', { class: 'sk-bar' }, h('i', { style: `width:${skills[k] * 10}%` })),
      h('span', { class: 'sk-n num' }, String(skills[k])))))
}
