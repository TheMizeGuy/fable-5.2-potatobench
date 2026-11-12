// The animals of the place: the horse that skids logs and draws the stone boat, the neighbour's cows, a deer at the
// wood's edge, crows behind the digger. Each is put together from the shared shapes, like the people.
import { Color, Vector3 } from 'three'
import type { Prims } from './prims.ts'

export interface Beast {
  long: number             // shoulder to hip
  high: number             // the back's height
  deep: number             // the barrel's depth
  wide: number
  neck: number
  head: number
  leg: number              // how thick
  coat: Color
  point: Color             // mane, tail, lower legs
  face: Color
  horns: boolean
  collar: boolean          // a working horse in harness
  patches: number          // blotches of `point` on the barrel (a black and white cow)
}

export const HORSE: Beast = {
  long: 0.56, high: 0.66, deep: 0.3, wide: 0.24, neck: 0.3, head: 0.24, leg: 0.036,
  coat: new Color('#6b4630'), point: new Color('#2a1f18'), face: new Color('#5c3c29'), horns: false, collar: true, patches: 0,
}
export const GREY_HORSE: Beast = { ...HORSE, coat: new Color('#8f8a82'), point: new Color('#4a4743'), face: new Color('#8f8a82') }
export const COWS: Beast[] = [
  { long: 0.56, high: 0.5, deep: 0.3, wide: 0.26, neck: 0.2, head: 0.2, leg: 0.034, coat: new Color('#6e3b22'), point: new Color('#6e3b22'), face: new Color('#e9e2d2'), horns: true, collar: false, patches: 0 },
  { long: 0.56, high: 0.5, deep: 0.3, wide: 0.26, neck: 0.2, head: 0.2, leg: 0.034, coat: new Color('#e6e0d2'), point: new Color('#1d1b19'), face: new Color('#1d1b19'), horns: false, collar: false, patches: 3 },
  { long: 0.52, high: 0.47, deep: 0.28, wide: 0.24, neck: 0.2, head: 0.19, leg: 0.032, coat: new Color('#a9825a'), point: new Color('#5a4230'), face: new Color('#a9825a'), horns: true, collar: false, patches: 0 },
]
export const DEER: Beast = {
  long: 0.42, high: 0.46, deep: 0.19, wide: 0.14, neck: 0.25, head: 0.15, leg: 0.02,
  coat: new Color('#9a744c'), point: new Color('#e8e0cf'), face: new Color('#9a744c'), horns: false, collar: false, patches: 0,
}

const o = new Vector3(), F = new Vector3(), U = new Vector3(0, 1, 0), R = new Vector3()
const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3()
const LEATHER = new Color('#3a2a1e'), HOOF = new Color('#1c1815'), BLACK = new Color('#15161a')

// A four-legged animal standing at (x, y, z), facing `heading`. gait: 0 standing .. 1 walking; phase in radians;
// graze: 0 head up .. 1 down at the grass. Returns nothing; `withers` holds where a trace or a rein would be made fast.
export const withers = new Vector3()
export function drawBeast(pr: Prims, k: Beast, x: number, y: number, z: number, heading: number, s: number, phase: number, gait: number, graze: number): void {
  F.set(Math.cos(heading), 0, Math.sin(heading))
  R.set(-F.z, 0, F.x)
  const at = (fx: number, fy: number, fz: number, out: Vector3) => out.set(x + (F.x * fx + R.x * fz) * s, y + fy * s, z + (F.z * fx + R.z * fz) * s)
  const bob = 0.012 * gait * Math.sin(phase * 2)
  const top = k.high + bob, mid = top - k.deep / 2
  // barrel: chest, belly and rump
  at(k.long * 0.36, mid + 0.005, 0, a)
  pr.put('ball', a, U, F, k.deep * 0.52 * s, k.deep * 0.54 * s, k.wide * 0.5 * s, k.coat)
  at(0, mid - 0.01, 0, a)
  pr.put('ball', a, U, F, k.long * 0.64 * s, k.deep * 0.56 * s, k.wide * 0.57 * s, k.coat)
  at(-k.long * 0.36, mid + 0.012, 0, a)
  pr.put('ball', a, U, F, k.deep * 0.54 * s, k.deep * 0.55 * s, k.wide * 0.54 * s, k.coat)
  for (let n = 0; n < k.patches; n++) {
    at((n - 1) * k.long * 0.34, mid + 0.02 * (n % 2 ? 1 : -1), (n % 2 ? 1 : -1) * k.wide * 0.1, a)
    pr.put('ball', a, U, F, k.long * 0.2 * s, k.deep * 0.5 * s, k.wide * 0.56 * s, k.point)
  }
  // neck and head: up and looking about, or down to graze
  const lift = (1 - graze) * (0.95 + 0.06 * Math.sin(phase)) + graze * -0.75
  at(k.long / 2 + k.deep * 0.1, top - k.deep * 0.3, 0, a)
  at(k.long / 2 + k.deep * 0.1 + Math.cos(lift) * k.neck, top - k.deep * 0.3 + Math.sin(lift) * k.neck, 0, b)
  withers.copy(a).addScaledVector(U, k.deep * 0.3 * s)
  pr.rod('taper', a, b, k.deep * 0.3 * s, k.coat)
  if (k.collar) {
    c.copy(a).lerp(b, 0.22)
    d.subVectors(b, a).normalize()
    pr.put('cyl', c, d, R, k.deep * 0.39 * s, 0.05 * s, k.wide * 0.6 * s, LEATHER)
  }
  const nose = lift - 1.15 + 0.5 * graze
  at(k.long / 2 + k.deep * 0.1 + Math.cos(lift) * k.neck + Math.cos(nose) * k.head, top - k.deep * 0.3 + Math.sin(lift) * k.neck + Math.sin(nose) * k.head, 0, c)
  pr.put('ball', b, U, F, k.head * 0.36 * s, k.head * 0.36 * s, k.wide * 0.3 * s, k.coat)
  pr.rod('taper', b, c, k.head * 0.3 * s, k.face)
  // ears, and horns
  for (const sd of [-1, 1]) {
    d.copy(b).addScaledVector(R, sd * k.wide * 0.22 * s).addScaledVector(U, k.head * 0.26 * s)
    a.copy(d).addScaledVector(U, k.head * 0.34 * s).addScaledVector(R, sd * k.head * (k.horns ? 0.5 : 0.12) * s)
    pr.rod('taper', d, a, k.head * (k.horns ? 0.07 : 0.1) * s, k.horns ? k.face : k.coat)
  }
  // mane and tail
  if (k === HORSE || k === GREY_HORSE) {
    at(k.long / 2 + k.deep * 0.02, top - k.deep * 0.12, 0, a)
    d.copy(b).addScaledVector(F, -k.head * 0.25 * s).addScaledVector(U, k.head * 0.2 * s)
    pr.rod('cyl', a, d, 0.028 * s, k.point)
  }
  at(-k.long / 2 - k.deep * 0.5, top - k.deep * 0.2, 0, a)
  at(-k.long / 2 - k.deep * 0.62 - 0.03 * gait, top - k.deep * (k === DEER ? 0.5 : 1.2), 0.03 * Math.sin(phase * 1.3), b)
  pr.rod('taper', a, b, (k === DEER ? 0.03 : 0.026) * s, k.point)
  // legs: diagonal pairs go together
  const legs: [number, number, number][] = [[k.long / 2, 1, 0], [k.long / 2, -1, Math.PI], [-k.long / 2, 1, Math.PI], [-k.long / 2, -1, 0]]
  for (const [fx, sd, off] of legs) {
    const sw = Math.sin(phase + off) * 0.42 * gait, up2 = Math.max(0, Math.cos(phase + off)) * 0.07 * gait
    const hipY = mid - k.deep * 0.18, len = hipY
    at(fx, hipY, sd * k.wide * 0.33, a)
    at(fx + Math.sin(sw) * len * 0.5 + (fx < 0 ? -0.02 : 0.02), hipY - len * 0.52 + up2 * 0.5, sd * k.wide * 0.33, b)
    at(fx + Math.sin(sw) * len * 0.9 - up2 * 0.6, up2 + 0.02, sd * k.wide * 0.33, c)
    pr.rod('taper', a, b, k.leg * 1.5 * s, k.coat)
    pr.rod('taper', b, c, k.leg * s, k === DEER ? k.coat : k.point)
    pr.put('cyl', c.addScaledVector(U, -0.02 * s), U, F, k.leg * 1.25 * s, 0.03 * s, k.leg * 1.25 * s, HOOF)
  }
}

// A crow: on the ground pecking, or up on its wings. flap: 0 folded .. 1 flying; phase in radians.
export function drawCrow(pr: Prims, x: number, y: number, z: number, heading: number, s: number, flap: number, phase: number): void {
  F.set(Math.cos(heading), 0, Math.sin(heading))
  R.set(-F.z, 0, F.x)
  const peck = flap < 0.1 ? Math.max(0, Math.sin(phase * 0.7)) : 0
  o.set(x, y + (0.07 + 0.02 * flap) * s, z)
  d.copy(F).addScaledVector(U, 0.35 - 0.9 * peck).normalize()
  pr.put('ball', o, U, d, 0.085 * s, 0.045 * s, 0.045 * s, BLACK)
  a.copy(o).addScaledVector(d, 0.08 * s).addScaledVector(U, 0.02 * s)
  pr.put('ball', a, U, d, 0.036 * s, 0.03 * s, 0.03 * s, BLACK)
  b.copy(a).addScaledVector(d, 0.055 * s)
  pr.rod('cone', a, b, 0.012 * s, BLACK)
  a.copy(o).addScaledVector(d, -0.07 * s)
  b.copy(a).addScaledVector(d, -0.07 * s)
  pr.put('box', a, d.clone().multiplyScalar(-1), U, 0.008 * s, 0.07 * s, 0.05 * s, BLACK)
  if (flap > 0.05) {
    const w = Math.sin(phase * 3) * 0.9 * flap
    for (const sd of [-1, 1]) {
      c.copy(R).multiplyScalar(sd * Math.cos(w)).addScaledVector(U, Math.sin(w))
      pr.put('box', o, c, F, 0.075 * s, 0.17 * s * flap, 0.01 * s, BLACK)
    }
  }
}
