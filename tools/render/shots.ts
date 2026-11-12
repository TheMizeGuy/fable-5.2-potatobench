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

// The farmstead with buildings standing or going up (a test-only edit of the campaign): every kind at `progress`
// (1: built), logs and stone in the yard, the machines bought, hands hired; played to a July day, or on into winter.
interface YardFarm { progress?: number; logs?: number; stone?: number; machines?: boolean; hands?: number; dufour?: boolean; until?: number; winter?: number; only?: string[] }
async function yardFarm(page: Page, o: YardFarm): Promise<void> {
  await page.evaluate(o => {
    const { app, sim } = (window as any).__county
    app.newGame(1977, 5)
    const c = app.campaign
    c.cash = Math.max(c.cash, 600000)
    if (o.dufour) for (const f of [10, 11]) { app.do({ t: 'rent', field: f }); app.do({ t: 'plan', field: f, plan: { crop: 'potato', variety: 'katahdin', seed: 'certified' } }) }
    if (o.progress !== undefined) {
      for (const kind of sim.BUILDING_KINDS) {
        if (o.only && !o.only.includes(kind)) continue
        for (const yard of sim.BUILDINGS[kind].dufour && o.dufour ? [-1, -2] : [-1]) {
          const need = sim.BUILDINGS[kind].days
          c.buildings.push({ id: c.nextBuilding++, kind, yard, done: need * o.progress, need, built: o.progress >= 1 })
        }
      }
    }
    if (o.machines) for (const u of ['boom', 'harvester', 'reel', 'tractor2', 'tractor3', 'truck']) c.upgrades[u] = true
    for (let k = 0; k < (o.hands ?? 0); k++) app.do({ t: 'hire', kind: 'hand' })
    c.logs = o.logs ?? 0
    c.stone = o.stone ?? 0
    app.do({ t: 'begin' })
    const until = o.winter ? 400 : o.until ?? 196
    while (c.phase === 'season' && c.season.day < until) {
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || a.act === 'build') continue
        if (a.act === 'sell') app.do({ t: 'sell', lot: a.lot, frac: 1 })
        else app.do({ t: 'job', kind: a.act, field: a.field })
      }
      if (!app.do({ t: 'day' }).ok) break
      c.logs = o.logs ?? 0
      c.stone = o.stone ?? 0
    }
    if (o.winter) {
      if (c.phase === 'season') app.do({ t: 'endSeason' })
      for (let k = 0; k < o.winter && c.phase === 'cellar'; k++) app.do({ t: 'month' })
    }
    // the farm's own people will have worked on them meanwhile: put each back where the picture wants it
    if (o.progress !== undefined) for (const b of c.buildings) { b.done = b.need * o.progress; b.built = o.progress >= 1 }
    app.emit({ type: 'change' })
  }, o)
}
const BACK_YARD: View = { x: 31.5, z: -6.5, dist: 46, yaw: 0.32, pitch: 0.5 }
const DOORYARD: View = { x: 21.4, z: -4.2, dist: 17, yaw: 1.0, pitch: 0.36 }
const DUFOUR_YARD: View = { x: 91.5, z: -6, dist: 34, yaw: 0.5, pitch: 0.4 }

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
  // ---- Buildings and yards.
  ...([
    ['b02-yard', { x: 23.5, z: -5, dist: 34, yaw: 0.7, pitch: 0.36 }],
    ['b03-house', { x: 22.6, z: 2.6, dist: 13, yaw: 0.95, pitch: 0.2 }],
    ['b04-barn', { x: 23.2, z: -7, dist: 17, yaw: 0.85, pitch: 0.24 }],
    ['b05-potato-house', { x: 23.6, z: -15.2, dist: 14, yaw: 0.3, pitch: 0.22 }],
    ['b06-dufour-yard', { x: 92.4, z: -5, dist: 30, yaw: 0.55, pitch: 0.36 }],
    ['b07-back-yard', { x: 27, z: 1, dist: 20, yaw: -0.5, pitch: 0.4 }],
  ] as [string, View][]).map(([name, v]) => ({ name, size: [1920, 1080] as [number, number], insets: NONE, setup: async (page: Page) => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, v); await frames(page, 8) } })),
  // The farm's own buildings, set as the game would have them (a test-only edit of the campaign), each at a stage.
  ...([0.04, 0.2, 0.42, 0.68, 0.92, 1] as number[]).map((p, k) => ({
    name: `c0${k + 1}-raising-${Math.round(p * 100)}`, size: [1920, 1080] as [number, number], insets: NONE,
    setup: async (page: Page) => { await yardFarm(page, { progress: p, logs: 12 + k * 8, stone: 40 - k * 7 }); await settle(page); await view(page, BACK_YARD); await frames(page, 8) },
  })),
  { name: 'c07-all-built-home', size: [1920, 1080], setup: async page => { await yardFarm(page, { progress: 1, logs: 34, stone: 26, machines: true, hands: 3 }); await settle(page) } },
  { name: 'c08-half-built-home', size: [1920, 1080], setup: async page => { await yardFarm(page, { progress: 0.5, logs: 8, stone: 12 }); await settle(page) } },
  { name: 'c09-dufour-built', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { progress: 1, dufour: true, hands: 2 }); await settle(page); await view(page, DUFOUR_YARD); await frames(page, 8) } },
  { name: 'c10-dufour-raising', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { progress: 0.5, dufour: true }); await settle(page); await view(page, DUFOUR_YARD); await frames(page, 8) } },
  { name: 'c11-stand-open', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { progress: 1, until: 250 }); console.log('  ', await playUntil(page, [], `return sim.standInfo(c).open && sim.today(app.world, c).sky === 'clear' ? 'open' : ''`)); await settle(page); await view(page, { x: 19.6, z: 19.2, dist: 9, yaw: 1.35, pitch: 0.26 }); await frames(page, 8) } },
  { name: 'c12-piles-empty', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { logs: 0, stone: 0 }); await settle(page); await view(page, DOORYARD); await frames(page, 8) } },
  { name: 'c13-piles-full', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { logs: 60, stone: 70 }); await settle(page); await view(page, DOORYARD); await frames(page, 8) } },
  { name: 'c14-yard-dusk-snow', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { progress: 1, logs: 20, stone: 10, machines: true, hands: 3, winter: 2 }); await settle(page); await view(page, { x: 27, z: -5, dist: 40, yaw: 0.55, pitch: 0.34 }); await frames(page, 8) } },
  { name: 'c15-yard-winter-home', size: [1920, 1080], setup: async page => { await yardFarm(page, { progress: 1, logs: 20, stone: 10, machines: true, hands: 3, winter: 3 }); await settle(page) } },
  ...([
    ['c20-shed', { x: 33.6, z: -5.4, dist: 13, yaw: 0.35, pitch: 0.26 }],
    ['c21-bunk', { x: 39.2, z: -12.6, dist: 12, yaw: 0.4, pitch: 0.24 }],
    ['c22-packing', { x: 32.4, z: 0.6, dist: 14, yaw: 0.02, pitch: 0.3 }],
    ['c23-station-pump', { x: 32.6, z: 6.4, dist: 13, yaw: 0.2, pitch: 0.3 }],
    ['c24-second-house', { x: 30, z: -15.5, dist: 16, yaw: 0.25, pitch: 0.26 }],
    ['c25-machines', { x: 39.6, z: -4.6, dist: 12, yaw: 0.3, pitch: 0.3 }],
    ['c26-dooryard', { x: 21.2, z: 1.2, dist: 12, yaw: 1.25, pitch: 0.2 }],
    ['c27-yard-selected', { x: 30, z: -7, dist: 62, yaw: 0.16, pitch: 0.58 }],
  ] as [string, View][]).map(([name, v]) => ({
    name, size: [1920, 1080] as [number, number], insets: NONE,
    setup: async (page: Page) => {
      await yardFarm(page, name === 'c27-yard-selected' ? { progress: 0.5, only: ['shed', 'bunk'] } : { progress: 1, logs: 30, stone: 24, machines: true, hands: 3 })
      if (name === 'c27-yard-selected') await page.evaluate(() => (window as any).__county.app.selectYard(-1))
      await settle(page); await view(page, v); await frames(page, 8)
    },
  })),
  // Sizes: the farm kept whole inside what the interface leaves free.
  ...([
    ['30-size-390x844', [390, 844], { top: 52, bottom: 190 }],
    ['31-size-844x390', [844, 390], { top: 44, bottom: 96 }],
    ['32-size-1024x700', [1024, 700], { top: 52, bottom: 150 }],
    ['33-size-1920x1080', [1920, 1080], { top: 56, bottom: 160 }],
  ] as [string, [number, number], Insets][]).map(([name, size, insets]) => ({ name, size, insets, setup: async (page: Page) => { await july(page); await settle(page) } })),
]

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
await browser.close()
if (errors.length) {
  console.log('console errors:')
  for (const e of errors) console.log('  ' + e)
}
