// Checks that work is seen where it happens. For each kind of work done with a machine (and felling and stumping), a
// farm is played by the game's own routine to the evening before that work is first done, and the days are then run
// at 1x, 3x and 8x from the view the season opens with, and at 1x with Follow on whoever does it. Every frame it reads
// where the game says the work is and where the machines and people are drawn, and it fails unless
//   (a) a machine stands inside the outline, on the screen, of a field that work is on (the field with its headlands)
//       for a fair share of the time the game has someone at the work (what the picture shows of it in the few
//       seconds after counts too: it runs behind the days),
//       from the opening view; and with Follow, whoever does the work is in the picture and on that ground (a field's
//       outline is not all on the screen from so near);
//   (b) at each speed the machine is seen moving along the rows at a pace the eye can follow, nobody is seen to make
//       a step no walker or driver could, and the work's count goes up;
//   (c) from the opening view, the picture of that field with the work in it differs from the same picture with the
//       people, machines and what they leave in the air taken out by more than a floor of pixels;
//   (d) on the first day two people each have hours of spraying on the one tractor (the day's record says whose, and
//       when), it is seen at work with the first in their field and then with the second in theirs, and neither is
//       seen going along a field's rows on foot.
// tests/seen.test.ts holds the same of the people and machines run without a picture.
// Usage: node tools/render/seen.ts <base-url> <out dir> [--jobs=plant,hill,...,shared] [--report]   (--report: never fails)
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { FIELDS } from '../../src/render/layout.ts'
import { FIELD_NAMES } from '../../src/sim/index.ts'
import { GPU, HELPER, q } from '../quality/shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/', out = 'out/seen'] = args.filter(a => !a.startsWith('--'))
const only = args.find(a => a.startsWith('--jobs='))?.slice(7).split(',')
const report = args.includes('--report')
mkdirSync(out, { recursive: true })

// The floors. there: at each clock, the least share of the time that a machine is inside the outline of a field of
// the work; working: and at work there (at 1x at this work; at the faster clocks, behind the days, at any); along:
// of what it covers working, the least share along the rows; pace: metres a second on the ground at 1x (more at the
// faster clocks), and the least pixels a second on the screen; mark: the least pixels of the field's picture that
// the work changes from the opening view; follow: with Follow, the least share of the time whoever does the work
// is in the picture on that ground; haul: a load goes between the field and the potato house, so what is asked is
// that the machine hauling is to be seen (not gone from sight through a cut) for this share of the time at each
// clock, and at the field, loading, for this. The pictures for (c) are taken in fair, dry air (the watcher holds it
// so at 1x): in rain and fog a machine is found from far off by its lamps and by the face the interface pins to it.
// rows: the most metres along a field's rows that those with hours on a shared machine are seen to go on foot in the
// run (someone who gets down in a field goes off it to its nearer end to wait: half a field's length, each time).
const FLOOR = { there: [0, 0.5, 0.5, 0.3], working: [0, 0.4, 0.25, 0.12], along: 0.8, pace: [1, 28], px: 4, mark: 300, follow: 0.5, foot: 0.6, haul: { shown: [0, 0.5, 0.4, 0.2], there: 0.12 }, rows: FIELDS[0].x1 - FIELDS[0].x0 }
const QUICK = [1, 1, 1.5, 2.4]
const SPEEDS: [number, string, number][] = [[1, '1x', 17], [2, '3x', 12], [3, '8x', 9]]

// later: the run begins this many days after the work is first done; once: only at 1x from the opening view
interface Job { name: string; kind: string; spring?: string; order?: string; foot?: boolean; none?: boolean; headZ?: number; later?: number; once?: boolean }
const JOBS: Job[] = [
  { name: 'plant', kind: 'plant' },
  { name: 'hill', kind: 'hill' },
  { name: 'spray', kind: 'spray' },
  { name: 'kill-vines', kind: 'kill' },
  { name: 'dig-digger', kind: 'dig' },
  { name: 'dig-harvester', kind: 'dig', spring: `app.do({ t: 'buy', upgrade: 'harvester' })` },
  // (with the farm's one tractor on the digger the crop is handed up by the barrel at the field's end; a load is seen
  // on the lane once there is a machine for it, here the truck)
  { name: 'haul', kind: 'haul', spring: `app.do({ t: 'buy', upgrade: 'truck' })` },
  // (the truck loads in the field the digger is digging, and the far mark there is of both. A day of nothing but
  // hauling: with the harvester the one tractor digs a day and takes the wagon the next, and what is in the air over
  // the field then is the load's alone)
  { name: 'haul-wagon', kind: 'haul', spring: `app.do({ t: 'buy', upgrade: 'harvester' })`, later: 1, once: true },
  { name: 'fell', kind: 'fell', order: `app.do({ t: 'job', kind: 'fell', field: 14 })`, foot: true, headZ: 8 },
  { name: 'stump', kind: 'stump', order: `const f = c.fields[14]; f.felled = sim.FELL_DAYS.woods; f.cover = 'stumps'; app.emit({ type: 'change' }); said.push('stump ordered: ' + JSON.stringify(app.do({ t: 'stump', field: 14 }).ok))`, none: true },
]

let failed = 0
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }
const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(base)
await page.waitForFunction(() => (window as any).__countyField?.stats?.().firstFrame > 0, null, { timeout: 180000 })
await page.evaluate(HELPER)

// The watcher, in the page: every frame, who the game has at this kind of work and on which fields, and where the
// machines and people are drawn.
await page.evaluate(({ rects, QUICK }) => {
  const W = window as any
  const inPoly = (p: { x: number; y: number }, poly: { x: number; y: number }[]) => {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j]
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
    }
    return c
  }
  W.__seen = {
    on: false, hold: false, st: null as any,
    outline(field: number, headX: number, headZ: number) {
      const r = rects[field], f = W.__countyField
      return [[r.x0 - headX, r.z0 - headZ], [r.x1 + headX, r.z0 - headZ], [r.x1 + headX, r.z1 + headZ], [r.x0 - headX, r.z1 + headZ]].map(([x, z]) => f.screenOf(x, z, 0.1))
    },
    // foot: the work is on foot (whoever does it is watched, not a machine); grace: seconds after the game last had
    // anyone at the work that still count; follow: the person the camera is on (they are watched)
    begin(kind: string, want: number, headX: number, headZ: number, foot: boolean, grace: number, follow: number, fair = false) {
      const st = this.st = {
        t: 0, secs: 0, there: 0, inside: 0, working: 0, busy: 0, view: 0, shown: 0, path: 0, along: 0, px: 0, moving: 0, jumps: [] as string[], cuts: 0, stops: 0, long: 0, tall: 0, sized: 0, work: 0, lead: 0,
        fields: new Set<number>(), who: -1, driver: -1, field: -1, now: false, trace: [] as string[], lastTrace: -1, was: new Map<string, { x: number; z: number; sx: number; sy: number; fade: number }>(),
        since: Infinity, begun: false, day: -1, day0: -1, known: false, halt: 0,
      }
      const quick = QUICK[want]
      let last = performance.now()
      this.on = true
      const tick = (now: number) => {
        if (!this.on) return
        requestAnimationFrame(tick)
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        const { app } = W.__county, f = W.__countyField, c = app.campaign, s = c?.season
        if (this.hold) { st.was.clear(); return }
        if (!s || c.phase !== 'season') return
        if (c.incidents.length) c.incidents = []
        // (a question that stops the clock is answered a third of a second later)
        if (app.speed !== want) { st.halt += dt; if (st.halt > 0.33) { st.halt = 0; st.stops++; app.setSpeed(want) } return }
        // (a fair, dry afternoon held, so that what the work leaves in the air is judged in air it can be seen in)
        if (fair) f.tune({ hour: 0.72, cloud: 0.27, cloudShadow: 0.66, sunScale: 1, deck: 1, key: 1, storm: 0, haze: 0.0008, mist: 0, rain: 0, snowfall: 0, wet: 0.1, dry: 0.8 })
        st.t += dt
        if (st.day0 < 0) st.day0 = st.day = s.day
        if (s.day !== st.day) { st.day = s.day; st.work += s.worked.filter((w: any) => w.kind === kind).length }
        // who the game has at it: holding an order of this kind, or worked at it in the day being shown
        const who = new Set<number>()
        for (const u of c.crew) { const j = s.jobs.find((x: any) => x.id === u.job); if (j && j.kind === kind) { who.add(u.id); st.fields.add(j.field) } }
        for (const w of s.worked) if (w.kind === kind) { who.add(w.unit); st.fields.add(w.field) }
        const info = f.info(), vw = innerWidth, vh = innerHeight
        if (info.rigs.some((r: any) => r.work !== undefined)) st.known = true
        const fieldOf = (x: number, z: number) => { for (const i of st.fields) { const r = rects[i]; if (x > r.x0 - headX && x < r.x1 + headX && z > r.z0 - headZ && z < r.z1 + headZ) return i } return -1 }
        // steps nobody could make (someone gone from sight through a cut is not seen to make one)
        const all = [...info.units.map((u: any) => [`person ${u.id}`, u, (u.foot ? 9 : 28) * quick]), ...info.rigs.map((r: any, k: number) => [`${r.kind} ${k}`, r, 28 * quick])] as [string, any, number][]
        for (const [key, p, most] of all) {
          const b = st.was.get(key), fade = p.fade ?? 1
          if (b && Number.isFinite(p.x) && Number.isFinite(b.x)) {
            const d = Math.hypot(p.x - b.x, p.z - b.z)
            if (d > most * dt * 1.25 + 0.6) { if (Math.min(fade, b.fade) >= 0.5) { if (st.jumps.length < 40) st.jumps.push(`${key} ${d.toFixed(0)} m at ${st.t.toFixed(1)} s`) } else st.cuts++ }
          }
          st.was.set(key, { x: p.x, z: p.z, sx: 0, sy: 0, fade })
        }
        // the first to set out, before the first day is counted
        if (s.day === st.day0) for (const u of info.units) {
          const b = st.was.get(`lead ${u.id}`), gone = b ? b.fade : 0
          const d = b && Number.isFinite(u.x) ? Math.hypot(u.x - b.x, u.z - b.z) : 0
          const far = gone + (d < 2 ? d : 0)
          st.lead = Math.max(st.lead, far)
          if (Number.isFinite(u.x)) st.was.set(`lead ${u.id}`, { x: u.x, z: u.z, sx: 0, sy: 0, fade: far })
        }
        if (who.size) { st.since = st.t; st.begun = true; if (st.who < 0 || !who.has(st.who)) st.who = [...who][0] }
        st.now = false
        if (!st.begun || st.t - st.since > grace) return
        // (once the game no longer has anyone at it, the picture's catching up counts, and nothing else of that time)
        const late = !who.size
        if (!late) st.secs += dt
        // what is watched: with Follow, that person; for work on foot, whoever does it; else the machines with someone on them
        const riding = (r: any) => r.holder >= 0 && !info.units.find((u: any) => u.id === r.holder)?.foot
        const hauls = (r: any) => kind !== 'haul' || r.kind === 'truck' || r.tool === 'trailer' || r.tool === undefined
        const seen = (p: any) => (p.fade ?? 1) >= 0.5 && Number.isFinite(p.x)
        const man = follow >= 0 ? info.units.find((u: any) => u.id === follow) : null
        const cand: any[] = follow >= 0 ? (man && seen(man) ? [man.foot ? man : info.rigs.find((r: any) => r.holder === follow) ?? man] : [])
          : foot ? info.units.filter((u: any) => who.has(u.id) && seen(u))
            : info.rigs.filter((r: any) => riding(r) && seen(r) && hauls(r))
        const at = cand.filter(p => fieldOf(p.x, p.z) >= 0)
        // (digging: the farm's one tractor takes the trailer between whiles and brings in what it dug: that is the
        // harvest's work as much, and counts as the machine at it)
        const carting = kind === 'dig' && follow < 0 && cand.some(r => r.tool === 'trailer')
        if (late && !(at.length || carting)) return
        if (late) st.secs += dt
        if (carting && !at.length) { st.inside += dt; st.there += dt; st.busy += dt }
        const drv = info.rigs.find((r: any) => riding(r) && seen(r) && fieldOf(r.x, r.z) >= 0)
        if (drv) st.driver = drv.holder
        const p = at[0] ?? cand[0]
        if (!p) return
        st.shown += dt
        const sc = f.screenOf(p.x, p.z, 1.2)
        if (sc.visible && sc.x >= 0 && sc.x <= vw && sc.y >= 0 && sc.y <= vh) st.view += dt
        if (!at.length) { for (const k of [...st.was.keys()]) if (k.startsWith('at ')) st.was.delete(k); return }
        const field = fieldOf(p.x, p.z)
        st.there += dt
        st.now = true
        st.field = field
        if (at.some(r => r.work === kind)) st.working += dt
        if (at.some(r => !!r.work) || carting) st.busy += dt
        const poly = this.outline(field, headX, headZ)
        const feet = [[-2, -1.2], [2, -1.2], [2, 1.2], [-2, 1.2]].map(([dx, dz]) => f.screenOf(p.x + dx, p.z + dz, 0.1))
        // (where a corner of the field is behind the camera its outline has no shape on the screen: the machine is on
        // that field's ground, and what is asked is that all of it is in the picture)
        const whole = poly.every((q: any) => q.visible)
        if (feet.every((q: any) => q.visible && q.x >= 0 && q.x <= vw && q.y >= 0 && q.y <= vh && (!whole || inPoly(q, poly)))) st.inside += dt
        const a = f.screenOf(p.x - 1.7, p.z, 0.1), b = f.screenOf(p.x + 1.7, p.z, 0.1), top = f.screenOf(p.x, p.z, 2.6), low = f.screenOf(p.x, p.z, 0)
        st.long += Math.hypot(a.x - b.x, a.y - b.y); st.tall += Math.hypot(top.x - low.x, top.y - low.y); st.sized++
        // how it goes while it works (where the build says what a machine is at; else wherever it is on the field)
        const key = `at ${p.holder ?? p.id}`, w0 = st.was.get(key)
        if (w0 && (foot || kind === 'haul' || p.work === undefined || p.work !== '')) {
          const dx = p.x - w0.x, dz = p.z - w0.z, d = Math.hypot(dx, dz)
          if (d < 15) { st.path += d; st.along += Math.abs(dx); st.px += Math.hypot(sc.x - w0.sx, sc.y - w0.sy); if (d > 0.5 * dt) st.moving += dt }
        }
        for (const k of [...st.was.keys()]) if (k.startsWith('at ') && k !== key) st.was.delete(k)
        st.was.set(key, { x: p.x, z: p.z, sx: sc.x, sy: sc.y, fade: 1 })
        if (st.t - st.lastTrace >= 0.5) {
          st.lastTrace = st.t
          st.trace.push(`${st.t.toFixed(1)}s day ${s.day}: ${info.rigs.map((r: any) => `${r.kind}${r.holder >= 0 ? '(' + r.holder + ')' : ''} ${r.x.toFixed(0)},${r.z.toFixed(0)} ${r.tool ?? ''} ${r.work ?? ''}`).join(' | ')} || ${(f.clocks() as string[]).join(' || ')}`)
        }
      }
      requestAnimationFrame(tick)
    },
    now() { const st = this.st; return { secs: st.secs, there: st.there, working: st.working, known: st.known, now: st.now, who: st.who, driver: st.driver, field: st.field, t: st.t } },
    end() {
      this.on = false
      const st = this.st, n = Math.max(1, st.sized)
      return {
        t: st.t, secs: st.secs, there: st.there, inside: st.inside, working: st.working, busy: st.busy, view: st.view, shown: st.shown, path: st.path, along: st.along, px: st.px, moving: st.moving, jumps: st.jumps, cuts: st.cuts, stops: st.stops,
        long: st.long / n, tall: st.tall / n, work: st.work, lead: st.lead, fields: [...st.fields], trace: st.trace, known: st.known,
      }
    },
  }
}, { rects: FIELDS.map(f => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 })), QUICK })

type Sum = { t: number; secs: number; there: number; inside: number; working: number; busy: number; view: number; shown: number; path: number; along: number; px: number; moving: number; jumps: string[]; cuts: number; stops: number; long: number; tall: number; work: number; lead: number; fields: number[]; trace: string[]; known: boolean }
type Now = { secs: number; there: number; working: number; known: boolean; now: boolean; who: number; driver: number; field: number; t: number }
const frames = (n: number) => page.evaluate(n => new Promise<void>(res => { let k = 0; const tick = () => (++k >= n ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick) }), n)
const bare = (on: boolean) => page.evaluate(on => { for (const el of [...document.body.children]) if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT') (el as HTMLElement).style.visibility = on ? 'hidden' : '' }, on)
const now = () => page.evaluate(() => (window as any).__seen.now()) as Promise<Now>
const shot = async (name: string, plain = true): Promise<Buffer> => {
  if (plain) await bare(true)
  const b = await page.screenshot({ path: `${out}/${name}.png` })
  if (plain) await bare(false)
  return b
}

// A farm as a first player has it: the farmer and one hired hand, the routine doing the ordering.
const farm = (job: Job) => `const { app, sim } = q.g(); const said = []; app.newGame(1977, 5); const c = app.campaign; c.cash += 60000
  if (c.applicants[0]) app.do({ t: 'hire', applicant: c.applicants[0].id })
  ${job.spring ?? ''}; app.do({ t: 'begin' }); app.do({ t: 'sprayWay', way: 'auto' }); app.setSpeed(0)
  ${job.order ?? ''}`
// How many days go by before this work is first done (0 when the game never has anyone at it).
async function find(job: Job): Promise<number> {
  if (job.none) return 3
  return await q(page, `${farm(job)}; for (let n = 1; n < 240 && c.phase === 'season' && !sim.seasonDone(c); n++) { c.incidents = []; app.do({ t: 'day' }); if (c.season.worked.some(w => w.kind === '${job.kind}')) return n } return 0`) as number
}
// The same farm brought to the evening before, the land settled, seen from the view the season opens with.
async function reach(job: Job, days: number): Promise<string> {
  const said = await q(page, `${farm(job)}; for (let n = 0; n < ${days}; n++) { c.incidents = []; app.do({ t: 'day' }) }
    return said.join(', ') + ' day ' + c.season.day + ', ' + sim.today(app.world, c).sky + ', crew ' + c.crew.map(u => u.id + ' ' + u.kind).join(', ')`) as string
  // (a touch of the camera lets go of Follow, as it does for a player)
  if (await page.evaluate(() => (window as any).__countyField.following() >= 0)) { await page.mouse.move(640, 430); await page.mouse.wheel(0, 120); await page.waitForTimeout(300) }
  // (the interface's own move from the spring plan to the season is let finish: the view is framed in what it leaves free)
  await page.waitForTimeout(700)
  await page.evaluate(() => { const f = (window as any).__countyField; f.settle(); f.tier('field') })
  await page.waitForTimeout(600)
  await page.evaluate(() => { const f = (window as any).__countyField; f.tier('field'); f.settle() })
  await frames(3)
  if (await page.evaluate(() => (window as any).__countyField.following() >= 0)) console.log('   Follow is still on')
  return said
}
const start = (job: Job, speed: number, follow = -1) => page.evaluate(([kind, speed, headZ, foot, grace, follow]) => {
  (window as any).__county.app.setSpeed(speed)
  ;(window as any).__seen.begin(kind, speed, 12, headZ, foot, grace, follow, speed === 1 && follow < 0)
}, [job.kind, speed, job.headZ ?? 2, !!job.foot, [5, 5, 4.5, 3.5][speed], follow] as [string, number, number, boolean, number, number])
const end = () => page.evaluate(() => (window as any).__seen.end()) as Promise<Sum>
// Waits until something holds of the watcher (or `most` seconds have gone by).
async function until(test: (n: Now) => boolean, most: number): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < most * 1000) { if (test(await now())) return true; await page.waitForTimeout(80) }
  return false
}

// How many pixels of a picture differ from another by more than a tenth of full, inside an outline (or anywhere).
async function differ(a: Buffer, b: Buffer, poly: { x: number; y: number }[] | null): Promise<number> {
  return page.evaluate(async ([a, b, poly]) => {
    const read = async (s: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob())
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      return { d: g.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height }
    }
    const [p, q] = await Promise.all([read(a as string), read(b as string)])
    const pts = poly as { x: number; y: number }[] | null
    const inside = (x: number, y: number) => {
      if (!pts) return true
      let c = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const u = pts[i], v = pts[j]
        if ((u.y > y) !== (v.y > y) && x < ((v.x - u.x) * (y - u.y)) / (v.y - u.y) + u.x) c = !c
      }
      return c
    }
    let n = 0
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4
      if (Math.abs(p.d[i] - q.d[i]) + Math.abs(p.d[i + 1] - q.d[i + 1]) + Math.abs(p.d[i + 2] - q.d[i + 2]) > 76 && inside(x, y)) n++
    }
    return n
  }, [a.toString('base64'), b.toString('base64'), poly] as [string, string, { x: number; y: number }[] | null])
}
// The picture as it is and with the people, machines and what hangs in the air taken out, the clock stopped for both:
// the pixels of a field's outline (grown by 30) that the work accounts for, and beside it how many differ between two
// pictures taken alike (the wind in the crop, the clouds' shadows).
async function mark(name: string, field: number, speed: number, headZ: number): Promise<{ work: number; noise: number }> {
  await page.evaluate(() => { (window as any).__seen.hold = true; (window as any).__county.app.setSpeed(0) })
  await frames(3)
  const a1 = await shot(`${name}-working`), a2 = await shot(`${name}-working-again`)
  await page.evaluate(() => { const f = (window as any).__countyField; f.show('crews', false); f.show('particles', false) })
  await frames(3)
  const b = await shot(`${name}-idle`)
  await page.evaluate(() => { const f = (window as any).__countyField; f.show('crews', true); f.show('particles', true) })
  const poly = field < 0 ? null : await page.evaluate(([field, headZ]) => {
    const pts = (window as any).__seen.outline(field, 12, headZ) as { x: number; y: number; visible: boolean }[]
    if (!pts.every(p => p.visible)) return null
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4
    // (and upward from its far side by 90: what the work leaves in the air stands over it)
    return pts.map(p => { const d = Math.hypot(p.x - cx, p.y - cy) || 1; return { x: p.x + ((p.x - cx) / d) * 30, y: p.y + ((p.y - cy) / d) * 30 - (p.y < cy ? 90 : 0) } })
  }, [field, headZ])
  const out = { work: await differ(a1, b, poly), noise: await differ(a1, a2, poly) }
  await page.evaluate(speed => { (window as any).__county.app.setSpeed(speed); (window as any).__seen.hold = false }, speed)
  return out
}

const pct = (a: number, b: number) => `${b > 0 ? Math.round((100 * a) / b) : 0}%`
function line(s: Sum, what: string): string {
  const m = Math.max(1e-6, s.moving)
  return `the work goes on ${s.secs.toFixed(1)} s; ${what} on its field ${pct(s.there, s.secs)} of that, inside its outline on the screen ${pct(s.inside, s.secs)}, in the picture ${pct(s.view, s.secs)}, to be seen ${pct(s.shown, s.secs)}, working ${pct(s.working, s.secs)} (at any work ${pct(s.busy, s.secs)}); `
    + `working it goes ${(s.path / m).toFixed(1)} m/s, ${pct(s.along, s.path)} along the rows, ${(s.px / m).toFixed(0)} px/s, drawn ${Math.round(s.long)} by ${Math.round(s.tall)} px; steps nobody could make ${s.jumps.length}${s.jumps.length ? ' (' + s.jumps.slice(0, 3).join('; ') + ')' : ''}, cuts ${s.cuts}; `
    + `days with this work in them ${s.work}; fields ${s.fields.join(',')}${s.stops ? `; the clock was stopped ${s.stops} times` : ''}`
}

for (const job of JOBS) {
  if (only && !only.includes(job.name)) continue
  console.log(`\n== ${job.name}`)
  const first = await find(job)
  if (!first) { check(false, `${job.name}: the game never had anyone at it`); continue }
  const days = first + (job.later ?? 0)
  if (job.none) {
    // Work the farm pays a contractor for: nobody of the farm's is at it, so only the picture can say what is seen.
    console.log('  ', await reach(job, days))
    await start(job, 1)
    await page.waitForTimeout(5000)
    const m = await mark(`${job.name}-opening-1x`, 14, 1, 8)
    await end()
    await page.evaluate(() => (window as any).__countyField.tier('field', 14))
    await page.waitForTimeout(1500)
    await shot(`${job.name}-its-own-view`)
    await page.evaluate(() => (window as any).__countyField.view({ frame: 'field', field: 14, x: 0.5, z: 0.72, dist: 95, yaw: -0.24, pitch: 0.42 }))
    await page.waitForTimeout(2500)
    await shot(`${job.name}-from-near`)
    check(m.work >= FLOOR.mark, `${job.name}: from the opening view the work changes ${m.work} pixels of its tract's picture (floor ${FLOOR.mark}; ${m.noise} differ between two pictures taken alike)`)
    continue
  }
  const what = job.foot ? 'whoever does it' : 'a machine'
  for (const [speed, label, secs] of SPEEDS) {
    if (job.once && speed !== 1) continue
    const said = await reach(job, days - 1)
    if (speed === 1) console.log('  ', `first done on day ${first}${job.later ? `, and seen from ${job.later} after` : ''}; ${said}`)
    await start(job, speed)
    // a picture with the work going on in it (or, if it never is, three seconds after the game first has it)
    // (some seconds into the work itself, where the build says what its machines are at)
    const row = !job.foot && job.kind !== 'haul'
    const at = await until(n => n.now && (row && n.known ? n.working > 2 : n.there > 2.4), 18)
    if (!at) await until(n => n.secs > 3, 6)
    await shot(`${job.name}-opening-${label}`)
    if (speed !== 2) await shot(`${job.name}-opening-${label}-with-the-interface`, false)
    let m: { work: number; noise: number } | null = null
    if (speed === 1) {
      // (the field the machine is on; with none on one when the picture is taken, a field the game has the work on:
      // never the whole picture, where the far woods' leaves alone differ by more than the floor)
      const n = await now(), on = n.field >= 0 ? n.field : await page.evaluate(() => [...(window as any).__seen.st.fields][0] ?? -1) as number
      if (n.field < 0) console.log('     ', `no machine is on a field of the work as the far picture is taken: it is of ${on >= 0 ? FIELD_NAMES[on] : 'no field'}`)
      if (on >= 0) m = await mark(`${job.name}-opening-1x`, on, 1, job.headZ ?? 2)
      else check(false, `${job.name}: from the opening view there is no field of the work to take the far picture of`)
    }
    await until(n => n.t >= secs, secs + 2)
    const s = await end()
    if (speed === 1) { console.log(`      before the first day was counted someone was seen to go ${s.lead.toFixed(0)} m`); for (const t of s.trace.slice(0, 14)) console.log('     ', t.slice(0, 300)) }
    const mv = Math.max(1e-6, s.moving), pace = s.path / mv, px = s.px / mv
    const floor = job.foot ? FLOOR.foot : FLOOR.there[speed]
    const there = job.kind === 'haul' ? s.shown >= FLOOR.haul.shown[speed] * s.secs && s.there >= FLOOR.haul.there * s.secs : s.inside >= floor * s.secs
    const moves = job.foot || job.kind === 'haul' || (pace >= FLOOR.pace[0] && pace <= FLOOR.pace[1] * QUICK[speed] && s.along >= FLOOR.along * s.path && px >= FLOOR.px)
    // (a build that does not say what its machines are at is held to where they are and how they go)
    // (digging: the farm's one tractor is on the trailer between whiles, bringing in what it dug)
    const works = job.foot || job.kind === 'haul' || !s.known || (speed === 1 && job.kind !== 'dig' ? s.working : s.busy) >= FLOOR.working[speed] * s.secs
    check(s.secs > 1 && there && moves && works && s.jumps.length === 0 && s.work > 0, `${job.name} at ${label}, opening view: ${line(s, what)}`)
    if (m) check(m.work >= FLOOR.mark, `${job.name}: from the opening view the work changes ${m.work} pixels of its field's picture (floor ${FLOOR.mark}; ${m.noise} differ between two pictures taken alike)`)
  }
  if (job.once) continue
  // Follow, as a player turns it on: the card of someone the game has at the work, and its key.
  await reach(job, days - 1)
  await start(job, 1)
  if (await until(n => n.who >= 0 && n.secs > 0.4, 14)) {
    await until(n => n.driver >= 0, 5)
    // (whoever is on the machine at it; for hauling, whoever the game has hauling)
    const n = await now(), who = n.driver >= 0 && job.kind !== 'haul' ? n.driver : n.who
    await end()
    await page.evaluate(id => (window as any).__county.app.selectUnit(id, 'land'), who)
    await page.waitForTimeout(500)
    const pressed = await page.evaluate(() => { const b = document.querySelector('[data-testid="whois-follow"]') as HTMLElement | null; b?.click(); return !!b })
    if (!pressed) console.log('   no Follow key on the card')
    await page.waitForTimeout(1300)
    await start(job, 1, who)
    await until(n => n.now && n.there > 2.2, 10)
    await shot(`${job.name}-follow-1x`)
    await shot(`${job.name}-follow-1x-with-the-interface`, false)
    await until(n => n.t >= 9, 11)
    const s = await end()
    const followed = await page.evaluate(() => (window as any).__countyField.following())
    // (from close by a field's outline runs off the screen and behind the camera: here it is the ground they are on
    // that is asked, and that they are in the picture)
    check(followed === who && s.secs > 1 && s.there >= FLOOR.follow * s.secs && s.view >= FLOOR.follow * s.secs && s.jumps.length === 0, `${job.name} at 1x, Follow on person ${who} (the camera is following ${followed}): ${line(s, 'they are')}`)
    // (Follow put off again by its key, and the card away)
    await page.evaluate(() => { const b = document.querySelector('[data-testid="whois-follow"]') as HTMLElement | null; if (b?.getAttribute('aria-pressed') === 'true') b.click() })
    await page.keyboard.press('Escape')
  } else { await end(); check(false, `${job.name}: with Follow, the work never began`) }
}

// ---- (d) one tractor between two people in a day

// In the page: who is seen at this work on a machine and in which field, in the order seen; and what those with
// hours on it are seen at on foot.
await page.evaluate(rects => {
  const W = window as any
  W.__hand = {
    on: false, st: null as any, near: 0, watch: -1,
    begin(kind: string, who: number[], near: number) {
      this.near = near
      this.watch = -1
      const st = this.st = { t: 0, turns: [] as string[], at: -1, since: 0, has: -1, took: 0, afoot: 0, rows: 0, says: false, tractor: { x: 0, z: 0, field: -1 }, where: [] as string[], people: [] as { id: number; x: number; z: number }[], was: new Map<number, { x: number; z: number }>() }
      let last = performance.now()
      this.on = true
      const inField = (x: number, z: number) => rects.findIndex(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)
      const tick = (now: number) => {
        if (!this.on) return
        requestAnimationFrame(tick)
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        const info = W.__countyField.info()
        if (W.__county.app.speed === 0) { st.was.clear(); return }
        st.t += dt
        const seen = (p: any) => (p.fade ?? 1) >= 0.5 && Number.isFinite(p.x)
        const tr = info.rigs.find((r: any) => r.kind === 'tractor')
        if (tr && seen(tr)) st.tractor = { x: tr.x, z: tr.z, field: inField(tr.x, tr.z) }
        // (near: the camera kept on the tractor, or on one of the people, from this far off)
        const on = this.watch < 0 ? st.tractor : st.people.find((p: any) => p.id === this.watch)
        if (this.near > 0 && on && (this.watch >= 0 || tr)) W.__countyField.view({ x: on.x, z: on.z, dist: this.near, yaw: -0.3, pitch: 0.5 })
        st.people = info.units.filter(seen).map((u: any) => ({ id: u.id, x: u.x, z: u.z }))
        // whoever has it, and since when
        if (tr && tr.holder !== st.has) { st.has = tr.holder; st.took = st.t }
        // at this work now, in a field
        const rig = info.rigs.find((r: any) => r.work === kind && r.holder >= 0 && seen(r) && inField(r.x, r.z) >= 0)
        const at = rig ? rig.holder : -1
        if (at !== st.at) { st.at = at; st.since = st.t }
        if (rig) { const t = `${rig.holder}@${inField(rig.x, rig.z)}`; if (st.turns[st.turns.length - 1] !== t) st.turns.push(t) }
        st.where = info.units.map((u: any) => `${u.id} ${!seen(u) ? 'gone from sight' : `${u.foot ? 'on foot' : 'riding'} at ${u.x.toFixed(0)},${u.z.toFixed(0)}${u.doing ? ' (' + u.doing + ')' : ''}`}`)
        for (const u of info.units) {
          if (!who.includes(u.id) || !seen(u)) { st.was.delete(u.id); continue }
          if (u.doing !== undefined) st.says = true
          if (u.doing === 'rows' && u.foot) st.afoot += dt
          const b = st.was.get(u.id)
          if (b && u.foot && inField(u.x, u.z) >= 0) { const d = Math.abs(u.x - b.x); if (d < 3) st.rows += d }
          st.was.set(u.id, { x: u.x, z: u.z })
        }
      }
      requestAnimationFrame(tick)
    },
    now() { const st = this.st; return { t: st.t, turns: st.turns, at: st.at, held: st.t - st.since, has: st.has, taken: st.t - st.took, afoot: st.afoot, rows: st.rows, says: st.says, tractor: st.tractor, where: st.where } },
    end() { this.on = false; return this.now() },
  }
}, FIELDS.map(f => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 })))

type Hand = { t: number; turns: string[]; at: number; held: number; has: number; taken: number; afoot: number; rows: number; says: boolean; tractor: { x: number; z: number; field: number }; where: string[] }
const hand = () => page.evaluate(() => (window as any).__hand.now()) as Promise<Hand>

if (!only || only.includes('shared')) {
  console.log('\n== one tractor between two people (spraying)')
  const job: Job = { name: 'shared', kind: 'spray' }
  const day = await q(page, `${farm(job)}; for (let n = 1; n < 240 && c.phase === 'season' && !sim.seasonDone(c); n++) { c.incidents = []; app.do({ t: 'day' })
    const did = c.season.worked.filter(w => w.kind === 'spray' && w.machine).sort((a, b) => a.from - b.from)
    for (const w of did) { const same = did.filter(x => x.machine === w.machine); if (new Set(same.map(x => x.unit)).size > 1) return { days: n, turns: same.map(x => ({ unit: x.unit, field: x.field, from: x.from, to: x.to })) } } }
    return null`) as { days: number; turns: { unit: number; field: number; from: number; to: number }[] } | null
  if (!day) check(false, 'shared: the day\'s record never has two people on one machine (a build from before it said)')
  else {
    const [a, b] = day.turns
    console.log('  ', `day ${day.days}: ${day.turns.map(t => `person ${t.unit} sprays ${FIELD_NAMES[t.field]} from ${t.from.toFixed(2)} to ${t.to.toFixed(2)} of the day`).join(', then ')}`)
    const who = [...new Set(day.turns.map(t => t.unit))]
    const wait = async (test: (h: Hand) => boolean, most: number): Promise<Hand> => {
      const t0 = Date.now()
      let h = await hand()
      while (Date.now() - t0 < most * 1000 && !test(h)) { await page.waitForTimeout(60); h = await hand() }
      return h
    }
    const said = (h: Hand) => `${h.t.toFixed(1)} s: the tractor is with ${h.has < 0 ? 'nobody' : `person ${h.has}`}${h.at >= 0 ? `, at work with person ${h.at}` : ''}; ${h.where.join('; ')}`
    // near: the camera is kept on the tractor from close by (else the view the season opens with)
    for (const near of [false, true]) {
      const tag = near ? 'near' : 'opening'
      console.log('  ', near ? 'from near the tractor:' : 'from the view the season opens with:', await reach(job, day.days - 1))
      await start(job, 1)
      await page.evaluate(([kind, who, near]) => (window as any).__hand.begin(kind, who, near), ['spray', who, near ? 46 : 0] as [string, number[], number])
      const snapAt = async (name: string) => { await shot(`shared-${tag}-${name}`); console.log('     ', `${name}: ${said(await hand())}`) }
      // the first to have it, at work; and the other, meanwhile (near: the camera goes over to them for it)
      let h = await wait(h => h.at === a.unit && h.held > 1.6, 16)
      await snapAt('1-first-holder')
      if (near) {
        await page.evaluate(id => { (window as any).__hand.watch = id }, b.unit)
        await frames(8)
        await snapAt('1-the-other-meanwhile')
        await page.evaluate(() => { (window as any).__hand.watch = -1 })
      }
      // it changes hands: let go where it stands, and then the second pulling away in it
      h = await wait(h => h.has === b.unit, 14)
      const changed = h.has === b.unit
      await snapAt('2-hand-over-let-go')
      if (changed) { await wait(h => h.has === b.unit && h.taken > 1.12, 3); await snapAt('3-hand-over-away') }
      // the second, at work; and the first, meanwhile
      h = await wait(h => h.at === b.unit && h.held > 1.6, 12)
      await snapAt('4-second-holder')
      if (near) {
        await page.evaluate(id => { (window as any).__hand.watch = id }, a.unit)
        await frames(8)
        await snapAt('4-the-first-meanwhile')
        await page.evaluate(() => { (window as any).__hand.watch = -1 })
      }
      if (!near) await shot('shared-opening-4-second-holder-with-the-interface', false)
      await wait(h => h.t > 22, 8)
      const s = await end(), e = await page.evaluate(() => (window as any).__hand.end()) as Hand
      const want = [`${a.unit}@${a.field}`, `${b.unit}@${b.field}`]
      console.log('     ', `seen at work on it, in order: ${e.turns.map(t => `person ${t.split('@')[0]} in ${FIELD_NAMES[Number(t.split('@')[1])]}`).join(', ') || 'nobody'}`)
      if (near) continue
      check(e.turns[0] === want[0] && e.turns[1] === want[1], `shared: the tractor is seen at work with person ${a.unit} in ${FIELD_NAMES[a.field]} and then with person ${b.unit} in ${FIELD_NAMES[b.field]} (seen: ${e.turns.slice(0, 3).join(', ') || 'nobody'})`)
      check(e.rows <= FLOOR.rows && e.afoot === 0, `shared: those with hours on it are seen to go ${e.rows.toFixed(0)} m along a field's rows on foot (most ${FLOOR.rows.toFixed(0)})${e.says ? `, and at a machine's row work with no machine for ${e.afoot.toFixed(1)} s` : ' (the build does not say what each is at)'}`)
      check(s.jumps.length === 0, `shared: steps nobody could make ${s.jumps.length}${s.jumps.length ? ' (' + s.jumps.slice(0, 3).join('; ') + ')' : ''}, cuts ${s.cuts}`)
    }
  }
}

check(errors.length === 0, `no page errors (${errors.join('; ').slice(0, 300)})`)
await browser.close()
if (failed && !report) process.exitCode = 1
