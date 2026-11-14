// State and command types for the simulation. Everything here is plain JSON data.
import type { BlockId } from './farm.ts'

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

export type JobKind = 'plant' | 'hill' | 'scout' | 'spray' | 'water' | 'rogue' | 'sample' | 'kill' | 'dig' | 'fell' | 'rocks' | 'brush' | 'build' | 'haul'
// The kinds of work on the crop that can be ordered by themselves each working morning (the farm's standing orders).
// How spraying is done this season: kept up by the routine, the player's order each time, or not at all this year.
export type SprayWay = 'auto' | 'ask' | 'none'

export type RoutineKind = 'plant' | 'hill' | 'scout' | 'rogue' | 'sample' | 'dig' | 'haul' | 'spray' | 'water' | 'kill'
// Who put an order on the list: the player, the farm's routine, or a foreman for their block.
export type JobBy = 'you' | 'routine' | 'foreman'
export type UpgradeId = 'boom' | 'harvester' | 'vent' | 'reel' | 'tractor2' | 'house2' | 'tractor3' | 'truck'
export type BuildingKind = 'house' | 'shed' | 'bunk' | 'packing' | 'pond' | 'stand' | 'station' | 'road'
export type IncidentKind = 'applicant' | 'poach' | 'breakdown' | 'buyer'
export type Grade = 'no1' | 'chef' | 'b' | 'no2' | 'cull'
export type Cause = 'green' | 'scab' | 'hollow' | 'knob' | 'skin' | 'bruise' | 'blight' | 'frost' | 'rot' | 'small' | 'stone'
export type Tenure = 'owned' | 'rented' | 'none'
export type UnitKind = 'farmer' | 'operator' | 'hand'
// The five kinds of work. Each person has a level 0..10 in each, and a priority for each.
export type Skill = 'machine' | 'field' | 'woods' | 'build' | 'pack'
export type Trait = 'strong' | 'steady' | 'sharp' | 'early' | 'tireless' | 'cheerful' | 'hothead' | 'careless' | 'slow' | 'homebody'
// What a person does from November to April: laid off, felling a tract, packing, or building.
export type WinterWork = 'off' | 'woods' | 'pack' | 'build'
export type Rig = '' | 'tractor' | 'truck'
// When a person rests: by themselves once worn out (the default), now until fresh, or never (worked on worn out).
export type RestMode = 'auto' | 'now' | 'push'
// What stands on a parcel: open ground, or a tract still to clear (standing woods or brush, or stumps once felled).
export type Cover = 'open' | 'woods' | 'brush' | 'stumps'

export interface FieldPersist {
  elev: 0 | 1 | 2           // 0 bottom land, 1 mid slope, 2 ridge
  soil: number              // short-term soil condition from the rotation, 0..1
  vert: number              // share of plants that will go down early with Verticillium wilt
  streak: number            // consecutive potato years up to last season
  tenure: Tenure            // 'rented' carries into the next spring until released
  cover: Cover
  stones: number            // 0..1
  raw: boolean              // new ground that has not yet had a crop or a rest year
  felled: number            // crew-days of felling done on a tract
  brushed: number           // the year its hedgerows were cut back, or -1
  tiled: boolean            // tile drains are in
  works: { kind: 'stump' | 'tile'; left: number } | null   // a contractor's job: season days left
}

// A purchase of land on the mortgage.
export interface Mortgage {
  field: number
  loan: number              // dollars borrowed
  owed: number              // dollars still owed
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

// Why reference practice asks for the vines to be killed: blight winning, frost coming, the crop made, or the date
// past which skins would not set before the freeze-up.
export type KillWhy = 'blight' | 'frost' | 'made' | 'late'

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
  sprays?: number           // passes this season
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
  inField: number           // cwt dug and in barrels in the field, not yet hauled to a potato house
  weighed: boolean          // the whole crop is in and the weigh ticket cut
  lotId: number
  flags: number             // one-time announcements
  killAsked?: number        // the first day reference practice asked for the vines to be killed
  killWhy?: KillWhy          // and why it asked
  blightFound?: number      // the day blight was first found here: on a walk, or from the road
  blightPulled?: number     // blighted hills pulled this season
  keepVines?: boolean       // the player keeps the vines up here: the crew does not kill them by itself
  killSince?: number        // the day the coach's present run of asking for the kill began
  killCall?: number         // the day the game said this field's vine kill is the player's to give (advice.ts, killCalled)
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
  field: number             // the field; for building, the yard (-1 home, -2 Dufour)
  done: number
  need: number
  unit: number              // -1: any crew; otherwise the id of the unit it is pinned to
  by: JobBy
  building?: number         // for building: the building's id
  pond?: boolean            // for watering: drawn from the pond, once begun
}

// A farm building, standing or under way.
export interface Building {
  id: number
  kind: BuildingKind
  yard: number              // -1 the home yard, -2 the Dufour yard
  done: number              // crew-days of building done
  need: number
  built: boolean
}

// A person: the farmer, or someone hired. kind is what they were taken on for (a field hand or a tractor operator);
// what they actually do is set by their priorities.
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
  skills: Record<Skill, number>     // 0..10
  xp: Record<Skill, number>         // crew-days toward the next level
  trait: Trait | ''                 // the farmer has none
  tired: number                     // 0..1
  mood: number                      // 0..1
  ask: number                       // the wage they asked for, dollars a month
  prio: Record<Skill, number>       // 0 never, 1 first .. 4
  foreman: BlockId | ''             // the block this person is foreman of
  winter: WinterWork
  winterField: number               // the tract felled in winter, or -1
  low: number                       // days running with mood below the quitting line
  rig: Rig                          // what the person is driving for the order held
  out: number                       // hurt: the day they are back at work, or -1
  rest: RestMode                    // rests when worn out, rests now until fresh, or works on worn out
  idleRun?: number                  // working days in a row with nothing to do while work waits that they are set never to do
}

// Something that happened and asks for a decision. It waits until the day `until` for an answer, then takes its
// default.
export interface Incident {
  id: number
  kind: IncidentKind
  day: number
  until: number
  choices: string[]         // the first is the active choice; the last is the default
  applicant?: Applicant     // someone asking for work
  unit?: number             // the person a neighbour wants, or who drove the tractor that broke
  wage?: number             // what the neighbour offers
  lot?: number              // the lot a buyer wants
  back?: number             // a broken tractor: the day it is back if the farm waits
}

// Someone asking for work this spring.
export interface Applicant {
  id: number
  name: string
  skills: Record<Skill, number>
  trait: Trait
  ask: number               // dollars a month
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
  packed: number                     // share of the No. 1 and B size packed in the packing shed, 0..1
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
  frostHaul?: number        // the last day a frost was forecast on crop still in barrels
  barrelsSaid?: number[]    // fields whose barrels the season has said have stood out three days
  idleSaid?: number[]       // people the season has said once were idle with work waiting that they are set never to do
  pressed?: number[]        // people moved today from work that can wait to work that cannot
  frostLow?: number         // tonight's forecast low at the station, C
  plantAsk?: number         // the day the crew first stood ready to plant and asked for the word
  plantWord?: number        // the day the word to plant was given: the player's first planting order, or the crew's own start
  plantWordBy?: 'you' | 'crew'
  telegram?: number         // the day the last telegram came
  digStop?: number[]        // fields whose digging stopped for today so that what was dug can be hauled before a frost
  fields: FieldSeason[]
  jobs: Job[]
  nextJob: number
  // what each crew did on the last day worked, in order; machine work with what they drove and its hours (shares of the day)
  worked: { kind: JobKind; field: number; unit: number; rig?: Rig; machine?: string; from?: number; to?: number }[]
  spent: number
  log: GameEvent[]
  pickers: boolean          // a picking crew hired by the day for the harvest break
  // While a day is being worked: how far into it the crews have got (a share of the day), who minds the stand (-1
  // nobody), each person's day so far (time not used, waits, what they worked at), and the hours of every stretch of
  // work done in it. Gone once the day is over.
  clock?: {
    at: number; stand: number
    turns: { id: number; left: number; waited: number; spent: Record<Skill, number>; tractor: boolean }[]
    log: { unit: number; kind: JobKind; field: number; from: number; to: number }[]
  }
}

export interface YearSummary {
  year: number
  cashStart: number; cashEnd: number
  revenue: number; costs: number; note: number; living: number; interest: number
  restIncome: number; storage: number      // parts of revenue and of costs
  wages: number; rent: number; land: number; penalties: number   // parts of costs
  contracts: number                        // part of revenue: deliveries against contracts
  logs: number                             // part of revenue: logs sold
  mortgage: number                         // part of costs: the land mortgage's principal and interest
  works: number                            // part of costs: contractors stumping and tiling
  building: number                         // part of costs: buildings' cash and the materials bought for them
  stand: number                            // part of revenue: the farm stand
  packing: number                          // part of costs: the packing charge
  cwtSold: number; cwtCulled: number
  yieldCwtAcre: number      // marketable, over potato acres
  potatoFields: number
  blightPeak: number
  sprays?: number           // spray passes over the farm's fields this year
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
  applicants: Applicant[]   // this spring's people asking for work, until the season begins
  // What this spring's plan bought and hired, which can be taken back until the season begins (absent: nothing).
  spring?: { bought: { upgrade: UpgradeId; building?: number }[]; hired: { unit: number; applicant?: Applicant }[] }
  sundaysOff: boolean       // the farm rule: nobody works Sundays
  logs: number              // loads of logs in the yard
  stone: number             // loads of fieldstone in the yard
  mortgages: Mortgage[]     // land bought on the mortgage, still owed
  buildings: Building[]
  nextBuilding: number
  pond: number              // field-waterings in the irrigation pond
  incidents: Incident[]     // open, waiting for an answer
  heard: string[]           // this year's offers already made (an applicant, a neighbour's for a person, a buyer's for a lot)
  routine: Record<RoutineKind, boolean>   // which kinds of work are ordered by themselves on every held field
  sprayWay?: { year: number; way: SprayWay }   // the season's answer to how spraying is done, for that year
  nextIncident: number
  broken: number[]          // for each tractor out of action, the day it is back
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
  yearLogs: number
  yearMortgage: number
  yearWorks: number
  yearBuilding: number
  yearStand: number
  yearPacking: number
  yearEquip?: number        // what this year's equipment cost, part of yearCosts
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
  | { t: 'hire'; applicant: number }
  | { t: 'dismiss'; unit: number }
  | { t: 'unbuy'; upgrade: UpgradeId }
  | { t: 'haulNow'; field: number }
  | { t: 'unhire'; unit: number }
  | { t: 'raise'; unit: number; wage: number }
  | { t: 'priority'; unit: number; work: Skill; level: number }
  | { t: 'foreman'; unit: number; block: BlockId | null }
  | { t: 'sundays'; off: boolean }
  | { t: 'pickers'; on: boolean }
  | { t: 'winter'; unit: number; work: WinterWork; field?: number }
  | { t: 'stump'; field: number }
  | { t: 'tile'; field: number }
  | { t: 'sellLogs'; loads: number }
  | { t: 'payMortgage'; amount: number }
  | { t: 'build'; kind: BuildingKind; yard: number }
  | { t: 'answer'; incident: number; choice: string }
  | { t: 'job'; kind: JobKind; field: number; unit?: number }
  | { t: 'routine'; kind: JobKind; auto: boolean }
  | { t: 'sprayWay'; way: SprayWay }
  | { t: 'keepVines'; field: number; keep: boolean }
  | { t: 'rest'; unit: number; mode?: RestMode }
  | { t: 'assign'; id: number; unit: number }
  | { t: 'cancel'; id: number }
  | { t: 'bump'; id: number }
  | { t: 'day' }
  | { t: 'work'; to: number }   // the crews' work up to a time of today (a share of the day), the day not yet over
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
