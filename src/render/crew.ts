// The farm's crews as things in the world: a tractor with the implement for the job (the farmer's red one, and the
// second, an older grey one), and people on foot. Rounded where the real thing is rounded, so they read as machines and
// people rather than boxes.
import {
  BoxGeometry, CapsuleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial,
  RingGeometry, ShaderMaterial, Shape, SphereGeometry, TorusGeometry, Vector2, type BufferGeometry, type Material, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { JobKind } from '../sim/index.ts'
import { UI_GAIN } from './fields.ts'
import type { Particles } from './particles.ts'
import { SNOW_RIME, patch } from './shaders.ts'

export type Implement = 'none' | 'planter' | 'hiller' | 'sprayer' | 'tank' | 'flail' | 'digger'

export function implementFor(kind: JobKind | 'travel'): Implement {
  switch (kind) {
    case 'plant': return 'planter'
    case 'hill': return 'hiller'
    case 'spray': return 'sprayer'
    case 'kill': return 'flail'
    case 'water': return 'tank'
    case 'dig': return 'digger'
    default: return 'none'
  }
}

export class Kit {
  private mats = new Map<string, Material>()
  private disposables: { dispose(): void }[] = []

  mat(color: string, roughness = 0.7, metalness = 0): Material {
    const key = `${color}|${roughness}|${metalness}`
    let m = this.mats.get(key)
    if (!m) {
      m = patch(new MeshStandardMaterial({ color, roughness, metalness }), { key: 'county-machine', fragmentColor: SNOW_RIME.replace('uSnow', 'uSnow * 0.25') })
      this.mats.set(key, m)
      this.disposables.push(m)
    }
    return m
  }

  put(g: BufferGeometry, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
    this.disposables.push(g)
    const mesh = new Mesh(g, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.layers.enable(1)
    mesh.layers.enable(3)
    parent.add(mesh)
    return mesh
  }

  box(w: number, h: number, d: number, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
    return this.put(new BoxGeometry(w, h, d), m, x, y, z, parent)
  }

  // A box with its edges rounded over, extruded along x: a hood, a tank, a fender lip.
  rounded(w: number, h: number, d: number, r: number, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
    const s = new Shape()
    const hd = d / 2, hh = h / 2, rr = Math.min(r, hd, hh)
    s.moveTo(-hd + rr, -hh)
    s.lineTo(hd - rr, -hh)
    s.quadraticCurveTo(hd, -hh, hd, -hh + rr)
    s.lineTo(hd, hh - rr)
    s.quadraticCurveTo(hd, hh, hd - rr, hh)
    s.lineTo(-hd + rr, hh)
    s.quadraticCurveTo(-hd, hh, -hd, hh - rr)
    s.lineTo(-hd, -hh + rr)
    s.quadraticCurveTo(-hd, -hh, -hd + rr, -hh)
    const g = new ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: rr * 0.5, bevelSize: rr * 0.5, bevelSegments: 2, curveSegments: 4 })
    g.translate(0, 0, -w / 2)
    g.rotateY(Math.PI / 2)
    return this.put(g, m, x, y, z, parent)
  }

  // A cylinder along y, or across the machine (along z) when `across`.
  cyl(r0: number, r1: number, h: number, m: Material, x: number, y: number, z: number, parent: Group, across = false, sides = 14): Mesh {
    const g = new CylinderGeometry(r0, r1, h, sides)
    if (across) g.rotateX(Math.PI / 2)
    return this.put(g, m, x, y, z, parent)
  }

  ball(r: number, m: Material, x: number, y: number, z: number, parent: Group, sx = 1, sy = 1, sz = 1): Mesh {
    const mesh = this.put(new SphereGeometry(r, 12, 9), m, x, y, z, parent)
    mesh.scale.set(sx, sy, sz)
    return mesh
  }

  ring(r: number, tube: number, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
    return this.put(new TorusGeometry(r, tube, 6, 14), m, x, y, z, parent)
  }

  // A rubber tyre with a rounded shoulder and lugs, and a painted rim, turning about its axle (z).
  wheel(r: number, wide: number, lugs: number, rim: string, x: number, y: number, z: number, parent: Group): Group {
    const g = new Group()
    g.position.set(x, y, z)
    parent.add(g)
    const rubber = this.mat('#1f1f1d', 0.92), paint = this.mat(rim, 0.55)
    // the tyre's cross-section, turned about the axle
    const w = wide / 2, inner = r * 0.62
    const prof = [new Vector2(inner, -w), new Vector2(r - w * 0.5, -w), new Vector2(r, -w * 0.45), new Vector2(r, w * 0.45), new Vector2(r - w * 0.5, w), new Vector2(inner, w)]
    const tyre = new LatheGeometry(prof, 20)
    tyre.rotateX(Math.PI / 2)
    this.put(tyre, rubber, 0, 0, 0, g)
    const disc = new CylinderGeometry(inner * 1.02, inner * 1.02, wide * 0.7, 16)
    disc.rotateX(Math.PI / 2)
    this.put(disc, paint, 0, 0, 0, g)
    this.cyl(r * 0.18, r * 0.18, wide * 0.9, this.mat('#2a2a27', 0.6), 0, 0, 0, g, true, 8)
    for (let k = 0; k < lugs; k++) {
      const a = (k / lugs) * Math.PI * 2
      const lug = this.box(r * 0.16, r * 0.06, wide * 0.9, rubber, Math.cos(a) * r, Math.sin(a) * r, 0, g)
      lug.rotation.z = a + Math.PI / 2 + 0.35
    }
    return g
  }

  // Merges the still parts under a group into one mesh per material, leaving the groups under it (the parts that move)
  // and meshes marked to keep (moved one by one) as they are, so a machine is a few draws rather than a hundred.
  bake(g: Object3D): void {
    for (const c of [...g.children]) if (!(c as Mesh).isMesh) this.bake(c)
    const byMat = new Map<Material, Mesh[]>()
    for (const c of g.children) {
      const m = c as Mesh
      if (!m.isMesh || m.userData.keep || !(m.material as Material).isMaterial) continue
      const list = byMat.get(m.material as Material) ?? []
      list.push(m)
      byMat.set(m.material as Material, list)
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue
      const geos = list.map(m => {
        m.updateMatrix()
        const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
        return flat.applyMatrix4(m.matrix)
      })
      const merged = mergeGeometries(geos)
      for (const x of geos) x.dispose()
      if (!merged) continue
      const mesh = new Mesh(merged, mat)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.layers.mask = list[0].layers.mask
      for (const m of list) g.remove(m)
      g.add(mesh)
      this.disposables.push(merged)
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}

// A light ring on the ground under a unit, so it can be found from the strategic view; brighter on the picked crew.
export function unitRing(radius: number): Mesh {
  const g = new RingGeometry(radius * 0.78, radius, 48)
  g.rotateX(-Math.PI / 2)
  const mat = new ShaderMaterial({
    uniforms: { uGain: UI_GAIN, uLevel: { value: 0 }, uPick: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: 'varying vec2 vR; void main() { vR = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uGain; uniform float uLevel; uniform float uPick;
      varying vec2 vR;
      void main() {
        if (uLevel < 0.01) discard;
        vec3 col = mix(vec3(0.95, 0.9, 0.78), vec3(1.0, 0.8, 0.36), uPick);
        gl_FragColor = vec4(col * uGain, uLevel);
      }`,
  })
  const m = new Mesh(g, mat)
  m.renderOrder = 6
  m.position.y = 0.06
  return m
}

export interface Paint { body: string; trim: string; rim: string; seat: string }
export const RED: Paint = { body: '#b23a25', trim: '#2a2a27', rim: '#e2d8c0', seat: '#2a2a27' }
export const GREY: Paint = { body: '#8e918b', trim: '#9b3a26', rim: '#9b3a26', seat: '#3a3936' }

export class Tractor {
  readonly group = new Group()
  readonly body = new Group()
  readonly driver: Group
  readonly ring: Mesh
  private kit: Kit
  private implements = new Map<Implement, Group>()
  private rear: Group[] = []
  private front: Group[] = []
  private steer: Group[] = []
  private chain: Mesh[] = []
  private drum: Mesh | null = null
  private discs: Mesh[] = []
  private press: Group[] = []
  private puffAt = 0
  current: Implement = 'none'

  constructor(kit: Kit, paint: Paint = RED, coat = '#3f5243', cap = '#b9492e') {
    this.kit = kit
    const k = kit, g = this.body
    this.group.add(g)
    const body = k.mat(paint.body, 0.42), trim = k.mat(paint.trim, 0.6), dark = k.mat('#2a2a27', 0.8), iron = k.mat('#5c5d5a', 0.5, 0.6), steel = k.mat('#8b8d88', 0.45, 0.7)
    // Facing +x. Frame and engine block under a rounded hood, the grille in front, the fuel tank behind.
    k.box(1.0, 0.18, 0.24, iron, 0.22, 0.44, 0, g)
    k.box(0.5, 0.2, 0.26, trim, 0.2, 0.5, 0, g)
    k.rounded(0.82, 0.26, 0.34, 0.1, body, 0.3, 0.67, 0, g)
    k.rounded(0.08, 0.38, 0.33, 0.07, body, 0.74, 0.6, 0, g)
    k.box(0.02, 0.28, 0.24, dark, 0.785, 0.58, 0, g)
    for (let n = 0; n < 5; n++) k.box(0.025, 0.012, 0.25, k.mat('#6a6b66', 0.4, 0.6), 0.79, 0.47 + n * 0.05, 0, g)
    k.rounded(0.26, 0.2, 0.32, 0.08, body, -0.1, 0.74, 0, g)
    // the seat on its spring, the fenders over the big wheels, the step plates
    const pan = new LatheGeometry([new Vector2(0, 0), new Vector2(0.11, 0), new Vector2(0.13, 0.05), new Vector2(0.12, 0.06)], 12)
    k.put(pan, k.mat(paint.seat, 0.7), -0.44, 0.78, 0, g)
    k.box(0.03, 0.18, 0.2, k.mat(paint.seat, 0.7), -0.55, 0.88, 0, g)
    k.cyl(0.02, 0.02, 0.12, iron, -0.44, 0.72, 0, g)
    for (const z of [-0.36, 0.36]) {
      this.rear.push(k.wheel(0.37, 0.21, 16, paint.rim, -0.42, 0.37, z, g))
      const shell = new CylinderGeometry(0.43, 0.43, 0.24, 18, 1, true, Math.PI * 0.5, Math.PI * 0.95)
      shell.rotateX(Math.PI / 2)
      const shellMat = k.mat(paint.body, 0.43) as MeshStandardMaterial
      shellMat.side = DoubleSide
      k.put(shell, shellMat, -0.42, 0.37, z, g)
      k.box(0.3, 0.025, 0.14, iron, -0.06, 0.32, z * 0.75, g)
    }
    k.cyl(0.03, 0.03, 0.72, iron, -0.42, 0.37, 0, g, true, 8)
    k.box(0.06, 0.06, 0.62, iron, 0.62, 0.22, 0, g)
    // stack, air cleaner, steering column and wheel, headlights
    k.cyl(0.024, 0.028, 0.48, dark, 0.42, 1.0, 0.09, g, false, 8)
    k.cyl(0.034, 0.034, 0.02, dark, 0.42, 1.24, 0.09, g, false, 8)
    k.cyl(0.04, 0.04, 0.12, steel, 0.58, 0.86, -0.07, g, false, 10)
    const column = k.cyl(0.012, 0.012, 0.36, dark, -0.18, 0.88, 0, g)
    column.rotation.z = 0.75
    const rim = k.ring(0.1, 0.012, dark, -0.29, 1.0, 0, g)
    rim.rotation.set(0, Math.PI / 2, 0.8, 'YZX')
    for (const z of [-0.12, 0.12]) k.ball(0.036, k.mat('#e9e2c9', 0.3), 0.77, 0.74, z, g)
    for (const z of [-0.31, 0.31]) {
      const s = new Group()
      s.position.set(0.62, 0.2, z)
      g.add(s)
      this.steer.push(s)
      this.front.push(k.wheel(0.2, 0.1, 0, paint.rim, 0, 0, 0, s))
    }
    k.box(0.3, 0.05, 0.12, iron, -0.72, 0.3, 0, g)
    this.driver = figure(k, coat, cap, true)
    this.driver.position.set(-0.44, 0.78, 0)
    g.add(this.driver)
    this.ring = unitRing(1.5)
    this.group.add(this.ring)

    const green = k.mat('#4f6b46', 0.6), white = k.mat('#e9e5da', 0.5), blue = k.mat('#5f7383', 0.5)
    // Planter: four hoppers over four rows, each with its press wheel.
    const planter = new Group()
    k.box(0.1, 0.08, 1.46, steel, -0.86, 0.34, 0, planter)
    for (const z of [-0.51, -0.17, 0.17, 0.51]) {
      k.rounded(0.3, 0.3, 0.24, 0.05, green, -1.02, 0.56, z, planter)
      k.box(0.34, 0.03, 0.28, k.mat('#3c5335', 0.6), -1.02, 0.72, z, planter)
      k.box(0.05, 0.3, 0.04, iron, -1.0, 0.28, z, planter)
      const w = new Group()
      w.position.set(-1.24, 0.13, z)
      planter.add(w)
      k.cyl(0.13, 0.13, 0.06, dark, 0, 0, 0, w, true, 12)
      k.box(0.2, 0.03, 0.03, steel, 0, 0, 0.04, w)
      this.press.push(w)
      k.box(0.26, 0.04, 0.04, iron, -1.12, 0.22, z, planter)
    }
    this.addImpl('planter', planter)
    // Hiller: a toolbar carrying pairs of discs that throw the soil up to the row.
    const hiller = new Group()
    k.box(0.1, 0.1, 1.5, steel, -0.86, 0.4, 0, hiller)
    for (const z of [-0.68, -0.34, 0, 0.34, 0.68]) {
      k.box(0.04, 0.3, 0.04, iron, -0.92, 0.26, z, hiller)
      for (const s of [-1, 1]) {
        const d = k.cyl(0.15, 0.15, 0.015, steel, -1.0, 0.15, z + s * 0.07, hiller, true, 14)
        d.rotation.y = s * 0.5
        d.userData.keep = true
        this.discs.push(d)
      }
    }
    this.addImpl('hiller', hiller)
    // Sprayer: a tank across the back and a boom wide enough for eight rows.
    const sprayer = new Group()
    k.cyl(0.24, 0.24, 0.8, white, -0.92, 0.6, 0, sprayer, true, 16)
    k.box(0.3, 0.06, 0.5, iron, -0.9, 0.34, 0, sprayer)
    k.box(0.05, 0.05, 2.9, steel, -1.22, 0.56, 0, sprayer)
    for (let n = 0; n < 9; n++) k.box(0.03, 0.1, 0.03, dark, -1.22, 0.5, -1.36 + n * 0.34, sprayer)
    for (const s of [-1, 1]) { const stay = k.box(0.03, 0.03, 1.3, steel, -1.1, 0.7, s * 0.7, sprayer); stay.rotation.x = s * 0.2 }
    this.addImpl('sprayer', sprayer)
    // Water: a tank on its own wheels with a pump and a pipe that throws to both sides.
    const tank = new Group()
    const barrel = k.cyl(0.34, 0.34, 1.2, blue, -1.55, 0.66, 0, tank, false, 16)
    barrel.rotation.z = Math.PI / 2
    k.box(1.3, 0.06, 0.5, iron, -1.5, 0.3, 0, tank)
    k.box(0.5, 0.04, 0.06, iron, -0.9, 0.3, 0, tank)
    for (const z of [-0.36, 0.36]) k.wheel(0.2, 0.1, 0, '#8b8d88', -1.6, 0.2, z, tank)
    k.cyl(0.03, 0.03, 0.5, steel, -1.55, 1.2, 0, tank)
    k.box(0.05, 0.05, 1.5, steel, -1.55, 1.44, 0, tank)
    this.addImpl('tank', tank)
    // Vine killer: a flail under a hood, beating the tops down.
    const flail = new Group()
    k.rounded(0.6, 0.2, 1.46, 0.08, green, -1.08, 0.36, 0, flail)
    k.box(0.2, 0.12, 1.46, k.mat('#3c5335', 0.6), -1.42, 0.3, 0, flail)
    this.drum = k.cyl(0.11, 0.11, 1.38, dark, -1.1, 0.22, 0, flail, true, 8)
    this.drum.userData.keep = true
    k.box(0.4, 0.05, 0.08, iron, -0.82, 0.4, 0, flail)
    for (const z of [-0.78, 0.78]) k.cyl(0.12, 0.12, 0.06, dark, -1.4, 0.13, z, flail, true, 10)
    this.addImpl('flail', flail)
    // Digger: a share that lifts the row and a rattling chain that sifts the soil away and drops the crop behind.
    const digger = new Group()
    const bed = new Group()
    k.box(1.3, 0.04, 0.9, steel, 0, 0, 0, bed)
    for (const z of [-0.47, 0.47]) k.box(1.36, 0.22, 0.05, k.mat('#b23a25', 0.42), 0, 0.09, z, bed)
    for (let n = 0; n < 10; n++) { const c = k.box(0.03, 0.05, 0.88, dark, -0.6 + n * 0.13, 0.05, 0, bed); c.userData.keep = true; this.chain.push(c) }
    bed.position.set(-1.5, 0.36, 0)
    bed.rotation.z = 0.3
    digger.add(bed)
    k.box(0.5, 0.05, 0.08, iron, -0.84, 0.3, 0, digger)
    k.box(0.16, 0.03, 0.9, steel, -0.86, 0.1, 0, digger)
    for (const z of [-0.52, 0.52]) k.wheel(0.22, 0.09, 0, '#8b8d88', -1.9, 0.22, z, digger)
    this.addImpl('digger', digger)
    this.setImplement('none')
    k.bake(this.body)
  }

  private addImpl(name: Implement, g: Group): void {
    this.implements.set(name, g)
    this.body.add(g)
  }

  setImplement(name: Implement): void {
    this.current = name
    for (const [k, g] of this.implements) g.visible = k === name
  }

  // Turn the wheels, run the implement and leave what it leaves in the air.
  // travelled: distance covered so far; moved: this frame; turn: how hard it is steering (-1..1); working: 0..1.
  animate(dt: number, travelled: number, moved: number, turn: number, working: number, kind: JobKind | 'travel', dust: number, particles: Particles, still: boolean): void {
    for (const w of this.rear) w.rotation.z = -travelled / 0.37
    for (const w of this.front) w.rotation.z = -travelled / 0.2
    for (const s of this.steer) s.rotation.y = -turn * 0.5
    for (const w of this.press) w.rotation.z = -travelled / 0.13
    for (const d of this.discs) d.rotation.z = -travelled / 0.15
    this.chain.forEach((c, n) => { c.position.x = -0.6 + ((n * 0.13 + travelled * 0.9) % 1.3) })
    if (this.drum) this.drum.rotation.z = -travelled * 9
    // The engine shakes a little.
    this.body.position.y = still ? 0 : Math.sin(travelled * 31) * 0.004 * (moved > 0 ? 1 : 0)
    if (still) return
    this.puffAt += dt
    const s = this.group.scale.x
    const p = this.group.position, h = -this.group.rotation.y, cx = Math.cos(h), sx = Math.sin(h)
    const at = (bx: number, by: number, bz: number): [number, number, number] => [p.x + (cx * bx - sx * bz) * s, p.y + by * s, p.z + (sx * bx + cx * bz) * s]
    const speed = dt > 0 ? moved / dt : 0
    const every = 0.045
    while (this.puffAt > every) {
      this.puffAt -= every
      const r = Math.random
      if (speed > 0.3 || working > 0) {
        const [x, y, z] = at(0.42, 1.26, 0.09)
        if (r() < 0.5) particles.emit(x, y, z, 0, 0.9 + r() * 0.4, 0, 0.05 * s, 0.3 * s, 1.1 + r() * 0.6, 0.28, 0.28, 0.3, 0.3, 0.6)
      }
      // Dust off the rear wheels on dry ground, more at speed.
      if (dust > 0.05 && speed > 0.5) {
        for (const side of [-0.36, 0.36]) {
          if (r() > Math.min(1, dust * speed * 0.3)) continue
          const [x, y, z] = at(-0.7 - r() * 0.3, 0.12, side + (r() - 0.5) * 0.2)
          particles.emit(x, y, z, -cx * 0.3 + (r() - 0.5) * 0.3, 0.25 + r() * 0.3, -sx * 0.3 + (r() - 0.5) * 0.3, 0.16 * s, (0.5 + r() * 0.4) * s, 2.6 + r() * 2.2, 0.62, 0.5, 0.39, 0.4 * dust, 0.5)
        }
      }
      if (working <= 0) continue
      if (kind === 'spray') {
        for (let n = 0; n < 3; n++) {
          const [x, y, z] = at(-1.26, 0.44, (r() - 0.5) * 2.8)
          particles.emit(x, y, z, -cx * 0.2, -0.1, -sx * 0.2, 0.12, 0.34, 1.0 + r() * 0.8, 0.86, 0.9, 0.92, 0.3, 0.9)
        }
      } else if (kind === 'water') {
        for (const side of [-1, 1]) {
          const [x, y, z] = at(-1.55, 1.46, side * 0.8)
          particles.emit(x, y, z, -sx * side * (1.6 + r()), 0.5 + r() * 0.5, cx * side * (1.6 + r()), 0.1, 0.5, 1.3 + r() * 0.5, 0.8, 0.86, 0.9, 0.34, 0.5)
          particles.emit(x, y, z, -sx * side * (2.6 + r()), 0.2, cx * side * (2.6 + r()), 0.08, 0.34, 1.1, 0.8, 0.86, 0.9, 0.3, 0.3)
        }
      } else if (kind === 'kill') {
        const [x, y, z] = at(-1.5, 0.2, (r() - 0.5) * 1.3)
        particles.emit(x, y, z, -cx * (0.6 + r() * 0.6), 0.4 + r() * 0.5, -sx * (0.6 + r() * 0.6), 0.1, 0.24, 0.9 + r() * 0.5, 0.5, 0.52, 0.3, 0.42, 0.4)
      } else if (kind === 'dig' || kind === 'hill' || kind === 'plant') {
        if (r() < (kind === 'dig' ? 1 : 0.4)) {
          const [x, y, z] = at(kind === 'dig' ? -1.9 : -1.1, 0.16, (r() - 0.5) * 1.1)
          particles.emit(x, y, z, -cx * 0.3, 0.3 + r() * 0.3, -sx * 0.3, 0.12, 0.3, 1.2 + r(), 0.42, 0.31, 0.24, (kind === 'dig' ? 0.4 : 0.2) * (0.3 + 0.7 * dust), 0.3)
        }
      }
    }
  }
}

// A person: legs, coat, arms, head and a brimmed cap, in rounded pieces. Stands with feet at y = 0, about 0.64 tall,
// facing +x. `brim`: a wide-brimmed hat instead of a cap.
export function figure(k: Kit, coat: string, cap: string, seated = false, trousers = '#3d3a35', brim = false): Group {
  const g = new Group()
  const legs = k.mat(trousers, 0.9), body = k.mat(coat, 0.85), skin = k.mat('#d2a98b', 0.7), hat = k.mat(cap, 0.7), boot = k.mat('#2a2622', 0.9)
  const capsule = (r: number, len: number) => new CapsuleGeometry(r, len, 3, 8)
  const leg = (z: number) => {
    const hip = new Group()
    hip.position.set(0, 0.29, z)
    g.add(hip)
    k.put(capsule(0.036, 0.22), legs, 0, -0.14, 0, hip)
    k.box(0.11, 0.04, 0.07, boot, 0.025, -0.27, 0, hip)
    return hip
  }
  const arm = (z: number) => {
    const sh = new Group()
    sh.position.set(0, 0.5, z)
    g.add(sh)
    k.put(capsule(0.03, 0.18), body, 0, -0.11, 0, sh)
    k.ball(0.028, skin, 0, -0.235, 0, sh)
    return sh
  }
  const legL = leg(-0.048), legR = leg(0.048), armL = arm(-0.125), armR = arm(0.125)
  // the coat: a rounded trunk, broader at the shoulders
  const trunk = k.put(capsule(0.085, 0.13), body, 0, 0.41, 0, g)
  trunk.scale.set(0.82, 1, 1.18)
  k.ball(0.06, skin, 0.01, 0.585, 0, g, 0.95, 1.08, 0.95)
  if (brim) {
    k.cyl(0.11, 0.11, 0.012, hat, 0.005, 0.625, 0, g, false, 14)
    k.cyl(0.055, 0.064, 0.06, hat, 0.005, 0.655, 0, g, false, 12)
  } else {
    k.ball(0.064, hat, 0.005, 0.615, 0, g, 1, 0.62, 1)
    k.box(0.075, 0.012, 0.11, hat, 0.07, 0.608, 0, g)
  }
  if (seated) {
    legL.rotation.z = legR.rotation.z = 1.3
    armL.rotation.z = armR.rotation.z = 1.1
    g.position.y = -0.24
  }
  g.userData.limbs = [legL, legR, armL, armR]
  return g
}

// Swing a figure's legs and arms for walking; phase in radians.
export function stride(g: Group, phase: number, amount: number): void {
  const [legL, legR, armL, armR] = g.userData.limbs as Group[]
  const s = Math.sin(phase) * 0.55 * amount
  legL.rotation.z = s
  legR.rotation.z = -s
  armL.rotation.z = -s * 0.8
  armR.rotation.z = s * 0.8
}

// Bend to the fork: the stance of someone lifting a hill.
export function stoop(g: Group, amount: number): void {
  const [, , armL, armR] = g.userData.limbs as Group[]
  g.rotation.z = -0.5 * amount
  armL.rotation.z = armR.rotation.z = 0.9 * amount
}

export interface Dress { coat: string; cap: string; trousers: string; brim: boolean }
export const FARMER_DRESS: Dress = { coat: '#56604a', cap: '#b9492e', trousers: '#3d3a35', brim: false }
export const HAND_DRESS: Dress[] = [
  { coat: '#4a5f7a', cap: '#b49a6a', trousers: '#33373d', brim: true },
  { coat: '#8a3a32', cap: '#2f3a44', trousers: '#3d3a35', brim: false },
  { coat: '#c0a77a', cap: '#6b4e33', trousers: '#2f3830', brim: true },
  { coat: '#3f5c4c', cap: '#d8cfb8', trousers: '#4a4136', brim: false },
  { coat: '#7a5a8a', cap: '#3a3632', trousers: '#33373d', brim: true },
  { coat: '#5e6a73', cap: '#a0412c', trousers: '#3d3a35', brim: false },
]

// Someone on foot: the farmer off the tractor, or a field hand, with a fork for the jobs that want one.
export class Walker {
  readonly group = new Group()
  readonly figure: Group
  readonly fork: Group
  readonly ring: Mesh

  constructor(kit: Kit, dress: Dress) {
    this.figure = figure(kit, dress.coat, dress.cap, false, dress.trousers, dress.brim)
    this.figure.scale.setScalar(1.2)
    this.fork = new Group()
    kit.box(0.02, 0.56, 0.02, kit.mat('#8a7458', 0.8), 0, 0.28, 0, this.fork)
    for (const z of [-0.035, 0, 0.035]) kit.box(0.012, 0.16, 0.012, kit.mat('#8b8d88', 0.4, 0.7), 0, -0.06, z, this.fork)
    this.fork.position.set(0.16, 0.2, 0.1)
    this.fork.rotation.z = -0.35
    this.figure.add(this.fork)
    this.ring = unitRing(0.62)
    this.group.add(this.figure, this.ring)
    kit.bake(this.figure)
  }
}
