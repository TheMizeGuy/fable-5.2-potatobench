// The scene's scale (docs/SCALE.md). One ground unit is one metre for everything.
// The simulation knows the land by its own plan coordinates (src/sim/farm.ts); the scene puts a plan point K metres
// out for each plan unit. What is made or grown was first drawn at about 0.45 of true size and is brought up by S.

// (A build or a tool may set it from outside, as VITE_K, to try another size of land.)
const given = Number((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_K ?? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_K)
// The land factor: plan units to metres. Meant to work from 8 to 12 by changing this one number.
export const K = given >= 4 && given <= 16 ? given : 10
// Relief: the farm's own slope grows by this, so the land rolls without becoming a hillside.
export const KV = Math.sqrt(K)
// Made and grown things, from the size they were first drawn at to true size.
export const S = 2.2

export const land = (v: number): number => v * K

// A frame for things drawn in the small units they were first authored in: a small point p stands in the world at
// frame + S * p. `TRUE` is the plain one (small units times S).
export interface Frame { x: number; z: number }
export const TRUE: Frame = { x: 0, z: 0 }
// The frame the builders are drawing in now.
export const NOW: Frame = { x: 0, z: 0 }
export function useFrame(f: Frame): void {
  NOW.x = f.x
  NOW.z = f.z
}
// An island: a yard drawn at true size round an anchor (given in plan units) that sits where the land puts it.
export function island(px: number, pz: number): Frame {
  return { x: (K - S) * px, z: (K - S) * pz }
}
export function toWorld(f: Frame, x: number, z: number): { x: number; z: number } {
  return { x: f.x + S * x, z: f.z + S * z }
}
export function toSmall(f: Frame, x: number, z: number): { x: number; z: number } {
  return { x: (x - f.x) / S, z: (z - f.z) / S }
}
