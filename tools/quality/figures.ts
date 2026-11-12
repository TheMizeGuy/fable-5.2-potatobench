// Whether people on the land can be seen and are seen to move as people do.
//   pictures (the default): for each person at work in a season, the card's Follow, and a picture once the camera has
//     come in, with how tall the figure stands on the screen and where they are (on foot, driving, indoors).
//   --measure: every person's place on the land and their pin on the screen, sampled every frame, with a person's card
//     open and then with Follow on, at each speed and while paused, in three states (the first planting days, a
//     spraying day in July, the dig and haul in late September). The table: per state and speed, the largest step in
//     one frame (metres, pixels), how many frames had a step no walker or driver could make, and what each fell on (a
//     day's turn, a change of job, mounting or leaving a machine, a change to the list, the card or Follow).
// Usage: node tools/quality/figures.ts <base url> [out dir] [--measure] [--seconds=60]
import { chromium, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const args = process.argv.slice(2)
const [base, out = 'out/figures'] = args.filter(a => !a.startsWith('--'))
const measure = args.includes('--measure')
const seconds = Number(args.find(a => a.startsWith('--seconds='))?.slice(10) ?? 60)
if (!base) throw new Error('usage: figures.ts <base url> [out dir] [--measure] [--seconds=60]')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
await page.addInitScript(HELPER)
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis)
await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30_000 }).catch(() => {})

// A farm of four people (a bunkhouse given, every applicant hired), spraying settled so no question stops the clock.
const FARM = `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
  c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
  for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
  app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'ask' }); app.settings.pauseOnAlerts = false`

async function settle(): Promise<void> {
  await closeAll(page)
  await q(page, `const { app } = q.g(); app.campaign.incidents = []; app.setSpeed(1)`)
}

if (!measure) {
  // A farm in July: the farmer driving the sprayer, a hand walking the rows, the others as the day has them.
  await q(page, `${FARM}; app.do({ t: 'sundays', off: false }); q.run(q.day(6, 10), ['spray']); app.campaign.incidents = []
    for (const j of [...app.campaign.season.jobs]) app.do({ t: 'cancel', id: j.id })
    for (const f of [0, 2, 4, 5]) app.do({ t: 'job', kind: 'spray', field: f })
    app.do({ t: 'job', kind: 'scout', field: 1 })`)
  await settle()
  await page.waitForTimeout(1500)
  const people = await q(page, `return q.g().app.campaign.crew.map(u => ({ id: u.id, name: u.name }))`) as { id: number; name: string }[]
  const rows: string[] = []
  for (const p of people) {
    await page.evaluate(id => (globalThis as any).__county.app.selectUnit(id, 'land'), p.id)
    await page.waitForTimeout(400)
    const follow = page.getByTestId('whois-follow')
    if (!(await follow.isVisible().catch(() => false))) { rows.push(`${p.name}: no card`); continue }
    const before = await page.evaluate(id => (globalThis as any).__countyField.unitPlace(id), p.id)
    await follow.click()
    await page.waitForTimeout(1600)
    const after = await page.evaluate(id => `${(globalThis as any).__countyField.unitPlace(id)} following ${(globalThis as any).__countyField.following()}`, p.id)
    const at = await page.evaluate(id => {
      const g = globalThis as any
      const f = g.__countyField
      const { app } = g.__county
      const u = app.campaign.crew.find((x: any) => x.id === id)
      const j = app.campaign.season.jobs.find((x: any) => x.id === u.job)
      return { pin: f.unitPin(id), foot: f.unitFoot?.(id), doing: j ? `${j.kind}@${j.field}` : 'idle', where: document.querySelector('#ui [data-testid="whois-where"]')?.textContent ?? '' }
    }, p.id) as { pin: { x: number; y: number; visible: boolean }; foot?: { x: number; y: number; visible: boolean }; doing: string; where: string }
    const tall = at.foot && at.pin.visible ? Math.round(at.foot.y - at.pin.y) : -1
    const name = p.name.split(' ')[0].toLowerCase()
    await page.screenshot({ path: join(out, `${name}-follow.png`) })
    rows.push(`${name} (${at.doing}): pin ${at.pin.visible ? `${Math.round(at.pin.x)},${Math.round(at.pin.y)}` : 'off'}; figure ${tall} px tall; card: ${at.where || 'on foot'}; ${before} -> ${after}`)
    await page.keyboard.press('Escape')
    await page.evaluate(() => (globalThis as any).__countyField.tier('farm'))
    await page.waitForTimeout(1500)
  }
  writeFileSync(join(out, 'figures.txt'), rows.join('\n') + `\nerrors: ${errors.join(' | ') || 'none'}\n`)
  console.log(rows.join('\n'))
  console.log(`errors: ${errors.length}`)
  await browser.close()
  process.exit(0)
}

// ---------------------------------------------------------------- --measure

interface Sample { t: number; day: number; speed: number; jobs: string; follow: number; units: { id: number; x: number; z: number; foot: boolean; job: number; px: number; py: number; pv: boolean }[] }

// Every frame for `ms`: each person's place, whether on foot, their order, and their pin on the screen.
async function sample(p: Page, ms: number): Promise<Sample[]> {
  return p.evaluate(ms => new Promise<Sample[]>(done => {
    const g = globalThis as any
    const out: Sample[] = []
    const t0 = performance.now()
    const step = () => {
      const { app } = g.__county
      const f = g.__countyField
      const s = app.campaign.season
      const info = f.info()
      out.push({
        t: performance.now() - t0, day: s?.day ?? -1, speed: app.speed, follow: f.following?.() ?? -1,
        jobs: (s?.jobs ?? []).map((j: any) => j.id).join(','),
        units: info.units.map((u: any) => {
          const pin = f.unitPin(u.id)
          return { id: u.id, x: u.x, z: u.z, foot: u.foot, job: app.campaign.crew.find((c: any) => c.id === u.id)?.job ?? -1, px: pin.x, py: pin.y, pv: pin.visible }
        }),
      })
      if (performance.now() - t0 < ms) requestAnimationFrame(step)
      else done(out)
    }
    requestAnimationFrame(step)
  }), ms)
}

// A step no walker (10 m/s) or driver (30 m/s) could make in the time a frame took, and more than half a metre.
const tooFar = (m: number, dtMs: number, foot: boolean) => m > Math.max(0.5, (foot ? 10 : 30) * dtMs / 1000)

interface Row { state: string; speed: string; frames: number; maxM: number; maxPx: number; jumps: number; at: Record<string, number>; worst: string[] }

function analyse(state: string, speed: string, ss: Sample[]): Row {
  const row: Row = { state, speed, frames: ss.length, maxM: 0, maxPx: 0, jumps: 0, at: {}, worst: [] }
  const big: { m: number; s: string }[] = []
  for (let k = 1; k < ss.length; k++) {
    const a = ss[k - 1], b = ss[k]
    // (the join between the card's half and Follow's half is no frame)
    if (b.t < a.t) continue
    let jumped = false
    for (const ub of b.units) {
      const ua = a.units.find(u => u.id === ub.id)
      if (!ua) continue
      const m = Math.hypot(ub.x - ua.x, ub.z - ua.z)
      if (m > row.maxM) row.maxM = m
      if (ua.pv && ub.pv) row.maxPx = Math.max(row.maxPx, Math.hypot(ub.px - ua.px, ub.py - ua.py))
      if (!tooFar(m, b.t - a.t, ua.foot && ub.foot)) continue
      jumped = true
      if (m > 20) big.push({ m, s: `#${k} unit ${ub.id} ${m.toFixed(0)} m ${ua.x.toFixed(0)},${ua.z.toFixed(0)} -> ${ub.x.toFixed(0)},${ub.z.toFixed(0)} foot ${ua.foot}->${ub.foot} job ${ua.job}->${ub.job} day ${a.day}->${b.day} dt ${(b.t - a.t).toFixed(0)}` })
      const why = a.day !== b.day ? 'day turn' : ua.job !== ub.job ? 'job change' : ua.foot !== ub.foot ? 'mount/leave' : a.jobs !== b.jobs ? 'list change' : a.follow !== b.follow ? 'follow' : 'other'
      row.at[why] = (row.at[why] ?? 0) + 1
    }
    if (jumped) row.jumps++
  }
  row.worst = big.sort((x, y) => y.m - x.m).slice(0, 4).map(x => x.s)
  return row
}

const STATES: [string, string][] = [
  ['planting', `${FARM}; q.run(q.day(4, 20), ['plant'])`],
  ['spraying', `${FARM}; q.run(q.day(6, 10), ['spray']); app.campaign.incidents = []
    for (const j of [...app.campaign.season.jobs]) app.do({ t: 'cancel', id: j.id })
    for (const f of [0, 2, 4, 5]) app.do({ t: 'job', kind: 'spray', field: f })`],
  ['dig and haul', `${FARM}; q.run('digging', ['sell'], 'status')`],
]
const rows: Row[] = []
for (const [state, setup] of STATES) {
  await q(page, setup)
  await settle()
  // A card open on the first person (as a player who clicked them), and for the second half, Follow on.
  const first = await q(page, `return q.g().app.campaign.crew[0].id`) as number
  for (const speed of [0, 1, 2, 3]) {
    await closeAll(page)
    await q(page, `const { app } = q.g(); app.campaign.incidents = []; app.setSpeed(${speed})`)
    await page.evaluate(id => (globalThis as any).__county.app.selectUnit(id, 'land'), first)
    const half = (speed === 0 ? Math.min(20, seconds) : seconds) * 500
    const card = await sample(page, half)
    const follow = page.getByTestId('whois-follow')
    if (await follow.isVisible().catch(() => false)) await follow.click({ timeout: 2000 }).catch(() => {})
    const followed = await sample(page, half)
    rows.push(analyse(state, speed === 0 ? 'paused' : ['', '1x', '3x', '8x'][speed], [...card, ...followed]))
    const r = rows[rows.length - 1]
    for (const w of r.worst) console.log(`  ${w}`)
    console.log(`${r.state} | ${r.speed} | ${r.frames} | ${r.maxM.toFixed(2)} | ${r.maxPx.toFixed(0)} | ${r.jumps} | ${Object.entries(r.at).map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`)
    await page.keyboard.press('Escape')
    await page.evaluate(() => { (globalThis as any).__county.app.selectUnit(-1); (globalThis as any).__countyField.tier('farm') })
    await page.waitForTimeout(600)
  }
}
console.log('--')
const lines = ['state | speed | frames | largest step m | largest pin step px | frames with an impossible step | where', '---|---|---|---|---|---|---',
  ...rows.map(r => `${r.state} | ${r.speed} | ${r.frames} | ${r.maxM.toFixed(2)} | ${r.maxPx.toFixed(0)} | ${r.jumps} | ${Object.entries(r.at).map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`)]
writeFileSync(join(out, 'motion.md'), lines.join('\n') + `\n\nerrors: ${errors.join(' | ') || 'none'}\n`)
console.log(lines.join('\n'))
console.log(`errors: ${errors.length}`)
await browser.close()
