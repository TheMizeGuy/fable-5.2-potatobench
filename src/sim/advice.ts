// Reference practice: what a careful Aroostook grower would do next, from what the grower can see.
// The in-game coach shows it, and the reference bot follows it. It tends the fields the farm holds; it has nothing
// to say about land, hiring or contracts.
import { dayIndex, withCommas } from './calendar.ts'
import * as P from './params.ts'
import { willDo } from './people.ts'
import type { Campaign, GameEvent, JobKind, KillWhy, World } from './types.ts'
import { fieldInfo, forecast, today } from './view.ts'
import { openLots, sprayWayNow } from './campaign.ts'
import { newPotatoWindow } from './market.ts'
import { addJob, FIELD_NAMES, JOB_LABEL, letGo, seasonDone, standingBy, workday } from './season.ts'
import { hasBuilt } from './buildings.ts'
import { forecastFor } from './weather.ts'
import { plantReady } from './outlook.ts'

export interface Advice {
  id: string
  field: number                    // -1 when not about one field
  act: JobKind | 'wait' | 'sell' | 'close'
  lot: number                      // for 'sell'
  text: string                     // what to do
  why: string                      // the reason, in the grower's terms
  urgent: boolean
  kill?: KillWhy                   // for 'kill': why the vines should come off now
}


export function advise(world: World, c: Campaign): Advice[] {
  return withinReach(c, everything(world, c))
}

// Everything reference practice asks for now, before the cap on how much goes on the list at once.
export function asks(world: World, c: Campaign): Advice[] {
  return everything(world, c)
}

// The day the crew kills this field's vines by itself, or -1: only where the dig is the routine's and the kill the
// player's call, while the coach asks for it (all: what it asks now), the vines are up and the player has not kept
// them up. KILL_WAIT days after this run of asking began, and no later than leaves the skins two weeks to set before
// the green dig.
export function killByItself(c: Campaign, field: number, all: Advice[]): number {
  const s = c.season
  const f = s?.fields[field]
  if (!s || !f || f.keepVines || f.status !== 'growing' || f.deadDay >= 0) return -1
  if (standingBy(c, 'kill', field) || !standingBy(c, 'dig', field)) return -1
  if (!all.some(a => a.act === 'kill' && a.field === field)) return -1
  const since = f.killSince ?? s.day
  const latest = dayIndex(s.year, P.DIG_GREEN.month, P.DIG_GREEN.dom) - P.SKIN_DAYS
  return Math.max(since, Math.min(since + P.KILL_WAIT, latest))
}

// Each morning: the day the coach's present run of asking for a field's kill began, cleared when it stops asking.
function noteKillRun(c: Campaign, all: Advice[]): void {
  const s = c.season!
  s.fields.forEach((f, i) => {
    if (all.some(a => a.act === 'kill' && a.field === i)) f.killSince ??= s.day
    else if (!s.jobs.some(j => j.kind === 'kill' && j.field === i)) delete f.killSince
  })
}

// The first day reference practice asks for each field's vines to be killed, and why, kept on the field so the
// weigh ticket can tell a kill the season asked for from one ahead of it (outlook.ts, killTiming).
export function noteKillAsks(world: World, c: Campaign, all: Advice[] = everything(world, c)): void {
  const s = c.season
  if (!s) return
  for (const a of all) {
    if (a.act !== 'kill' || s.fields[a.field].killAsked !== undefined) continue
    s.fields[a.field].killAsked = s.day
    s.fields[a.field].killWhy = a.kill
  }
}

// Everything reference practice would do now, before the cap on what the crews can get round to.
function everything(world: World, c: Campaign): Advice[] {
  const s = c.season
  if (c.phase !== 'season' || !s) return []
  const out: Advice[] = []
  const t = today(world, c)!
  const fc = forecast(world, c, 5)
  const year = s.year
  const queued = (kind: JobKind, field: number) => s.jobs.some(j => j.kind === kind && j.field === field)
  const add = (field: number, act: Advice['act'], text: string, why: string, urgent = false, lot = -1, kill?: KillWhy) => {
    if (act !== 'wait' && act !== 'sell' && act !== 'close' && queued(act, field)) return
    out.push({ id: `${act}:${field}:${lot}`, field, act, lot, text, why, urgent, ...(kill ? { kill } : {}) })
  }
  const rainSoon = fc.slice(0, 3).some(d => d.rainChance >= 60 && d.rainMm >= 8)
  const blightSoon = fc.slice(0, 3).some(d => d.blight >= 2)
  const frostSoon = fc.slice(0, 2).some(d => d.frostChance >= 50)
  // Dead vines wait for set skins until the date a green crop is dug, so the crop is in before the freeze-up.
  const digNow = s.day >= dayIndex(year, P.DIG_GREEN.month, P.DIG_GREEN.dom)
  const anyBlight = s.fields.some((_, i) => fieldInfo(c, i).blightHills > 0)
  const killBy = dayIndex(year, 8, 8)
  const noSpray = sprayWayNow(c) === 'none'

  const spring = s.day < dayIndex(year, 5, 15)
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = fieldInfo(c, i)
    const n = f.name
    // A very stony field gets its rocks picked in spring, before the planter goes over it or while it rests.
    if ((f.status === 'idle' || f.status === 'rest') && spring && f.stones >= P.ROCKS_ADVISE && !f.works) {
      add(i, 'rocks', `Pick the rocks off ${n}.`, 'Frost has heaved up stones. They slow the planter and the digger and bruise the crop at the dig.')
    }
    if (f.status === 'idle') {
      // One rule for planting, the same the field's card and the forecast line read (plantReady).
      const ready = plantReady(world, c, i)
      if (ready.ok) add(i, 'plant', `Plant ${n}.`, ready.why, s.day > dayIndex(year, 5, 1))
      else add(i, 'wait', f.tooWet && ready.soilT >= ready.need ? `${n} is too wet to plant.` : `Hold off planting ${n}.`, ready.why)
      continue
    }
    if (f.status === 'growing') {
      const s0 = s.fields[i]
      const up = s0.emergeDay >= 0
      const blightWinning = f.blightKnown >= 0.2
      const made = s0.matureDay >= 0 && s.day - s0.matureDay >= 4
      const frostKill = frostSoon && s.day >= dayIndex(year, 8, 1)
      const killDue = s0.tiDay >= 0 && (s.day >= killBy || made || blightWinning || frostKill)
      // Once the vines are coming off there is nothing left to tend.
      const tending = !killDue && !queued('kill', i) && !queued('dig', i)
      if (tending && up && f.hillPasses === 0 && f.canopy >= 0.08 && f.canopy < P.CLOSURE) {
        add(i, 'hill', `Hill ${n}.`, 'The plants are a hand high. Soil pulled up now covers the tubers to come and buries the weeds.', f.canopy > 0.4)
      } else if (tending && up && f.hillPasses === 1 && f.canopy >= 0.42 && f.canopy < P.CLOSURE) {
        add(i, 'hill', `Hill ${n} a second time.`, 'Last chance before the rows close. A full hill keeps tubers out of the light and out of the blight.', f.canopy > 0.7)
      }
      const scoutEvery = t.watch ? 5 : 8
      if (tending && up && (f.scoutAge < 0 || f.scoutAge >= scoutEvery)) {
        add(i, 'scout', `Walk ${n}.`, t.watch ? 'Blight weather. Lesions show a few days after infection, and only up close.' : 'A weekly walk catches trouble while it is small.')
      }
      if (tending && up && f.blightHills > 0 && f.blightHills <= 8 && f.blightKnown < 0.04) {
        add(i, 'rogue', `Pull the blighted ${f.blightHills === 1 ? 'hill' : 'hills'} in ${n}.`, `${f.blightHills === 1 ? 'One hill is' : `${f.blightHills} hills are`} throwing spores. Out of the field, they cannot.`, true)
      }
      if (tending && up && f.protect < 0.35 && !noSpray && (t.watch || (blightSoon && t.sv >= 12) || anyBlight)) {
        const why = anyBlight ? 'There is blight on the farm. Protectant only works if it is on the leaf before the spores.'
          : !t.watch ? 'Blight weather is forecast and the watch is close. Protectant has to be on the leaf before the spores.'
            : f.protect > 0.02 ? 'The blight watch is on and the protectant is wearing thin.' : 'The blight watch is on and the leaves are unprotected.'
        add(i, 'spray', `Spray ${n}.`, why, anyBlight || blightSoon)
      }
      // Most Aroostook potatoes are rain-fed: watering is advised only with a reel, or when the crop is wilting.
      if (tending && s0.tiDay >= 0 && s0.matureDay < 0 && !rainSoon && t.day.prcp < 2 && !f.tooWet) {
        if (f.moisture < (c.upgrades.reel ? 0.38 : 0.2)) {
          add(i, 'water', `Water ${n}.`, c.upgrades.reel ? 'The ground is dry and no rain is coming. Dry soil while tubers bulk costs yield and brings scab.' : 'The plants are wilting and no rain is coming. Hauling water is slow, but this field is losing its crop.')
        } else if (!c.upgrades.reel && f.moisture < 0.38) {
          add(i, 'wait', `${n} is dry.`, 'Rain is the cheap cure. Without a reel, watering takes the farmer a whole day and $300 a field, so most growers here wait for rain and accept some scab.')
        }
      }
      if (tending && s0.tiDay >= 0 && s.day - s0.tiDay >= 28 && (f.estimate?.digs ?? 0) < 1) {
        add(i, 'sample', `Test dig in ${n}.`, 'One hill lifted tells you more about the crop than a week of looking at the tops.')
      } else if (tending && s0.tiDay >= 0 && s.day - s0.tiDay >= 50 && (f.estimate?.digs ?? 0) < 2) {
        add(i, 'sample', `Test dig in ${n} again.`, 'A second hill narrows the guess before you decide when to kill the vines.')
      }
      if (killDue) {
        const kill: KillWhy = blightWinning ? 'blight' : s.day >= killBy ? 'late' : made ? 'made' : 'frost'
        const why = kill === 'blight' ? 'Blight is winning. Killing the vines gives up the growth still to come, but dead vines stop feeding spores down to the tubers.'
          : kill === 'late' ? 'Skins need two weeks to set after the vines die, and October is short.'
            : kill === 'made' ? 'The crop is made. Kill the vines so the skins set.'
              : 'Frost is forecast. Killing the vines now gives up a little growth so the skins start to set ahead of it.'
        add(i, 'kill', `Kill the vines in ${n}.`, why, blightWinning, -1, kill)
      }
      // Vines still up this late will not leave time for the skins to set before the ground freezes: dig them green.
      if (s0.tiDay >= 0 && s.day >= dayIndex(year, P.DIG_GREEN.month, P.DIG_GREEN.dom) && !queued('kill', i)) {
        add(i, 'dig', `Dig ${n} with the vines up.`, 'It is too late for the skins to set before the freeze-up. Thin skins keep badly, but frozen tubers do not keep at all.', true)
      }
    }
    if ((f.status === 'digging' || f.status === 'dug') && f.inField >= 0.5 && !f.weighed) {
      const frost = frostOnBarrels(world, c, i)
      add(i, 'haul', `Haul the crop in from ${n}.`, frost ? `A frost is forecast: ${Math.round(f.inField)} cwt in barrels would lose a fifth of itself in the night.` : `${Math.round(f.inField)} cwt is in barrels in the field. Until it is in, frost and sun take some of it.`, frost)
    }
    if (f.status === 'dead') {
      if (f.skin >= 1 || digNow) {
        add(i, 'dig', `Dig ${n}.`, f.skin >= 1 ? 'Skins are set.' : 'Hard frost is close. Thin skins are better than frozen tubers.', digNow)
      } else {
        add(i, 'wait', `Let ${n} sit.`, `Skins are ${Math.round(f.skin * 100)}% set. Tubers dug now skin, and skinned tubers do not keep.`)
      }
    }
  }
  for (const lot of openLots(c)) {
    const f = s.fields[lot.field]
    if (f.status !== 'dug' || !f.weighed) continue
    if (newPotatoWindow(c, lot) && lot.skinned > 20) {
      add(lot.field, 'sell', `Sell the ${fieldInfo(c, lot.field).name} crop now.`, 'Thin-skinned new potatoes bring a premium this week and will not keep.', true, lot.id)
    } else if (lot.loss.blight > 0.03 * (lot.grades.no1 + lot.grades.b + lot.grades.no2 + lot.grades.chef + lot.grades.cull)) {
      add(lot.field, 'sell', `Sell the ${fieldInfo(c, lot.field).name} crop off the field.`, 'Blighted tubers went over the picking table. More are in the pile, and they rot in storage.', false, lot.id)
    }
  }
  if (seasonDone(c)) {
    add(-1, 'close', 'Close out the season.', 'Everything is in. The cellar is next.', true)
  }
  out.sort((a, b) => Number(b.urgent) - Number(a.urgent))
  return out
}

// No more of any job than the crews could get round to: as many fields at once as the home farm has, for each
// crew able to do it, counting what is already on the list. The most urgent come first, then the fields in order.
function withinReach(c: Campaign, out: Advice[]): Advice[] {
  const s = c.season
  if (!s) return out
  const room = new Map<JobKind, number>()
  return out.filter(a => {
    if (a.act === 'wait' || a.act === 'sell' || a.act === 'close') return true
    const kind = a.act
    let left = room.get(kind)
    if (left === undefined) {
      let crews = 0
      for (const u of c.crew) if (willDo(u, kind)) crews++
      left = P.ADVICE_FIELDS_PER_CREW * crews
      for (const j of s.jobs) if (j.kind === kind) left--
    }
    room.set(kind, left - 1)
    return left > 0
  })
}

const MACHINE_WORK: JobKind[] = ['plant', 'hill', 'spray', 'water', 'kill', 'dig']

// Whether a frost is forecast tonight cold enough to reach the barrels in this field: the forecast the farm had
// yesterday for today, at the field's own frost offset.
export function frostOnBarrels(world: World, c: Campaign, field: number): boolean {
  const s = c.season
  if (!s) return false
  const f = forecastFor(world, c.seed, s.year, s.day, 1, hasBuilt(c, 'station') ? P.STATION_ERROR : 1)
  return f.frostChance >= P.FROST_HAUL_CHANCE || f.lo + P.FROST_OFFSET[c.fields[field].elev] * 0.7 <= P.FROST_HAUL_C
}

// Each working morning the farm's standing orders put on the list what reference practice wants, for the kinds of work
// the routine does by itself, on every held field; a foreman does every kind on their block, the calls included. The
// player can still order, cancel and bump. Ahead of a frost, the crop in the barrels is hauled first, and the morning
// says so.
export function standingOrders(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  const out: GameEvent[] = []
  if (c.phase !== 'season' || !s || s.frozen) return out
  // A frost coming on crop in barrels is hauled ahead of, Sunday or not; the morning says so once for a cold spell.
  const threatened = s.fields.some((f, i) => f.inField >= 0.5 && !f.weighed && frostOnBarrels(world, c, i))
  const first = threatened && s.frostHaul !== s.day - 1
  if (threatened) s.frostHaul = s.day
  const all = everything(world, c)
  noteKillAsks(world, c, all)
  noteKillRun(c, all)
  if (!workday(c, s)) return out
  // A frost forecast for tonight: a lone hauler digs no more than the rest of the day can haul in (season.ts, work).
  s.frostLow = forecastFor(world, c.seed, s.year, s.day, 1, hasBuilt(c, 'station') ? P.STATION_ERROR : 1).lo
  for (const a of withinReach(c, all)) {
    if (a.field < 0 || a.act === 'wait' || a.act === 'sell' || a.act === 'close') continue
    if (a.act === 'kill' && s.fields[a.field].keepVines) continue
    const by = standingBy(c, a.act, a.field)
    if (by) addJob(c, a.act, a.field, -1, by)
  }
  // The vines' kill, overdue where the dig is the routine's: the crew sees to it rather than dig green.
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const when = killByItself(c, i, all)
    if (when >= 0 && s.day >= when && !s.jobs.some(j => j.kind === 'kill' && j.field === i)) addJob(c, 'kill', i, -1, 'routine')
  }
  const cold: string[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.inField < 0.5 || f.weighed || !frostOnBarrels(world, c, i)) continue
    cold.push(`${withCommas(f.inField)} cwt in ${FIELD_NAMES[i]}`)
    const k = s.jobs.findIndex(j => j.kind === 'haul' && j.field === i)
    if (k > 0 && standingBy(c, 'haul', i)) s.jobs.unshift(...s.jobs.splice(k, 1))
  }
  if (cold.length) {
    // Whoever is on other machine work leaves it for the barrels; the work done stays with the order.
    for (const u of c.crew) {
      const j = u.job >= 0 ? s.jobs.find(x => x.id === u.job) : undefined
      if (j && j.kind !== 'haul' && MACHINE_WORK.includes(j.kind) && s.jobs.some(x => x.kind === 'haul' && standingBy(c, 'haul', x.field))) letGo(u)
    }
    if (first) {
      const e: GameEvent = { day: s.day, type: 'frostBarrels', field: -1, level: 'warn',
        text: `Frost is forecast on the crop still in barrels: ${cold.join(', ')}. Hauling it in comes first, Sundays too, until it is in.` }
      s.log.push(e)
      out.push(e)
    }
  }
  return out
}

// For each field: what reference practice wants of the player now (need), or why it is leaving the field alone
// (hold). Work the routine or a foreman puts on the list by itself is no need, unless nobody on the farm will do it.
export function fieldNeeds(world: World, c: Campaign): { need: Advice | null; hold: Advice | null }[] {
  const raw = everything(world, c)
  const all = withinReach(c, raw)
  const job = (a: Advice) => a.field >= 0 && a.act !== 'wait' && a.act !== 'sell' && a.act !== 'close'
  const nobody = (kind: JobKind) => !c.crew.some(u => willDo(u, kind))
  return c.fields.map((_, i) => {
    const mine = all.filter(a => a.field === i)
    const need = mine.find(a => a.act !== 'wait' && !(job(a) && standingBy(c, a.act as JobKind, i)))
      ?? raw.filter(a => a.field === i && job(a) && standingBy(c, a.act as JobKind, i) && nobody(a.act as JobKind))
        .map(a => ({ ...a, why: `${a.why} Nobody on the farm will do ${JOB_LABEL[a.act as JobKind].toLowerCase()}: set someone's priority for it.` }))[0]
      ?? null
    const auto = mine.find(a => job(a) && standingBy(c, a.act as JobKind, i))
    const hold = mine.find(a => a.act === 'wait')
      ?? (auto ? { ...auto, act: 'wait' as const, text: `${JOB_LABEL[auto.act as JobKind]} goes on the list by itself.`, why: `The crew sees to it: ${auto.why}`, urgent: false } : null)
    return { need: need ?? null, hold }
  })
}
