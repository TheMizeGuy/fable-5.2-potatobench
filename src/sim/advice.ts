// Reference practice: what a careful Aroostook grower would do next, from what the grower can see.
// The in-game coach shows it, and the reference bot follows it. It tends the fields the farm holds; it has nothing
// to say about land, hiring or contracts.
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import * as P from './params.ts'
import { jobSkill, SKILL_LABEL, willDo } from './people.ts'
import type { Campaign, GameEvent, JobKind, KillWhy, World } from './types.ts'
import { fieldInfo, forecast, today } from './view.ts'
import { openLots, sprayWayNow } from './campaign.ts'
import { newPotatoWindow } from './market.ts'
import { addJob, awaitsWord, FIELD_NAMES, JOB_LABEL, letGo, plantWordGiven, seasonDone, standingBy, workday } from './season.ts'
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
  const killBy = dayIndex(year, P.KILL_BY.month, P.KILL_BY.dom)
  const noSpray = sprayWayNow(c) === 'none'

  const spring = s.day < dayIndex(year, 5, 15)
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = fieldInfo(c, i)
    const n = f.name
    // A very stony field gets its rocks picked in spring, before the planter goes over it or while it rests.
    if ((f.status === 'idle' || f.status === 'rest') && spring && f.stones >= P.ROCKS_ADVISE && !f.works) {
      add(i, 'rocks', `Pick the rocks off ${n}.`, 'Frost pushed up new stones over the winter. They slow the planter and digger, and they bruise potatoes at harvest.')
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
      const made = s0.matureDay >= 0 && s.day - s0.matureDay >= P.KILL_MADE_DAYS
      const frostKill = frostSoon && s.day >= dayIndex(year, 8, 1)
      const killDue = s0.tiDay >= 0 && (s.day >= killBy || made || blightWinning || frostKill)
      // Once the vines are coming off there is nothing left to tend.
      const tending = !killDue && !queued('kill', i) && !queued('dig', i)
      if (tending && up && f.hillPasses === 0 && f.canopy >= 0.08 && f.canopy < P.CLOSURE) {
        add(i, 'hill', `Hill ${n}.`, 'The plants are a hand tall. Hilling now covers the potatoes that are about to form and buries the weeds.', f.canopy > 0.4)
      } else if (tending && up && f.hillPasses === 1 && f.canopy >= 0.42 && f.canopy < P.CLOSURE) {
        add(i, 'hill', `Hill ${n} a second time.`, 'It\'s the last chance before the rows close. A full hill keeps potatoes out of the light and away from blight.', f.canopy > 0.7)
      }
      const scoutEvery = t.watch ? 5 : 8
      if (tending && up && (f.scoutAge < 0 || f.scoutAge >= scoutEvery)) {
        add(i, 'scout', `Walk ${n}.`, t.watch ? 'It\'s blight weather, and the spots only show up close, a few days after infection.' : 'A weekly walk catches trouble while it\'s still small.')
      }
      if (tending && up && f.blightHills > 0 && f.blightHills <= 8 && f.blightKnown < 0.04) {
        add(i, 'rogue', `Pull the blighted ${f.blightHills === 1 ? 'hill' : 'hills'} in ${n}.`, `${f.blightHills === 1 ? 'One hill is' : `${f.blightHills} hills are`} shedding spores, so pull ${f.blightHills === 1 ? 'it' : 'them'} before the blight spreads.`, true)
      }
      if (tending && up && f.protect < 0.35 && !noSpray && (t.watch || (blightSoon && t.sv >= 12) || anyBlight)) {
        const why = anyBlight ? 'Blight is on your farm. Spray only protects leaves it reaches before the blight does, so don\'t wait.'
          : !t.watch ? 'Blight weather is forecast and a watch is close, so get spray on the leaves before the spores arrive.'
            : f.protect > 0.02 ? 'The blight watch is on and the last spray is wearing off.' : 'The blight watch is on and the leaves have no protection.'
        add(i, 'spray', `Spray ${n}.`, why, anyBlight || blightSoon)
      }
      // Most Aroostook potatoes are rain-fed: watering is advised only with a reel, or when the crop is wilting.
      if (tending && s0.tiDay >= 0 && s0.matureDay < 0 && !rainSoon && t.day.prcp < 2 && !f.tooWet) {
        if (f.moisture < (c.upgrades.reel ? 0.38 : 0.2)) {
          add(i, 'water', `Water ${n}.`, c.upgrades.reel ? 'The ground is dry with no rain coming. Dry soil while potatoes size up cuts yield and causes scab.' : 'The plants are wilting and there\'s no rain coming. Hauling water is slow, but this field is losing its crop.')
        } else if (!c.upgrades.reel && f.moisture < 0.38) {
          add(i, 'wait', `${n} is dry.`, 'Rain is the cheap fix. Without an irrigation reel, watering takes you a whole day and $300 a field, so most growers here wait for rain and accept some scab.')
        }
      }
      if (tending && s0.tiDay >= 0 && s.day - s0.tiDay >= 28 && (f.estimate?.digs ?? 0) < 1) {
        add(i, 'sample', `Test dig in ${n}.`, 'Digging up one hill tells you more about the crop than a week of looking at the leaves.')
      } else if (tending && s0.tiDay >= 0 && s.day - s0.tiDay >= 50 && (f.estimate?.digs ?? 0) < 2) {
        add(i, 'sample', `Test dig in ${n} again.`, 'A second hill sharpens the estimate before you decide when to kill the vines.')
      }
      if (killDue) {
        const kill: KillWhy = blightWinning ? 'blight' : s.day >= killBy ? 'late' : made ? 'made' : 'frost'
        const why = kill === 'blight' ? 'Blight is winning here. Killing the vines gives up the rest of the growth, but it stops spores washing down to the potatoes.'
          : kill === 'late' ? 'Skins need two weeks to toughen after the vines die, and October is short.'
            : kill === 'made' ? 'The crop has finished growing, so kill the vines and let the skins set.'
              : 'Frost is forecast. Killing the vines now gives up a little growth but gives the skins a head start.'
        add(i, 'kill', `Kill the vines in ${n}.`, why, blightWinning, -1, kill)
      }
      // Vines still up this late will not leave time for the skins to set before the ground freezes: dig them green.
      if (s0.tiDay >= 0 && s.day >= dayIndex(year, P.DIG_GREEN.month, P.DIG_GREEN.dom) && !queued('kill', i)) {
        add(i, 'dig', `Dig ${n} with the vines still up.`, 'It\'s too late for the skins to set before the ground freezes. Thin-skinned potatoes store badly, but frozen ones don\'t store at all.', true)
      }
    }
    if ((f.status === 'digging' || f.status === 'dug') && f.inField >= 0.5 && !f.weighed) {
      const frost = frostOnBarrels(world, c, i)
      add(i, 'haul', `Haul the crop in from ${n}.`, frost ? `Frost is forecast tonight, and it would freeze a fifth of the ${Math.round(f.inField)} cwt sitting in barrels.` : `${Math.round(f.inField)} cwt is in barrels in the field, and frost and sun spoil a little until it's hauled in.`, frost)
    }
    if (f.status === 'dead') {
      if (f.skin >= 1 || digNow) {
        add(i, 'dig', `Dig ${n}.`, f.skin >= 1 ? 'The skins are set, so it\'s ready to dig.' : 'A hard frost is close, and thin skins are better than frozen potatoes.', digNow)
      } else {
        add(i, 'wait', `Let ${n} sit.`, `Skins are ${Math.round(f.skin * 100)}% set. Potatoes dug now get skinned, and skinned potatoes don't keep.`)
      }
    }
  }
  for (const lot of openLots(c)) {
    const f = s.fields[lot.field]
    if (f.status !== 'dug' || !f.weighed) continue
    if (newPotatoWindow(c, lot) && lot.skinned > 20) {
      add(lot.field, 'sell', `Sell the ${fieldInfo(c, lot.field).name} crop now.`, 'Thin-skinned new potatoes sell at a premium this week, and they won\'t keep.', true, lot.id)
    } else if (lot.loss.blight > 0.03 * (lot.grades.no1 + lot.grades.b + lot.grades.no2 + lot.grades.chef + lot.grades.cull)) {
      add(lot.field, 'sell', `Sell the ${fieldInfo(c, lot.field).name} crop straight from the field.`, 'Blighted potatoes turned up on the picking table. There are more in the pile, and they\'ll rot in storage.', false, lot.id)
    }
  }
  if (seasonDone(c)) {
    add(-1, 'close', 'Close out the season.', 'The whole crop is in, so the cellar comes next.', true)
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
// player can still order, cancel and bump. Ahead of a frost, the crop in the barrels is hauled first; the evening
// before says so (frostAhead).
export function standingOrders(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  const out: GameEvent[] = []
  if (c.phase !== 'season' || !s || s.frozen) return out
  // A frost coming on crop in barrels is hauled ahead of, Sunday or not; the evening before said so (frostAhead).
  if (s.fields.some((f, i) => f.inField >= 0.5 && !f.weighed && frostOnBarrels(world, c, i))) s.frostHaul = s.day
  const all = everything(world, c)
  noteKillAsks(world, c, all)
  noteKillRun(c, all)
  if (!workday(c, s)) return out
  // A frost forecast for tonight: a lone hauler digs no more than the rest of the day can haul in (season.ts, work).
  s.frostLow = forecastFor(world, c.seed, s.year, s.day, 1, hasBuilt(c, 'station') ? P.STATION_ERROR : 1).lo
  // The year's first planting waits for the player's word (plantAsked said the crew stands ready). With no word
  // PLANT_WORD_DAYS later, the crew starts by itself this morning, and says so.
  const fit = all.filter(a => a.act === 'plant' && awaitsWord(c, 'plant', a.field))
  if (fit.length && s.plantAsk !== undefined && s.day - s.plantAsk >= P.PLANT_WORD_DAYS) {
    s.plantWord = s.day
    s.plantWordBy = 'crew'
    out.push(said(s, 'plantWord', fit[0].field, `You gave no word in ${P.PLANT_WORD_DAYS} days, so your crew has started planting on its own.`))
  }
  for (const a of withinReach(c, all)) {
    if (a.field < 0 || a.act === 'wait' || a.act === 'sell' || a.act === 'close') continue
    if (a.act === 'kill' && s.fields[a.field].keepVines) continue
    if (awaitsWord(c, a.act, a.field)) continue
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
  }
  return out
}

function said(s: NonNullable<Campaign['season']>, type: string, field: number, text: string, data?: GameEvent['data']): GameEvent {
  const e: GameEvent = { day: s.day, type, field, level: 'info', text, ...(data ? { data } : {}) }
  s.log.push(e)
  return e
}

// The evening the first field comes fit to plant, with the planting waiting for the player's word: the crew says it
// stands ready, once, dated the morning the stamps are up, and the days to its own start count from there.
export function plantAsked(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen || s.plantAsk !== undefined || plantWordGiven(s)) return []
  const fit = everything(world, c).find(a => a.act === 'plant' && awaitsWord(c, 'plant', a.field))
  if (!fit) return []
  s.plantAsk = s.day
  return [said(s, 'plantAsk', fit.field, `The soil is ready and your crew is waiting for your word. Order Plant on any potato field, or they'll start on their own in ${P.PLANT_WORD_DAYS} days.`)]
}

// The player's first planting order of the year is the word the crew waits for: said back, with what follows.
export function wordToPlant(c: Campaign, field: number): GameEvent | null {
  const s = c.season
  if (!s || s.plantWord !== undefined || standingBy(c, 'plant', field) !== 'routine') return null
  const first = !s.fields.some(f => f.plantDay >= 0) && s.jobs.filter(j => j.kind === 'plant').length === 1
  s.plantWord = s.day
  s.plantWordBy = 'you'
  if (!first) return null
  let others = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) if (i !== field && c.plans[i]?.crop === 'potato' && c.fields[i].tenure !== 'none' && s.fields[i].plantDay < 0 && standingBy(c, 'plant', i) === 'routine') others++
  return said(s, 'plantWord', field, others ? `You gave the word. Your crew will plant the other ${others === 1 ? 'field' : `${others} fields`} too.` : 'You gave the word, and planting has started.')
}

// The evening a field's vine kill comes due and is the player's to give, said once for each field. Where the crew
// would not kill by itself (the kill and the dig are both the player's own orders): the day reference practice first
// asks for it. Where the player keeps the vines up: KILL_CALL_DAYS before the last day a kill still leaves the skins
// time to set. A kill the routine, a foreman or the crew's own date takes care of is never said.
export function killCalled(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const latest = dayIndex(s.year, P.DIG_GREEN.month, P.DIG_GREEN.dom) - P.SKIN_DAYS
  // The fields whose kill would be the player's alone, before asking whether it is due.
  const theirs: number[] = []
  s.fields.forEach((f, i) => {
    if (f.killCall !== undefined || f.status !== 'growing' || f.deadDay >= 0 || standingBy(c, 'kill', i)) return
    if (f.keepVines ? s.day < latest - P.KILL_CALL_DAYS : !!standingBy(c, 'dig', i)) return
    if (!s.jobs.some(j => j.kind === 'kill' && j.field === i)) theirs.push(i)
  })
  if (!theirs.length) return []
  const all = everything(world, c)
  const due: number[] = []
  const kept: number[] = []
  for (const i of theirs) {
    if (!all.some(a => a.act === 'kill' && a.field === i)) continue
    s.fields[i].killCall = s.day
    ;(s.fields[i].keepVines ? kept : due).push(i)
  }
  const names = (list: number[]) => { const n = list.map(i => FIELD_NAMES[i]); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] }
  const out: GameEvent[] = []
  if (due.length) out.push(said(s, 'killCall', due[0], `The vines in ${names(due)} are due to be killed, and that's your decision. Order Kill vines there, or they stay up.`, { fields: due }))
  if (kept.length) out.push(said(s, 'killCall', kept[0], `You're keeping the vines up in ${names(kept)}. Kill them by ${formatDay(s.year, latest)} so the skins toughen before the harvest, or the field gets dug green.`, { fields: kept }))
  return out
}

// The evening before a frost on crop still in barrels, once for a cold spell: the one warning, dated the day the
// barrels are hauled in ahead of it, so the player hears of it while there is still a day to act.
export function frostAhead(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const cold: string[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.inField >= 0.5 && !f.weighed && frostOnBarrels(world, c, i)) cold.push(`${withCommas(f.inField)} cwt in ${FIELD_NAMES[i]}`)
  }
  if (!cold.length || s.frostHaul === s.day - 1) return []
  const e: GameEvent = { day: s.day, type: 'frostBarrels', field: -1, level: 'warn',
    text: `Frost is forecast for the crop still in barrels: ${cold.join(', ')}. Your crew hauls it in first, Sundays included, until it's all in.` }
  s.log.push(e)
  return [e]
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
    // The planting that waits for the player's word is theirs to give, on every field that is fit.
    const need = raw.find(a => a.field === i && a.act === 'plant' && awaitsWord(c, 'plant', i))
      ?? mine.find(a => a.act !== 'wait' && !(job(a) && standingBy(c, a.act as JobKind, i)))
      ?? raw.filter(a => a.field === i && job(a) && standingBy(c, a.act as JobKind, i) && nobody(a.act as JobKind))
        .map(a => ({ ...a, why: `${a.why} Nobody on the farm will do ${SKILL_LABEL[jobSkill(a.act as JobKind)]}, so set someone's priority for it.` }))[0]
      ?? null
    const auto = mine.find(a => job(a) && standingBy(c, a.act as JobKind, i) && !awaitsWord(c, a.act as JobKind, i))
    const hold = mine.find(a => a.act === 'wait')
      ?? (auto ? { ...auto, act: 'wait' as const, text: `${JOB_LABEL[auto.act as JobKind]} goes on the work list automatically.`, why: `You don't need to order it. ${auto.why}`, urgent: false } : null)
    return { need: need ?? null, hold }
  })
}
