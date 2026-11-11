// Integer-only randomness, so every JavaScript engine produces the same stream.

export interface RngHolder { rng: number }

export function nextUnit(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function nextInt(s: RngHolder, n: number): number {
  return Math.floor(nextUnit(s) * n)
}

export function hash32(a: number, b = 0, c = 0, d = 0): number {
  let h = 0x811c9dc5 ^ (a | 0)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h ^= b | 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= c | 0
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f)
  h ^= d | 0
  h = Math.imul(h ^ (h >>> 15), 0x165667b1)
  return (h ^ (h >>> 16)) >>> 0
}

// Stateless value in [0, 1): the same inputs always give the same answer, so views can ask without disturbing the game.
export function hashUnit(a: number, b = 0, c = 0, d = 0): number {
  return hash32(a, b, c, d) / 4294967296
}

// Roughly normal, mean 0 and standard deviation 1, from four uniforms.
export function hashNormal(a: number, b = 0, c = 0, d = 0): number {
  const s = hashUnit(a, b, c, d) + hashUnit(a, b, c, d + 7919) + hashUnit(a, b, c, d + 15838) + hashUnit(a, b, c, d + 23757)
  return (s - 2) * 1.7320508
}
