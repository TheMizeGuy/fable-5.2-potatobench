// Reference practice: what a careful Aroostook grower would do next, from what the grower can see.
// The in-game coach shows it, and the reference bot follows it. It tends the fields the farm holds; it has nothing
// to say about land, hiring or contracts.
import { dayIndex } from './calendar.ts'
import { PARCELS } from './farm.ts'
import * as P from './params.ts'
import { willDo } from './people.ts'
import type { Campaign, JobKind, World } from './types.ts'
import { fieldInfo, forecast, today } from './view.ts'
import { openLots } from './campaign.ts'
import { newPotatoWindow } from './market.ts'
import { addJob, seasonDone, workday } from './season.ts'

export interface Advice {
  id: string
  field: number                    // -1 when not about one field
  act: JobKind | 'wait' | 'sell' | 'close'
  lot: number                      // for 'sell'
  text: string                     // what to do
  why: string                      // the reason, in the grower's terms
  urgent: boolean
}

function f1(c: number): number { return Math.round(c * 9 / 5 + 32) }

export function advise(world: World, c: Campaign): Advice[] {
  const s = c.season
  if (c.phase !== 'season' || !s) return []
  const out: Advice[] = []
  const t = today(world, c)!
  const fc = forecast(world, c, 5)
  const year = s.year
  const queued = (kind: JobKind, field: number) => s.jobs.some(j => j.kind === kind && j.field === field)
  const add = (field: number, act: Advice['act'], text: string, why: string, urgent = false, lot = -1) => {
    if (act !== 'wait' && act !== 'sell' && act !== 'close' && queued(act, field)) return
    out.push({ id: `${act}:${field}:${lot}`, field, act, lot, text, why, urgent })
  }
  const rainSoon = fc.slice(0, 3).some(d => d.rainChance >= 60 && d.rainMm >= 8)
  const blightSoon = fc.slice(0, 3).some(d => d.blight >= 2)
  const frostSoon = fc.slice(0, 2).some(d => d.frostChance >= 50)
  const hardFrostNear = s.day >= dayIndex(year, 9, 8)
  const anyBlight = s.fields.some((_, i) => fieldInfo(c, i).blightHills > 0)
  const killBy = dayIndex(year, 8, 8)

  const spring = s.day < dayIndex(year, 5, 15)
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = fieldInfo(c, i)
    const n = f.name
    // A very stony field gets its rocks picked in spring, before the planter goes over it or while it rests.
    if ((f.status === 'idle' || f.status === 'rest') && spring && f.stones >= P.ROCKS_ADVISE && !f.works) {
      add(i, 'rocks', `Pick the rocks off ${n}.`, 'Frost has heaved up stones. They slow the planter and the digger and bruise the crop at the dig.')
    }
    if (f.status === 'idle') {
      if (s.day < dayIndex(year, 4, 8)) add(i, 'wait', `Hold off planting ${n}.`, 'It is early. Seed sits and rots in cold ground.')
      else if (t.soilT < 10) add(i, 'wait', `Hold off planting ${n}.`, `The soil is ${f1(t.soilT)}°F. Growers here wait for 50°F; below 45°F the seed rots.`)
      else if (f.tooWet) add(i, 'wait', `${n} is too wet to plant.`, 'Working wet ground packs it. It will dry in a day or two.')
      else add(i, 'plant', `Plant ${n}.`, `The soil is ${f1(t.soilT)}°F and fit to work.`, s.day > dayIndex(year, 5, 1))
      continue
    }
    if (f.status === 'growing') {
      const s0 = s.fields[i]
      const up = s0.emergeDay >= 0
      const blightWinning = f.blightKnown >= 0.2
      const killDue = s0.tiDay >= 0 && (s.day >= killBy || (s0.matureDay >= 0 && s.day - s0.matureDay >= 4) || blightWinning || (frostSoon && s.day >= dayIndex(year, 8, 1)))
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
      if (tending && up && f.protect < 0.35 && (t.watch || (blightSoon && t.sv >= 12) || anyBlight)) {
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
        const why = blightWinning ? 'Blight is winning. Killing the vines gives up the growth still to come, but dead vines stop feeding spores down to the tubers.'
          : s.day >= killBy ? 'Skins need two weeks to set after the vines die, and October is short.'
            : 'The crop is made. Kill the vines so the skins set.'
        add(i, 'kill', `Kill the vines in ${n}.`, why, blightWinning)
      }
    }
    if (f.status === 'dead') {
      if (f.skin >= 1 || hardFrostNear) {
        add(i, 'dig', `Dig ${n}.`, f.skin >= 1 ? 'Skins are set.' : 'Hard frost is close. Thin skins are better than frozen tubers.', hardFrostNear)
      } else {
        add(i, 'wait', `Let ${n} sit.`, `Skins are ${Math.round(f.skin * 100)}% set. Tubers dug now skin, and skinned tubers do not keep.`)
      }
    }
  }
  for (const lot of openLots(c)) {
    const f = s.fields[lot.field]
    if (f.status !== 'dug') continue
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
  // No more of any job than the crews could get round to: as many fields at once as the home farm has, for each
  // crew able to do it, counting what is already on the list. The most urgent come first, then the fields in order.
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

// Each working morning a foreman puts on the list the orders reference practice wants for the held fields of their
// block. The player can still order and cancel there.
export function foremanOrders(world: World, c: Campaign): void {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen || !workday(c, s)) return
  const blocks = new Set<string>()
  for (const u of c.crew) if (u.foreman) blocks.add(u.foreman)
  if (!blocks.size) return
  for (const a of advise(world, c)) {
    if (a.field < 0 || a.act === 'wait' || a.act === 'sell' || a.act === 'close') continue
    if (blocks.has(PARCELS[a.field].block)) addJob(c, a.act, a.field)
  }
}

// For each field: what reference practice wants done there now (need), or why it is leaving the field alone (hold).
export function fieldNeeds(world: World, c: Campaign): { need: Advice | null; hold: Advice | null }[] {
  const all = advise(world, c)
  return c.fields.map((_, i) => ({
    need: all.find(a => a.field === i && a.act !== 'wait') ?? null,
    hold: all.find(a => a.field === i && a.act === 'wait') ?? null,
  }))
}
