// What the field view draws, read from the app through the grower's views only (src/sim/view.ts).
import type { App } from '../game/app.ts'
import * as sim from '../sim/index.ts'
import { hash2 } from './noise.ts'

export type Mode = 'title' | 'plan' | 'season' | 'cellar' | 'ledger' | 'over'

export interface FieldVis {
  held: boolean            // the farm's this year (owned or rented); otherwise somebody else's ground
  available: boolean       // spring, and this land is not the farm's: it can be rented or bought
  crop: 'potato' | 'rest'
  status: string
  hills: sim.HillLook[]
  ridge: number            // 0 flat, 0.1 planted, 0.55 hilled once, 1 hilled twice
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

export interface Work { kind: sim.JobKind; field: number }

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
  next: Work | null
  frozen: boolean
  rime: number[] | null    // in the season, rime on the ridge, mid-slope and bottom land
  wetGround: number        // how wet the ground lies, 0 dust-dry to 1 standing water
}

const BARE: sim.HillLook = { kind: 'bare', canopy: 0, vigor: 1, blight: 0, stunted: false, yellow: 0 }

const RIDGE_BY_PASSES = [0.1, 0.55, 1]
const WETNESS: Record<string, number> = { 'standing water': 1, wet: 0.8, good: 0.34, drying: 0.16, dry: 0.04, wilting: 0 }

export function snapshot(app: App): Snapshot {
  const c = app.campaign
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
    for (let h = 0; h < sim.HILLS; h++) {
      const look = held && s && plan.crop === 'potato' ? sim.hillLook(s.fields[i], h) : BARE
      if (look.kind !== 'bare') planted = true
      if (look.kind === 'dug') dug++
      hills.push(look)
    }
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
      available: !held && mode === 'plan',
      crop: held ? plan.crop : 'rest',
      status: info.status,
      hills,
      ridge: planted ? RIDGE_BY_PASSES[Math.min(2, info.hillPasses)] : 0,
      moisture: info.moistureLabel,
      bloom: info.bloom,
      wilt: info.wilt,
      frosted: info.frosted,
      rime: frost,
      variety: plan.variety,
      lot: info.lot,
      grams, dark, green,
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
  const units: UnitVis[] = sim.crewInfo(c).map(u => {
    const trip = u.travelling ? sim.travelDays(u.at, u.to) : 0
    return {
      id: u.id, kind: u.kind, name: u.name,
      at: inSeason ? u.at : sim.HOME_YARD, to: inSeason ? u.to : sim.HOME_YARD,
      along: u.travelling && trip > 0 ? Math.max(0, Math.min(1, 1 - u.road / trip)) : 1,
      job: inSeason && u.job ? { kind: u.job.kind, field: u.job.field } : null,
      worked: inSeason ? s.worked.filter(w => w.unit === u.id).map(w => ({ kind: w.kind, field: w.field })) : [],
    }
  })
  const nextJob = inSeason && s.jobs.length ? s.jobs[0] : null
  const heldFields = fields.filter(f => f.held)
  const wetGround = heldFields.reduce((a, f) => a + (WETNESS[f.moisture] ?? 0.3), 0) / Math.max(1, heldFields.length)
  return {
    mode, year: c.year, day, seasonDay: s ? s.day : -1, month: c.month, fields, weather, worked, units,
    next: nextJob ? { kind: nextJob.kind, field: nextJob.field } : null,
    frozen: s ? s.frozen : false,
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
  const snow = [60, 300, 500, 650, 600, 250, 20]
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
    })
  }
  return {
    mode: 'title', year: 1987, day: 196, seasonDay: -1, month: 0, fields,
    weather: { sky: 'clear', tmin: 13, tmax: 25, wind: 2.6, wdir: 250, prcp: 0, wetH: 6, snwd: 0 },
    worked: [], units: [{ id: 0, kind: 'farmer', name: '', at: -1, to: -1, along: 1, job: null, worked: [] }],
    next: null, frozen: false, rime: null, wetGround: 0.1,
  }
}
