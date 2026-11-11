// The farmer's machine and the farmer: a small tractor with the implement for the job, and a figure on foot.
import {
  BoxGeometry, Color, CylinderGeometry, Group, LatheGeometry, Mesh, MeshLambertMaterial, Sprite, SpriteMaterial, SphereGeometry,
  Vector2, type BufferGeometry, type Material, type Texture,
} from 'three'
import type { JobKind } from '../sim/index.ts'

export type Implement = 'none' | 'planter' | 'hiller' | 'sprayer' | 'tank' | 'digger'

export function implementFor(kind: JobKind | 'travel'): Implement {
  switch (kind) {
    case 'plant': return 'planter'
    case 'hill': return 'hiller'
    case 'spray': case 'kill': return 'sprayer'
    case 'water': return 'tank'
    case 'dig': return 'digger'
    default: return 'none'
  }
}

export class Tractor {
  readonly group = new Group()
  readonly driver: Group
  private implements = new Map<Implement, Group>()
  private wheels: Mesh[] = []
  private spray: Sprite[] = []
  private sprayMat: SpriteMaterial[] = []
  private water: Sprite[] = []
  private chain: Mesh[] = []
  private disposables: { dispose(): void }[] = []
  private mats = new Map<string, Material>()
  current: Implement = 'none'

  constructor(puff: Texture) {
    const red = this.mat('#a4412c'), dark = this.mat('#2b2a27'), grey = this.mat('#5d5e5a'), cream = this.mat('#e7dfcc')
    const g = this.group
    // Body, facing +x.
    this.box(0.86, 0.3, 0.34, red, 0.18, 0.54, 0, g)
    this.box(0.2, 0.28, 0.36, this.mat('#3b3c39'), 0.66, 0.5, 0, g)
    this.box(0.62, 0.18, 0.22, grey, 0.22, 0.32, 0, g)
    this.box(0.36, 0.08, 0.92, red, -0.36, 0.66, 0, g)
    this.box(0.2, 0.12, 0.3, dark, -0.36, 0.74, 0, g)
    this.cyl(0.025, 0.025, 0.36, dark, 0.42, 0.86, 0, g)
    this.cyl(0.11, 0.11, 0.02, dark, -0.12, 0.88, 0, g, 0.5)
    for (const z of [-0.43, 0.43]) {
      this.wheels.push(this.cyl(0.33, 0.33, 0.17, dark, -0.36, 0.33, z, g, 0, true))
      this.cyl(0.14, 0.14, 0.18, cream, -0.36, 0.33, z, g, 0, true)
    }
    for (const z of [-0.2, 0.2]) {
      this.wheels.push(this.cyl(0.17, 0.17, 0.1, dark, 0.58, 0.17, z, g, 0, true))
      this.cyl(0.07, 0.07, 0.11, cream, 0.58, 0.17, z, g, 0, true)
    }
    this.driver = figure(this, '#3f5243', '#b9492e')
    this.driver.position.set(-0.4, 0.62, 0)
    this.driver.scale.setScalar(0.95)
    g.add(this.driver)

    // Implements, hitched behind.
    const green = this.mat('#5a6b49'), steel = this.mat('#7b7d78'), white = this.mat('#e9e5da'), blue = this.mat('#5f7383')
    const planter = new Group()
    this.box(0.12, 0.08, 1.1, steel, -0.8, 0.3, 0, planter)
    for (const z of [-0.3, 0.3]) {
      this.box(0.3, 0.32, 0.32, green, -0.92, 0.5, z, planter)
      this.box(0.34, 0.04, 0.36, green, -0.92, 0.68, z, planter)
      this.cyl(0.11, 0.11, 0.06, dark, -1.08, 0.11, z, planter, 0, true)
    }
    this.addImpl('planter', planter)
    const hiller = new Group()
    this.box(0.1, 0.1, 1.2, steel, -0.82, 0.32, 0, hiller)
    for (const z of [-0.5, -0.2, 0.2, 0.5]) {
      const d = this.cyl(0.14, 0.14, 0.02, grey, -0.9, 0.15, z, hiller, 0, true)
      d.rotation.y = z > 0 ? 0.35 : -0.35
      this.box(0.04, 0.2, 0.04, steel, -0.86, 0.25, z, hiller)
    }
    this.addImpl('hiller', hiller)
    const sprayer = new Group()
    const tank = this.cyl(0.22, 0.22, 0.62, white, -0.86, 0.5, 0, sprayer)
    tank.rotation.z = Math.PI / 2
    this.box(0.06, 0.06, 4.3, steel, -1.18, 0.5, 0, sprayer)
    for (let k = 0; k < 7; k++) {
      const s = new Sprite(new SpriteMaterial({ map: puff, color: 0xeef3f5, transparent: true, opacity: 0, depthWrite: false }))
      s.position.set(-1.25, 0.32, -1.9 + k * 0.63)
      s.scale.set(0.7, 0.45, 1)
      sprayer.add(s)
      this.spray.push(s)
      this.sprayMat.push(s.material)
      this.disposables.push(s.material)
    }
    this.addImpl('sprayer', sprayer)
    const tankTrailer = new Group()
    const tt = this.cyl(0.3, 0.3, 1.0, blue, -1.4, 0.55, 0, tankTrailer)
    tt.rotation.z = Math.PI / 2
    this.box(1.1, 0.06, 0.5, steel, -1.4, 0.24, 0, tankTrailer)
    for (const z of [-0.32, 0.32]) this.cyl(0.18, 0.18, 0.08, dark, -1.4, 0.18, z, tankTrailer, 0, true)
    this.cyl(0.03, 0.03, 0.4, steel, -1.4, 0.95, 0, tankTrailer)
    for (let k = 0; k < 12; k++) {
      const s = new Sprite(new SpriteMaterial({ map: puff, color: 0xdfe9ee, transparent: true, opacity: 0, depthWrite: false }))
      s.userData.k = k
      tankTrailer.add(s)
      this.water.push(s)
      this.disposables.push(s.material)
    }
    this.addImpl('tank', tankTrailer)
    const digger = new Group()
    const bed = new Group()
    this.box(1.25, 0.05, 0.86, steel, 0, 0, 0, bed)
    for (const z of [-0.45, 0.45]) this.box(1.3, 0.2, 0.05, red, 0, 0.08, z, bed)
    for (let k = 0; k < 8; k++) this.chain.push(this.box(0.04, 0.05, 0.84, dark, -0.55 + k * 0.16, 0.04, 0, bed))
    bed.position.set(-1.4, 0.32, 0)
    bed.rotation.z = 0.32
    digger.add(bed)
    this.box(0.12, 0.08, 1.0, steel, -0.78, 0.28, 0, digger)
    for (const z of [-0.5, 0.5]) this.cyl(0.2, 0.2, 0.08, dark, -1.75, 0.2, z, digger, 0, true)
    this.addImpl('digger', digger)
    this.setImplement('none')
  }

  mat(color: string): Material {
    let m = this.mats.get(color)
    if (!m) {
      m = new MeshLambertMaterial({ color })
      this.mats.set(color, m)
      this.disposables.push(m)
    }
    return m
  }

  box(w: number, h: number, d: number, m: Material, x: number, y: number, z: number, parent: Group): Mesh {
    const g = new BoxGeometry(w, h, d)
    this.disposables.push(g)
    const mesh = new Mesh(g, m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }

  cyl(r0: number, r1: number, h: number, m: Material, x: number, y: number, z: number, parent: Group, tilt = 0, sideways = false): Mesh {
    const g = new CylinderGeometry(r0, r1, h, 12)
    if (sideways) g.rotateX(Math.PI / 2)
    this.disposables.push(g)
    const mesh = new Mesh(g, m)
    mesh.position.set(x, y, z)
    mesh.rotation.z = tilt
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }

  track(g: BufferGeometry): void {
    this.disposables.push(g)
  }

  private addImpl(name: Implement, g: Group): void {
    this.implements.set(name, g)
    this.group.add(g)
  }

  setImplement(name: Implement): void {
    this.current = name
    for (const [k, g] of this.implements) g.visible = k === name
  }

  // Animate wheels, chain, spray and water. `working` is 0..1, how hard the implement is going.
  animate(time: number, travelled: number, working: number, kind: JobKind | 'travel', wind: Vector2): void {
    for (const w of this.wheels) w.rotation.z = -travelled / 0.3
    this.chain.forEach((c, k) => { c.position.x = -0.55 + ((k * 0.16 + time * 0.9) % 1.28) })
    const killTint = kind === 'kill' ? new Color('#d9d2b6') : new Color('#eef3f5')
    this.spray.forEach((s, k) => {
      this.sprayMat[k].opacity = working * (0.32 + 0.14 * Math.sin(time * 9 + k * 1.7))
      this.sprayMat[k].color.copy(killTint)
      s.position.y = 0.3 + 0.04 * Math.sin(time * 7 + k)
    })
    this.water.forEach(s => {
      const a = ((time * 0.8 + s.userData.k / 12) % 1)
      const reach = 3.2
      s.position.set(-1.4 + wind.x * a * 0.4, 1.15 + a * 1.4 - a * a * 2.4, a * reach)
      const sz = 0.18 + a * 0.5
      s.scale.set(sz, sz, 1)
      ;(s.material as SpriteMaterial).opacity = working * (1 - a) * 0.6
    })
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}

// A person: legs, coat, head and cap. Stands with feet at y = 0, about 0.62 tall, facing +x.
export function figure(owner: Tractor, coat: string, cap: string): Group {
  const g = new Group()
  const legs = owner.mat('#3d3a35'), body = owner.mat(coat), skin = owner.mat('#d2a98b'), hat = owner.mat(cap)
  const legL = owner.box(0.07, 0.26, 0.07, legs, 0, 0.13, -0.05, g)
  const legR = owner.box(0.07, 0.26, 0.07, legs, 0, 0.13, 0.05, g)
  owner.box(0.13, 0.24, 0.2, body, 0, 0.38, 0, g)
  const headGeo = new SphereGeometry(0.065, 10, 8)
  owner.track(headGeo)
  const head = new Mesh(headGeo, skin)
  head.position.set(0.01, 0.56, 0)
  head.castShadow = true
  g.add(head)
  const capGeo = new LatheGeometry([new Vector2(0, 0.0), new Vector2(0.075, 0.0), new Vector2(0.07, 0.035), new Vector2(0, 0.06)], 10)
  owner.track(capGeo)
  const capMesh = new Mesh(capGeo, hat)
  capMesh.position.set(0.01, 0.585, 0)
  g.add(capMesh)
  owner.box(0.06, 0.012, 0.1, hat, 0.07, 0.59, 0, g)
  g.userData.legs = [legL, legR]
  return g
}

// Swing a figure's legs for walking; phase in radians.
export function stride(g: Group, phase: number, amount: number): void {
  const [l, r] = g.userData.legs as Mesh[]
  l.rotation.z = Math.sin(phase) * 0.5 * amount
  r.rotation.z = -Math.sin(phase) * 0.5 * amount
}
