// Everything made by hand, as the scene holds it: the farmstead that stands from the start, the buildings the farm
// raises (drawn as far along as the work is), what lies and stands about the yards, and the neighbours far off.
// The shapes are in farmstead.ts, sites.ts and yard.ts; this keeps them in step with the game.
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, ShaderMaterial, Vector3 } from 'three'
import { Builder, DUSK, LAMP_LUM, builtDepth, builtMaterial, type V3 } from './builder.ts'
import type { Env, Light } from './env.ts'
import { farmstead, type Marks } from './farmstead.ts'
import { UI_GAIN } from './fields.ts'
import { LAND, WIDE, YARD_AT, groundY, townRoadZ } from './layout.ts'
import { S, TRUE, useFrame } from './scale.ts'
import { SITES, type Site } from './small.ts'
import { smooth } from './noise.ts'
import type { Particles } from './particles.ts'
import { drawPlot, drawSite, type SiteLook, type SiteMarks } from './sites.ts'
import type { Snapshot } from './state.ts'
import { country, cupsShape, materials, passingCar, poles, roadTruck, standCar, vaneShape, yardLife } from './yard.ts'

// How much lamplight the hour calls for, set by the light's side of the scene (0 day .. about 1 a winter evening).
export const LAMP = { value: 0 }

export interface PropsFrame { dt: number; time: number; env: Env; lit: Light; dist: number; yard: number; particles: Particles }

interface Standing { key: string; mesh: Mesh | null; marks: SiteMarks | null }

export class Props {
  readonly group = new Group()
  // Where smoke leaves the kitchen chimney.
  readonly chimney = new Vector3()
  private mat = builtMaterial()
  private depth = builtDepth()
  private b = new Builder()
  private marks: Marks
  private fixed: Mesh[] = []
  private life: Mesh
  private sites: Standing = { key: 'none', mesh: null, marks: null }
  private piles: Standing = { key: '', mesh: null, marks: null }
  private parked: Standing = { key: '', mesh: null, marks: null }
  private plots: Record<number, Standing> = { [-1]: { key: '', mesh: null, marks: null }, [-2]: { key: '', mesh: null, marks: null } }
  private outline: Record<number, Mesh> = {}
  private outlineMat: ShaderMaterial
  private barnVane: Mesh
  private vane: Mesh
  private cups: Mesh
  private truck: Mesh
  private car: Mesh
  private smokes: V3[] = []
  private dufourSmoke = false
  private smokeAt = 0
  private dustAt = 0
  private tier: 'high' | 'medium' | 'low' = 'high'

  constructor() {
    const b = this.b
    this.marks = farmstead(b)
    this.fixed.push(b.mesh(this.mat, this.depth))
    yardLife(b)
    this.life = b.mesh(this.mat, this.depth)
    poles(b)
    const wires = b.mesh(this.mat, this.depth)
    wires.castShadow = false
    this.fixed.push(wires)
    country(b)
    const far = b.mesh(this.mat, this.depth)
    // seen from a long way off: their shadow is drawn in the wide cascade only
    far.layers.disable(1)
    far.layers.disable(3)
    far.userData.far = true
    far.frustumCulled = false
    this.fixed.push(far)
    this.group.add(...this.fixed, this.life)
    const c = this.marks.smoke[0]
    this.chimney.set(c[0], c[1], c[2])

    const small = (draw: () => void): Mesh => {
      useFrame(TRUE)
      draw()
      const m = b.mesh(this.mat, this.depth)
      m.layers.disable(1)
      m.layers.disable(2)
      this.group.add(m)
      return m
    }
    this.barnVane = small(() => vaneShape(b, 1.25))
    this.barnVane.position.set(...this.marks.vanes[0])
    this.vane = small(() => vaneShape(b, 0.7))
    this.cups = small(() => cupsShape(b))
    this.truck = small(() => roadTruck(b))
    this.car = small(() => passingCar(b))
    this.vane.visible = this.cups.visible = false

    // The selected yard: a line on the ground round it.
    this.outlineMat = new ShaderMaterial({
      uniforms: { uGain: UI_GAIN },
      transparent: true, depthWrite: false, side: DoubleSide,
      vertexShader: 'varying float vAlong; attribute float aAlong; void main() { vAlong = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uGain; varying float vAlong; void main() { float dash = smoothstep(0.0, 0.08, abs(fract(vAlong * 0.5) - 0.5) - 0.12); gl_FragColor = vec4(vec3(0.97, 0.9, 0.72) * uGain, 0.66 * dash); }',
    })
    for (const yard of [-1, -2]) {
      const y = YARD_AT[yard]
      const m = new Mesh(ribbon([[y.x0, y.z0], [y.x1, y.z0], [y.x1, y.z1], [y.x0, y.z1], [y.x0, y.z0]], 0.16 * S), this.outlineMat)
      m.renderOrder = 5
      m.visible = false
      this.outline[yard] = m
      this.group.add(m)
    }
  }

  private swap(slot: Standing, key: string, draw: (() => SiteMarks | null) | null): boolean {
    if (slot.key === key) return false
    slot.key = key
    if (slot.mesh) {
      this.group.remove(slot.mesh)
      slot.mesh.geometry.dispose()
      slot.mesh = null
    }
    slot.marks = draw ? draw() : null
    if (!this.b.empty) {
      slot.mesh = this.b.mesh(this.mat, this.depth)
      this.group.add(slot.mesh)
    }
    return true
  }

  // The game has changed: bring what is drawn in step with it.
  sync(snap: Snapshot): void {
    const farm = snap.farm, b = this.b
    const hired = snap.units.length > 1
    const packing = snap.mode === 'cellar' && snap.units.some(u => u.winter === 'pack')
    const free: Record<number, Site[]> = { [-1]: [], [-2]: [] }
    const looks: [Site, SiteLook][] = []
    let key = ''
    for (const s of SITES) {
      const bv = farm.buildings.find(q => q.kind === s.kind && q.yard === s.yard)
      if (!bv) { free[s.yard].push(s); key += '|'; continue }
      const look: SiteLook = {
        progress: bv.progress, built: bv.built, lived: s.kind === 'bunk' ? hired : s.kind === 'packing' ? packing : false,
        open: farm.standOpen, autumn: snap.day > 244 && snap.day < 320,
      }
      looks.push([s, look])
      key += bv.built ? `b${+look.lived}${s.kind === 'stand' ? `${+look.open}${+look.autumn}` : ''}|` : `p${Math.round(bv.progress * 48)}|`
    }
    // Every site in one mesh, drawn again when any of them moves on: a day's building at most.
    const changed = this.swap(this.sites, key, () => {
      const all: SiteMarks = { smoke: [], vane: null, cups: null }
      for (const [s, look] of looks) {
        const m = drawSite(b, s, look)
        all.smoke.push(...m.smoke)
        all.vane = m.vane ?? all.vane
        all.cups = m.cups ?? all.cups
      }
      return all
    })
    if (changed) {
      const m = this.sites.marks
      this.smokes = m ? m.smoke : []
      this.vane.visible = !!m?.vane
      this.cups.visible = !!m?.cups
      if (m?.vane) this.vane.position.set(...m.vane)
      if (m?.cups) this.cups.position.set(...m.cups)
    }
    for (const yard of [-1, -2]) {
      this.swap(this.plots[yard], free[yard].map(s => s.kind).join(), () => { for (const s of free[yard]) drawPlot(b, s); return null })
    }
    this.swap(this.piles, `${Math.min(99, Math.round(farm.logs))}|${Math.min(99, Math.round(farm.stone))}`, () => { materials(b, farm.logs, farm.stone); return null })
    this.swap(this.parked, farm.standOpen ? 'car' : '', () => { if (farm.standOpen) standCar(b); return null })
    this.dufourSmoke = farm.dufour
  }

  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.tier = tier
  }

  update(f: PropsFrame): void {
    // The share of windows lit follows how much lamplight the hour wants; a lit window is as bright whatever the exposure.
    const want = (LAMP.value * f.lit.exposure) / 0.6
    DUSK.value = smooth(0.1, 0.8, want)
    LAMP_LUM.value = 1.0 / Math.max(0.05, f.lit.exposure)
    // Small things go when the camera is far off or the machine is a slow one.
    this.life.visible = this.tier !== 'low' || f.dist < 60 * S
    for (const yard of [-1, -2]) {
      this.outline[yard].visible = f.yard === yard
      const p = this.plots[yard].mesh
      if (p) p.visible = f.yard === yard
    }
    // Vanes swing to the wind and hunt a little in it; the cups spin with its strength.
    const into = Math.PI - f.env.windDir
    const hunt = 0.16 * Math.sin(f.time * 0.9) + 0.07 * Math.sin(f.time * 2.3 + 1)
    this.barnVane.rotation.y = into + hunt * (0.4 + f.env.wind)
    this.vane.rotation.y = into + (0.1 * Math.sin(f.time * 1.3 + 2) + 0.05 * Math.sin(f.time * 3.1)) * (0.4 + f.env.wind)
    this.cups.rotation.y -= f.dt * (1.5 + 14 * f.env.wind)
    // Now and then something goes by on the town road: a truck with a load of barrels one way, a car the other.
    const cycle = 170, t = f.time % cycle
    this.drive(this.truck, t, 6, 96, 1, f)
    this.drive(this.car, t, 104, 150, -1, f)
    // Smoke: the bunkhouse stove whenever hands live there, the Dufour chimney on cold days when the place is the farm's.
    this.smokeAt += f.dt
    if (this.smokeAt > 0.22) {
      this.smokeAt = 0
      const cold = f.env.smoke
      // the cookstove, on days too warm for a fire to show much
      if (cold <= 0.2 && Math.random() < 0.6) f.particles.emit(this.chimney.x, this.chimney.y, this.chimney.z, (Math.random() - 0.5) * 0.13, 0.75, (Math.random() - 0.5) * 0.13, 0.15, 0.44, 3.2, 0.74, 0.74, 0.76, 0.1, 0.8)
      for (const p of this.smokes) f.particles.emit(p[0], p[1], p[2], (Math.random() - 0.5) * 0.18, 0.92, (Math.random() - 0.5) * 0.18, 0.2, 0.53, 3.6, 0.72, 0.72, 0.75, 0.16 + 0.2 * cold, 0.8)
      if (this.dufourSmoke && cold > 0.2) { const p = this.marks.smoke[1]; f.particles.emit(p[0], p[1], p[2], (Math.random() - 0.5) * 0.22, 1.1, (Math.random() - 0.5) * 0.22, 0.26, 0.66, 4.5, 0.74, 0.74, 0.76, 0.34 * cold, 0.8) }
    }
  }

  // One passage along the town road between two moments of the cycle; `dir` 1 goes south (+x).
  private drive(m: Mesh, t: number, from: number, to: number, dir: number, f: PropsFrame): void {
    const on = t >= from && t <= to
    m.visible = on
    if (!on) return
    const x0 = LAND.x0 - 500, x1 = LAND.x1 + 500, u = (t - from) / (to - from), x = dir > 0 ? x0 + (x1 - x0) * u : x1 - (x1 - x0) * u
    const z = townRoadZ(x) - dir * WIDE.town * 0.22, ahead = townRoadZ(x + dir * 4) - dir * WIDE.town * 0.22
    m.position.set(x, groundY(x, z) + 0.15, z)
    m.rotation.y = Math.atan2(-(ahead - z), dir * 4)
    this.dustAt += f.dt
    if (f.env.dry > 0.3 && this.dustAt > 0.12) {
      this.dustAt = 0
      f.particles.emit(x - dir * 2.6, m.position.y + 0.3, z, 0, 0.6, 0, 0.7, 2, 3.4, 0.62, 0.52, 0.4, 0.22 * f.env.dry, 0.5)
    }
  }

  dispose(): void {
    for (const m of [...this.fixed, this.life, this.barnVane, this.vane, this.cups, this.truck, this.car, ...Object.values(this.outline)]) m.geometry.dispose()
    for (const s of [this.sites, this.piles, this.parked, ...Object.values(this.plots)]) s.mesh?.geometry.dispose()
    this.mat.dispose()
    this.depth.dispose()
    this.outlineMat.dispose()
  }
}

// A flat strip laid on the ground along a line.
function ribbon(pts: [number, number][], width: number): BufferGeometry {
  const pos: number[] = [], along: number[] = [], idx: number[] = []
  let run = 0
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1]
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 1.5))
    const nx = -(bz - az) / len, nz = (bx - ax) / len
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n, y = groundY(x, z) + 0.2
      const o = pos.length / 3
      pos.push(x - nx * width / 2, y, z - nz * width / 2, x + nx * width / 2, y, z + nz * width / 2)
      along.push(run + (len * s) / n, run + (len * s) / n)
      if (s > 0) idx.push(o - 2, o - 1, o, o - 1, o + 1, o)
    }
    run += len
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1))
  g.setIndex(idx)
  return g
}
