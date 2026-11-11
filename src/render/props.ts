// Woods, the farmhouse, the potato house, the bridge, chimney smoke.
import {
  BoxGeometry, Color, CylinderGeometry, DynamicDrawUsage, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, Quaternion, Shape, Sprite, SpriteMaterial, Vector3, type Material, type Texture,
} from 'three'
import { birchCrownGeometry, birchTrunkGeometry, spruceGeometry } from './geometry.ts'
import { BLOCK, BROOK_Z, HOUSE, POTATO_HOUSE, groundY, roadDist } from './layout.ts'
import { rng } from './noise.ts'
import { SNOW_RIME, SNOW_RIME_TREE, patch, sway } from './shaders.ts'
import { boardsTexture, puffTexture, shingleTexture } from './textures.ts'

interface Tree { x: number; z: number; s: number; r: number; shrub?: boolean }

export class Props {
  readonly group = new Group()
  private crowns: InstancedMesh
  private crownSpots: Tree[] = []
  private crownKey = -1
  private smoke: Sprite[] = []
  private smokeMat: SpriteMaterial[] = []
  private chimney = new Vector3()
  private disposables: { dispose(): void }[] = []

  constructor() {
    const r = rng(2024)
    const spruce: Tree[] = [], birch: Tree[] = []
    const clear = (x: number, z: number) => roadDist(x, z) > 1.3 && Math.hypot(x - POTATO_HOUSE.x, z - POTATO_HOUSE.z) > 4.2
    for (let z = BLOCK.z0 + 0.5; z < -15.4; z += 1.05) {
      for (let x = BLOCK.x0 + 0.4; x < BLOCK.x1 - 0.3; x += 1.1) {
        const jx = x + (r() - 0.5) * 0.9, jz = z + (r() - 0.5) * 0.8
        if (!clear(jx, jz) || r() < 0.12) continue
        const front = jz > -17 ? 0.75 : 1
        if (jz > -16.2 && r() < 0.45) birch.push({ x: jx, z: jz, s: 2.4 + r() * 1.0, r: r() })
        else spruce.push({ x: jx, z: jz, s: (2.6 + r() * 1.9) * front, r: r() })
      }
    }
    for (let z = -14.5; z < 15.5; z += 1.6 + r() * 1.4) {
      const x = -13.6 - r() * 1.1
      if (r() < 0.6) birch.push({ x, z, s: 2.0 + r() * 1.1, r: r() })
      else spruce.push({ x, z, s: 1.8 + r() * 1.4, r: r() })
    }
    for (let x = BLOCK.x0 + 0.6; x < BLOCK.x1 - 0.5; x += 1.3 + r() * 1.6) {
      if (roadDist(x, 16.1) < 1.5) continue
      birch.push({ x: x + (r() - 0.5), z: 16.2 + r() * 0.2, s: 0.9 + r() * 0.5, r: r(), shrub: true })
      if (r() < 0.5) birch.push({ x: x + r(), z: 18.7 + r() * 0.5, s: 1.0 + r() * 1.4, r: r(), shrub: r() < 0.6 })
    }
    for (let k = 0; k < 6; k++) spruce.push({ x: 20 + r() * 3, z: 6 + k * 1.6 + r(), s: 2 + r() * 1.3, r: r() })
    for (let k = 0; k < 4; k++) birch.push({ x: 21.5 + r() * 1.5, z: 9 + k * 2 + r(), s: 2.2 + r(), r: r() })

    // Spruce
    const spruceGeo = spruceGeometry()
    const spruceMat = patch(new MeshLambertMaterial({ vertexColors: true }), { vertexProject: sway('0.025'), fragmentColor: SNOW_RIME_TREE })
    const sp = new InstancedMesh(spruceGeo, spruceMat, spruce.length)
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), up = new Vector3(0, 1, 0)
    const col = new Color()
    spruce.forEach((t, k) => {
      q.setFromAxisAngle(up, t.r * 6.28)
      sp.setMatrixAt(k, m.compose(p.set(t.x, groundY(t.x, t.z) - 0.05, t.z), q, sc.set(t.s * (0.85 + t.r * 0.3), t.s, t.s * (0.85 + t.r * 0.3))))
      sp.setColorAt(k, col.set('#22382f').multiplyScalar(0.8 + t.r * 0.45))
    })
    this.addShadowed(sp)
    this.disposables.push(spruceGeo, spruceMat)

    // Birch trunks and crowns (shrubs along the brook are crowns only)
    const trunks = birch.filter(t => !t.shrub)
    const trunkGeo = birchTrunkGeometry()
    const trunkMat = patch(new MeshLambertMaterial({ vertexColors: true }), { fragmentColor: SNOW_RIME })
    const tr = new InstancedMesh(trunkGeo, trunkMat, trunks.length)
    trunks.forEach((t, k) => {
      q.setFromAxisAngle(up, t.r * 6.28)
      tr.setMatrixAt(k, m.compose(p.set(t.x, groundY(t.x, t.z) - 0.05, t.z), q, sc.set(t.s * 1.4, t.s, t.s * 1.4)))
    })
    this.addShadowed(tr)
    this.disposables.push(trunkGeo, trunkMat)
    const crownGeo = birchCrownGeometry()
    const crownMat = patch(new MeshLambertMaterial({ vertexColors: true }), { vertexProject: sway('0.06'), fragmentColor: SNOW_RIME_TREE })
    this.crowns = new InstancedMesh(crownGeo, crownMat, birch.length)
    this.crowns.instanceMatrix.setUsage(DynamicDrawUsage)
    this.crownSpots = birch
    this.addShadowed(this.crowns)
    this.disposables.push(crownGeo, crownMat)

    this.buildFarmhouse()
    this.buildPotatoHouse()
    this.buildBridge()
    this.buildSmoke()
  }

  private addShadowed(mesh: Mesh): void {
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)
  }

  private mat(color: string, map?: Texture, repeat?: [number, number]): Material {
    let tex = map
    if (map && repeat) {
      tex = map.clone()
      tex.repeat.set(repeat[0], repeat[1])
      tex.needsUpdate = true
      this.disposables.push(tex)
    }
    const m = patch(new MeshLambertMaterial({ color, map: tex ?? null }), { fragmentColor: SNOW_RIME })
    this.disposables.push(m)
    return m
  }

  private box(w: number, h: number, d: number, material: Material, x: number, y: number, z: number, ry = 0): Mesh {
    const g = new BoxGeometry(w, h, d)
    this.disposables.push(g)
    const mesh = new Mesh(g, material)
    mesh.position.set(x, y, z)
    mesh.rotation.y = ry
    this.addShadowed(mesh)
    return mesh
  }

  // A gabled building: body along z, ridge along z. Origin at the middle of the floor.
  private gabled(w: number, l: number, wall: number, rise: number, wallMat: Material, roofMat: Material, x: number, y: number, z: number, ry = 0): Group {
    const g = new Group()
    const shape = new Shape()
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(w / 2, wall)
    shape.lineTo(0, wall + rise)
    shape.lineTo(-w / 2, wall)
    shape.closePath()
    const body = new ExtrudeGeometry(shape, { depth: l, bevelEnabled: false })
    body.translate(0, 0, -l / 2)
    this.disposables.push(body)
    const bm = new Mesh(body, wallMat)
    bm.castShadow = bm.receiveShadow = true
    g.add(bm)
    const oh = 0.14
    const slope = Math.hypot(w / 2 + oh, rise * (1 + oh / (w / 2)))
    const ang = Math.atan2(rise, w / 2)
    for (const side of [-1, 1]) {
      const geo = new BoxGeometry(slope, 0.07, l + oh * 2)
      this.disposables.push(geo)
      const rm = new Mesh(geo, roofMat)
      rm.rotation.z = -side * ang
      rm.position.set(side * (w / 4 + oh / 2) * 1.0, wall + rise / 2 - oh * Math.tan(ang) / 2 + 0.03, 0)
      rm.castShadow = rm.receiveShadow = true
      g.add(rm)
    }
    g.position.set(x, y, z)
    g.rotation.y = ry
    this.group.add(g)
    return g
  }

  private buildFarmhouse(): void {
    const clap = boardsTexture(true, 4)
    const shingle = shingleTexture()
    this.disposables.push(clap, shingle)
    const white = this.mat('#ebe5d6', clap, [0.6, 0.6])
    const red = this.mat('#8c4433', clap, [0.5, 0.5])
    const roof = this.mat('#55575a', shingle, [1, 1])
    const barnRoof = this.mat('#5e5a55', shingle, [1, 1])
    const dark = this.mat('#2b3133')
    const trim = this.mat('#f4f0e6')
    const green = this.mat('#2f4a3a')
    const brick = this.mat('#7a4434')
    const hx = HOUSE.x, hz = HOUSE.z
    const y = groundY(hx, hz)
    // House, ell and barn in a line: big house, little house, back house, barn.
    this.gabled(2.3, 2.8, 1.75, 0.95, white, roof, hx, y, hz + 1.2)
    this.gabled(1.6, 1.9, 1.3, 0.6, white, roof, hx + 0.1, y, hz - 1.15)
    this.gabled(2.7, 3.0, 1.6, 1.2, red, barnRoof, hx + 0.25, y, hz - 3.6)
    // Windows on the road side (-x) and the front (+z).
    for (const wz of [hz + 0.45, hz + 1.2, hz + 1.95]) {
      for (const wy of [0.55, 1.3]) {
        this.box(0.06, 0.44, 0.3, trim, hx - 1.16, y + wy, wz)
        this.box(0.07, 0.34, 0.2, dark, hx - 1.165, y + wy, wz)
      }
    }
    for (const wx of [hx - 0.55, hx + 0.55]) {
      for (const wy of [0.55, 1.3]) {
        this.box(0.3, 0.44, 0.06, trim, wx, y + wy, hz + 2.61)
        this.box(0.2, 0.34, 0.07, dark, wx, y + wy, hz + 2.615)
      }
    }
    this.box(0.24, 0.3, 0.06, dark, hx, y + 2.1, hz + 2.61)
    this.box(0.07, 0.62, 0.32, green, hx - 0.86, y + 0.33, hz - 1.0)
    this.box(0.07, 1.0, 1.0, this.mat('#4a3328'), hx - 1.13 + 0.01, y + 0.5, hz - 3.6)
    const ch = this.box(0.26, 0.85, 0.26, brick, hx + 0.35, y + 2.45, hz + 1.5)
    this.chimney.set(ch.position.x, ch.position.y + 0.45, ch.position.z)
    this.box(0.26, 0.6, 0.26, brick, hx + 0.1, y + 1.9, hz - 1.25)
  }

  private buildPotatoHouse(): void {
    const boards = boardsTexture(false, 8)
    const shingle = shingleTexture()
    this.disposables.push(boards, shingle)
    const wood = this.mat('#7b6a58', boards, [0.7, 0.7])
    const door = this.mat('#54463a', boards, [0.5, 0.5])
    const roof = this.mat('#5f5953', shingle, [1.2, 1.2])
    const px = POTATO_HOUSE.x, pz = POTATO_HOUSE.z
    const y = groundY(px, pz + 1)
    const w = 3.4, l = 5.0, wall = 0.9, rise = 1.0
    this.gabled(w, l, wall, rise, wood, roof, px, y - 0.05, pz)
    // Banked earth up to the eaves on the sides and back.
    const berm = patch(new MeshLambertMaterial({ color: 0xffffff }), {
      fragmentColor: `diffuseColor.rgb = uGrass * (0.8 + 0.35 * fbm(vWorld.xz * 0.9)); ${SNOW_RIME}`,
    })
    this.disposables.push(berm)
    for (const side of [-1, 1]) {
      const sh = new Shape()
      sh.moveTo(0, 0)
      sh.lineTo(1.7, 0)
      sh.lineTo(0, wall + 0.05)
      sh.closePath()
      const g = new ExtrudeGeometry(sh, { depth: l + 0.2, bevelEnabled: false })
      g.translate(0, 0, -(l + 0.2) / 2)
      if (side < 0) g.scale(-1, 1, 1)
      this.disposables.push(g)
      const mesh = new Mesh(g, berm)
      mesh.position.set(px + side * (w / 2 - 0.02), y - 0.1, pz)
      this.addShadowed(mesh)
    }
    this.box(0.7, 1.05, 0.06, door, px - 0.36, y + 0.5, pz + l / 2 + 0.02)
    this.box(0.7, 1.05, 0.06, door, px + 0.36, y + 0.5, pz + l / 2 + 0.02)
    this.box(0.3, 0.22, 0.06, this.mat('#2b2a28'), px, y + 1.35, pz + l / 2 + 0.02)
    for (const vz of [pz - 1.2, pz + 1.2]) {
      this.box(0.3, 0.3, 0.3, wood, px, y + wall + rise + 0.05, vz)
      this.box(0.42, 0.06, 0.42, roof, px, y + wall + rise + 0.24, vz)
    }
  }

  private buildBridge(): void {
    const x = 13.6
    const plank = this.mat('#6d5b48')
    const log = this.mat('#4f4237')
    this.box(1.9, 0.1, 2.6, plank, x, 0.12, BROOK_Z)
    for (const dx of [-0.9, 0.9]) {
      const g = new CylinderGeometry(0.08, 0.08, 2.6, 6)
      g.rotateX(Math.PI / 2)
      this.disposables.push(g)
      const mesh = new Mesh(g, log)
      mesh.position.set(x + dx, 0.24, BROOK_Z)
      this.addShadowed(mesh)
    }
  }

  private buildSmoke(): void {
    const tex = puffTexture()
    this.disposables.push(tex)
    for (let k = 0; k < 14; k++) {
      const mat = new SpriteMaterial({ map: tex, color: 0xd8d6d2, transparent: true, opacity: 0, depthWrite: false, fog: true })
      const s = new Sprite(mat)
      s.userData.phase = k / 14
      this.smoke.push(s)
      this.smokeMat.push(mat)
      this.group.add(s)
      this.disposables.push(mat)
    }
  }

  update(time: number, env: { birch: number; gold: number; smoke: number; windDir: number; wind: number }): void {
    const key = Math.round(env.birch * 40) * 100 + Math.round(env.gold * 40)
    if (key !== this.crownKey) {
      this.crownKey = key
      const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), up = new Vector3(0, 1, 0), col = new Color()
      const green = new Color('#7d9a4c'), gold = new Color('#d6b23e'), alder = new Color('#5f7d3e'), rust = new Color('#a77a3a')
      this.crownSpots.forEach((t, k) => {
        const leaf = t.shrub ? Math.max(0.15, env.birch) : env.birch
        const s = t.s * (t.shrub ? 1.6 : 1) * (0.3 + 0.7 * leaf) * (leaf < 0.05 && !t.shrub ? 0 : 1)
        q.setFromAxisAngle(up, t.r * 6.28)
        p.set(t.x, groundY(t.x, t.z) + (t.shrub ? -0.6 * t.s : 0), t.z)
        this.crowns.setMatrixAt(k, m.compose(p, q, sc.set(s, t.s * (t.shrub ? 1.4 : 1), s)))
        const base = t.shrub ? alder : green
        col.copy(base).lerp(t.shrub ? rust : gold, env.gold * (0.6 + 0.4 * t.r))
        if (leaf < 0.3) col.lerp(new Color('#6b5a45'), 1 - leaf / 0.3)
        this.crowns.setColorAt(k, col.multiplyScalar(0.85 + 0.3 * t.r))
      })
      this.crowns.instanceMatrix.needsUpdate = true
      if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true
    }
    const dx = Math.cos(env.windDir) * (0.4 + env.wind), dz = Math.sin(env.windDir) * (0.4 + env.wind)
    this.smoke.forEach((s, k) => {
      const a = (time * 0.12 + s.userData.phase) % 1
      s.position.set(this.chimney.x + dx * a * 2.2, this.chimney.y + a * 2.6, this.chimney.z + dz * a * 2.2)
      const size = 0.35 + a * 1.6
      s.scale.set(size, size, size)
      this.smokeMat[k].opacity = env.smoke * (1 - a) * Math.min(1, a * 6) * 0.55
      s.visible = this.smokeMat[k].opacity > 0.005
    })
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.group.traverse(o => { if (o instanceof InstancedMesh) o.dispose() })
  }
}

