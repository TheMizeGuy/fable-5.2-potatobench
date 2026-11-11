// A scripted five-season campaign for determinism checks. runReplay is self-contained (it touches nothing
// outside its arguments), so a browser test can run the same thing in the page:
//   page.evaluate(`(${runReplay})(__county.sim, __county.app.world).hash`)
import type * as SimModule from '../src/sim/index.ts'
import type { Campaign, Cmd, World } from '../src/sim/index.ts'

export type Sim = typeof SimModule

export const REPLAY = { startYear: 1987, seed: 20240611 }

export interface ReplayOptions {
  startYear?: number
  seed?: number
  campaign?: Campaign                 // continue this campaign instead of starting one
  stopAt?: (c: Campaign) => boolean   // pause before the next step when this turns true
}

export interface ReplayResult { campaign: Campaign; hash: string; cmds: Cmd[]; done: boolean }

export function runReplay(sim: Sim, world: World, opts: ReplayOptions = {}): ReplayResult {
  const startYear = opts.startYear ?? 1987
  const seed = opts.seed ?? 20240611
  const c = opts.campaign ?? sim.createCampaign(world, { seed, startYear })
  const cmds: Cmd[] = []
  const go = (cmd: Cmd) => { cmds.push(cmd); return sim.apply(world, c, cmd) }
  const PLANS: [string, string, string][][] = [
    [['potato', 'kennebec', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'superior', 'certified'], ['potato', 'katahdin', 'certified']],
    [['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'saved'], ['potato', 'kennebec', 'saved'], ['potato', 'atlantic', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'certified']],
    [['potato', 'gold', 'certified'], ['potato', 'burbank', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'saved'], ['potato', 'norland', 'certified'], ['rest', 'katahdin', 'certified']],
    [['potato', 'kennebec', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'katahdin', 'certified'], ['potato', 'kennebec', 'saved'], ['potato', 'atlantic', 'certified'], ['potato', 'katahdin', 'certified']],
    [['potato', 'kennebec', 'certified'], ['potato', 'katahdin', 'certified'], ['potato', 'superior', 'certified'], ['rest', 'katahdin', 'certified'], ['potato', 'gold', 'certified'], ['potato', 'burbank', 'certified']],
  ]
  const BUY = [[], ['reel'], ['vent', 'boom'], ['harvester'], []]
  let guard = 0
  while (guard++ < 20000) {
    if (opts.stopAt && opts.stopAt(c)) return { campaign: c, hash: sim.hashCampaign(c), cmds, done: false }
    if (c.phase === 'plan') {
      const k = Math.min(c.yearIdx, PLANS.length - 1)
      for (const u of BUY[k]) go({ t: 'buy', upgrade: u as 'reel' })
      PLANS[k].forEach(([crop, variety, seedKind], field) => {
        const r = go({ t: 'plan', field, plan: { crop: crop as 'potato', variety: variety as 'katahdin', seed: seedKind as 'saved' } })
        if (!r.ok) go({ t: 'plan', field, plan: { crop: crop as 'potato', variety: variety as 'katahdin', seed: 'certified' } })
      })
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
        if (a.act === 'sell') go({ t: 'sell', lot: a.lot, frac: c.steps % 2 ? 1 : 0.5 })
        else if (a.act !== 'close') go({ t: 'job', kind: a.act, field: a.field })
      }
      if (s.jobs.length > 1 && c.steps % 17 === 0) go({ t: 'bump', id: s.jobs[s.jobs.length - 1].id })
      const scout = s.jobs.find(j => j.kind === 'scout' && j.done === 0)
      if (scout && c.steps % 23 === 0) go({ t: 'cancel', id: scout.id })
      if (sim.seasonDone(c)) go({ t: 'endSeason' })
      else go({ t: 'day' })
    } else if (c.phase === 'cellar') {
      const open = sim.openLots(c)
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
