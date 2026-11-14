// A long day, watched: a film strip of one day at the clock's first speed, and what the people and machines did in
// it, measured. Starts a farm, runs to the day a kind of work is first wanted, gives the order, sets the clock going
// and takes a picture every so often to the day's end; with each picture, where everyone is seen.
// Prints: how fast anyone was seen to go (m/s, as at the first speed), every jump (seen to move further between two
// looks than their fastest pace allows, while in sight), and how the ground shown worked kept up with the machine.
// Usage: node tools/render/day.ts <url> <out dir> [--job=plant] [--pace=3] [--frames=28] [--size=1440x900] [--days=1] [--dist=200] [--order=14.5]
//   --pace: how many times quicker than the first speed the day is run for the film (the day is the same day; the
//           speeds printed are as they are at the first speed)
//   --order: also give a second order part way through the day (the hour, 6 to 17): rocks on a resting field
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/day'] = args.filter(a => !a.startsWith('--'))
const opt = (name: string, d: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d
const job = opt('job', 'plant'), pace = Number(opt('pace', '3')), frames = Number(opt('frames', '28')), days = Number(opt('days', '1')), dist = Number(opt('dist', '200'))
const size = opt('size', '1440x900').split('x').map(Number)
const orderAt = Number(opt('order', '0'))
// --follow=<metres>: the camera keeps on the first machine at work (or, with none, the first person), from this far
const follow = Number(opt('follow', '0'))
const clear = args.includes('--clear')
// --only=0.3-0.4: pictures only between these shares of the first day
const only = opt('only', '').split('-').map(Number)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] } })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.addInitScript(HELPER)
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })

// To the first day the work is wanted, with a hand hired so two people are out; the order given, the clock stopped.
const field = await q(page, `
  const { app, sim } = q.g()
  app.newGame(1987, 3)
  const c = app.campaign
  c.cash += 40000
  app.do({ t: 'hire', kind: 'hand' })
  app.do({ t: 'begin' })
  app.do({ t: 'sprayWay', way: 'auto' })
  localStorage.setItem('the-county/guide', JSON.stringify({ offered: true, on: false }))
  let field = -1
  for (let n = 0; n < 300 && field < 0 && !sim.seasonDone(c); n++) {
    c.incidents = []
    const want = sim.advise(app.world, c).filter(a => a.act === '${job}' && a.field >= 0)
    if (want.length) { field = want[0].field; for (const a of want.slice(0, 2)) app.do({ t: 'job', kind: a.act, field: a.field }); break }
    for (const a of sim.advise(app.world, c)) if (a.field >= 0 && a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
    app.do({ t: 'day' })
  }
  app.setSpeed(0)
  return field
`) as number
if (field < 0) { console.log(`no day wants ${job}`); await browser.close(); process.exit(1) }
await closeAll(page)
await page.evaluate(([f, d]) => (globalThis as unknown as { __countyField: { view(p: object): void } }).__countyField.view({ frame: 'field', field: f, x: 0.5, z: 0.5, dist: d, pitch: 0.75 }), [field, dist])
await page.waitForTimeout(800)

type Info = { dayT: number; pending: number; units: { id: number; x: number; z: number; foot: boolean; fade: number; doing: string }[]; rigs: { key: string; x: number; z: number; fade: number; work: string; tool: string }[] }
const look = () => page.evaluate(() => {
  const g = globalThis as unknown as { __county: { app: { dayProgress: number; speed: number; campaign: { season: { day: number; jobs: { kind: string; field: number; done: number; need: number }[]; clock?: { at: number } } } } }; __countyField: { info(): Info; plans(): string[] } }
  const s = g.__county.app.campaign.season
  return { plans: g.__countyField.plans().join('\n'), info: g.__countyField.info(), at: g.__county.app.dayProgress, day: s.day, speed: g.__county.app.speed, jobs: s.jobs.map(j => `${j.kind}@${j.field} ${(j.done / j.need).toFixed(2)}`).join(', ') }
}) as Promise<{ plans: string; info: Info; at: number; day: number; speed: number; jobs: string }>

await page.evaluate(p => { const app = (globalThis as unknown as { __county: { app: { pace: number; setSpeed(n: number): void } } }).__county.app; app.pace = p; app.setSpeed(1) }, pace)
const start = await look()
const daySec = 210 / pace
const step = (daySec * 1000 * days) / frames
const rows: { t: number; day: number; at: number; pending: number; who: string }[] = []
const fastest = new Map<string, number>()
const jumps: string[] = []
let was: Awaited<ReturnType<typeof look>> | null = null, wasAt = 0, ordered = false
// (looked at four times between pictures, so a jump is not hidden by the gap)
const sub = 4
for (let n = 0; n <= frames * sub; n++) {
  const t0 = Date.now()
  const now = await look()
  if (now.speed === 0) await page.evaluate(() => { const g = globalThis as unknown as { __county: { app: { campaign: { incidents: unknown[] }; setSpeed(n: number): void } } }; g.__county.app.campaign.incidents = []; g.__county.app.setSpeed(1) })
  if (was) {
    const dt = ((Date.now() - wasAt) / 1000) * pace
    const all = [...now.info.units.map(u => ({ key: `${u.foot ? 'foot' : 'aboard'} ${u.id}`, x: u.x, z: u.z, fade: u.fade, most: u.foot ? 5 : 24, id: `u${u.id}` })), ...now.info.rigs.map(r => ({ key: `rig ${r.key}`, x: r.x, z: r.z, fade: r.fade, most: 24, id: r.key }))]
    for (const a of all) {
      const b = [...was.info.units.map(u => ({ id: `u${u.id}`, x: u.x, z: u.z, fade: u.fade })), ...was.info.rigs.map(r => ({ id: r.key, x: r.x, z: r.z, fade: r.fade }))].find(x => x.id === a.id)
      if (!b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue
      const d = Math.hypot(a.x - b.x, a.z - b.z), v = d / Math.max(0.05, dt)
      if (a.fade > 0.95 && b.fade > 0.95) fastest.set(a.key, Math.max(fastest.get(a.key) ?? 0, v))
      if (v > a.most * 1.6 && d > 6 && a.fade > 0.95 && b.fade > 0.95) jumps.push(`day ${now.day} at ${(now.at * 100).toFixed(0)}%: ${a.key} went ${d.toFixed(0)} m in ${dt.toFixed(1)} s (${v.toFixed(0)} m/s)`)
    }
  }
  if (!was || was.day !== now.day || was.plans !== now.plans) console.log(`  plan, day ${now.day} at ${(6 + now.at * 11).toFixed(1)}h:\n    ${now.plans.split('\n').join('\n    ')}`)
  was = now; wasAt = Date.now()
  if (orderAt && !ordered && now.day === start.day && now.at >= (orderAt - 6) / 11) {
    ordered = true
    const said = await q(page, `const { app } = q.g(); const s = app.campaign.season; const f = s.fields.findIndex(x => x.status === 'rest'); const r = app.do({ t: 'job', kind: 'rocks', field: f }); return (r.ok ? 'rocks ordered on field ' + f : r.err) + ' at ' + app.dayProgress.toFixed(2)`)
    console.log(String(said))
  }
  if (follow) {
    const r = now.info.rigs.find(x => x.work) ?? now.info.rigs.find(x => now.info.units.some(u => !u.foot && Math.hypot(u.x - x.x, u.z - x.z) < 1)) ?? now.info.units[0]
    if (r && Number.isFinite(r.x)) await page.evaluate(([x, z, d]) => (globalThis as unknown as { __countyField: { view(p: object): void } }).__countyField.view({ x, z, dist: d, pitch: 0.62 }), [r.x, r.z, follow])
  }
  if (clear) await page.evaluate(() => (globalThis as unknown as { __countyField: { tune(o: object): void } }).__countyField.tune({ rain: 0, cloud: 0.15, mist: 0, wet: 0.2 }))
  if (n % sub === 0 && (only.length < 2 || (now.day === start.day && now.at >= only[0] && now.at <= only[1]))) {
    const k = n / sub
    await page.screenshot({ path: `${out}/${String(k).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 72 })
    const who = [...now.info.units.map(u => `${u.foot ? 'f' : 'a'}${u.id}(${u.x.toFixed(0)},${u.z.toFixed(0)}${u.doing ? ` ${u.doing}` : ''}${u.fade < 0.95 ? ' faint' : ''})`), ...now.info.rigs.map(r => `${r.key}(${r.x.toFixed(0)},${r.z.toFixed(0)}${r.work ? ` ${r.work}` : ''}${r.tool && r.tool !== 'none' ? ` ${r.tool}` : ''})`)].join(' ')
    rows.push({ t: Math.round((n * step) / sub / 100) / 10, day: now.day, at: now.at, pending: now.info.pending, who })
    console.log(`${String(k).padStart(2, '0')} day ${now.day} ${(6 + now.at * 11).toFixed(1)}h  to show ${now.info.pending}  ${who}  | ${now.jobs}`)
  }
  await page.waitForTimeout(Math.max(0, step / sub - (Date.now() - t0)))
}
console.log(`fastest seen (m/s, as at the first speed): ${[...fastest].map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`)
console.log(`jumps: ${jumps.length}${jumps.length ? `\n  ${jumps.slice(0, 20).join('\n  ')}` : ''}`)
console.log(`errors: ${errors.length}${errors.length ? `\n  ${errors.slice(0, 6).join('\n  ')}` : ''}`)
writeFileSync(`${out}/trace.json`, JSON.stringify({ job, field, pace, rows, fastest: [...fastest], jumps, errors }, null, 1))
await browser.close()
