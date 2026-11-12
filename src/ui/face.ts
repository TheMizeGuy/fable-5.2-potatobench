// A person drawn small, in the colours their figure wears on the land, and their five skills as short bars.
import type { PersonLook } from '../game/looks.ts'
import type { Skill } from '../sim/index.ts'
import { h } from './dom.ts'
import { portrait } from './system/people.ts'

export const SKILL_SHORT: Record<Skill, string> = { machine: 'Machines', field: 'Field', woods: 'Woods', build: 'Building', pack: 'Packing' }
export const SKILL_ORDER: Skill[] = ['machine', 'field', 'woods', 'build', 'pack']

export function face(look: PersonLook, size = 36, cls = ''): SVGElement {
  return portrait(look, size, `face${cls ? ` ${cls}` : ''}`)
}

// Five short bars, the strongest skill marked. A screen reader hears the levels in words.
export function skillBars(skills: Record<Skill, number>, best?: Skill): HTMLElement {
  return h('ul', { class: 'skills', 'aria-label': SKILL_ORDER.map(k => `${SKILL_SHORT[k]} ${skills[k]}`).join(', ') },
    SKILL_ORDER.map(k => h('li', { class: k === best ? 'best' : '', 'aria-hidden': 'true' },
      h('span', { class: 'sk-name' }, SKILL_SHORT[k]),
      h('span', { class: 'sk-bar' }, h('i', { style: `width:${skills[k] * 10}%` })),
      h('span', { class: 'sk-n num' }, String(skills[k])))))
}
