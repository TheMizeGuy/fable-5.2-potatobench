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

// The land: a test-only edit of the campaign (its parcels, buildings, pond), then a redraw.
async function land(page: Page, edit: string): Promise<void> {
  await page.evaluate(edit => {
    const { app, sim } = (window as any).__county
    new Function('app', 'sim', 'c', edit)(app, sim, app.campaign)
    app.emit({ type: 'change' })
  }, edit)
}
// A clear day about a day of the year, the land edited, seen from a view (or from the playing view).
const landShot = (name: string, day: number, edit: string, v?: View, sky = 'clear'): Shot => ({
  name, size: [1920, 1080], setup: async page => {
    await playTo(page, 1977, 5, day)
    await playUntil(page, [], SKY(sky))
    if (edit) await land(page, edit)
    await settle(page)
    if (v) { await view(page, v); await frames(page, 8) }
  },
})
const WOODLOT: View = { x: -8.4, z: -22.5, dist: 40, yaw: 0.16, pitch: 0.5 }
const SWALE: View = { x: 24, z: 12.6, dist: 36, yaw: 0.3, pitch: 0.52 }
const POND_VIEW: View = { x: 38.4, z: 10.2, dist: 26, yaw: 0.3, pitch: 0.46 }
// Each stage of clearing a tract (@ is the parcel).
const CLEARING: [string, string][] = [
  ['1-standing', ''],
  ['2-half-felled', `const f = c.fields[@]; f.felled = sim.FELL_DAYS[f.cover] * 0.5`],
  ['3-stumps', `const f = c.fields[@]; f.felled = sim.FELL_DAYS[f.cover]; f.cover = 'stumps'`],
  ['4-stumping', `const f = c.fields[@]; f.felled = sim.FELL_DAYS[f.cover]; f.cover = 'stumps'; f.works = { kind: 'stump', left: 5 }`],
  ['5-rocks', `const f = c.fields[@]; f.cover = 'open'; f.stones = 0.75; f.raw = true`],
  ['6-picked', `const f = c.fields[@]; f.cover = 'open'; f.stones = 0.35; f.raw = true`],
]
const POND_BUILT = `c.buildings.push({ id: 99, kind: 'pond', yard: -1, done: 20, need: 20, built: true })`
const landShots: Shot[] = [
  ...CLEARING.map(([stage, edit]) => landShot(`c1-woodlot-${stage}`, 190, edit.replaceAll('@', '14'), WOODLOT)),
  ...CLEARING.map(([stage, edit]) => landShot(`c2-swale-${stage}`, 190, edit.replaceAll('@', '15'), SWALE)),
  landShot('c3-half-felled-playing', 190, CLEARING[1][1].replaceAll('@', '14') + '; c.fields[15].felled = 8; c.fields[16].tenure = "owned"; c.fields[16].felled = 30'),
  landShot('c4-hedgerows-0-to-4', 190, `[2, 3, 4, 5].forEach((i, k) => { c.fields[i].brushed = c.year - k })`, { x: 0, z: 6, dist: 62, yaw: 0.16, pitch: 0.56 }),
  // The bottom fields the first clear day after rain: Brook Field (left) tiled before it fell, Bottom Field not.
  {
    name: 'c5-tiled-after-rain', size: [1920, 1080], setup: async page => {
      await playTo(page, 1977, 5, 140)
      await land(page, `c.fields[4].tiled = true`)
      console.log('  ', await playUntil(page, [], `const a = sim.fieldInfo(c, 4).moistureLabel, b = sim.fieldInfo(c, 5).moistureLabel, sky = sim.today(app.world, c).sky; return a !== b && (sky === 'clear' || sky === 'cloud') ? 'tiled ' + a + ' / untiled ' + b : ''`))
      await settle(page)
      await view(page, { x: -0.3, z: 12.2, dist: 44, yaw: 0.16, pitch: 0.55 })
      await frames(page, 8)
    },
  },
  landShot('c5b-tile-laying', 135, `c.fields[5].works = { kind: 'tile', left: 4 }`, { x: 7.8, z: 12.2, dist: 30, yaw: 0.16, pitch: 0.5 }),
  landShot('c6-pond-full', 190, `${POND_BUILT}; c.pond = 6`, POND_VIEW),
  landShot('c6b-pond-low', 190, `${POND_BUILT}; c.pond = 1`, POND_VIEW),
  landShot('c6c-pond-digging', 190, `c.buildings.push({ id: 99, kind: 'pond', yard: -1, done: 9, need: 20, built: false })`, POND_VIEW),
  landShot('c7-gravel-road', 190, `c.buildings.push({ id: 98, kind: 'road', yard: -1, done: 12, need: 12, built: true })`, { x: 20, z: 2, dist: 40, yaw: 0.3, pitch: 0.5 }),
  landShot('c8-october-colour', 274, ''),
  landShot('c8b-october-ridge', 274, '', { x: -8, z: -18, dist: 30, yaw: 0.1, pitch: 0.2 }),
  landShot('m05-may', 135, ''), landShot('m06-june', 166, ''), landShot('m07-july', 196, ''),
  landShot('m08-august', 227, ''), landShot('m09-september', 258, ''), landShot('m10-october', 288, ''),
  // Picking on the tracts: what a click at each tract's pin, and a little above it in the crowns, would pick; the woodlot hovered.
  {
    name: 'c9-pick-tracts', size: [1920, 1080], setup: async page => {
      await page.evaluate(() => (window as any).__county.app.newGame(1977, 5))
      await settle(page)
      await page.evaluate(() => (window as any).__countyField.view({ x: 10, z: -8, dist: 150 }))
      await settle(page)
      console.log('  ', await page.evaluate(() => {
        const f = (window as any).__countyField
        return [14, 15, 16, 17].map(i => { const a = f.anchor(i); return `${i}: pin ${a.visible ? f.pickAt(a.x, a.y - 6).field : 'off screen'}, crowns ${a.visible ? f.pickAt(a.x, a.y - 40).field : '-'}` }).join(' | ')
      }))
      await page.evaluate(() => (window as any).__county.app.setHover(14))
      await frames(page, 30)
    },
  },
  landShot('v1-wood-edge', 190, '', { x: -24, z: -16, dist: 22, yaw: 0.5, pitch: 0.16 }),
  landShot('v2-brook', 190, '', { x: 4, z: 23.5, dist: 16, yaw: -0.7, pitch: 0.3 }),
  landShot('v3-meadow', 190, '', { x: 38, z: 6, dist: 20, yaw: -0.4, pitch: 0.2 }),
  landShot('v4-ridge-from-brook', 190, '', { x: 2, z: 4, dist: 48, yaw: 0.0, pitch: 0.12 }),
]
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
  ...landShots,
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
  { name: 'c16-dufour-winter', size: [1920, 1080], insets: NONE, setup: async page => { await yardFarm(page, { progress: 1, dufour: true, hands: 2, winter: 3 }); await settle(page); await view(page, DUFOUR_YARD); await frames(page, 8) } },
  { name: 'c30-neighbour', size: [1920, 1080], insets: NONE, setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, { x: 118, z: 46, dist: 34, yaw: 2.4, pitch: 0.42 }); await frames(page, 8) } },
  {
    // the truck that goes by on the town road now and then: wait for it, then look where it is
    name: 'c31-town-road', size: [1920, 1080], insets: NONE, setup: async page => {
      await july(page); await playUntil(page, [], SKY('clear')); await settle(page)
      for (let k = 0; k < 200; k++) {
        const t = await page.evaluate(() => (window as any).__countyField.stats().ambient % 170)
        if (t > 44 && t < 52) break
        await page.waitForTimeout(1000)
      }
      const t = await page.evaluate(() => (window as any).__countyField.stats().ambient % 170)
      const x = -230 + 500 * ((t + 1.2 - 6) / 90)
      await view(page, { x, z: 48 + 9 * Math.sin(x / 170 + 0.6) + 4 * Math.sin(x / 61) - 2, dist: 16, yaw: 0.5, pitch: 0.24 }); await frames(page, 6)
    },
  },
  ...([
    ['c20-shed', { x: 33.6, z: -5.4, dist: 13, yaw: 0.35, pitch: 0.26 }],
    ['c21-bunk', { x: 39.2, z: -12.6, dist: 12, yaw: 0.4, pitch: 0.24 }],
    ['c22-packing', { x: 32.4, z: 0.6, dist: 14, yaw: 0.02, pitch: 0.3 }],
    ['c23-station-pump', { x: 32.6, z: 6.4, dist: 13, yaw: 0.2, pitch: 0.3 }],
    ['c24-second-house', { x: 30, z: -15.5, dist: 16, yaw: 0.25, pitch: 0.26 }],
    ['c25-machines', { x: 39.8, z: -4.9, dist: 11, yaw: -1.25, pitch: 0.32 }],
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
  // ---- The light: the opening at three points of its move, and the playing view through the year's weather.
  ...[0, 0.5, 1].map((u, k) => ({ name: `L01-title-${'abc'[k]}`, size: [1920, 1080] as [number, number], insets: NONE, setup: async (page: Page) => { await page.evaluate(u => (window as any).__countyField.titleAt(u), u); await title(page) } })),
  { name: 'L02-play-july', size: [1920, 1080], setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await frames(page, 20) } },
  { name: 'L03-play-overcast', size: [1920, 1080], setup: async page => { await july(page); console.log('  ', await playUntil(page, [], SKY('overcast'))); await settle(page); await frames(page, 20) } },
  { name: 'L04-play-rain', size: [1920, 1080], setup: async page => { await july(page); console.log('  ', await playUntil(page, [], SKY('rain'))); await settle(page); await frames(page, 20) } },
  { name: 'L05-play-mist', size: [1920, 1080], setup: async page => { await playTo(page, 1977, 5, 176); console.log('  ', await playUntil(page, [], `const t = sim.today(app.world, c); return t.sky === 'fog' || (t.day.wetH >= 15 && t.day.tmin > 4 && (t.sky === 'clear' || t.sky === 'cloud')) ? t.sky + ' wetH ' + t.day.wetH : ''`)); await settle(page); await frames(page, 20) } },
  { name: 'L06-play-october', size: [1920, 1080], setup: async page => { await playTo(page, 1977, 5, 279, ['dig']); console.log('  ', await playUntil(page, ['dig'], SKY('clear'))); await settle(page); await frames(page, 20) } },
  // First snow: where a season has none before it ends, the day's air is set by hand to a snowfall's.
  { name: 'L07-play-snow', size: [1920, 1080], setup: async page => { await playTo(page, 1977, 5, 268, ['dig']); await settle(page); await page.evaluate(() => (window as any).__countyField.tune({ snow: 0.5, snowfall: 1, rain: 0, cloud: 1, cloudShadow: 0, sunScale: 0.05, deck: 1.05, haze: 0.0026, key: 0.92, storm: 0.15, high: 0, rime0: 0, rime1: 0, rime2: 0, mist: 0, wet: 0.5, dry: 0 })); await frames(page, 30) } },
  { name: 'L07b-snow-morning', size: [1920, 1080], setup: async page => { await playTo(page, 1977, 5, 268, ['dig']); await settle(page); await page.evaluate(() => (window as any).__countyField.tune({ snow: 0.62, snowfall: 0, rain: 0, cloud: 0.2, cloudShadow: 0.8, sunScale: 1, deck: 1, haze: 0.0006, key: 1, storm: 0, high: 0.5, rime0: 0, rime1: 0, rime2: 0, mist: 0.2, wet: 0.4, dry: 0, hour: -1 })); await frames(page, 30) } },
  { name: 'L08-winter-night', size: [1920, 1080], setup: async page => { await winter(page, 2); await settle(page); await frames(page, 20) } },
  { name: 'L09-close-bloom', size: [1920, 1080], setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, { x: 6, z: 12.6, dist: 10, yaw: -1.0 }); await frames(page, 30) } },
  { name: 'L10-whole-map', size: [1920, 1080], setup: async page => { await bigFarm(page, { rent: ALL_LAND, hands: 2, operator: true, until: 196 }); await playUntil(page, [], SKY('clear')); await settle(page); await page.evaluate(() => (window as any).__countyField.home()); await settle(page); await frames(page, 20) } },
  { name: 'L11-clearing-storm', size: [1920, 1080], setup: async page => { await july(page); console.log('  ', await playUntil(page, [], `const t = sim.today(app.world, c); const wet = [0, 1, 2, 3, 4, 5].filter(i => ['wet', 'standing water'].includes(sim.fieldInfo(c, i).moistureLabel)).length; return wet >= 3 && (t.sky === 'clear' || t.sky === 'cloud') ? t.sky + ', ' + wet + ' fields wet' : ''`)); await settle(page); await frames(page, 20) } },
  { name: 'L12-frost-morning', size: [1920, 1080], setup: async page => { await playTo(page, 2020, 5, 255, ['kill', 'dig']); console.log('  ', await playUntil(page, ['kill', 'dig'], FROST)); await settle(page); await frames(page, 20) } },
  { name: 'L13-walk-in', size: [1920, 1080], setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, { x: 4, z: 13, dist: 7.5, yaw: -0.5 }); await frames(page, 30) } },
  { name: 'L14-mid-zoom', size: [1920, 1080], setup: async page => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await view(page, { x: 6, z: 2, dist: 28, yaw: -0.44 }); await frames(page, 30) } },
  // Wind and cloud shadow: the same breezy day three seconds apart, to see the gusts and the shade move.
  ...[0, 3000].map((wait, k) => ({ name: `L15-wind-${'ab'[k]}`, size: [1920, 1080] as [number, number], setup: async (page: Page) => { await july(page); await playUntil(page, [], SKY('clear')); await settle(page); await page.evaluate(() => (window as any).__countyField.tune({ wind: 0.9, cloud: 0.5 })); await frames(page, 20); await page.waitForTimeout(wait) } })),
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
  // After the merge with the yards and the land: a building going up at its real site, felling at the line the land's
  // trees have come down to, and machines at rest in the shed's bays with the implements in the grass beyond.
  { name: 'w30-build-site', setup: async page => { await farm(page, SPRING); await settle(page); console.log('  ', await farm(page, `until(['build']); errs.push(sim.buildingInfo(app.campaign).filter(b => b.state === 'building').map(b => b.kind + ' ' + b.progress.toFixed(2)).join(','))`)); await hold(page, 0.8, 5200); await onUnit(page, await worker(page, 'build'), { dist: 15, yaw: 0.45, pitch: 0.42 }, 0.4, -1.6) } },
  { name: 'w31-fell-line', setup: async page => { await farm(page, `start(); hire(2); say(app.do({ t: 'begin' })); run(139, ['plant']); clear(); app.campaign.fields[14].felled = 18; app.emit({ type: 'change' }); job('fell', 14, 1)`); await settle(page); console.log('  ', await farm(page, `until(['fell']); errs.push('felled ' + sim.fieldInfo(app.campaign, 14).clearing.felled.toFixed(2))`)); await hold(page, 0.75, 5200); await onUnit(page, await worker(page, 'fell'), { dist: 13, yaw: 0, pitch: 0.75 }, 0, -0.6) } },
  { name: 'w32-shed-parked', setup: async page => { console.log('  ', await farm(page, `start(); put('shed'); for (const u of ['tractor2', 'truck', 'boom', 'harvester', 'reel']) say(app.do({ t: 'buy', upgrade: u })); say(app.do({ t: 'begin' })); run(150); clear()`)); await settle(page); await farm(page, `app.do({ t: 'day' })`); await page.waitForTimeout(4200); await view(page, { x: 36.4, z: -5.2, dist: 15, yaw: 0.3, pitch: 0.4 }); await frames(page, 10) } },
  { name: 'w24-spring-yard', size: [1920, 1080], setup: async page => { await farm(page, `start(); put('bunk'); fleet(); hire(6)`); await settle(page) } },
]
// Strips of frames, for motion: the day's work held while the people move.
interface Strip { name: string; n: number; gap: number; setup: (page: Page) => Promise<void> }
const strips: Strip[] = [
  { name: 's1-fell', n: 12, gap: 450, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['fell'])`); await hold(page, 0.75, 3000); await onUnit(page, await worker(page, 'fell'), { dist: 15, yaw: 0.5, pitch: 0.3 }, 0.5, -1) } },
  { name: 's2-walk', n: 8, gap: 160, setup: async page => { await farm(page, SUMMER); await settle(page); await farm(page, `until(['scout'])`); await seek(page, 0.5, 60, 0.05); await onUnit(page, 3, { dist: 7, yaw: 0.8, pitch: 0.3 }) } },
  { name: 's3-rocks', n: 8, gap: 400, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['rocks'])`); await hold(page, 0.75, 5200); await onUnit(page, await worker(page, 'rocks'), { ...CLOSE, dist: 12 }) } },
  { name: 's5-brush', n: 8, gap: 700, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['brush'])`); await hold(page, 0.75, 4200); await onUnit(page, await worker(page, 'brush'), { dist: 12, yaw: 0.7, pitch: 0.34 }, 0, 1.5) } },
  { name: 's6-build', n: 8, gap: 500, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['build'])`); await hold(page, 0.8, 4200); await onUnit(page, await worker(page, 'build'), { dist: 11, yaw: 0.5, pitch: 0.4 }, -0.5, 0.5) } },
  { name: 's7-alder', n: 8, gap: 500, setup: async page => { await farm(page, SPRING); await settle(page); await farm(page, `until(['fell'])`); await hold(page, 0.75, 4200); const u = await page.evaluate(() => (window as any).__county.app.campaign.season.worked.find((w: any) => w.kind === 'fell' && w.field === 15)?.unit ?? 7); await onUnit(page, u, { dist: 11, yaw: 0.6, pitch: 0.34 }, 0.6, 0) } },
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
      for (let i = 0; i < held.length; i++) {
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
    const anchors = Array.from({ length: (f.info().held ?? []).length || 18 }, (_, i) => f.anchor(i))
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
