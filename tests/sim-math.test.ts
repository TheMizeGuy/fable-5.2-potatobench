// The simulation core must give the same answer in every engine: exact arithmetic only.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('../src/sim/', import.meta.url)
const files = readdirSync(dir).filter(f => f.endsWith('.ts'))

// Code without comments; string literals stay, since none of the forbidden names belong in one.
function code(name: string): string {
  return readFileSync(new URL(name, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('src/sim uses no inexact or nondeterministic math', () => {
  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  const forbidden: [string, RegExp][] = [
    ['Math.exp', /Math\.exp/], ['Math.log', /Math\.log/], ['Math.pow', /Math\.pow/],
    ['Math.sin', /Math\.a?sinh?\b/], ['Math.cos', /Math\.a?cosh?\b/], ['Math.tan', /Math\.a?tanh?\b|Math\.atan2/],
    ['Math.random', /Math\.random/], ['Date', /\bDate\b/], ['the ** operator', /\*\*/],
    ['performance.now', /performance\.now/], ['crypto', /\bcrypto\b/],
  ]
  for (const file of files) {
    const src = code(file)
    for (const [name, re] of forbidden) {
      it(`${file} does not use ${name}`, () => {
        expect(src.match(re)?.[0] ?? null).toBeNull()
      })
    }
    it(`${file} calls only exact Math functions`, () => {
      const allowed = new Set(['abs', 'ceil', 'floor', 'fround', 'imul', 'max', 'min', 'round', 'sign', 'sqrt', 'trunc'])
      const used = [...src.matchAll(/Math\.([A-Za-z0-9_]+)/g)].map(m => m[1])
      expect(used.filter(u => !allowed.has(u))).toEqual([])
    })
  }

  it('the checks catch what they are meant to', () => {
    const sample = 'const a = Math.exp(1) + Math.log10(2) + 2 ** 3 + Math.atan2(1, 1) + Date.now()'
    for (const [name, re] of forbidden.filter(([n]) => ['Math.exp', 'Math.log', 'the ** operator', 'Math.tan', 'Date'].includes(n))) {
      expect(re.test(sample), name).toBe(true)
    }
  })
})
