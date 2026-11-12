// The game's stylesheet, fonts and grain are the design system's, carried over by tools/ui/port.ts and not forked.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { personLook } from '../src/game/looks.ts'
import { FONTS, LICENCES, port } from '../tools/ui/port.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p))

describe('the design system in the game', () => {
  it('src/ui/system/system.css is design/system.css carried over', () => {
    expect(read('src', 'ui', 'system', 'system.css').toString()).toBe(port(read('design', 'system.css').toString()))
  })
  it('the fonts, their licences and the grain are the design folder’s own', () => {
    for (const f of [...FONTS, ...LICENCES]) expect(read('public', 'fonts', f).equals(read('design', 'fonts', f)), f).toBe(true)
    expect(read('src', 'ui', 'system', 'grain.png').equals(read('design', 'img', 'grain.png'))).toBe(true)
  })
  it('a person keeps their look from applicant to hand: it is keyed on the name', () => {
    expect(personLook('Normand Nadeau')).toEqual(personLook('Normand Nadeau'))
    expect(personLook('You')).toEqual(personLook(0))
    const cuts = new Set(['Lucien', 'Marie', 'Gerald', 'Theresa', 'Roland', 'Dot', 'Wendell', 'Aurele', 'Alcide Theriault', 'Verna Bubar'].map(n => personLook(n).cut))
    expect(cuts.size).toBeGreaterThan(2)
  })
})
