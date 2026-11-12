// Screenshots of the field view in named states, for checking the look by eye.
// Usage: node tools/render/shots.ts <base-url> <out-dir> [name ...] [--soft]
// Start a server first: npx vite --port 5317 --strictPort   (or npm run build && npx vite preview --port 5317)
// Renders on the real GPU; --soft uses SwiftShader instead (slow, for machines without one).
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const soft = process.argv.includes('--soft')
// --pins: mark where each field's plate is pinned, to check that a plate would stand on its own field.
const pins = process.argv.includes('--pins')
// --flat: no WebGL, so the flat drawing is what is captured.
const flat = process.argv.includes('--flat')
const base = args[0] ?? 'http://localhost:5317/'
const out = args[1] ?? 'shots'
const only = new Set(args.slice(2))
mkdirSync(out, { recursive: true })

interface Insets { top?: number; right?: number; bottom?: number; left?: number }
interface View { x?: number; z?: number; dist?: number; yaw?: number; pitch?: number; fov?: number }

interface Shot {
  name: string
  size?: [number, number]
  // Screen edges covered by the interface. Default: the thin top bar and the low command card of the season screen.
  insets?: Insets
  setup: (page: Page) => Promise<void>
}

// Play a year under reference practice up to (not including) a day, optionally skipping some advice.
async function playTo(page: Page, year: number, seed: number, until: number, skip: string[] = []): Promise<void> {
  await page.evaluate(({ year, seed, until, skip }) => {
    const { app, sim } = (window as any).__county
    app.newGame(year, seed)
    app.do({ t: 'begin' })
    const c = app.campaign
    while (c.phase === 'season' && c.season.day < until) {
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || skip.includes(a.act)) continue
        if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
        else app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
  }, { year, seed, until, skip })
}

// Keep playing a day at a time until the test says so (or the season ends). Returns what the test returned.
async function playUntil(page: Page, skip: string[], test: string): Promise<string> {
  return page.evaluate(({ skip, test }) => {
    const { app, sim } = (window as any).__county
    const c = app.campaign
    const hit = new Function('app', 'sim', 'c', test)
    for (let n = 0; n < 140 && c.phase === 'season'; n++) {
      const r = hit(app, sim, c)
      if (r) return `day ${c.season.day}: ${r}`
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || skip.includes(a.act)) continue
        if (a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
    return 'not found'
  }, { skip, test })
}

// The bigger farm: a farm that rents (test-only: given the cash to) the parcels named and plants them, hires hands and an
// operator on a second tractor, and plays under reference practice up to a day.
interface Big { year?: number; seed?: number; rent?: number[]; hands?: number; operator?: boolean; until?: number; skip?: string[] }
async function bigFarm(page: Page, o: Big): Promise<string> {
  return page.evaluate(o => {
    const { app, sim } = (window as any).__county
    app.newGame(o.year ?? 1977, o.seed ?? 5)
    const c = app.campaign
    c.cash = Math.max(c.cash, 400000)
    const kinds = ['katahdin', 'superior', 'kennebec', 'gold', 'norland', 'atlantic']
    const errs: string[] = []
    const say = (r: any) => { if (!r.ok) errs.push(r.err) }
    for (const f of o.rent ?? []) {
      say(app.do({ t: 'rent', field: f }))
      say(app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: kinds[f % kinds.length], seed: 'certified' } }))
    }
    if (o.operator) { say(app.do({ t: 'buy', upgrade: 'tractor2' })); say(app.do({ t: 'hire', kind: 'operator' })) }
    for (let k = 0; k < (o.hands ?? 0); k++) say(app.do({ t: 'hire', kind: 'hand' }))
    if (o.until === undefined) return errs.join(' | ')
    say(app.do({ t: 'begin' }))
    while (c.phase === 'season' && c.season.day < o.until) {
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || (o.skip ?? []).includes(a.act)) continue
        if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
        else app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
    }
    return errs.join(' | ')
  }, o)
}
const ALL_LAND = [6, 7, 8, 9, 10, 11, 12, 13]

const SKY = (kind: string) => `return sim.today(app.world, c).sky === '${kind}' ? '${kind}' : ''`
const FROST = `const hit = [0, 1, 2, 3, 4, 5].map(i => sim.fieldInfo(c, i)).filter(f => f.frosted > 0.2 && f.rime); return hit.length ? hit.map(f => f.name + ' ' + Math.round(f.frosted * 100) + '% frosted').join(', ') : ''`

// One more day of work, left for the field view to play out.
async function step(page: Page, skip: string[] = [], only: string[] = []): Promise<void> {
  await page.evaluate(({ skip, only }) => {
    const { app, sim } = (window as any).__county
    const c = app.campaign
    for (const a of sim.advise(app.world, c)) {
      if (a.act === 'wait' || a.act === 'close' || skip.includes(a.act) || (only.length && !only.includes(a.act))) continue
      if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
      else app.do({ t: 'job', kind: a.act, field: a.field })
    }
    app.do({ t: 'day' })
  }, { skip, only })
}

// Set how many times each field has been hilled (a test-only edit of the campaign) and redraw.
async function hilled(page: Page, passes: number[]): Promise<void> {
  await page.evaluate(passes => {
    const { app } = (window as any).__county
    passes.forEach((p, i) => { const f = app.campaign.season.fields[i]; if (f.status !== 'rest') f.hillPasses = p })
    app.emit({ type: 'change' })
  }, passes)
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(n => new Promise<void>(res => {
    let k = 0
    const tick = () => (++k >= n ? res() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  }), n)
}

async function settle(page: Page): Promise<void> {
  await frames(page, 2)
  await page.evaluate(() => (window as any).__countyField.settle())
  await frames(page, 3)
}

async function seek(page: Page, t: number, waitMs: number, pace = 1): Promise<void> {
  await frames(page, 2)
  await page.evaluate(([t, pace]) => (window as any).__countyField.seek(t, pace), [t, pace])
  await page.waitForTimeout(waitMs)
}

// Close on the tractor while the day's work creeps on, so dust and wheels are in the picture and it stays in the frame.
async function onTractor(page: Page, v: View, dx = 0, dz = 0): Promise<void> {
  const t = await page.evaluate(() => (window as any).__countyField.info().tractor)
  await view(page, { ...v, x: t.x + dx, z: t.z + dz })
  await frames(page, 4)
}

const view = (page: Page, v: View) => page.evaluate(v => (window as any).__countyField.view(v), v)
const select = (page: Page, i: number, add = false) => page.evaluate(([i, add]) => (window as any).__county.app.select(i, add), [i, add] as [number, boolean])
const july = (page: Page) => playTo(page, 1977, 5, 190)
const title = async (page: Page) => {
  await page.evaluate(() => (window as any).__county.app.quitToTitle())
  await settle(page)
  // The tractor coming down past the dooryard, with its dust behind it.
  await seek(page, 0.2, 3600)
}
const NONE: Insets = {}
// Low over the rows, looking along them to the north-west.
const ROWS: View = { x: 5, z: 12.4, dist: 9, yaw: -1.32, pitch: 0.13 }
const winter = async (page: Page, months: number) => {
  await playTo(page, 1977, 5, 400)
  await page.evaluate(months => {
    const { app } = (window as any).__county
    if (app.campaign.phase === 'season') app.do({ t: 'endSeason' })
    for (let k = 0; k < months && app.campaign.phase === 'cellar'; k++) app.do({ t: 'month' })
  }, months)
}

const shots: Shot[] = [
  { name: '01-opening-1920', size: [1920, 1080], insets: NONE, setup: title },
  { name: '01-opening-1440', insets: NONE, setup: title },
  { name: '01-opening-phone', size: [390, 844], insets: NONE, setup: title },
  { name: '02-spring-plan', setup: async page => { await page.evaluate(() => (window as any).__county.app.newGame(1977, 5)); await settle(page) } },
  { name: '03-planting', setup: async page => { await playTo(page, 1977, 5, 139); await settle(page); await step(page); await seek(page, 0.5, 400) } },
  { name: '03b-planting-close', setup: async page => { await playTo(page, 1977, 5, 139); await settle(page); await step(page); await seek(page, 0.5, 900, 0.02); await onTractor(page, { dist: 12, yaw: 0.9, pitch: 0.3 }, 1.5, 0.4) } },
  { name: '04-june-emergence', setup: async page => { await playTo(page, 1977, 5, 168); await playUntil(page, [], SKY('clear')); await settle(page) } },
  { name: '05-july-bloom', setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page) } },
  { name: '05b-july-rows', setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, ROWS); await frames(page, 30) } },
  { name: '06-selected-and-hovered', setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await select(page, 3); await select(page, 4, true); await page.evaluate(() => (window as any).__county.app.setHover(0)); await settle(page); await frames(page, 30) } },
  { name: '07-rain', setup: async page => { await july(page); console.log('  ', await playUntil(page, [], SKY('rain'))); await settle(page); await frames(page, 6) } },
  { name: '08-fog-morning', setup: async page => { await playTo(page, 1977, 5, 165); console.log('  ', await playUntil(page, [], SKY('fog'))); await settle(page); await frames(page, 4) } },
  { name: '09-drought-wilt', setup: async page => { await playTo(page, 1995, 5, 222, ['water']); console.log('  ', await playUntil(page, ['water'], `const w = Math.max(...[0,1,2,3,4,5].map(i => sim.fieldInfo(c, i).wilt)); return w > 0.5 && sim.today(app.world, c).sky === 'clear' ? 'wilt ' + w.toFixed(2) : ''`)); await settle(page) } },
  { name: '10-scouted-blight', setup: async page => { await playTo(page, 1979, 5, 226, ['spray', 'rogue']); await settle(page); await select(page, 4); await settle(page) } },
  { name: '10b-blight-close', setup: async page => { await playTo(page, 1979, 5, 226, ['spray', 'rogue']); await settle(page); const f = await page.evaluate(() => { const { app, sim } = (window as any).__county; let best = -1, at = 0; for (let i = 0; i < 6; i++) { const f = sim.fieldInfo(app.campaign, i); const b = f.status === 'growing' ? f.blightHills : -1; if (b > best) { best = b; at = i } } return at }); const a = [[-8.4, -14], [7.8, -14], [-8.4, -1], [7.8, -1], [-8.4, 12], [7.8, 12]][f]; await view(page, { x: a[0], z: a[1], dist: 17, yaw: 0.4, pitch: 0.5 }); await frames(page, 6) } },
  { name: '11-first-frost', setup: async page => { await playTo(page, 2020, 5, 255, ['kill', 'dig']); console.log('  ', await playUntil(page, ['kill', 'dig'], FROST)); await settle(page) } },
  { name: '11b-frost-close', setup: async page => { await playTo(page, 2020, 5, 255, ['kill', 'dig']); await playUntil(page, ['kill', 'dig'], FROST); await settle(page); await view(page, { x: 6, z: 12, dist: 12, yaw: -0.9, pitch: 0.3 }); await frames(page, 6) } },
  { name: '12-september-dead-vines', setup: async page => { await playTo(page, 1977, 5, 252); console.log('  ', await playUntil(page, ['dig'], SKY('clear'))); await settle(page) } },
  { name: '13-dig-day', setup: async page => { await playTo(page, 1977, 5, 264); await settle(page); await step(page); await seek(page, 0.45, 1200) } },
  {
    name: '13b-dig-close', setup: async page => {
      await playTo(page, 1977, 5, 264); await settle(page); await step(page); await seek(page, 0.45, 1000); await seek(page, 0.47, 900, 0.02)
      await onTractor(page, { dist: 12, yaw: 0.9, pitch: 0.3 }, 1.5, 0.4)
    },
  },
  {
    name: '14-test-dig', setup: async page => {
      await playTo(page, 1977, 5, 203); await settle(page)
      await page.evaluate(() => { const { app } = (window as any).__county; app.do({ t: 'job', kind: 'sample', field: 2 }); app.do({ t: 'day' }) })
      await frames(page, 3)
      const seg = await page.evaluate(() => (window as any).__countyField.info())
      console.log('  ', JSON.stringify(seg.segs))
      const waited = await page.evaluate(async () => { const f = (window as any).__countyField; const t0 = performance.now(); await f.whenShown('sample', 2); f.seek(f.info().dayT, 0.004); return Math.round(performance.now() - t0) })
      console.log('  ', `the hill was up ${waited} ms after the order`)
      const t = await page.evaluate(() => { const i = (window as any).__countyField.info(); return i.farmer ?? i.tractor })
      // He stands in the furrow below the hill, facing up the slope: look back at him across it.
      await view(page, { x: t.x - 0.1, z: t.z - 0.7, dist: 6.5, yaw: 2.5, pitch: 0.62 })
      await frames(page, 20)
    },
  },
  { name: '15-winter', setup: async page => { await winter(page, 2); await settle(page); await frames(page, 6) } },
  { name: '16-thaw', setup: async page => { await winter(page, 12); await settle(page); await frames(page, 4) } },
  // Hilling: the same fields on the same day, never hilled, hilled once and hilled twice, side by side.
  { name: '17-hilling-0-1-2', setup: async page => { await playTo(page, 1977, 5, 152, ['hill']); await hilled(page, [0, 0, 1, 1, 2, 2]); await settle(page); await view(page, { x: -1, z: -1, dist: 46, yaw: 0.02, pitch: 0.62 }); await frames(page, 6) } },
  { name: '17b-hilling-close', setup: async page => { await playTo(page, 1977, 5, 152, ['hill']); await hilled(page, [0, 0, 1, 1, 2, 2]); await settle(page); await view(page, { x: -1.6, z: 5.6, dist: 10, yaw: -1.2, pitch: 0.3 }); await frames(page, 6) } },
  { name: '18-july-medium', setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await page.evaluate(() => (window as any).__county.app.setSetting('quality', 'medium')); await settle(page) } },
  { name: '19-july-low', setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await page.evaluate(() => (window as any).__county.app.setSetting('quality', 'low')); await settle(page) } },
  // A thin stand: seed planted early into cold, wet ground, with gaps where it rotted.
  {
    name: '22-thin-stand', setup: async page => {
      await page.evaluate(() => {
        const { app, sim } = (window as any).__county
        app.newGame(1977, 5)
        app.do({ t: 'begin' })
        const c = app.campaign
        for (let i = 0; i < 6; i++) app.do({ t: 'job', kind: 'plant', field: i })
        while (c.phase === 'season' && c.season.day < 178) {
          for (const a of sim.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell' && a.act !== 'plant') app.do({ t: 'job', kind: a.act, field: a.field })
          if (!app.do({ t: 'day' }).ok) break
        }
        console.log('stand', [0, 1, 2, 3, 4, 5].map(i => sim.fieldInfo(c, i).stand.toFixed(2)).join(' '))
      })
      await settle(page)
    },
  },
  // ---- The bigger farm.
  { name: 'f01-opening', size: [1920, 1080], insets: NONE, setup: title },
  { name: 'f02-whole-farm', size: [1920, 1080], setup: async page => { console.log('  ', await bigFarm(page, { rent: ALL_LAND, hands: 2, operator: true, until: 196 })); await settle(page); await page.evaluate(() => (window as any).__countyField.home()); await settle(page) } },
  { name: 'f02b-whole-farm-home', size: [1920, 1080], setup: async page => { await bigFarm(page, { rent: ALL_LAND, hands: 2, operator: true, until: 196 }); await settle(page) } },
  { name: 'f03-spring-land', size: [1920, 1080], setup: async page => { await bigFarm(page, {}); await settle(page) } },
  { name: 'f03b-spring-whole', size: [1920, 1080], setup: async page => { await bigFarm(page, { rent: [7] }); await settle(page); await page.evaluate(() => (window as any).__county.app.select(10)); await page.evaluate(() => (window as any).__countyField.view({ x: 30, z: 4, dist: 170 })); await settle(page) } },
  { name: 'f04-dufour', size: [1920, 1080], setup: async page => { await bigFarm(page, { rent: [10, 11, 12, 13], hands: 1, operator: true, until: 198 }); await settle(page); await view(page, { x: 72, z: -6, dist: 48, yaw: 0.35 }); await frames(page, 8) } },
  { name: 'f05-intervale-mist', size: [1920, 1080], setup: async page => { await bigFarm(page, { rent: [6, 7], until: 186 }); console.log('  ', await playUntil(page, [], `const t = sim.today(app.world, c); return t.sky === 'fog' || (t.day.wetH >= 12 && t.day.tmin > 4) ? t.sky + ' wetH ' + t.day.wetH : ''`)); await settle(page); await view(page, { x: 2, z: 30, dist: 46, yaw: 0.1 }); await frames(page, 8) } },
  {
    name: 'f06-three-crews', size: [1920, 1080], setup: async page => {
      await bigFarm(page, { hands: 2, operator: true, until: 150 })
      console.log('  ', await playUntil(page, [], `const n = new Set(c.season.worked.map(w => w.unit)).size; return n >= 3 && sim.today(app.world, c).sky !== 'rain' ? n + ' crews: ' + c.season.worked.map(w => w.unit + ':' + w.kind + '@' + w.field).join(' ') : ''`))
      await settle(page)
      await page.evaluate(() => (window as any).__county.app.selectUnit(0))
      await seek(page, 0.55, 300, 0.02)
      await frames(page, 6)
    },
  },
  { name: 'f07-strategic-july', size: [1920, 1080], setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page) } },
  { name: 'f08-close-rows', size: [1920, 1080], setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, ROWS); await frames(page, 30) } },
  { name: 'f09-fog', size: [1920, 1080], setup: async page => { await bigFarm(page, { rent: [6, 7], until: 165 }); console.log('  ', await playUntil(page, [], SKY('fog'))); await settle(page); await frames(page, 4) } },
  // Sizes: the farm kept whole inside what the interface leaves free.
  ...([
    ['30-size-390x844', [390, 844], { top: 52, bottom: 190 }],
    ['31-size-844x390', [844, 390], { top: 44, bottom: 96 }],
    ['32-size-1024x700', [1024, 700], { top: 52, bottom: 150 }],
    ['33-size-1920x1080', [1920, 1080], { top: 56, bottom: 160 }],
  ] as [string, [number, number], Insets][]).map(([name, size, insets]) => ({ name, size, insets, setup: async (page: Page) => { await july(page); await settle(page) } })),
]

// ---- People, machines and work: states reached through the app's own commands, with a little test-only help (cash,
// a bunkhouse and a machine shed already standing) so that a farm of twelve can be had on the first day.
const PRE = `
  const { app, sim } = window.__county
  const errs = []
  const say = r => { if (r && !r.ok) errs.push(r.err) }
  const put = (kind, yard = -1) => { const c = app.campaign; const b = sim.buildingInfo(c).find(x => x.kind === kind && x.yard === yard); c.buildings.push({ id: c.nextBuilding++, kind, yard, done: b ? b.days : 10, need: b ? b.days : 10, built: true }) }
  const start = (seed = 5, year = 1977) => { app.newGame(year, seed); app.campaign.cash = 900000 }
  const able = () => { for (const u of app.campaign.crew) for (const w of ['machine', 'field', 'woods', 'build', 'pack']) app.do({ t: 'priority', unit: u.id, work: w, level: 2 }) }
  const hire = n => { for (let k = 0; k < n; k++) say(app.do({ t: 'hire', kind: 'hand' })); able() }
  const fleet = () => { put('shed'); say(app.do({ t: 'buy', upgrade: 'tractor2' })); say(app.do({ t: 'buy', upgrade: 'tractor3' })); say(app.do({ t: 'buy', upgrade: 'truck' })) }
  const run = (until, skip = []) => { const c = app.campaign; while (c.phase === 'season' && c.season.day < until) { for (const a of sim.advise(app.world, c)) { if (a.act === 'wait' || a.act === 'close' || a.act === 'sell' || skip.includes(a.act)) continue; app.do({ t: 'job', kind: a.act, field: a.field }) } if (!app.do({ t: 'day' }).ok) break } }
  const job = (kind, field, unit) => say(app.do(unit === undefined ? { t: 'job', kind, field } : { t: 'job', kind, field, unit }))
  const clear = () => { const s = app.campaign.season; for (const j of s.jobs.slice()) app.do({ t: 'cancel', id: j.id }) }
  // days until the work named has all been done on one day (or a week has gone by)
  const until = (kinds, max = 7) => { const c = app.campaign; for (let n = 0; n < max; n++) { say(app.do({ t: 'day' })); if (kinds.every(k => c.season.worked.some(w => w.kind === k))) return } errs.push('never: ' + kinds.filter(k => !c.season.worked.some(w => w.kind === k)).join(',')) }
  // follow the advice a day at a time until the work named is done
  const seekWork = (kind, skip = [], max = 90) => { const c = app.campaign; for (let n = 0; n < max && c.phase === 'season'; n++) { for (const a of sim.advise(app.world, c)) { if (a.act === 'wait' || a.act === 'close' || a.act === 'sell' || skip.includes(a.act)) continue; app.do({ t: 'job', kind: a.act, field: a.field }) } app.do({ t: 'day' }); if (c.season.worked.some(w => w.kind === kind)) return } errs.push('never: ' + kind) }
  const only = (units, work) => { for (const u of app.campaign.crew) for (const w of ['machine', 'field', 'woods', 'build', 'pack']) app.do({ t: 'priority', unit: u.id, work: w, level: w === work ? (units.includes(u.id) ? 1 : 0) : (units.includes(u.id) ? 0 : 2) }) }
  const told = () => errs.join(' | ') + ' :: ' + (app.campaign.season ? app.campaign.season.worked.map(w => w.unit + ':' + w.kind + '@' + w.field).join(' ') : app.campaign.phase)
`
const farm = (page: Page, body: string): Promise<string> => page.evaluate(`(() => { ${PRE}; ${body}; return told() })()`)
// The camera on one person, wherever their day has them.
async function onUnit(page: Page, id: number, v: View, dx = 0, dz = 0): Promise<void> {
  await frames(page, 3)
  const u = await page.evaluate(id => (window as any).__countyField.info().units.find((x: any) => x.id === id), id)
  if (u) await view(page, { ...v, x: u.x + dx, z: u.z + dz })
  await frames(page, 6)
}
// The day's work held part way through, the people moving at their own pace.
const hold = async (page: Page, t = 0.7, ms = 1500) => { await seek(page, t, 60, 0.004); await page.waitForTimeout(ms) }
const worker = (page: Page, kind: string): Promise<number> => page.evaluate(kind => (window as any).__county.app.campaign.season.worked.find((w: any) => w.kind === kind)?.unit ?? 0, kind)
const CLOSE: View = { dist: 11, yaw: 0.7, pitch: 0.34 }
// A farm of twelve at spring work: three tractors planting, rocks, felling, brush, building, a truck.
const SPRING = `start(); put('bunk'); app.do({ t: 'rent', field: 10 }); put('bunk', -2); fleet(); hire(11); say(app.do({ t: 'begin' })); run(139, ['plant']); clear(); only([9, 10, 11], 'build')
  job('plant', 0, 0); job('plant', 2, 1); job('plant', 4, 2); job('rocks', 1, 3); job('fell', 14, 4); job('brush', 5, 5); job('rocks', 3, 6); job('fell', 15, 7); job('fell', 14, 8)
  say(app.do({ t: 'build', kind: 'packing', yard: -1 })); say(app.do({ t: 'build', kind: 'shed', yard: -1 })); say(app.do({ t: 'build', kind: 'house', yard: -1 })); errs.push(app.campaign.crew.length + ' people')`
const SUMMER = `start(); put('bunk'); fleet(); hire(5); say(app.do({ t: 'begin' })); run(186); clear()
  job('spray', 0, 0); job('scout', 2, 3); job('sample', 5, 4); job('water', 4, 1); job('hill', 2, 2); job('brush', 4, 5)`
const HARVEST = `start(); put('bunk'); fleet(); hire(4); say(app.do({ t: 'begin' })); run(263, ['dig']); clear(); say(app.do({ t: 'pickers', on: true }))`
const SUNDAY = `start(); put('bunk'); hire(6); say(app.do({ t: 'begin' })); run(170); for (let n = 0; n < 8 && sim.workday(app.campaign, app.campaign.season); n++) app.do({ t: 'day' }); errs.push('workday ' + sim.workday(app.campaign, app.campaign.season))`

const people: Shot[] = [
  { name: 'w01-twelve-play', size: [1920, 1080], setup: async page => { console.log('  ', await farm(page, SPRING)); await settle(page); console.log('  ', await farm(page, `until(['plant', 'rocks', 'fell', 'build'])`)); await hold(page, 0.62) } },
  { name: 'w02-plant-close', setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['plant'])`); await hold(page, 0.55); await onTractor(page, { dist: 12, yaw: 0.9, pitch: 0.3 }, 1.2, 0.3) } },
  { name: 'w03-rocks-close', setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['rocks'])`); await hold(page, 0.75, 5200); await onUnit(page, await worker(page, 'rocks'), { ...CLOSE, dist: 13 }) } },
  { name: 'w04-fell-close', setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['fell'])`); await hold(page, 0.75, 4200); await onUnit(page, await worker(page, 'fell'), { dist: 15, yaw: 0.5, pitch: 0.3 }, 0.5, -1) } },
  { name: 'w05-brush-close', setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['brush'])`); await hold(page, 0.75, 4200); await onUnit(page, await worker(page, 'brush'), { ...CLOSE, dist: 13 }) } },
  { name: 'w06-build-close', setup: async page => { await farm(page, SPRING); await settle(page); console.log('  ', await farm(page, `until(['build'])`)); await hold(page, 0.8, 4200); await onUnit(page, await worker(page, 'build'), { dist: 13, yaw: -1.9, pitch: 0.34 }) } },
  { name: 'w07-summer-play', size: [1920, 1080], setup: async page => { console.log('  ', await farm(page, SUMMER)); await settle(page); console.log('  ', await farm(page, `until(['spray', 'scout', 'sample'])`)); await hold(page, 0.66) } },
  { name: 'w08-spray-close', setup: async page => { await farm(page, SUMMER); await settle(page); await farm(page, `until(['spray'])`); await hold(page, 0.5, 1800); await onTractor(page, { dist: 13, yaw: 0.9, pitch: 0.3 }, 1.2, 0.3) } },
  { name: 'w09-scout-close', setup: async page => { await farm(page, SUMMER); await settle(page); await farm(page, `until(['scout'])`); await hold(page, 0.66, 1500); await onUnit(page, 3, { dist: 8, yaw: 0.8, pitch: 0.36 }) } },
  { name: 'w10-water-close', setup: async page => { await farm(page, SUMMER); await settle(page); console.log('  ', await farm(page, `until(['water'])`)); await hold(page, 0.6, 1800); await onUnit(page, 1, { dist: 15, yaw: 0.9, pitch: 0.3 }) } },
  { name: 'w11-hill-close', setup: async page => { await farm(page, `start(); say(app.do({ t: 'begin' })); run(160, ['hill']); clear(); job('hill', 0, 0)`); await settle(page); console.log('  ', await farm(page, `until(['hill'])`)); await hold(page, 0.55, 1200); await onTractor(page, { dist: 12, yaw: 0.9, pitch: 0.3 }, 1.2, 0.3) } },
  { name: 'w12-rogue-close', setup: async page => { await farm(page, `start(5, 1979); hire(1); say(app.do({ t: 'begin' })); run(200, ['spray', 'rogue'])`); await settle(page); console.log('  ', await farm(page, `seekWork('rogue', ['spray'])`)); await hold(page, 0.6, 1500); await onUnit(page, await worker(page, 'rogue'), { dist: 8, yaw: 0.8, pitch: 0.36 }) } },
  { name: 'w13-kill-close', setup: async page => { await farm(page, `start(); say(app.do({ t: 'begin' })); run(244, ['kill']); clear(); job('kill', 0, 0)`); await settle(page); console.log('  ', await farm(page, `until(['kill'])`)); await hold(page, 0.55, 1200); await onTractor(page, { dist: 12, yaw: 0.9, pitch: 0.3 }, 1.2, 0.3) } },
  { name: 'w14-harvest-play', size: [1920, 1080], setup: async page => { console.log('  ', await farm(page, HARVEST)); await settle(page); console.log('  ', await farm(page, `job('dig', 0, 0); job('dig', 2, 1); until(['dig']); until(['haul'], 3)`)); await seek(page, 0.3, 2400); await hold(page, 0.62, 1200) } },
  { name: 'w15-pickers-close', setup: async page => { await farm(page, HARVEST); await settle(page); await farm(page, `job('dig', 0, 0); until(['dig'])`); await seek(page, 0.3, 2600); await hold(page, 0.5, 600); await view(page, { x: -8, z: -14.5, dist: 17, yaw: 0.6, pitch: 0.36 }); await frames(page, 8) } },
  { name: 'w16-haul-load', setup: async page => { await farm(page, HARVEST); await settle(page); console.log('  ', await farm(page, `job('dig', 0, 0); until(['dig']); until(['haul'], 4)`)); await seek(page, 0.3, 2600); await hold(page, 0.45, 1200); await onUnit(page, await worker(page, 'haul'), { dist: 13, yaw: 2.2, pitch: 0.32 }) } },
  { name: 'w17-haul-unload', setup: async page => { await farm(page, HARVEST); await settle(page); await farm(page, `job('dig', 0, 0); until(['dig']); until(['haul'], 4)`); await seek(page, 0.3, 2600); await hold(page, 0.8, 1200); await onUnit(page, await worker(page, 'haul'), { dist: 14, yaw: 0.9, pitch: 0.32 }) } },
  { name: 'w18-sunday', setup: async page => { console.log('  ', await farm(page, SUNDAY)); await settle(page); await farm(page, `app.do({ t: 'day' })`); await page.waitForTimeout(4200); await view(page, { x: 20.6, z: 1.6, dist: 12, yaw: 1.0, pitch: 0.34 }); await frames(page, 10) } },
  { name: 'w18b-sunday-play', size: [1920, 1080], setup: async page => { await farm(page, SUNDAY); await settle(page); await farm(page, `app.do({ t: 'day' })`); await page.waitForTimeout(4200) } },
  { name: 'w19-breakdown', setup: async page => { console.log('  ', await farm(page, `start(); hire(1); say(app.do({ t: 'begin' })); run(186); clear(); job('spray', 0, 0); until(['spray']); const c = app.campaign; c.broken.push(c.season.day + 3); c.incidents.push({ id: c.nextIncident++, kind: 'breakdown', day: c.season.day, until: c.season.day + 4, choices: ['rush', 'wait'], unit: 0, back: c.season.day + 3 }); app.emit({ type: 'change' })`)); await settle(page); await farm(page, `app.do({ t: 'day' })`); await page.waitForTimeout(3600); await onTractor(page, { dist: 10, yaw: 0.9, pitch: 0.3 }, 0.6, 0.2) } },
  { name: 'w20-callers', setup: async page => { await farm(page, `start(); hire(2); say(app.do({ t: 'begin' })); run(186); const c = app.campaign, d = c.season.day; c.incidents.push({ id: c.nextIncident++, kind: 'poach', day: d, until: d + 4, choices: ['match', 'refuse'], unit: 1, wage: 900 }, { id: c.nextIncident++, kind: 'buyer', day: d, until: d + 7, choices: ['take', 'refuse'], lot: 0 }, { id: c.nextIncident++, kind: 'applicant', day: d, until: d + 4, choices: ['hire', 'refuse'], applicant: { id: 99, name: 'Test', skills: { machine: 3, field: 3, woods: 3, build: 3, pack: 3 }, trait: 'strong', ask: 700 } }); app.emit({ type: 'change' })`); await settle(page); await view(page, { x: 20.6, z: -3.6, dist: 26, yaw: 0.9, pitch: 0.4 }); await frames(page, 10) } },
  { name: 'w21-winter-fell', setup: async page => { console.log('  ', await farm(page, `start(); put('bunk'); hire(3); say(app.do({ t: 'begin' })); run(400); if (app.campaign.phase === 'season') app.do({ t: 'endSeason' }); for (const u of [0, 1]) say(app.do({ t: 'winter', unit: u, work: 'woods', field: 14 })); app.do({ t: 'month' }); errs.push(app.campaign.phase + ' ' + app.campaign.crew.map(u => u.winter + u.winterField).join(','))`)); await settle(page); await page.waitForTimeout(5200); await view(page, { x: -7.6, z: -24.4, dist: 15, yaw: 0.5, pitch: 0.3 }); await frames(page, 10) } },
  { name: 'w21b-winter-play', size: [1920, 1080], setup: async page => { await farm(page, `start(); put('bunk'); put('packing'); hire(4); say(app.do({ t: 'begin' })); run(400); if (app.campaign.phase === 'season') app.do({ t: 'endSeason' }); for (const u of [0, 1]) say(app.do({ t: 'winter', unit: u, work: 'woods', field: 14 })); for (const u of [3, 4]) say(app.do({ t: 'winter', unit: u, work: 'pack' })); app.do({ t: 'month' })`); await settle(page); await page.waitForTimeout(5200) } },
  { name: 'w22-figures', setup: async page => { await farm(page, `start(); put('bunk'); app.do({ t: 'rent', field: 10 }); put('bunk', -2); hire(11)`); await settle(page); await view(page, { x: 21.2, z: -7.2, dist: 7.5, yaw: 1.3, pitch: 0.2 }); await frames(page, 10) } },
  { name: 'w23-machines', setup: async page => { await farm(page, `start(); fleet()`); await settle(page); await view(page, { x: 23.6, z: -11.4, dist: 11, yaw: 1.2, pitch: 0.3 }); await frames(page, 10) } },
  { name: 'w25-harvester', setup: async page => { await farm(page, `start(); say(app.do({ t: 'buy', upgrade: 'harvester' })); say(app.do({ t: 'begin' })); run(263, ['dig']); clear(); job('dig', 0, 0)`); await settle(page); console.log('  ', await farm(page, `until(['dig'])`)); await seek(page, 0.45, 1000); await seek(page, 0.47, 900, 0.02); await onTractor(page, { dist: 13, yaw: 0.9, pitch: 0.3 }, 1.5, 0.4) } },
  { name: 'w26-reel', setup: async page => { await farm(page, `start(); say(app.do({ t: 'buy', upgrade: 'reel' })); say(app.do({ t: 'begin' })); run(196); clear(); job('water', 5, 0)`); await settle(page); console.log('  ', await farm(page, `until(['water'])`)); await hold(page, 0.6, 3000); await view(page, { x: 9, z: 12.2, dist: 22, yaw: 0.5, pitch: 0.36 }); await frames(page, 8) } },
  { name: 'w27-pond-pipe', setup: async page => { await farm(page, `start(); put('pond'); app.campaign.pond = 6; say(app.do({ t: 'begin' })); run(196); app.campaign.pond = 6; clear(); job('water', 5, 0)`); await settle(page); console.log('  ', await farm(page, `until(['water'])`)); await hold(page, 0.6, 3000); await view(page, { x: 9, z: 12.2, dist: 22, yaw: 0.5, pitch: 0.36 }); await frames(page, 8) } },
  { name: 'w28-worn-out', setup: async page => { await farm(page, `start(); put('bunk'); hire(3); say(app.do({ t: 'begin' })); run(186); clear(); const c = app.campaign; c.crew[1].out = c.season.day + 6; c.crew[2].tired = 0.95; c.crew[3].mood = 0.05; job('scout', 2, 2); job('scout', 4, 3)`); await settle(page); console.log('  ', await farm(page, `app.do({ t: 'day' })`)); await page.waitForTimeout(4600); await onUnit(page, 2, { dist: 8, yaw: 0.8, pitch: 0.3 }) } },
  { name: 'w29-laid-up', setup: async page => { await farm(page, `start(); put('bunk'); hire(3); say(app.do({ t: 'begin' })); run(186); clear(); const c = app.campaign; c.crew[1].out = c.season.day + 6; app.emit({ type: 'change' })`); await settle(page); await farm(page, `app.do({ t: 'day' })`); await page.waitForTimeout(4600); await onUnit(page, 1, { dist: 7, yaw: 1.0, pitch: 0.3 }) } },
  { name: 'w24-spring-yard', size: [1920, 1080], setup: async page => { await farm(page, `start(); put('bunk'); fleet(); hire(6)`); await settle(page) } },
]
// Strips of frames, for motion: the day's work held while the people move.
interface Strip { name: string; n: number; gap: number; setup: (page: Page) => Promise<void> }
const strips: Strip[] = [
  { name: 's1-fell', n: 12, gap: 450, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['fell'])`); await hold(page, 0.75, 3000); await onUnit(page, await worker(page, 'fell'), { dist: 15, yaw: 0.5, pitch: 0.3 }, 0.5, -1) } },
  { name: 's2-walk', n: 8, gap: 160, setup: async page => { await farm(page, SUMMER); await settle(page); await farm(page, `until(['scout'])`); await seek(page, 0.5, 60, 0.05); await onUnit(page, 3, { dist: 7, yaw: 0.8, pitch: 0.3 }) } },
  { name: 's3-rocks', n: 8, gap: 400, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['rocks'])`); await hold(page, 0.75, 5200); await onUnit(page, await worker(page, 'rocks'), { ...CLOSE, dist: 12 }) } },
  { name: 's4-clock', n: 10, gap: 340, setup: async page => { await farm(page, SPRING); await settle(page); await page.evaluate(() => (window as any).__county.app.setSpeed(1)) } },
]
shots.push(...people)

const browser = await chromium.launch({
  args: flat ? ['--disable-webgl', '--disable-3d-apis'] : soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const errors: string[] = []
for (const shot of shots) {
  if (only.size && !only.has(shot.name) && ![...only].some(o => o.endsWith('*') && shot.name.startsWith(o.slice(0, -1)))) continue
  const [w, h] = shot.size ?? [1440, 900]
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', m => { if (m.type() === 'error') errors.push(`${shot.name}: ${m.text()}`); else if (m.text().startsWith('stand')) console.log('  ', m.text()) })
  page.on('pageerror', e => errors.push(`${shot.name}: ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField !== undefined)
  // The interface is hidden; the screen edges it would cover are held as given.
  const insets = shot.insets ?? { top: 56, bottom: 150 }
  await page.evaluate(i => {
    const { app } = (window as any).__county
    for (const el of [...document.body.children]) if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.display = 'none'
    const t = i.top ?? 0, r = i.right ?? 0, b = i.bottom ?? 0, l = i.left ?? 0
    const set = app.setInsets.bind(app)
    app.setInsets = () => set(t, r, b, l)
    set(t, r, b, l)
  }, insets)
  await shot.setup(page)
  if (pins) {
    await page.evaluate(() => {
      const f = (window as any).__countyField, held = f.info().held as boolean[]
      for (let i = 0; i < 14; i++) {
        const a = f.anchor(i)
        if (!a.visible) continue
        const d = document.createElement('div')
        d.textContent = String(i)
        d.style.cssText = `position:fixed;left:${a.x - 18}px;top:${a.y - 26}px;width:36px;height:22px;background:${held[i] ? '#1b1d1c' : '#5b5f5c'};color:#f3ecdc;font:600 13px sans-serif;display:flex;align-items:center;justify-content:center;border-radius:3px;z-index:99`
        const tail = document.createElement('div')
        tail.style.cssText = `position:fixed;left:${a.x - 3}px;top:${a.y - 4}px;width:6px;height:6px;background:#f3ecdc;border-radius:3px;z-index:99`
        document.body.append(d, tail)
      }
    })
  }
  const path = `${out}/${shot.name}.png`
  await page.screenshot({ path })
  const info = await page.evaluate(() => {
    const f = (window as any).__countyField
    const anchors = Array.from({ length: 14 }, (_, i) => f.anchor(i))
    const s = f.stats ? f.stats() : {}
    return { ...f.info(), anchors: anchors.map((a: any) => (a.visible ? `${Math.round(a.x)},${Math.round(a.y)}` : 'off')).join(' '), triangles: s.triangles, calls: s.calls, fps: s.fps }
  })
  console.log(path, JSON.stringify(info))
  await page.close()
}
for (const strip of strips) {
  if (!only.size || (!only.has(strip.name) && ![...only].some(o => o.endsWith('*') && strip.name.startsWith(o.slice(0, -1))))) continue
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  page.on('pageerror', e => errors.push(`${strip.name}: ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => (window as any).__countyField !== undefined)
  await page.evaluate(() => {
    const { app } = (window as any).__county
    for (const el of [...document.body.children]) if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.display = 'none'
    const set = app.setInsets.bind(app)
    app.setInsets = () => set(56, 0, 150, 0)
    set(56, 0, 150, 0)
  })
  await strip.setup(page)
  for (let k = 0; k < strip.n; k++) {
    await page.screenshot({ path: `${out}/${strip.name}.${String(k).padStart(2, '0')}.png` })
    await page.waitForTimeout(strip.gap)
  }
  console.log(`${out}/${strip.name}: ${strip.n} frames`)
  await page.close()
}
await browser.close()
if (errors.length) {
  console.log('console errors:')
  for (const e of errors) console.log('  ' + e)
}
