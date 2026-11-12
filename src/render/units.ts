// Everyone and everything that works on the map: each person of the farm, on foot, on a tractor or in the truck,
// playing out their own day along the farm's roads; the machines, kept where they were left; the work staged at each
// place; and the callers, pickers and animals that come with it. A ring on the ground marks who is picked, and a click
// on a person or the machine they are on picks them.
import {
  BufferAttribute, Color, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, ShaderMaterial, Vector3, type PerspectiveCamera,
} from 'three'
import type { UnitKind } from '../sim/index.ts'
import { COWS, DEER, drawBeast, drawCrow } from './animals.ts'
import { Pose, dressFor, dressOf, drawFigure, drawn, figureMatrix, forking, hammering, sit, stand, stoop, swing, walk, type Dress } from './crew.ts'
import type { Env } from './env.ts'
import { UI_GAIN, type HillDisplay } from './fields.ts'
import { HOUSE, ROAD, hillPos, route, type Pt } from './layout.ts'
import { clamp, hash2, smooth } from './noise.ts'
import type { Particles } from './particles.ts'
import { Prims } from './prims.ts'
import { Stage, type StageFrame, type Worker } from './stage.ts'
import type { Snapshot, UnitVis } from './state.ts'
import { Car, GRIME, PAINTS, Tractor, implementFor, type MachineFrame, type MachineState } from './tractor.ts'
import {
  BUYER, CALLER, GATE, MACHINE_JOBS, OFF_FARM, Poly, buildSite, heightAt, idleSpot, machineHome, planDay, restAt, sickSpot, siteAt, sundaySpot,
  type CrewFrom, type Reveal, type Ride, type Seg, type Spot,
} from './work.ts'

// A test dig and a day's digging keep their own time: the drive to the field, then the work.
const STAGE_DRIVE_S = 0.5
const STAGE_S = { sample: 2, dig: 1.7 }
const MAX_RINGS = 48

export type PendingReveal = Reveal & { unit: number; seg: number }

interface Rig {
  kind: 'tractor' | 'truck'
  machine: Tractor | Car
  x: number
  z: number
  heading: number
  holder: number           // the person who has it, or -1
  home: Spot
  broken: boolean
  moved: number            // this frame
  turn: number
  state: MachineState
  drawnAt: number          // the frame it was last placed by its driver
}

interface Actor {
  id: number
  kind: UnitKind
  slot: number
  dress: Dress
  coat: Dress
  segs: Seg[]
  clockSeg: number
  segClock: number
  x: number
  z: number
  heading: number
  rig: Rig | null          // the machine in hand
  aboard: boolean
  shown: number
  away: boolean            // laid off for the winter: not on the farm
  home: Spot | null        // their place in the dooryard when there is nothing to do
  gait: number
  goal: (Spot & { seat?: number }) | null
  state: 'work' | 'idle' | 'sunday' | 'hurt' | 'mend'
  post: string             // the work stood at outside the season (winter), or ''
  tired: number            // bearing: how bowed they go, from tiredness and low spirits
  worn: number             // tiredness alone
  style: number
  pose: Pose
  worker: Worker
  head: Vector3
  scale: number
  next: number[]           // per segment: the next reveal not yet passed
}

interface Leaver { dress: Dress; path: Poly; at: number; gait: number }
interface Picker { dress: Dress; x: number; z: number; tx: number; tz: number; wait: number; heading: number; gait: number; bent: number }
interface Gang { field: number; pickers: Picker[]; recent: Pt[]; crows: { x: number; z: number; fx: number; fz: number; tx: number; tz: number; t: number; wait: number; h: number }[]; idle: number }

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
  snap: Snapshot
  env: Env
  camera: PerspectiveCamera
  // the hills of this crew's segment `seg` (and all before it) up to arc length `arc` along its path have been passed
  passed: (unit: number, seg: number, arc: number) => void
}

const M = new Matrix4(), V = new Vector3(), V2 = new Vector3()
const PICKER_SHIRTS = ['#b8402e', '#2f6f9f', '#d9a441', '#e7e0cf', '#2e7d6b', '#c96f2c', '#a23b62', '#8a9a3b', '#6b4c8a']

export class Crews {
  readonly group = new Group()
  readonly prims = new Prims()
  private stage = new Stage()
  private actors: Actor[] = []
  private rigs: Rig[] = []
  private leavers: Leaver[] = []
  private gangs = new Map<number, Gang>()
  private callers: { pickup: Car | null; sedan: Car | null } = { pickup: null, sedan: null }
  private ringGeo: InstancedBufferGeometry
  private ringMat: ShaderMaterial
  private rAt: InstancedBufferAttribute
  private rInfo: InstancedBufferAttribute
  private rCol: InstancedBufferAttribute
  private rings = 0
  private v = new Vector3()
  private frameNo = 0
  private mode = ''
  private shake = 0
  private shakeT = 9
  private deer = { x: 6.5, z: -22.3, away: 0, t: 0 }
  private cows = COWS.flatMap((_, k) => [0, 1, 2].map(n => ({ kind: k, x: 37 + 9 * (hash2(k * 3 + n, 5) - 0.5), z: 10 + 9 * (hash2(k * 3 + n, 9) - 0.5), h: hash2(k, n) * 6.28, t: hash2(n, k + 3) * 20, tx: 0, tz: 0, walking: false })))
  private extras: Dress[] = []
  // The latest a staged dig still needs the day clock to wait at, or -1.
  stageHold = -1

  constructor() {
    // A ring on the ground under each person, in the colour of their shirt; brighter and doubled on the one picked.
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3))
    g.setIndex([0, 2, 1, 0, 3, 2])
    this.rAt = new InstancedBufferAttribute(new Float32Array(MAX_RINGS * 4), 4)
    this.rInfo = new InstancedBufferAttribute(new Float32Array(MAX_RINGS * 2), 2)
    this.rCol = new InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3)
    g.setAttribute('aAt', this.rAt)
    g.setAttribute('aInfo', this.rInfo)
    g.setAttribute('aCol', this.rCol)
    g.instanceCount = 0
    this.ringGeo = g
    this.ringMat = new ShaderMaterial({
      uniforms: { uGain: UI_GAIN, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aAt;        // where, and how wide
        attribute vec2 aInfo;      // how strongly shown, picked
        attribute vec3 aCol;
        varying vec2 vUv; varying vec2 vInfo; varying vec3 vCol;
        void main() {
          vUv = position.xz;
          vInfo = aInfo;
          vCol = aCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(aAt.xyz + position * aAt.w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGain; uniform float uTime;
        varying vec2 vUv; varying vec2 vInfo; varying vec3 vCol;
        void main() {
          float r = length(vUv), aa = fwidth(r) * 1.3;
          float band = smoothstep(0.8 - aa, 0.8 + aa, r) * (1.0 - smoothstep(0.94 - aa, 0.94 + aa, r));
          float inner = smoothstep(0.56 - aa, 0.56 + aa, r) * (1.0 - smoothstep(0.64 - aa, 0.64 + aa, r)) * vInfo.y;
          float wash = (1.0 - smoothstep(0.1, 0.8, r)) * (0.2 + 0.16 * vInfo.y);
          float a = max(max(band, inner * (0.7 + 0.3 * sin(uTime * 4.0))), wash) * vInfo.x;
          if (a < 0.01) discard;
          vec3 col = mix(vCol, vec3(1.0, 0.84, 0.42), 0.55 * vInfo.y) + 0.25 * vInfo.y;
          gl_FragColor = vec4(col * uGain, a);
        }`,
    })
    const ring = new Mesh(g, this.ringMat)
    ring.frustumCulled = false
    ring.renderOrder = 6
    this.group.add(this.prims.group, ring)
    for (let k = 0; k < 12; k++) {
      this.extras.push(dressOf({
        shirt: PICKER_SHIRTS[k % PICKER_SHIRTS.length], trousers: k % 2 ? '#3f536e' : '#4a4136', hat: k % 3 ? '#c9b98a' : '#3b3f45', hatKind: k % 3 === 0 ? 'cap' : k % 3 === 1 ? 'brim' : 'none',
        hair: ['#5a3d24', '#2b211a', '#8a6a3c', '#7a3b1f'][k % 4], tall: 0.7 + 0.13 * hash2(k, 71), build: 0.92, rolled: true, skin: ['#e8b996', '#d9a47c', '#f0c8a8'][k % 3],
      }))
    }
  }

  // ---- who and what is on the farm

  private makeActor(u: UnitVis, slot: number): Actor {
    const rest = idleSpot(-1, slot, u.kind === 'farmer')
    return {
      id: u.id, kind: u.kind, slot, dress: dressFor(u.id), coat: dressFor(u.id, true), segs: [], clockSeg: -2, segClock: 0,
      x: rest.x, z: rest.z, heading: rest.heading, rig: null, aboard: false, shown: 0, away: false, home: null, gait: u.id * 1.3, goal: null, state: 'idle', post: '',
      tired: u.tired, worn: u.tired, style: (u.id * 7) % 5, pose: new Pose().reset(), head: new Vector3(rest.x, 1, rest.z), scale: 1, next: [],
      worker: { id: u.id, dress: dressFor(u.id), tired: 0, w: 0, x: rest.x, z: rest.z, heading: 0, lift: 0, pose: new Pose().reset(), aboard: false, rig: null },
    }
  }

  private makeRig(kind: 'tractor' | 'truck', k: number): Rig {
    const machine = kind === 'tractor' ? new Tractor(PAINTS[k % PAINTS.length]) : new Car('truck', '#3d5a50')
    const home = machineHome(kind, k)
    this.group.add(machine.group)
    return {
      kind, machine, x: home.x, z: home.z, heading: home.heading, holder: -1, home, broken: false, moved: 0, turn: 0, drawnAt: -1,
      state: { moved: 0, turn: 0, working: 0, kind: 'travel', driver: null, load: 0 },
    }
  }

  // Bring the drawn people and machines in line with the farm's: new people come up the road, those let go leave by it.
  sync(snap: Snapshot): void {
    const want = snap.units
    for (const a of this.actors.filter(a => !want.some(w => w.id === a.id))) {
      if (a.rig) a.rig.holder = -1
      if (this.mode === 'season' && snap.mode === 'season') this.leavers.push({ dress: a.dress, path: new Poly(route({ x: a.x, z: a.z }, OFF_FARM)), at: 0, gait: 0 })
    }
    this.actors = this.actors.filter(a => want.some(w => w.id === a.id))
    for (const w of want) {
      if (this.actors.some(a => a.id === w.id)) continue
      const taken = new Set(this.actors.filter(a => (a.kind === 'farmer') === (w.kind === 'farmer')).map(a => a.slot))
      let slot = 0
      while (taken.has(slot)) slot++
      const a = this.makeActor(w, slot)
      // hired in the season: in from the road
      if (this.mode === 'season' && snap.mode === 'season') { a.x = OFF_FARM.x; a.z = OFF_FARM.z - 6 }
      this.actors.push(a)
    }
    this.actors.sort((a, b) => want.findIndex(w => w.id === a.id) - want.findIndex(w => w.id === b.id))
    for (const a of this.actors) {
      const u = want.find(w => w.id === a.id)!
      a.worn = u.tired
      // worn out or unhappy, it shows in how they carry themselves
      a.tired = clamp(Math.max(u.tired, 1.5 * (0.5 - u.mood)), 0, 1)
    }
    // machines
    const tractors = this.rigs.filter(r => r.kind === 'tractor')
    for (let k = tractors.length; k < Math.min(3, Math.max(1, snap.farm.tractors)); k++) this.rigs.push(this.makeRig('tractor', k))
    if (snap.farm.truck && !this.rigs.some(r => r.kind === 'truck')) this.rigs.push(this.makeRig('truck', 0))
    // which tractors stand broken down: the one its driver had when it stopped
    const all = this.rigs.filter(r => r.kind === 'tractor')
    let broken = all.filter(r => r.broken).length
    const want2 = Math.min(all.length, snap.farm.broken)
    for (const inc of snap.farm.incidents) {
      if (broken >= want2 || inc.kind !== 'breakdown') continue
      const r = all.find(x => !x.broken && x.holder === inc.unit)
      if (r) { r.broken = true; broken++ }
    }
    while (broken < want2) { const r = all.find(x => !x.broken && x.holder < 0) ?? all.find(x => !x.broken); if (!r) break; r.broken = true; broken++ }
    while (broken > want2) { const r = all.find(x => x.broken); if (!r) break; r.broken = false; broken-- }
    for (const r of all) {
      (r.machine as Tractor).broken = r.broken
      if (r.broken && r.holder >= 0) { const a = this.actors.find(x => x.id === r.holder); if (a) { a.rig = null; a.aboard = false } r.holder = -1 }
    }
    this.mode = snap.mode
  }

  // Put everyone and everything where the farm says it is, at once (a new screen, a loaded game).
  rest(snap: Snapshot): void {
    this.mode = snap.mode
    this.sync(snap)
    this.pondWas = snap.farm.pond
    this.leavers = []
    this.gangs.clear()
    this.stage.clear()
    for (const r of this.rigs) {
      r.x = r.home.x; r.z = r.home.z; r.heading = r.home.heading; r.holder = -1
      if (r.kind === 'tractor') (r.machine as Tractor).setImplement('none')
    }
    for (const a of this.actors) {
      const u = snap.units.find(w => w.id === a.id)!
      a.rig = null
      a.aboard = false
      a.segs = []
      a.clockSeg = -2
      a.shown = 1
      a.post = ''
      a.state = 'idle'
      a.goal = null
      a.away = false
      let r: Spot = snap.mode === 'season' ? (u.at < 0 ? idleSpot(u.at, a.slot, a.kind === 'farmer') : restAt(u.at, a.slot, true)) : idleSpot(-1, a.slot, a.kind === 'farmer')
      if (snap.mode === 'cellar') {
        // the cellar months: at the winter's work, or by the door with the wood to split
        const tract = snap.fields[u.winterField]
        if (u.winter === 'woods' && tract && (tract.cover === 'woods' || tract.cover === 'brush')) a.post = `${u.winterField}|fell`
        else if (u.winter === 'pack' && snap.farm.buildings.some(b => b.kind === 'packing' && b.built)) a.post = '-1|pack'
        else if (u.winter === 'build') { const b = snap.farm.buildings.find(x => !x.built); if (b) a.post = `${b.yard}|build` }
        if (a.kind !== 'farmer' && !a.post) a.away = true
        if (a.kind === 'farmer' && !a.post) r = { x: HOUSE.x - 2.9, z: HOUSE.z - 5.6, heading: 0.2 }
        // already out at the work
        if (a.post.endsWith('|fell')) r = siteAt('fell', u.winterField)
        else if (a.post.endsWith('|pack')) r = buildSite('packing', -1)
        else if (a.post) { const b = snap.farm.buildings.find(x => !x.built); if (b) r = buildSite(b.kind, b.yard) }
      }
      a.x = r.x; a.z = r.z; a.heading = r.heading
      a.home = a.kind !== 'farmer' && !a.post && (snap.mode !== 'season' || u.at === -1) ? r : null
      a.worker.x = a.x; a.worker.z = a.z
      // part way through work with a machine: it stands where they are
      if (snap.mode === 'season' && u.rig && u.at >= 0) {
        const rig = this.rigs.find(x => x.kind === u.rig && x.holder < 0 && !x.broken)
        if (rig) {
          const at = restAt(u.at, a.slot, false)
          rig.x = at.x; rig.z = at.z; rig.heading = at.heading; rig.holder = a.id
          a.rig = rig
          a.x = at.x + 0.2; a.z = at.z + 1.0
        }
      }
    }
    if (snap.mode === 'season') this.goals(snap)
  }

  // The opening: the tractor comes out of the potato house and down the farm road, over the bridge and away.
  title(): void {
    const a = this.actors.find(x => x.kind === 'farmer'), rig = this.rigs.find(r => r.kind === 'tractor')
    if (!a || !rig) return
    const travel: Pt[] = [{ x: 23.4, z: -15.6 }, ...ROAD.map(([x, z]) => ({ x, z }))]
    a.rig = rig
    rig.holder = a.id
    a.segs = [{ kind: 'travel', field: -1, walker: false, ride: 'tractor', walkTo: [], travel, path: [travel[travel.length - 1]], reveals: [], start: 0, end: 0.8, site: '' }]
    a.clockSeg = -2
  }

  // Where each person spends a day with no work in it: the porch on a Sunday, a chair when laid up.
  private goals(snap: Snapshot): void {
    let sunday = 0, sick = 0
    for (const a of this.actors) {
      const u = snap.units.find(w => w.id === a.id)!
      if (u.worked.length || u.to !== u.at) { a.state = 'work'; a.goal = null }
      else if (u.hurt) { a.state = 'hurt'; a.goal = { ...sickSpot(sick++), seat: 0.2 } }
      else if (snap.restDay) { a.state = 'sunday'; const s = sundaySpot(sunday++); a.goal = { ...s, seat: s.seat } }
      else { a.state = 'idle'; a.goal = u.at < 0 ? idleSpot(u.at, a.slot, a.kind === 'farmer') : null }
      a.home = a.state === 'idle' && a.goal && u.at === -1 && a.kind !== 'farmer' ? a.goal : null
    }
    // A tractor broken down: whoever was driving it (or else whoever has nothing to do) is at its engine.
    for (const r of this.rigs) {
      if (!r.broken) continue
      const free = (a: Actor) => a.state === 'idle' || a.state === 'sunday'
      const inc = snap.farm.incidents.find(i => i.kind === 'breakdown')
      const who = this.actors.find(a => free(a) && inc && a.id === inc.unit) ?? this.actors.find(a => free(a) && a.kind === 'farmer') ?? this.actors.find(free)
      if (!who) continue
      who.state = 'mend'
      who.goal = { x: r.x + Math.cos(r.heading) * 0.3 - Math.sin(r.heading) * 0.62, z: r.z + Math.sin(r.heading) * 0.3 + Math.cos(r.heading) * 0.62, heading: r.heading - Math.PI / 2 }
    }
  }

  // Who has which machine today: those already in a seat keep it; the rest take the nearest that is free and runs.
  private assign(snap: Snapshot): Map<number, Ride> {
    const rides = new Map<number, Ride>()
    const truck = this.rigs.find(r => r.kind === 'truck')
    const hauls = (u: UnitVis) => u.worked.some(w => w.kind === 'haul') || u.job?.kind === 'haul'
    for (const a of this.actors) {
      const u = snap.units.find(w => w.id === a.id)!
      const machine = u.worked.some(w => MACHINE_JOBS.has(w.kind)) || (u.to !== u.at && !!u.job && MACHINE_JOBS.has(u.job.kind)) || u.rig !== ''
      let ride: Ride = !machine ? '' : u.rig || 'tractor'
      if (ride === 'tractor' && !u.rig && truck && hauls(u) && (truck.holder < 0 || truck.holder === a.id) && !snap.units.some(o => o.id !== u.id && o.rig === 'truck')) ride = 'truck'
      rides.set(a.id, ride)
      if (a.rig && a.rig.kind !== ride) {
        // down off it, and beside it
        if (a.aboard) { a.x = a.rig.x - Math.sin(a.rig.heading) * 0.95; a.z = a.rig.z + Math.cos(a.rig.heading) * 0.95 }
        a.rig.holder = -1
        a.rig = null
        a.aboard = false
      }
    }
    for (const a of this.actors) {
      const ride = rides.get(a.id)!
      if (!ride || a.rig) continue
      let best: Rig | null = null, bd = Infinity
      for (const r of this.rigs) {
        if (r.kind !== ride || r.holder >= 0 || r.broken) continue
        const d = Math.hypot(r.x - a.x, r.z - a.z)
        if (d < bd) { bd = d; best = r }
      }
      if (best) { best.holder = a.id; a.rig = best } else rides.set(a.id, '')
    }
    return rides
  }

  // Plan the day just passed for everyone. Returns the hills to reveal as they pass.
  plan(snap: Snapshot, shown: HillDisplay[][], samples: Map<number, number>): PendingReveal[] {
    this.sync(snap)
    this.goals(snap)
    const rides = this.assign(snap)
    const from: CrewFrom[] = this.actors.map(a => ({
      id: a.id, slot: a.slot, farmer: a.kind === 'farmer', ride: rides.get(a.id)!, goal: a.goal,
      at: a.aboard && a.rig ? { x: a.rig.x, z: a.rig.z } : { x: a.x, z: a.z }, machine: a.rig ? { x: a.rig.x, z: a.rig.z } : null,
    }))
    const plans = planDay(snap, shown, from, samples, snap.farm.pond < this.pondWas - 0.02)
    this.pondWas = snap.farm.pond
    const out: PendingReveal[] = []
    this.actors.forEach((a, k) => {
      a.segs = plans[k]
      a.clockSeg = -2
      a.next = a.segs.map(() => 0)
      a.segs.forEach((s, j) => { for (const r of s.reveals) out.push({ ...r, unit: k, seg: j }) })
    })
    this.stageHold = -1
    return out
  }

  // The staged work that should bring the camera round: a test dig, or the start of a field's digging.
  staged(prev: Snapshot): Seg | null {
    for (const a of this.actors) for (const s of a.segs) if (s.kind === 'sample' || (s.kind === 'dig' && prev.fields[s.field]?.status !== 'digging')) return s
    return null
  }

  segments(): Seg[] {
    return this.actors.flatMap(a => a.segs)
  }

  // Finish any staged work at once (for screenshots).
  settle(): void {
    for (const a of this.actors) { a.clockSeg = a.segs.length - 1; a.segClock = 1e6 }
    this.stageHold = -1
  }

  segsInfo(): string[] {
    return this.actors.flatMap(a => a.segs.map(s => `${a.kind}${a.id}:${s.kind}@${s.field}`))
  }

  // Where the farmer's machine is, and the person on foot if anyone is walking (for the look tools).
  where(): { tractor: Pt; farmer: { x: number; z: number; turn: number } | null; units: { id: number; kind: UnitKind; x: number; z: number; foot: boolean }[]; rigs: { kind: string; x: number; z: number; holder: number; broken: boolean }[] } {
    const f = this.actors.find(a => a.kind === 'farmer')
    const rig = f?.rig ?? this.rigs.find(r => r.kind === 'tractor')
    const walker = this.actors.find(a => !a.aboard && a.segs.length > 0) ?? this.actors.find(a => !a.aboard)
    return {
      tractor: rig ? { x: rig.x, z: rig.z } : { x: 0, z: 0 },
      farmer: walker ? { x: walker.x, z: walker.z, turn: -walker.heading } : null,
      units: this.actors.map(a => ({ id: a.id, kind: a.kind, x: a.x, z: a.z, foot: !a.aboard })),
      rigs: this.rigs.map(r => ({ kind: r.kind, x: r.x, z: r.z, holder: r.holder, broken: r.broken })),
    }
  }

  // A point just above a person's head, in the world; false when there is no such person.
  anchor(id: number, out: Vector3): boolean {
    const a = this.actors.find(x => x.id === id)
    if (!a || a.shown < 0.5) return false
    out.copy(a.head)
    out.y += 0.16 * a.scale
    return true
  }

  // A tree coming down close by shakes the camera a little.
  shudder(camera: PerspectiveCamera, dt: number, reduced: boolean): void {
    if (this.stage.thud > 0 && !reduced) {
      const d = camera.position.distanceTo(this.stage.thudAt)
      if (d < 34) { this.shake = (1 - d / 34) * 0.07; this.shakeT = 0 }
    }
    this.shakeT += dt
    if (this.shakeT > 0.7 || this.shake <= 0) return
    const k = this.shake * Math.exp(-this.shakeT * 7)
    camera.position.y += k * Math.sin(this.shakeT * 46)
    camera.position.x += k * 0.5 * Math.sin(this.shakeT * 37 + 1)
    camera.updateMatrixWorld()
  }

  // ---- the frame

  place(f: CrewFrame): void {
    this.frameNo++
    this.stageHold = -1
    const pr = this.prims
    pr.begin()
    this.stage.begin()
    this.rings = 0
    this.ringMat.uniforms.uTime.value = f.time
    const snap = f.snap, env = f.env
    // People and machines are drawn larger than life as the camera draws back, so that a person never falls below
    // about fifty pixels on the screen and a tractor about sixty.
    const perUnit = this.screenH / (2 * Math.tan((f.camera.fov * Math.PI) / 360)) / Math.max(1, f.dist)
    const bigMachine = clamp(64 / (1.27 * perUnit), 1, 2.9)
    const big = clamp(50 / (0.78 * FIGURE * perUnit), 1, bigMachine * 1.3) * FIGURE
    const cold = env.snow > 0.3
    this.cold = cold
    const going = snap.mode === 'season' ? f.advancing || f.dayT < 1 : snap.mode !== 'title'
    const far = smooth(22, 55, f.dist) * (f.season ? 1 : 0.6)
    this.far = far
    GRIME.value.set(0.52, 0.42, 0.31).lerp(V.set(0.2, 0.15, 0.11), clamp(env.wet * 1.4 - 0.3, 0, 1))
    const sf: StageFrame = { pr, particles: f.particles, dt: f.dt, time: f.time, s: big, snap, wind: env.wind, cold, still: f.reduced, going }
    const mf: MachineFrame = {
      dt: f.dt, time: f.time, particles: f.particles, dust: f.dust, mud: clamp(env.wet * 1.5 - 0.5, 0, 1), still: f.reduced || f.idle, cold: snap.weather.tmin < 4,
      lamps: clamp(Math.max(smooth(0.16, 0.06, Math.sin(env.sunEl)), env.cloud > 0.9 ? 0.5 + 0.5 * Math.max(env.rain, env.mist) : 0), 0, 1),
    }
    for (const r of this.rigs) { r.moved = 0; r.turn = 0; r.state.working = 0; r.state.kind = 'travel'; r.state.driver = null; r.state.load = 0 }

    // Each person's day; those at staged work are gathered by site and placed by the stage.
    const sites = new Map<string, { kind: string; field: number; ws: Worker[]; who: Actor[] }>()
    const enlist = (key: string, kind: string, field: number, a: Actor, w: number) => {
      let s = sites.get(key)
      if (!s) { s = { kind, field, ws: [], who: [] }; sites.set(key, s) }
      const wk = a.worker
      wk.dress = cold ? a.coat : a.dress
      wk.tired = a.tired
      wk.w = w
      wk.x = a.x; wk.z = a.z; wk.heading = a.heading
      wk.lift = 0
      wk.aboard = false
      wk.rig = a.rig ? { x: a.rig.x, z: a.rig.z, heading: a.rig.heading, load: 0 } : null
      wk.pose.reset()
      s.ws.push(wk)
      s.who.push(a)
    }
    this.actors.forEach((a, k) => {
      a.shown = a.away ? 0 : Math.min(1, a.shown + f.dt * 2)
      a.scale = big
      if (a.away) return
      if (a.post && snap.mode !== 'season') { const [fs, kind] = a.post.split('|'); enlist(a.post, kind, Number(fs), a, 0.5); return }
      const site = this.step(a, k, f, going, big)
      if (site) enlist(site.key, site.kind, site.field, a, site.w)
    })
    for (const [key, s] of sites) {
      this.stage.work(key, s.kind, s.field, s.ws, sf)
      s.who.forEach((a, i) => {
        const w = s.ws[i]
        a.x = w.x; a.z = w.z; a.heading = w.heading
        a.aboard = w.aboard && !!a.rig
        if (a.rig && w.rig) {
          const r = a.rig
          const moved = Math.hypot(w.rig.x - r.x, w.rig.z - r.z)
          this.driveTo(r, w.rig.x, w.rig.z, w.rig.heading, moved, f.dt, true)
          r.state.load = w.rig.load
          r.state.kind = 'haul'
          if (r.kind === 'tractor') (r.machine as Tractor).setImplement('trailer')
        }
        if (a.aboard) return
        if (!going) this.idle(a, f, w.pose)
        this.figure(a, w.pose, big, w.lift)
        this.ring(a.x, heightAt(a.x, a.z), a.z, 0.56 * big, a, f, far)
      })
    }

    // Machines: where their drivers took them, or where they were left.
    for (const r of this.rigs) {
      const holder = r.holder >= 0 ? this.actors.find(a => a.id === r.holder) : undefined
      const y = heightAt(r.x, r.z)
      // a machine standing idle in the yard is not drawn as large as one at work, or the yard is all machines
      const parked = !holder && Math.hypot(r.x - r.home.x, r.z - r.home.z) < 0.5
      const s = parked ? Math.min(bigMachine, 1.5) : bigMachine
      const ahead = heightAt(r.x + Math.cos(r.heading) * 0.6 * s, r.z + Math.sin(r.heading) * 0.6 * s)
      const behind = heightAt(r.x - Math.cos(r.heading) * 0.6 * s, r.z - Math.sin(r.heading) * 0.6 * s)
      r.machine.place(r.x, y + 0.01, r.z, r.heading, Math.atan2(ahead - behind, 1.2 * s), s)
      r.state.moved = r.moved
      r.state.turn = r.turn
      r.state.driver = holder && holder.aboard ? (cold ? holder.coat : holder.dress) : null
      if (r.kind === 'tractor') (r.machine as Tractor).draw(pr, mf, r.state)
      else (r.machine as Car).draw(pr, mf, r.state)
      if (holder && holder.aboard) {
        holder.head.copy(drawn.head)
        holder.scale = s
        this.ring(r.x, y, r.z, 1.2 * s, holder, f, far)
      }
      if (r.broken && !f.reduced && Math.random() < 0.12) {
        r.machine.point(0.3, 0.95, 0, V)
        f.particles.emit(V.x, V.y, V.z, 0, 0.5, 0, 0.1 * s, 0.4 * s, 2.4, 0.75, 0.75, 0.78, 0.3, 0.8)
      }
    }

    this.callersAndLife(f, sf, mf, big, bigMachine, going)
    this.ringGeo.instanceCount = this.rings
    this.rAt.needsUpdate = true
    this.rInfo.needsUpdate = true
    this.rCol.needsUpdate = true
    pr.end()
  }

  private ring(x: number, y: number, z: number, radius: number, a: Actor, f: CrewFrame, far: number): void {
    const picked = a.id === f.picked ? 1 : 0
    const level = Math.max(far, picked) * a.shown
    if (level < 0.02 || this.rings >= MAX_RINGS) return
    const k = this.rings++
    this.rAt.setXYZW(k, x, y + 0.07, z, radius * (1 + 0.25 * picked))
    this.rInfo.setXY(k, level * (picked ? 1 : 0.85), picked)
    const c = a.dress.shirt
    this.rCol.setXYZ(k, c.r * 1.7 + 0.1, c.g * 1.7 + 0.1, c.b * 1.7 + 0.1)
  }

  private figure(a: Actor, pose: Pose, scale: number, lift = 0): void {
    const y = heightAt(a.x, a.z) + 0.02 + lift * scale
    figureMatrix(M, a.x, y, a.z, a.heading, scale * (0.3 + 0.7 * a.shown))
    drawFigure(this.prims, M, this.cold ? a.coat : a.dress, pose)
    a.head.copy(drawn.head)
    a.scale = scale
  }
  private cold = false
  private screenH = 900
  private lively = true
  private far = 0
  private pondWas = 0

  // Between jobs and at the day's end: standing easy, or sitting down when worn out.
  private idle(a: Actor, f: CrewFrame, pose: Pose): void {
    if (a.worn > 0.72) sit(pose, f.time + a.id, 0, a.tired)
    else stand(pose, f.time + a.id * 3.1, a.tired, a.style)
  }

  private driveTo(r: Rig, x: number, z: number, heading: number, moved: number, dt: number, exact = false): void {
    const jump = moved > 3
    let d = heading - r.heading
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    r.turn = clamp(d * 1.5, -1, 1)
    r.heading += jump || exact && moved < 1e-4 ? d : moved > 1e-4 ? d * Math.min(1, dt * 7 + moved * 2) : 0
    r.x = x
    r.z = z
    r.moved = jump ? 0 : moved
    r.drawnAt = this.frameNo
  }

  // One person at this point of their day. Returns the staged work they are at, if any.
  private step(a: Actor, k: number, f: CrewFrame, going: boolean, big: number): { key: string; kind: string; field: number; w: number } | null {
    let segIdx = -1
    for (let s = 0; s < a.segs.length; s++) if (f.dayT >= a.segs[s].start) segIdx = s
    const seg: Seg | null = segIdx >= 0 ? a.segs[segIdx] : null
    if (segIdx !== a.clockSeg) { a.clockSeg = segIdx; a.segClock = 0 } else a.segClock += f.dt * (f.advancing ? 1 : f.pace)
    const pose = a.pose.reset()
    const rig = a.rig
    const passed = (arc: number) => f.passed(k, segIdx, arc)
    const tractor = rig && rig.kind === 'tractor' ? rig.machine as Tractor : null
    let px = a.x, pz = a.z
    const foot = (e: { x: number; z: number; dx?: number; dz?: number }, load = 0) => {
      const step = Math.hypot(e.x - a.x, e.z - a.z)
      if (step > 1e-4 && step < 3 && e.dx !== undefined) a.heading = Math.atan2(e.dz!, e.dx)
      a.gait += Math.min(f.dt * 13, (step / (0.46 * big)) * Math.PI * 2)
      px = e.x; pz = e.z
      walk(pose, a.gait, step > 1e-4 ? 1 : 0, a.tired, load)
      a.aboard = false
    }
    const ride = (e: { x: number; z: number; dx: number; dz: number }) => {
      if (!rig) { foot(e); return }
      const moved = Math.hypot(e.x - rig.x, e.z - rig.z)
      this.driveTo(rig, e.x, e.z, Math.atan2(e.dz, e.dx), moved, f.dt)
      px = e.x; pz = e.z
      a.aboard = true
    }
    let site: { key: string; kind: string; field: number; w: number } | null = null
    if (!seg) {
      // no part in today's work: where the day off, the sick bed or the yard has them
      this.atEase(a, f, pose, big)
      if (a.aboard && rig) { a.x = rig.x; a.z = rig.z; a.heading = rig.heading; return null }
      this.figure(a, pose, big)
      this.ring(a.x, heightAt(a.x, a.z), a.z, 0.56 * big, a, f, this.far)
      return null
    }
    const span = Math.max(1e-6, seg.end - seg.start)
    let p = Math.min(1, (f.dayT - seg.start) / span)
    seg.polys ??= { walkTo: new Poly(seg.walkTo), travel: new Poly(seg.travel), path: new Poly(seg.path) }
    const { walkTo, travel, path } = seg.polys
    const lw = seg.walkTo.length ? walkTo.length : 0, lt = travel.length
    let tShare = seg.kind === 'travel' ? 1 : lw + lt > 0.3 ? Math.min(0.4, 0.12 + (lw + lt) / 150) : 0
    if (seg.kind === 'sample' || seg.kind === 'dig') {
      // However long the day is, the hill is up or the last row out inside two and a half seconds, and the day waits for it.
      const drive = lw + lt > 0.3 ? STAGE_DRIVE_S : 0, work = STAGE_S[seg.kind]
      p = Math.min(1, a.segClock / (drive + work))
      tShare = drive / (drive + work)
      if (p < 0.92 && f.season) this.stageHold = this.stageHold < 0 ? seg.end - 1e-3 : Math.min(this.stageHold, seg.end - 1e-3)
    }
    if (p < tShare || seg.kind === 'travel') {
      // on the way: on foot to the machine if it stands elsewhere, then the drive; or on foot all the way
      const q = seg.kind === 'travel' ? p : p / tShare
      const e = q * q * (3 - 2 * q)
      const wShare = lw > 0 ? lw / (lw + lt * 0.5) : 0
      if (e < wShare) foot(walkTo.at((e / wShare) * lw))
      else {
        const along = travel.at(((e - wShare) / Math.max(1e-6, 1 - wShare)) * lt)
        if (seg.ride && rig) ride(along)
        else foot(along)
      }
      if (seg.kind === 'travel' && p >= 1 && !a.aboard) { a.x = px; a.z = pz; this.atEase(a, f, pose, big); px = a.x; pz = a.z }
      passed(-1)
      if (tractor && seg.ride === 'tractor' && seg.kind !== 'travel') tractor.setImplement(implementFor(seg.kind, f.snap.farm.equipment.includes('harvester')))
    } else {
      const w = (p - tShare) / (1 - tShare)
      if (seg.site) {
        // the way there went by unseen (the clock ran fast): they are there
        const spot = seg.path[0]
        if (Math.hypot(spot.x - a.x, spot.z - a.z) > 9 && !rig) { a.x = spot.x; a.z = spot.z }
        if (rig && seg.ride && Math.hypot(spot.x - rig.x, spot.z - rig.z) > 9 && w < 0.4) { rig.x = spot.x; rig.z = spot.z; rig.moved = 0 }
        site = { key: seg.site, kind: seg.site.split('|')[1], field: seg.field, w }
      } else if (!seg.walker && rig) {
        // Dig day is staged: the digger is lowered at the row's end, the rows come out, and the tractor stands at the finish.
        const lead = seg.kind === 'dig' ? 0.05 : 0, tail = seg.kind === 'dig' ? 0.08 : 0
        const run = clamp((w - lead) / (1 - lead - tail), 0, 1)
        ride(path.at(run * path.length))
        rig.state.working = run > 0 && run < 1 ? 1 : 0
        rig.state.kind = seg.kind
        if (tractor) tractor.setImplement(implementFor(seg.kind, f.snap.farm.equipment.includes('harvester')))
        const arc = run >= 1 ? Infinity : run * path.length
        passed(arc)
        if (seg.kind === 'dig') this.dug(a, segIdx, seg, arc, f.snap)
      } else if (seg.kind === 'sample') {
        // The test dig is staged: the walk in, the fork set and the hill lifted, then a moment to look.
        const go = Math.min(1, w / 0.5)
        const e = path.at(go * path.length)
        if (go < 1) foot(e)
        else {
          px = e.x; pz = e.z
          a.heading = -Math.PI / 2
          a.aboard = false
          const dig = clamp((w - 0.5) / 0.26, 0, 1)
          if (dig < 1) forking(pose, dig)
          else {
            // the fork stood in the ground at his side, and the hill's tubers on a tray to be looked at
            stand(pose, f.time, a.tired, 0)
            stoop(pose, 0.32, 0, false)
            pose.gripL = true
            pose.handL.set(0.14, 0.45, -0.17)
            pose.tool = 'fork'
            pose.toolA.set(0.13, 0.64, -0.17)
            pose.toolB.set(0.16, 0.12, -0.17)
            const hill = seg.reveals[0] ? hillPos(seg.field, seg.reveals[0].hill) : null
            if (hill) this.prims.put('box', V.set(hill.x - 0.02, heightAt(hill.x, hill.z + 0.34) + 0.0, hill.z + 0.34), V2.set(0, 1, 0), AXIS_X, 1.08, 0.035, 0.3, TRAY)
          }
        }
        passed(w >= 0.64 ? Infinity : -1)
      } else {
        // walking the rows: the scout stops and bends to a plant; pulling blighted plants, a stoop at each and a sack filling
        const stops = seg.kind === 'scout' ? 7 : Math.min(14, Math.max(3, seg.path.length - 2))
        const u = w * stops, n = Math.floor(u), q = u - n
        const moveShare = seg.kind === 'scout' ? 0.62 : 0.5
        const along = (n + Math.min(1, q / moveShare)) / stops
        const e = path.at(Math.min(1, along) * path.length)
        if (q < moveShare || w >= 1) foot(e, 0)
        else {
          px = e.x; pz = e.z
          a.aboard = false
          const bend = Math.sin(((q - moveShare) / (1 - moveShare)) * Math.PI)
          pose.reset()
          stoop(pose, bend, f.time * 5, seg.kind !== 'scout')
        }
        if (seg.kind === 'rogue') { pose.held = 'sack'; pose.size = 0.6 + 0.6 * w }
        if (w >= 1) this.idle(a, f, pose)
        passed(w * path.length)
      }
    }
    if (site) return site
    if (a.aboard && rig) { a.x = rig.x; a.z = rig.z; a.heading = rig.heading; return null }
    a.x = px
    a.z = pz
    this.figure(a, pose, big)
    this.ring(a.x, heightAt(a.x, a.z), a.z, 0.56 * big, a, f, this.far)
    return null
  }

  // Not at work: a Sunday on the porch, laid up in a chair, waiting in the yard, or stood where the last job ended.
  private atEase(a: Actor, f: CrewFrame, pose: Pose, big: number): void {
    const g = a.goal
    const k = a.home ? Math.max(1, big * 0.72) : 1
    const there = g && (Math.hypot(g.x - a.x, g.z - a.z) < 1.2 || (a.home === g && Math.hypot(DOOR.x + (g.x - DOOR.x) * k - a.x, DOOR.z + (g.z - DOOR.z) * k - a.z) < 1.2))
    if (a.aboard && a.rig) return
    if (g && there) {
      a.x = g.x; a.z = g.z
      a.heading = g.heading
      this.spread(a, big)
      if (a.state === 'hurt') { sit(pose, f.time + a.id, 0.2, 0.5); pose.held = 'sling'; pose.gripL = true; pose.handL.set(0.1, 0.36, 0.0) }
      else if (a.state === 'mend') {
        // leaning in over the engine with a wrench, straightening now and then to look at it
        const u = (f.time * 0.21 + a.id * 0.3) % 1
        if (u < 0.78) hammering(pose, u < 0.5 ? 1.2 : f.time * 7, 0.52)
        else stand(pose, f.time, a.tired, 1)
      }
      else if (g.seat !== undefined && g.seat >= 0 && a.state === 'sunday') sit(pose, f.time + a.id * 2, g.seat, a.tired * 0.5)
      else stand(pose, f.time + a.id * 3.1, a.tired, a.state === 'sunday' ? 1 + (a.id % 2) : a.style)
    } else if (f.snap.mode === 'cellar' && a.kind === 'farmer') {
      // the cellar months: splitting stove wood by the back door
      const u = (f.time / 1.5 + 0.2) % 1
      swing(pose, u < 0.55 ? 1 - smoothstep(u / 0.55) : u < 0.66 ? (u - 0.55) / 0.11 : 1, true)
      pose.tool = 'axe'
      V.set(a.x + Math.cos(a.heading) * 0.42 * big, heightAt(a.x, a.z), a.z + Math.sin(a.heading) * 0.42 * big)
      this.prims.put('log', V, V2.set(0, 1, 0), V2, 0.24 * big, 0.2 * big, 0.24 * big, WHITE)
    } else {
      if (!a.segs.length) this.spread(a, big)
      this.idle(a, f, pose)
    }
  }

  // Drawn large from far off, people standing about in the dooryard stand further apart, so each can be told from the rest.
  private spread(a: Actor, big: number): void {
    if (!a.home) return
    const k = Math.max(1, big * 0.72)
    a.x = DOOR.x + (a.home.x - DOOR.x) * k
    a.z = DOOR.z + (a.home.z - DOOR.z) * k
  }

  // The digger has passed these hills: the pickers and the crows go to them.
  private dug(a: Actor, segIdx: number, seg: Seg, arc: number, snap: Snapshot): void {
    let g = this.gangs.get(seg.field)
    if (!g) {
      const corner = restAt(seg.field, 1, true)
      g = { field: seg.field, pickers: [], recent: [], crows: [], idle: 0 }
      for (let k = 0; k < 5; k++) g.crows.push({ x: corner.x - 3 - k, z: corner.z + 2, fx: 0, fz: 0, tx: corner.x - 3 - k, tz: corner.z + 2, t: 1, wait: 1 + k, h: k })
      this.gangs.set(seg.field, g)
    }
    g.idle = 0
    const want = snap.farm.pickers ? 9 : 2
    while (g.pickers.length < want) {
      const k = g.pickers.length
      const corner = restAt(seg.field, 0, true)
      g.pickers.push({ dress: this.extras[(k + seg.field * 3) % this.extras.length], x: corner.x - 1 - 0.5 * k, z: corner.z + 0.8, tx: corner.x - 1, tz: corner.z + 1, wait: 0.3 * k, heading: 1.6, gait: k, bent: 0 })
    }
    g.pickers.length = Math.min(g.pickers.length, want)
    let n = a.next[segIdx] ?? 0
    while (n < seg.reveals.length && seg.reveals[n].at <= arc) {
      const p = hillPos(seg.field, seg.reveals[n].hill)
      g.recent.push(p)
      if (g.recent.length > 30) g.recent.shift()
      n++
    }
    a.next[segIdx] = n
  }

  private callersAndLife(f: CrewFrame, sf: StageFrame, mf: MachineFrame, big: number, bigMachine: number, going: boolean): void {
    const pr = this.prims, snap = f.snap
    const pose = POSE
    // People leaving the farm: down the road with a bag, and gone.
    this.leavers = this.leavers.filter(l => l.at < l.path.length)
    for (const l of this.leavers) {
      const step = (going ? 2.4 : 0) * big * f.dt
      l.at += step
      l.gait += f.dt * 9
      const e = l.path.at(l.at)
      walk(pose, l.gait, 1, 0.3, 0)
      pose.held = 'bag'
      figureMatrix(M, e.x, heightAt(e.x, e.z) + 0.02, e.z, Math.atan2(e.dz, e.dx), big * clamp((l.path.length - l.at) / 3, 0, 1))
      drawFigure(pr, M, l.dress, pose)
    }
    // Callers: people asking for work at the gate, a neighbour after one of ours, a buyer at the potato house.
    let asking = snap.mode === 'plan' ? snap.farm.applicants : 0
    let poach = false, buyer = false
    for (const inc of snap.farm.incidents) {
      if (inc.kind === 'applicant') asking++
      else if (inc.kind === 'poach') poach = true
      else if (inc.kind === 'buyer') buyer = true
    }
    for (let k = 0; k < Math.min(4, asking); k++) {
      stand(pose, f.time + k * 2.3, 0.1, k === 1 ? 4 : 0)
      pose.held = 'bag'
      figureMatrix(M, GATE.x + 0.75 * k * big * 0.6, heightAt(GATE.x + 0.75 * k, GATE.z) + 0.02, GATE.z + 0.35 * (k % 2) * big, GATE.heading + 0.3 * k, big)
      drawFigure(pr, M, ASKING[k % ASKING.length], pose)
    }
    const caller = (kind: 'pickup' | 'sedan', on: boolean, spot: Spot, man: Spot, dress: Dress, style: number) => {
      let car = this.callers[kind]
      if (!on) { if (car) car.group.visible = false; return }
      if (!car) { car = new Car(kind, kind === 'pickup' ? '#59664a' : '#1d2023', kind === 'sedan' ? '#b9bcbf' : '#c9c4b4'); this.callers[kind] = car; this.group.add(car.group) }
      car.group.visible = true
      car.place(spot.x, heightAt(spot.x, spot.z) + 0.01, spot.z, spot.heading, 0, bigMachine)
      car.draw(pr, mf, IDLE)
      stand(pose, f.time * 1.1 + style, 0, style)
      figureMatrix(M, man.x, heightAt(man.x, man.z) + 0.02, man.z, man.heading, big)
      drawFigure(pr, M, dress, pose)
    }
    caller('pickup', poach, CALLER.truck, CALLER.man, NEIGHBOUR, 1)
    caller('sedan', buyer, BUYER.car, BUYER.man, BUYER_MAN, 2)

    // Pickers behind the digger, and the crows that follow it.
    for (const [field, g] of this.gangs) {
      const digging = snap.mode === 'season' && (snap.fields[field].status === 'digging' || snap.fields[field].status === 'dug') && g.idle < 40
      if (!digging) { this.gangs.delete(field); continue }
      if (going) g.idle += f.dt
      g.pickers.forEach((p, k) => {
        const dx = p.tx - p.x, dz = p.tz - p.z, dist = Math.hypot(dx, dz)
        if (dist > 0.25 * big) {
          const step = Math.min(dist, (going ? 2.6 : 0) * big * f.dt)
          p.x += (dx / dist) * step
          p.z += (dz / dist) * step
          p.heading = Math.atan2(dz, dx)
          p.gait += f.dt * 10
          p.bent = Math.max(0, p.bent - f.dt * 4)
          walk(pose, p.gait, 1, 0, 0)
        } else {
          if (going) p.wait -= f.dt
          p.bent = Math.min(1, p.bent + f.dt * 3)
          pose.reset()
          stoop(pose, p.bent * (0.82 + 0.18 * Math.sin(f.time * 3 + k)), f.time * 6 + k)
          if (p.wait <= 0 && g.recent.length) {
            const t = g.recent[Math.max(0, g.recent.length - 1 - Math.floor(Math.random() * Math.min(14, g.recent.length)))]
            p.tx = t.x + (Math.random() - 0.5) * 0.9
            p.tz = t.z + (Math.random() - 0.5) * 0.9
            p.wait = 1.2 + Math.random() * 2.2
          }
        }
        pose.held = 'basket'
        figureMatrix(M, p.x, heightAt(p.x, p.z) + 0.02, p.z, p.heading, big)
        drawFigure(pr, M, p.dress, pose)
      })
      for (const c of this.lively ? g.crows : []) {
        if (going) c.t += f.dt / 1.1
        if (c.t >= 1) {
          if (going) c.wait -= f.dt
          if (c.wait <= 0 && g.recent.length > 6) {
            const t = g.recent[Math.floor(Math.random() * Math.max(1, g.recent.length - 6))]
            c.fx = c.x; c.fz = c.z
            c.tx = t.x + (Math.random() - 0.5) * 1.5
            c.tz = t.z + (Math.random() - 0.5) * 1.5
            c.t = 0
            c.wait = 2 + Math.random() * 5
            c.h = Math.atan2(c.tz - c.fz, c.tx - c.fx)
          }
        }
        const q = clamp(c.t, 0, 1)
        if (q < 1) { c.x = c.fx + (c.tx - c.fx) * q; c.z = c.fz + (c.tz - c.fz) * q }
        drawCrow(pr, c.x, heightAt(c.x, c.z) + (q < 1 ? Math.sin(q * Math.PI) * 1.3 * big : 0), c.z, c.h, big * 1.25, q < 1 ? 1 : 0, f.time * 6 + c.wait)
      }
    }
    // The neighbour's cows, out from May until the snow.
    if (this.lively && f.env.snow < 0.1 && snap.mode !== 'cellar') {
      for (const c of this.cows) {
        c.t -= going || snap.mode !== 'season' ? f.dt : 0
        if (c.t <= 0) {
          c.walking = !c.walking
          c.t = c.walking ? 2 + Math.random() * 3 : 8 + Math.random() * 16
          if (c.walking) c.h += (Math.random() - 0.5) * 2
        }
        if (c.walking) {
          const nx = c.x + Math.cos(c.h) * 0.25 * f.dt, nz = c.z + Math.sin(c.h) * 0.25 * f.dt
          if (Math.abs(nx - 37) < 6 && Math.abs(nz - 10) < 6) { c.x = nx; c.z = nz } else c.h += Math.PI * 0.6
        }
        drawBeast(pr, COWS[c.kind], c.x, heightAt(c.x, c.z), c.z, c.h, big * 0.9, f.time * 3 + c.kind, c.walking ? 0.7 : 0, c.walking ? 0 : 1)
      }
    }
    // A deer at the wood's edge, gone into the trees when anyone comes near.
    const d = this.deer
    let near = false
    for (const a of this.actors) if (Math.hypot(a.x - d.x, a.z - d.z) < 11) near = true
    d.away = clamp(d.away + (near ? f.dt * 0.9 : -f.dt * 0.06), 0, 1)
    d.t += f.dt
    if (this.lively && d.away < 0.99 && snap.mode !== 'title') {
      const z = d.z - d.away * 5
      drawBeast(pr, DEER, d.x - d.away * 2, heightAt(d.x, z), z, near ? -1.9 : 0.4, big * 0.9 * (1 - 0.5 * d.away), d.away > 0.02 ? f.time * 14 : 0, d.away > 0.02 && d.away < 0.99 ? 1 : 0, near ? 0 : (Math.sin(d.t * 0.4) > 0.2 ? 1 : 0))
    }
    void sf
  }

  // At the lowest setting the small parts throw no shadows, and the cows, the deer and the crows stay away.
  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.lively = tier !== 'low'
    this.prims.setShadows(tier !== 'low')
  }

  // The screen's size in CSS pixels, for how large people must be drawn to be seen.
  setScreen(_w: number, h: number): void { this.screenH = Math.max(200, h) }

  // The person under a point on the screen (CSS pixels), or -1: on their body, or on the machine they are on. The reach
  // is generous when they are small on the screen.
  pick(x: number, y: number, camera: PerspectiveCamera, w: number, h: number, _markers = false): number {
    let best = -1, bd = Infinity
    const screen = (px: number, py: number, pz: number): [number, number] | null => {
      this.v.set(px, py, pz).project(camera)
      return this.v.z > 1 ? null : [(this.v.x + 1) / 2 * w, (1 - this.v.y) / 2 * h]
    }
    for (const a of this.actors) {
      if (a.shown < 0.5) continue
      const s = a.scale
      const base = heightAt(a.x, a.z)
      const body = screen(a.x, base + (a.aboard ? 0.6 : 0.4) * s, a.z)
      if (!body) continue
      const edge = screen(a.x, base + (a.aboard ? 1.5 : 0.95) * s, a.z)
      const r = Math.max(22, edge ? Math.hypot(edge[0] - body[0], edge[1] - body[1]) * (a.aboard ? 1.25 : 1.1) : 22)
      const d = Math.hypot(body[0] - x, body[1] - y)
      if (d < r && d < bd) { bd = d; best = a.id }
    }
    return best
  }

  dispose(): void {
    this.ringGeo.dispose()
    this.ringMat.dispose()
    this.prims.dispose()
    for (const r of this.rigs) r.machine.dispose()
    this.callers.pickup?.dispose()
    this.callers.sedan?.dispose()
  }
}

// People are drawn a little larger than the machines' scale, so a man at the wheel is not lost in the tractor.
const FIGURE = 1.14
const DOOR = { x: 20.6, z: -6.9 }
const POSE = new Pose()
const AXIS_X = new Vector3(1, 0, 0), TRAY = new Color('#cbb98e')
const WHITE = new Color(1, 1, 1)
const IDLE: MachineState = { moved: 0, turn: 0, working: 0, kind: 'travel', driver: null, load: 0 }
const ASKING: Dress[] = [
  dressOf({ shirt: '#6f6a5c', trousers: '#3d3a35', hat: '#4a4640', hatKind: 'cap', hair: '#5a3d24' }),
  dressOf({ shirt: '#7d6a4f', trousers: '#33373d', hat: '#8c7a5a', hatKind: 'brim', hair: '#2b211a', skin: '#c48a62' }),
  dressOf({ shirt: '#5c6670', trousers: '#4a4136', hat: '#3b3f45', hatKind: 'cap', hair: '#8a6a3c', skin: '#f0c8a8' }),
]
const NEIGHBOUR = dressOf({ shirt: '#4d5a46', trousers: '#3d3a35', hat: '#6b5a3c', hatKind: 'brim', hair: '#b9b4a8', build: 1.1 })
const BUYER_MAN = dressOf({ shirt: '#2f3238', trousers: '#2a2c31', hat: '#3a3836', hatKind: 'fedora', hair: '#2b211a', build: 1.05 })
const smoothstep = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c) }
