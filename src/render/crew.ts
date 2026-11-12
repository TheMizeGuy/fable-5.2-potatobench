// The people of the farm as figures: a body with joints (hips, knees, shoulders, elbows, a neck), dressed from the
// person's own look, posed for walking, driving and every kind of work, and drawn from the shared shapes (prims.ts).
// A figure stands with its feet at the origin, about 0.82 tall, facing +x; its right hand is on the +z side.
import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import { personLook } from '../game/looks.ts'
import type { Prims } from './prims.ts'

export interface Dress {
  shirt: Color
  sleeve: Color            // the forearm: the shirt, or skin where the sleeves are rolled
  trousers: Color
  hat: Color
  skin: Color
  hair: Color
  boots: Color
  bib: Color | null        // overalls over the shirt
  hatKind: 'cap' | 'brim' | 'none' | 'toque' | 'fedora'
  build: number            // 0.9 slight .. 1.1 heavy
  tall: number             // 1 grown; less for the children who pick
}

const TROUSERS = ['#3d3a35', '#2f3a4a', '#4a4136', '#33373d', '#54493a', '#2c3530']
const DENIM = new Color('#3f536e')
const BOOT = new Color('#2a2420')

function mix(id: number, salt: number): number {
  let h = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35)
  return (h ^ (h >>> 13)) >>> 0
}

const dresses = new Map<string, Dress>()

// What a person wears, from their look (src/game/looks.ts), which never changes; a coat and a wool cap in the cold.
export function dressFor(id: number, cold = false): Dress {
  const key = `${id}|${cold ? 1 : 0}`
  let d = dresses.get(key)
  if (d) return d
  const look = personLook(id)
  const shirt = new Color(look.shirt), skin = new Color(look.skin)
  const rolled = !cold && mix(id, 11) % 3 !== 0
  const bib = !cold && id !== 0 && mix(id, 12) % 3 === 0
  d = {
    shirt: cold ? shirt.clone().multiplyScalar(0.82) : shirt,
    sleeve: rolled ? skin : cold ? shirt.clone().multiplyScalar(0.82) : shirt,
    trousers: new Color(TROUSERS[mix(id, 13) % TROUSERS.length]),
    hat: new Color(look.hat), skin, hair: new Color(look.hair), boots: BOOT,
    bib: bib ? DENIM : null,
    hatKind: cold ? 'toque' : look.hatKind,
    build: look.build * (cold ? 1.08 : 1),
    tall: 0.96 + (mix(id, 14) % 9) / 100,
  }
  dresses.set(key, d)
  return d
}

// Someone who is not one of the farm's people: a picker, a neighbour, a buyer, a man asking for work.
export function dressOf(o: { shirt: string; trousers?: string; hat?: string; hatKind?: Dress['hatKind']; skin?: string; hair?: string; tall?: number; build?: number; bib?: boolean; rolled?: boolean }): Dress {
  const shirt = new Color(o.shirt), skin = new Color(o.skin ?? '#d9a47c')
  return {
    shirt, sleeve: o.rolled ? skin : shirt, trousers: new Color(o.trousers ?? '#3d3a35'), hat: new Color(o.hat ?? '#8c5a2b'), skin,
    hair: new Color(o.hair ?? '#5a3d24'), boots: BOOT, bib: o.bib ? DENIM : null, hatKind: o.hatKind ?? 'cap', build: o.build ?? 1, tall: o.tall ?? 1,
  }
}

export type Tool = '' | 'axe' | 'fork' | 'hammer' | 'hook' | 'pipe' | 'plank' | 'pole' | 'saw'
export type Held = '' | 'sack' | 'basket' | 'barrel' | 'stone' | 'bag' | 'tray' | 'sling' | 'brush'

const THIGH = 0.19, SHIN = 0.19, UPPER = 0.135, FORE = 0.135, TORSO = 0.225, SHOULDER = 0.105, HIPW = 0.05, ANKLE = 0.035
export const STAND_HIP = 0.445
// How tall a figure stands as modelled: hip, trunk, neck to the middle of the head, and the head's own half height.
export const FIGURE_TALL = STAND_HIP + TORSO + 0.088 + 0.066

// How a figure holds itself, in its own space. Feet and hands are places to reach; knees and elbows follow.
export class Pose {
  hip = new Vector3()
  lean = 0                 // the trunk bent forward, radians
  roll = 0                 // and to its right
  twist = 0                // and turned to its left
  nod = 0                  // the head bowed
  look = 0                 // and turned to its left
  footL = new Vector3()
  footR = new Vector3()
  gripL = false            // the hand reaches for handL; otherwise the arm hangs, swung forward by swingL
  gripR = false
  handL = new Vector3()
  handR = new Vector3()
  swingL = 0
  swingR = 0
  elbow = 0.3              // how far the elbows stand out
  knee = 0.12              // and the knees
  tool: Tool = ''
  toolA = new Vector3()    // the tool's grip end and its working end
  toolB = new Vector3()
  held: Held = ''
  size = 1                 // of what is held

  reset(): this {
    this.hip.set(0, STAND_HIP, 0)
    this.lean = this.roll = this.twist = this.nod = this.look = 0
    this.footL.set(0, ANKLE, -HIPW)
    this.footR.set(0, ANKLE, HIPW)
    this.gripL = this.gripR = false
    this.swingL = this.swingR = 0
    this.elbow = 0.3
    this.knee = 0.12
    this.tool = ''
    this.held = ''
    this.size = 1
    return this
  }
}

const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const span = (a: number, b: number, t: number) => clamp01((t - a) / (b - a))

// ---- Poses. `t` is a clock in seconds or a phase in radians; `tired` 0..1 slows and bows the figure.

// Standing: a little weight shifting and breathing. style: 0 arms down, 1 hands on hips, 2 arms folded, 3 a hand
// shading the eyes, 4 one hand in a pocket.
export function stand(p: Pose, t: number, tired = 0, style = 0): Pose {
  p.reset()
  const sway = Math.sin(t * 0.9)
  p.hip.y = STAND_HIP - 0.006 - 0.012 * tired + 0.002 * Math.sin(t * 1.7)
  p.hip.z = 0.008 * sway
  p.roll = 0.02 * sway
  p.lean = 0.03 + 0.16 * tired
  p.nod = 0.05 + 0.3 * tired
  p.look = 0.25 * Math.sin(t * 0.37 + style)
  p.footL.x = 0.01
  p.footR.x = -0.015
  if (style === 1) {
    p.gripL = p.gripR = true
    p.handL.set(0.03, STAND_HIP + 0.03, -0.1)
    p.handR.set(0.03, STAND_HIP + 0.03, 0.1)
    p.elbow = 1
  } else if (style === 2) {
    p.gripL = p.gripR = true
    p.handL.set(0.085, STAND_HIP + 0.115, 0.035)
    p.handR.set(0.09, STAND_HIP + 0.1, -0.035)
    p.elbow = 0.5
  } else if (style === 3) {
    p.gripR = true
    p.handR.set(0.075, STAND_HIP + 0.345, 0.045)
    p.elbow = 0.9
    p.nod = -0.08
  } else if (style === 4) {
    p.gripL = true
    p.handL.set(0.02, STAND_HIP - 0.02, -0.085)
  }
  return p
}

// Walking. amount 0..1 blends from standing; `load`: 0 arms free, 1 both hands carrying in front, 2 one hand up at
// the shoulder.
export function walk(p: Pose, phase: number, amount = 1, tired = 0, load = 0): Pose {
  p.reset()
  const a = amount, L = 0.115 * (1 - 0.35 * tired) * a
  const foot = (f: Vector3, ph: number, z: number) => {
    const s = Math.sin(ph), c = Math.cos(ph)
    f.set(L * c, ANKLE + Math.max(0, s) * 0.065 * a * (1 - 0.4 * tired), z)
  }
  foot(p.footL, phase, -HIPW * 0.9)
  foot(p.footR, phase + Math.PI, HIPW * 0.9)
  p.hip.y = STAND_HIP - 0.04 * a - 0.014 * tired + 0.007 * a * Math.cos(phase * 2)
  p.lean = 0.07 * a + 0.2 * tired + (load === 1 ? -0.1 : 0)
  p.nod = 0.28 * tired
  p.twist = 0.1 * a * Math.sin(phase)
  p.roll = 0.03 * a * Math.cos(phase)
  const arm = 0.55 * a * (1 - 0.5 * tired)
  p.swingL = -arm * Math.cos(phase)
  p.swingR = arm * Math.cos(phase)
  if (load === 1) {
    p.gripL = p.gripR = true
    p.handL.set(0.17, STAND_HIP + 0.06, -0.1)
    p.handR.set(0.17, STAND_HIP + 0.06, 0.1)
  } else if (load === 2) {
    p.gripR = true
    p.handR.set(0.08, STAND_HIP + 0.25, 0.11)
    p.swingL *= 0.6
  }
  return p
}

// Bent to the ground in front: picking, pulling, looking under a leaf. depth 0..1; `reach` swings the hands (radians).
export function stoop(p: Pose, depth: number, reach = 0, both = true): Pose {
  const d = ease(clamp01(depth))
  p.hip.set(-0.07 * d, STAND_HIP - 0.11 * d, 0)
  p.lean = 1.25 * d
  p.nod = -0.35 * d
  p.footL.set(0.04 * d, ANKLE, -HIPW - 0.03 * d)
  p.footR.set(-0.03 * d, ANKLE, HIPW + 0.03 * d)
  p.knee = 0.12 + 0.3 * d
  if (d > 0.25) {
    const k = span(0.25, 1, d)
    p.gripR = true
    p.handR.set(0.2 + 0.05 * Math.sin(reach), STAND_HIP + 0.02 - (STAND_HIP - 0.06) * k, 0.06 + 0.04 * Math.cos(reach))
    if (both) {
      p.gripL = true
      p.handL.set(0.19 - 0.05 * Math.sin(reach), STAND_HIP + 0.02 - (STAND_HIP - 0.07) * k, -0.07 - 0.03 * Math.cos(reach))
    }
  }
  return p
}

// Sitting. seat: the height of what is sat on (0 the ground).
export function sit(p: Pose, t: number, seat = 0, tired = 0): Pose {
  p.reset()
  const ground = seat < 0.05
  p.hip.set(0, seat + 0.075, 0)
  p.lean = ground ? 0.3 + 0.25 * tired : 0.08 + 0.3 * tired
  p.nod = 0.1 + 0.4 * tired + 0.03 * Math.sin(t * 0.8)
  p.look = 0.3 * Math.sin(t * 0.31)
  if (ground) {
    p.footL.set(0.25, ANKLE, -0.075)
    p.footR.set(0.29, ANKLE, 0.08)
    p.gripL = p.gripR = true
    p.handL.set(0.2, 0.275, -0.085)
    p.handR.set(0.22, 0.27, 0.09)
  } else {
    p.footL.set(0.2, ANKLE, -0.07)
    p.footR.set(0.21, ANKLE, 0.075)
    p.gripL = p.gripR = true
    p.handL.set(0.14, seat + 0.13, -0.07)
    p.handR.set(0.15, seat + 0.13, 0.075)
  }
  p.knee = 0.2
  return p
}

// At the wheel of a tractor or a truck: the seat is the figure's origin. steer -1..1.
export function drive(p: Pose, t: number, steer: number, bounce: number): Pose {
  p.reset()
  p.hip.set(0, 0.07 + bounce, 0)
  p.lean = 0.16
  p.nod = -0.05
  p.look = -steer * 0.35
  p.footL.set(0.26, -0.19, -0.09)
  p.footR.set(0.26, -0.19, 0.09)
  p.knee = 0.5
  const a = steer * 0.9
  p.gripL = p.gripR = true
  p.handL.set(0.215 + 0.01 * Math.sin(t), 0.225 + 0.07 * Math.sin(a), -0.075 * Math.cos(a))
  p.handR.set(0.215, 0.225 - 0.07 * Math.sin(a), 0.075 * Math.cos(a))
  p.elbow = 0.5
  return p
}

// A two-handed swing. k 0..1: back, then through to the stroke at k = 1. over: an overhand chop down in front (splitting,
// limbing, driving a stake); otherwise a flat swing from the right into what stands in front (felling, brush).
export function swing(p: Pose, k: number, over: boolean, low = 0.2): Pose {
  p.reset()
  const s = ease(clamp01(k))
  p.footL.set(0.07, ANKLE, -0.085)
  p.footR.set(-0.07, ANKLE, 0.085)
  p.hip.y = STAND_HIP - 0.035 - 0.03 * s
  p.gripL = p.gripR = true
  const u = AX1, g = AX2
  if (over) {
    const a = -0.9 + 2.75 * s           // the handle from behind the head round to the ground in front
    u.set(Math.sin(a), Math.cos(a), 0.05)
    g.set(0.07 + 0.12 * s, STAND_HIP + 0.28 - 0.25 * s, 0.03)
    p.lean = -0.12 + 0.75 * s
    p.nod = 0.1
  } else {
    const a = 2.3 - 2.35 * s            // the head from behind the right shoulder round to the front
    u.set(Math.cos(a), 0.34 - 0.5 * s - low * s, Math.sin(a)).normalize()
    g.set(0.09 + 0.07 * Math.cos(a), STAND_HIP + 0.1 - 0.1 * s - low * s * 0.5, 0.07 + 0.08 * Math.sin(a))
    p.twist = -0.75 + 1.0 * s
    p.lean = 0.12 + 0.3 * s + low * s
    p.roll = 0.1 - 0.1 * s
  }
  p.handR.copy(g)
  p.handL.copy(g).addScaledVector(u, 0.14 - 0.075 * s)
  p.toolA.copy(g).addScaledVector(u, -0.03)
  p.toolB.copy(g).addScaledVector(u, 0.34)
  p.elbow = 0.5
  return p
}

// One end of a crosscut saw: bent to a handle that runs out and back. x -1..1 along the cut; h: the handle's height.
export function sawing(p: Pose, x: number, h = 0.2): Pose {
  p.reset()
  p.footL.set(0.08, ANKLE, -0.1)
  p.footR.set(-0.1, ANKLE, 0.09)
  p.hip.set(-0.03 + 0.035 * x, STAND_HIP - 0.07, 0)
  p.lean = 0.62 + 0.14 * x
  p.nod = -0.25
  p.knee = 0.3
  p.gripL = p.gripR = true
  p.handR.set(0.25 + 0.09 * x, h + 0.025, 0.02)
  p.handL.set(0.25 + 0.09 * x, h - 0.03, -0.02)
  p.elbow = 0.35
  return p
}

// A fork set under a hill and levered back. k 0..1: carried, set, trodden in, lifted.
export function forking(p: Pose, k: number): Pose {
  p.reset()
  const set = ease(span(0, 0.35, k)), lift = ease(span(0.55, 1, k))
  p.footL.set(0.07, ANKLE + 0.05 * Math.sin(Math.PI * span(0.3, 0.55, k)), -0.07)
  p.footR.set(-0.06, ANKLE, 0.075)
  p.hip.y = STAND_HIP - 0.05 * set
  p.lean = 0.2 + 0.55 * set - 0.35 * lift
  p.nod = -0.1 * set
  p.gripL = p.gripR = true
  const tip = AX1.set(0.3, 0.3 - 0.36 * set + 0.2 * lift, 0)
  const top = AX2.set(0.1 + 0.07 * set - 0.12 * lift, STAND_HIP + 0.24 - 0.12 * set - 0.06 * lift, 0.03)
  p.toolA.copy(top)
  p.toolB.copy(tip)
  p.handR.copy(top).lerp(tip, 0.06)
  p.handL.copy(top).lerp(tip, 0.42)
  p.tool = 'fork'
  return p
}

// Hammering at something in front at height h. phase in radians: the right hand rises and comes down.
export function hammering(p: Pose, phase: number, h: number): Pose {
  p.reset()
  const up = Math.max(0, Math.sin(phase)), hit = Math.max(0, -Math.sin(phase))
  const crouch = clamp01((STAND_HIP + 0.1 - h) / 0.3)
  p.hip.set(-0.03 * crouch, STAND_HIP - 0.15 * crouch, 0)
  p.lean = 0.2 + 0.7 * crouch + 0.06 * hit
  p.footL.set(0.08, ANKLE, -0.075)
  p.footR.set(-0.07, ANKLE, 0.08)
  p.knee = 0.12 + 0.3 * crouch
  p.gripL = p.gripR = true
  p.handL.set(0.25, h + 0.01, -0.05)
  p.handR.set(0.2 - 0.07 * up, h + 0.06 + 0.2 * up, 0.07)
  p.toolA.copy(p.handR)
  p.toolB.set(0.26 - 0.05 * up, h + 0.03 + 0.3 * up, 0.045)
  p.tool = 'hammer'
  p.elbow = 0.6
  return p
}

// Lifting something from the ground in front and tossing or setting it to one side. k 0..1: down, up, away, back.
// Returns how far along the throw is (0 until it leaves the hands, then 0..1).
export function lifting(p: Pose, k: number, side = 1, high = 0): number {
  p.reset()
  const down = ease(span(0, 0.3, k)) * (1 - ease(span(0.36, 0.6, k)))
  const away = ease(span(0.6, 0.8, k)), back = ease(span(0.82, 1, k))
  stoop(p, down, 0)
  p.gripL = p.gripR = true
  const held = k > 0.24 && k < 0.8
  const y = 0.06 + (STAND_HIP - 0.02 + high * away) * (1 - down)
  const out = (away - back) * 0.14
  p.handR.set(0.2 - 0.04 * away + 0.02, y, 0.07 + side * out)
  p.handL.set(0.2 - 0.04 * away, y, -0.07 + side * out)
  p.twist = -side * 0.6 * (away - back)
  if (!held && k >= 0.8) { p.gripL = p.gripR = back < 0.5 }
  return k < 0.76 ? 0 : span(0.76, 1, k)
}

const AX1 = new Vector3(), AX2 = new Vector3()

// ---- Drawing.

const M = new Matrix4(), Q = new Quaternion(), HQ = new Quaternion(), Q2 = new Quaternion()
const TU = new Vector3(), TF = new Vector3(), TR = new Vector3(), HU = new Vector3(), HF = new Vector3(), HR = new Vector3()
const WU = new Vector3(), WF = new Vector3(), WR = new Vector3()
const hip = new Vector3(), neck = new Vector3(), head = new Vector3()
const sh = [new Vector3(), new Vector3()], el = [new Vector3(), new Vector3()], hand = [new Vector3(), new Vector3()]
const hj = [new Vector3(), new Vector3()], kn = [new Vector3(), new Vector3()], an = [new Vector3(), new Vector3()]
const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3(), pole = new Vector3()
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1)
const WOOD = new Color('#8a6f4c'), STEEL = new Color('#8b8d88'), IRON = new Color('#3a3b3a'), SACK = new Color('#b39a6b'), WICKER = new Color('#a98452')
const STONE = new Color('#8f8a80'), LEATHER = new Color('#5b3d27'), LINEN = new Color('#e6e1d4'), TUBER = new Color('#c9a878'), PALE = new Color('#d8c9a2')
const BRUSH = new Color('#4d5a34'), ALU = new Color('#b9bcc0'), EYE = new Color('#1d1612')

// The joint between `root` and `goal` of a limb with bones l1 and l2, bent toward `bend`. Returns the joint in `out`.
function joint(root: Vector3, goal: Vector3, l1: number, l2: number, bend: Vector3, out: Vector3): void {
  a.subVectors(goal, root)
  let dist = a.length()
  const max = (l1 + l2) * 0.999
  if (dist > max) { goal.copy(root).addScaledVector(a, max / dist); a.subVectors(goal, root); dist = max }
  if (dist < 1e-5) { out.copy(root).addScaledVector(bend, l1); return }
  a.multiplyScalar(1 / dist)
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  b.copy(bend).addScaledVector(a, -bend.dot(a))
  if (b.lengthSq() < 1e-8) b.set(0, 1, 0).addScaledVector(a, -a.y)
  b.normalize()
  out.copy(root).addScaledVector(a, along).addScaledVector(b, h)
}

export function figureMatrix(out: Matrix4, x: number, y: number, z: number, heading: number, scale: number): Matrix4 {
  return out.compose(a.set(x, y, z), Q2.setFromAxisAngle(Y, -heading), b.set(scale, scale, scale))
}

// Where the last figure drawn has its head and its hands, in the world.
export const drawn = { head: new Vector3(), handL: new Vector3(), handR: new Vector3(), chest: new Vector3(), toolB: new Vector3(), up: new Vector3(), fwd: new Vector3() }

// Draws one person. `at` places the figure's origin (the ground between the feet, or the seat) in the world.
export function drawFigure(pr: Prims, at: Matrix4, dress: Dress, p: Pose): void {
  const e = at.elements
  const scale = Math.hypot(e[0], e[1], e[2]) * dress.tall
  const k = dress.build, s = scale
  WF.set(e[0], e[1], e[2]).normalize()
  WU.set(e[4], e[5], e[6]).normalize()
  WR.set(e[8], e[9], e[10]).normalize()
  M.copy(at)
  if (dress.tall !== 1) M.scale(a.set(dress.tall, dress.tall, dress.tall))
  // the trunk and the head, in the figure's space
  Q.setFromAxisAngle(Y, p.twist).multiply(Q2.setFromAxisAngle(Z, -p.lean)).multiply(Q2.setFromAxisAngle(X, p.roll))
  TU.copy(Y).applyQuaternion(Q)
  TF.copy(X).applyQuaternion(Q)
  TR.copy(Z).applyQuaternion(Q)
  HQ.copy(Q).multiply(Q2.setFromAxisAngle(Z, -p.nod)).multiply(Q2.setFromAxisAngle(Y, p.look))
  HU.copy(Y).applyQuaternion(HQ)
  HF.copy(X).applyQuaternion(HQ)
  HR.copy(Z).applyQuaternion(HQ)
  hip.copy(p.hip)
  neck.copy(hip).addScaledVector(TU, TORSO)
  head.copy(neck).addScaledVector(HU, 0.088).addScaledVector(HF, 0.008)
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    sh[i].copy(hip).addScaledVector(TU, TORSO - 0.028).addScaledVector(TR, side * SHOULDER * k)
    // arms
    const grip = i === 0 ? p.gripL : p.gripR
    if (grip) hand[i].copy(i === 0 ? p.handL : p.handR)
    else {
      const sw = i === 0 ? p.swingL : p.swingR
      hand[i].copy(sh[i]).add(a.set(Math.sin(sw) * 0.255, -Math.cos(sw) * 0.255, side * 0.022))
    }
    pole.set(-0.5, -0.5, side * (0.25 + p.elbow))
    joint(sh[i], hand[i], UPPER, FORE, pole, el[i])
    // legs
    hj[i].copy(hip).add(a.set(0, -0.03, side * HIPW * k))
    an[i].copy(i === 0 ? p.footL : p.footR)
    pole.set(1, 0.25, side * p.knee)
    joint(hj[i], an[i], THIGH, SHIN, pole, kn[i])
  }
  // into the world
  const W = (v: Vector3) => v.applyMatrix4(M)
  const D = (v: Vector3) => v.transformDirection(M)
  W(hip); W(neck); W(head)
  for (let i = 0; i < 2; i++) { W(sh[i]); W(el[i]); W(hand[i]); W(hj[i]); W(kn[i]); W(an[i]) }
  D(TU); D(TF); D(TR); D(HU); D(HF); D(HR)
  drawn.head.copy(head).addScaledVector(HU, 0.07 * s)
  drawn.handL.copy(hand[0])
  drawn.handR.copy(hand[1])
  drawn.up.copy(TU)
  drawn.fwd.copy(TF)
  drawn.chest.copy(hip).addScaledVector(TU, TORSO * 0.7 * s)

  // legs: thigh, shin, knee, boot
  for (let i = 0; i < 2; i++) {
    pr.rod('taper', hj[i], kn[i], 0.046 * s * k, dress.trousers)
    pr.rod('taper', kn[i], an[i], 0.036 * s * k, dress.trousers)
    pr.put('ball', kn[i], WU, WF, 0.036 * s * k, 0.036 * s * k, 0.036 * s * k, dress.trousers)
    // the boot points the way the shin's plane faces, flat on the ground when the foot is down
    a.subVectors(an[i], kn[i])
    b.copy(WF).addScaledVector(a, -WF.dot(a) / Math.max(1e-6, a.lengthSq())).normalize()
    c.copy(an[i]).addScaledVector(WU, -ANKLE * s).addScaledVector(b, 0.022 * s)
    d.crossVectors(b, WR).multiplyScalar(-1)
    pr.put('box', c, d.lengthSq() > 0.5 ? d : WU, b, 0.115 * s, 0.05 * s, 0.062 * s * k, dress.boots)
  }
  // pelvis and trunk
  a.copy(hip).addScaledVector(TU, -0.032 * s)
  pr.put('ball', a, TU, TF, 0.05 * s * k, 0.05 * s, 0.088 * s * k, dress.trousers)
  a.copy(hip).addScaledVector(TU, -0.015 * s)
  pr.put('torso', a, TU, TF, 0.15 * s * k, (TORSO + 0.012) * s, 0.235 * s * k, dress.shirt)
  if (dress.bib) {
    a.copy(hip).addScaledVector(TU, 0.02 * s).addScaledVector(TF, 0.052 * s * k)
    pr.put('box', a, TU, TF, 0.045 * s * k, 0.15 * s, 0.13 * s * k, dress.bib)
    for (const side of [-1, 1]) {
      a.copy(hip).addScaledVector(TU, 0.16 * s).addScaledVector(TF, 0.012 * s).addScaledVector(TR, side * 0.05 * s * k)
      pr.put('box', a, TU, TF, 0.158 * s * k, 0.062 * s, 0.022 * s, dress.bib)
    }
  }
  // arms: shoulder, upper arm, elbow, forearm, hand
  for (let i = 0; i < 2; i++) {
    pr.put('ball', sh[i], TU, TF, 0.04 * s * k, 0.04 * s * k, 0.04 * s * k, dress.shirt)
    pr.rod('taper', sh[i], el[i], 0.036 * s * k, dress.shirt)
    pr.put('ball', el[i], TU, TF, 0.029 * s * k, 0.029 * s * k, 0.029 * s * k, dress.sleeve)
    pr.rod('taper', el[i], hand[i], 0.029 * s * k, dress.sleeve)
    pr.put('ball', hand[i], TU, TF, 0.03 * s, 0.03 * s, 0.03 * s, dress.skin)
  }
  // neck, head, hair, hat
  a.copy(neck).addScaledVector(TU, -0.01 * s)
  pr.put('cyl', a, HU, HF, 0.027 * s, 0.05 * s, 0.027 * s, dress.skin)
  pr.put('ball', head, HU, HF, 0.06 * s, 0.066 * s, 0.057 * s, dress.skin)
  a.copy(head).addScaledVector(HF, 0.052 * s).addScaledVector(HU, -0.008 * s)
  pr.put('ball', a, HU, HF, 0.016 * s, 0.014 * s, 0.013 * s, dress.skin)
  // eyes, and the brows' shadow over them
  for (const side of [-1, 1]) {
    a.copy(head).addScaledVector(HF, 0.05 * s).addScaledVector(HU, 0.012 * s).addScaledVector(HR, side * 0.022 * s)
    pr.put('ball', a, HU, HF, 0.0075 * s, 0.009 * s, 0.0085 * s, EYE)
  }
  // hair: over the back of the head and down to the collar
  b.copy(HU).addScaledVector(HF, -0.55).normalize()
  a.copy(head).addScaledVector(HF, -0.006 * s)
  pr.put('dome', a, b, HF, 0.064 * s, 0.07 * s, 0.062 * s, dress.hair)
  const kind = dress.hatKind
  if (kind === 'cap') {
    a.copy(head).addScaledVector(HU, 0.022 * s)
    pr.put('dome', a, HU, HF, 0.066 * s, 0.052 * s, 0.064 * s, dress.hat)
    a.addScaledVector(HF, 0.085 * s).addScaledVector(HU, -0.004 * s)
    pr.put('box', a, HU, HF, 0.075 * s, 0.012 * s, 0.1 * s, dress.hat)
  } else if (kind === 'brim' || kind === 'fedora') {
    const wide = kind === 'brim' ? 0.128 : 0.098
    a.copy(head).addScaledVector(HU, 0.034 * s)
    pr.put('cyl', a, HU, HF, wide * s, 0.012 * s, wide * s, dress.hat)
    pr.put('taper', a, HU, HF, 0.064 * s, 0.062 * s, 0.062 * s, dress.hat)
    a.addScaledVector(HU, 0.012 * s)
    pr.put('cyl', a, HU, HF, 0.0655 * s, 0.014 * s, 0.0635 * s, kind === 'brim' ? LEATHER : IRON)
  } else if (kind === 'toque') {
    a.copy(head).addScaledVector(HU, 0.006 * s)
    pr.put('dome', a, HU, HF, 0.067 * s, 0.075 * s, 0.065 * s, dress.hat)
    a.addScaledVector(HU, 0.074 * s)
    pr.put('ball', a, HU, HF, 0.02 * s, 0.02 * s, 0.02 * s, LINEN)
  }

  // what is in the hands
  if (p.tool) {
    a.copy(p.toolA).applyMatrix4(M)
    b.copy(p.toolB).applyMatrix4(M)
    drawn.toolB.copy(b)
    drawTool(pr, p.tool, a, b, s)
  }
  if (p.held) drawHeld(pr, p, s)
}

function drawTool(pr: Prims, tool: Tool, g: Vector3, tip: Vector3, s: number): void {
  c.subVectors(tip, g)
  const len = c.length()
  c.multiplyScalar(1 / Math.max(1e-6, len))
  switch (tool) {
    case 'axe':
      pr.rod('cyl', g, tip, 0.011 * s, WOOD)
      d.crossVectors(c, WU).normalize()
      a.copy(tip).addScaledVector(c, -0.035 * s).addScaledVector(WU, -0.0 * s)
      // the head lies across the handle, its bit toward the stroke
      b.crossVectors(d, c).normalize()
      pr.put('box', a, c, b, 0.1 * s, 0.045 * s, 0.018 * s, STEEL)
      break
    case 'hammer':
      pr.rod('cyl', g, tip, 0.009 * s, WOOD)
      d.crossVectors(c, WR).normalize()
      a.copy(tip).addScaledVector(d, -0.03 * s)
      pr.put('box', a, d, c, 0.024 * s, 0.06 * s, 0.024 * s, IRON)
      break
    case 'fork':
      pr.rod('cyl', g, tip, 0.011 * s, WOOD)
      d.crossVectors(c, WU)
      if (d.lengthSq() < 1e-4) d.copy(WR)
      d.normalize()
      a.copy(tip).addScaledVector(d, -0.04 * s)
      b.copy(tip).addScaledVector(d, 0.04 * s)
      pr.rod('cyl', a, b, 0.006 * s, STEEL)
      for (let n = -1; n <= 1; n++) {
        a.copy(tip).addScaledVector(d, n * 0.035 * s)
        b.copy(a).addScaledVector(c, 0.13 * s)
        pr.rod('cyl', a, b, 0.0055 * s, STEEL)
      }
      a.copy(g).addScaledVector(d, -0.03 * s)
      b.copy(g).addScaledVector(d, 0.03 * s)
      pr.rod('cyl', a, b, 0.009 * s, WOOD)
      break
    case 'hook':
      pr.rod('cyl', g, tip, 0.011 * s, WOOD)
      d.crossVectors(c, WU).normalize()
      b.crossVectors(d, c).normalize()
      a.copy(tip).addScaledVector(c, -0.02 * s)
      pr.put('box', a, c, b, 0.07 * s, 0.14 * s, 0.008 * s, STEEL)
      break
    case 'pole':
      pr.rod('cyl', g, tip, 0.012 * s, WOOD)
      break
    case 'pipe':
      pr.rod('cyl', g, tip, 0.02 * s, ALU)
      break
    case 'plank':
      d.crossVectors(c, WU).normalize()
      pr.put('box', g, c, d, 0.02 * s, len, 0.1 * s, PALE)
      break
    case 'saw':
      d.crossVectors(c, WU).normalize()
      b.crossVectors(d, c)
      pr.put('box', g, c, b, 0.07 * s, len, 0.006 * s, STEEL)
      break
  }
}

function drawHeld(pr: Prims, p: Pose, s: number): void {
  const L = drawn.handL, R = drawn.handR
  switch (p.held) {
    case 'sack':
      // over the shoulder, hanging down the back
      a.copy(drawn.chest).addScaledVector(drawn.fwd, -0.11 * s).addScaledVector(drawn.up, -0.03 * s)
      pr.put('ball', a, drawn.up, drawn.fwd, 0.075 * s * p.size, 0.12 * s * p.size, 0.09 * s * p.size, SACK)
      break
    case 'basket':
      a.copy(L).addScaledVector(WU, -0.1 * s)
      b.copy(WU).multiplyScalar(-1)
      pr.put('taper', a, WU, WF, 0.062 * s, 0.075 * s, 0.062 * s, WICKER)
      a.addScaledVector(WU, 0.06 * s)
      pr.put('cyl', a, WU, WF, 0.05 * s, 0.012 * s, 0.05 * s, TUBER)
      break
    case 'barrel':
      a.copy(L).add(R).multiplyScalar(0.5).addScaledVector(WU, -0.1 * s).addScaledVector(drawn.fwd, -0.02 * s)
      pr.put('barrel', a, WU, WF, 0.36 * s, 0.36 * s, 0.36 * s, WHITE)
      break
    case 'stone':
      a.copy(L).add(R).multiplyScalar(0.5).addScaledVector(WU, -0.02 * s)
      pr.put('ball', a, WU, WF, 0.07 * s * p.size, 0.055 * s * p.size, 0.062 * s * p.size, STONE)
      break
    case 'brush':
      a.copy(L).add(R).multiplyScalar(0.5)
      pr.put('ball', a, WU, WF, 0.16 * s * p.size, 0.1 * s * p.size, 0.13 * s * p.size, BRUSH)
      break
    case 'bag':
      a.copy(R).addScaledVector(WU, -0.13 * s)
      pr.put('box', a, WU, WF, 0.15 * s, 0.1 * s, 0.07 * s, LEATHER)
      break
    case 'tray':
      a.copy(L).add(R).multiplyScalar(0.5)
      pr.put('box', a, WU, WF, 0.14 * s, 0.022 * s, 0.2 * s, PALE)
      break
    case 'sling':
      a.copy(drawn.chest).addScaledVector(drawn.fwd, 0.06 * s).addScaledVector(drawn.up, -0.07 * s)
      pr.put('box', a, drawn.up, drawn.fwd, 0.05 * s, 0.075 * s, 0.17 * s, LINEN)
      break
  }
}

const WHITE = new Color(1, 1, 1)
export const COLORS = { WOOD, STEEL, IRON, SACK, WICKER, STONE, LEATHER, LINEN, TUBER, PALE, BRUSH, ALU, WHITE }
