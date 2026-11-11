// A scripted five-season campaign for determinism checks. runReplay is self-contained (it touches nothing
// outside its arguments), so a browser test can run the same thing in the page:
//   page.evaluate(`(${runReplay})(__county.sim, __county.app.world).hash`)
import type * as SimModule from '../src/sim/index.ts'
import type { Campaign, Cmd, World } from '../src/sim/index.ts'

export type Sim = typeof SimModule

export const REPLAY = { startYear: 1980, seed: 20240611 }

const WOODLOT = 14

export interface ReplayOptions {
  startYear?: number
  seed?: number
  campaign?: Campaign                 // continue this campaign instead of starting one
  stopAt?: (c: Campaign) => boolean   // pause before the next step when this turns true
  plain?: boolean                     // the home farm only, one farmer, no contracts: what an older build could save
}

export interface ReplayResult { campaign: Campaign; hash: string; cmds: Cmd[]; done: boolean }

export function runReplay(sim: Sim, world: World, opts: ReplayOptions = {}): ReplayResult {
  const startYear = opts.startYear ?? 1980
  const seed = opts.seed ?? 20240611
  const c = opts.campaign ?? sim.createCampaign(world, { seed, startYear })
  const cmds: Cmd[] = []
  const go = (cmd: Cmd) => { cmds.push(cmd); return sim.apply(world, c, cmd) }
  // The home six each spring. The chipping variety is grown only against a contract, on the rented land.
  const PLANS: [string, string, string][][] = [
    [['potato', 'kennebec', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'superior', 'certified'], ['potato', 'katahdin', 'certified']],
    [['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'saved'], ['potato', 'kennebec', 'saved'], ['potato', 'kennebec', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'certified']],
    [['potato', 'gold', 'certified'], ['potato', 'burbank', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'saved'], ['potato', 'norland', 'certified'], ['rest', 'katahdin', 'certified']],
    [['potato', 'kennebec', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'certified'], ['potato', 'kennebec', 'saved'], ['potato', 'kennebec', 'certified'], ['potato', 'katahdin', 'certified']],
    [['potato', 'kennebec', 'certified'], ['potato', 'katahdin', 'certified'], ['potato', 'superior', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'gold', 'certified'], ['potato', 'burbank', 'certified']],
  ]
  const BUY = [[], ['reel'], ['vent', 'boom'], ['harvester'], []]
  // The bigger farm from the second spring: Intervale South rented, then given up for a Dufour field; a field hand
  // hired, then let go; one contract signed each spring and the crop for it planted on the rented land.
  const none = { rent: [], release: [], hire: 0, dismiss: false }
  const LAND: { rent: number[]; release: number[]; hire: number; dismiss: boolean }[] = opts.plain ? [none] : [
    none,
    { rent: [7], release: [], hire: 1, dismiss: false },
    { rent: [12], release: [7], hire: 0, dismiss: false },
    { rent: [], release: [], hire: 0, dismiss: true },
    none,
  ]
  // Delivers what the dug lots can give to the open contracts for their variety.
  const deliver = () => {
    for (const k of c.contracts) {
      if (k.settled) continue
      for (const l of sim.openLots(c)) if (l.variety === k.variety && k.delivered < k.cwt) go({ t: 'deliver', lot: l.id, contract: k.id })
    }
  }
  let guard = 0
  while (guard++ < 20000) {
    if (opts.stopAt && opts.stopAt(c)) return { campaign: c, hash: sim.hashCampaign(c), cmds, done: false }
    if (c.phase === 'plan') {
      const k = Math.min(c.yearIdx, PLANS.length - 1)
      for (const u of BUY[k]) go({ t: 'buy', upgrade: u as 'reel' })
      const land = LAND[Math.min(c.yearIdx, LAND.length - 1)]
      for (const field of land.release) go({ t: 'release', field })
      for (const field of land.rent) go({ t: 'rent', field })
      for (let h = 0; h < land.hire; h++) go({ t: 'hire', kind: 'hand' })
      if (land.dismiss) for (const u of c.crew.filter(x => x.kind === 'hand')) go({ t: 'dismiss', unit: u.id })
      // The second spring one of the people asking for work is taken on, set to drive when a tractor is free, and
      // paid a little over what they asked.
      if (!opts.plain && c.yearIdx === 1 && c.applicants.length) {
        go({ t: 'hire', applicant: c.applicants[0].id })
        const u = c.crew[c.crew.length - 1]
        go({ t: 'priority', unit: u.id, work: 'machine', level: u.prio.machine === 2 ? 3 : 2 })
        go({ t: 'raise', unit: u.id, wage: u.wage + 30 })
      }
      // The third spring the stumps are pulled on the woodlot felled over the winter, and some of its logs sold.
      if (!opts.plain && c.yearIdx === 2) {
        go({ t: 'stump', field: WOODLOT })
        if (c.logs >= 10) go({ t: 'sellLogs', loads: Math.floor(c.logs / 2) })
      }
      PLANS[k].forEach(([crop, variety, seedKind], field) => {
        const r = go({ t: 'plan', field, plan: { crop: crop as 'potato', variety: variety as 'katahdin', seed: seedKind as 'saved' } })
        if (!r.ok) go({ t: 'plan', field, plan: { crop: crop as 'potato', variety: variety as 'katahdin', seed: 'certified' } })
      })
      const offer = c.yearIdx > 0 && !opts.plain ? c.offers[0] : undefined
      if (offer) {
        go({ t: 'accept', offer: offer.id })
        for (const field of land.rent) go({ t: 'plan', field, plan: { crop: 'potato', variety: offer.variety, seed: 'certified' } })
      }
      if (!go({ t: 'begin' }).ok) {
        for (let f = 5; f >= 0; f--) {
          go({ t: 'plan', field: f, plan: { crop: 'rest', variety: 'katahdin', seed: 'certified' } })
          if (go({ t: 'begin' }).ok) break
        }
      }
    } else if (c.phase === 'season') {
      const s = c.season!
      for (const a of sim.advise(world, c)) {
        if (a.act === 'wait') continue
        if (a.act === 'sell') {
          if (!c.contracts.some(k => !k.settled && k.variety === c.lots.find(l => l.id === a.lot)?.variety)) go({ t: 'sell', lot: a.lot, frac: c.steps % 2 ? 1 : 0.5 })
        } else if (a.act !== 'close') go({ t: 'job', kind: a.act, field: a.field })
      }
      if (s.jobs.length > 1 && c.steps % 17 === 0) go({ t: 'bump', id: s.jobs[s.jobs.length - 1].id })
      const sample = s.jobs.find(j => j.kind === 'sample' && j.done === 0)
      if (sample && c.steps % 23 === 0) go({ t: 'cancel', id: sample.id })
      const hand = c.crew.find(u => u.kind === 'hand' && u.prio.field > 0)
      const walk = s.jobs.find(j => j.kind === 'scout' && j.unit < 0)
      if (hand && walk && c.steps % 3 === 0) go({ t: 'assign', id: walk.id, unit: hand.id })
      // The third harvest has pickers for the school break.
      if (!opts.plain && c.yearIdx === 2 && !s.pickers && sim.labourInfo(c).pickers.ok) go({ t: 'pickers', on: true })
      // New ground has its rocks picked once the stumps are out.
      const wood = c.fields[WOODLOT]
      if (!opts.plain && wood.cover === 'open' && wood.stones >= 0.6 && !s.jobs.some(j => j.kind === 'rocks' && j.field === WOODLOT)) go({ t: 'job', kind: 'rocks', field: WOODLOT })
      deliver()
      if (sim.seasonDone(c)) go({ t: 'endSeason' })
      else go({ t: 'day' })
    } else if (c.phase === 'cellar') {
      const open = sim.openLots(c)
      if (c.month === 0) deliver()
      // The second winter the newest hired person is kept on to fell the home woodlot.
      const last = c.crew[c.crew.length - 1]
      if (!opts.plain && c.yearIdx === 1 && c.month === 0 && last.kind !== 'farmer' && last.winter === 'off') go({ t: 'winter', unit: last.id, work: 'woods', field: WOODLOT })
      if (c.month === 0 && open.length) go({ t: 'seed', lot: open[0].id, fields: 2 })
      if (c.month === 2) for (const l of open) go({ t: 'sell', lot: l.id, frac: 0.5 })
      if (c.month === 4) for (const l of open) go({ t: 'sell', lot: l.id, frac: 1 })
      go({ t: 'month' })
    } else if (c.phase === 'ledger') {
      if (c.history.length >= 5 || c.outcome === 'lost') break
      go({ t: 'next' })
    } else break
  }
  return { campaign: c, hash: sim.hashCampaign(c), cmds, done: true }
}
