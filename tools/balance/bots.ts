// Bots that play The County from what a player can see: the view and advice functions, the market
// quote, the public campaign fields and the events the game reports. tests/bots.test.ts checks this file
// for the names of hidden state.
import * as S from '../../src/sim/index.ts'
import type {
  BlockId, Campaign, CrewInfo, FieldInfo, FieldPlan, GameEvent, JobKind, Lot, UpgradeId, VarietyId, World,
} from '../../src/sim/index.ts'

export interface Bot {
  plan(world: World, c: Campaign): void
  day(world: World, c: Campaign, events: GameEvent[]): void
  cellar(world: World, c: Campaign): void
}

export type BotFactory = () => Bot

export interface Outcome {
  bot: string
  startYear: number
  seed: number
  kept: boolean
  years: number
  cash: number
  netWorth: number
  yields: number[]           // marketable cwt per potato acre at the dig, by season
  revenue: number[]
  blightPeak: number[]       // from the year-end ledger
  potatoFields: number[]
  held: number[]             // fields the farm held, by season
  hands: number[]            // most field hands on the crew at once, by season
  operator: number[]         // 1 in a season the tractor operator worked
  wages: number              // over the campaign, from the year-end ledgers
  rent: number
  land: number
  contracts: number
  penalties: number
  signed: number             // contracts signed
  jobs: Record<JobKind, number>
  upgrades: UpgradeId[]
}

function blankJobs(): Record<JobKind, number> {
  return { plant: 0, hill: 0, scout: 0, spray: 0, water: 0, rogue: 0, sample: 0, kill: 0, dig: 0, fell: 0, rocks: 0, brush: 0, build: 0, haul: 0 }
}

const DONE_EVENT: Record<string, JobKind> = {
  planted: 'plant', hilled: 'hill', scout: 'scout', sprayed: 'spray', watered: 'water',
  rogued: 'rogue', sample: 'sample', killed: 'kill', dug: 'dig',
}

// Plays one campaign to the goal (or to foreclosure) and reports what happened. watch sees every day's events.
export function play(world: World, name: string, make: BotFactory, startYear: number, seed: number, goal = S.GOAL_YEARS,
  watch?: (c: Campaign, events: GameEvent[]) => void): Outcome {
  const c = S.createCampaign(world, { seed, startYear })
  const bot = make()
  const jobs = blankJobs()
  const yields: number[] = []
  const potatoFields: number[] = []
  const held: number[] = []
  const hands: number[] = []
  const operator: number[] = []
  let signed = 0
  let events: GameEvent[] = []
  let guard = 0
  while (guard++ < 20000) {
    if (c.phase === 'plan') {
      bot.plan(world, c)
      let r = S.apply(world, c, { t: 'begin' })
      // The bank would not lend: rest potato fields from the far end of the list up until it will.
      for (let i = S.FIELD_COUNT - 1; !r.ok && i >= 0; i--) {
        if (S.held(c, i) && c.plans[i].crop === 'potato') S.apply(world, c, { t: 'plan', field: i, plan: { crop: 'rest', variety: c.plans[i].variety, seed: 'certified' } })
        r = S.apply(world, c, { t: 'begin' })
      }
      if (!r.ok) throw new Error(`${name}: cannot begin ${c.year}: ${r.err}`)
      events = []
      let n = 0
      for (let i = 0; i < S.FIELD_COUNT; i++) if (S.isField(c, i)) n++
      held.push(n)
      hands.push(0)
      operator.push(0)
      signed += S.contractInfo(c).length
    } else if (c.phase === 'season') {
      bot.day(world, c, events)
      if (c.phase !== 'season') continue
      const crew = S.crewInfo(c)
      const h = crew.filter(u => u.kind === 'hand').length
      if (h > hands[hands.length - 1]) hands[hands.length - 1] = h
      if (crew.some(u => u.kind === 'operator')) operator[operator.length - 1] = 1
      if (S.seasonDone(c)) {
        let cwt = 0
        for (const l of c.lots) if (l.year === c.year) cwt += S.lotCwt(l) + l.sold
        let n = 0
        for (let i = 0; i < S.FIELD_COUNT; i++) if (S.held(c, i) && c.plans[i].crop === 'potato') n++
        yields.push(n ? cwt / (n * S.FIELD_ACRES) : 0)
        potatoFields.push(n)
        S.apply(world, c, { t: 'endSeason' })
      } else {
        events = S.apply(world, c, { t: 'day' }).events
        for (const e of events) { const k = DONE_EVENT[e.type]; if (k) jobs[k]++ }
        watch?.(c, events)
      }
    } else if (c.phase === 'cellar') {
      bot.cellar(world, c)
      S.apply(world, c, { t: 'month' })
    } else if (c.phase === 'ledger') {
      if (c.outcome === 'lost' || c.history.length >= goal) break
      S.apply(world, c, { t: 'next' })
    } else break
  }
  const total = (pick: (h: Campaign['history'][number]) => number) => Math.round(c.history.reduce((a, h) => a + pick(h), 0))
  return {
    bot: name, startYear, seed,
    kept: c.outcome !== 'lost' && c.history.length >= goal,
    years: c.history.length,
    cash: Math.round(c.cash),
    netWorth: S.netWorth(c),
    yields, revenue: c.history.map(h => Math.round(h.revenue)), blightPeak: c.history.map(h => h.blightPeak), potatoFields,
    held, hands, operator,
    wages: total(h => h.wages), rent: total(h => h.rent), land: total(h => h.land), contracts: total(h => h.contracts), penalties: total(h => h.penalties),
    signed, jobs,
    upgrades: (Object.keys(c.upgrades) as UpgradeId[]).filter(u => c.upgrades[u]),
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

// The fields the farm holds this year.
function infos(c: Campaign): FieldInfo[] {
  const out: FieldInfo[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const f = S.fieldInfo(c, i)
    if (f.tenure !== 'none') out.push(f)
  }
  return out
}

function sellAll(world: World, c: Campaign, l: Lot): void {
  S.apply(world, c, { t: 'sell', lot: l.id, frac: 1 })
}

// Everything is in: each field is resting, dug or lost (or not the farm's), or the ground has frozen.
function allIn(c: Campaign): boolean {
  if (c.season?.frozen) return true
  return infos(c).every(f => f.status === 'rest' || f.status === 'dug' || f.status === 'lost' || f.status === 'off')
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
      for (const l of S.openLots(c)) if (S.fieldInfo(c, l.field).status === 'dug') sellAll(world, c, l)
    },
    cellar() { /* everything was sold at the dig */ },
  })
}

// ---------------------------------------------------------------- reference

// Follows the in-game advice as given on the home farm the game starts with, keeps the default plans, stores the
// crop and sells it in one month. For validation runs, skip leaves some advice undone and waterBelow adds watering
// at a soil-moisture trigger.
export function reference(sellMonth = 4, skip: JobKind[] = [], waterBelow = 0): BotFactory {
  return () => ({
    plan() { /* default plans, no land, crew, contracts or equipment */ },
    day(world, c) {
      for (const a of S.advise(world, c)) {
        if (a.act === 'wait' || a.act === 'close') continue
        if (a.act === 'sell') S.apply(world, c, { t: 'sell', lot: a.lot, frac: 1 })
        else if (!skip.includes(a.act)) job(world, c, a.act, a.field)
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

export interface ExpertCfg {
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
  hire: boolean             // field hands and the tractor operator
  contracts: 'choose' | 'none' | 'all'
  tractor2: boolean
  house2: boolean
  pin: 'off' | 'far' | 'home'   // machine work on the far land is the operator's, or on the home farm the farmer's
  tune: Tuning
}

// The expert's thresholds, set by trial runs over the tournament years (docs/balance/README.md).
export interface Tuning {
  sprayMode: 'noblight' | 'forecast' | 'severe' | 'hybrid' | 'found'
  spraySv: number           // season severity values before a blight day calls for a spray
  sprayProtect: number      // spray when the protectant left is below this and blight weather is due
  sprayProtectFound: number // the same once blight has been found on the farm
  scoutEvery: number
  scoutFound: number
  rogueMax: number
  sampleAt: number          // first test dig, days after tuber set
  sampleEarly: number       // the same for an early variety grown for the early market
  sampleHills: number       // hills lifted, one a day
  plantSoilT: number
  plantField: boolean       // read the planting temperature for each field's position on the slope
  plantWetT: number         // below this soil temperature, hold off when heavy rain is forecast
  plantRainMm: number
  killFrom: number          // first late vine kill, days after August 1
  killGap: number           // days between late fields, for one crew digging
  killAfterMature: number   // days after the vines start going down
  killValue: number         // kill once the crop's value grows by less than this share a day (0: off)
  killDelay: number         // days the late kill waits while the crop is still gaining value fast
  delayValue: number        // the value growth a day that counts as fast
  buy: { id: UpgradeId; from: number; left: number }[]   // equipment, from a year, with this many seasons left
  reserve: number           // cash kept after buying equipment
  waterScab: number         // water below this moisture in the scab window after tuber set
  waterLate: number
  waterScabHand: number     // the same without the irrigation reel, when watering takes a whole day
  waterLateHand: number
  rainDays: number          // watering waits when the forecast for this many days calls for rain this likely and heavy
  rainChance: number
  rainMm: number
  earlyMarket: VarietyId[]  // varieties dug green and sold off the field before the new-potato market closes
  earlyValue: number        // early market: dig once the crop's value at today's price grows by less than this a day
  earlyBy: number           // and in any case by this many days after August 1
  earlyDate: number         // without a test dig: dig this many days after August 1
  fieldRevenue: number      // what a healthy potato field brings in, for the rotation plan
  plan: { from: number; byElev: VarietyId[][] }[]   // varieties by preference on bottom land, mid slope and ridge, from a year on
  landValue: Partial<Record<BlockId, number>>   // what a healthy field of each block nets in a potato season before rent, crews included
  landMargin: number        // rents a field when its plan for the seasons left is worth more than this
  loanFloor: number         // the spring plan takes cash no lower than this
  buyLand: number           // buys a field it holds outright when the cash left after it and the spring's planting is at least this
  hands: { from: number; per: number }   // a field hand once more than `from` fields are being walked, another for each `per` more
  opFields: number          // the operator for the spring, once the second tractor is there, for this many potato fields or more
  op: { hire: number; keep: number; water: number }   // in season: hires the operator when the machine work due within a
                            // month is more than `hire` days or the watering waiting is `water` days, and keeps him another
                            // month when the work due is more than `keep`
  tractor: { fields: number; left: number; reserve: number }   // the second tractor: potato fields, seasons left, cash kept
  house: { left: number; over: number; reserve: number }       // the second potato house: seasons left, cwt the crop overflows storage by, cash kept
  contractGain: number      // signs a contract when it is worth this much more than growing for the open market
  no1Share: number          // share of the marketable crop that is US No. 1 and large, for sizing contracts
  contractSafety: number    // plants for this share of the usual crop when filling a contract
  // What the expert has learned to expect of each variety: marketable cwt an acre, and the share of its listed price a
  // hundredweight fetches sold the usual way (at the dig or from the cellar). Rules of thumb from its own play.
  yieldAcre: Record<VarietyId, number>
  realized: Record<VarietyId, number>
}


export const TUNING: Tuning = {
  sprayMode: 'severe', spraySv: 30, sprayProtect: 0.3, sprayProtectFound: 0.5, scoutEvery: 4, scoutFound: 5, rogueMax: 2,
  sampleAt: -3, sampleEarly: 20, sampleHills: 1, plantSoilT: 8, plantField: true, plantWetT: 11, plantRainMm: 15, killFrom: 40, killGap: 4, killAfterMature: 15,
  killValue: 0, killDelay: 14, delayValue: 0.004,
  buy: [{ id: 'vent', from: 0, left: 2 }, { id: 'reel', from: 2015, left: 3 }], reserve: 0,
  waterScab: 0.65, waterLate: 0.6, waterScabHand: 0.75, waterLateHand: 0.65, rainDays: 2, rainChance: 60, rainMm: 12,
  earlyMarket: ['norland'], earlyValue: 0, earlyBy: 25, earlyDate: 12, fieldRevenue: 25000,
  plan: [
    { from: 0, byElev: [['gold', 'kennebec'], ['gold', 'kennebec'], ['katahdin']] },
    { from: 2015, byElev: [['caribou'], ['caribou'], ['caribou']] },
  ],
  landValue: { ridge: 10000, brook: 6000, dufour: 7500 }, landMargin: 0,
  loanFloor: -75000, buyLand: -75000,
  hands: { from: 5, per: 5 }, opFields: 9, op: { hire: 24, keep: -Infinity, water: Infinity },
  tractor: { fields: 9, left: 2, reserve: 0 },
  house: { left: 2, over: 3000, reserve: 20000 },
  contractGain: 0, no1Share: 0.8, contractSafety: 0.85,
  yieldAcre: { norland: 251, superior: 287, katahdin: 325, kennebec: 337, burbank: 337, atlantic: 350, gold: 290, caribou: 371 },
  realized: { norland: 1.05, superior: 0.95, katahdin: 0.95, kennebec: 0.95, burbank: 0.97, atlantic: S.PROCESSING_PRICE, gold: 0.95, caribou: 0.92 },
}

export const EXPERT: ExpertCfg = {
  hill: true, scout: true, spray: true, water: true, sample: true, kill: true, store: true,
  rotation: true, seed: 'auto', equipment: true, variety: null, calendar: false,
  land: 'auto', hire: true, contracts: 'choose', tractor2: true, house2: false, pin: 'off', tune: TUNING,
}

const MACHINE: JobKind[] = ['plant', 'hill', 'spray', 'water', 'kill', 'dig']
// The land beyond the home farm, the far end first.
const FAR: BlockId[] = ['dufour', 'ridge', 'brook']
const BLOCK_FIELDS: Record<BlockId, number[]> = { home: [], brook: [], ridge: [], dufour: [] }
S.PARCELS.forEach((p, i) => BLOCK_FIELDS[p.block].push(i))
// Where on the slope each variety does best, when a contract asks for more of it.
const SLOPE_PREF: Record<VarietyId, number[]> = {
  atlantic: [0, 1, 2], kennebec: [0, 1, 2], gold: [1, 0, 2], caribou: [1, 2, 0],
  katahdin: [2, 1, 0], burbank: [2, 1, 0], superior: [2, 1, 0], norland: [2, 1, 0],
}

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

// NoBlight (UMaine 2418, Table 2): the longest safe spray interval from the last week's severity values and rain.
export function noBlightInterval(sv7: number, rain7mm: number): number {
  const wet = rain7mm >= 30
  if (wet ? sv7 >= 5 : sv7 >= 6) return 5
  if (wet ? sv7 >= 4 : sv7 >= 5) return 7
  if (wet ? sv7 > 3 : sv7 > 4) return 10
  return 14
}

// The chipping variety off contract fetches only the processing price, which moves a quarter as far as the market.
const OPEN = (v: ReturnType<typeof S.variety>) => v.contract ? S.PROCESSING_PRICE : 1

// What a lot is worth in the cellar month by month (0 = November), as a share of its variety's average No. 1
// price, from the public storage rules: the price through the winter at the level the quote shows now (the
// chipping variety's processing price is one price all winter), shrink and the cellar charge from the day of the
// dig, sprouting once the lot has been out of the ground longer than its dormancy in a cool cellar, and rot started
// by the blighted tubers that showed on the picking table. In season the time from the dig to November is still to
// be paid.
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

export function expert(cfg: ExpertCfg = EXPERT): BotFactory {
  const k = cfg.tune
  return () => {
    let fm: FieldMem[] = []
    let sev: number[] = []
    let rain: number[] = []
    let lastDay = -1
    let yearSeen = -1
    let blightOnFarm = false
    let opSide = new Set<BlockId>()                 // blocks whose machine work goes to the operator
    let opPaidTo = -1                               // the day the operator's next month of wages falls due
    const seedFrom = new Map<number, boolean>()     // lot id -> grown from certified seed
    const digTotal = new Map<number, number>()      // lot id -> marketable cwt when dug

    const yearsLeft = (c: Campaign) => c.goalYears - c.yearIdx

    // Expected net for a potato field from its soil and wilt, by the rules of thumb a grower carries.
    function fieldValue(vert: number, soil: number): number {
      const yf = (1 - 0.45 * vert) * (1 - 0.07 * (1 - soil)) * (1 - 0.06 * (1 - soil))
      return k.fieldRevenue * yf - (S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT + 1300)
    }

    function bestFirstCrop(vert: number, soil: number, years: number): 'potato' | 'rest' {
      let best = -Infinity, first: 'potato' | 'rest' = 'potato'
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
        if (total > best) { best = total; first = (mask & 1) === 0 ? 'potato' : 'rest' }
      }
      return first
    }

    function defaultVariety(c: Campaign, elev: number): VarietyId {
      if (cfg.variety) return cfg.variety
      const have = new Set(S.availableVarieties(c.year).map(v => v.id))
      let rows = k.plan[0].byElev
      for (const p of k.plan) if (p.from <= c.year) rows = p.byElev
      return rows[elev].find(id => have.has(id)) ?? 'katahdin'
    }

    // What a field of a variety is worth sold on the open market, by the expert's rules of thumb.
    const openValue = (id: VarietyId) => k.yieldAcre[id] * S.FIELD_ACRES * S.variety(id).price * k.realized[id]

    const useSaved = (v: VarietyId) => S.variety(v).virus <= 0.5
    const isEarly = (c: Campaign, i: number) => k.earlyMarket.includes(c.plans[i].variety)

    function absorb(e: GameEvent): void {
      if (e.field < 0) return
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
      // How the price of a gram moves with the tubers' size, taken over a wide step so grade edges do not jump.
      const e = Math.log(sizeValue(mean * 1.1, large, hollow) / sizeValue(mean / 1.1, large, hollow)) / Math.log(1.21)
      return (1 + g) ** (1 + e) - 1
    }

    // Late fields are killed in turn, bottom land first (it frosts first), so the diggers can follow two weeks on.
    let lateOrder: number[] = []
    function lateRank(i: number): number {
      return Math.max(0, lateOrder.indexOf(i))
    }

    // The day the vines are due to be killed by the calendar: some days after they start going down, or in turn,
    // closer together when two crews dig.
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
      if (vg !== null && k.killValue > 0 && d >= at(7, 15) && vg < k.killValue) return true
      const due = killDue(c, f, m)
      if (d >= due) {
        // The crop is still gaining value fast: give it a few more days if no frost is coming.
        if (vg !== null && k.killDelay > 0 && vg >= k.delayValue && d < due + k.killDelay && !frostSoon) return false
        return true
      }
      if (frostSoon && d >= at(8, 5)) return true
      return false
    }

    // Early market: the crop gains weight while the new-potato premium falls; dig when the value stops rising.
    function wantEarlyDig(world: World, c: Campaign, f: FieldInfo, m: FieldMem, d: number): boolean {
      const at = (mo: number, dom: number) => S.dayIndex(c.year, mo, dom)
      if (cfg.calendar) return d >= at(7, 20)
      if (d >= at(7, 1) + k.earlyBy) return true
      if (d < at(6, 10)) return false
      const vg = valueGrowth(world, c, f, m)
      if (vg !== null && k.earlyValue > -1) return (1 + vg) * seasonIndex(d + 1) / seasonIndex(d) - 1 < k.earlyValue
      return d >= at(7, 1) + k.earlyDate
    }

    // ------------------------------------------------------------ spring: land, contracts, plans, machinery, crew

    const PER_FIELD = S.FIELD_COST + S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT
    let landMove = new Map<number, 'potato' | 'rest'>()   // this year's crop on each field beyond the home six it holds

    // The next few seasons of a field the farm does not own: each year grow potatoes, rest it, or leave it to its
    // owner (its soil is then as it was), paying the rent in every year it is held. value is a potato season on a
    // healthy field of that block, before rent. Returns the best first move and what the whole plan is worth.
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

    // The land it holds this year beyond the home six. Chosen: each field whose plan for the seasons left beats
    // leaving it, best first, as far as the spring loan goes. Fixed (cfg.land a list): every field of those blocks.
    // It rents them, or buys a field outright when the cash left after the price and the spring's planting is at
    // least buyLand, and gives back rented land it no longer wants.
    function takeLand(world: World, c: Campaign, homePotato: number): void {
      const left = yearsLeft(c)
      landMove = new Map()
      let planting = homePotato * PER_FIELD
      const want = new Set<number>()
      const cost = (i: number, move: 'potato' | 'rest') => (move === 'potato' ? PER_FIELD : S.REST_COST) + (S.fieldInfo(c, i).tenure === 'owned' ? 0 : S.PARCELS[i].rent)
      const options: { i: number; move: 'potato' | 'rest'; worth: number }[] = []
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
          const lp = landPlan(f.vert, f.soil, k.landValue[b] ?? 0, S.PARCELS[i].rent, left)
          if (lp.first !== 'off' && lp.worth > k.landMargin) options.push({ i, move: cfg.rotation ? lp.first : 'potato', worth: lp.worth })
        }
      }
      for (const o of options.sort((a, b) => b.worth - a.worth)) {
        if (c.cash - planting - cost(o.i, o.move) < k.loanFloor) continue
        want.add(o.i); landMove.set(o.i, o.move); planting += cost(o.i, o.move)
      }
      for (const b of FAR) {
        for (const i of BLOCK_FIELDS[b]) {
          const tenure = S.fieldInfo(c, i).tenure
          if (!want.has(i)) { if (tenure === 'rented') S.apply(world, c, { t: 'release', field: i }); continue }
          if (tenure === 'owned') continue
          if (c.cash - S.PARCELS[i].price - planting >= k.buyLand && S.apply(world, c, { t: 'buyLand', field: i }).ok) {
            planting -= S.PARCELS[i].rent
            continue
          }
          if (tenure === 'none') S.apply(world, c, { t: 'rent', field: i })
        }
      }
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
          // The contract's price against the open market for what it takes, less what is given up on any field that
          // must switch to its variety.
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
      // Fields for each contracted variety beyond those that grow it anyway, on the slope it does best on.
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

    function hireCount(c: Campaign, kind: 'hand' | 'operator'): CrewInfo[] {
      return S.crewInfo(c).filter(u => u.kind === kind)
    }

    // The blocks the operator works: the far land, until it has about half the potato fields.
    function sideFor(c: Campaign): Set<BlockId> {
      const out = new Set<BlockId>()
      if (cfg.pin !== 'far' || !hireCount(c, 'operator').length) return out
      let total = 0
      const count = new Map<BlockId, number>()
      for (const f of infos(c)) if (f.crop === 'potato') { total++; count.set(f.block, (count.get(f.block) ?? 0) + 1) }
      let side = 0
      for (const b of FAR) {
        const n = count.get(b) ?? 0
        if (n > 0 && side + n <= total / 2 + 0.5) { out.add(b); side += n }
      }
      return out
    }

    function sellInSeason(world: World, c: Campaign): void {
      const s = c.season!
      const vent = c.upgrades.vent
      deliver(world, c, true)
      const keep: { l: Lot; value: number }[] = []
      for (const l of S.openLots(c)) {
        if (S.fieldInfo(c, l.field).status !== 'dug') continue
        if (!digTotal.has(l.id)) digTotal.set(l.id, S.lotCwt(l) + l.sold)
        const v = S.variety(l.variety)
        if (!cfg.store || (S.newPotatoWindow(c, l) && l.skinned > 0)) { sellAll(world, c, l); continue }
        const frac = Math.max(0, Math.min(1, (s.day - 212) / 92))
        const quote = S.basePrice(world, c, l.variety) / v.price
        const level = levelFrom(v, quote, seasonIndex(s.day), frac)
        const best = Math.max(...cellarValues(l, vent, digTotal.get(l.id)!, level, 0, true))
        if (quote >= best) { sellAll(world, c, l); continue }
        keep.push({ l, value: best / quote })
      }
      if (!allIn(c)) return
      // Everything is in: sell what the potato houses cannot hold, the poorest keepers first.
      const cap = S.cellarCapacity(c)
      let stored = keep.reduce((a, x) => a + S.lotCwt(x.l), 0)
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
          if (inSeason && S.fieldInfo(c, l.field).status !== 'dug') continue
          if (!S.apply(world, c, { t: 'deliver', lot: l.id, contract: x.id }).ok) continue
          if ((S.contractInfo(c).find(y => y.id === x.id)?.needed ?? 0) <= 1e-6) break
        }
      }
    }

    // Seed for next spring is kept back from this year's lots: as many fields of each variety as grew it.
    function holdSeed(world: World, c: Campaign): void {
      if (yearsLeft(c) <= 1) return
      const need = new Map<VarietyId, number>()
      c.plans.forEach((p, i) => { if (S.held(c, i) && p.crop === 'potato') need.set(p.variety, (need.get(p.variety) ?? 0) + 1) })
      if (cfg.seed === 'always') {
        // Saved seed for every field next year, from whatever lots there are.
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

    // Hires field hands for the walking while there is more of it than the farmer can keep up with, and lets the
    // crew go once its work is done.
    // Days of machine work due on the farm within about a month: planting, hilling, the kill and the dig with its
    // haul, and the spraying and watering on the list.
    function machineAhead(c: Campaign, info: FieldInfo[], d: number): number {
      let w = 0
      for (const f of info) {
        const m = fm[f.index]
        const dig = S.jobDays(c, 'dig', null, f.index)
        if (f.status === 'idle') w += 1
        else if (f.status === 'planted' || f.status === 'growing') {
          if (f.canopy < S.CLOSURE) w += (2 - f.hillPasses) * 0.5
          if (m.ti >= 0 && (isEarly(c, f.index) || killDue(c, f, m) - d <= 30)) w += 0.25 + dig
        } else if (f.status === 'dead') w += dig
        else if (f.status === 'digging') w += dig / 2
      }
      for (const j of c.season!.jobs) if (j.kind === 'spray' || j.kind === 'water') w += j.need - j.done
      return w
    }

    // Hires field hands for the walking while there is more of it than the farmer can keep up with; hires the
    // operator when a month's machine work is more than the farmer can do, and lets him go when his month is up
    // and the work is not there.
    function manageCrew(world: World, c: Campaign, info: FieldInfo[], walked: number): void {
      if (!cfg.hire) return
      const hands = hireCount(c, 'hand')
      const want = walked > k.hands.from ? Math.min(S.MAX_HANDS, 1 + Math.floor((walked - k.hands.from - 1) / k.hands.per)) : 0
      if (hands.length < want) S.apply(world, c, { t: 'hire', kind: 'hand' })
      else if (hands.length > want) S.apply(world, c, { t: 'dismiss', unit: hands[hands.length - 1].id })
      if (!c.upgrades.tractor2) return
      const d = c.season!.day
      const op = hireCount(c, 'operator')
      const ahead = machineAhead(c, info, d)
      let watering = 0
      for (const j of c.season!.jobs) if (j.kind === 'water') watering += j.need - j.done
      if (!op.length) {
        if ((ahead > k.op.hire || watering >= k.op.water) && S.apply(world, c, { t: 'hire', kind: 'operator' }).ok) opPaidTo = d + S.WAGE_DAYS
      } else if (d >= opPaidTo) {
        if (ahead > k.op.keep) opPaidTo += S.WAGE_DAYS
        else S.apply(world, c, { t: 'dismiss', unit: op[0].id })
      }
    }

    return {
      plan(world, c) {
        fm = []
        for (let i = 0; i < S.FIELD_COUNT; i++) fm.push(blankField())
        sev = []; rain = []; lastDay = -1; blightOnFarm = false
        yearSeen = c.year
        const left = yearsLeft(c)
        if (cfg.equipment) {
          for (const b of k.buy) {
            if (!c.upgrades[b.id] && c.year >= b.from && left >= b.left && c.cash - S.UPGRADES[b.id].cost >= k.reserve) S.apply(world, c, { t: 'buy', upgrade: b.id })
          }
        }
        let homePotato = 0
        for (let i = 0; i < S.HOME_FIELDS; i++) {
          const f = S.fieldInfo(c, i)
          if (!cfg.rotation || bestFirstCrop(f.vert, f.soil, left) === 'potato') homePotato++
        }
        takeLand(world, c, homePotato)
        const stock = new Map<VarietyId, number>()
        for (const x of c.seedStock) stock.set(x.variety, (stock.get(x.variety) ?? 0) + x.fields)
        const potato: { i: number; elev: number; v: VarietyId }[] = []
        for (const f of infos(c)) {
          const crop = landMove.get(f.index) ?? (cfg.rotation ? bestFirstCrop(f.vert, f.soil, left) : 'potato')
          if (crop === 'rest') { setPlan(world, c, f.index, { crop: 'rest', variety: 'katahdin', seed: 'certified' }); continue }
          potato.push({ i: f.index, elev: f.elev, v: defaultVariety(c, f.elev) })
        }
        signContracts(world, c, potato)
        for (const p of potato) {
          const have = stock.get(p.v) ?? 0
          let saved = have > 0 && (cfg.seed === 'always' || useSaved(p.v))
          if (saved && setPlan(world, c, p.i, { crop: 'potato', variety: p.v, seed: 'saved' })) stock.set(p.v, have - 1)
          else { saved = false; setPlan(world, c, p.i, { crop: 'potato', variety: p.v, seed: 'certified' }) }
          fm[p.i].certified = !saved
        }
        // Machinery and the crew for the land it holds.
        const n = potato.length
        // Bought from cash, so only when the spring's plan still fits the loan afterwards.
        const fits = (cost: number) => c.cash - cost - S.planCosts(c).total - (cfg.hire && n >= k.opFields ? S.OPERATOR_WAGE : 0) >= k.loanFloor
        if (cfg.tractor2 && cfg.hire && !c.upgrades.tractor2 && n >= k.tractor.fields && left >= k.tractor.left &&
          c.cash - S.UPGRADES.tractor2.cost >= k.tractor.reserve && fits(S.UPGRADES.tractor2.cost)) {
          S.apply(world, c, { t: 'buy', upgrade: 'tractor2' })
        }
        if (cfg.house2 && !c.upgrades.house2 && left >= k.house.left && c.cash - S.UPGRADES.house2.cost >= k.house.reserve && fits(S.UPGRADES.house2.cost)) {
          const crop = potato.reduce((a, p) => a + k.yieldAcre[p.v] * S.FIELD_ACRES, 0)
          if (crop - S.cellarCapacity(c) >= k.house.over) S.apply(world, c, { t: 'buy', upgrade: 'house2' })
        }
        for (const u of hireCount(c, 'hand')) S.apply(world, c, { t: 'dismiss', unit: u.id })
        const op = hireCount(c, 'operator')
        const wantOp = cfg.hire && c.upgrades.tractor2 && n >= k.opFields
        if (wantOp && !op.length) S.apply(world, c, { t: 'hire', kind: 'operator' })
        else if (!wantOp) for (const u of op) S.apply(world, c, { t: 'dismiss', unit: u.id })
        opPaidTo = S.dayIndex(c.year, S.SEASON_START.month, S.SEASON_START.dom) + S.WAGE_DAYS
        // Keep the spring loan within bounds: give back the rented block worth least, then rest the potato field
        // worth least.
        for (let guard = 0; guard < S.FIELD_COUNT && c.cash - S.planCosts(c).total < k.loanFloor; guard++) {
          const rented = infos(c).filter(f => f.tenure === 'rented')
          if (!Array.isArray(cfg.land) && rented.length) {
            S.apply(world, c, { t: 'release', field: rented.sort((a, b) => heldNet(c, a.index) - heldNet(c, b.index))[0].index })
            continue
          }
          const worst = infos(c).filter(f => f.crop === 'potato').sort((a, b) => fieldValue(a.vert, a.soil) - fieldValue(b.vert, b.soil))[0]
          if (!worst) break
          setPlan(world, c, worst.index, { crop: 'rest', variety: 'katahdin', seed: 'certified' })
        }
      },

      day(world, c, events) {
        const s = c.season!
        if (yearSeen !== c.year) return
        for (const e of events) absorb(e)
        if (s.day === lastDay) return
        lastDay = s.day
        const t = S.today(world, c)!
        const fc = S.forecast(world, c, 5)
        sev.push(t.severity); rain.push(t.day.prcp)
        if (sev.length > 7) { sev.shift(); rain.shift() }
        const sv7 = sev.reduce((a, x) => a + x, 0)
        const rain7 = rain.reduce((a, x) => a + x, 0)
        const d = s.day
        const at = (mo: number, dom: number) => S.dayIndex(c.year, mo, dom)
        const want: { kind: JobKind; field: number; pri: number }[] = []
        const add = (kind: JobKind, field: number, pri: number) => want.push({ kind, field, pri })
        const blightSoon = fc.slice(0, 3).some(x => x.blight >= 2)
        const frostSoon = fc.slice(0, 3).some(x => x.frostChance >= 40)
        const rainSoon = fc.slice(0, k.rainDays).some(x => x.rainChance >= k.rainChance && x.rainMm >= k.rainMm)
        const watch = s.watchDay >= 0
        const reel = c.upgrades.reel
        const info = infos(c)
        lateOrder = info.filter(f => f.crop === 'potato' && !isEarly(c, f.index)).sort((a, b) => a.elev - b.elev || a.index - b.index).map(f => f.index)
        diggers = 1 + hireCount(c, 'operator').length
        const walked = info.filter(f => f.status === 'growing' && f.canopy > 0 && (watch || blightOnFarm || !fm[f.index].certified)).length
        manageCrew(world, c, info, walked)
        opSide = sideFor(c)

        for (const f of info) {
          const i = f.index
          const m = fm[i]
          const early = isEarly(c, i)
          if (f.status === 'idle') {
            // The ridge warms a degree ahead of the station reading and the bottom land a degree behind.
            const soilT = t.soilT + (k.plantField ? S.SOIL_T_OFFSET[f.elev] : 0)
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
              } else if (k.sprayMode === 'noblight') {
                if (watch || blightOnFarm || (s.sv >= 12 && blightSoon)) {
                  const gap = blightOnFarm ? 5 : noBlightInterval(sv7, rain7)
                  const thin = f.protect < (blightOnFarm ? k.sprayProtectFound : blightSoon ? 0.35 : k.sprayProtect)
                  if (since >= gap || thin) add('spray', i, blightOnFarm || blightSoon ? 80 : 72)
                }
              } else if (k.sprayMode === 'forecast') {
                if (watch || blightOnFarm) {
                  // Protectant only matters on a blight day: keep it on the leaf when one is due.
                  const due = t.severity >= 1 || fc[0].blight >= 1 || (blightOnFarm && fc.slice(0, 3).some(x => x.blight >= 1))
                  if (due && f.protect < (blightOnFarm ? k.sprayProtectFound : k.sprayProtect)) add('spray', i, 80)
                }
              } else if (k.sprayMode === 'hybrid') {
                // In a bad blight year only, on the NoBlight interval, and early ahead of a bad blight day.
                if (watch && s.sv >= k.spraySv) {
                  const gap = noBlightInterval(sv7, rain7)
                  const badDay = t.severity >= 2 || fc[0].blight >= 2 || fc[1].blight >= 2
                  if ((since >= gap && f.protect < 0.5) || (badDay && f.protect < k.sprayProtect)) add('spray', i, 80)
                } else if (watch && f.blightHills > k.rogueMax && f.protect < k.sprayProtectFound) add('spray', i, 80)
              } else if (k.sprayMode === 'found') {
                // Once blight is on the farm, ahead of any blight day; before that only in a bad year, ahead of a bad day.
                const due = t.severity >= 1 || fc[0].blight >= 1 || fc[1].blight >= 1
                const bad = watch && s.sv >= k.spraySv && (t.severity >= 2 || fc[0].blight >= 2 || fc[1].blight >= 2)
                if ((blightOnFarm && due && f.protect < k.sprayProtectFound) || (bad && f.protect < k.sprayProtect)) add('spray', i, 80)
              } else if (watch) {
                // Only in a bad blight year, ahead of a bad blight day, or where there is too much to pull.
                const bad = s.sv >= k.spraySv && (t.severity >= 2 || fc[0].blight >= 2 || fc[1].blight >= 2)
                const tooMany = f.blightHills > k.rogueMax
                if ((bad && f.protect < k.sprayProtect) || (tooMany && f.protect < k.sprayProtectFound)) add('spray', i, 80)
              }
            }
            if (cfg.water && m.ti >= 0 && m.mature < 0) {
              const scabWindow = d - m.ti <= 35
              const below = reel ? (scabWindow ? k.waterScab : k.waterLate) : (scabWindow ? k.waterScabHand : k.waterLateHand)
              if (cfg.calendar) {
                if (d === at(6, 25)) add('water', i, 40)
              } else if (f.moisture < below && !rainSoon) add('water', i, 40 + (1 - f.moisture) * 10)
            }
            // A negative sampleAt digs that many days before the vines are due to be killed.
            const sampleDue = m.ti >= 0 && (cfg.calendar ? m.samples.length === 0 && d >= at(7, 5)
              : m.samples.length < k.sampleHills && (early ? d - m.ti >= k.sampleEarly : k.sampleAt >= 0 ? d - m.ti >= k.sampleAt : d >= killDue(c, f, m) + k.sampleAt))
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

        // Machine work on the operator's side of the farm is his; hands walk wherever they are needed.
        const crew = S.crewInfo(c)
        const opId = crew.find(u => u.kind === 'operator')?.id ?? -1
        const pinFor = (kind: JobKind, field: number) => opId < 0 || !MACHINE.includes(kind) ? -1
          : cfg.pin === 'far' ? (opSide.has(S.PARCELS[field].block) ? opId : -1)
            : cfg.pin === 'home' && field < S.HOME_FIELDS ? 0 : -1
        for (const w of want) {
          const unit = pinFor(w.kind, w.field)
          const j = s.jobs.find(x => x.kind === w.kind && x.field === w.field)
          if (!j) job(world, c, w.kind, w.field, unit)
          else if (j.unit !== unit && j.done === 0) S.apply(world, c, { t: 'assign', id: j.id, unit })
        }
        // Spraying and watering that are no longer called for come off the list.
        for (const j of [...s.jobs]) {
          if (j.done === 0 && (j.kind === 'water' || j.kind === 'spray') && !want.some(w => w.kind === j.kind && w.field === j.field)) {
            S.apply(world, c, { t: 'cancel', id: j.id })
          }
        }
        // Most urgent first: bump from the least urgent up.
        const pri = (j: { id: number; kind: JobKind; field: number; done: number }) =>
          j.done > 0 ? 95 : want.find(w => w.kind === j.kind && w.field === j.field)?.pri ?? 10
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
          // The quote now, over the usual price for the month, is the level the rest of the winter starts from.
          const level = levelFrom(v, S.basePrice(world, c, l.variety) / v.price, S.MONTH_CURVE[c.month], 1)
          const vals = cellarValues(l, c.upgrades.vent, digTotal.get(l.id) ?? S.lotCwt(l) + l.sold, level, c.month)
          let best = c.month
          for (let m = c.month + 1; m < vals.length; m++) if (vals[m] > vals[best]) best = m
          if (best === c.month) sellAll(world, c, l)
        }
      },
    }
  }
}

// ---------------------------------------------------------------- the line-up

export const ABLATIONS: { name: string; verb: string; cfg: Partial<ExpertCfg> }[] = [
  { name: 'no-hill', verb: 'hilling', cfg: { hill: false } },
  { name: 'no-scout', verb: 'scouting and roguing', cfg: { scout: false } },
  { name: 'no-spray', verb: 'spraying', cfg: { spray: false } },
  { name: 'no-water', verb: 'watering', cfg: { water: false } },
  { name: 'no-sample', verb: 'test digs', cfg: { sample: false } },
  { name: 'no-kill', verb: 'vine kill', cfg: { kill: false } },
  { name: 'no-store', verb: 'storage', cfg: { store: false } },
  { name: 'no-rotation', verb: 'rotation', cfg: { rotation: false } },
  { name: 'saved-seed', verb: 'seed choice', cfg: { seed: 'always' } },
  { name: 'no-equipment', verb: 'equipment', cfg: { equipment: false } },
  { name: 'no-expansion', verb: 'land beyond the home six', cfg: { land: [] } },
  { name: 'no-hire', verb: 'hired crews', cfg: { hire: false } },
  { name: 'no-contracts', verb: 'contracts', cfg: { contracts: 'none' } },
  { name: 'no-tractor2', verb: 'the second tractor', cfg: { tractor2: false } },
]

// The expert holding the home farm and one block of land every year, against the expert on the home farm alone.
export const BLOCK_BOTS: { name: string; block: BlockId }[] = [
  { name: 'with-brook', block: 'brook' }, { name: 'with-ridge', block: 'ridge' }, { name: 'with-dufour', block: 'dufour' },
]

export interface Entry { name: string; make: BotFactory; group: 'main' | 'ablation' | 'variety' | 'calendar' | 'block' | 'contracts'; variety?: VarietyId }

export function lineup(): Entry[] {
  const out: Entry[] = [
    { name: 'naive', make: naive(), group: 'main' },
    { name: 'reference', make: reference(), group: 'main' },
    { name: 'expert', make: expert(), group: 'main' },
  ]
  for (const a of ABLATIONS) out.push({ name: a.name, make: expert({ ...EXPERT, ...a.cfg }), group: 'ablation' })
  for (const v of S.VARIETIES) out.push({ name: `only-${v.id}`, make: expert({ ...EXPERT, variety: v.id }), group: 'variety', variety: v.id })
  out.push({ name: 'calendar', make: expert({ ...EXPERT, calendar: true }), group: 'calendar' })
  for (const b of BLOCK_BOTS) out.push({ name: b.name, make: expert({ ...EXPERT, land: [b.block] }), group: 'block' })
  out.push({ name: 'all-contracts', make: expert({ ...EXPERT, contracts: 'all' }), group: 'contracts' })
  return out
}

// A single-variety bot plays a campaign only if its variety was out by the first spring.
export function canPlay(e: Entry, startYear: number): boolean {
  return !e.variety || S.variety(e.variety).released <= startYear
}
