// State and command types for the simulation. Everything here is plain JSON data.

export interface YearWeather {
  n: number
  tmax: number[]; tmin: number[]; prcp: number[]; snow: number[]; snwd: number[]
  wetH: number[]; wetT: number[]; rh: number[]; wind: number[]; wdir: number[]
  cloud: number[]; et0: number[]; dayl: number[]; q: number[]
}

export interface WeatherData {
  station: { name: string; ghcn: string; isd: string; lat: number; lon: number; elevM: number; utcOffsetH: number }
  sources: string[]
  built: string
  years: Record<string, YearWeather>
  normals: { tmax: number[]; tmin: number[]; prcp: number[]; wetH: number[] }
  playable: number[]
}

export interface YearRecord {
  // USDA NASS, Maine. Null where the record was not confirmed.
  yieldCwtAcre: number | null
  priceUsdCwt: number | null
}

export interface NeighborYear {
  plant: number; hill1: number; hill2: number; firstSpray: number; sprays: number
  kill: number; dig: number; yieldCwtAcre: number; blightPct: number; variety: string
}

export interface World {
  weather: WeatherData
  // Year factor for prices, mean about 1. Missing years fall back to 1.
  priceLevel: Record<string, number>
  records: Record<string, YearRecord>
  neighbor: Record<string, NeighborYear>
  notes: Record<string, string>
}

// One day of weather in real units.
export interface Day {
  tmax: number; tmin: number; tmean: number
  prcp: number            // mm
  snwd: number            // mm
  wetH: number            // hours at or above 90% RH, noon to noon
  wetT: number            // mean temperature in those hours, C
  rh: number              // %
  wind: number            // m/s
  wdir: number            // degrees, or -1
  cloud: number           // 0..1, or -1
  et0: number             // mm
  rs: number              // solar radiation, MJ/m2/day
  dayl: number            // minutes
}

export type VarietyId = 'norland' | 'superior' | 'katahdin' | 'kennebec' | 'burbank' | 'atlantic' | 'gold' | 'caribou'

export type JobKind = 'plant' | 'hill' | 'scout' | 'spray' | 'water' | 'rogue' | 'sample' | 'kill' | 'dig'
export type UpgradeId = 'boom' | 'harvester' | 'vent' | 'reel' | 'tractor2' | 'house2'
export type Grade = 'no1' | 'chef' | 'b' | 'no2' | 'cull'
export type Cause = 'green' | 'scab' | 'hollow' | 'knob' | 'skin' | 'bruise' | 'blight' | 'frost' | 'rot' | 'small'
export type Tenure = 'owned' | 'rented' | 'none'
export type UnitKind = 'farmer' | 'operator' | 'hand'

export interface FieldPersist {
  elev: 0 | 1 | 2           // 0 bottom land, 1 mid slope, 2 ridge
  soil: number              // short-term soil condition from the rotation, 0..1
  vert: number              // share of plants that will go down early with Verticillium wilt
  streak: number            // consecutive potato years up to last season
  tenure: Tenure            // 'rented' carries into the next spring until released
}

export interface FieldPlan {
  crop: 'potato' | 'rest'
  variety: VarietyId
  seed: 'certified' | 'saved'
}

// 'off': not the farm's this season.
export type FieldStatus = 'off' | 'rest' | 'idle' | 'planted' | 'growing' | 'dead' | 'digging' | 'dug' | 'lost'

// Hill state bits.
export const H_EMERGED = 1
export const H_VIRUS = 2
export const H_ROGUED = 4
export const H_SAMPLED = 8
export const H_DUG = 16
export const H_KNOWN = 32     // blight seen here by the grower
export const H_SEEDBLIGHT = 64
export const H_DECAYED = 128
export const H_WILT = 256      // carries Verticillium: dies early

export interface FieldSeason {
  status: FieldStatus
  variety: VarietyId
  seedVirus: number
  plantDay: number; emergeDay: number; tiDay: number; closeDay: number; matureDay: number; deadDay: number; killDay: number; dugDay: number
  pdSoil: number            // thermal time since planting, from soil temperature
  pdAir: number             // thermal time since planting, from air temperature
  pdEmerge: number          // pdAir at field emergence
  dr: number                // root-zone water deficit, mm
  wet: number               // surface wetness, mm
  ksAvg: number             // running mean of the water stress factor
  canopy: number            // mean leaf cover over the field, 0..1
  green: number             // mean healthy leaf cover
  wateredDay: number
  hillPasses: number
  cover: number             // how well the hills cover the tubers, 0..1
  weeded: boolean
  residue: number           // protectant on the leaves, 0..1
  lastSpray: number
  scab: number; hollow: number; knob: number; logDays: number; dryRun: number; frostT: number
  sev: number               // true mean blight lesion share over living hills
  sevPeak: number
  lastScout: number; knownSev: number; seenFromRoad: boolean
  samples: number[]         // each test dig: that hill's mass relative to what the grower expected of a hill
  sampleN: number[]         // and how many tubers were under it
  estBias: number
  eye: number               // tuber weight the grower would expect from what can be seen, grams over the field's hills
  seedBlight: number        // blight share in the seed, until planting
  frostDay: number          // last day frost blackened the leaf, and how much of it
  frostShare: number
  rimeDay: number           // last day this field went below freezing
  digDone: number           // hills dug so far
  lotId: number
  flags: number             // one-time announcements
  // Hills, struct of arrays, ROWS * COLS long.
  hState: number[]
  hEmergeAt: number[]
  hPd0: number[]
  hVigor: number[]
  hC: number[]
  hLes: number[]
  hLat: number[]
  hMass: number[]
  hN: number[]
  hTb: number[]
}

export interface Job {
  id: number
  kind: JobKind
  field: number
  done: number
  need: number
  unit: number              // -1: any crew; otherwise the id of the unit it is pinned to
}

// A crew: the farmer, a hired field hand, or a hired operator on the second tractor.
export interface Unit {
  id: number                // the farmer is 0
  kind: UnitKind
  name: string
  at: number                // where it is: a field index, or -1 the home yard, -2 the Dufour yard
  wage: number              // dollars a month
  job: number               // id of the order it is working or going to, or -1
  to: number                // where it is going; equals `at` when it is not on the road
  road: number              // days of travel left to reach `to`
  paidTo: number            // day of the season until which its wage is paid
}

export type Due = 'harvest' | 'winter'

export interface Offer {
  id: number
  buyer: string
  variety: VarietyId
  cwt: number               // US No. 1 and large tubers
  price: number             // dollars per cwt, fixed
  due: Due                  // 'harvest': by the close of the season; 'winter': from storage before March
}

export interface Contract extends Offer {
  delivered: number         // cwt
  paid: number              // dollars received for what was delivered
  penalty: number           // dollars charged at the due date for the shortfall
  settled: boolean          // the due date has passed
}

export interface Lot {
  id: number
  field: number
  variety: VarietyId
  year: number
  dugDay: number
  aged: number                       // day up to which storage has been charged and the pile shrunk
  grades: Record<Grade, number>      // cwt
  skinned: number                    // cwt of otherwise No. 1 tubers with unset skins
  loss: Record<Cause, number>        // cwt downgraded or culled, by cause
  rot: number                        // hidden share of the pile carrying rot
  skin: number                       // skin set at digging, 0..1
  virus: number                      // virus share in this crop, the seed lot's next generation
  blightSeed: number                 // share of tubers carrying blight, matters if kept for seed
  months: number                     // months in the cellar
  sprouted: boolean
  broke: boolean
  sold: number                       // cwt sold
  revenue: number
  seedHeld: number                   // fields' worth held back as seed
  open: boolean                      // still has potatoes to sell
}

export interface SeedStock { variety: VarietyId; fields: number; virus: number; blight: number }

export interface GameEvent {
  day: number
  type: string
  field: number            // -1 when not about one field
  text: string
  level: 'info' | 'good' | 'warn' | 'bad'
  data?: Record<string, number | string | number[]>
}

export interface Season {
  year: number
  day: number               // the day about to be worked
  startDay: number
  lastDay: number
  soilT: number
  sv: number                // Blitecast severity values accumulated
  svToday: number
  watchDay: number          // day the spray threshold was crossed, or -1
  frozen: boolean
  fields: FieldSeason[]
  jobs: Job[]
  nextJob: number
  worked: { kind: JobKind; field: number; unit: number }[]   // what each crew did on the last day worked, in order
  spent: number
  log: GameEvent[]
}

export interface YearSummary {
  year: number
  cashStart: number; cashEnd: number
  revenue: number; costs: number; note: number; living: number; interest: number
  restIncome: number; storage: number      // parts of revenue and of costs
  wages: number; rent: number; land: number; penalties: number   // parts of costs
  contracts: number                        // part of revenue: deliveries against contracts
  cwtSold: number; cwtCulled: number
  yieldCwtAcre: number      // marketable, over potato acres
  potatoFields: number
  blightPeak: number
  lots: Lot[]
}

export type Phase = 'plan' | 'season' | 'cellar' | 'ledger' | 'over'

export interface Campaign {
  v: number
  seed: number
  rng: number
  startYear: number
  year: number
  yearIdx: number
  goalYears: number
  phase: Phase
  outcome: '' | 'kept' | 'lost'
  cash: number
  fields: FieldPersist[]    // one per parcel (src/sim/farm.ts)
  plans: FieldPlan[]        // one per parcel; a field the farm does not hold keeps a rest-year placeholder
  upgrades: Record<UpgradeId, boolean>
  seedStock: SeedStock[]
  season: Season | null
  lots: Lot[]
  nextLot: number
  crew: Unit[]              // the farmer first, then hired units in the order hired
  nextUnit: number
  offers: Offer[]           // this spring's contract offers, until the season begins
  contracts: Contract[]     // this year's accepted contracts
  month: number             // cellar month index, 0 = November
  yearRevenue: number
  yearCosts: number
  yearRest: number
  yearStorage: number
  yearWages: number
  yearRent: number
  yearLand: number
  yearContracts: number
  yearPenalties: number
  history: YearSummary[]
  steps: number
}

export type Cmd =
  | { t: 'plan'; field: number; plan: FieldPlan }
  | { t: 'buy'; upgrade: UpgradeId }
  | { t: 'rent'; field: number }
  | { t: 'release'; field: number }
  | { t: 'buyLand'; field: number }
  | { t: 'accept'; offer: number }
  | { t: 'begin' }
  | { t: 'hire'; kind: UnitKind }
  | { t: 'dismiss'; unit: number }
  | { t: 'job'; kind: JobKind; field: number; unit?: number }
  | { t: 'assign'; id: number; unit: number }
  | { t: 'cancel'; id: number }
  | { t: 'bump'; id: number }
  | { t: 'day' }
  | { t: 'endSeason' }
  | { t: 'sell'; lot: number; frac: number }
  | { t: 'deliver'; lot: number; contract: number }
  | { t: 'seed'; lot: number; fields: number }
  | { t: 'month' }
  | { t: 'next' }

export interface Result {
  ok: boolean
  err: string
  events: GameEvent[]
}
