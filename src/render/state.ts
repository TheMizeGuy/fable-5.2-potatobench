// What the field view draws, read from the app through the grower's views only (src/sim/view.ts).
import type { App } from '../game/app.ts'
import * as sim from '../sim/index.ts'
import { hash2 } from './noise.ts'
import { dugHills, workedHills } from './work.ts'

export type Mode = 'title' | 'plan' | 'season' | 'cellar' | 'ledger' | 'over'

export interface FieldVis {
  held: boolean            // the farm's this year (owned or rented); otherwise somebody else's ground
  available: boolean       // spring, and this land is not the farm's (field or tract): it can be rented or bought
  crop: 'potato' | 'rest'
  status: string
  hills: sim.HillLook[]
  ridge: number            // 0 flat, 0.1 planted, 0.55 hilled once, 1 hilled twice
  ridges?: number[]        // hill by hill, while a planting or a hilling is part done: the ground behind the machine
  moisture: sim.Moisture
  bloom: number
  wilt: number
  frosted: number          // share of the leaf blackened by frost this past week
  rime: number             // rime on this field this morning, 0..1
  variety: sim.VarietyId
  lot: number
  grams: number            // what the lot says came out of each dug hill, 0 before digging
  dark: number             // share of the lot lost to blight, rot or frost
  green: number            // share lost to greening
  // The land under the crop.
  ours: boolean            // owned or rented, whether a field or a tract still to clear
  cover: sim.Cover         // 'open' for a field; a tract is 'woods', 'brush' or 'stumps' until it is cleared
  clearStage: sim.ClearStage | ''   // for a tract: the next step ('fell', 'stump', 'rocks', 'done'); '' for a field
  felled: number           // share of a tract's felling done, 0..1
  works: 'stump' | 'tile' | ''      // a contractor at work here
  worksLeft: number        // season days of that work still to do
  stones: number           // 0..1
  raw: boolean             // new ground, not yet cropped or rested
  tiled: boolean
  hedge: number            // how grown-up the hedgerows are: 0 just cut .. 1 standing
  sheltered: boolean       // standing woods or brush beside it
  inField: number          // cwt dug and standing in barrels in the field
}

export interface Weather {
  sky: 'clear' | 'cloud' | 'overcast' | 'rain' | 'storm' | 'fog' | 'snow'
  tmin: number
  tmax: number
  wind: number
  wdir: number
  prcp: number
  wetH: number
  snwd: number
}

// share: how far the order has got by the day's end, 0..1 (1 once it is finished); only on a person's own work.
// rig, machine, from, to: for machine work, what was driven, which of the farm's machines it was, and its hours as
// shares of the day (the farm's day books each machine's hours once: src/sim/season.ts).
export interface Work { kind: sim.JobKind; field: number; share?: number; rig?: sim.Rig; machine?: string; from?: number; to?: number }

// A crew as the farm knows it: where it is, where it is driving to, and what it did today, in order.
export interface UnitVis {
  id: number
  kind: sim.UnitKind
  name: string
  at: number               // a field, or -1 the home yard, -2 the Dufour yard
  to: number
  along: number            // share of the drive from `at` to `to` already made (1 when not on the road)
  job: Work | null         // the order it holds
  worked: Work[]
  rig: sim.Rig             // what they are driving for the order held: '', 'tractor' or 'truck'
  tired: number            // 0..1
  mood: number             // 0..1
  hurt: boolean            // laid up today
  resting: boolean         // a day off (a Sunday the farm keeps)
  winter: sim.WinterWork   // what they do in the cellar months
  winterField: number      // the tract felled in winter, or -1
  livesOut: boolean        // hired, with no bed on the farm: comes and goes by the road
}

export interface BuildingVis {
  kind: sim.BuildingKind
  yard: number             // -1 the home yard, -2 the Dufour yard
  built: boolean
  progress: number         // 0..1 while it is going up
}

// The farmstead beyond the fields: what stands, what lies in the yard, what waits for an answer.
export interface FarmVis {
  buildings: BuildingVis[] // those standing or going up
  logs: number             // loads in the yard
  stone: number            // loads of fieldstone in the yard
  pond: number             // how full the irrigation pond stands, 0..1 (0 when there is none)
  standOpen: boolean
  tractors: number         // owned
  broken: number           // of them broken down today
  truck: boolean
  pickers: boolean         // a picking crew is on for the harvest break
  dufour: boolean          // Dufour land is held, so its yard is the farm's
  equipment: sim.UpgradeId[]
  incidents: { kind: sim.IncidentKind; unit: number }[]
  applicants: number       // people asking for work this spring
}

export interface Snapshot {
  mode: Mode
  year: number
  day: number              // day of the year shown, for light and season
  seasonDay: number        // season.day, or -1
  month: number            // cellar month, 0 = November
  fields: FieldVis[]
  weather: Weather
  worked: Work[]
  units: UnitVis[]
  farm: FarmVis
  next: Work | null
  lead: (Work & { unit: number }) | null   // the first order on the list that can be worked today, and who would take it
  frozen: boolean
  restDay: boolean         // the day just worked was a day off: nobody worked
  rime: number[] | null    // in the season, rime on the ridge, mid-slope and bottom land
  wetGround: number        // how wet the ground lies, 0 dust-dry to 1 standing water
}

const BARE: sim.HillLook = { kind: 'bare', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }
const SEED: sim.HillLook = { kind: 'seed', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }
const DUG: sim.HillLook = { kind: 'dug', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }

const RIDGE_BY_PASSES = [0.1, 0.55, 1]
// The order people take their turns at the day's work (as src/sim/crew.ts has it).
const TURN: Record<sim.UnitKind, number> = { hand: 0, operator: 1, farmer: 2 }
const WETNESS: Record<string, number> = { 'standing water': 1, wet: 0.8, good: 0.34, drying: 0.16, dry: 0.04, wilting: 0 }

// of: the farm to picture, when it is not the game's own: the day as it will go on (app.today()), for a day watched
// as it is worked.
export function snapshot(app: App, of?: sim.Campaign): Snapshot {
  const c = of ?? app.campaign
  if (!c || app.screen === 'title') return showcase()
  const mode: Mode = c.phase
  const s = c.season
  const fields: FieldVis[] = []
  // Last night, from the station record; a field froze when its own minimum, colder in the low ground, reached zero.
  const night = s && mode === 'season' && s.day > 0 ? sim.getDay(app.world, s.year, s.day - 1) : null
  const rime: number[] | null = night ? [0, 0, 0] : null
  for (let i = 0; i < sim.FIELD_COUNT; i++) {
    const plan = c.plans[i]
    const info = sim.fieldInfo(c, i)
    const held = info.tenure !== 'none' && info.status !== 'off'
    let frost = 0
    if (night && night.snwd < 20 && held) {
      const t = sim.fieldTmin(night, info.elev)
      // A light silvering at zero, white hoarfrost three degrees below.
      if (info.rime || t <= 0) frost = Math.min(1, 0.25 + Math.max(0, -t) / 3.2)
      const terrace = 2 - info.elev
      rime![terrace] = Math.max(rime![terrace], frost)
    }
    const hills: sim.HillLook[] = []
    let planted = false, dug = 0
    // Work part done shows on the ground where the machine has been (its lanes, src/render/work.ts): a planting and a
    // hilling and a vine kill change a field as the simulation has it only when they are finished, and it digs each
    // row from the same end.
    const fs = held && s && plan.crop === 'potato' ? s.fields[i] : null
    const part = (kind: sim.JobKind) => { const j = fs && mode === 'season' ? s!.jobs.find(x => x.kind === kind && x.field === i && x.done > 1e-6 && x.done < x.need - 1e-6) : undefined; return j ? workedHills(i, kind, j.done / j.need) : null }
    const sown = fs && !fs.hState.length ? part('plant') : null
    const hilled = fs && fs.hState.length ? part('hill') : null
    const killed = fs && fs.deadDay < 0 ? part('kill') : null
    const lifted = fs && fs.status === 'digging' && fs.digDone < sim.HILLS ? dugHills(fs.digDone) : null
    let ridges: number[] | undefined
    for (let h = 0; h < sim.HILLS; h++) {
      let look = fs ? sim.hillLook(fs, h) : BARE
      if (sown?.[h]) look = SEED
      if (killed?.[h] && look.kind === 'plant') look = { ...look, kind: 'dead', yellow: 1 }
      if (lifted && fs && h < fs.digDone !== lifted[h]) {
        // (the row as the digger has it: this hill's ground is that of the hill the same way in from the row's other end)
        const m = Math.floor(h / sim.COLS) * sim.COLS + (sim.COLS - 1 - (h % sim.COLS))
        look = lifted[h] ? DUG : sim.hillLook(fs, m)
      }
      if (look.kind !== 'bare') planted = true
      if (look.kind === 'dug') dug++
      hills.push(look)
    }
    if (sown) ridges = sown.map(w => (w ? RIDGE_BY_PASSES[0] : 0))
    if (hilled) ridges = hilled.map(w => RIDGE_BY_PASSES[Math.min(2, info.hillPasses + (w ? 1 : 0))])
    const lot = info.lot >= 0 ? c.lots.find(l => l.id === info.lot) : undefined
    let grams = 0, dark = 0, green = 0
    if (lot && dug > 0) {
      const g = lot.grades
      const total = g.no1 + g.chef + g.b + g.no2 + g.cull + lot.skinned
      if (total > 0) {
        grams = total / dug / sim.CWT_PER_HILL_GRAM
        dark = (lot.loss.blight + lot.loss.rot + lot.loss.frost) / total
        green = lot.loss.green / total
      }
    }
    fields.push({
      held,
      available: !held && mode === 'plan' && info.tenure === 'none',
      crop: held ? plan.crop : 'rest',
      status: info.status,
      hills,
      ridge: planted ? RIDGE_BY_PASSES[Math.min(2, info.hillPasses)] : 0,
      ridges,
      moisture: info.moistureLabel,
      bloom: info.bloom,
      wilt: info.wilt,
      frosted: info.frosted,
      rime: frost,
      variety: plan.variety,
      lot: info.lot,
      grams, dark, green,
      ours: info.tenure !== 'none',
      cover: info.cover,
      clearStage: info.clearing ? info.clearing.stage : '',
      felled: info.clearing ? info.clearing.felled : 0,
      works: info.works ? info.works.kind : '',
      worksLeft: info.works ? info.works.left : 0,
      stones: info.stones,
      raw: info.raw,
      tiled: info.tiled,
      hedge: info.brushed > 0 ? 1 - info.brushed / sim.BRUSH_YEARS : 1,
      sheltered: info.sheltered,
      inField: info.inField,
    })
  }
  let weather: Weather
  let day: number
  if (s && mode === 'season') {
    const t = sim.today(app.world, c)!
    const d = t.day
    weather = { sky: t.sky, tmin: d.tmin, tmax: d.tmax, wind: d.wind, wdir: d.wdir, prcp: d.prcp, wetH: d.wetH, snwd: d.snwd }
    day = s.day
  } else {
    const w = phaseWeather(mode, c.month)
    weather = w.weather
    day = w.day
  }
  const worked: Work[] = []
  const inSeason = !!s && mode === 'season'
  if (inSeason) for (const w of s.worked) if (!worked.some(x => x.kind === w.kind && x.field === w.field)) worked.push({ kind: w.kind, field: w.field })
  const people = sim.peopleInfo(c)
  const resting = inSeason && !s.frozen && !sim.workday(c, s)
  const units: UnitVis[] = sim.crewInfo(c).map(u => {
    const trip = u.travelling ? sim.travelDays(u.at, u.to) : 0
    const p = people.find(x => x.id === u.id)
    const hurt = !!p && inSeason && p.hurtUntil > s.day
    return {
      rig: c.crew.find(x => x.id === u.id)?.rig ?? '',
      tired: p ? p.tired : 0, mood: p ? p.mood : 1, hurt, resting: resting && !hurt,
      winter: p ? p.winter : 'off', winterField: p ? p.winterField : -1, livesOut: !!p && p.kind !== 'farmer' && !p.bed,
      id: u.id, kind: u.kind, name: u.name,
      at: inSeason ? u.at : sim.HOME_YARD, to: inSeason ? u.to : sim.HOME_YARD,
      along: u.travelling && trip > 0 ? Math.max(0, Math.min(1, 1 - u.road / trip)) : 1,
      job: inSeason && u.job ? { kind: u.job.kind, field: u.job.field } : null,
      worked: inSeason ? s.worked.filter(w => w.unit === u.id).map(w => {
        const j = s.jobs.find(x => x.kind === w.kind && x.field === w.field)
        // (work on foot has its hours while the day lasts: from the first of it to the last)
        const on = w.from === undefined ? (s.clock?.log ?? []).filter(x => x.unit === u.id && x.kind === w.kind && x.field === w.field) : []
        const from = on.length ? Math.min(...on.map(x => x.from)) : w.from, to = on.length ? Math.max(...on.map(x => x.to)) : w.to
        return { kind: w.kind, field: w.field, share: j && j.need > 0 ? Math.max(0, Math.min(1, j.done / j.need)) : 1, rig: w.rig, machine: w.machine, from, to }
      }) : [],
    }
  })
  const nextJob = inSeason && s.jobs.length ? s.jobs[0] : null
  // The order someone would set out for this morning, and who, as the farm's day will give the work out
  // (src/sim/season.ts): the hands first, then the operators, then the farmer, each to the nearest of the first few
  // orders of their first kind of work that nobody holds and nothing holds up: those on the list, and those the
  // routine or a foreman will put there when the day is counted.
  let lead: (Work & { unit: number }) | null = null
  if (inSeason && !s.frozen && sim.workday(c, s)) {
    const today = sim.getDay(app.world, s.year, s.day)
    const fit = c.crew.filter(u => u.job < 0 && !u.foreman && !sim.hurt(u, s.day) && !sim.resting(u)).sort((a, b) => TURN[a.kind] - TURN[b.kind] || a.id - b.id)
    const open: { id: number; kind: sim.JobKind; field: number; unit: number }[] = s.jobs.filter(j => !c.crew.some(u => u.job === j.id) && !(today && sim.waitFor(c, s, j, today)))
    let made = -1
    for (const a of sim.advise(app.world, c)) {
      if (a.field < 0 || a.act === 'wait' || a.act === 'sell' || a.act === 'close' || s.jobs.some(j => j.kind === a.act && j.field === a.field)) continue
      if (a.act === 'kill' && s.fields[a.field].keepVines) continue
      // (the year's first planting waits for the player's word, or for the crew to start by itself)
      if (sim.awaitsWord(c, a.act, a.field) && !(s.plantAsk !== undefined && s.day - s.plantAsk >= sim.PLANT_WORD_DAYS)) continue
      const by = sim.standingBy(c, a.act, a.field)
      if (!by || (today && sim.waitFor(c, s, { id: -1, kind: a.act, field: a.field, done: 0, need: 1, unit: -1, by }, today))) continue
      const job = { id: made--, kind: a.act, field: a.field, unit: -1 }
      if (a.act === 'haul') open.unshift(job)
      else open.push(job)
    }
    const taken = new Set<number>()
    for (const u of fit) {
      if (lead) break
      let pick: (typeof open)[number] | null = null
      for (let level = 1; level <= sim.PRIORITY_MAX && !pick; level++) {
        const cands = open.filter(j => !taken.has(j.id) && (j.unit < 0 || j.unit === u.id) && u.prio[sim.jobSkill(j.kind)] === level).slice(0, sim.PICK_WINDOW)
        let least = Infinity
        cands.forEach((j, r) => { const cost = sim.travel(c, u.at, j.field) + r * sim.PICK_LAG; if (cost < least) { least = cost; pick = j } })
      }
      const j = pick as (typeof open)[number] | null
      if (!j) continue
      taken.add(j.id)
      if (j.field >= 0) lead = { kind: j.kind, field: j.field, unit: u.id }
    }
  }
  const heldFields = fields.filter(f => f.held)
  const wetGround = heldFields.reduce((a, f) => a + (WETNESS[f.moisture] ?? 0.3), 0) / Math.max(1, heldFields.length)
  const pond = sim.pondInfo(app.world, c)
  const farm: FarmVis = {
    buildings: sim.buildingInfo(c).filter(b => b.state !== 'none').map(b => ({ kind: b.kind, yard: b.yard, built: b.state === 'built', progress: b.progress })),
    logs: c.logs, stone: c.stone,
    pond: pond.built && pond.capacity > 0 ? Math.max(0, Math.min(1, pond.waterings / pond.capacity)) : 0,
    standOpen: sim.standInfo(c).open,
    tractors: sim.tractorsOwned(c),
    broken: inSeason ? sim.tractorsOwned(c) - sim.tractorsRunning(c, s.day) : 0,
    truck: !!c.upgrades.truck,
    pickers: inSeason && s.pickers,
    dufour: sim.holdsDufour(c),
    equipment: (Object.keys(c.upgrades) as sim.UpgradeId[]).filter(k => c.upgrades[k]),
    incidents: c.incidents.map(i => ({ kind: i.kind, unit: i.unit ?? -1 })),
    applicants: mode === 'plan' ? c.applicants.length : 0,
  }
  return {
    mode, year: c.year, day, seasonDay: s ? s.day : -1, month: c.month, fields, weather, worked, units, farm,
    next: nextJob ? { kind: nextJob.kind, field: nextJob.field } : null,
    lead,
    frozen: s ? s.frozen : false,
    // (the day pictured is the one just worked; of a day being worked, that day)
    restDay: inSeason && !s.frozen && (of ? !sim.workday(c, s) : s.day > s.startDay && c.sundaysOff && sim.weekday(s.year, s.day - 1) === sim.SUNDAY),
    rime,
    wetGround: mode === 'season' ? wetGround : 0.3,
  }
}

// Outside the season the weather is a picture of the time of year, not a record.
function phaseWeather(mode: Mode, month: number): { weather: Weather; day: number } {
  const w = (sky: Weather['sky'], tmin: number, tmax: number, wind: number, snwd: number, wetH = 4): Weather =>
    ({ sky, tmin, tmax, wind, wdir: 290, prcp: sky === 'snow' || sky === 'rain' ? 6 : 0, wetH, snwd })
  if (mode === 'plan') return { weather: w('cloud', -1, 9, 4, 40, 8), day: 112 }
  if (mode === 'ledger') return { weather: w('overcast', 0, 7, 3.5, 25, 10), day: 105 }
  if (mode === 'over') return { weather: w('cloud', 4, 12, 2.5, 0), day: 285 }
  // The cellar: November to May.
  const skies: Weather['sky'][] = ['overcast', 'snow', 'clear', 'snow', 'clear', 'overcast', 'cloud']
  const tmins = [-5, -14, -20, -18, -11, -3, 2]
  const snow = [60, 300, 500, 650, 600, 90, 20]
  const m = Math.max(0, Math.min(6, month))
  return { weather: w(skies[m], tmins[m], tmins[m] + 9, 4.5, snow[m], 0), day: (318 + m * 30.4) % 365 }
}

// The title screen: the farm on a July evening, the home fields in blossom and the oats in head, the land beyond as
// the farm starts the game: somebody else's.
function showcase(): Snapshot {
  const fields: FieldVis[] = []
  const setup: [boolean, sim.VarietyId, number, number][] = [
    [true, 'katahdin', 0.93, 0.85], [false, 'katahdin', 0, 0], [false, 'katahdin', 0, 0],
    [true, 'superior', 0.95, 1], [true, 'kennebec', 0.94, 1], [true, 'gold', 0.9, 1],
  ]
  for (let i = 0; i < sim.FIELD_COUNT; i++) {
    const held = i < setup.length
    const [potato, v, canopy, bloom] = setup[i] ?? [false, 'katahdin' as sim.VarietyId, 0, 0]
    const hills: sim.HillLook[] = []
    for (let h = 0; h < sim.HILLS; h++) {
      const j = hash2(i * 131 + h, 7)
      hills.push(potato ? { kind: 'plant', canopy: Math.min(1, canopy * (0.9 + 0.16 * j)), vigor: 0.9 + 0.2 * hash2(h, i), blight: 0, stunted: false, yellow: 0 } : BARE)
    }
    fields.push({
      held, available: false,
      crop: potato ? 'potato' : 'rest', status: !held ? 'off' : potato ? 'growing' : 'rest', hills, ridge: potato ? 1 : 0, moisture: 'good', bloom, wilt: 0,
      frosted: 0, rime: 0, variety: v, lot: -1, grams: 0, dark: 0, green: 0,
      ours: held || sim.PARCELS[i].holding === 'owned', cover: sim.PARCELS[i].cover, clearStage: sim.PARCELS[i].cover === 'open' ? '' : 'fell', felled: 0, works: '', worksLeft: 0,
      stones: sim.PARCELS[i].stones, raw: false, tiled: false, hedge: 1, sheltered: false, inField: 0,
    })
  }
  return {
    mode: 'title', year: 1987, day: 196, seasonDay: -1, month: 0, fields,
    weather: { sky: 'clear', tmin: 13, tmax: 25, wind: 2.6, wdir: 250, prcp: 0, wetH: 6, snwd: 0 },
    worked: [], units: [{ id: 0, kind: 'farmer', name: '', at: -1, to: -1, along: 1, job: null, worked: [], rig: '', tired: 0, mood: 1, hurt: false, resting: false, winter: 'off', winterField: -1, livesOut: false }],
    farm: { buildings: [], logs: 0, stone: 0, pond: 0, standOpen: false, tractors: 1, broken: 0, truck: false, pickers: false, dufour: false, equipment: [], incidents: [], applicants: 0 },
    next: null, lead: null, frozen: false, restDay: false, rime: null, wetGround: 0.1,
  }
}
