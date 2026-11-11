// Every crew on the map: the farmer with the red tractor (and on foot for the walking jobs), the operator on the grey
// second tractor, the hands on foot. Each plays out its own day along the farm's roads; a marker over it holds it in
// view from the strategic camera, and a click on it picks it.
import {
  BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3, type PerspectiveCamera,
} from 'three'
import type { UnitKind } from '../sim/index.ts'
import { FARMER_DRESS, GREY, HAND_DRESS, Kit, RED, Tractor, Walker, implementFor, stoop, stride } from './crew.ts'
import { UI_GAIN, type HillDisplay } from './fields.ts'
import { ROAD } from './layout.ts'
import { clamp, smooth } from './noise.ts'
import type { Particles } from './particles.ts'
import type { Snapshot } from './state.ts'
import { Poly, heightAt, planDay, restAt, type Pt, type Reveal, type Seg } from './work.ts'

// A test dig and a day's digging keep their own time: the drive to the field, then the work.
const STAGE_DRIVE_S = 0.5
const STAGE_S = { sample: 2, dig: 1.7 }
const MAX_UNITS = 8

export type PendingReveal = Reveal & { unit: number; seg: number }

interface Unit {
  id: number
  kind: UnitKind
  slot: number
  tractor: Tractor | null
  walker: Walker
  segs: Seg[]
  clockSeg: number
  segClock: number
  pos: Pt                 // the tractor, or the person when there is no tractor
  heading: number
  travelled: number
  walk: Pt                // the person when off the tractor
  walkHeading: number
  walking: boolean        // the farmer is off the tractor
  shown: number           // how much of the unit is drawn, 0..1, as it is hired or let go
}

export interface CrewFrame {
  dt: number
  dayT: number
  advancing: boolean      // the game clock is running (else the day is replayed at `pace`)
  pace: number
  time: number
  reduced: boolean
  idle: boolean           // outside the season: no work, no exhaust
  season: boolean
  dist: number            // the camera's distance, for how large units are drawn
  dust: number
  picked: number          // app.unit
  particles: Particles
  // the hills of this crew's segment `seg` (and all before it) up to arc length `arc` along its path have been passed
  passed: (unit: number, seg: number, arc: number) => void
}

export class Crews {
  readonly group = new Group()
  private kit: Kit
  private units: Unit[] = []
  private markerGeo: InstancedBufferGeometry
  private markerMat: ShaderMaterial
  private marker: Mesh
  private mAt: InstancedBufferAttribute
  private mInfo: InstancedBufferAttribute
  private v = new Vector3()
  // The latest a staged dig still needs the day clock to wait at, or -1.
  stageHold = -1

  constructor(kit: Kit) {
    this.kit = kit
    // A pin over each crew: a disc with the crew's sign in it, a fixed size on screen, seen through anything.
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    this.mAt = new InstancedBufferAttribute(new Float32Array(MAX_UNITS * 3), 3)
    this.mInfo = new InstancedBufferAttribute(new Float32Array(MAX_UNITS * 3), 3)
    g.setAttribute('aAt', this.mAt)
    g.setAttribute('aInfo', this.mInfo)
    g.instanceCount = 0
    this.markerGeo = g
    this.markerMat = new ShaderMaterial({
      uniforms: { uGain: UI_GAIN, uPx: { value: 0.001 }, uAspect: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aAt;
        attribute vec3 aInfo;      // kind (0 farmer, 1 operator, 2 hand), picked, how strongly shown
        uniform float uPx; uniform float uAspect;
        varying vec2 vUv; varying vec3 vInfo;
        void main() {
          vUv = position.xy;
          vInfo = aInfo;
          vec4 c = projectionMatrix * viewMatrix * vec4(aAt, 1.0);
          float size = (11.0 + 3.0 * aInfo.y) * uPx * c.w;
          c.xy += vec2(position.x * size / uAspect, (position.y + 1.25) * size);
          gl_Position = c;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGain;
        varying vec2 vUv; varying vec3 vInfo;
        float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
        void main() {
          vec2 p = vUv;
          float r = length(p);
          float aa = fwidth(r) * 1.2;
          float disc = 1.0 - smoothstep(0.86 - aa, 0.86 + aa, r);
          float rim = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
          // the sign: a tractor (a big wheel, a small wheel, a body) or a person (a head and shoulders)
          float sign;
          if (vInfo.x < 1.5) {
            float big = length(p - vec2(-0.2, -0.22)) - 0.3, small = length(p - vec2(0.36, -0.32)) - 0.17;
            float bodyD = box(p - vec2(0.12, 0.1), vec2(0.34, 0.14)), cab = box(p - vec2(-0.2, 0.24), vec2(0.13, 0.2));
            sign = min(min(big, small), min(bodyD, cab));
          } else {
            float head = length(p - vec2(0.0, 0.26)) - 0.2, chest = box(p - vec2(0.0, -0.3), vec2(0.3, 0.22)) - 0.06;
            sign = min(head, chest);
          }
          float ink = 1.0 - smoothstep(-aa, aa, sign);
          vec3 paper = mix(vec3(0.95, 0.91, 0.8), vec3(1.0, 0.82, 0.38), vInfo.y);
          vec3 tint = vInfo.x < 0.5 ? vec3(0.62, 0.16, 0.1) : vInfo.x < 1.5 ? vec3(0.32, 0.33, 0.32) : vec3(0.15, 0.24, 0.33);
          vec3 col = mix(vec3(0.03, 0.035, 0.03), mix(paper, tint, ink), disc);
          float a = rim * vInfo.z;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col * uGain, a);
        }`,
    })
    this.marker = new Mesh(g, this.markerMat)
    this.marker.frustumCulled = false
    this.marker.renderOrder = 20
    this.group.add(this.marker)
  }

  private make(id: number, kind: UnitKind, slot: number): Unit {
    const hands = this.units.filter(u => u.kind === 'hand').length
    const tractor = kind === 'farmer' ? new Tractor(this.kit, RED) : kind === 'operator' ? new Tractor(this.kit, GREY, '#4a5f7a', '#2f3a44') : null
    const walker = new Walker(this.kit, kind === 'hand' ? HAND_DRESS[hands % HAND_DRESS.length] : FARMER_DRESS)
    if (tractor) this.group.add(tractor.group)
    this.group.add(walker.group)
    walker.group.visible = kind === 'hand'
    const rest = restAt(-1, slot, kind === 'hand')
    return {
      id, kind, slot, tractor, walker, segs: [], clockSeg: -2, segClock: 0,
      pos: { x: rest.x, z: rest.z }, heading: rest.heading, travelled: 0,
      walk: { x: rest.x, z: rest.z }, walkHeading: rest.heading, walking: false, shown: 0,
    }
  }

  private drop(u: Unit): void {
    if (u.tractor) this.group.remove(u.tractor.group)
    this.group.remove(u.walker.group)
  }

  // Bring the drawn crews in line with the farm's: new hands appear at the yard, crews let go leave.
  sync(snap: Snapshot): void {
    const want = snap.units.slice(0, MAX_UNITS)
    for (const u of this.units.filter(u => !want.some(w => w.id === u.id))) this.drop(u)
    this.units = this.units.filter(u => want.some(w => w.id === u.id))
    for (const w of want) {
      if (this.units.some(u => u.id === w.id)) continue
      const taken = new Set(this.units.filter(u => (u.kind === 'hand') === (w.kind === 'hand')).map(u => u.slot))
      let slot = 0
      while (taken.has(slot)) slot++
      this.units.push(this.make(w.id, w.kind, slot))
    }
    this.units.sort((a, b) => want.findIndex(w => w.id === a.id) - want.findIndex(w => w.id === b.id))
  }

  // Put every crew where the farm says it is, at once (a new screen, a loaded game).
  rest(snap: Snapshot): void {
    this.sync(snap)
    for (const u of this.units) {
      const v = snap.units.find(w => w.id === u.id)
      const r = restAt(v ? v.at : -1, u.slot, u.kind === 'hand')
      u.pos = { x: r.x, z: r.z }
      u.walk = { ...u.pos }
      u.heading = u.walkHeading = r.heading
      u.walking = false
      u.segs = []
      u.clockSeg = -2
      u.shown = 1
      u.tractor?.setImplement('none')
    }
  }

  // The opening: the tractor comes out of the potato house and down the farm road, over the bridge and away.
  title(): void {
    const u = this.units.find(x => x.kind === 'farmer')
    if (!u) return
    const travel: Pt[] = [{ x: 23.4, z: -15.6 }, ...ROAD.map(([x, z]) => ({ x, z }))]
    u.segs = [{ kind: 'travel', field: -1, walker: false, travel, path: [travel[travel.length - 1]], reveals: [], start: 0, end: 0.8 }]
    u.clockSeg = -2
  }

  // Plan the day just passed for every crew. Returns the hills to reveal as they pass.
  plan(snap: Snapshot, shown: HillDisplay[][], samples: Map<number, number>): PendingReveal[] {
    this.sync(snap)
    const from = this.units.map(u => ({ id: u.id, kind: u.kind, slot: u.slot, at: u.walking ? u.pos : u.kind === 'hand' ? u.walk : u.pos }))
    const plans = planDay(snap, shown, from, samples)
    const out: PendingReveal[] = []
    this.units.forEach((u, k) => {
      u.segs = plans[k]
      u.clockSeg = -2
      u.segs.forEach((s, j) => { for (const r of s.reveals) out.push({ ...r, unit: k, seg: j }) })
    })
    this.stageHold = -1
    return out
  }

  // The staged work that should bring the camera round: a test dig, or the start of a field's digging.
  staged(prev: Snapshot): Seg | null {
    for (const u of this.units) for (const s of u.segs) if (s.kind === 'sample' || (s.kind === 'dig' && prev.fields[s.field]?.status !== 'digging')) return s
    return null
  }

  segments(): Seg[] {
    return this.units.flatMap(u => u.segs)
  }

  // Finish any staged work at once (for screenshots).
  settle(): void {
    for (const u of this.units) { u.clockSeg = u.segs.length - 1; u.segClock = 1e6 }
    this.stageHold = -1
  }

  segsInfo(): string[] {
    return this.units.flatMap(u => u.segs.map(s => `${u.kind}${u.id}:${s.kind}@${s.field}`))
  }

  // Where the farmer's tractor is, and the person on foot if anyone is walking (for the look tools).
  where(): { tractor: Pt; farmer: { x: number; z: number; turn: number } | null; units: { id: number; kind: UnitKind; x: number; z: number; foot: boolean }[] } {
    const f = this.units.find(u => u.kind === 'farmer')
    const walker = this.units.find(u => u.walking) ?? this.units.find(u => u.kind === 'hand' && u.segs.length > 0)
    return {
      tractor: f ? { ...f.pos } : { x: 0, z: 0 },
      farmer: walker ? { x: walker.walk.x, z: walker.walk.z, turn: walker.walker.group.rotation.y } : null,
      units: this.units.map(u => ({ id: u.id, kind: u.kind, x: u.walking || !u.tractor ? u.walk.x : u.pos.x, z: u.walking || !u.tractor ? u.walk.z : u.pos.z, foot: u.walking || !u.tractor })),
    }
  }

  // Move every crew to where it is at this point of the day.
  place(f: CrewFrame): void {
    this.stageHold = -1
    const presence = 1 + 1.1 * smooth(26, 120, f.dist)
    let markers = 0
    const far = smooth(34, 70, f.dist) * (f.season ? 0.75 : 0)
    this.units.forEach((u, k) => {
      u.shown = Math.min(1, u.shown + f.dt * 2)
      this.step(u, k, f)
      const picked = u.id === f.picked ? 1 : 0
      const scale = presence * (0.4 + 0.6 * u.shown)
      if (u.tractor) {
        u.tractor.group.scale.setScalar(scale)
        const ring = u.tractor.ring.material as ShaderMaterial
        ring.uniforms.uLevel.value = Math.max(far * (u.segs.length ? 1 : 0.6), picked * 0.95)
        ring.uniforms.uPick.value = picked
      }
      u.walker.group.scale.setScalar(scale)
      const wr = u.walker.ring.material as ShaderMaterial
      wr.uniforms.uLevel.value = u.walker.group.visible ? Math.max(far, picked * 0.95) : 0
      wr.uniforms.uPick.value = picked
      // the marker stands over whichever of the two is the crew's body now
      const foot = u.walking || !u.tractor
      const at = foot ? u.walk : u.pos
      const show = f.season || f.picked >= 0 ? Math.max(smooth(40, 85, f.dist), picked) * u.shown : 0
      if (show > 0.01 && markers < MAX_UNITS) {
        this.mAt.setXYZ(markers, at.x, heightAt(at.x, at.z) + (foot ? 0.95 : 1.45) * scale, at.z)
        this.mInfo.setXYZ(markers, u.kind === 'farmer' ? 0 : u.kind === 'operator' ? 1 : 2, picked, show)
        markers++
      }
    })
    this.markerGeo.instanceCount = markers
    this.mAt.needsUpdate = true
    this.mInfo.needsUpdate = true
  }

  // The screen's size in CSS pixels, so markers keep their size in pixels.
  setScreen(w: number, h: number): void {
    this.markerMat.uniforms.uPx.value = 2 / Math.max(1, h)
    this.markerMat.uniforms.uAspect.value = w / Math.max(1, h)
  }

  private step(u: Unit, k: number, f: CrewFrame): void {
    let segIdx = -1
    for (let s = 0; s < u.segs.length; s++) if (f.dayT >= u.segs[s].start) segIdx = s
    const seg: Seg | null = segIdx >= 0 ? u.segs[segIdx] : null
    if (segIdx !== u.clockSeg) { u.clockSeg = segIdx; u.segClock = 0 } else u.segClock += f.dt * (f.advancing ? 1 : f.pace)
    let pos: Pt = u.pos, dir = { dx: Math.cos(u.heading), dz: Math.sin(u.heading) }
    let walkPos: Pt = u.walk, walkDir = { dx: Math.cos(u.walkHeading), dz: Math.sin(u.walkHeading) }
    let working = 0, walking = 0, bent = 0
    let footOn = !u.tractor
    let kind: Seg['kind'] = 'travel'
    const passed = (arc: number) => f.passed(k, segIdx, arc)
    if (seg) {
      kind = seg.kind
      const span = Math.max(1e-6, seg.end - seg.start)
      let p = Math.min(1, (f.dayT - seg.start) / span)
      seg.polys ??= { travel: new Poly(seg.travel), path: new Poly(seg.path) }
      const travel = seg.polys.travel
      let tShare = seg.kind === 'travel' ? 1 : travel.length > 0.3 ? Math.min(0.4, 0.12 + travel.length / 150) : 0
      if (seg.kind === 'sample' || seg.kind === 'dig') {
        // However long the day is, the hill is up or the last row out inside two and a half seconds, and the day waits for it.
        const drive = travel.length > 0.3 ? STAGE_DRIVE_S : 0, work = STAGE_S[seg.kind]
        p = Math.min(1, u.segClock / (drive + work))
        tShare = drive / (drive + work)
        if (p < 0.92 && f.season) this.stageHold = this.stageHold < 0 ? seg.end - 1e-3 : Math.min(this.stageHold, seg.end - 1e-3)
      }
      const path = seg.polys.path
      // A hand walks the whole way; the farmer drives to the field and gets down for the walking jobs.
      const handWalks = !u.tractor
      if (p < tShare || seg.kind === 'travel') {
        const s = seg.kind === 'travel' ? p : p / tShare
        const e = travel.at((s * s * (3 - 2 * s)) * travel.length)
        if (handWalks) { walkPos = e; walkDir = e; walking = 1; footOn = true } else { pos = e; dir = e }
        passed(-1)
      } else {
        const w = (p - tShare) / (1 - tShare)
        if (!seg.walker && !handWalks) {
          // Dig day is staged: the digger is lowered at the row's end, the rows come out, and the tractor stands at the finish.
          const lead = seg.kind === 'dig' ? 0.05 : 0, tail = seg.kind === 'dig' ? 0.08 : 0
          const run = clamp((w - lead) / (1 - lead - tail), 0, 1)
          const e = path.at(run * path.length)
          pos = e
          dir = e
          working = run > 0 && run < 1 ? 1 : 0
          passed(run >= 1 ? Infinity : run * path.length)
        } else {
          if (!handWalks) {
            const end = travel.at(travel.length)
            pos = end
            dir = travel.length > 0.01 ? end : dir
          }
          footOn = true
          if (seg.kind === 'sample') {
            // The test dig is staged: the walk in, the fork set and the hill lifted, then a moment to look.
            const walk = Math.min(1, w / 0.5)
            const e = path.at(walk * path.length)
            walkPos = e
            walkDir = walk < 1 ? e : { dx: 0, dz: -1 }
            walking = walk < 1 ? 1 : 0
            bent = smooth(0.5, 0.62, w) * (1 - 0.6 * smooth(0.66, 0.8, w))
            passed(w >= 0.64 ? Infinity : -1)
          } else {
            const e = path.at(w * path.length)
            walkPos = e
            walkDir = e
            walking = 1
            // the farmer is back on the tractor once the walk is done; a hand stays where the walk ended
            if (w >= 1 && !handWalks) footOn = false
            passed(w * path.length)
          }
        }
      }
      if (u.tractor) u.tractor.setImplement(seg.kind === 'travel' ? u.tractor.current : seg.walker ? 'none' : implementFor(seg.kind))
    } else if (!f.season) {
      u.tractor?.setImplement('none')
    }
    // the walker's facing
    if (footOn) {
      const step = Math.hypot(walkPos.x - u.walk.x, walkPos.z - u.walk.z)
      if (step > 1e-4 || walking) u.walkHeading = Math.atan2(walkDir.dz, walkDir.dx)
      u.walk = { x: walkPos.x, z: walkPos.z }
      u.walker.group.visible = true
      u.walker.group.position.set(walkPos.x, heightAt(walkPos.x, walkPos.z) + 0.02, walkPos.z)
      u.walker.group.rotation.y = -u.walkHeading
      stride(u.walker.figure, f.time * 9 + k * 1.3, walking)
      stoop(u.walker.figure, bent)
      u.walker.fork.visible = kind === 'sample' || kind === 'rogue'
    } else {
      u.walker.group.visible = false
      u.walk = { ...pos }
    }
    u.walking = footOn && !!u.tractor
    if (!u.tractor) { u.pos = { ...u.walk }; return }
    const t = u.tractor
    // A jump (the opening's loop starting again) is not a drive.
    const stepLen = Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z)
    const moved = stepLen > 3 ? 0 : stepLen
    u.travelled += moved
    let turn = 0
    if (moved > 1e-4 || seg) {
      const target = Math.atan2(dir.dz, dir.dx)
      let d = target - u.heading
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      turn = clamp(d * 1.5, -1, 1)
      u.heading += stepLen > 3 ? d : moved > 1e-4 ? d * Math.min(1, f.dt * 7 + moved * 2) : 0
    }
    u.pos = { x: pos.x, z: pos.z }
    const s = t.group.scale.x
    const y = heightAt(pos.x, pos.z)
    const ahead = heightAt(pos.x + Math.cos(u.heading) * 0.6 * s, pos.z + Math.sin(u.heading) * 0.6 * s)
    const behind = heightAt(pos.x - Math.cos(u.heading) * 0.6 * s, pos.z - Math.sin(u.heading) * 0.6 * s)
    t.group.position.set(pos.x, y + 0.01, pos.z)
    t.group.rotation.set(0, -u.heading, Math.atan2(ahead - behind, 1.2 * s), 'YXZ')
    t.driver.visible = !u.walking
    t.animate(f.dt, u.travelled, moved, turn, working, kind, f.dust, f.particles, f.reduced || f.idle)
  }

  // The crew under a point on the screen (CSS pixels), or -1: on its body, or on its marker.
  pick(x: number, y: number, camera: PerspectiveCamera, w: number, h: number, markers: boolean): number {
    let best = -1, bd = Infinity
    const screen = (px: number, py: number, pz: number): [number, number] | null => {
      this.v.set(px, py, pz).project(camera)
      return this.v.z > 1 ? null : [(this.v.x + 1) / 2 * w, (1 - this.v.y) / 2 * h]
    }
    for (const u of this.units) {
      const foot = u.walking || !u.tractor
      const at = foot ? u.walk : u.pos
      const s = (foot ? u.walker.group : u.tractor!.group).scale.x
      const base = heightAt(at.x, at.z)
      const body = screen(at.x, base + 0.4 * s, at.z)
      if (body) {
        const edge = screen(at.x + (foot ? 0.4 : 0.9) * s, base + 0.4 * s, at.z)
        const r = Math.max(16, edge ? Math.hypot(edge[0] - body[0], edge[1] - body[1]) : 16)
        const d = Math.hypot(body[0] - x, body[1] - y)
        if (d < r && d < bd) { bd = d; best = u.id }
      }
      const pin = markers ? screen(at.x, base + (foot ? 0.95 : 1.45) * s, at.z) : null
      if (pin) {
        const d = Math.hypot(pin[0] - x, pin[1] - 14 - y)
        if (d < 15 && d < bd) { bd = d; best = u.id }
      }
    }
    return best
  }

  dispose(): void {
    this.markerGeo.dispose()
    this.markerMat.dispose()
  }
}
