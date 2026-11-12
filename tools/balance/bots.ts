// Bots that play The County from what a player can see: the view and advice functions, the market quote, the public
// campaign fields and the events the game reports. tests/bots.test.ts checks this file for the names of hidden state.
import * as S from '../../src/sim/index.ts'
import type {
  BlockId, BuildingKind, Campaign, FieldInfo, FieldPlan, GameEvent, JobKind, Lot, PersonInfo, Skill, Trait, UpgradeId, VarietyId, World,
} from '../../src/sim/index.ts'

export interface Bot {
  plan(world: World, c: Campaign): void
  day(world: World, c: Campaign, events: GameEvent[]): void
  cellar(world: World, c: Campaign): void
}

export type BotFactory = () => Bot

// What a campaign spent and earned on the farmstead, year by year, from the ledgers and the day's events.
export const SPEND = ['wages', 'winterWages', 'pickers', 'rent', 'land', 'mortgage', 'interest', 'works', 'building', 'equipment', 'packing', 'logs', 'stand', 'rush'] as const
export type SpendKey = typeof SPEND[number]
export const TALLY = ['frozenCwt', 'hurt', 'breakdowns', 'quits', 'poached', 'pondDry', 'stumped', 'tiled', 'felled', 'rocks', 'brushed', 'built',
  'standDays', 'sundaysWorked', 'pickerDays', 'hires', 'applicants', 'rushParts', 'matched', 'midHires', 'buyerTaken'] as const
export type TallyKey = typeof TALLY[number]

export interface Outcome {
  bot: string
  startYear: number
  seed: number
  kept: boolean              // still the family's at the end of the campaign
  kept5: boolean             // still the family's after the fifth season
  years: number
  cash: number
  netWorth: number
  worth: number[]            // net worth at each year end
  cashBy: number[]           // cash at each year end
  yields: number[]           // marketable cwt per potato acre at the dig, by season
  revenue: number[]
  blightPeak: number[]       // from the year-end ledger
  potatoFields: number[]
  held: number[]             // fields the farm held, by season
  hands: number[]            // most hired people on the farm at once, by season
  operator: number[]         // 1 in a season someone hired drove a tractor
  wages: number              // over the campaign, from the year-end ledgers
  rent: number
  land: number
  contracts: number
  penalties: number
  signed: number             // contracts signed
  jobs: Record<JobKind, number>
  upgrades: UpgradeId[]
  buildings: BuildingKind[]  // standing at the end
  spend: Record<SpendKey, number[]>   // by year
  tally: Record<TallyKey, number>     // over the campaign
}

function blankJobs(): Record<JobKind, number> {
  return { plant: 0, hill: 0, scout: 0, spray: 0, water: 0, rogue: 0, sample: 0, kill: 0, dig: 0, fell: 0, rocks: 0, brush: 0, build: 0, haul: 0 }
}

const DONE_EVENT: Record<string, JobKind> = {
  planted: 'plant', hilled: 'hill', scout: 'scout', sprayed: 'spray', watered: 'water',
  rogued: 'rogue', sample: 'sample', killed: 'kill', dug: 'dig', rocks: 'rocks', brushed: 'brush',
}

// Plays one campaign to the goal (or to foreclosure) and reports what happened. watch sees every day's events.
export function play(world: World, name: string, make: BotFactory, startYear: number, seed: number, goal = S.GOAL_YEARS,
  watch?: (c: Campaign, events: GameEvent[]) => void): Outcome {
  const c = S.createCampaign(world, { seed, startYear })
  const bot = make()
  const jobs = blankJobs()
  const yields: number[] = [], potatoFields: number[] = [], held: number[] = [], hands: number[] = [], operator: number[] = [], worth: number[] = [], cashBy: number[] = []
  const spend = Object.fromEntries(SPEND.map(k => [k, [] as number[]])) as Record<SpendKey, number[]>
  const tally = Object.fromEntries(TALLY.map(k => [k, 0])) as Record<TallyKey, number>
  const year = () => { for (const k of SPEND) spend[k].push(0) }
  const add = (k: SpendKey, x: number) => { spend[k][spend[k].length - 1] += x }
  let signed = 0
  let events: GameEvent[] = []
  let guard = 0
  let kept5 = false
  const seen = new Set<number>([0])
  // Someone who asked for work has a first and a last name; the hiring hall sends a Lucien or a Wendell.
  const newHires = () => {
    for (const u of c.crew) {
      if (seen.has(u.id)) continue
      seen.add(u.id)
      tally.hires++
      const [first, last] = u.name.split(' ')
      if (S.FIRST_NAMES.includes(first) && S.LAST_NAMES.includes(last)) tally.applicants++
    }
  }
  while (guard++ < 40000) {
    if (c.phase === 'plan') {
      year()
      const had = { ...c.upgrades }
      bot.plan(world, c)
      newHires()
      for (const id of Object.keys(c.upgrades) as UpgradeId[]) if (c.upgrades[id] && !had[id]) add('equipment', S.UPGRADES[id].cost)
      let r = S.apply(world, c, { t: 'begin' })
      // The bank would not lend: rest potato fields from the far end of the list up until it will.
      for (let i = S.FIELD_COUNT - 1; !r.ok && i >= 0; i--) {
        if (S.isField(c, i) && c.plans[i].crop === 'potato') S.apply(world, c, { t: 'plan', field: i, plan: { crop: 'rest', variety: c.plans[i].variety, seed: 'certified' } })
        r = S.apply(world, c, { t: 'begin' })
      }
      // Still not: let the hired people go, the newest first.
      while (!r.ok && c.crew.length > 1) {
        S.apply(world, c, { t: 'dismiss', unit: c.crew[c.crew.length - 1].id })
        r = S.apply(world, c, { t: 'begin' })
      }
      if (!r.ok) throw new Error(`${name}: cannot begin ${c.year}: ${r.err}`)
      events = []
      let n = 0
      for (let i = 0; i < S.FIELD_COUNT; i++) if (S.isField(c, i)) n++
      held.push(n)
      hands.push(S.hiredCount(c))
      operator.push(0)
      signed += S.contractInfo(c).length
    } else if (c.phase === 'season') {
      // The questions the bot answers itself rather than letting them take their defaults.
      const open = new Map(c.incidents.map(i => [i.id, i.kind]))
      bot.day(world, c, events)
      for (const [id, kind] of open) {
        if (c.incidents.some(i => i.id === id)) continue
        if (kind === 'breakdown') { tally.rushParts++; add('rush', S.RUSH_PART) }
        else if (kind === 'poach') tally.matched++
        else if (kind === 'applicant') tally.midHires++
        else if (kind === 'buyer') tally.buyerTaken++
      }
      newHires()
      if (c.phase !== 'season') continue
      const s = c.season!
      const h = S.hiredCount(c)
      if (h > hands[hands.length - 1]) hands[hands.length - 1] = h
      if (c.crew.some(u => u.kind !== 'farmer' && u.rig === 'tractor')) operator[operator.length - 1] = 1
      if (S.seasonDone(c)) {
        let cwt = 0
        for (const l of c.lots) if (l.year === c.year) cwt += S.lotCwt(l) + l.sold
        let n = 0
        for (let i = 0; i < S.FIELD_COUNT; i++) if (S.isField(c, i) && c.plans[i].crop === 'potato') n++
        yields.push(n ? cwt / (n * S.FIELD_ACRES) : 0)
        potatoFields.push(n)
        const r = S.apply(world, c, { t: 'endSeason' })
        tallyEvents(r.events, tally)
      } else {
        const work = S.workday(c, s)
        if (s.pickers && work && s.day <= S.dayIndex(s.year, S.PICKERS_TO.month, S.PICKERS_TO.dom)) { add('pickers', S.PICKER_DAY); tally.pickerDays++ }
        if (work && S.weekday(s.year, s.day) === S.SUNDAY) tally.sundaysWorked++
        if (S.standOpen(c, s)) tally.standDays++
        const r = S.apply(world, c, { t: 'day' })
        events = r.events
        for (const e of events) { const k = DONE_EVENT[e.type]; if (k) jobs[k]++ }
        tallyEvents(events, tally)
        watch?.(c, events)
      }
    } else if (c.phase === 'cellar') {
      bot.cellar(world, c)
      const due = S.mortgageDue(c)
      const w0 = c.yearWages
      S.apply(world, c, { t: 'month' })
      add('winterWages', c.yearWages - w0)
      if (phaseOf(c) === 'ledger') add('interest', due.interest)
    } else if (c.phase === 'ledger') {
      const h = c.history[c.history.length - 1]
      add('wages', h.wages); add('rent', h.rent); add('land', h.land); add('mortgage', h.mortgage); add('works', h.works)
      add('building', h.building); add('packing', h.packing); add('logs', h.logs); add('stand', h.stand)
      worth.push(S.netWorth(c))
      cashBy.push(Math.round(c.cash))
      if (c.history.length === 5 && c.outcome !== 'lost') kept5 = true
      if (c.outcome === 'lost' || c.history.length >= goal) break
      S.apply(world, c, { t: 'next' })
      if (phaseOf(c) === 'over') break
    } else break
  }
  const total = (pick: (h: Campaign['history'][number]) => number) => Math.round(c.history.reduce((a, h) => a + pick(h), 0))
  return {
    bot: name, startYear, seed,
    kept: c.outcome !== 'lost' && c.history.length >= goal,
    kept5: kept5 || (goal < 5 && c.outcome !== 'lost'),
    years: c.history.length,
    cash: Math.round(c.cash),
    netWorth: S.netWorth(c),
    worth, cashBy,
    yields, revenue: c.history.map(h => Math.round(h.revenue)), blightPeak: c.history.map(h => h.blightPeak), potatoFields,
    held, hands, operator,
    wages: total(h => h.wages), rent: total(h => h.rent), land: total(h => h.land), contracts: total(h => h.contracts), penalties: total(h => h.penalties),
    signed, jobs,
    upgrades: (Object.keys(c.upgrades) as UpgradeId[]).filter(u => c.upgrades[u]),
    buildings: S.buildingInfo(c).filter(b => b.state === 'built').map(b => b.kind),
    spend, tally,
  }
}

// The phase after a command: read through a call so the narrowing from before the command does not stick.
function phaseOf(c: Campaign): Campaign['phase'] {
  return c.phase
}

function tallyEvents(events: GameEvent[], t: Record<TallyKey, number>): void {
  for (const e of events) {
    switch (e.type) {
      case 'frozenInField': t.frozenCwt += Number(e.data?.cwt ?? 0); break
      case 'hurt': t.hurt++; break
      case 'breakdown': t.breakdowns++; break
      case 'incident': if (e.data?.kind === 'breakdown') t.breakdowns++; break
      case 'quit': t.quits++; break
      case 'poached': t.poached++; break
      case 'pondDry': t.pondDry++; break
      case 'stumped': t.stumped++; break
      case 'tiled': t.tiled++; break
      case 'felled': t.felled++; break
      case 'rocks': t.rocks++; break
      case 'brushed': t.brushed++; break
      case 'built': t.built++; break
    }
  }
}

function job(world: World, c: Campaign, kind: JobKind, field: number, unit = -1): boolean {
  return S.apply(world, c, { t: 'job', kind, field, unit }).ok
}

function queued(c: Campaign, kind: JobKind, field: number): boolean {
  return !!c.season && c.season.jobs.some(j => j.kind === kind && j.field === field)
}

function setPlan(world: World, c: Campaign, i: number, plan: FieldPlan): boolean {
  return S.apply(world, c, { t: 'plan', field: i, plan }).ok
}

// The fields the farm holds this year (a tract still to clear is held but is no field).
function infos(c: Campaign): FieldInfo[] {
  const out: FieldInfo[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const f = S.fieldInfo(c, i)
    if (f.tenure !== 'none' && f.cover === 'open') out.push(f)
  }
  return out
}

function sellAll(world: World, c: Campaign, l: Lot): void {
  S.apply(world, c, { t: 'sell', lot: l.id, frac: 1 })
}

// Everything is in: each field is resting, dug and weighed, lost (or not the farm's), or the ground has frozen.
function allIn(c: Campaign): boolean {
  if (c.season?.frozen) return true
  return infos(c).every(f => f.status === 'rest' || (f.status === 'dug' && f.weighed) || f.status === 'lost' || f.status === 'off')
}

// ---------------------------------------------------------------- naive

// Plants the six home fields on a fixed date, does nothing else, digs on a fixed date and sells at the dig.
export function naive(plantDate: [number, number] = [4, 20], digDate: [number, number] = [8, 20]): BotFactory {
  return () => ({
    plan(world, c) {
      for (let i = 0; i < S.HOME_FIELDS; i++) setPlan(world, c, i, { crop: 'potato', variety: 'katahdin', seed: 'certified' })
    },
    day(world, c) {
      const s = c.season!
      const plantDay = S.dayIndex(c.year, plantDate[0], plantDate[1])
      const digDay = S.dayIndex(c.year, digDate[0], digDate[1])
      for (let i = 0; i < S.HOME_FIELDS; i++) {
        const f = S.fieldInfo(c, i)
        if (f.status === 'idle' && s.day >= plantDay && !queued(c, 'plant', i)) job(world, c, 'plant', i)
        if ((f.status === 'growing' || f.status === 'dead') && s.day >= digDay && !queued(c, 'dig', i)) job(world, c, 'dig', i)
      }
      for (const l of S.openLots(c)) if (S.fieldInfo(c, l.field).weighed) sellAll(world, c, l)
    },
    cellar() { /* everything was sold at the dig */ },
  })
}

// ---------------------------------------------------------------- reference

// The coach's practice: every day each field the farm holds gets the order the advice has for it (what a player gets
// by giving every field its smart order), the advice's sales are made, every question takes its default, and the crop
// is kept in the cellar and sold in one month. The default plans, no land, crew, contracts, buildings or equipment.
// For validation runs, skip leaves some advice undone and waterBelow adds watering at a soil-moisture trigger.
export function reference(sellMonth = 4, skip: JobKind[] = [], waterBelow = 0): BotFactory {
  return () => ({
    plan() { /* default plans */ },
    day(world, c) {
      const all = S.advise(world, c)
      const done = new Set<number>()
      for (const a of all) {
        if (a.act === 'sell') { S.apply(world, c, { t: 'sell', lot: a.lot, frac: 1 }); continue }
        if (a.act === 'wait' || a.act === 'close' || a.field < 0 || done.has(a.field)) continue
        done.add(a.field)
        if (!skip.includes(a.act)) job(world, c, a.act, a.field)
      }
      if (waterBelow > 0) {
        for (const f of infos(c)) {
          if ((f.stage === 'Setting tubers' || f.stage === 'Bulking') && f.moisture < waterBelow && !queued(c, 'water', f.index)) job(world, c, 'water', f.index)
        }
      }
    },
    cellar(world, c) {
      if (c.month >= sellMonth) for (const l of S.openLots(c)) sellAll(world, c, l)
    },
  })
}

// ---------------------------------------------------------------- expert

// The farmstead decisions, each of which an ablation can take away.
export interface Farmstead {
  applicants: boolean       // hires from the people who ask for work; false: from the hiring hall only
  priorities: boolean       // sets each person's priorities for the work they were taken on for
  foreman: boolean          // takes on a foreman for the block with the most potato fields
  raises: boolean           // raises the pay of someone close to quitting, matches a neighbour's offer for someone unhappy
  cut: number               // share under the asking wage people are taken on at
  sundays: 'choose' | 'off' | 'work'   // choose: works Sundays in a rush while the crew is fresh
  pickers: boolean
  clear: boolean            // fells, stumps and picks the tracts, and buys Burnt Hill and the back lot
  rocks: boolean
  brush: boolean
  tile: boolean
  mortgage: boolean         // false: land is bought only when it can be paid for outright
  build: Record<BuildingKind, boolean>
  order: BuildingKind[]     // the order buildings are wanted in
  truck: boolean
  tractor3: boolean
  haul: 'prompt' | 'late'   // late: hauling waits behind every other job
  winter: boolean           // people kept on, and the farmer working, through the winter
  incidents: boolean        // false: every question takes its default
  hire: 'role' | 'machine' | 'field' | 'cheap'   // role: the best fit for each opening; or always the best at one work, or the cheapest
}

export const ALL_BUILDINGS: BuildingKind[] = ['house', 'shed', 'bunk', 'packing', 'pond', 'stand', 'station', 'road']

export const FARMSTEAD: Farmstead = {
  applicants: true, priorities: true, foreman: false, raises: true, cut: 0, sundays: 'choose', pickers: true, clear: true, rocks: true,
  brush: true, tile: true, mortgage: true,
  build: { house: true, shed: true, bunk: true, packing: true, pond: true, stand: true, station: true, road: true },
  order: ['stand', 'station', 'shed', 'bunk', 'house', 'road', 'pond', 'packing'],
  truck: true, tractor3: true, haul: 'prompt', winter: true, incidents: true, hire: 'role',
}

export interface ExpertCfg {
  years: number             // seasons the campaign runs: the expert plans for them
  hill: boolean
  scout: boolean            // scouting and roguing
  spray: boolean
  water: boolean
  sample: boolean           // test digs
  kill: boolean
  store: boolean
  rotation: boolean         // false: potatoes on every field every year
  seed: 'auto' | 'always'   // always: saved seed wherever there is stock, and seed kept back every year
  equipment: boolean        // cellar ventilation and the irrigation reel
  variety: VarietyId | null // one variety on every potato field
  calendar: boolean         // the same dates every year, whatever the weather
  land: 'auto' | BlockId[]  // land beyond the home farm: chosen each spring, or these blocks every year ([] keeps to the home six)
  hire: boolean             // anyone hired at all
  contracts: 'choose' | 'none' | 'all'
  tractor2: boolean
  farm: Farmstead
  tune: Tuning
}

// The expert's thresholds, set by trial runs (docs/balance/README.md).
export interface Tuning {
  spraySv: number           // season severity values before a blight day calls for a spray
  sprayProtect: number      // spray when the protectant left is below this and blight weather is due
  sprayProtectFound: number // the same where there is more blight than can be pulled
  scoutEvery: number
  scoutFound: number
  rogueMax: number
  sampleAt: number          // test dig this many days before the vines are due to be killed
  sampleEarly: number       // the same for an early variety grown for the early market, days after tuber set
  plantSoilT: number
  plantWetT: number         // below this soil temperature, hold off when heavy rain is forecast
  plantRainMm: number
  killFrom: number          // first late vine kill, days after August 1
  killGap: number           // days between late fields, for one crew digging
  killAfterMature: number   // days after the vines start going down
  killDelay: number         // days the late kill waits while the crop is still gaining value fast
  delayValue: number        // the value growth a day that counts as fast
  buy: { id: UpgradeId; left: number }[]   // equipment, with this many seasons left
  waterScab: number         // water below this moisture in the scab window after tuber set
  waterLate: number
  waterScabHand: number     // the same without the irrigation reel, when watering takes a whole day
  waterLateHand: number
  rainDays: number          // watering waits when the forecast for this many days calls for rain this likely and heavy
  rainChance: number
  rainMm: number
  earlyMarket: VarietyId[]  // varieties dug green and sold off the field before the new-potato market closes
  earlyBy: number           // and in any case by this many days after August 1
  earlyDate: number         // without a test dig: dig this many days after August 1
  fieldRevenue: number      // what a healthy potato field brings in, for the rotation plan
  byElev: VarietyId[][]     // varieties by preference on bottom land, mid slope and ridge
  landValue: Partial<Record<BlockId, number>>   // what a healthy field of each block nets in a potato season before rent, crews included
  landMargin: number        // takes a field when its plan for the seasons left is worth more than this
  loanFloor: number         // the spring plan takes cash no lower than this
  buyLand: number           // buys a field it holds when the cash left after the down payment and the spring's planting is at least this
  buyLeft: number           // and at least this many seasons are left
  fieldCash: number         // what a potato field is sure to bring in, for judging what the year end will leave
  potatoShare: number       // plants potatoes on at least this share of the fields held
  flipLoss: number          // when a field gives up no more than this by it against its best rotation
  yearEndSafety: number     // cash a purchase must leave at the year end, as far as the spring can tell
  walkFrom: number          // someone to walk the fields once more than this many potato fields are grown, another for each walkPer more
  walkPer: number
  tractor: { fields: number; left: number }    // the second tractor: potato fields, seasons left
  truckFields: number
  tractor3Fields: number
  hallValue: number         // dollars a month a point of speed at the work is worth, when choosing between people
  rocksAt: number           // picks rocks when no crop is in, on a field at least this stony
  rocksSpring: number       // in spring before planting only at this
  brushElev: number[]       // positions on the slope whose hedgerows it cuts
  rushFrom: number          // a rush part when this many days of machine work wait on the list
  buildFloor: number        // cash kept after a building, beyond what the year end will take
  houseOver: number         // a potato house once the crop overflowed the cellar by this much
  packStock: number         // a packing shed once this much is stored over the winter
  pondWaterings: number     // a pond once a season needed this many waterings without a reel
  sundayTired: number       // works a Sunday in a rush only while nobody is more tired than this
  contractGain: number      // signs a contract when it is worth this much more than growing for the open market
  no1Share: number          // share of the marketable crop that is US No. 1 and large, for sizing contracts
  contractSafety: number    // plants for this share of the usual crop when filling a contract
  // What the expert has learned to expect of each variety: marketable cwt an acre, and the share of its listed price a
  // hundredweight fetches sold the usual way (at the dig or from the cellar). Rules of thumb from its own play.
  yieldAcre: Record<VarietyId, number>
  realized: Record<VarietyId, number>
}

export const TUNING: Tuning = {
  spraySv: 30, sprayProtect: 0.3, sprayProtectFound: 0.5, scoutEvery: 4, scoutFound: 5, rogueMax: 2,
  sampleAt: -3, sampleEarly: 20, plantSoilT: 8, plantWetT: 11, plantRainMm: 15, killFrom: 40, killGap: 4, killAfterMature: 15,
  killDelay: 14, delayValue: 0.004,
  buy: [{ id: 'vent', left: 2 }],
  waterScab: 0.65, waterLate: 0.6, waterScabHand: 0.75, waterLateHand: 0.65, rainDays: 2, rainChance: 60, rainMm: 12,
  earlyMarket: ['norland'], earlyBy: 25, earlyDate: 12, fieldRevenue: 25000,
  byElev: [['caribou'], ['caribou'], ['caribou']],
  landValue: { ridge: 10000, brook: 6000, dufour: 7500 }, landMargin: 0,
  loanFloor: -75000, buyLand: -60000, buyLeft: 4, fieldCash: 15000, yearEndSafety: 10000, potatoShare: 0.5, flipLoss: 4000,
  walkFrom: 5, walkPer: 5, tractor: { fields: 7, left: 2 }, truckFields: 5, tractor3Fields: 12, hallValue: 1000,
  rocksAt: 0.45, rocksSpring: 0.6, brushElev: [0], rushFrom: 2,
  buildFloor: 5000, houseOver: 1500, packStock: 4000, pondWaterings: 3, sundayTired: 0.5,
  contractGain: 0, no1Share: 0.8, contractSafety: 0.85,
  yieldAcre: { norland: 251, superior: 287, katahdin: 325, kennebec: 337, burbank: 337, atlantic: 350, gold: 290, caribou: 371 },
  realized: { norland: 1.05, superior: 0.95, katahdin: 0.95, kennebec: 0.95, burbank: 0.97, atlantic: S.PROCESSING_PRICE, gold: 0.95, caribou: 0.92 },
}

export const EXPERT: ExpertCfg = {
  years: 10,
  hill: true, scout: true, spray: true, water: true, sample: true, kill: true, store: true,
  rotation: true, seed: 'auto', equipment: true, variety: null, calendar: false,
  land: 'auto', hire: true, contracts: 'choose', tractor2: true, farm: FARMSTEAD, tune: TUNING,
}

// The land beyond the home farm, the far end first.
const FAR: BlockId[] = ['dufour', 'ridge', 'brook']
const BLOCK_FIELDS: Record<BlockId, number[]> = { home: [], brook: [], ridge: [], dufour: [] }
S.PARCELS.forEach((p, i) => { if (p.holding === 'field') BLOCK_FIELDS[p.block].push(i) })
// Tracts to clear, the most worth having first: the two the farm owns, then those for sale.
const TRACT_ORDER = [14, 16, 15, 17]
// Where on the slope each variety does best, when a contract asks for more of it.
const SLOPE_PREF: Record<VarietyId, number[]> = {
  atlantic: [0, 1, 2], kennebec: [0, 1, 2], gold: [1, 0, 2], caribou: [1, 2, 0],
  katahdin: [2, 1, 0], burbank: [2, 1, 0], superior: [2, 1, 0], norland: [2, 1, 0],
}
const MACHINE_JOBS: JobKind[] = ['plant', 'hill', 'spray', 'water', 'kill', 'dig', 'haul']

interface FieldMem {
  plant: number; ti: number; mature: number; dead: number
  lastSpray: number
  samples: { day: number; weights: number[]; marks: number[] }[]
  est: { day: number; mean: number; digs: number }[]
  tuberBlight: boolean
  blightHere: boolean
  certified: boolean
}

function blankField(): FieldMem {
  return { plant: -1, ti: -1, mature: -1, dead: -1, lastSpray: -1, samples: [], est: [], tuberBlight: false, blightHere: false, certified: true }
}

// Price relative to the season average through the harvest: the public seasonal index.
function seasonIndex(day: number): number {
  const k = S.SEASON_CURVE
  if (day <= k[0][0]) return k[0][1]
  for (let i = 1; i < k.length; i++) {
    if (day <= k[i][0]) return k[i - 1][1] + ((day - k[i - 1][0]) / (k[i][0] - k[i - 1][0])) * (k[i][1] - k[i - 1][1])
  }
  return k[k.length - 1][1]
}

const MARK_BLIGHT = 7
const MARK_HOLLOW = 3
const HOLLOW_FROM = 220     // grams: hollow heart strikes only tubers above this
const GRAMS_PER_HILL = S.FIELD_ACRES / (S.HILLS * S.CWT_PER_HILL_GRAM)   // per plant, for each cwt an acre

// Tuber sizes under a hill relative to their mean, as the game draws them (tuberWeights in src/sim/harvest.ts),
// widened by the hill-to-hill spread in how many tubers set.
const SIZE_SPREAD: number[] = (() => {
  const raw: number[] = []
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      const u = (a + 0.5) / 16, u2 = (b + 0.5) / 16
      for (const h of [1.27, 1.08, 0.93, 0.83]) raw.push((0.22 + u + 1.6 * u2 * u2) * h)
    }
  }
  const m = raw.reduce((x, y) => x + y, 0) / raw.length
  return raw.map(x => x / m)
})()

// What a gram of crop is worth, as a share of the No. 1 price, when the tubers average m grams.
export function sizeValue(m: number, large: number, hollow: number): number {
  let v = 0, w = 0
  for (const s of SIZE_SPREAD) {
    const x = m * s
    let p = x < S.SIZE_SMALL ? 0 : x < S.SIZE_A ? S.GRADE_PRICE.b : x > S.SIZE_CHEF ? large : 1
    if (x > HOLLOW_FROM) p = p * (1 - hollow) + S.GRADE_PRICE.no2 * hollow
    v += p * s
    w += s
  }
  return v / w
}

// The chipping variety off contract fetches only the processing price, which moves a quarter as far as the market.
const OPEN = (v: ReturnType<typeof S.variety>) => v.contract ? S.PROCESSING_PRICE : 1

// What a lot is worth in the cellar month by month (0 = November), as a share of its variety's average No. 1
// price, from the public storage rules: the price through the winter at the level the quote shows now (the
// chipping variety's processing price is one price all winter), shrink and the cellar charge from the day of the
// dig, sprouting once the lot has been out of the ground longer than its dormancy in a cool cellar, rot started by
// the blighted tubers that showed on the picking table, and what packing adds. In season the time from the dig to
// November is still to be paid.
export function cellarValues(l: Lot, vent: boolean, digTotal: number, level = 1, from = 0, inSeason = false): number[] {
  const v = S.variety(l.variety)
  const dorm = v.dormancy + S.COOL_CELLAR_DAYS + (vent ? S.VENT_DAYS : 0)
  const outDays = S.dayIndex(l.year, 10, 1) - l.dugDay
  const rent = S.STORE_COST / v.price
  const shrink = vent ? S.SHRINK_VENT : S.SHRINK
  const price = (m: number) => v.contract ? OPEN(v) * (1 + (level - 1) * 0.25) : S.MONTH_CURVE[m] * level
  let decay = Math.min(0.6, (digTotal > 0 ? l.loss.blight / digTotal : 0) + 0.012 * (1 - l.skin))
  let keep = 1, paid = 0, sprouted = l.sprouted
  if (inSeason) {
    const before = Math.max(0, outDays / 30)
    paid = rent * before
    keep = 1 - shrink * before
  }
  const out = [price(0) * (sprouted ? 0.85 : 1) * keep - paid]
  for (let months = 1; months < S.MONTH_CURVE.length; months++) {
    let sh = shrink
    if (months === 1) sh += 0.03 * (1 - l.skin)
    if (!sprouted && outDays + months * 30 > dorm) sprouted = true
    if (sprouted) sh += S.SPROUT_SHRINK
    let lost = 0
    if (decay > 0) {
      const grow = decay * (vent ? S.ROT_GROW_VENT : S.ROT_GROW)
      lost = Math.min(0.5, grow)
      decay = Math.min(0.9, decay + grow)
      if (decay >= S.ROT_BREAK) { lost = 0.55; decay = 0.06 }
    }
    if (months > from) paid += rent * keep
    keep *= (1 - sh) * (1 - lost)
    out.push(price(months) * (sprouted ? 0.85 : 1) * keep - paid)
  }
  return out
}

// The year's price level, read off how far a quote sits from the usual price for the day (the chipping variety's
// processing price moves a quarter as far as the open market). frac is how much of the level the market knows yet.
function levelFrom(v: ReturnType<typeof S.variety>, quote: number, usual: number, frac: number): number {
  if (frac < 0.15) return 1
  return 1 + (v.contract ? (quote / OPEN(v) - 1) / 0.25 : quote / usual - 1) / frac
}

type Role = 'driver' | 'walker'

// How fast someone works at a role's work, from what the game shows of them.
function roleSpeed(skills: Record<Skill, number>, trait: Trait | '', role: Role): number {
  const skill = role === 'driver' ? 'machine' : 'field'
  let v = S.SKILL_SPEED_BASE + S.SKILL_SPEED_PER * (skills[skill] + (role === 'driver' && trait === 'steady' ? 1 : 0))
  if (trait === 'early') v *= S.EARLY_SPEED
  if (trait === 'slow') v *= S.SLOW_SPEED
  if (role === 'walker' && trait === 'strong') v *= S.STRONG_SPEED
  if (role === 'walker' && trait === 'sharp') v *= 1.1
  if (trait === 'careless') v *= 0.9
  return v
}

function roleOf(p: { skills: Record<Skill, number> }): Role {
  return p.skills.machine >= p.skills.field ? 'driver' : 'walker'
}

export function expert(cfg: ExpertCfg = EXPERT): BotFactory {
  const k = cfg.tune
  const F = cfg.farm
  return () => {
    let fm: FieldMem[] = []
    let sev: number[] = []
    let lastDay = -1
    let yearSeen = -1
    let blightOnFarm = false
    let handWaterings = 0                           // waterings without a reel or pond this season
    let lastOverflow = 0                            // cwt the last crop overflowed the potato houses by
    let lastPotato = 0                              // potato fields grown this season
    let wantRoles = { driver: 0, walker: 0 }        // hired people wanted for each role this season
    const roles = new Map<number, Role | 'foreman'>()   // person id -> what they were taken on for
    const seedFrom = new Map<number, boolean>()     // lot id -> grown from certified seed
    const digTotal = new Map<number, number>()      // lot id -> marketable cwt when dug

    const yearsLeft = (c: Campaign) => cfg.years - c.yearIdx
    const horizon = (c: Campaign) => Math.max(1, Math.min(6, yearsLeft(c)))
    const hired = (c: Campaign) => S.peopleInfo(c).filter(p => p.kind !== 'farmer')
    const built = (c: Campaign, kind: BuildingKind) => S.buildingInfo(c).some(b => b.kind === kind && b.yard === S.HOME_YARD && b.state === 'built')
    const started = (c: Campaign, kind: BuildingKind) => S.buildingInfo(c).some(b => b.kind === kind && b.yard === S.HOME_YARD && b.state !== 'none')

    // Expected net for a potato field from its soil and wilt, by the rules of thumb a grower carries.
    function fieldValue(vert: number, soil: number): number {
      const yf = (1 - 0.45 * vert) * (1 - 0.07 * (1 - soil)) * (1 - 0.06 * (1 - soil))
      return k.fieldRevenue * yf - (S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT + 1300)
    }

    function bestFirstCrop(vert: number, soil: number, years: number): 'potato' | 'rest' {
      return rotationCost(vert, soil, years) > 0 ? 'rest' : 'potato'
    }

    // What growing potatoes this year gives up against the best plan for the seasons left (0 when potatoes are best).
    function rotationCost(vert: number, soil: number, years: number): number {
      let bestP = -Infinity, bestR = -Infinity
      for (let mask = 0; mask < (1 << years); mask++) {
        let v = vert, s = soil, total = 0
        for (let t = 0; t < years; t++) {
          const odds = v / (1 - v)
          if (((mask >> t) & 1) === 0) {
            total += fieldValue(v, s)
            s = Math.max(0, s + S.SOIL_AFTER_POTATO)
            const o = odds * S.VERT_GROW
            v = Math.min(0.95, o / (1 + o))
          } else {
            total += S.REST_INCOME - S.REST_COST
            s = 1
            const o = odds * S.VERT_REST
            v = Math.max(0.01, o / (1 + o))
          }
        }
        if ((mask & 1) === 0) bestP = Math.max(bestP, total)
        else bestR = Math.max(bestR, total)
      }
      return Math.max(0, bestR - bestP)
    }

    function defaultVariety(c: Campaign, elev: number): VarietyId {
      if (cfg.variety) return cfg.variety
      const have = new Set(S.availableVarieties(c.year).map(v => v.id))
      return k.byElev[elev].find(id => have.has(id)) ?? 'katahdin'
    }

    // What a field of a variety is worth sold on the open market, by the expert's rules of thumb.
    const openValue = (id: VarietyId) => k.yieldAcre[id] * S.FIELD_ACRES * S.variety(id).price * k.realized[id]

    const useSaved = (v: VarietyId) => S.variety(v).virus <= 0.5
    const isEarly = (c: Campaign, i: number) => k.earlyMarket.includes(c.plans[i].variety)

    function absorb(e: GameEvent): void {
      if (e.type === 'watered' && !/pond/.test(e.text)) handWaterings++
      if (e.field < 0 || e.field >= fm.length) return
      const m = fm[e.field]
      switch (e.type) {
        case 'planted': m.plant = e.day; break
        case 'ti': m.ti = e.day; break
        case 'mature': m.mature = e.day; break
        case 'killed': case 'vinesDead': if (m.dead < 0) m.dead = e.day; break
        case 'sprayed': m.lastSpray = e.day; break
        case 'blightSeen': blightOnFarm = true; m.blightHere = true; break
        case 'scout': if (Number(e.data?.found ?? 0) > 0) { blightOnFarm = true; m.blightHere = true } break
        case 'sample': {
          const marks = (e.data?.marks ?? []) as number[]
          m.samples.push({ day: e.day, weights: (e.data?.weights ?? []) as number[], marks })
          if (marks.includes(MARK_BLIGHT)) m.tuberBlight = true
          break
        }
        case 'dug': {
          const id = Number(e.data?.lot ?? -1)
          if (id >= 0) seedFrom.set(id, m.certified)
          break
        }
      }
    }

    // Daily growth of the yield estimate over the last few days, between test digs: the growth the grower
    // expects from the leaf and the weather, not the tubers' own.
    function massGrowth(m: FieldMem): number | null {
      const e = m.est
      for (let j = e.length - 1; j >= 5; j--) {
        const now = e[j], back = e[j - 5]
        if (back.digs === now.digs && back.mean > 0) return (now.mean / back.mean) ** (1 / (now.day - back.day)) - 1
      }
      return null
    }

    // How fast the crop's value is growing, a share a day: tubers gain weight, but past the No. 1 sizes they lose
    // price and run hollow. The tuber size is what the test digs show, or without one the yield estimate spread
    // over the variety's usual set.
    function valueGrowth(world: World, c: Campaign, f: FieldInfo, m: FieldMem): number | null {
      const g = massGrowth(m)
      if (g === null || !f.estimate) return null
      const id = c.plans[f.index].variety
      const quote = { variety: id, sprouted: false } as Lot
      const large = S.gradePrice(world, c, quote, 'chef') / S.gradePrice(world, c, quote, 'no1')
      let big = 0, holl = 0
      for (const x of m.samples) x.weights.forEach((w, j) => { if (w > HOLLOW_FROM) { big++; if (x.marks[j] === MARK_HOLLOW) holl++ } })
      const hollow = Math.max(S.variety(id).hollow, big >= 2 ? holl / big : 0)
      const mean = f.tubers ? (f.tubers.lo + f.tubers.hi) / 2 : f.estimate.mean * GRAMS_PER_HILL / S.variety(id).set
      const e = Math.log(sizeValue(mean * 1.1, large, hollow) / sizeValue(mean / 1.1, large, hollow)) / Math.log(1.21)
      return (1 + g) ** (1 + e) - 1
    }

    // Late fields are killed in turn, bottom land first (it frosts first), so the diggers can follow two weeks on.
    let lateOrder: number[] = []
    const lateRank = (i: number) => Math.max(0, lateOrder.indexOf(i))
    let diggers = 1
    function killDue(c: Campaign, f: FieldInfo, m: FieldMem): number {
      const due = S.dayIndex(c.year, 7, 1) + k.killFrom + Math.round(lateRank(f.index) * k.killGap / diggers)
      return m.mature >= 0 ? Math.min(due, m.mature + k.killAfterMature) : due
    }

    function wantKill(world: World, c: Campaign, f: FieldInfo, m: FieldMem, d: number, frostSoon: boolean): boolean {
      const at = (mo: number, dom: number) => S.dayIndex(c.year, mo, dom)
      if (cfg.calendar) return d >= at(7, 28)
      if (f.blightKnown >= 0.15 || m.tuberBlight) return true
      const vg = valueGrowth(world, c, f, m)
      const due = killDue(c, f, m)
      if (d >= due) {
        if (vg !== null && k.killDelay > 0 && vg >= k.delayValue && d < due + k.killDelay && !frostSoon) return false
        return true
      }
      return frostSoon && d >= at(8, 5)
    }

    // Early market: the crop gains weight while the new-potato premium falls; dig when the value stops rising.
    function wantEarlyDig(world: World, c: Campaign, f: FieldInfo, m: FieldMem, d: number): boolean {
      const at = (mo: number, dom: number) => S.dayIndex(c.year, mo, dom)
      if (cfg.calendar) return d >= at(7, 20)
      if (d >= at(7, 1) + k.earlyBy) return true
      if (d < at(6, 10)) return false
      const vg = valueGrowth(world, c, f, m)
      if (vg !== null) return (1 + vg) * seasonIndex(d + 1) / seasonIndex(d) - 1 < 0
      return d >= at(7, 1) + k.earlyDate
    }

    // ------------------------------------------------------------ spring: land, plans, contracts, machinery, people

    const PER_FIELD = S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT
    let landMove = new Map<number, 'potato' | 'rest'>()

    // The next few seasons of a field the farm does not own: each year grow potatoes, rest it, or leave it to its
    // owner, paying the rent in every year it is held. Returns the best first move and what the whole plan is worth.
    function landPlan(vert: number, soil: number, value: number, rent: number, years: number): { first: 'potato' | 'rest' | 'off'; worth: number } {
      const healthy = fieldValue(0.03, 1)
      let best = -Infinity, first: 'potato' | 'rest' | 'off' = 'off'
      const go = (t: number, v: number, s: number, total: number, move: 'potato' | 'rest' | 'off') => {
        if (t === years) { if (total > best) { best = total; first = move } return }
        const odds = v / (1 - v)
        const grow = odds * S.VERT_GROW, rest = odds * S.VERT_REST
        go(t + 1, Math.min(0.95, grow / (1 + grow)), Math.max(0, s + S.SOIL_AFTER_POTATO), total + value - (healthy - fieldValue(v, s)) - rent, t === 0 ? 'potato' : move)
        go(t + 1, Math.max(0.01, rest / (1 + rest)), 1, total + S.REST_INCOME - S.REST_COST - rent, t === 0 ? 'rest' : move)
        go(t + 1, v, s, total, t === 0 ? 'off' : move)
      }
      go(0, vert, soil, 0, 'off')
      return { first, worth: best }
    }

    // The land it holds this year beyond the home six, rented, or bought on the mortgage when the down payment and
    // the spring's planting still leave enough of the loan (outright, without the mortgage).
    function takeLand(world: World, c: Campaign, homePotato: number): void {
      const left = horizon(c)
      landMove = new Map()
      let planting = homePotato * PER_FIELD
      const want = new Set<number>()
      const cost = (i: number, move: 'potato' | 'rest') => (move === 'potato' ? PER_FIELD : S.REST_COST) + (S.fieldInfo(c, i).tenure === 'owned' ? 0 : S.PARCELS[i].rent)
      const options: { i: number; move: 'potato' | 'rest'; worth: number; buy: boolean }[] = []
      for (const b of FAR) {
        for (const i of BLOCK_FIELDS[b]) {
          const f = S.fieldInfo(c, i)
          const owned = f.tenure === 'owned'
          if (Array.isArray(cfg.land) ? cfg.land.includes(b) : owned) {
            const move = cfg.rotation ? bestFirstCrop(f.vert, f.soil, left) : 'potato'
            want.add(i); landMove.set(i, move); planting += cost(i, move)
            continue
          }
          if (Array.isArray(cfg.land)) continue
          // Held at the rent, or bought: then its yearly cost is the mortgage interest, which falls as the loan is paid.
          const lp = landPlan(f.vert, f.soil, k.landValue[b] ?? 0, S.PARCELS[i].rent, left)
          const interest = S.MORTGAGE_RATE * S.PARCELS[i].price * (1 - S.MORTGAGE_DOWN) * (1 - S.MORTGAGE_PRINCIPAL * (left - 1) / 2)
          const bp = canBuy(c, i, planting) ? landPlan(f.vert, f.soil, k.landValue[b] ?? 0, interest, left) : null
          const buy = !!bp && bp.first !== 'off' && bp.worth > lp.worth
          const plan = buy ? bp! : lp
          if (plan.first !== 'off' && plan.worth > k.landMargin) options.push({ i, move: cfg.rotation ? plan.first as 'potato' | 'rest' : 'potato', worth: plan.worth, buy })
        }
      }
      for (const o of options.sort((a, b) => b.worth - a.worth)) {
        if (c.cash - planting - cost(o.i, o.move) < k.loanFloor) continue
        if (o.buy && canBuy(c, o.i, planting) && buyField(world, c, o.i)) { want.add(o.i); landMove.set(o.i, o.move); planting += cost(o.i, o.move); continue }
        want.add(o.i); landMove.set(o.i, o.move); planting += cost(o.i, o.move)
      }
      for (const b of FAR) {
        for (const i of BLOCK_FIELDS[b]) {
          const tenure = S.fieldInfo(c, i).tenure
          if (!want.has(i)) { if (tenure === 'rented') S.apply(world, c, { t: 'release', field: i }); continue }
          if (tenure === 'none') S.apply(world, c, { t: 'rent', field: i })
        }
      }
    }

    // Whether a field can be bought this spring: enough seasons left to pay, and the down payment (on the mortgage) or
    // the whole price (without it) leaves enough of the spring loan.
    function canBuy(c: Campaign, i: number, planting: number): boolean {
      if (yearsLeft(c) < k.buyLeft || S.fieldInfo(c, i).tenure === 'owned') return false
      const price = S.PARCELS[i].price
      const outlay = F.mortgage ? Math.round(price * S.MORTGAGE_DOWN) : price
      const due = F.mortgage ? (price - outlay) * (S.MORTGAGE_PRINCIPAL + S.MORTGAGE_RATE) : 0
      return c.cash - outlay >= 0 && c.cash - outlay - planting >= k.buyLand && yearEndCash(c) - outlay - due >= k.yearEndSafety
    }

    // Cash at this year end, as far as the spring can tell: the plan and the season's work and wages paid, a cautious
    // crop sold, the rest years' oats, and what the bank and the household take.
    function yearEndCash(c: Campaign): number {
      let potato = 0, rest = 0
      for (const f of infos(c)) { if (f.crop === 'potato') potato++; else rest++ }
      const wages = hired(c).reduce((a, p) => a + p.pay, 0) * 6
      const due = S.mortgageDue(c)
      return c.cash - S.planCosts(c).total - wages - potato * 1800 + potato * k.fieldCash + rest * S.REST_INCOME
        - S.NOTE_PAYMENT - S.LIVING - due.principal - due.interest
    }

    function buyField(world: World, c: Campaign, i: number): boolean {
      if (!S.apply(world, c, { t: 'buyLand', field: i }).ok) return false
      if (!F.mortgage) S.apply(world, c, { t: 'payMortgage', amount: S.mortgageOwed(c) })
      return true
    }

    // What holding a field is worth this year, for giving land back when the loan will not stretch.
    function heldNet(c: Campaign, i: number): number {
      const f = S.fieldInfo(c, i)
      const value = (k.landValue[f.block] ?? 0) - (fieldValue(0.03, 1) - fieldValue(f.vert, f.soil))
      return (f.crop === 'potato' ? value : S.REST_INCOME - S.REST_COST) - (f.tenure === 'owned' ? 0 : S.PARCELS[i].rent)
    }

    // Contracts worth signing, given the potato fields planned and the variety each would grow.
    function signContracts(world: World, c: Campaign, fields: { i: number; elev: number; v: VarietyId }[]): void {
      if (cfg.contracts === 'none' || !fields.length) return
      const perField = (id: VarietyId) => k.yieldAcre[id] * S.FIELD_ACRES * k.no1Share * k.contractSafety
      const offers = [...S.offerInfo(c)].sort((a, b) => b.price / b.usual - a.price / a.usual)
      const need = new Map<VarietyId, number>()
      for (const o of offers) {
        if (cfg.variety && o.variety !== cfg.variety) continue
        if (cfg.contracts === 'choose') {
          const v = S.variety(o.variety)
          const have = fields.filter(f => f.v === o.variety).length
          const fieldsNeeded = Math.ceil(((need.get(o.variety) ?? 0) + o.cwt) / perField(o.variety))
          const switching = Math.max(0, fieldsNeeded - have)
          const others = fields.filter(f => f.v !== o.variety && !need.has(f.v))
          if (switching > others.length) continue
          const lost = others.map(f => openValue(f.v) - openValue(o.variety)).sort((a, b) => a - b).slice(0, switching).reduce((a, x) => a + x, 0)
          const gain = o.cwt * (o.price - v.price * k.realized[o.variety]) - lost
          if (gain <= k.contractGain) continue
        }
        if (S.apply(world, c, { t: 'accept', offer: o.id }).ok) need.set(o.variety, (need.get(o.variety) ?? 0) + o.cwt)
      }
      for (const [id, cwt] of need) {
        let short = Math.ceil(cwt / perField(id)) - fields.filter(f => f.v === id).length
        for (const elev of SLOPE_PREF[id]) {
          for (const f of fields) {
            if (short <= 0) break
            if (f.elev !== elev || f.v === id || need.has(f.v)) continue
            f.v = id
            short--
          }
        }
      }
    }

    // Tractors, the truck and the people for a season of n potato fields.
    const tractorsFor = (c: Campaign, n: number) => 1 + (cfg.tractor2 && cfg.hire && n >= k.tractor.fields ? 1 : 0) + (F.tractor3 && cfg.tractor2 && cfg.hire && n >= k.tractor3Fields ? 1 : 0)
    const truckFor = (n: number) => F.truck && cfg.hire && n >= k.truckFields
    function rolesFor(c: Campaign, n: number): { driver: number; walker: number } {
      if (!cfg.hire) return { driver: 0, walker: 0 }
      const tractors = Math.min(tractorsFor(c, n), S.tractorsOwned(c))
      const driver = Math.max(0, tractors - 1 + (c.upgrades.truck ? 1 : 0))
      const walker = n > k.walkFrom ? 1 + Math.floor((n - k.walkFrom - 1) / k.walkPer) : 0
      return { driver, walker }
    }

    // How much a person is worth to the farm a month at a role, against their wage.
    const fitValue = (skills: Record<Skill, number>, trait: Trait | '', ask: number, role: Role) => {
      const wage = Math.round(ask * (1 - F.cut))
      if (F.hire === 'machine') return skills.machine * 100 - wage / 100
      if (F.hire === 'field') return skills.field * 100 - wage / 100
      if (F.hire === 'cheap') return -wage
      return roleSpeed(skills, trait, role) * k.hallValue - wage
    }

    // Takes someone on for a role: the best fit among this spring's applicants, if better than the hiring hall.
    function hireFor(world: World, c: Campaign, role: Role): boolean {
      if (S.hireRoom(c)) return false
      const hall = role === 'driver' ? { skills: S.OPERATOR_SKILLS, wage: S.OPERATOR_WAGE, kind: 'operator' as const } : { skills: S.HAND_SKILLS, wage: S.HAND_WAGE, kind: 'hand' as const }
      let best: { id: number; v: number } | null = null
      if (F.applicants) {
        for (const a of S.applicantInfo(c)) {
          if (a.why) continue
          if (F.hire === 'role' && roleOf(a) !== role && roleSpeed(a.skills, a.trait, role) < 1) continue
          const v = fitValue(a.skills, a.trait, a.ask, role)
          if (!best || v > best.v) best = { id: a.id, v }
        }
      }
      const hallV = fitValue(hall.skills, '', hall.wage, role)
      const before = new Set(c.crew.map(u => u.id))
      let ok = false
      if (best && (best.v >= hallV || F.hire !== 'role')) ok = S.apply(world, c, { t: 'hire', applicant: best.id }).ok
      else ok = S.apply(world, c, { t: 'hire', kind: hall.kind }).ok
      if (!ok) return false
      const u = c.crew.find(x => !before.has(x.id))
      if (!u) return false
      roles.set(u.id, role)
      if (F.cut > 0) S.apply(world, c, { t: 'raise', unit: u.id, wage: Math.round(u.wage * (1 - F.cut)) })
      setPriorities(world, c, u.id, role)
      return true
    }

    // A driver drives first; someone walking the fields walks first and minds the stand. Nobody drives who drives badly.
    function setPriorities(world: World, c: Campaign, id: number, role: Role): void {
      if (!F.priorities) return
      const p = S.peopleInfo(c).find(x => x.id === id)
      if (!p) return
      const want: Record<Skill, number> = role === 'driver'
        ? { machine: 1, field: 3, woods: 3, build: 2, pack: 4 }
        : { machine: p.skills.machine >= 4 ? 4 : 0, field: 1, woods: 3, build: 2, pack: 1 }
      for (const s of S.SKILLS) if (p.prio[s] !== want[s]) S.apply(world, c, { t: 'priority', unit: id, work: s, level: want[s] })
    }

    // The crew for the season: those kept on who still have a role, and the best fit for each opening.
    function manPeople(world: World, c: Campaign, n: number): void {
      wantRoles = rolesFor(c, n)
      if (F.priorities) {
        const farmer = S.peopleInfo(c).find(p => p.kind === 'farmer')!
        const want: Record<Skill, number> = { machine: 2, field: 2, woods: 2, build: 2, pack: hired(c).length ? 4 : 2 }
        for (const s of S.SKILLS) if (farmer.prio[s] !== want[s]) S.apply(world, c, { t: 'priority', unit: 0, work: s, level: want[s] })
      }
      for (const r of ['driver', 'walker'] as Role[]) {
        const have = hired(c).filter(p => (roles.get(p.id) ?? roleOf(p)) === r && !p.foreman)
          .sort((a, b) => roleSpeed(b.skills, b.trait, r) / b.wage - roleSpeed(a.skills, a.trait, r) / a.wage)
        for (let j = wantRoles[r]; j < have.length; j++) { S.apply(world, c, { t: 'dismiss', unit: have[j].id }); roles.delete(have[j].id) }
        for (let j = have.length; j < wantRoles[r]; j++) if (!hireFor(world, c, r)) break
      }
      // A foreman for the block with the most potato fields, from the people asking for work or the hall.
      const fore = hired(c).find(p => p.foreman)
      if (F.foreman && cfg.hire && n > 0) {
        const count = new Map<BlockId, number>()
        for (const f of infos(c)) if (f.crop === 'potato') count.set(f.block, (count.get(f.block) ?? 0) + 1)
        const block = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'home'
        let id = fore?.id ?? -1
        if (id < 0 && hireFor(world, c, 'walker')) id = c.crew[c.crew.length - 1].id
        if (id >= 0 && fore?.foreman !== block) {
          if (fore) S.apply(world, c, { t: 'foreman', unit: id, block: null })
          if (S.apply(world, c, { t: 'foreman', unit: id, block }).ok) roles.set(id, 'foreman')
        }
      } else if (fore) S.apply(world, c, { t: 'dismiss', unit: fore.id })
    }

    // Logs and stone the wanted buildings still need; logs beyond that are sold.
    function sellSpareLogs(world: World, c: Campaign): void {
      let need = 0
      for (const kind of F.order) if (F.build[kind] && !started(c, kind)) need += S.BUILDINGS[kind].logs
      const spare = S.materialsInfo(c).logs - need
      if (spare >= 1) S.apply(world, c, { t: 'sellLogs', loads: Math.floor(spare) })
    }

    // The buildings worth having now, in the order wanted.
    function wantBuild(c: Campaign, kind: BuildingKind): boolean {
      const left = yearsLeft(c)
      const n = Math.max(lastPotato, 1)
      switch (kind) {
        case 'stand': return left >= 2
        case 'station': return left >= 2
        case 'shed': return left >= 3 && (n >= k.tractor.fields - 2 || wantRoles.driver > 0)
        case 'bunk': return left >= 2 && wantRoles.driver + wantRoles.walker + (F.foreman ? 1 : 0) >= S.HOUSED_OUT
        case 'house': return left >= 3 && lastOverflow >= k.houseOver
        case 'road': return left >= 3 && (S.materialsInfo(c).stone >= S.BUILDINGS.road.stone * 0.8 || S.holdsDufour(c))
        case 'pond': return left >= 3 && !c.upgrades.reel && handWaterings >= k.pondWaterings
        case 'packing': return left >= 3 && S.storageInfo(c).stored >= k.packStock && hired(c).length > 0
      }
    }

    // Orders the wanted buildings it can pay for: in spring while the plan still fits the loan, over the winter
    // keeping what the year end will take.
    function orderBuildings(world: World, c: Campaign): void {
      for (const kind of F.order) {
        if (!F.build[kind] || started(c, kind) || !wantBuild(c, kind)) continue
        const cost = S.buildCost(c, kind).total
        const ok = c.phase === 'plan'
          ? c.cash - cost >= k.buildFloor && c.cash - S.planCosts(c).total - cost >= k.loanFloor + 20000 && yearEndCash(c) - cost >= k.yearEndSafety
          : c.cash - cost - yearEndNeed(c) >= k.buildFloor
        if (ok) S.apply(world, c, { t: 'build', kind, yard: S.HOME_YARD })
      }
    }

    // What the bank and the household take at this year end, and the winter's wages for those kept on.
    function yearEndNeed(c: Campaign): number {
      const due = S.mortgageDue(c)
      const months = Math.max(0, S.WINTER_MONTHS - c.month)
      return S.NOTE_PAYMENT + S.LIVING + due.principal + due.interest + S.winterInfo(c).monthly * months
    }

    // Seed for next spring is kept back from this year's lots: as many fields of each variety as grew it.
    function holdSeed(world: World, c: Campaign): void {
      if (yearsLeft(c) <= 1) return
      const need = new Map<VarietyId, number>()
      c.plans.forEach((p, i) => { if (S.isField(c, i) && p.crop === 'potato') need.set(p.variety, (need.get(p.variety) ?? 0) + 1) })
      if (cfg.seed === 'always') {
        let fields = infos(c).length
        for (const l of S.openLots(c)) {
          const n = Math.min(fields, Math.floor((l.grades.b + l.grades.no1) / S.SEED_CWT_PER_FIELD))
          if (n >= 1 && S.apply(world, c, { t: 'seed', lot: l.id, fields: n }).ok) fields -= n
        }
        return
      }
      for (const l of S.openLots(c)) {
        const total = digTotal.get(l.id) ?? S.lotCwt(l)
        const clean = total > 0 && l.loss.blight / total < 0.005
        if (!useSaved(l.variety) || !(seedFrom.get(l.id) ?? true) || !clean) continue
        const left = need.get(l.variety) ?? 0
        const n = Math.min(left, Math.floor((l.grades.b + l.grades.no1) / S.SEED_CWT_PER_FIELD))
        if (n >= 1 && S.apply(world, c, { t: 'seed', lot: l.id, fields: n }).ok) need.set(l.variety, left - n)
      }
    }

    function sellInSeason(world: World, c: Campaign): void {
      const s = c.season!
      const vent = c.upgrades.vent
      deliver(world, c, true)
      const keep: { l: Lot; value: number }[] = []
      for (const l of S.openLots(c)) {
        if (!S.fieldInfo(c, l.field).weighed) continue
        if (!digTotal.has(l.id)) digTotal.set(l.id, S.lotCwt(l) + l.sold)
        if (!cfg.store || (S.newPotatoWindow(c, l) && l.skinned > 0)) { sellAll(world, c, l); continue }
        const v = S.variety(l.variety)
        const frac = Math.max(0, Math.min(1, (s.day - 212) / 92))
        const quote = S.basePrice(world, c, l.variety) / v.price
        const level = levelFrom(v, quote, seasonIndex(s.day), frac)
        const best = Math.max(...cellarValues(l, vent, digTotal.get(l.id)!, level, 0, true))
        if (quote >= best) { sellAll(world, c, l); continue }
        keep.push({ l, value: best / quote })
      }
      if (!allIn(c)) return
      const cap = S.cellarCapacity(c)
      let stored = keep.reduce((a, x) => a + S.lotCwt(x.l), 0)
      lastOverflow = Math.max(lastOverflow, stored - cap)
      for (const x of keep.sort((a, b) => a.value - b.value)) {
        if (stored <= cap) break
        const have = S.lotCwt(x.l)
        const frac = Math.min(1, (stored - cap) / have)
        S.apply(world, c, { t: 'sell', lot: x.l.id, frac })
        stored -= have * frac
      }
    }

    // Fills the open contracts from the dug lots of their variety, those due off the field first.
    function deliver(world: World, c: Campaign, inSeason: boolean): void {
      const open = S.contractInfo(c).filter(x => !x.settled && x.needed > 1e-6).sort((a, b) => Number(a.due === 'winter') - Number(b.due === 'winter'))
      for (const x of open) {
        for (const l of S.openLots(c)) {
          if (l.variety !== x.variety || l.grades.no1 + l.grades.chef <= 1e-6) continue
          if (inSeason && !S.fieldInfo(c, l.field).weighed) continue
          if (!S.apply(world, c, { t: 'deliver', lot: l.id, contract: x.id }).ok) continue
          if ((S.contractInfo(c).find(y => y.id === x.id)?.needed ?? 0) <= 1e-6) break
        }
      }
    }

    // ------------------------------------------------------------ the season's people: incidents, pay, Sundays, pickers

    // Days of machine work on the list, and whether any of it is planting or the harvest.
    function machineWaiting(c: Campaign): { days: number; rush: boolean } {
      let days = 0, rush = false
      for (const j of c.season!.jobs) {
        if (!MACHINE_JOBS.includes(j.kind)) continue
        days += Math.max(0, j.need - j.done)
        if (j.kind === 'plant' || j.kind === 'dig' || j.kind === 'haul') rush = true
      }
      return { days, rush }
    }

    function answerIncidents(world: World, c: Campaign): void {
      if (!F.incidents) return
      const s = c.season!
      for (const inc of [...c.incidents]) {
        let choice = ''
        if (inc.kind === 'applicant' && inc.applicant) {
          // Someone fills a role that is short this season, if they are better than the hall.
          const a = inc.applicant
          const r = roleOf(a)
          const have = hired(c).filter(p => (roles.get(p.id) ?? roleOf(p)) === r).length
          const hall = r === 'driver' ? fitValue(S.OPERATOR_SKILLS, '', S.OPERATOR_WAGE, r) : fitValue(S.HAND_SKILLS, '', S.HAND_WAGE, r)
          if (have < wantRoles[r] && fitValue(a.skills, a.trait, a.ask, r) >= hall && !S.hireRoom(c) && s.day < S.dayIndex(c.year, 9, 1)) choice = 'hire'
        } else if (inc.kind === 'poach' && F.raises) {
          const p = S.peopleInfo(c).find(x => x.id === inc.unit)
          if (p && p.mood < S.POACH_MOOD && s.day < S.dayIndex(c.year, 9, 15)) choice = 'match'
        } else if (inc.kind === 'breakdown') {
          const w = machineWaiting(c)
          if (w.rush && w.days >= k.rushFrom) choice = 'rush'
        } else if (inc.kind === 'buyer' && inc.lot !== undefined) {
          const l = c.lots.find(x => x.id === inc.lot)
          if (l && l.open && !S.contractInfo(c).some(x => !x.settled && x.needed > 0 && x.variety === l.variety)) {
            const v = S.variety(l.variety)
            const frac = Math.max(0, Math.min(1, (s.day - 212) / 92))
            const quote = S.basePrice(world, c, l.variety) / v.price
            const level = levelFrom(v, quote, seasonIndex(s.day), frac)
            const best = Math.max(...cellarValues(l, c.upgrades.vent, digTotal.get(l.id) ?? S.lotCwt(l) + l.sold, level, 0, true))
            if (!cfg.store || quote * (1 + S.BUYER_PREMIUM) >= best) choice = 'take'
          }
        }
        if (!choice) continue
        const r = S.apply(world, c, { t: 'answer', incident: inc.id, choice })
        if (r.ok && choice === 'hire') {
          const u = c.crew[c.crew.length - 1]
          const role = roleOf(u)
          roles.set(u.id, role)
          setPriorities(world, c, u.id, role)
        }
      }
    }

    // Someone about to quit gets a raise, up to half again what they asked.
    function minPay(world: World, c: Campaign): void {
      if (!F.raises) return
      for (const p of hired(c)) {
        if (p.mood >= S.QUIT_MOOD + 0.08 || p.wage >= p.ask * 1.5) continue
        S.apply(world, c, { t: 'raise', unit: p.id, wage: Math.min(Math.round(p.ask * 1.5), Math.round(p.wage * 1.1 + 10)) })
      }
    }

    function sundays(world: World, c: Campaign, d: number, info: FieldInfo[]): void {
      let off = true
      if (F.sundays === 'work') off = false
      else if (F.sundays === 'choose') {
        const tired = Math.max(...S.peopleInfo(c).map(p => p.tired))
        const planting = info.filter(f => f.status === 'idle').length >= 2 && d >= S.dayIndex(c.year, 4, 15)
        const harvest = d >= S.dayIndex(c.year, 8, 20) && info.some(f => f.status === 'dead' || f.status === 'digging' || (f.status === 'dug' && !f.weighed))
        off = !((planting || harvest) && tired < k.sundayTired)
      }
      if (c.sundaysOff !== off) S.apply(world, c, { t: 'sundays', off })
    }

    function pickers(world: World, c: Campaign, info: FieldInfo[]): void {
      if (!F.pickers) return
      const on = S.labourInfo(c).pickers.on
      const digging = info.some(f => f.status === 'digging' || (f.status === 'dead' && f.skin >= 1) || queued(c, 'dig', f.index))
      if (!on && digging && S.pickersWindow(c)) S.apply(world, c, { t: 'pickers', on: true })
      else if (on && !digging) S.apply(world, c, { t: 'pickers', on: false })
    }

    // ------------------------------------------------------------ winter

    function winterPlan(world: World, c: Campaign): void {
      const people = S.peopleInfo(c)
      const set = (id: number, work: 'off' | 'woods' | 'pack' | 'build', field = -1) => {
        const p = people.find(x => x.id === id)!
        if (p.winter === work && (work !== 'woods' || p.winterField === field)) return true
        return S.apply(world, c, { t: 'winter', unit: id, work, field: work === 'woods' ? field : undefined }).ok
      }
      if (!F.winter || yearsLeft(c) <= 1) { for (const p of people) set(p.id, 'off'); return }
      const tracts = F.clear ? TRACT_ORDER.filter(i => S.timberTracts(c).includes(i)) : []
      let buildLeft = S.buildingInfo(c).filter(b => b.state === 'building').reduce((a, b) => a + b.daysLeft, 0)
      let fellLeft = S.tractInfo(c).filter(t => tracts.includes(t.field)).reduce((a, t) => a + t.fellLeft, 0)
      const packing = built(c, 'packing') && S.unpacked(c) >= 1
      const months = Math.max(1, S.WINTER_MONTHS - c.month)
      // The farmer, unpaid: building first, then the woods, then packing.
      const farmer = people.find(p => p.kind === 'farmer')!
      const fDays = S.FARMER_WINTER_DAYS * months
      if (buildLeft > 0 && set(0, 'build')) buildLeft -= fDays * farmer.speed.build
      else if (tracts.length && set(0, 'woods', tracts[0])) fellLeft -= fDays * farmer.speed.woods
      else if (packing && set(0, 'pack')) { /* packing */ }
      else set(0, 'off')
      // Hired people, paid: kept on while there is building or felling to do, or packing that pays its wage.
      const price = (S.variety('caribou').price + S.variety('katahdin').price) / 2
      const packGain = (S.PACK_NO1 * 0.85 + (S.PACK_B - S.GRADE_PRICE.b) * 0.15) * price - S.PACK_CHARGE
      for (const p of [...people].filter(x => x.kind !== 'farmer' && !x.foreman).sort((a, b) => b.skills.build + b.skills.woods - a.skills.build - a.skills.woods)) {
        if (p.trait === 'homebody') { set(p.id, 'off'); continue }
        const days = S.WINTER_DAYS * months
        if (buildLeft > 2 && set(p.id, 'build')) { buildLeft -= days * p.speed.build; continue }
        if (fellLeft > 4 && tracts.length && set(p.id, 'woods', tracts[tracts.length > 1 ? 1 : 0])) { fellLeft -= days * p.speed.woods; continue }
        if (packing && packGain * S.PACK_PER_DAY * S.WINTER_DAYS * p.speed.pack > p.pay && set(p.id, 'pack')) continue
        set(p.id, 'off')
      }
    }

    // Machinery from cash, only when the spring's plan still fits the loan afterwards.
    function machinery(world: World, c: Campaign, n: number): void {
      const fits = (cost: number) => c.cash - cost >= 0 && c.cash - S.planCosts(c).total - cost >= k.loanFloor + 10000 && yearEndCash(c) - cost >= k.yearEndSafety
      if (yearsLeft(c) >= k.tractor.left && built(c, 'shed')) {
        const want = tractorsFor(c, n)
        if (want >= 2 && !c.upgrades.tractor2 && fits(S.UPGRADES.tractor2.cost)) S.apply(world, c, { t: 'buy', upgrade: 'tractor2' })
        if (want >= 3 && c.upgrades.tractor2 && !c.upgrades.tractor3 && fits(S.UPGRADES.tractor3.cost)) S.apply(world, c, { t: 'buy', upgrade: 'tractor3' })
      }
      if (truckFor(n) && !c.upgrades.truck && yearsLeft(c) >= 3 && fits(S.UPGRADES.truck.cost)) S.apply(world, c, { t: 'buy', upgrade: 'truck' })
    }

    // ------------------------------------------------------------ the bot

    return {
      plan(world, c) {
        fm = []
        for (let i = 0; i < S.FIELD_COUNT; i++) fm.push(blankField())
        sev = []; lastDay = -1; blightOnFarm = false; handWaterings = 0
        yearSeen = c.year
        const left = horizon(c)
        const reserve = () => c.cash - S.planCosts(c).total
        if (cfg.equipment) {
          for (const b of k.buy) {
            if (!c.upgrades[b.id] && yearsLeft(c) >= b.left && c.cash - S.UPGRADES[b.id].cost >= 0 && reserve() - S.UPGRADES[b.id].cost >= k.loanFloor) S.apply(world, c, { t: 'buy', upgrade: b.id })
          }
        }
        // The tracts: stumps pulled on what was felled, Burnt Hill and the back lot bought to clear.
        if (F.clear && yearsLeft(c) >= 3) {
          for (const t of S.tractInfo(c)) {
            if (t.tenure !== 'none' && t.stage === 'stump' && !t.works && !t.stumpWhy && c.cash - S.STUMP_FEE >= 0 && reserve() - S.STUMP_FEE >= k.loanFloor + 10000) {
              S.apply(world, c, { t: 'stump', field: t.field })
            }
          }
          for (const t of S.tractInfo(c)) {
            if (t.tenure !== 'none' || yearsLeft(c) < 4 || (Array.isArray(cfg.land) && !cfg.land.includes(t.block))) continue
            const owned = S.tractInfo(c).filter(x => x.tenure !== 'none' && (x.cover === 'woods' || x.cover === 'brush')).length
            if (owned > 0) continue
            if (c.cash - t.price >= 0 && reserve() - t.price >= k.loanFloor + 20000 && S.apply(world, c, { t: 'buyLand', field: t.field }).ok && !F.mortgage) {
              S.apply(world, c, { t: 'payMortgage', amount: S.mortgageOwed(c) })
            }
          }
        }
        // Tile under the farm's own bottom land, while it pays back.
        if (F.tile && yearsLeft(c) >= 4) {
          for (const f of infos(c)) {
            if (f.elev !== 0 || f.tenure !== 'owned' || f.tiled || f.works) continue
            if (c.cash - S.TILE_FEE >= 0 && reserve() - S.TILE_FEE >= k.loanFloor + 20000) S.apply(world, c, { t: 'tile', field: f.index })
          }
        }
        let homePotato = 0
        for (let i = 0; i < S.HOME_FIELDS; i++) {
          const f = S.fieldInfo(c, i)
          if (!cfg.rotation || bestFirstCrop(f.vert, f.soil, left) === 'potato') homePotato++
        }
        // The machinery the farm already works for comes before more land.
        machinery(world, c, Math.max(lastPotato, homePotato))
        takeLand(world, c, homePotato)
        const stock = new Map<VarietyId, number>()
        for (const x of c.seedStock) stock.set(x.variety, (stock.get(x.variety) ?? 0) + x.fields)
        const potato: { i: number; elev: number; v: VarietyId }[] = []
        for (const f of infos(c)) {
          // New ground rests its first year.
          const crop = f.raw ? 'rest' : landMove.get(f.index) ?? (cfg.rotation ? bestFirstCrop(f.vert, f.soil, left) : 'potato')
          if (crop === 'rest') { setPlan(world, c, f.index, { crop: 'rest', variety: 'katahdin', seed: 'certified' }); continue }
          potato.push({ i: f.index, elev: f.elev, v: defaultVariety(c, f.elev) })
        }
        // Keep the farm from swinging between all potatoes and all rest: the fields that give up least by growing
        // potatoes now are planted until half the farm is in potatoes.
        if (cfg.rotation) {
          const resting = infos(c).filter(f => !f.raw && !potato.some(p => p.i === f.index) && f.tenure === 'owned')
            .map(f => ({ f, cost: rotationCost(f.vert, f.soil, left) })).sort((a, b) => a.cost - b.cost)
          for (const r of resting) {
            if (potato.length >= infos(c).length * k.potatoShare || r.cost > k.flipLoss) break
            potato.push({ i: r.f.index, elev: r.f.elev, v: defaultVariety(c, r.f.elev) })
          }
        }
        signContracts(world, c, potato)
        for (const p of potato) {
          const have = stock.get(p.v) ?? 0
          let saved = have > 0 && (cfg.seed === 'always' || useSaved(p.v))
          if (saved && setPlan(world, c, p.i, { crop: 'potato', variety: p.v, seed: 'saved' })) stock.set(p.v, have - 1)
          else { saved = false; setPlan(world, c, p.i, { crop: 'potato', variety: p.v, seed: 'certified' }) }
          fm[p.i].certified = !saved
        }
        // Machinery and people for the bigger of this season and the last, so a rest year does not cost the crew.
        const n = Math.max(potato.length, lastPotato)
        lastPotato = potato.length
        machinery(world, c, n)
        manPeople(world, c, n)
        sellSpareLogs(world, c)
        orderBuildings(world, c)
        // Keep the spring loan within bounds: give back the rented field worth least, then rest the potato field
        // worth least.
        for (let guard = 0; guard < S.FIELD_COUNT && reserve() < k.loanFloor; guard++) {
          const rented = infos(c).filter(f => f.tenure === 'rented')
          if (!Array.isArray(cfg.land) && rented.length) {
            S.apply(world, c, { t: 'release', field: rented.sort((a, b) => heldNet(c, a.index) - heldNet(c, b.index))[0].index })
            continue
          }
          const worst = infos(c).filter(f => f.crop === 'potato').sort((a, b) => fieldValue(a.vert, a.soil) - fieldValue(b.vert, b.soil))[0]
          if (!worst) break
          setPlan(world, c, worst.index, { crop: 'rest', variety: 'katahdin', seed: 'certified' })
        }
        lastOverflow = 0
      },

      day(world, c, events) {
        const s = c.season!
        if (yearSeen !== c.year) return
        for (const e of events) absorb(e)
        if (s.day === lastDay) return
        lastDay = s.day
        const t = S.today(world, c)!
        const fc = S.forecast(world, c, 5)
        sev.push(t.severity)
        if (sev.length > 7) sev.shift()
        const d = s.day
        const at = (mo: number, dom: number) => S.dayIndex(c.year, mo, dom)
        const want: { kind: JobKind; field: number; pri: number }[] = []
        const add = (kind: JobKind, field: number, pri: number) => want.push({ kind, field, pri })
        const frostSoon = fc.slice(0, 3).some(x => x.frostChance >= 40)
        const rainSoon = fc.slice(0, k.rainDays).some(x => x.rainChance >= k.rainChance && x.rainMm >= k.rainMm)
        const watch = s.watchDay >= 0
        const reel = c.upgrades.reel
        const info = infos(c)
        lateOrder = info.filter(f => f.crop === 'potato' && !isEarly(c, f.index)).sort((a, b) => a.elev - b.elev || a.index - b.index).map(f => f.index)
        const drivers = hired(c).filter(p => p.prio.machine > 0 && !p.foreman).length
        diggers = Math.max(1, Math.min(S.tractorsOwned(c) + (c.upgrades.truck ? 1 : 0), drivers + 1))
        answerIncidents(world, c)
        minPay(world, c)
        sundays(world, c, d, info)
        pickers(world, c, info)

        for (const f of info) {
          const i = f.index
          const m = fm[i]
          const early = isEarly(c, i)
          // Rocks come off when no crop is in: before planting on a very stony field, in a rest year, after the dig.
          if (F.rocks && !f.works && !queued(c, 'rocks', i)) {
            const bare = f.status === 'rest' || (f.status === 'dug' && f.weighed) || f.status === 'off'
            if ((bare && f.stones >= (f.raw || f.status === 'off' ? 0.35 : k.rocksAt)) || (f.status === 'idle' && f.stones >= k.rocksSpring)) add('rocks', i, f.status === 'idle' ? 66 : 25)
          }
          if (F.brush && k.brushElev.includes(f.elev) && f.brushed === 0 && f.status !== 'off' && !queued(c, 'brush', i)) add('brush', i, 15)
          if (f.status === 'idle') {
            const soilT = t.soilT + S.SOIL_T_OFFSET[f.elev]
            const ready = cfg.calendar
              ? d >= at(4, 12 + (2 - f.elev) * 3)
              : d >= at(4, 3) && soilT >= k.plantSoilT && !f.tooWet && !(soilT < k.plantWetT && fc.slice(0, 2).some(x => x.rainMm >= k.plantRainMm && x.rainChance >= 60))
            if (ready) add('plant', i, 70 + f.elev + (early ? 3 : 0))
            continue
          }
          if (f.status === 'growing') {
            if (f.estimate) m.est.push({ day: d, mean: f.estimate.mean, digs: f.estimate.digs })
            const up = f.canopy > 0
            if (cfg.hill && up) {
              if (cfg.calendar) {
                if (f.hillPasses === 0 && d >= m.plant + 30) add('hill', i, 60)
                else if (f.hillPasses === 1 && d >= m.plant + 44) add('hill', i, 60)
              } else if ((f.hillPasses === 0 && f.canopy >= 0.06) || (f.hillPasses === 1 && f.canopy >= 0.38)) add('hill', i, 62 + f.canopy * 10)
            }
            if (cfg.scout && up && (watch || blightOnFarm || !m.certified)) {
              const every = cfg.calendar ? 7 : blightOnFarm ? k.scoutFound : k.scoutEvery
              if (f.scoutAge < 0 || f.scoutAge >= every) add('scout', i, 50)
            }
            if (cfg.scout && f.blightHills > 0 && f.blightHills <= k.rogueMax) add('rogue', i, 79)
            if (cfg.spray && up && !queued(c, 'kill', i)) {
              const since = m.lastSpray < 0 ? 99 : d - m.lastSpray
              if (cfg.calendar) {
                if (d >= at(6, 1) && since >= 7) add('spray', i, 75)
              } else if (watch) {
                // Only in a bad blight year, ahead of a bad blight day (on this field's own risk with a weather
                // station), or where there is too much to pull.
                const risk = f.blightRisk ?? t.severity
                const bad = s.sv >= k.spraySv && (risk >= 2 || fc[0].blight >= 2 || fc[1].blight >= 2)
                const tooMany = f.blightHills > k.rogueMax
                if ((bad && f.protect < k.sprayProtect) || (tooMany && f.protect < k.sprayProtectFound)) add('spray', i, 80)
              }
            }
            if (cfg.water && m.ti >= 0 && m.mature < 0) {
              const scabWindow = d - m.ti <= 35
              const pond = (f.block === 'home' || f.block === 'brook') && S.pondInfo(world, c).waterings >= 1
              const cheap = reel || pond
              const below = cheap ? (scabWindow ? k.waterScab : k.waterLate) : (scabWindow ? k.waterScabHand : k.waterLateHand)
              if (cfg.calendar) {
                if (d === at(6, 25)) add('water', i, 40)
              } else if (f.moisture < below && !rainSoon) add('water', i, 40 + (1 - f.moisture) * 10)
            }
            const sampleDue = m.ti >= 0 && (cfg.calendar ? m.samples.length === 0 && d >= at(7, 5)
              : m.samples.length < 1 && (early ? d - m.ti >= k.sampleEarly : d >= killDue(c, f, m) + k.sampleAt))
            if (cfg.sample && sampleDue) add('sample', i, 30)
            if (m.ti >= 0) {
              if (early) {
                if (wantEarlyDig(world, c, f, m, d)) add('dig', i, 88)
              } else if (cfg.kill && wantKill(world, c, f, m, d, frostSoon)) add('kill', i, 85)
              else if (!cfg.kill && d >= at(8, 15)) add('dig', i, 86 - f.elev)
            }
          }
          if (f.status === 'dead') {
            if (cfg.calendar) {
              if (d >= at(8, 12)) add('dig', i, 90 - f.elev)
            } else if (f.skin >= 1 || early || (d >= at(8, 28) && frostSoon) || d >= at(9, 8)) add('dig', i, 90 - f.elev + (frostSoon ? 3 : 0))
          }
        }

        for (const w of want) if (!queued(c, w.kind, w.field)) job(world, c, w.kind, w.field)
        // Spraying and watering that are no longer called for come off the list.
        for (const j of [...s.jobs]) {
          if (j.done === 0 && (j.kind === 'water' || j.kind === 'spray') && !want.some(w => w.kind === j.kind && w.field === j.field)) {
            S.apply(world, c, { t: 'cancel', id: j.id })
          }
        }
        // Most urgent first: bump from the least urgent up. The crop in the barrels comes in first, before frost.
        const pri = (j: { id: number; kind: JobKind; field: number; done: number }) =>
          j.kind === 'haul' ? (F.haul === 'prompt' ? 96 : 3) : j.kind === 'build' ? 20 : j.done > 0 ? 95 : want.find(w => w.kind === j.kind && w.field === j.field)?.pri ?? 10
        const order = [...s.jobs].sort((a, b) => pri(a) - pri(b) || b.id - a.id)
        for (const j of order) S.apply(world, c, { t: 'bump', id: j.id })
        sellInSeason(world, c)
      },

      cellar(world, c) {
        if (c.month === 0 && cfg.store) holdSeed(world, c)
        deliver(world, c, false)
        for (const l of S.openLots(c)) {
          if (!cfg.store || l.broke) { sellAll(world, c, l); continue }
          const v = S.variety(l.variety)
          const level = levelFrom(v, S.basePrice(world, c, l.variety) / v.price, S.MONTH_CURVE[c.month], 1)
          const vals = cellarValues(l, c.upgrades.vent, digTotal.get(l.id) ?? S.lotCwt(l) + l.sold, level, c.month)
          let best = c.month
          for (let m = c.month + 1; m < vals.length; m++) if (vals[m] > vals[best]) best = m
          if (best === c.month) sellAll(world, c, l)
        }
        // Buildings are ordered over the winter as the crop is sold, for those kept on to put up.
        if (yearsLeft(c) > 1) orderBuildings(world, c)
        winterPlan(world, c)
      },
    }
  }
}

// ---------------------------------------------------------------- the line-up

// A mechanic and the expert without it (or, for a mechanic the expert does not use, with it).
export interface Ablation { name: string; mechanic: string; cfg: Partial<ExpertCfg>; farm?: Partial<Farmstead>; uses?: 'variant'; group: 'farmstead' | 'farm' | 'verb' }

const noBuild = (kind: BuildingKind): Partial<Farmstead> => ({ build: { ...FARMSTEAD.build, [kind]: false } })

export const ABLATIONS: Ablation[] = [
  { name: 'no-applicants', mechanic: 'hiring from the applicants', cfg: {}, farm: { applicants: false }, group: 'farmstead' },
  { name: 'no-priorities', mechanic: 'work priorities', cfg: {}, farm: { priorities: false }, group: 'farmstead' },
  { name: 'with-foreman', mechanic: 'a foreman', cfg: {}, farm: { foreman: true }, uses: 'variant', group: 'farmstead' },
  { name: 'no-raises', mechanic: 'raises and matching offers', cfg: {}, farm: { raises: false }, group: 'farmstead' },
  { name: 'no-bunkhouse', mechanic: 'the bunkhouse', cfg: {}, farm: noBuild('bunk'), group: 'farmstead' },
  { name: 'work-sundays', mechanic: 'Sundays off (never)', cfg: {}, farm: { sundays: 'work' }, group: 'farmstead' },
  { name: 'all-sundays-off', mechanic: 'working Sundays (never)', cfg: {}, farm: { sundays: 'off' }, group: 'farmstead' },
  { name: 'no-pickers', mechanic: 'harvest pickers', cfg: {}, farm: { pickers: false }, group: 'farmstead' },
  { name: 'no-clearing', mechanic: 'clearing tracts', cfg: {}, farm: { clear: false }, group: 'farmstead' },
  { name: 'no-rocks', mechanic: 'picking rocks', cfg: {}, farm: { rocks: false }, group: 'farmstead' },
  { name: 'no-brush', mechanic: 'cutting brush', cfg: {}, farm: { brush: false }, group: 'farmstead' },
  { name: 'no-tile', mechanic: 'tile drains', cfg: {}, farm: { tile: false }, group: 'farmstead' },
  { name: 'no-mortgage', mechanic: 'the land mortgage', cfg: {}, farm: { mortgage: false }, group: 'farmstead' },
  ...ALL_BUILDINGS.filter(b => b !== 'bunk').map(b => ({ name: `no-${b}`, mechanic: `the ${S.BUILDINGS[b].name.toLowerCase()}`, cfg: {}, farm: noBuild(b), group: 'farmstead' as const })),
  { name: 'no-truck', mechanic: 'the truck', cfg: {}, farm: { truck: false }, group: 'farmstead' },
  { name: 'no-tractor3', mechanic: 'the third tractor', cfg: {}, farm: { tractor3: false }, group: 'farmstead' },
  { name: 'haul-late', mechanic: 'hauling before frost', cfg: {}, farm: { haul: 'late' }, group: 'farmstead' },
  { name: 'no-winter', mechanic: 'winter work', cfg: {}, farm: { winter: false }, group: 'farmstead' },
  { name: 'default-incidents', mechanic: 'answering incidents', cfg: {}, farm: { incidents: false }, group: 'farmstead' },
  { name: 'no-expansion', mechanic: 'land beyond the home six', cfg: { land: [] }, group: 'farm' },
  { name: 'no-hire', mechanic: 'hired people', cfg: { hire: false }, group: 'farm' },
  { name: 'no-contracts', mechanic: 'contracts', cfg: { contracts: 'none' }, group: 'farm' },
  { name: 'no-tractor2', mechanic: 'the second tractor', cfg: { tractor2: false }, group: 'farm' },
  { name: 'no-hill', mechanic: 'hilling', cfg: { hill: false }, group: 'verb' },
  { name: 'no-scout', mechanic: 'scouting and roguing', cfg: { scout: false }, group: 'verb' },
  { name: 'no-spray', mechanic: 'spraying', cfg: { spray: false }, group: 'verb' },
  { name: 'no-water', mechanic: 'watering', cfg: { water: false }, group: 'verb' },
  { name: 'no-sample', mechanic: 'test digs', cfg: { sample: false }, group: 'verb' },
  { name: 'no-kill', mechanic: 'vine kill', cfg: { kill: false }, group: 'verb' },
  { name: 'no-store', mechanic: 'storage', cfg: { store: false }, group: 'verb' },
  { name: 'no-rotation', mechanic: 'rotation', cfg: { rotation: false }, group: 'verb' },
]

// The expert holding the home farm and one block of land every year, against the expert on the home farm alone.
export const BLOCK_BOTS: { name: string; block: BlockId }[] = [
  { name: 'with-brook', block: 'brook' }, { name: 'with-ridge', block: 'ridge' }, { name: 'with-dufour', block: 'dufour' },
]

// Fixed plans for the no-dominant-plan gate: building orders, hiring rules and farm rules.
export const ORDERS: { name: string; order: BuildingKind[] }[] = [
  { name: 'order-cheap', order: ['stand', 'station', 'road', 'bunk', 'shed', 'pond', 'house', 'packing'] },
  { name: 'order-store', order: ['house', 'packing', 'stand', 'shed', 'bunk', 'station', 'road', 'pond'] },
  { name: 'order-people', order: ['bunk', 'shed', 'stand', 'station', 'house', 'road', 'pond', 'packing'] },
  { name: 'order-water', order: ['pond', 'station', 'shed', 'stand', 'bunk', 'house', 'road', 'packing'] },
]
export const HIRES: { name: string; hire: Farmstead['hire'] }[] = [
  { name: 'hire-machine', hire: 'machine' }, { name: 'hire-field', hire: 'field' }, { name: 'hire-cheap', hire: 'cheap' },
]

export interface Entry {
  name: string; make: BotFactory
  group: 'main' | 'ablation' | 'variety' | 'block' | 'order' | 'hire' | 'contracts' | 'calendar'
  variety?: VarietyId
}

export function expertWith(cfg: Partial<ExpertCfg>, farm: Partial<Farmstead> = {}, years = EXPERT.years): ExpertCfg {
  return { ...EXPERT, ...cfg, years, farm: { ...FARMSTEAD, ...(cfg.farm ?? {}), ...farm }, tune: { ...TUNING, ...(cfg.tune ?? {}) } }
}

export function lineup(years = EXPERT.years): Entry[] {
  const out: Entry[] = [
    { name: 'naive', make: naive(), group: 'main' },
    { name: 'reference', make: reference(), group: 'main' },
    { name: 'expert', make: expert(expertWith({}, {}, years)), group: 'main' },
  ]
  for (const a of ABLATIONS) out.push({ name: a.name, make: expert(expertWith(a.cfg, a.farm ?? {}, years)), group: 'ablation' })
  for (const v of S.VARIETIES) out.push({ name: `only-${v.id}`, make: expert(expertWith({ variety: v.id }, {}, years)), group: 'variety', variety: v.id })
  for (const b of BLOCK_BOTS) out.push({ name: b.name, make: expert(expertWith({ land: [b.block] }, {}, years)), group: 'block' })
  for (const o of ORDERS) out.push({ name: o.name, make: expert(expertWith({}, { order: o.order }, years)), group: 'order' })
  for (const h of HIRES) out.push({ name: h.name, make: expert(expertWith({}, { hire: h.hire }, years)), group: 'hire' })
  out.push({ name: 'all-contracts', make: expert(expertWith({ contracts: 'all' }, {}, years)), group: 'contracts' })
  out.push({ name: 'calendar', make: expert(expertWith({ calendar: true }, {}, years)), group: 'calendar' })
  return out
}

// A single-variety bot plays a campaign only if its variety was out by the first spring.
export function canPlay(e: Entry, startYear: number): boolean {
  return !e.variety || S.variety(e.variety).released <= startYear
}
