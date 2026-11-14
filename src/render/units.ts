// Everyone and everything that works on the map: each person of the farm, on foot, on a tractor or in the truck,
// playing out their own day along the farm's roads; the machines, kept where they were left; the work staged at each
// place; and the callers, pickers and animals that come with it. Everything is drawn at its true size whatever the
// distance: the interface pins a face to each person at `anchor`, the scene marks only the ground under whoever is
// picked, and a click near a person, their pin's foot or their machine picks them.
import {
  BufferAttribute, Color, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, ShaderMaterial, Vector3, type PerspectiveCamera,
} from 'three'
import { PARCELS, STUMP_DAYS, type UnitKind } from '../sim/index.ts'
import type { Thing, ThingKind } from '../game/contracts.ts'
import { COWS, COW_SCALE as COW, DEER, drawBeast, drawCrow } from './animals.ts'
import { LOD, Pose, dressFor, dressOf, drawFigure as drawPerson, drawn, figureMatrix, forking, hammering, sit, stand, stoop, swing, walk, type Dress } from './crew.ts'
import type { Env } from './env.ts'
import { UI_GAIN, type HillDisplay } from './fields.ts'
import { level } from './arch.ts'
import { BAYS, FD, FIELDS, FW, HOUSE, IMPLEMENT_SPOTS, POTATO_HOUSE, ROAD, fieldAt, hillPos, route, siteOf, woodFront, type Pt } from './layout.ts'
import { FIGURE, TRUE_SIZE } from './measures.ts'
import { K, S } from './scale.ts'

export { TRUE_SIZE }
import { clamp, hash2, smooth } from './noise.ts'
import type { Particles } from './particles.ts'
import { Prims } from './prims.ts'
import type { StandTree } from './flora.ts'
import { Stage, type StageFrame, type Worker } from './stage.ts'
import type { Snapshot, UnitVis } from './state.ts'
import { Car, GRIME, PAINTS, Tractor, Yarded, implementFor, type MachineFrame, type MachineState, type YardKind } from './tractor.ts'
import {
  BUYER, CALLER, DOORYARD_AT, GATE, LIVE_PACE, MACHINE_JOBS, OFF_FARM, PACE, PORCH_AT, Poly, SITE_JOBS, buildSite, cropDoor, heightAt, idleSpot, machineHome, packSite, planDay, restAt, sickSpot, siteAt, sundaySpot, wayFrom,
  type CrewFrom, type Reveal, type Ride, type Seg, type Spot,
} from './work.ts'

// A test dig and a day's digging keep their own time, because the interface waits for them: the hill lifted, the
// day's band of rows out. (With a tool holding the day at a point a test dig is the drive in and the work, as it was.)
const STAGE_DRIVE_S = 0.5
const STAGE_S = { sample: 2, dig: 0.8 }
const SAMPLE_S = 1
// The way to a part of the day's work is seen on a clock of its own, whatever the game's clock is doing, for no longer
// than this at each clock setting (seconds; and the walk to a machine someone else left, HAND_S at most): the day is not
// held for it, and the work at the far end is what is to be seen. (A day lasts four seconds at 1x, a second and a
// third at 3x, half a second at 8x.)
const WAY_MOST = [2.4, 2.4, 1.5, 1.1]
// A cut way shorter than this (metres) is seen for less, in proportion, down to this share of the time; so is the
// rest of the way of someone who had set out for the work before its day was counted.
const WAY_FULL = 200, WAY_SHORT = 0.6, WAY_LED = 0.7
// The walk in from the road of someone who has been off the farm, as a share of a day's length.
const ARRIVE = 0.5
// Each part of a day's work is seen for at least this long at each clock setting (seconds) before whoever does it
// goes on: a machine's passes at a pace the eye can follow, however fast the days go by. The picture then falls
// behind the days; what was not seen is passed over, and the newest work is what is shown next.
const WORK_LEAST = [4.4, 4.4, 3.2, 2.6]
// The longest anyone stands waiting for a machine that whoever has it has not been seen to let go (seconds): then it
// is taken as it stands.
const WAIT_MOST = 9
// Between the parts of a day (a wait for a machine, the day's work done) their own clock runs on at no less than
// this many days a second: the wait itself is seen for as long as the machine is seen elsewhere.
const GAP_RATE = 2.5
// On the way to an order before its day has been counted: no faster than this (m/s at 1x), and never cut.
const LEAD_PACE = 13
// A walk to the machine is seen for no longer than this (seconds); a longer one is cut to its setting off.
const HOP_S = 1.3
// Seconds a way takes getting up to pace, and coming down from it.
const RAMP_S = 1.1
// The same before what the interface waits for, in seconds.
const WAY_STAGED: Record<string, [number, number]> = { sample: [0.6, 0.75], dig: [0.7, 0.9] }
// A way too long to go at a pace the eye can follow is cut: they pull away for this share of the time, and are next
// seen coming in over the last stretch.
const WAY_LEAD = 0.3
// (someone coming in by the road is seen on it for half the time; a machine taken where it was left, pulling away)
const WAY_LEAD_IN = 0.5
const WAY_TAKEN = 0.42
// Taking over a machine someone else has left: seconds seen going to it at 1x, and how much of a way's time the drive
// away with it then has.
const HAND_S = 1, HAND_DRIVE = 0.85
// How much quicker than the clock the day's work is seen through by someone behind it.
const CATCH_UP = 1.6
// The fastest anyone is seen to go at 1x, catching up with where the day's script has them: on foot, and driving
// (m/s); half as fast again at 3x and two and a half times at 8x. The script's own ways keep within it.
const FOOT_MOST = 9, RIG_MOST = 28
// Faster than this over the ground (metres a second) without stepping is a slide.
const SLID = 0.45
const QUICK = [1, 1, 1.5, 2.4]
// Hauling with the clock stopped: seconds to a load, there and back.
const HAUL_LAP_S = 130
const MAX_RINGS = 2

// gen: which day's plan it belongs to (someone still seen at an earlier day's work has yet to come to it)
export type PendingReveal = Reveal & { unit: number; seg: number; gen: number }

interface Rig {
  kind: 'tractor' | 'truck'
  k: number                // which of its kind
  key: string              // as the day's record names it today: 'tractor0', 'truck'
  machine: Tractor | Car
  x: number
  z: number
  heading: number
  sx: number               // where it is seen: x, z go where the day's script puts it; sx, sz follow, never jumping
  sz: number
  holder: number           // the person who has it, or -1
  last: number             // and who had it last, or -1
  home: Spot
  broken: boolean
  moved: number            // this frame
  turn: number
  fade: number             // 1 as it is; less while it goes from sight and comes back where a way is cut
  state: MachineState
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
  sx: number               // where they are seen: x, z go where the day's script puts them; sx, sz follow, never jumping
  sz: number
  heading: number
  rig: Rig | null          // the machine in hand
  aboard: boolean
  shown: number
  away: boolean            // laid off for the winter, or home for a day off: not on the farm
  leaving: boolean         // home for the day off once the work they are being seen at has been seen
  home: Spot | null        // their place in the dooryard or on the porch when there is nothing to do
  about: Pt                // what that place is spread out from when people are drawn large
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
  u: number                // their own clock through the day's script, 0..1
  lastT: number            // the day clock when it was last followed
  ay: number               // how high over the ground their pin stands, eased so it does not jump
  arc: number              // how far along the row in hand they have worked, metres
  arcSeg: Seg | null       // and which part of the day that is
  beat: number             // a clock for stopping and bending on a walk through the crop
  line: { key: string; poly: Poly; arc: number; seg: Seg } | null   // the row a machine is working with the clock running
  way: Way | null          // on the way to a part of the day's work
  waySeg: Seg | null       // the part of the day whose way was last settled
  came: Seg | null         // the part of the day they came to by such a way: all of its time is work
  worked: number           // seconds seen at work today
  siteKey: string          // the staged work they were at in the last frame, or ''
  gen: number              // which day's plan they are seen at
  arrived: boolean         // came in by the road for it, and has yet to set out from there
  rate: number             // how much quicker than the clock the day's work is seen through
  hold: boolean            // a load of theirs is on its way in: the machine stays theirs until it is there
  queue: Queued | null     // the day after, waiting until this one's work has been seen
  works: number            // how many parts of the day they are seen at are work
  keep: boolean            // the farm's day leaves them holding a machine (an order still theirs): they stay in its seat
  wait: number             // seconds they have stood waiting for a machine someone else has
  handed: boolean          // the machine in hand was someone else's before: the way to it and away with it is seen
  doing: string            // this frame: 'wait' for a machine someone else has, 'rows' at a machine's row work, or ''
  waited: boolean          // the interface waits to see this day's work: it keeps the day's time
  lead: boolean            // on the way to an order ahead of its day's plan
  led: boolean             // and was, when its plan came
  fade: number             // 1 as they are; less while they go from sight and come back where a way is cut
  cutSeg?: Seg | null      // a long day: the part of the day whose way they have come through a cut for
}

// waited: the interface is waiting to see this day's work (a test dig; the digging of a field whose crop is weighed)
// keep: the day leaves them holding a machine
interface Queued { segs: Seg[]; gen: number; arrives: boolean; waited: boolean; keep: boolean }

// t of T seconds gone over L metres. walk: the first metres are on foot, for `afoot` of the time (hop: only so many
// of them are seen: they set off for the machine, go from sight, and are next seen in its seat). cut: of what is
// left, `lead` metres from its start are seen, then the last `reach` of them; share: of its time, how much is the
// pulling away. ramp: seconds getting up to pace and coming down from it.
interface Way { t: number; T: number; L: number; reach: number; lead: number; cut: boolean; share: number; walk: number; afoot: number; hop: number; ramp: number }

function wayAt(w: Way): number {
  const q = clamp(w.t / w.T, 0, 1)
  if (w.afoot > 0 && q < w.afoot) { const r = q / w.afoot; return w.hop > 0 ? w.hop * r * r : w.walk * r * r * (3 - 2 * r) }
  if (!w.cut) {
    // up to pace, at it, and down from it
    const T = w.T * (1 - w.afoot), t = (q - w.afoot) * w.T, D = w.L - w.walk, ta = Math.min(w.ramp, T / 2), v = D / Math.max(1e-6, T - ta)
    const s = t < ta ? (v * t * t) / (2 * ta) : t < T - ta ? v * (t - ta / 2) : D - (v * (T - t) * (T - t)) / (2 * ta)
    return w.walk + clamp(s, 0, D)
  }
  const from = w.afoot > 0 ? w.walk : 0, qc = (q - w.afoot) / (1 - w.afoot)
  if (qc < w.share) { const r = qc / w.share; return from + w.lead * r * (w.share > WAY_LEAD ? 1 : r) }
  const r = (qc - w.share) / (1 - w.share)
  return w.L - w.reach * (1 - w.share) * (1 - r) * (1 - r)
}

// Whether a day's plan has work in it (and not only a way to somewhere).
const works = (segs: Seg[]): boolean => segs.some(s => s.kind !== 'travel')

interface Leaver { dress: Dress; path: Poly; at: number; gait: number }
interface Picker { dress: Dress; x: number; z: number; tx: number; tz: number; wait: number; heading: number; gait: number; bent: number }
interface Gang { field: number; lead: { x: number; z: number; dx: number; dz: number }; pickers: Picker[]; recent: Pt[]; crows: { x: number; z: number; fx: number; fz: number; tx: number; tz: number; t: number; wait: number; h: number }[]; idle: number }

export interface CrewFrame {
  dt: number
  dayT: number
  advancing: boolean      // the game clock is running (else the day is replayed at `pace`)
  live?: boolean          // a long day, watched as it is worked: everyone is where the day's own time has them
  pace: number
  time: number
  reduced: boolean
  idle: boolean           // outside the season: no work, no exhaust
  season: boolean
  dist: number            // the camera's distance, for how large units are drawn
  dust: number
  dark: number            // how much the hour wants lamps, 0..1
  picked: number          // app.unit
  particles: Particles
  snap: Snapshot
  env: Env
  camera: PerspectiveCamera
  // the hills of this crew's segment `seg` (and all before it) up to arc length `arc` along its path have been passed
  passed: (unit: number, seg: number, arc: number, gen: number) => void
  speed: number           // the game clock's setting, 0..3
  clock: number           // seconds since the last frame as the game's clock counts them (dt is capped shorter)
  daySec: number          // how long a day lasts on the clock, seconds (as at 1x when it is stopped)
}

const M = new Matrix4(), V = new Vector3(), V2 = new Vector3()
// Faces, hands and buttons are drawn within this of the camera; further off a figure is its body and its clothes.
const FINE_WITHIN = 75
const EYE = new Vector3()
function drawFigure(pr: Prims, at: Matrix4, dress: Dress, pose: Pose): void {
  const e = at.elements
  LOD.fine = Math.hypot(e[12] - EYE.x, e[13] - EYE.y, e[14] - EYE.z) < FINE_WITHIN
  drawPerson(pr, at, dress, pose)
}
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
  private mark = 1
  private v = new Vector3()
  private frameNo = 0
  private mode = ''
  private shake = 0
  private shakeT = 9
  private deer = { x: 6.5 * K, z: woodFront(6.5 * K) + 4, away: 0, t: 0 }
  private cows = COWS.flatMap((_, k) => [0, 1, 2].map(n => ({ kind: k, x: COW_AT.x + 30 * (hash2(k * 3 + n, 5) - 0.5), z: COW_AT.z + 30 * (hash2(k * 3 + n, 9) - 0.5), h: hash2(k, n) * 6.28, t: hash2(n, k + 3) * 20, tx: 0, tz: 0, walking: false })))
  private extras: Dress[] = []
  // Whatever else on the land looks like someone or is worth a name, where it was last drawn: the pointer and a click
  // answer for it (Thing in src/game/contracts.ts).
  private things: { kind: ThingKind; k: number; holder: number; x: number; y: number; z: number; tall: number }[] = []
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
      id: u.id, kind: u.kind, slot, dress: dressFor(u.id, false, u.name), coat: dressFor(u.id, true, u.name), segs: [], clockSeg: -2, segClock: 0,
      x: rest.x, z: rest.z, sx: NaN, sz: NaN, heading: rest.heading, rig: null, aboard: false, shown: 0, away: false, home: null, about: DOORYARD_AT, gait: u.id * 1.3, goal: null, state: 'idle', post: '', leaving: false,
      tired: u.tired, worn: u.tired, style: (u.id * 7) % 5, pose: new Pose().reset(), head: new Vector3(rest.x, 1, rest.z), scale: 1, next: [], u: 1, lastT: 1, ay: 2.2, arc: 0, arcSeg: null, beat: 0, line: null,
      way: null, waySeg: null, came: null, worked: 0, siteKey: '', gen: 0, queue: null, arrived: false, rate: 1.6, hold: false, works: 0, keep: false, wait: 0, handed: false, doing: '', waited: false, lead: false, led: false, fade: 1,
      worker: { id: u.id, dress: dressFor(u.id, false, u.name), tired: 0, w: 0, x: rest.x, z: rest.z, heading: 0, lift: 0, pose: new Pose().reset(), aboard: false, rig: null, loads: 1, lit: false },
    }
  }

  private makeRig(kind: 'tractor' | 'truck', k: number): Rig {
    const machine = kind === 'tractor' ? new Tractor(PAINTS[k % PAINTS.length]) : new Car('truck', '#3d5a50')
    const home = machineHome(kind, k, this.shed, this.tractors)
    this.group.add(machine.group)
    return {
      kind, k, key: kind === 'truck' ? 'truck' : `tractor${k}`, machine, x: home.x, z: home.z, sx: NaN, sz: NaN, heading: home.heading, holder: -1, last: -1, home, broken: false, moved: 0, turn: 0, fade: 1,
      state: { moved: 0, turn: 0, working: 0, kind: 'travel', driver: null, load: 0, far: 0 },
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
    // machines: kept in the machine shed's bays once it stands
    const shed = snap.farm.buildings.some(b => b.kind === 'shed' && b.built && b.yard === -1)
    this.tractors = Math.min(3, Math.max(1, snap.farm.tractors))
    this.shed = shed
    for (const r of this.rigs) {
      const home = machineHome(r.kind, r.k, shed, this.tractors)
      if (home.x === r.home.x && home.z === r.home.z) continue
      // standing at its old place with nobody on it: it is moved to the new one
      if (r.holder < 0 && Math.hypot(r.x - r.home.x, r.z - r.home.z) < 0.5) { r.x = home.x; r.z = home.z; r.heading = home.heading }
      r.home = home
    }
    this.equipment = snap.farm.equipment
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
    this.snapSeen = true
    this.sync(snap)
    this.pondWas = snap.farm.pond
    this.progress.clear()
    this.leavers = []
    this.gangs.clear()
    this.stage.clear()
    for (const r of this.rigs) {
      r.x = r.home.x; r.z = r.home.z; r.heading = r.home.heading; r.holder = r.last = -1
      if (r.kind === 'tractor') (r.machine as Tractor).setImplement('none')
    }
    for (const a of this.actors) {
      const u = snap.units.find(w => w.id === a.id)!
      a.rig = null
      a.aboard = false
      a.segs = []
      a.queue = null
      a.lead = false
      a.waited = false
      a.works = 0
      a.keep = !!u.rig
      a.wait = 0
      a.fade = 1
      a.clockSeg = -2
      a.u = a.lastT = 1
      a.shown = 1
      a.post = ''
      a.state = 'idle'
      a.goal = null
      a.away = false
      a.leaving = false
      let r: Spot = snap.mode === 'season' ? (u.at < 0 ? idleSpot(u.at, a.slot, a.kind === 'farmer') : restAt(u.at, a.slot, true)) : idleSpot(-1, a.slot, a.kind === 'farmer')
      if (snap.mode === 'cellar') {
        // the cellar months: at the winter's work, or by the door with the wood to split
        const tract = snap.fields[u.winterField]
        if (u.winter === 'woods' && tract && (tract.cover === 'woods' || tract.cover === 'brush')) a.post = `${u.winterField}|fell`
        else if (u.winter === 'pack' && snap.farm.buildings.some(b => b.kind === 'packing' && b.built)) a.post = '-1|pack'
        else if (u.winter === 'build') { const b = snap.farm.buildings.find(x => !x.built); if (b) a.post = `${b.yard}|build` }
        if (a.kind !== 'farmer' && !a.post) a.away = true
        if (a.kind === 'farmer' && !a.post) r = { x: HOUSE.x - 2.9 * S, z: HOUSE.z - 5.6 * S, heading: 0.2 }
        // already out at the work
        if (a.post.endsWith('|fell')) r = siteAt('fell', u.winterField, snap.fields[u.winterField]?.felled ?? 0)
        else if (a.post.endsWith('|pack')) r = packSite()
        else if (a.post) { const b = snap.farm.buildings.find(x => !x.built); if (b) r = buildSite(b.kind, b.yard) }
      }
      a.x = r.x; a.z = r.z; a.heading = r.heading
      a.home = a.kind !== 'farmer' && !a.post && (snap.mode !== 'season' || u.at === -1) ? r : null
      a.about = DOORYARD_AT
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
    const travel: Pt[] = [{ x: POTATO_HOUSE.x, z: POTATO_HOUSE.z + 2 * S }, ...ROAD.map(([x, z]) => ({ x, z }))]
    a.rig = rig
    rig.holder = a.id
    a.segs = [{ kind: 'travel', field: -1, walker: false, ride: 'tractor', walkTo: [], travel, path: [travel[travel.length - 1]], reveals: [], start: 0, end: 0.8, site: '', lit: false, from: 0 }]
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
      a.home = a.state === 'sunday' || (a.state === 'idle' && a.goal && u.at === -1 && a.kind !== 'farmer') ? a.goal : null
      a.about = a.state === 'sunday' ? PORCH_AT : DOORYARD_AT
      // Someone who lives out is not on the farm on a day off: they are back by the road with the next day's work.
      // (Seen at work still, or waiting their turn at it, with the clock running: they go once that has been seen.)
      const off = snap.restDay && u.livesOut && a.state === 'sunday'
      a.leaving = off && !a.away && !this.stopped && this.unseen(a)
      if (off && !a.leaving) this.goHome(a)
      else if (!off) a.away = false
    }
    // A tractor broken down: whoever was driving it (or else whoever has nothing to do) is at its engine.
    for (const r of this.rigs) {
      if (!r.broken) continue
      const free = (a: Actor) => a.state === 'idle' || a.state === 'sunday'
      const inc = snap.farm.incidents.find(i => i.kind === 'breakdown')
      const who = this.actors.find(a => free(a) && inc && a.id === inc.unit) ?? this.actors.find(a => free(a) && a.kind === 'farmer') ?? this.actors.find(free)
      if (!who) continue
      who.state = 'mend'
      // (beside the engine, at arm's length from it)
      const fwd = 0.3 * TRUE_SIZE, out = 0.6 * TRUE_SIZE
      who.goal = { x: r.x + Math.cos(r.heading) * fwd - Math.sin(r.heading) * out, z: r.z + Math.sin(r.heading) * fwd + Math.cos(r.heading) * out, heading: r.heading - Math.PI / 2 }
    }
  }

  // Whether work of the day they are seen at has yet to be seen.
  private unseen(a: Actor): boolean {
    return a.segs.some(s => s.kind !== 'travel' && a.u < s.end)
  }

  // Off the farm for a day off.
  private goHome(a: Actor): void {
    a.away = true
    a.leaving = false
    a.goal = null; a.home = null; a.x = OFF_FARM.x; a.z = OFF_FARM.z; a.shown = 0
    // (the machine they had stands where they left it, with nobody in its seat)
    if (a.rig) { a.rig.holder = -1; a.rig = null }
    a.aboard = false
    a.line = null
    a.segs = []
    a.queue = null
  }

  // Which of the machines drawn is which of the day's record ('tractor0', 'tractor1': the farm's day names them only
  // by the order it gave them out in). Each name goes to the machine its first user of the day has now, or the one that
  // had the name, or the nearest that runs and is not spoken for.
  private name(snap: Snapshot): void {
    const tractors = this.rigs.filter(r => r.kind === 'tractor')
    const first = new Map<string, number>()
    for (const { w, unit } of snap.units.flatMap(u => u.worked.map(w => ({ w, unit: u.id }))).filter(x => x.w.machine?.startsWith('tractor')).sort((a, b) => (a.w.from ?? 0) - (b.w.from ?? 0))) if (!first.has(w.machine!)) first.set(w.machine!, unit)
    const named = new Map<Rig, string>()
    const free = (r: Rig | null | undefined): r is Rig => !!r && r.kind === 'tractor' && !r.broken && !named.has(r)
    for (const [key, unit] of first) {
      const a = this.actors.find(x => x.id === unit)
      const near = (r: Rig) => (a ? Math.hypot(r.x - a.x, r.z - a.z) : 0)
      const r = free(a?.rig) ? a!.rig! : tractors.find(x => x.key === key && free(x)) ?? tractors.filter(free).sort((p, q) => near(p) - near(q))[0]
      if (r) named.set(r, key)
    }
    const taken = new Set(named.values())
    for (const r of tractors) r.key = named.get(r) ?? (taken.has(r.key) ? '' : r.key)
    for (const r of tractors) {
      if (r.key) continue
      let n = 0
      while (tractors.some(x => x.key === `tractor${n}`)) n++
      r.key = `tractor${n}`
    }
  }

  // Down off a machine, and beside it: it stands where it is, anyone's.
  private letGo(a: Actor): void {
    const r = a.rig
    if (!r) return
    if (a.aboard) { a.x = r.x - Math.sin(r.heading) * 0.95 * TRUE_SIZE; a.z = r.z + Math.cos(r.heading) * 0.95 * TRUE_SIZE }
    a.line = null
    a.doing = ''
    r.holder = -1
    r.last = a.id
    a.rig = null
    a.aboard = false
  }

  // Whether a part of someone's day is done with this machine.
  private uses(s: Seg, r: Rig): boolean {
    return !!s.ride && s.ride === r.kind && (!s.machine || s.machine === r.key)
  }

  // Whether a day of someone else's, being seen or waiting to be, has work for this machine yet to be seen.
  private spoken(r: Rig, but: Actor): boolean {
    return this.actors.some(x => x !== but && !x.away && (x.segs.some(s => this.uses(s, r) && x.u < s.end) || !!x.queue?.segs.some(s => this.uses(s, r))))
  }

  // The machine a part of the day is done with: theirs already, or taken now. The day's record gives each machine to
  // one person at a time, in an order: nobody takes one while someone whose hours on it came before theirs (an earlier
  // day's, still being seen; or earlier in this day) has yet to be seen through them, and whoever has it gives it up to
  // them. Null while they wait for it; undefined when the farm has none for them (the work is then seen on foot).
  // force: at once, whoever has it (a day held at a point by a tool: the hours of two people on it never overlap).
  private machineFor(a: Actor, seg: Seg, force: boolean, dt: number): Rig | null | undefined {
    const fits = (r: Rig) => r.kind === seg.ride && !r.broken
    const r = (a.rig && fits(a.rig) && this.uses(seg, a.rig) ? a.rig : undefined)
      ?? this.rigs.find(x => fits(x) && !!seg.machine && x.key === seg.machine)
      ?? this.rigs.filter(x => fits(x) && (x.holder < 0 || x.holder === a.id)).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0]
    if (!r) return undefined
    const mine = r.holder === a.id
    if (!force && a.wait < WAIT_MOST) {
      // someone else is on it: it is theirs until they are seen to let it go
      const before = (gen: number, s: Seg) => s.machine === r.key && (gen < a.gen || (gen === a.gen && (s.hours?.[0] ?? s.start) < (seg.hours?.[0] ?? seg.start) - 1e-6))
      const ahead = this.actors.some(x => x !== a && !x.away && (
        x.segs.some(s => x.u < s.end && before(x.gen, s)) || (!!x.queue && x.queue.segs.some(s => before(x.queue!.gen, s)))))
      // (whoever has it and is not at work with it now gives it up to hours that come before their own)
      const has = this.actors.find(x => x.id === r.holder && x !== a)
      const busy = !!has && (has.lead || has.hold || has.segs.some(s => this.uses(s, r) && has.u >= s.start && has.u < s.end))
      if (busy || ahead) {
        if (mine) this.letGo(a)
        // (the wait that runs out is for one nobody is seen on: whoever is on it is seen through their hours)
        if (busy) a.wait = 0
        else a.wait += dt
        return null
      }
    }
    a.wait = 0
    if (mine) return r
    if (a.rig) this.letGo(a)
    const was = this.actors.find(x => x.id === r.holder)
    if (was) this.letGo(was)
    // (from someone else: it is seen to change hands)
    a.handed = r.last >= 0 && r.last !== a.id
    r.holder = a.id
    a.rig = r
    return r
  }

  // Plan the day just passed for everyone. Returns the hills to reveal as they pass.
  // digs: the fields whose digging the interface is waiting to see out (their crop has just been weighed).
  // running: whether the clock was running when the day was counted (a question the day brought may have stopped it
  // since: that day is still one seen as the days before it were, not a day stepped with the clock stopped).
  plan(snap: Snapshot, shown: HillDisplay[][], samples: Map<number, number>, digs: Set<number> = new Set(), running?: boolean, live?: { daySec: number; day: number; shares: Map<string, number>; now?: number }): PendingReveal[] {
    if (live) return this.planLive(snap, shown, samples, live)
    if (running !== undefined) this.stopped = !running
    this.sync(snap)
    this.goals(snap)
    // Whoever set out ahead of this plan is taken up by it from where that has got them.
    for (const a of this.actors) { a.led = a.lead; if (a.lead) { a.lead = false; a.segs = []; a.way = a.waySeg = a.came = null; a.u = 1 } }
    this.name(snap)
    // (a load on its way in keeps its machine until it is at the door)
    for (const a of this.actors) a.hold = !this.stopped && !a.away && a.segs.some(s => s.kind === 'haul' && !!s.site && !s.lit && this.stage.tripOpen(s.site, a.id))
    this.gen++
    // With the clock running, someone whose day's work has not yet been seen (they were on the way to it) is left
    // at it: the new day waits its turn and is planned from where the old one will leave them.
    const hauling = (a: Actor) => a.hold
    // (or have hours with a machine still to come, for which they wait their turn)
    const behind = (a: Actor) => !this.stopped && !a.away && a.segs.length > 0 && (!!a.way || a.u < 0.9 || hauling(a) || a.segs.some(s => !!s.ride && s.kind !== 'travel' && a.u < s.end))
    const from: CrewFrom[] = this.actors.map(a => {
      let working = a.line && a.aboard ? a.line.key : a.siteKey
      let at = a.aboard && a.rig ? { x: a.rig.x, z: a.rig.z } : { x: a.x, z: a.z }
      const line = a.queue ? a.queue.segs : behind(a) ? a.segs : null
      const s = line && line.length ? line[line.length - 1] : null
      if (s) {
        const e = s.site ? (s.kind === 'haul' && a.hold ? cropDoor(snap, s.field).stop : s.path[0]) : s.kind === 'travel' ? s.travel[s.travel.length - 1] : s.walker ? s.path[s.path.length - 1] : s.path[0]
        at = { x: e.x, z: e.z }
        working = s.site ? s.site : s.kind !== 'travel' && !s.walker ? `${s.field}|${s.kind}` : ''
      }
      // Someone who lives out and has been off the farm comes back in by the road, when the days go slowly enough for
      // it to be seen. (Not every morning: that was a jump from the field to the road each day, and half of each day's
      // work unseen.)
      const u = snap.units.find(w => w.id === a.id)!
      const off = a.x === OFF_FARM.x && a.z === OFF_FARM.z
      const arrives = this.arriving && u.livesOut && !a.away && off
      if (arrives) at = this.roadAt(a.slot)
      return { id: a.id, slot: a.slot, farmer: a.kind === 'farmer', goal: a.goal, at, working, holding: a.rig?.key ?? '', arrives }
    })
    const was = new Map(this.progress)
    const rigAt = (key: string) => { const r = this.rigs.find(x => x.key === key && !x.broken); return r ? { x: r.x, z: r.z } : null }
    const plans = planDay(snap, shown, from, samples, snap.farm.pond < this.pondWas - 0.02, key => was.get(key), this.stopped, rigAt)
    // Back to work staged at one place: to where they stood at it, not to the middle of it.
    plans.forEach((segs, k) => {
      for (const s of segs) {
        const p = s.site && s.kind !== 'haul' && s.travel.length > 1 ? this.stage.placeOf(s.site, this.actors[k].id) : null
        if (p) { s.travel[s.travel.length - 1] = p; s.path = [p] }
      }
    })
    this.pondWas = snap.farm.pond
    // how far each job has now got, for where tomorrow's part of it begins
    for (const u of snap.units) for (const w of u.worked) {
      const key = `${w.field}|${w.kind}`
      if (w.share === undefined || w.share >= 1) this.progress.delete(key)
      else this.progress.set(key, w.share)
    }
    const out: PendingReveal[] = []
    this.actors.forEach((a, k) => {
      // (someone off the farm for the day has no part in it)
      if (a.away) { plans[k] = []; a.segs = []; a.queue = null }
      if (a.leaving) plans[k] = []
      // (what the interface waits to see is never kept waiting: a test dig, and below 8x the digging it has a weigh
      // ticket for)
      const waited = plans[k].some(s => s.kind === 'sample' || (s.kind === 'dig' && this.speedNow < 3 && digs.has(s.field)))
      const next: Queued = { segs: plans[k], gen: this.gen, arrives: from[k].arrives === true, waited, keep: !!snap.units.find(w => w.id === a.id)?.rig }
      if (behind(a) && !waited) {
        // the newest work waits its turn; a day with none in it does not push out work still waiting to be seen
        if (works(plans[k]) || !a.queue || !works(a.queue.segs)) a.queue = next
      } else this.take(a, next, false)
      a.lastT = 0
      plans[k].forEach((s, j) => { for (const r of s.reveals) out.push({ ...r, unit: k, seg: j, gen: this.gen }) })
    })
    this.stageHold = -1
    this.setOut(snap)
    return out
  }

  // A long day's plan: today as it will go (and, when an order changes the day, as it now will). Everyone's day is
  // laid out from where they and the machines stood as the day began, so a plan made again part way through has the
  // same morning in it, and they are where it has them at this time of day.
  private planLive(snap: Snapshot, shown: HillDisplay[][], samples: Map<number, number>, live: { daySec: number; day: number; shares: Map<string, number>; now?: number }): PendingReveal[] {
    this.stopped = false
    this.sync(snap)
    this.goals(snap)
    for (const a of this.actors) { a.led = false; if (a.lead) { a.lead = false; a.segs = []; a.way = a.waySeg = a.came = null } }
    this.name(snap)
    this.gen++
    const fresh = this.liveDay !== live.day
    if (fresh) {
      this.liveDay = live.day
      this.dayStart = live.shares
      this.from0.clear()
      this.rig0.clear()
      this.site0.clear()
      for (const a of this.actors) this.from0.set(a.id, a.aboard && a.rig ? { x: a.rig.x, z: a.rig.z } : { x: a.x, z: a.z })
      // (the staged work each stood at as the day began: they carry on at it where they stand)
      for (const a of this.actors) if (a.siteKey) this.site0.set(a.id, a.siteKey)
      for (const r of this.rigs) this.rig0.set(r.key, { x: r.x, z: r.z })
    }
    // (someone the day had nothing for until now is planned from where they are, not from where the morning had them)
    if (!fresh) for (const a of this.actors) if (!a.segs.length && !a.aboard) this.from0.set(a.id, { x: a.x, z: a.z })
    const from: CrewFrom[] = this.actors.map(a => ({ id: a.id, slot: a.slot, farmer: a.kind === 'farmer', goal: a.goal, at: this.from0.get(a.id) ?? { x: a.x, z: a.z }, working: this.site0.get(a.id) ?? '', holding: a.rig?.key ?? '', arrives: false }))
    const rigAt = (key: string) => {
      const was = this.rig0.get(key)
      if (was) return was
      const r = this.rigs.find(x => x.key === key && !x.broken)
      return r ? { x: r.x, z: r.z } : null
    }
    // (the plan this one replaces, for the ways already being gone; and where the day breaks on each)
    const before = new Map(this.actors.map(a => [a.id, fresh ? [] : a.segs]))
    const was = (id: number, kind: string, field: number, h0: number) => before.get(id)?.find(s => s.kind === kind && s.field === field && !!s.hours && Math.abs(s.hours[0] - h0) < 2e-3)
    const dawn = (id: number, at: Pt, machine: string) => {
      const a = this.actors.find(x => x.id === id)
      if (!a || !fresh) return
      this.from0.set(id, { x: at.x, z: at.z })
      a.x = at.x; a.z = at.z; a.sx = NaN; a.fade = 0.1
      const r = machine ? this.rigs.find(x => x.key === machine && !x.broken) : undefined
      if (r) { this.rig0.set(r.key, { x: at.x, z: at.z }); r.x = at.x; r.z = at.z; r.sx = NaN; r.fade = 0.1 }
    }
    const plans = planDay(snap, shown, from, samples, snap.farm.pond < this.pondWas - 0.02, key => this.dayStart.get(key) ?? 0, true, rigAt, { daySec: live.daySec, now: fresh ? 0 : live.now ?? 0, was, dawn })
    // Back to work staged at one place: to where they stood at it, not to the middle of it.
    plans.forEach((segs, k) => {
      for (const s of segs) {
        const p = s.site && s.kind !== 'haul' && s.travel.length > 1 ? this.stage.placeOf(s.site, this.actors[k].id) : null
        if (p) { s.travel[s.travel.length - 1] = p; s.path = [p] }
      }
    })
    this.pondWas = snap.farm.pond
    for (const u of snap.units) for (const w of u.worked) {
      const key = `${w.field}|${w.kind}`
      if (w.share === undefined || w.share >= 1) this.progress.delete(key)
      else this.progress.set(key, w.share)
    }
    const out: PendingReveal[] = []
    this.actors.forEach((a, k) => {
      if (a.away || a.leaving) plans[k] = []
      a.queue = null
      this.take(a, { segs: plans[k], gen: this.gen, arrives: false, waited: false, keep: !!snap.units.find(w => w.id === a.id)?.rig }, false)
      a.lastT = 0
      plans[k].forEach((s, j) => { for (const r of s.reveals) out.push({ ...r, unit: k, seg: j, gen: this.gen }) })
    })
    this.stageHold = -1
    return out
  }

  // Everyone and every machine is next seen where the day has them, coming into sight there: for a change of clock
  // between a day watched as it is worked and days that go by in seconds.
  cut(): void {
    for (const a of this.actors) { a.sx = NaN; a.fade = 0.1 }
    for (const r of this.rigs) { r.sx = NaN; r.fade = 0.1 }
  }

  // Someone sets out the moment there is an order they would take and the clock is running, before the day that works
  // it has been counted: on foot to the machine, the implement on, and away down the lane toward the field. The day's
  // plan, when it comes, takes them up from wherever that has got them.
  setOut(snap: Snapshot): void {
    const lead = snap.lead
    if (snap.mode !== 'season' || this.stopped || !lead) return
    const a = this.actors.find(x => x.id === lead.unit), f = FIELDS[lead.field]
    // (not someone still being seen at work, or with work waiting to be seen)
    if (!a || !f || a.away || a.queue || a.lead || a.state === 'hurt' || (works(a.segs) && (!!a.way || a.u < 1))) return
    const machine = MACHINE_JOBS.has(lead.kind)
    // (never with a machine the days being seen have work for: that is taken in its turn)
    if (machine && a.rig && this.spoken(a.rig, a)) return
    if (machine && !a.rig) {
      // the truck for a haul, as the farm's day has it; else the nearest tractor nobody has
      const free = this.rigs.filter(r => r.holder < 0 && !r.broken && !this.spoken(r, a))
      const best = (lead.kind === 'haul' ? free.find(r => r.kind === 'truck') : undefined)
        ?? free.filter(r => r.kind === 'tractor').sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0]
      if (!best) return
      best.holder = a.id
      a.rig = best
    }
    const rig = machine ? a.rig : null
    const dest = SITE_JOBS.has(lead.kind) ? siteAt(lead.kind, lead.field, snap.fields[lead.field]?.felled ?? 0) : restAt(lead.field, a.slot, !rig)
    const me = { x: a.x, z: a.z }, m = rig ? { x: rig.x, z: rig.z } : me
    // already there, or as good as
    if (Math.hypot(m.x - dest.x, m.z - dest.z) < 30 || fieldAt(m.x, m.z) === lead.field) return
    const walkTo = rig && !a.aboard && Math.hypot(m.x - me.x, m.z - me.z) > 1.2 * S ? wayFrom(me, m) : []
    const travel = wayFrom(m, { x: dest.x, z: dest.z })
    if (rig && rig.kind === 'tractor') (rig.machine as Tractor).setImplement(SITE_JOBS.has(lead.kind) ? (lead.kind === 'haul' ? 'trailer' : 'none') : implementFor(lead.kind, snap.farm.equipment.includes('harvester')))
    a.segs = [{ kind: 'travel', field: -1, walker: !rig, ride: rig ? rig.kind : '', walkTo, travel, path: [travel[travel.length - 1]], reveals: [], start: 0, end: 1, site: '', lit: false, from: 0 }]
    a.lead = true
    a.waited = false
    a.state = 'work'
    a.goal = null
    a.home = null
    a.queue = null
    a.clockSeg = -2
    a.u = 0
    a.works = 0
    a.way = a.waySeg = a.came = null
    a.next = [0]
  }

  // A plan taken up late begins from where they are, not from where it thought to find them: the way is found again.
  private fromHere(a: Actor, s: Seg): void {
    const end = s.travel[s.travel.length - 1]
    const me = { x: a.x, z: a.z }
    if (s.ride && a.rig) {
      const m = { x: a.rig.x, z: a.rig.z }
      // (going on with the same work in the field the machine is in: from where it is in the row, not back to its end)
      const f = FIELDS[s.field]
      if (s.from < 0 && !s.site && f && a.aboard && m.x > f.x0 - 12 && m.x < f.x1 + 12 && m.z > f.z0 - 2 && m.z < f.z1 + 2) { s.travel = [m]; s.walkTo = []; s.polys = undefined; return }
      if (s.travel.length < 2 && Math.hypot(m.x - end.x, m.z - end.z) < 1.2 * S) return
      s.walkTo = a.aboard || Math.hypot(m.x - me.x, m.z - me.z) < 1.2 * S ? [] : wayFrom(me, m)
      s.travel = wayFrom(m, end)
    } else {
      if (s.travel.length < 2 && Math.hypot(me.x - end.x, me.z - end.z) < 1.2 * S) return
      s.walkTo = []
      s.travel = wayFrom(me, end)
    }
    s.polys = undefined
  }

  // A person takes up a day's plan. late: it waited for the day before to be seen through.
  private take(a: Actor, q: Queued, late: boolean): void {
    a.arrived = q.arrives
    a.hold = false
    a.keep = q.keep
    a.wait = 0
    a.rate = CATCH_UP
    if (q.arrives) { const p = this.roadAt(a.slot); a.aboard = false; a.x = p.x; a.z = p.z; a.shown = 0.3; a.sx = NaN }
    else if (late && q.segs.length) this.fromHere(a, q.segs[0])
    a.lead = false
    a.segs = q.segs
    a.works = q.segs.filter(s => s.kind !== 'travel').length
    a.waited = q.waited
    a.gen = q.gen
    a.queue = null
    a.clockSeg = -2
    a.u = 0
    a.worked = 0
    a.way = a.waySeg = a.came = null
    a.next = a.segs.map(() => 0)
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
    this.snapSeen = true
    for (const a of this.actors) {
      if (a.queue) this.take(a, a.queue, false)
      a.clockSeg = a.segs.length - 1; a.segClock = 1e6; a.u = a.lastT = 1; a.way = null; a.waySeg = a.came = a.segs[a.segs.length - 1] ?? null
    }
    this.stageHold = -1
  }

  // Whether someone has yet to be seen through a day's plan: what its work changed on the land waits for them.
  owes(unit: number, gen: number): boolean {
    const a = this.actors[unit]
    // (at the faster clocks the ground keeps the days' time, whatever the picture of the people is showing)
    return !!a && !this.stopped && this.speedNow <= 1 && (a.queue?.gen === gen || (a.gen === gen && a.segs.length > 0 && (!!a.way || a.u < 0.9)))
  }

  places(): Record<string, Pt> {
    return { gate: GATE, caller: CALLER.man, buyer: BUYER.man, porch: PORCH_AT, dooryard: DOORYARD_AT, pack: packSite(), roadIn: this.roadAt(0) }
  }

  segsInfo(): string[] {
    return this.actors.flatMap(a => a.segs.map(s => `${a.kind}${a.id}:${s.kind}@${s.field}`))
  }

  // Each one's day as it is planned: its parts, and when each begins, is at its work and ends (for tools).
  plans(): string[] {
    return this.actors.map(a => `${a.kind}${a.id}${a.away ? ' away' : ''} ${a.state}: ${a.segs.map(s => `${s.kind}@${s.field}${s.ride ? ` ${s.machine ?? s.ride}` : ''} ${s.start.toFixed(2)}>${(s.work ?? s.start).toFixed(2)}>${s.end.toFixed(2)} way ${Math.round(new Poly(s.walkTo).length)}+${Math.round(new Poly(s.travel).length)} m, work ${Math.round(new Poly(s.path).length)} m`).join(' | ') || 'nothing'}`)
  }

  // Where each one is in the day they are seen at (for tools).
  clocks(): string[] {
    return this.actors.map(a => `${a.id}:${a.segs.map(s => s.kind).join('+') || '-'} u${a.u.toFixed(2)}${a.way ? ` way${(a.way.t / a.way.T).toFixed(2)}${a.way.cut ? 'c' : ''}` : ''}${a.queue ? ' q' : ''}${a.line ? ` row${a.line.arc.toFixed(0)}/${a.line.poly.length.toFixed(0)}` : ''} g${a.gen}${a.siteKey ? ' at ' + a.siteKey : ''}${a.aboard ? ' aboard' : ''}${a.rig ? ` load${a.rig.state.load} rig@${a.rig.x.toFixed(0)},${a.rig.z.toFixed(0)}` : ''} @${a.x.toFixed(0)},${a.z.toFixed(0)}`)
  }

  // Where the farmer's machine is, and the person on foot if anyone is walking (for the look tools).
  // (fade: below 1 while they are gone from sight where a way is cut; work: the row work a machine is at, or '';
  // doing: 'wait' for a machine someone else has, 'rows' at a machine's row work, or '')
  where(): { tractor: Pt; farmer: { x: number; z: number; turn: number } | null; units: { id: number; kind: UnitKind; x: number; z: number; foot: boolean; fade: number; doing: string }[]; rigs: { kind: string; key: string; x: number; z: number; holder: number; broken: boolean; fade: number; work: string; tool: string }[] } {
    const f = this.actors.find(a => a.kind === 'farmer')
    const rig = f?.rig ?? this.rigs.find(r => r.kind === 'tractor')
    const walker = this.actors.find(a => !a.aboard && a.segs.length > 0) ?? this.actors.find(a => !a.aboard)
    return {
      tractor: rig ? { x: rig.x, z: rig.z } : { x: 0, z: 0 },
      farmer: walker ? { x: walker.x, z: walker.z, turn: -walker.heading } : null,
      units: this.actors.map(a => ({ id: a.id, kind: a.kind, x: a.sx, z: a.sz, foot: !a.aboard, fade: a.away ? 0 : a.fade, doing: a.away ? '' : a.doing })),
      rigs: this.rigs.map(r => ({ kind: r.kind, key: r.key, x: r.sx, z: r.sz, holder: r.holder, broken: r.broken, fade: r.fade, work: r.state.working > 0 ? r.state.kind : '', tool: r.kind === 'tractor' ? (r.machine as Tractor).current : '' })),
    }
  }

  // Where a person is, as their card says it: on foot, on a machine (its driver), or off the land.
  placeOf(id: number): 'foot' | 'machine' | 'away' {
    const a = this.actors.find(x => x.id === id)
    if (!a || a.away || a.shown < 0.5) return 'away'
    return a.aboard ? 'machine' : 'foot'
  }

  // Where a person's pin stands: a point over their head at a fixed height above the ground they are on (or the seat
  // they are in), so it does not bob as they walk or dip as they bend; false when there is no such person on the farm.
  anchor(id: number, out: Vector3): boolean {
    const a = this.actors.find(x => x.id === id)
    if (!a || !this.inSight(a)) return false
    this.over(a, out)
    return true
  }

  // Whether someone is to be seen: on the farm, and not gone from sight through a cut (nor the machine they are on).
  // Until they are seen again they have no place to be pinned at, or picked at.
  private inSight(a: Actor): boolean {
    return !a.away && a.shown >= 0.5 && a.fade >= 0.5 && Number.isFinite(a.sx) && !(a.aboard && !!a.rig && (a.rig.fade < 0.5 || !Number.isFinite(a.rig.sx)))
  }

  private over(a: Actor, out: Vector3): Vector3 {
    // (a driver still walking to the machine is where they are seen, not in its seat)
    const r = a.aboard && a.rig && !(Number.isFinite(a.sx) && Math.hypot(a.sx - a.rig.sx, a.sz - a.rig.sz) > 0.3) ? a.rig : null
    // the tractor's seat is a little behind its middle
    const back = r && r.kind === 'tractor' ? 0.44 * TRUE_SIZE : 0
    const x = r ? r.sx - Math.cos(r.heading) * back : a.sx, z = r ? r.sz - Math.sin(r.heading) * back : a.sz
    return out.set(x, heightAt(x, z) + a.ay, z)
  }

  // The land's trees on a tract, in the order they are felled.
  setStand(stand: (field: number) => StandTree[]): void {
    this.standOf = stand
  }

  // The land's way of leaving the last trees counted as felled standing until they are seen to go over.
  setHold(hold: (field: number, n: number) => void): void {
    this.stage.hold = hold
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
    // People and machines are drawn at true size whatever the distance.
    const bigMachine = TRUE_SIZE
    const big = TRUE_SIZE * FIGURE
    this.mark = 0.56 * big
    this.perUnit = this.screenH / (2 * Math.tan((f.camera.fov * Math.PI) / 360))
    EYE.copy(f.camera.position)
    // With the clock stopped a day's work is literal: everyone goes on at the pace of a person or a machine.
    const cold = env.snow > 0.3
    this.cold = cold
    const far = 0
    this.live = !!f.live && snap.mode === 'season'
    this.literal = !this.live && snap.mode === 'season' && !f.advancing && f.pace > 0.5
    this.stopped = !f.advancing && !this.live
    this.arriving = f.advancing && f.speed === 1
    this.daySec = f.daySec
    this.pace = this.literal ? PACE.work : clamp(f.dist / 40, 2.6, 14)
    // How fast the seen places may go: a walker's and a driver's pace at this clock and from this far off (the
    // script's own ways go at up to these), quicker at the faster clocks.
    const quick = QUICK[f.speed] ?? 1
    this.quick = quick
    this.speedNow = f.speed
    this.dtNow = f.dt
    this.vFoot = Math.max(this.pace, clamp(f.dist / 40, 2.8, 9)) * 1.3 * quick
    this.vRig = Math.max(this.literal ? PACE.truck : clamp(f.dist / 16, 6, 30), clamp(f.dist / 12, 8, 45)) * 1.3 * quick
    this.frozen = snap.mode === 'season' && !f.advancing && (f.pace === 1 || this.live)
    if (this.live) { this.vFoot = 12; this.vRig = 40 }
    // The clock set going: whoever would take the first order sets out for it at once.
    if (f.advancing && !this.ran && !this.live) this.setOut(snap)
    this.ran = f.advancing
    // the work goes on while the clock runs, while the day is being played out, and (literal) until everyone is done
    const going = this.live ? f.advancing : snap.mode === 'season' ? f.advancing || f.dayT < 1 || (this.literal && this.actors.some(a => a.u < 1)) : snap.mode !== 'title'
    GRIME.value.set(0.52, 0.42, 0.31).lerp(V.set(0.2, 0.15, 0.11), clamp(env.wet * 1.4 - 0.3, 0, 1))
    const sf: StageFrame = {
      pr, particles: f.particles, dt: f.dt, time: f.time, s: big, snap, wind: env.wind, cold, still: f.reduced, going, stand: this.standOf,
      pace: this.pace, lane: this.literal ? PACE.truck : clamp(f.dist / 16, 6, 30), literal: this.literal, live: this.live, dry: f.dust > 0.3 && !cold, day: f.daySec,
      far: (x, z) => clamp((Math.hypot(x - EYE.x, heightAt(x, z) - EYE.y, z - EYE.z) - 110) / 330, 0, 1),
    }
    const mf: MachineFrame = {
      dt: f.dt, time: f.time, particles: f.particles, dust: f.dust, mud: clamp(env.wet * 1.5 - 0.5, 0, 1), still: f.reduced || f.idle, cold: snap.weather.tmin < 4,
      lamps: clamp(Math.max(f.dark, env.cloud > 0.9 ? 0.5 + 0.5 * Math.max(env.rain, env.mist) : 0), 0, 1),
      sun: clamp(1.15 - 1.3 * env.cloud, 0, 1) * (1 - clamp(f.dark * 2, 0, 1)),
    }
    for (const r of this.rigs) { r.moved = 0; r.turn = 0; r.state.working = 0; r.state.kind = 'travel'; r.state.driver = null; r.state.load = 0; r.fade = Math.min(1, r.fade + f.dt * 3) }

    // Each person's day; those at staged work are gathered by site and placed by the stage.
    const sites = new Map<string, { kind: string; field: number; ws: Worker[]; who: Actor[] }>()
    for (const a of this.actors) a.siteKey = ''
    const enlist = (key: string, kind: string, field: number, a: Actor, w: number, loads = 1, lit = false) => {
      a.siteKey = key
      let s = sites.get(key)
      if (!s) { s = { kind, field, ws: [], who: [] }; sites.set(key, s) }
      const wk = a.worker
      wk.dress = cold ? a.coat : a.dress
      wk.tired = a.tired
      wk.w = w
      wk.x = a.x; wk.z = a.z; wk.heading = a.heading
      wk.lift = 0
      wk.aboard = false
      wk.rig = a.rig ? { x: a.rig.x, z: a.rig.z, heading: a.rig.heading, load: 0, fade: 1 } : null
      wk.loads = loads
      wk.lit = lit
      wk.pose.reset()
      s.ws.push(wk)
      s.who.push(a)
    }
    this.actors.forEach((a, k) => {
      a.shown = a.away ? 0 : Math.min(1, a.shown + f.dt * 2)
      a.fade = Math.min(1, a.fade + f.dt * 3)
      a.scale = big
      if (a.away) return
      if (a.post && snap.mode !== 'season') { const [fs, kind] = a.post.split('|'); enlist(a.post, kind, Number(fs), a, 0.5); return }
      const site = this.step(a, k, f, going, big)
      if (site) enlist(site.key, site.kind, site.field, a, site.w, site.loads, site.lit)
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
          // (a drive cut by the stage: it goes from sight, and is seen again where the cut brings it in)
          if (w.rig.fade !== undefined) r.fade = Math.min(r.fade, w.rig.fade)
          if (moved > 15 && going && Number.isFinite(r.sx)) { r.sx = NaN; r.fade = 0.1; a.fade = 0.1; a.sx = NaN }
          this.driveTo(r, w.rig.x, w.rig.z, w.rig.heading, moved, f.dt, true)
          r.state.load = w.rig.load
          r.state.kind = 'haul'
          // (standing to be loaded or unloaded with its engine running: the smoke over it is seen from far off)
          if (!w.aboard && going) r.state.working = 1
          if (r.kind === 'tractor') (r.machine as Tractor).setImplement('trailer')
        }
        if (a.aboard) return
        if (!going) this.idle(a, f, w.pose)
        this.figure(a, w.pose, big, w.lift)
        this.ring(a.sx, heightAt(a.sx, a.sz), a.sz, this.mark, a, f, far)
      })
    }

    // Machines: where their drivers took them, or where they were left.
    for (const r of this.rigs) {
      const holder = r.holder >= 0 ? this.actors.find(a => a.id === r.holder) : undefined
      // A driver seen still walking to the machine (it stood elsewhere when they took it): the machine waits for them,
      // and they are seen on foot until they are at it.
      const walking = !!holder && holder.aboard && Number.isFinite(holder.sx) && Math.hypot(holder.sx - r.sx, holder.sz - r.sz) > 0.3
      if (walking) {
        this.follow(holder!, this.vFoot, FOOT_MOST * quick, { x: r.sx, z: r.sz })
        holder!.heading = Math.atan2(r.sz - holder!.sz, r.sx - holder!.sx)
        const pose = holder!.pose.reset()
        walk(pose, f.time * 7, 1, holder!.tired, 0)
        const y0 = heightAt(holder!.sx, holder!.sz) + 0.02
        figureMatrix(M, holder!.sx, y0, holder!.sz, holder!.heading, big * (0.3 + 0.7 * holder!.shown) * holder!.fade)
        drawFigure(this.prims, M, cold ? holder!.coat : holder!.dress, pose)
        holder!.head.copy(drawn.head)
      } else {
        this.follow(r, this.vRig, RIG_MOST * quick)
        if (holder && holder.aboard) { holder.sx = r.sx; holder.sz = r.sz }
      }
      // a machine standing idle in the yard is not drawn as large as one at work, or the yard is all machines; under
      // the shed's roof it is its own size, on the shed's floor
      const parked = !holder && Math.hypot(r.sx - r.home.x, r.sz - r.home.z) < 0.5 * S
      const inBay = parked && this.shed && Math.abs(r.home.z - BAYS[0].z) < 0.5 * S
      const s = (inBay ? TRUE_SIZE : parked ? Math.max(TRUE_SIZE, bigMachine * 0.74) : bigMachine) * r.fade
      const y = inBay ? this.shedFloor : heightAt(r.sx, r.sz)
      const ahead = heightAt(r.sx + Math.cos(r.heading) * 0.6 * s, r.sz + Math.sin(r.heading) * 0.6 * s)
      const behind = heightAt(r.sx - Math.cos(r.heading) * 0.6 * s, r.sz - Math.sin(r.heading) * 0.6 * s)
      r.machine.place(r.sx, y + 0.01, r.sz, r.heading, inBay ? 0 : Math.atan2(ahead - behind, 1.2 * s), s)
      r.state.moved = r.moved
      r.state.turn = r.turn
      r.state.driver = holder && holder.aboard && !walking ? (cold ? holder.coat : holder.dress) : null
      // how far off it is seen from: beyond a field's length its dust, mist and lamps are drawn to be found by
      // (not in the opening, whose camera comes down the road to what it first saw from far off)
      r.state.far = snap.mode === 'title' ? 0 : clamp((Math.hypot(r.sx - EYE.x, y - EYE.y, r.sz - EYE.z) - 110) / 330, 0, 1)
      LOD.fine = Math.hypot(r.sx - EYE.x, r.sz - EYE.z) < FINE_WITHIN
      if (r.kind === 'tractor') (r.machine as Tractor).draw(pr, mf, r.state)
      else (r.machine as Car).draw(pr, mf, r.state)
      if (holder && holder.aboard && !walking) {
        holder.head.copy(drawn.head)
        holder.scale = s
        this.ring(r.sx, y, r.sz, Math.max(1.2 * s, 1.5 * this.mark), holder, f, far)
      }
      if (r.broken && !f.reduced && Math.random() < 0.12) {
        r.machine.point(0.3, 0.95, 0, V)
        f.particles.emit(V.x, V.y, V.z, 0, 0.5, 0, 0.1 * s, 0.4 * s, 2.4, 0.75, 0.75, 0.78, 0.3, 0.8)
      }
    }

    // Implements the farm owns stand in the grass past the shed while no tractor has them on.
    const using: Record<YardKind, boolean> = {
      harvester: this.rigs.some(r => r.kind === 'tractor' && (r.machine as Tractor).current === 'harvester'),
      sprayer: this.rigs.some(r => r.kind === 'tractor' && (r.machine as Tractor).current === 'sprayer'),
      reel: [...sites.values()].some(x => x.kind === 'reel'),
    }
    for (const kind of YARD_KINDS) {
      const show = snap.mode !== 'title' && this.equipment.includes(kind === 'sprayer' ? 'boom' : kind) && !using[kind]
      let y = this.yarded[kind]
      if (!show) { if (y) y.group.visible = false; continue }
      if (!y) { y = new Yarded(kind); this.yarded[kind] = y; this.group.add(y.group) }
      const at = IMPLEMENT_SPOTS[kind]
      y.group.visible = true
      y.place(at.x, heightAt(at.x, at.z) + 0.01, at.z, at.heading, 0, Math.max(TRUE_SIZE, Math.min(1.4, bigMachine * 0.74)))
      y.draw(pr)
    }

    // Each pin's height: over a standing head, or over the seat.
    for (const a of this.actors) {
      const want = a.aboard && a.rig ? (a.rig.kind === 'truck' ? 2.75 : 3.1) : 0.82 * big * a.dress.tall + 0.32
      a.ay += (want - a.ay) * Math.min(1, f.dt * 8)
    }
    this.callersAndLife(f, mf, big, bigMachine, going)
    this.snapSeen = false
    this.ringGeo.instanceCount = this.rings
    this.rAt.needsUpdate = true
    this.rInfo.needsUpdate = true
    this.rCol.needsUpdate = true
    pr.end()
  }

  // The mark on the ground under whoever is picked (and nobody else): never less than about thirty pixels across.
  private ring(x: number, y: number, z: number, radius: number, a: Actor, f: CrewFrame, _far: number): void {
    if (a.id !== f.picked || a.shown < 0.5 || this.rings >= MAX_RINGS) return
    const k = this.rings++
    const away = f.camera.position.distanceTo(V.set(x, y, z))
    this.rAt.setXYZW(k, x, y + 0.07, z, Math.max(radius * 1.25, (16 * away) / this.perUnit))
    this.rInfo.setXY(k, 1, 1)
    const c = a.dress.shirt
    this.rCol.setXYZ(k, c.r * 1.7 + 0.1, c.g * 1.7 + 0.1, c.b * 1.7 + 0.1)
  }

  // Where someone or something is seen moves toward where the day's script puts them no faster than a person or a
  // machine goes at this clock (quicker the further behind, so it is soon there): whatever the script does at a day's
  // turn, a change of job, a seat taken or left, nobody is seen to jump. With the clock stopped by the player, nobody
  // moves at all.
  private follow(p: { x: number; z: number; sx: number; sz: number }, v: number, most: number, to?: { x: number; z: number }): void {
    const tx = to ? to.x : p.x, tz = to ? to.z : p.z
    if (!Number.isFinite(p.sx) || this.snapSeen) { p.sx = tx; p.sz = tz; return }
    if (this.frozen) return
    const dx = tx - p.sx, dz = tz - p.sz, gap = Math.hypot(dx, dz)
    if (gap < 1e-6) return
    const reach = Math.min(most, v * (1 + gap / 30)) * this.dtNow
    if (gap <= reach) { p.sx = tx; p.sz = tz; return }
    p.sx += (dx / gap) * reach
    p.sz += (dz / gap) * reach
  }

  private figure(a: Actor, pose: Pose, scale: number, lift = 0): void {
    const bx = a.sx, bz = a.sz
    this.follow(a, this.vFoot, FOOT_MOST * this.quick)
    // Carried over the ground to where the day has them, they are seen walking there and facing the way they go:
    // nobody is slid along as they stand or work.
    const gone = Number.isFinite(bx) ? Math.hypot(a.sx - bx, a.sz - bz) : 0
    if (gone > SLID * this.dtNow && !pose.walking && !pose.seated) {
      a.gait += Math.min(this.dtNow * 14, (gone / (0.46 * scale)) * Math.PI * 2)
      a.heading = Math.atan2(a.sz - bz, a.sx - bx)
      walk(pose, a.gait, 1, a.tired, 0)
    }
    const y = heightAt(a.sx, a.sz) + 0.02 + lift * scale
    figureMatrix(M, a.sx, y, a.sz, a.heading, scale * (0.3 + 0.7 * a.shown) * a.fade)
    drawFigure(this.prims, M, this.cold ? a.coat : a.dress, pose)
    a.head.copy(drawn.head)
    a.scale = scale
  }
  private cold = false
  // The seen places: how far they may go this frame, and whether they hold still (the clock stopped by the player) or
  // are set at once (a new screen, a loaded game, a tool holding the day at a point).
  private dtNow = 0
  private vFoot = 4
  private vRig = 12
  private frozen = false
  private quick = 1
  private speedNow = 1
  private ran = false
  private snapSeen = true
  private shed = false
  private tractors = 1
  private equipment: string[] = []
  private yarded: Partial<Record<YardKind, Yarded>> = {}
  private shedFloor = (() => { const s = siteOf('shed', -1)!; return level(s.x, s.z, s.w, s.d).top + 0.05 })()
  private screenH = 900
  private lively = true
  private far = 0
  private perUnit = 1000
  private literal = false
  private arriving = false
  private gen = 0
  // A long day, watched as it is worked (a day of some minutes): the day's plan is made as the day begins, from the
  // day as it will go (and again when an order changes it), and everyone keeps the day's own time through it.
  private live = false
  private liveDay = -1
  private dayStart = new Map<string, number>()
  private from0 = new Map<number, Pt>()
  private rig0 = new Map<string, Pt>()
  private site0 = new Map<number, string>()
  // where someone coming in to work is first seen: on the farm road, short of the dooryard
  private roadIn = new Poly(route(OFF_FARM, GATE))
  private roadAt(slot: number): Pt { const e = this.roadIn.at(Math.max(0, this.roadIn.length - 30 - 2.4 * (slot % 4))); return { x: e.x + 0.5 * (slot % 2), z: e.z } }
  private daySec = 1.4
  private stopped = false
  private pace = 6
  private progress = new Map<string, number>()
  private standOf: (field: number) => StandTree[] = () => []
  private pondWas = 0

  // Between jobs and at the day's end: standing easy, or sitting down when worn out.
  private idle(a: Actor, f: CrewFrame, pose: Pose): void {
    if (a.worn > 0.72) sit(pose, f.time + a.id, 0, a.tired)
    else stand(pose, f.time + a.id * 3.1, a.tired, a.style)
  }

  private driveTo(r: Rig, x: number, z: number, heading: number, moved: number, dt: number, exact = false): void {
    // (a real jump: a new screen, a day held at another point by a tool)
    const jump = moved > 15
    let d = heading - r.heading
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    r.turn = clamp(d * 1.5, -1, 1)
    r.heading += jump || exact && moved < 1e-4 ? d : moved > 1e-4 ? d * Math.min(1, dt * 7 + moved * 2) : 0
    r.x = x
    r.z = z
    r.moved = jump ? 0 : moved
  }

  // One person at this point of their day. Returns the staged work they are at, if any.
  private step(a: Actor, k: number, f: CrewFrame, going: boolean, big: number): { key: string; kind: string; field: number; w: number; loads: number; lit: boolean } | null {
    // Their own clock through the day's script. With the game's clock running it keeps the day's time (catching up,
    // never jumping, when the clock starts again); with it stopped it goes on at a person's or a machine's own pace,
    // unless a tool holds the day at a point.
    const live = this.live
    const jumped = !live && (f.dayT < a.lastT - 1e-6 || f.dayT > a.lastT + 0.2)
    const held = jumped || (!live && !f.advancing && !this.literal)
    if (a.leaving && (held || !this.unseen(a))) { this.goHome(a); return null }
    // The day after takes its turn once this one's work has been seen (or at once, when nothing is being played out).
    // (a load on its way in is seen to the door first, even if a card has stopped the clock)
    // (with the clock stopped by the player nobody moves, and what they are being seen at is not changed under them)
    if (a.queue && (held || (this.literal && !a.hold && !this.frozen) || a.u >= 1 || !a.segs.length)) this.take(a, a.queue, !held && (!this.literal || a.hold))
    if (held || live) { a.u = f.dayT; a.way = null }
    else if (f.advancing && !a.way) {
      // Behind the clock after a way to go, the work is seen through a little quicker than the day runs, never
      // jumped; and each part of it for no less than WORK_LEAST, whatever the clock and however short its hours
      // of the day (what the interface waits to see keeps the day's time). Between parts their clock runs on.
      const base = f.daySec / a.rate
      let k = -1
      for (let s = 0; s < a.segs.length; s++) if (a.u >= a.segs[s].start) k = s
      const cur = k >= 0 ? a.segs[k] : null
      if (cur && a.u < cur.end) {
        const span = cur.end - cur.start
        const dur = a.waited || cur.kind === 'travel' ? base * span : Math.max(base * span, WORK_LEAST[f.speed] ?? 4)
        a.u = Math.min(cur.end, a.u + (f.clock * span) / Math.max(1e-3, dur))
      } else a.u = Math.min(a.segs[k + 1]?.start ?? 1, a.u + f.clock * Math.max(1 / base, GAP_RATE))
      if (!a.queue && (a.waited || !a.works)) a.u = Math.min(a.u, f.dayT)
    }
    else if (this.literal && !a.way && a.u < 1 && (!this.frozen || a.segs.some(s => s.lit))) {
      // (a day played out with the clock stopped: nobody is kept standing between the parts of it, or after them)
      let k = -1
      for (let s = 0; s < a.segs.length; s++) if (a.u >= a.segs[s].start) k = s
      if (k < 0 || a.u >= a.segs[k].end - 1e-9) a.u = a.segs[k + 1]?.start ?? 1
    }
    // A load on its way in is seen to the potato house door before the day is let go.
    const hs = a.clockSeg >= 0 ? a.segs[a.clockSeg] : undefined
    if (!held && hs && hs.kind === 'haul' && hs.site && !hs.lit && this.stage.tripOpen(hs.site, a.id)) a.u = Math.min(a.u, hs.end - 2e-3)
    a.lastT = f.dayT
    const part = () => { let k = -1; for (let s = 0; s < a.segs.length; s++) if (a.u >= a.segs[s].start) k = s; return k }
    let segIdx = part()
    // Work waiting to be seen takes its turn as soon as a part of this day's has been (at once, over a day with none):
    // the rest of this day goes unseen.
    if (a.queue && !held && f.advancing && !a.hold && works(a.queue.segs) && (!a.works || (!a.way && a.clockSeg >= 0 && segIdx > a.clockSeg))) {
      this.take(a, a.queue, true)
      segIdx = part()
    }
    let seg: Seg | null = segIdx >= 0 ? a.segs[segIdx] : null
    let waiting = false
    a.doing = ''
    // A part of the day done with a machine: it is taken up when it is theirs to take (machineFor), and until then
    // they wait where they are.
    if (seg && seg.ride && a.u < seg.end && (a.waySeg !== seg || !a.rig || !this.uses(seg, a.rig))) {
      const had = a.rig
      const r = this.machineFor(a, seg, held || live, this.frozen ? 0 : f.dt)
      if (r === null) {
        a.u = Math.min(a.u, seg.start)
        segIdx = -1
        seg = null
        waiting = true
        a.doing = 'wait'
      } else if (r && r !== had && a.waySeg !== seg && !held && !live) this.fromHere(a, seg)
    }
    // A machine nothing more of their day is done with is let go where it stands, unless the farm's day leaves it theirs.
    if (a.rig && !a.hold && !a.lead && !held) {
      const r = a.rig
      const more = a.segs.some(s => this.uses(s, r) && a.u < s.end) || (a.queue ? a.queue.keep || a.queue.segs.some(s => this.uses(s, r)) : a.keep)
      if (!more) this.letGo(a)
    }
    // (their part with a machine seen, and the machine gone on to someone else: they stand where it left them)
    if (seg && seg.ride && !a.rig && a.u >= seg.end) seg = null
    const pose = a.pose.reset()
    const rig = a.rig
    const passed = (arc: number) => f.passed(k, segIdx, arc, a.gen)
    const tractor = rig && rig.kind === 'tractor' ? rig.machine as Tractor : null
    let px = a.x, pz = a.z
    const foot = (e: { x: number; z: number; dx?: number; dz?: number }, load = 0) => {
      const step = Math.hypot(e.x - a.x, e.z - a.z)
      if (step > 1e-4 && step < 3 && e.dx !== undefined) a.heading = Math.atan2(e.dz!, e.dx)
      a.gait += Math.min(f.dt * 11, (step / (0.46 * big)) * Math.PI * 2)
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
    let site: { key: string; kind: string; field: number; w: number; loads: number; lit: boolean } | null = null
    if (!seg) {
      // Waiting for a machine out in a field: off the rows to the field's end, and there until it is theirs.
      const within = waiting && !a.aboard ? fieldAt(a.x, a.z) : -1
      if (within >= 0 && going && !this.frozen) {
        // (along the row they are in, to whichever end is nearer)
        const fr = FIELDS[within]
        const to = { x: a.x - fr.x0 < fr.x1 - a.x ? fr.x0 - 0.5 * S : fr.x1 + 0.5 * S, z: a.z }, d = Math.hypot(to.x - a.x, to.z - a.z)
        const step = Math.min(d, Math.min(FOOT_MOST, clamp(f.dist / 40, 2.8, 9)) * this.quick * f.dt)
        if (d > 0.05) {
          foot({ x: a.x + ((to.x - a.x) / d) * step, z: a.z + ((to.z - a.z) / d) * step, dx: to.x - a.x, dz: to.z - a.z })
          a.x = px; a.z = pz
          this.figure(a, pose, big)
          this.ring(a.sx, heightAt(a.sx, a.sz), a.sz, this.mark, a, f, this.far)
          return null
        }
      }
      // no part in today's work: where the day off, the sick bed or the yard has them
      this.atEase(a, f, pose, big)
      if (a.aboard && rig) { a.x = rig.x; a.z = rig.z; a.heading = rig.heading; return null }
      this.figure(a, pose, big)
      this.ring(a.sx, heightAt(a.sx, a.sz), a.sz, this.mark, a, f, this.far)
      return null
    }
    const span = Math.max(1e-6, seg.end - seg.start)
    seg.polys ??= { walkTo: new Poly(seg.walkTo), travel: new Poly(seg.travel), path: new Poly(seg.path) }
    const { walkTo, travel, path } = seg.polys
    const lw = seg.walkTo.length ? walkTo.length : 0, lt = travel.length
    // Coming to a part of a day that ran with the clock going (or, stopped, to what the interface waits for): the
    // way there is seen first, on its own clock, and the work begins when they are there. A card that stops the
    // clock as the day turns does not take the way out of the picture.
    const staged = seg.kind === 'sample' || seg.kind === 'dig'
    // (the clock stopped by the player: the way and the row in hand wait where they are, as those on them do; what
    // the interface is waiting to see goes on)
    const waits = staged && (a.waited || seg.lit)
    if (this.frozen && !waits && !seg.lit) going = false
    if (a.waySeg !== seg) {
      a.waySeg = seg
      a.way = a.came = null
      if (!held && !live && (f.advancing || !seg.lit || staged) && a.u < seg.start + span * 0.5) {
        a.way = this.wayTo(a, seg, f, lw, lt + (seg.kind === 'sample' ? path.length : 0))
        a.came = seg
        a.u = seg.start
      }
    }
    if (segIdx !== a.clockSeg) { a.clockSeg = segIdx; a.segClock = 0 } else if (!a.way) a.segClock += f.dt * (f.advancing ? 1 : f.pace)
    if (!a.way) a.worked += f.dt
    const direct = a.came === seg
    let tShare = direct ? 0 : seg.kind === 'travel' ? 1 : lw + lt > 0.3 ? Math.min(0.4, 0.12 + (lw + lt) / (150 * K)) : 0
    // (a long day: the way has the time the day's plan gave it)
    if (live && seg.kind !== 'travel') tShare = seg.work !== undefined ? clamp((seg.work - seg.start) / span, 0, 0.98) : 0
    if (this.literal && a.u < 1 && !a.way && (!this.frozen || waits || seg.lit)) {
      // metres a second into a share of this part of the day
      const p0 = Math.min(1, (a.u - seg.start) / span)
      let dp: number
      if (direct && staged) dp = seg.kind === 'dig' ? f.dt / STAGE_S.dig : 0
      else if (direct && seg.kind === 'travel') dp = 1
      else if (seg.kind === 'travel' || p0 < tShare) {
        const q = seg.kind === 'travel' ? p0 : p0 / tShare, e = q * q * (3 - 2 * q)
        const wShare = lw > 0 ? lw / (lw + lt * 0.5) : 0
        const driving = e >= wShare && !!seg.ride && !!rig
        const v = driving ? (rig!.kind === 'truck' ? PACE.truck : PACE.lane) : a.worn > 0.6 ? PACE.worn : PACE.walk
        dp = ((v * f.dt) / Math.max(1, (lw + lt * 0.5) * (e >= wShare ? 2 : 1) * Math.max(0.35, 6 * q * (1 - q)))) * (seg.kind === 'travel' ? 1 : tShare)
      }
      // (the clock stopped on a day that was running: the load in hand goes in, and that is the day's hauling seen)
      else if (seg.site && seg.kind === 'haul' && !seg.lit) dp = a.segClock < 0.4 || this.stage.tripOpen(seg.site, a.id) ? 0 : 1
      else if (seg.site) dp = (f.dt / (seg.kind === 'haul' ? HAUL_LAP_S * (seg.loads ?? 1) : 900)) * (1 - tShare)
      else if (!seg.walker && rig) dp = ((PACE.work * f.dt) / Math.max(1, path.length)) * (1 - tShare)
      else if (seg.kind === 'sample') dp = 0
      else dp = ((PACE.walk * 0.7 * f.dt) / Math.max(1, path.length)) * (1 - tShare)
      a.u = Math.min(1, a.u + dp * span)
    }
    let p = direct && seg.kind === 'travel' ? 1 : Math.min(1, (a.u - seg.start) / span)
    if (seg.kind === 'sample' && !live) {
      // However long the day is, the hill is up inside two and a half seconds, and the day waits for it.
      const drive = direct ? 0 : lw + lt > 0.3 ? STAGE_DRIVE_S : 0, work = direct ? SAMPLE_S : STAGE_S.sample
      p = Math.min(1, a.segClock / (drive + work))
      tShare = drive / (drive + work)
      if (p < 0.92 && f.season) this.stageHold = this.stageHold < 0 ? seg.end - 1e-3 : Math.min(this.stageHold, seg.end - 1e-3)
    }
    if (a.way) {
      const wy = a.way, was = wy.t
      if (going) wy.t += f.clock
      // Where the way is cut they go from sight as they pull away, and come into sight again small, and grow, where
      // it brings them in: the place they are seen at is set there with them, not left to cross the farm after them.
      const t0 = wy.afoot * wy.T
      if (wy.hop > 0 && was < t0) {
        // (a long walk to the machine: seen setting off for it, and next in its seat)
        const q = wy.t / t0
        if (q < 1) a.fade = Math.min(a.fade, 1 - 0.9 * clamp((q - 0.45) / 0.55, 0, 1))
        else { a.fade = 0.1; a.sx = NaN }
      } else if (wy.cut && wy.t >= t0) {
        const tc = t0 + wy.share * (wy.T - t0), q = (wy.t - t0) / (tc - t0)
        // (the machine goes from sight with them through the cut: not while they are coming into sight in its seat)
        const k = q < 1 ? 1 - 0.9 * clamp((q - 0.5) / 0.5, 0, 1) : a.fade
        if (q < 1) a.fade = Math.min(a.fade, k)
        if (was < tc && wy.t >= tc) { a.fade = 0.1; a.sx = NaN; if (rig && seg.ride) rig.sx = NaN }
        if (rig && seg.ride) rig.fade = Math.min(rig.fade, q < 1 ? k : a.fade)
      }
      const s = wayAt(wy)
      if (s < lw) foot(walkTo.at(s))
      else if (s <= lw + lt || seg.kind !== 'sample') {
        const e = travel.at(Math.min(lt, s - lw))
        if (seg.ride && rig) ride(e)
        else foot(e)
      } else foot(path.at(s - lw - lt))
      passed(-1)
      if (tractor && seg.ride === 'tractor' && seg.kind !== 'travel') tractor.setImplement(seg.site ? (seg.kind === 'haul' ? 'trailer' : 'none') : implementFor(seg.kind, f.snap.farm.equipment.includes('harvester')))
      if (wy.t >= wy.T) a.way = null
    } else if (p < tShare || seg.kind === 'travel') {
      // on the way: on foot to the machine if it stands elsewhere, then the drive; or on foot all the way
      const q = seg.kind === 'travel' ? p : p / tShare
      if (live) this.wayLive(a, seg, q, span * (seg.kind === 'travel' ? 1 : tShare) * f.daySec, lw, lt, walkTo, travel, foot, ride)
      else {
        const e = q * q * (3 - 2 * q)
        const wShare = lw > 0 ? lw / (lw + lt * 0.5) : 0
        if (e < wShare) foot(walkTo.at((e / wShare) * lw))
        else {
          const along = travel.at(((e - wShare) / Math.max(1e-6, 1 - wShare)) * lt)
          if (seg.ride && rig) ride(along)
          else foot(along)
        }
      }
      if (seg.kind === 'travel' && p >= 1 && !a.aboard) { a.x = px; a.z = pz; this.atEase(a, f, pose, big); px = a.x; pz = a.z }
      passed(-1)
      // to work staged at one place the tractor brings the trailer for a haul, and nothing else
      if (tractor && seg.ride === 'tractor' && seg.kind !== 'travel') tractor.setImplement(seg.site ? (seg.kind === 'haul' ? 'trailer' : 'none') : implementFor(seg.kind, f.snap.farm.equipment.includes('harvester')))
    } else {
      const w = (p - tShare) / (1 - tShare)
      if (seg.site) {
        // the way there went by unseen (the clock ran fast): they are there
        const spot = seg.path[0]
        if (Math.hypot(spot.x - a.x, spot.z - a.z) > 9 * S && !rig) { a.x = spot.x; a.z = spot.z }
        if (rig && seg.ride && seg.kind !== 'haul' && Math.hypot(spot.x - rig.x, spot.z - rig.z) > 9 * S && w < 0.4) { rig.x = spot.x; rig.z = spot.z; rig.moved = 0 }
        site = { key: seg.site, kind: seg.site.split('|')[1], field: seg.field, w, loads: seg.loads ?? 1, lit: seg.lit }
        passed(-1)
      } else if (!seg.walker && rig) {
        a.doing = 'rows'
        if (tractor) tractor.setImplement(implementFor(seg.kind, f.snap.farm.equipment.includes('harvester')))
        rig.state.kind = seg.kind
        let arc: number
        if (seg.lit) {
          // literally: along every pass of the day's ground, which changes where the machine has been
          ride(path.at(w * path.length))
          rig.state.working = w > 0 && w < 1 ? 1 : 0
          arc = w >= 1 ? Infinity : w * path.length
        } else {
          // A pass at a time at a pace that looks right from where the camera is, going on from day to day while the
          // job lasts: along the row in hand to its end, round on the headland, and back along the band's leading row
          // as it then stands. The band itself fills in behind as the day's work is counted.
          const key = `${seg.field}|${seg.kind}`
          if (a.arcSeg !== seg || !a.line) {
            a.arcSeg = seg
            if (seg.from >= 0 || !a.line || a.line.key !== key) a.line = { key, poly: path, arc: Math.max(0, seg.from), seg }
          }
          const line = a.line!
          if (line.arc >= line.poly.length - 0.5 && line.seg !== seg && w < 1) {
            // onto the leading row from whichever end the machine is at
            const ends = seg.path, near = Math.abs(ends[0].x - rig.x) < Math.abs(ends[ends.length - 1].x - rig.x)
            const a0 = near ? ends[0] : ends[ends.length - 1], a1 = near ? ends[ends.length - 1] : ends[0]
            const out = a0.x > a1.x ? 1 : -1
            line.poly = new Poly([{ x: rig.x, z: rig.z }, { x: a0.x + out * 5, z: (rig.z + a0.z) / 2 }, a0, a1])
            line.arc = 0
            line.seg = seg
          }
          // (a day's digging seen with the clock stopped: the band is out in a moment, and the digger works on along its row)
          const on = (w < 1 || (this.literal && seg.kind === 'dig')) && line.arc < line.poly.length - 0.5
          if (on && going) line.arc = Math.min(line.poly.length, line.arc + this.pace * f.dt)
          ride(line.poly.at(line.arc))
          rig.state.working = on ? 1 : 0
          arc = w >= 1 ? Infinity : w * path.length
        }
        passed(arc)
        if (seg.kind === 'dig') this.dug(a, segIdx, seg, arc, f.snap)
      } else if (seg.kind === 'sample') {
        // The test dig is staged: the walk in, the fork set and the hill lifted, then a moment to look.
        const go = direct ? 1 : Math.min(1, w / 0.5)
        const e = path.at(go * path.length)
        if (go < 1) foot(e)
        else {
          px = e.x; pz = e.z
          a.heading = -Math.PI / 2
          a.aboard = false
          const dig = direct ? clamp(w / 0.5, 0, 1) : clamp((w - 0.5) / 0.26, 0, 1)
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
            if (hill) {
              const ty = heightAt(hill.x, hill.z + 0.34), up = V2.set(0, 1, 0)
              this.prims.put('box', V.set(hill.x - 0.02, ty, hill.z + 0.34), up, AXIS_X, 1.08, 0.02, 0.32, TRAY)
              for (const sd of [-1, 1]) {
                this.prims.put('box', V.set(hill.x - 0.02, ty, hill.z + 0.34 + sd * 0.165), up, AXIS_X, 1.1, 0.07, 0.02, CHAIR)
                this.prims.put('box', V.set(hill.x - 0.02 + sd * 0.545, ty, hill.z + 0.34), up, AXIS_X, 0.02, 0.07, 0.34, CHAIR)
              }
            }
          }
        }
        passed(w >= (direct ? 0.5 : 0.64) ? Infinity : -1)
      } else {
        // Walking the rows at a walker's pace, stopping every few steps: the scout bends to a plant; pulling blighted
        // plants, a stoop at each and a sack filling. What they find or pull shows over the day (or, literally, as
        // they come to it).
        // (a tool that holds the day at a point puts them that far along)
        if (a.arcSeg !== seg || jumped) { a.arcSeg = seg; a.arc = seg.lit ? w * path.length : seg.from; a.beat = 0 }
        const cycle = seg.kind === 'scout' ? 5.2 : 3.6
        if (live) {
          // (the day's own time: so many stretches of walking, each ending in a stop, over the hours of it)
          const n = Math.max(1, Math.round((span * (1 - tShare) * f.daySec) / cycle)), c = Math.min(n - 1e-6, w * n), fr = c - Math.floor(c)
          a.beat = fr * cycle
          a.arc = (path.length * (Math.floor(c) + Math.min(1, fr / ((cycle - 1.5) / cycle)))) / n
        } else if (going) a.beat += f.dt
        const walking = a.beat % cycle < cycle - 1.5
        const on = w < 1 && (live || a.arc < path.length - 0.3)
        if (!live && on && walking && going) a.arc = Math.min(path.length, a.arc + (a.worn > 0.6 ? PACE.worn : PACE.walk) * (this.literal ? 1 : clamp(f.dist / 110, 1, 2.5)) * f.dt)
        const e = path.at(a.arc)
        if (walking || !on) foot(e, 0)
        else {
          px = e.x; pz = e.z
          a.aboard = false
          pose.reset()
          // (bending to a plant, so only where there are plants)
          if (fieldAt(e.x, e.z) >= 0) stoop(pose, Math.sin((((a.beat % cycle) - (cycle - 1.5)) / 1.5) * Math.PI), f.time * 5, seg.kind !== 'scout')
          else stand(pose, f.time, a.tired, 3)
        }
        if (seg.kind === 'rogue') { pose.held = 'sack'; pose.size = 0.6 + 0.6 * w }
        if (!on) this.idle(a, f, pose)
        passed(w >= 1 ? Infinity : seg.lit ? a.arc : w * path.length)
      }
    }
    if (site) return site
    if (a.aboard && rig) { a.x = rig.x; a.z = rig.z; a.heading = rig.heading; return null }
    a.x = px
    a.z = pz
    this.figure(a, pose, big)
    this.ring(a.sx, heightAt(a.sx, a.sz), a.sz, this.mark, a, f, this.far)
    return null
  }

  // A long day's way to a part of its work, q of the way through its T seconds: on foot to the machine, then the
  // drive (or on foot all the way), up to pace and down from it. A way too long to go in its time at a pace that
  // reads is cut: they set off, go from sight, and come into sight again over its last stretch.
  private wayLive(a: Actor, seg: Seg, q: number, T: number, lw: number, lt: number, walkTo: Poly, travel: Poly, foot: (e: { x: number; z: number; dx?: number; dz?: number }) => void, ride: (e: { x: number; z: number; dx: number; dz: number }) => void): void {
    const rig = a.rig
    const riding = !!seg.ride && !!rig
    const vr = riding ? (rig!.kind === 'truck' ? LIVE_PACE.truck : LIVE_PACE.tractor) : LIVE_PACE.walk
    const tw = lw / LIVE_PACE.walk, tr = lt / vr, need = tw + tr
    const L = lw + lt
    if (L < 0.05 || T <= 1e-3) { const e = lt > 0 ? travel.at(lt) : walkTo.at(lw); if (riding && lt > 0) ride(e as { x: number; z: number; dx: number; dz: number }); else foot(e); return }
    const at = (s: number) => {
      if (s < lw) foot(walkTo.at(s))
      else { const e = travel.at(Math.min(lt, s - lw)); if (riding) ride(e); else foot(e) }
    }
    // (up to pace over a second or so, and down from it)
    const ramp = Math.min(0.4, 1.2 / T)
    const ease = (x: number) => (x < ramp ? (x * x) / (2 * ramp * (1 - ramp)) : x > 1 - ramp ? 1 - ((1 - x) * (1 - x)) / (2 * ramp * (1 - ramp)) : (x - ramp / 2) / (1 - ramp))
    if (need <= T * 1.35) {
      // each part of it has the time its own pace asks, in proportion
      const e = ease(clamp(q, 0, 1)), ws = need > 0 ? tw / need : 0
      at(e < ws ? (e / Math.max(1e-6, ws)) * lw : lw + ((e - ws) / Math.max(1e-6, 1 - ws)) * lt)
      return
    }
    // cut: the first of it and the last of it at pace, half the time each
    const t = clamp(q, 0, 1) * T, half = T / 2
    const pace = (s: number) => (s < lw ? LIVE_PACE.walk : vr) * 1.2
    if (t < half) {
      let s = 0, left = t
      // (on foot first, then the drive)
      const onFoot = Math.min(left, lw / pace(0)); s += onFoot * pace(0); left -= onFoot
      if (left > 0) s += left * pace(lw + 1)
      at(Math.min(L, s))
      const k = 1 - 0.9 * clamp((t / half - 0.6) / 0.4, 0, 1)
      a.fade = Math.min(a.fade, k)
      if (riding && s >= lw) rig!.fade = Math.min(rig!.fade, k)
    } else {
      const back = (T - t) * pace(L)
      if (a.cutSeg !== seg) { a.cutSeg = seg; a.sx = NaN; a.fade = 0.1; if (riding) { rig!.sx = NaN; rig!.fade = 0.1 } }
      at(Math.max(0, L - back))
    }
  }

  // The way to a part of the day's work: how long it is seen for, and how much of it. It goes no faster than the
  // places people and machines are seen at can go (follow), so what is seen keeps up with it; a way too long for its
  // time at that pace is cut.
  private wayTo(a: Actor, seg: Seg, f: CrewFrame, lw: number, rest: number): Way | null {
    const L = lw + rest
    if (L < 3) return null
    const afoot = Math.min(FOOT_MOST, clamp(f.dist / 40, 2.8, 9)) * this.quick
    let v = seg.ride && a.rig ? Math.min(RIG_MOST, clamp(f.dist / 12, 8, 45)) * this.quick : afoot
    if (a.lead) v = Math.min(v, LEAD_PACE * this.quick)
    let most = a.lead ? Infinity : a.arrived ? ARRIVE * f.daySec : WAY_MOST[f.speed] ?? 2.6
    // (what the interface waits to see: sooner still at the faster clocks, where a day is over in a second)
    const st = a.waited ? WAY_STAGED[seg.kind] : undefined
    if (st) most = Math.min(most, st[1] * (f.speed >= 2 ? 0.6 : 1))
    const hop = lw > 0.3 && !!seg.ride && !!a.rig && lw / (0.75 * afoot) > HOP_S * 1.2
    const tw = hop ? HOP_S : lw / (0.75 * afoot)
    const ramp = Math.min(RAMP_S, rest / (0.9 * v))
    const need = tw + (rest > 0 ? rest / (0.9 * v) + ramp : 0)
    const share = a.arrived ? WAY_LEAD_IN : WAY_LEAD
    a.arrived = false
    if (need <= most * 1.1) return { t: 0, T: Math.max(0.35, need), L, reach: L, cut: false, lead: 0, share, walk: lw, afoot: need > 0 ? tw / need : 0, hop: hop ? Math.min(lw, afoot * 0.5 * HOP_S) : 0, ramp }
    most *= (a.led ? WAY_LED : 1) * clamp(L / WAY_FULL, WAY_SHORT, 1)
    a.led = false
    const reach = Math.min(L, v * 0.55 * most)
    // (to a machine someone else has left, then a drive too long to show: they are seen to it and pulling away in it,
    // which is how it is seen to change hands; what the interface waits for is not kept waiting for that)
    // (at 8x there is no time for it: a day is half a second)
    const to = Math.min(tw, HAND_S / this.quick)
    const handed = a.handed
    a.handed = false
    if (handed && lw > 0.3 && seg.ride && a.rig && !st && f.speed < 3) return { t: 0, T: to + most * HAND_DRIVE, L, reach, cut: true, lead: reach * WAY_TAKEN, share: WAY_TAKEN, walk: lw, afoot: to / (to + most * HAND_DRIVE), hop: hop ? Math.min(lw, afoot * 0.5 * to) : 0, ramp: 0 }
    return { t: 0, T: most, L, reach, cut: true, lead: lw > 0.3 ? Math.min(lw, afoot * 0.6 * most * share) : reach * share, share, walk: lw, afoot: 0, hop: 0, ramp: 0 }
  }

  // Not at work: a Sunday on the porch, laid up in a chair, waiting in the yard, or stood where the last job ended.
  // A long day with nothing to do: about the dooryard, from one place in it to another and standing a while at each,
  // not stood on one spot from morning to night. True while that is what they are at.
  private potter(a: Actor, f: CrewFrame, pose: Pose, big: number): boolean {
    if (!this.live || a.state !== 'idle' || !a.home || a.aboard || a.worn > 0.72 || f.snap.mode !== 'season') return false
    const period = 24 + (a.id % 3) * 9
    const n = Math.floor((f.time + a.id * 13) / period)
    const spot = idleSpot(-1, (a.slot + n * 5) % 12, false)
    const k = Math.max(1, (big / TRUE_SIZE) * 0.72)
    const tx = a.about.x + (spot.x - a.about.x) * k, tz = a.about.z + (spot.z - a.about.z) * k
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz)
    // (never from across the farm: someone back from the fields goes to their own place first)
    if (d > 40) return false
    if (d > 0.25 && !this.frozen) {
      const step = Math.min(d, 1.2 * (1 - 0.3 * a.tired) * f.dt)
      a.x += (dx / d) * step
      a.z += (dz / d) * step
      a.heading = Math.atan2(dz, dx)
      a.gait += (step / (0.46 * big)) * Math.PI * 2
      walk(pose, a.gait, 1, a.tired, 0)
    } else {
      if (d <= 0.25) a.heading = spot.heading
      stand(pose, f.time + a.id * 3.1, a.tired, (a.style + n) % 3)
    }
    return true
  }

  private atEase(a: Actor, f: CrewFrame, pose: Pose, big: number): void {
    if (this.potter(a, f, pose, big)) return
    const g = a.goal
    const k = a.home ? Math.max(1, (big / TRUE_SIZE) * 0.72) : 1
    const there = g && (Math.hypot(g.x - a.x, g.z - a.z) < 1.2 || (a.home === g && Math.hypot(a.about.x + (g.x - a.about.x) * k - a.x, a.about.z + (g.z - a.about.z) * k - a.z) < 1.2))
    if (a.aboard && a.rig) return
    if (g && there) {
      a.x = g.x; a.z = g.z
      a.heading = g.heading
      this.spread(a, big)
      if (a.state === 'hurt') {
        // laid up: in a chair by the kitchen door, an arm in a sling
        sit(pose, f.time + a.id, 0.2, 0.5)
        pose.held = 'sling'
        pose.gripL = true
        pose.handL.set(0.1, 0.36, 0.0)
        const y = heightAt(a.x, a.z), bx = Math.cos(a.heading), bz = Math.sin(a.heading)
        this.prims.put('box', V.set(a.x, y, a.z), V2.set(0, 1, 0), AXIS_X, 0.2 * big, 0.2 * big, 0.2 * big, CHAIR)
        this.prims.put('box', V.set(a.x - bx * 0.1 * big, y + 0.2 * big, a.z - bz * 0.1 * big), V2.set(0, 1, 0), AXIS_X, 0.2 * big, 0.26 * big, 0.2 * big * 0.14, CHAIR)
      }
      else if (a.state === 'mend') {
        // leaning in over the engine with a wrench, straightening now and then to look at it
        const u = (f.time * 0.21 + a.id * 0.3) % 1
        if (u < 0.78) hammering(pose, u < 0.5 ? 1.2 : f.time * 7, 0.6)
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
    const k = Math.max(1, (big / TRUE_SIZE) * 0.72)
    a.x = a.about.x + (a.home.x - a.about.x) * k
    a.z = a.about.z + (a.home.z - a.about.z) * k
  }

  // The digger has passed these hills: the pickers and the crows go to them.
  private dug(a: Actor, segIdx: number, seg: Seg, arc: number, snap: Snapshot): void {
    let g = this.gangs.get(seg.field)
    if (!g) {
      const corner = restAt(seg.field, 1, true)
      g = { field: seg.field, lead: { x: corner.x, z: corner.z, dx: -1, dz: 0 }, pickers: [], recent: [], crows: [], idle: 0 }
      for (let k = 0; k < 5; k++) g.crows.push({ x: corner.x - (3 + k) * S, z: corner.z + 2 * S, fx: 0, fz: 0, tx: corner.x - (3 + k) * S, tz: corner.z + 2 * S, t: 1, wait: 1 + k, h: k })
      this.gangs.set(seg.field, g)
    }
    g.idle = 0
    // where the digger is, and which way it is going: the pickers work in a line behind it
    if (a.rig) g.lead = { x: a.rig.x, z: a.rig.z, dx: Math.cos(a.rig.heading), dz: Math.sin(a.rig.heading) }
    const want = snap.farm.pickers ? 9 : 2
    while (g.pickers.length < want) {
      // they come on in a line behind the digger, each to a stretch of the row it has opened
      const k = g.pickers.length, back = 6 + 2.3 * k
      const x = g.lead.x - g.lead.dx * back, z = g.lead.z - g.lead.dz * back + (k % 2 ? 1.2 : -1.2)
      g.pickers.push({ dress: this.extras[(k + seg.field * 3) % this.extras.length], x, z, tx: x, tz: z, wait: 0.3 * k, heading: 1.6, gait: k, bent: 0 })
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

  private callersAndLife(f: CrewFrame, mf: MachineFrame, big: number, bigMachine: number, going: boolean): void {
    const pr = this.prims, snap = f.snap
    const pose = POSE
    const things = this.things
    things.length = 0
    const seen = (kind: ThingKind, k: number, x: number, z: number, tall: number, holder = -1) => { things.push({ kind, k, holder, x, y: heightAt(x, z), z, tall }) }
    if (snap.mode !== 'title') {
      const each = { tractor: 0, truck: 0 }
      for (const r of this.rigs) seen(r.kind, each[r.kind]++, r.sx, r.sz, 2.6 * bigMachine, r.holder)
    }
    // The contractor's bulldozer, wherever stumps are being pulled.
    if (snap.mode === 'season') for (let i = 0; i < snap.fields.length; i++) if (snap.fields[i].works === 'stump') this.dozer(f, i, going)
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
      seen('asking', k, GATE.x + 0.75 * k * big * 0.6, GATE.z + 0.35 * (k % 2) * big, 1.8 * big)
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
      seen(kind === 'pickup' ? 'neighbour' : 'buyer', 0, man.x, man.z, 1.8 * big)
      seen(kind === 'pickup' ? 'neighbour' : 'buyer', 1, spot.x, spot.z, 1.6 * bigMachine)
    }
    caller('pickup', poach, CALLER.truck, CALLER.man, NEIGHBOUR, 1)
    caller('sedan', buyer, BUYER.car, BUYER.man, BUYER_MAN, 2)

    // Pickers behind the digger, and the crows that follow it.
    for (const [field, g] of this.gangs) {
      const digging = snap.mode === 'season' && (snap.fields[field].status === 'digging' || snap.fields[field].status === 'dug') && g.idle < 40
      if (!digging) { this.gangs.delete(field); continue }
      if (going) g.idle += f.dt
      g.pickers.forEach((p, k) => {
        let dx = p.tx - p.x, dz = p.tz - p.z, dist = Math.hypot(dx, dz)
        // (they have been behind the digger all along, wherever the day is taken up)
        if (dist > 28) { p.x = p.tx; p.z = p.tz; dx = dz = dist = 0 }
        if (dist > 0.25 * big) {
          const step = Math.min(dist, (!going ? 0 : this.literal ? PACE.walk * 1.9 : this.pace * 1.2) * f.dt)
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
          if (p.wait <= 0) {
            // in a line along the freshly dug rows behind the digger, each to their own stretch of it
            const back = 6 + 2.3 * k + (Math.random() - 0.5) * 1.2, across = (Math.random() - 0.5) * 3.6
            p.tx = g.lead.x - g.lead.dx * back - g.lead.dz * across
            p.tz = g.lead.z - g.lead.dz * back + g.lead.dx * across
            p.wait = 1.2 + Math.random() * 2.2
          }
        }
        pose.held = 'basket'
        figureMatrix(M, p.x, heightAt(p.x, p.z) + 0.02, p.z, p.heading, big)
        drawFigure(pr, M, p.dress, pose)
        seen('picker', k, p.x, p.z, 1.6 * big)
      })
      for (const c of this.lively ? g.crows : []) {
        if (going) c.t += f.dt / 1.1
        if (c.t >= 1) {
          if (going) c.wait -= f.dt
          if (c.wait <= 0 && g.recent.length > 6) {
            const t = g.recent[Math.floor(Math.random() * Math.max(1, g.recent.length - 6))]
            c.fx = c.x; c.fz = c.z
            c.tx = t.x + (Math.random() - 0.5) * 1.5 * S
            c.tz = t.z + (Math.random() - 0.5) * 1.5 * S
            c.t = 0
            c.wait = 2 + Math.random() * 5
            c.h = Math.atan2(c.tz - c.fz, c.tx - c.fx)
          }
        }
        const q = clamp(c.t, 0, 1)
        if (q < 1) { c.x = c.fx + (c.tx - c.fx) * q; c.z = c.fz + (c.tz - c.fz) * q }
        drawCrow(pr, c.x, heightAt(c.x, c.z) + (q < 1 ? Math.sin(q * Math.PI) * 1.3 * big : 0), c.z, c.h, Math.min(big, 1.8 * TRUE_SIZE) * 0.9, q < 1 ? 1 : 0, f.time * 6 + c.wait)
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
          const nx = c.x + Math.cos(c.h) * 0.25 * S * f.dt, nz = c.z + Math.sin(c.h) * 0.25 * S * f.dt
          if (Math.abs(nx - COW_AT.x) < 22 && Math.abs(nz - COW_AT.z) < 22) { c.x = nx; c.z = nz } else c.h += Math.PI * 0.6
        }
        // the neighbour's stock is scenery: never drawn as large as the farm's own people are from far off
        drawBeast(pr, COWS[c.kind], c.x, heightAt(c.x, c.z), c.z, c.h, big * COW, f.time * 3 + c.kind, c.walking ? 0.7 : 0, c.walking ? 0 : 1)
        seen('cow', c.kind, c.x, c.z, 1.4 * big * COW)
      }
    }
    // A deer at the wood's edge, gone into the trees when anyone comes near.
    const d = this.deer
    let near = false
    for (const a of this.actors) if (Math.hypot(a.x - d.x, a.z - d.z) < 11 * S) near = true
    d.away = clamp(d.away + (near ? f.dt * 0.9 : -f.dt * 0.06), 0, 1)
    d.t += f.dt
    if (this.lively && d.away < 0.99 && snap.mode !== 'title') {
      const z = d.z - d.away * 5 * S
      drawBeast(pr, DEER, d.x - d.away * 2 * S, heightAt(d.x, z), z, near ? -1.9 : 0.4, big * 0.95 * (1 - 0.5 * d.away), d.away > 0.02 ? f.time * 14 : 0, d.away > 0.02 && d.away < 0.99 ? 1 : 0, near ? 0 : (Math.sin(d.t * 0.4) > 0.2 ? 1 : 0))
      if (d.away < 0.5) seen('deer', 0, d.x - d.away * 2 * S, z, 1.5 * big)
    }
  }

  // The contractor's bulldozer on a tract whose stumps are being pulled: back and forth across the cut ground at the
  // line the torn earth has reached (where the land draws the stumps going and the rows of them pushed up), turning
  // on its tracks at each end, its smoke and the earth it raises to be seen from across the farm.
  private dozers = new Map<number, { s: number; dir: number; turn: number; puff: number }>()
  private dozer(f: CrewFrame, i: number, going: boolean): void {
    const fv = f.snap.fields[i], r = FIELDS[i], pr = this.prims
    const done = clamp(1 - fv.worksLeft / STUMP_DAYS, 0.04, 1), brush = PARCELS[i].cover === 'brush'
    let d = this.dozers.get(i)
    if (!d) this.dozers.set(i, (d = { s: 8, dir: 1, turn: 0, puff: 0 }))
    const span = brush ? FD : FW
    // (at its own crawl with the clock stopped or from close by; quicker the further off it is seen from)
    const v = this.literal ? 1.4 : clamp(f.dist / 60, 1.4, 8)
    if (going && !this.frozen) {
      if (d.turn > 0) d.turn = Math.max(0, d.turn - f.dt / 1.6)
      else {
        d.s += d.dir * v * f.dt
        if (d.s > span - 8 || d.s < 8) { d.s = clamp(d.s, 8, span - 8); d.dir = -d.dir; d.turn = 1 }
      }
    }
    // (woods are torn up from the farm's side, brush from the road's, as the land draws it)
    const x = brush ? r.x0 + 3 + done * (FW - 6) : r.x0 + d.s, z = brush ? r.z0 + d.s : r.z1 - 3 - done * (FD - 6)
    const h = (brush ? Math.PI / 2 : 0) + (d.dir > 0 ? 0 : Math.PI) - Math.PI * d.turn
    const y = heightAt(x, z), fx = Math.cos(h), fz = Math.sin(h)
    const fwd = V2.set(fx, 0, fz)
    const at = (along: number, up: number, across: number) => V.set(x + fx * along - fz * across, y + up, z + fz * along + fx * across)
    for (const sd of [-1, 1]) pr.put('box', at(0, 0, sd * 0.95), DOZER_UP, fwd, 4.2, 0.85, 0.55, DOZER_TRACK)
    pr.put('box', at(0, 0.5, 0), DOZER_UP, fwd, 3.1, 0.95, 1.5, DOZER_PAINT)
    pr.put('box', at(0.75, 1.4, 0), DOZER_UP, fwd, 1.6, 0.7, 1.25, DOZER_PAINT)
    pr.put('box', at(-0.8, 1.4, 0), DOZER_UP, fwd, 1.3, 1.45, 1.4, DOZER_CAB)
    pr.put('box', at(-0.8, 2.85, 0), DOZER_UP, fwd, 1.6, 0.1, 1.7, DOZER_TRACK)
    pr.put('box', at(2.55, 0.08, 0), DOZER_UP, fwd, 0.28, 1.15, 3.3, DOZER_BLADE)
    for (const sd of [-1, 1]) pr.put('box', at(1.75, 0.45, sd * 1.3), DOZER_UP, fwd, 1.7, 0.22, 0.16, DOZER_PAINT)
    pr.put('cyl', at(1.2, 2.1, 0.35), DOZER_UP, fwd, 0.07, 0.75, 0.07, DOZER_TRACK)
    if (f.reduced || !going || this.frozen) return
    // its smoke, and the earth the blade turns up: larger and longer in the air the further off it is seen from
    const far = clamp((Math.hypot(x - EYE.x, y - EYE.y, z - EYE.z) - 110) / 330, 0, 1), rnd = Math.random
    d.puff += f.dt
    if (d.puff > 0.1) {
      d.puff = 0
      at(1.2, 2.9, 0.35)
      f.particles.emit(V.x, V.y, V.z, 0, 1.3 + rnd() * 0.6 + 1.2 * far, 0, 0.16 + 0.5 * far, 0.8 + 0.5 * far, (1.4 + rnd()) * (1 + 1.3 * far), 0.2, 0.2, 0.21, 0.34 + 0.2 * far, 0.6)
      if (d.turn <= 0 && rnd() < 0.7) {
        at(2.9, 0.4, (rnd() - 0.5) * 3)
        const dry = this.cold ? 0.4 : 1 - 0.6 * clamp(f.env.wet * 1.5 - 0.5, 0, 1)
        // (pale against the woods behind, and carried up a few times the machine's height before it thins)
        f.particles.emit(V.x, V.y, V.z, fx * 0.6, 0.5 + rnd() * 0.5 + 0.9 * far, fz * 0.6, (0.9 + rnd() * 0.6) * (1 + 1.6 * far), 0.5 + 0.3 * far, (2.6 + rnd() * 2) * (1 + 0.9 * far), 0.46 + 0.26 * far, 0.36 + 0.26 * far, 0.27 + 0.22 * far, (0.3 + 0.5 * far) * dry, 0.4, 0.7 * far)
        if (far > 0.5) f.particles.emit(V.x, V.y + 2.5, V.z, 0, 1.2, 0, 2.6 + rnd() * 1.4, 0.9, 5 + rnd() * 4, 0.72, 0.64, 0.5, 0.6 * far * dry, 0.5, 0.8)
      }
    }
  }

  // At the lowest setting the small parts throw no shadows, and the cows, the deer and the crows stay away.
  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.lively = tier !== 'low'
    this.prims.setShadows(tier !== 'low')
  }

  // The screen's size in CSS pixels, for how large people must be drawn to be seen.
  setScreen(_w: number, h: number): void { this.screenH = Math.max(200, h) }

  // The person under a point on the screen (CSS pixels), or -1. A person is a few pixels tall from the playing view, so
  // the reach is generous: anywhere on their body or within twenty-six pixels of it, at the foot of their pin, or on
  // the machine they have in hand. Of those within reach, the nearest on the screen.
  pick(x: number, y: number, camera: PerspectiveCamera, w: number, h: number, _markers = false): number {
    let best = -1, bd = Infinity
    const screen = (px: number, py: number, pz: number): [number, number] | null => {
      this.v.set(px, py, pz).project(camera)
      return this.v.z > 1 ? null : [(this.v.x + 1) / 2 * w, (1 - this.v.y) / 2 * h]
    }
    const reach = (at: [number, number] | null, top: [number, number] | null, least: number, id: number) => {
      if (!at) return
      const r = Math.max(least, top ? Math.hypot(top[0] - at[0], top[1] - at[1]) * 1.15 : 0)
      const d = Math.hypot(at[0] - x, at[1] - y)
      if (d < r && d < bd) { bd = d; best = id }
    }
    for (const a of this.actors) {
      if (!this.inSight(a)) continue
      const o = this.over(a, V2), ox = o.x, oy = o.y, oz = o.z
      const base = oy - a.ay
      // the body (half way up it, out to its head), and the foot of the pin
      reach(screen(ox, base + a.ay * 0.45, oz), screen(ox, oy, oz), 26, a.id)
      reach(screen(ox, oy, oz), null, 22, a.id)
      // (their machine, where it is seen)
      const r = a.rig
      if (r && Number.isFinite(r.sx)) reach(screen(r.sx, heightAt(r.sx, r.sz) + 1.1, r.sz), screen(r.sx + 2.4, heightAt(r.sx, r.sz) + 1.1, r.sz), 30, a.id)
    }
    return best
  }

  // Whatever else is under a point on the screen, or null: a machine, a caller, a picker, an animal. Each answers
  // within twenty-two pixels of it or over its height, whichever is more; the nearest wins.
  pickThing(x: number, y: number, camera: PerspectiveCamera, w: number, h: number): Thing | null {
    let best: Thing | null = null, bd = 1
    for (const t of this.things) {
      this.v.set(t.x, t.y + t.tall * 0.5, t.z).project(camera)
      if (this.v.z > 1) continue
      const sx = (this.v.x + 1) / 2 * w, sy = (1 - this.v.y) / 2 * h
      this.v.set(t.x, t.y + t.tall, t.z).project(camera)
      const r = Math.max(22, Math.hypot((this.v.x + 1) / 2 * w - sx, (1 - this.v.y) / 2 * h - sy) * 1.2)
      const d = Math.hypot(sx - x, sy - y) / r
      if (d < bd) { bd = d; best = { kind: t.kind, k: t.k, holder: t.holder } }
    }
    return best
  }

  // Where a thing stands in the world (its top), for the interface to set its card beside; false when it is not drawn.
  thingAt(t: Thing, out: Vector3): boolean {
    const s = this.things.find(x => x.kind === t.kind && x.k === t.k)
    if (!s) return false
    out.set(s.x, s.y + s.tall, s.z)
    return true
  }

  dispose(): void {
    this.ringGeo.dispose()
    this.ringMat.dispose()
    this.prims.dispose()
    for (const r of this.rigs) r.machine.dispose()
    this.callers.pickup?.dispose()
    for (const kind of YARD_KINDS) this.yarded[kind]?.dispose()
    this.callers.sedan?.dispose()
  }
}

// The neighbour's cows graze the pasture east of the home yard. 
const COW_AT = { x: 37 * K, z: 2 * K }
const YARD_KINDS: YardKind[] = ['harvester', 'sprayer', 'reel']
const POSE = new Pose()
const AXIS_X = new Vector3(1, 0, 0), TRAY = new Color('#cbb98e'), CHAIR = new Color('#6f5a41')
const WHITE = new Color(1, 1, 1)
const DOZER_UP = new Vector3(0, 1, 0), DOZER_PAINT = new Color('#c9961c'), DOZER_CAB = new Color('#a87a14'), DOZER_TRACK = new Color('#2a2927'), DOZER_BLADE = new Color('#8a8d8b')
const IDLE: MachineState = { moved: 0, turn: 0, working: 0, kind: 'travel', driver: null, load: 0, far: 0 }
const ASKING: Dress[] = [
  dressOf({ shirt: '#6f6a5c', trousers: '#3d3a35', hat: '#4a4640', hatKind: 'cap', hair: '#5a3d24' }),
  dressOf({ shirt: '#7d6a4f', trousers: '#33373d', hat: '#8c7a5a', hatKind: 'brim', hair: '#2b211a', skin: '#c48a62' }),
  dressOf({ shirt: '#5c6670', trousers: '#4a4136', hat: '#3b3f45', hatKind: 'cap', hair: '#8a6a3c', skin: '#f0c8a8' }),
]
const NEIGHBOUR = dressOf({ shirt: '#4d5a46', trousers: '#3d3a35', hat: '#6b5a3c', hatKind: 'brim', hair: '#b9b4a8', build: 1.1 })
const BUYER_MAN = dressOf({ shirt: '#2f3238', trousers: '#2a2c31', hat: '#3a3836', hatKind: 'fedora', hair: '#2b211a', build: 1.05 })
const smoothstep = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c) }
