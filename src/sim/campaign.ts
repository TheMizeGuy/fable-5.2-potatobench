// The campaign: planning, the season, the cellar and the year-end ledger, all driven through apply().
import { lotCwt } from './harvest.ts'
import { sellLot } from './market.ts'
import * as P from './params.ts'
import { hash32 } from './rng.ts'
import { addJob, FIELD_NAMES, seasonDone, startSeason, stepDay } from './season.ts'
import type { Campaign, Cmd, FieldPlan, GameEvent, Lot, Result, UpgradeId, World, YearSummary } from './types.ts'
import { variety } from './varieties.ts'
import { withCommas } from './calendar.ts'
import { finishLot } from './harvest.ts'
import { hasYear } from './weather.ts'

const START_STREAK = [0, 2, 1, 3, 0, 1]
const START_VERT = [0.03, 0.1, 0.05, 0.22, 0.03, 0.08]
const ELEV: (0 | 1 | 2)[] = [2, 2, 1, 1, 0, 0]

export function lastStartYear(world: World): number {
  const ys = world.weather.playable
  return ys[ys.length - 1] - (P.GOAL_YEARS - 1)
}

export function startYears(world: World): number[] {
  const ys = world.weather.playable
  return ys.filter(y => {
    for (let k = 0; k < P.GOAL_YEARS; k++) if (!ys.includes(y + k)) return false
    return true
  })
}

export function defaultPlans(c: Campaign): FieldPlan[] {
  return c.fields.map(f => ({ crop: f.streak >= 2 ? 'rest' : 'potato', variety: 'katahdin', seed: 'certified' } as FieldPlan))
}

export function createCampaign(world: World, opts: { seed: number; startYear: number }): Campaign {
  if (!hasYear(world, opts.startYear)) throw new Error(`no weather for ${opts.startYear}`)
  const c: Campaign = {
    v: P.SAVE_VERSION,
    seed: opts.seed | 0,
    rng: hash32(opts.seed, opts.startYear, 77),
    startYear: opts.startYear, year: opts.startYear, yearIdx: 0, goalYears: P.GOAL_YEARS,
    phase: 'plan', outcome: '',
    cash: P.START_CASH,
    fields: ELEV.map((elev, i) => ({ elev, soil: Math.max(0, 1 - 0.5 * START_STREAK[i]), vert: START_VERT[i], streak: START_STREAK[i] })),
    plans: [],
    upgrades: { boom: false, harvester: false, vent: false, reel: false },
    seedStock: [], season: null, lots: [], nextLot: 1, month: 0,
    yearRevenue: 0, yearCosts: 0, history: [], steps: 0,
  }
  c.plans = defaultPlans(c)
  return c
}

export function planCost(c: Campaign): number {
  let cost = 0
  for (const p of c.plans) {
    if (p.crop === 'rest') cost += P.REST_COST
    else cost += P.FIELD_COST + (p.seed === 'certified' ? P.SEED_CWT_PER_FIELD * P.CERT_SEED_PER_CWT : 0)
  }
  return cost
}

function savedSeedShort(c: Campaign): string {
  const need: Record<string, number> = {}
  for (const p of c.plans) if (p.crop === 'potato' && p.seed === 'saved') need[p.variety] = (need[p.variety] ?? 0) + 1
  for (const id of Object.keys(need)) {
    const have = c.seedStock.filter(s => s.variety === id).reduce((a, s) => a + s.fields, 0)
    if (have < need[id]) return `Not enough saved ${variety(id as FieldPlan['variety']).name} seed: ${have} field${have === 1 ? '' : 's'} worth in the cellar.`
  }
  return ''
}

export function cellarCapacity(c: Campaign): number {
  return c.upgrades.vent ? P.CELLAR_CWT_VENT : P.CELLAR_CWT
}

export function openLots(c: Campaign): Lot[] {
  return c.lots.filter(l => l.open)
}

function ok(events: GameEvent[] = []): Result { return { ok: true, err: '', events } }
function fail(err: string): Result { return { ok: false, err, events: [] } }

function note(c: Campaign, type: string, level: GameEvent['level'], text: string, field = -1): GameEvent {
  const e: GameEvent = { day: c.season ? c.season.day : 0, type, field, text, level }
  if (c.season) c.season.log.push(e)
  return e
}

function endSeason(world: World, c: Campaign): GameEvent[] {
  const s = c.season!
  const out: GameEvent[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status === 'rest') {
      c.cash += P.REST_INCOME
      c.yearRevenue += P.REST_INCOME
    } else if (f.status !== 'dug' && f.status !== 'lost') {
      if (f.status === 'digging') {
        const lot = c.lots.find(l => l.id === f.lotId)
        if (lot) finishLot(c, f, lot)
      }
      f.status = f.status === 'digging' ? 'dug' : 'lost'
      if (f.status === 'lost') out.push(note(c, 'lost', 'bad', `${FIELD_NAMES[i]} was left in the ground.`, i))
    }
  }
  s.jobs = []
  // The cellar only holds so much: the overflow is sold off the field.
  const cap = cellarCapacity(c)
  let total = openLots(c).reduce((a, l) => a + lotCwt(l), 0)
  if (total > cap) {
    const lots = openLots(c).sort((a, b) => lotCwt(b) - lotCwt(a))
    for (const lot of lots) {
      if (total <= cap) break
      const have = lotCwt(lot)
      const frac = Math.min(1, (total - cap) / have)
      const money = sellLot(world, c, lot, frac)
      total -= have * frac
      out.push(note(c, 'overflow', 'warn', `No room in the cellar: ${withCommas(have * frac)} cwt of ${variety(lot.variety).name} sold off the field for $${withCommas(money)}.`, lot.field))
    }
  }
  c.phase = 'cellar'
  c.month = 0
  return out
}

function storeMonth(c: Campaign, out: GameEvent[]): void {
  const vent = c.upgrades.vent
  for (const lot of openLots(c)) {
    const v = variety(lot.variety)
    lot.months++
    let shrink = vent ? P.SHRINK_VENT : P.SHRINK
    if (lot.months === 1) shrink += 0.03 * (1 - lot.skin)
    if (!lot.sprouted && lot.months * 30 > v.dormancy + (vent ? 25 : 0)) {
      lot.sprouted = true
      out.push(note(c, 'sprout', 'warn', `The ${v.name} from ${FIELD_NAMES[lot.field]} has started to sprout.`, lot.field))
    }
    if (lot.sprouted) shrink += P.SPROUT_SHRINK
    let rotLoss = 0
    if (lot.rot > 0) {
      const grow = lot.rot * (vent ? P.ROT_GROW_VENT : P.ROT_GROW)
      rotLoss = Math.min(0.5, grow)
      lot.rot = Math.min(0.9, lot.rot + grow)
      if (!lot.broke && lot.rot >= P.ROT_BREAK) {
        lot.broke = true
        rotLoss = 0.55
        lot.rot = 0.06
        lot.seedHeld = 0
        out.push(note(c, 'breakdown', 'bad', `Rot has run through the ${v.name} from ${FIELD_NAMES[lot.field]}. More than half the pile is gone.`, lot.field))
      }
    }
    const keep = (1 - shrink) * (1 - rotLoss)
    const before = lotCwt(lot)
    const rent = Math.round(before * P.STORE_COST)
    c.cash -= rent
    c.yearCosts += rent
    lot.grades.no1 *= keep; lot.grades.chef *= keep; lot.grades.b *= keep; lot.grades.no2 *= keep; lot.skinned *= keep
    lot.loss.rot += before * (1 - shrink) * rotLoss
    if (lotCwt(lot) < 0.5) lot.open = false
  }
}

export function netWorth(c: Campaign): number {
  let w = c.cash
  for (const id of Object.keys(c.upgrades) as UpgradeId[]) if (c.upgrades[id]) w += P.UPGRADES[id].cost * 0.5
  return Math.round(w)
}

function closeYear(world: World, c: Campaign, out: GameEvent[]): void {
  const s = c.season!
  let interest = 0
  const lots = c.lots.filter(l => l.year === c.year)
  let potatoFields = 0, market = 0, culled = 0, peak = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (c.plans[i].crop === 'potato') potatoFields++
    if (f.sevPeak > peak) peak = f.sevPeak
  }
  for (const lot of lots) {
    market += lot.sold
    culled += lot.loss.green + lot.loss.blight + lot.loss.frost + lot.loss.rot + lot.loss.small
  }
  c.cash -= P.NOTE_PAYMENT + P.LIVING
  if (c.cash < 0) {
    interest = Math.round(-c.cash * P.CREDIT_RATE)
    c.cash -= interest
  }
  const sum: YearSummary = {
    year: c.year,
    cashStart: c.history.length ? c.history[c.history.length - 1].cashEnd : P.START_CASH,
    cashEnd: c.cash,
    revenue: c.yearRevenue, costs: c.yearCosts, note: P.NOTE_PAYMENT, living: P.LIVING, interest,
    cwtSold: market, cwtCulled: culled,
    yieldCwtAcre: potatoFields ? market / (potatoFields * P.FIELD_ACRES) : 0,
    potatoFields, blightPeak: peak, lots,
  }
  c.history.push(sum)

  // Seed held back comes out of the cellar as next year's stock.
  c.seedStock = []
  for (const lot of lots) {
    if (lot.seedHeld > 0 && !lot.broke) {
      c.seedStock.push({ variety: lot.variety, fields: lot.seedHeld, virus: lot.virus, blight: lot.blightSeed })
    }
  }
  // Soil remembers what grew.
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    const odds = fp.vert / (1 - fp.vert)
    if (c.plans[i].crop === 'potato') {
      fp.soil = Math.max(0, fp.soil + P.SOIL_AFTER_POTATO)
      fp.streak++
      const o = odds * P.VERT_GROW
      fp.vert = Math.min(0.95, o / (1 + o))
    } else {
      fp.soil = 1
      fp.streak = 0
      const o = odds * P.VERT_REST
      fp.vert = Math.max(0.01, o / (1 + o))
    }
  }
  c.phase = 'ledger'
  if (c.cash < P.CREDIT_LIMIT) {
    c.outcome = 'lost'
    out.push(note(c, 'lost', 'bad', 'The bank has called the note. The farm is sold at auction.'))
  } else if (c.outcome === '' && c.yearIdx + 1 >= c.goalYears) {
    c.outcome = 'kept'
    out.push(note(c, 'kept', 'good', `Five seasons, and the farm is still yours.`))
  }
}

function nextYear(world: World, c: Campaign): Result {
  if (c.outcome === 'lost') { c.phase = 'over'; return ok() }
  if (!world.weather.playable.includes(c.year + 1)) { c.phase = 'over'; return ok() }
  c.year++
  c.yearIdx++
  c.yearRevenue = 0
  c.yearCosts = 0
  c.month = 0
  c.season = null
  c.lots = []
  c.phase = 'plan'
  // Carry the plan forward with the rotation flipped where the soil asks for it, and drop seed that is not there.
  c.plans = c.plans.map((p, i) => {
    const fp = c.fields[i]
    const crop = p.crop === 'potato' && fp.streak >= 2 ? 'rest' : p.crop === 'rest' ? 'potato' : p.crop
    return { crop, variety: p.variety, seed: 'certified' } as FieldPlan
  })
  return ok()
}

export function apply(world: World, c: Campaign, cmd: Cmd): Result {
  switch (cmd.t) {
    case 'plan': {
      if (c.phase !== 'plan') return fail('Plans are made in spring.')
      if (cmd.field < 0 || cmd.field >= P.FIELD_COUNT) return fail('No such field.')
      const v = variety(cmd.plan.variety)
      if (cmd.plan.crop === 'potato' && v.released > c.year) return fail(`${v.name} was not released until ${v.released}.`)
      const before = c.plans[cmd.field]
      c.plans[cmd.field] = { crop: cmd.plan.crop, variety: cmd.plan.variety, seed: cmd.plan.seed }
      const short = savedSeedShort(c)
      if (short) { c.plans[cmd.field] = before; return fail(short) }
      return ok()
    }
    case 'buy': {
      if (c.phase !== 'plan') return fail('Equipment is bought in spring.')
      const u = P.UPGRADES[cmd.upgrade]
      if (!u) return fail('No such equipment.')
      if (c.upgrades[cmd.upgrade]) return fail('Already owned.')
      if (c.cash - u.cost < 0) return fail('Not enough cash. The bank will not lend for equipment.')
      c.cash -= u.cost
      c.yearCosts += u.cost
      c.upgrades[cmd.upgrade] = true
      return ok()
    }
    case 'begin': {
      if (c.phase !== 'plan') return fail('The season has already begun.')
      const short = savedSeedShort(c)
      if (short) return fail(short)
      const cost = planCost(c)
      if (c.cash - cost < P.OPERATING_LIMIT) return fail('The bank will not lend that much for the spring. Rest a field or use saved seed.')
      c.cash -= cost
      c.yearCosts += cost
      startSeason(world, c)
      c.phase = 'season'
      return ok()
    }
    case 'job': {
      const why = addJob(c, cmd.kind, cmd.field)
      return why ? fail(why) : ok()
    }
    case 'cancel': {
      if (c.phase !== 'season' || !c.season) return fail('No work list.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('No such job.')
      if (c.season.jobs[k].kind === 'dig' && c.season.jobs[k].done > 0) return fail('The digger is already in the field.')
      c.season.jobs.splice(k, 1)
      return ok()
    }
    case 'bump': {
      if (c.phase !== 'season' || !c.season) return fail('No work list.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('No such job.')
      const [job] = c.season.jobs.splice(k, 1)
      c.season.jobs.unshift(job)
      return ok()
    }
    case 'day': {
      if (c.phase !== 'season' || !c.season) return fail('The season is not under way.')
      if (c.season.frozen) return fail('The ground has frozen. Close out the season.')
      return ok(stepDay(world, c))
    }
    case 'endSeason': {
      if (c.phase !== 'season' || !c.season) return fail('The season is not under way.')
      return ok(endSeason(world, c))
    }
    case 'sell': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('Nothing to sell now.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      if (Number.isNaN(cmd.frac)) return fail('Say how much to sell.')
      if (c.phase === 'season' && c.season) {
        const f = c.season.fields[lot.field]
        if (f.status === 'digging') return fail('Still being dug.')
      }
      const money = sellLot(world, c, lot, cmd.frac)
      return ok([note(c, 'sold', 'good', `Sold ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]} for $${withCommas(money)}.`, lot.field)])
    }
    case 'seed': {
      if (c.phase !== 'cellar') return fail('Seed is held back from the cellar.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('That lot is gone.')
      const n = Math.floor(cmd.fields)
      if (!(n >= 1)) return fail('Hold back seed for at least one field.')
      const need = n * P.SEED_CWT_PER_FIELD
      const have = lot.grades.b + lot.grades.no1
      if (have < need) return fail(`Not enough sound tubers: enough for ${Math.floor(have / P.SEED_CWT_PER_FIELD)} ${Math.floor(have / P.SEED_CWT_PER_FIELD) === 1 ? 'field' : 'fields'} at most.`)
      const fromB = Math.min(lot.grades.b, need)
      lot.grades.b -= fromB
      lot.grades.no1 -= need - fromB
      lot.seedHeld += n
      if (lotCwt(lot) < 0.5) lot.open = false
      return ok()
    }
    case 'month': {
      if (c.phase !== 'cellar') return fail('The cellar is closed.')
      const out: GameEvent[] = []
      if (openLots(c).length === 0 || c.month >= P.MONTH_CURVE.length - 1) {
        for (const lot of openLots(c)) sellLot(world, c, lot, 1)
        closeYear(world, c, out)
        return ok(out)
      }
      storeMonth(c, out)
      c.month++
      return ok(out)
    }
    case 'next': {
      if (c.phase !== 'ledger') return fail('The year is not closed.')
      return nextYear(world, c)
    }
  }
}

export function canEndSeason(c: Campaign): boolean {
  return c.phase === 'season' && seasonDone(c)
}

