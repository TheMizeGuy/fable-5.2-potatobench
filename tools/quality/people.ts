// Clicks every person on the land, by their body and by their pin, in spring, the season and winter at the four camera
// tiers, and checks their card: on screen within 300 ms, within 240 px of them, not under another panel, naming them,
// gone on Escape; and that the pointer over them shows their name first.
// Usage: node tools/quality/people.ts <base url | live> [out dir] [--report]   (--report: list what happens, fail on nothing)
import { chromium, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const [arg, out = 'out/people'] = process.argv.slice(2).filter(a => !a.startsWith('--'))
// 'live': the published game, to see what it does before a change.
const base = arg === 'live' ? 'https://themizeguy.github.io/Fable52PotatoBench/' : arg
const report = process.argv.includes('--report')
if (!base) throw new Error('usage: people.ts <base url> [out dir] [--report]')
mkdirSync(out, { recursive: true })

const TIERS = ['yard', 'field', 'farm', 'county'] as const
const PHASES: Record<string, string> = {
  spring: `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })`,
  season: `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
    app.do({ t: 'begin' }); q.run(q.day(6, 15)); app.campaign.incidents = []; app.setSpeed(0)`,
  winter: `const { app } = q.g(); app.newGame(1987, 3); const c = app.campaign; c.cash += 30000
    c.buildings.push({ id: c.nextBuilding++, kind: 'bunk', yard: -1, done: 12, need: 12, built: true })
    for (const a of [...c.applicants]) app.do({ t: 'hire', applicant: a.id })
    app.do({ t: 'begin' }); q.run(999, ['sell']); app.do({ t: 'endSeason' }); c.cash += 60000; app.do({ t: 'build', kind: 'shed', yard: -1 })
    for (const u of c.crew) if (u.kind !== 'farmer') app.do({ t: 'winter', unit: u.id, work: 'build' })`,
}

interface Row { phase: string; tier: string; who: string; how: string; result: string; ok: boolean }
const rows: Row[] = []
let failed = 0

const browser = await chromium.launch({ args: GPU })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.addInitScript(HELPER)
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis)
await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30_000 }).catch(() => {})

const settle = () => page.evaluate(() => (globalThis as any).__countyField?.settle?.())
// What opened for a person: the card beside them (whois) or the page at the foot of the season screen (person-card).
const cardNow = (page: Page) => page.evaluate(() => {
  for (const id of ['whois', 'person-card']) {
    const el = document.querySelector<HTMLElement>(`#ui [data-testid="${id}"]`)
    if (!el || el.hidden || el.offsetParent === null) continue
    const r = el.getBoundingClientRect()
    const mid = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2))
    return { id, x: r.left, y: r.top, w: r.width, h: r.height, text: el.textContent ?? '', onTop: !!mid && el.contains(mid) }
  }
  return null
})

for (const [phase, setup] of Object.entries(PHASES)) {
  await q(page, setup)
  await closeAll(page)
  const people = await q(page, `return q.g().app.campaign.crew.map(u => ({ id: u.id, name: u.kind === 'farmer' ? 'You' : u.name }))`) as { id: number; name: string }[]
  for (const tier of TIERS) {
    for (const person of people) {
      for (const how of ['body', 'pin'] as const) {
        // (Escape with nothing open would open the menu: papers are put away only when there are some)
        await closeAll(page)
        await page.evaluate(() => { const { app } = (globalThis as any).__county; app.selectUnit(-1); app.select(-1); app.selectYard(0); app.inspect?.(null) })
        // the field tier is put on the field the person is at; the yard tier on the home yard
        await page.evaluate(([t, id]) => { const { app } = (globalThis as any).__county; const u = app.campaign.crew.find((x: any) => x.id === id); (globalThis as any).__countyField.tier(t, t === 'field' && u && u.at >= 0 ? u.at : undefined) }, [tier, person.id] as const)
        await settle()
        await page.waitForTimeout(250)
        const at = await page.evaluate(([id, how]) => {
          const f = (globalThis as any).__countyField
          if (how === 'pin') {
            const pin = document.querySelector<HTMLElement>(`#ui [data-testid="pin-${id}"]`)
            if (!pin || pin.closest('.gone')) return null
            const r = pin.querySelector('.head')!.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, pin: true }
          }
          const p = f.unitAt(id)
          if (!p || p.x < 2 || p.y < 2 || p.x > innerWidth - 2 || p.y > innerHeight - 2) return null
          // a point the interface covers is no click on the land
          const top = document.elementFromPoint(p.x, p.y)
          // a click on their own pin, standing over them, is a click on them too
          return top && (top.tagName === 'CANVAS' || top.closest('.pin')) ? { x: p.x, y: p.y, pin: false } : { x: p.x, y: p.y, pin: false, covered: (top as HTMLElement | null)?.className?.toString().slice(0, 30) }
        }, [person.id, how] as const) as { x: number; y: number; pin: boolean; covered?: string } | null
        const row: Row = { phase, tier, who: person.name, how, result: '', ok: true }
        rows.push(row)
        if (!at) { row.result = how === 'pin' ? 'no pin on screen' : 'not on screen'; continue }
        if (at.covered) { row.result = `under the interface (${at.covered})`; continue }
        // The pointer over them first: their name.
        let named = true
        if (how === 'body') {
          // people at work move: the point is taken again just before the pointer goes there
          const now = await page.evaluate(id => (globalThis as any).__countyField.unitAt(id), person.id) as { x: number; y: number } | null
          if (now) { at.x = now.x; at.y = now.y }
          await page.mouse.move(at.x, at.y)
          await page.waitForTimeout(60)
          const again = await page.evaluate(id => (globalThis as any).__countyField.unitAt(id), person.id) as { x: number; y: number } | null
          if (again) { at.x = again.x; at.y = again.y; await page.mouse.move(at.x, at.y) }
          await page.waitForTimeout(60)
          named = await page.evaluate(n => { const l = document.querySelector<HTMLElement>('#ui .hover-name'); return !!l && !l.hidden && (l.textContent ?? '').includes(n.split(' ')[0]) }, person.name)
        } else {
          // a pin goes with its person, who may be at work: its place is taken again just before the click
          const now = await page.evaluate(id => { const p = document.querySelector<HTMLElement>(`#ui [data-testid="pin-${id}"] .head`); if (!p || p.closest('.gone')) return null; const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, person.id) as { x: number; y: number } | null
          if (now) { at.x = now.x; at.y = now.y }
        }
        const t0 = Date.now()
        await page.mouse.click(at.x, at.y)
        // a group pin opens to the people in it
        // a group pin, there or over their body, opens to the people in it
        await page.waitForTimeout(80)
        { const pick = page.getByTestId(`pin-pick-${person.id}`); if (await pick.isVisible().catch(() => false)) await pick.click() }
        let card = await cardNow(page)
        while (!card && Date.now() - t0 < 300) { await page.waitForTimeout(25); card = await cardNow(page) }
        const ms = Date.now() - t0
        if (!card) {
          const why = await page.evaluate(([x, y]) => { const f = (globalThis as any).__countyField; const { app } = (globalThis as any).__county; const p = f.pickAt(x, y); return `view picks unit ${p.unit}, field ${p.field}, yard ${p.yard}; app.unit ${app.unit} from ${app.unitFrom}` }, [at.x, at.y])
          row.result = `nothing opened (${ms} ms): ${why}`; row.ok = false; continue
        }
        const dx = Math.max(card.x - at.x, 0, at.x - (card.x + card.w)), dy = Math.max(card.y - at.y, 0, at.y - (card.y + card.h))
        const far = Math.round(Math.hypot(dx, dy))
        const right = card.text.includes(person.name.split(' ')[0])
        const onScreen = card.x >= -1 && card.y >= -1 && card.x + card.w <= 1441 && card.y + card.h <= 901
        await page.keyboard.press('Escape')
        await page.waitForTimeout(260)
        const closed = !(await cardNow(page))
        await closeAll(page)
        row.ok = card.id === 'whois' && ms <= 300 && far <= 240 && card.onTop && right && onScreen && closed && named
        row.result = `${card.id} in ${ms} ms, ${far} px away${card.onTop ? '' : ', under another panel'}${right ? '' : ', wrong person'}${onScreen ? '' : ', off screen'}${closed ? '' : ', stays on Escape'}${named ? '' : ', no name on hover'}`
        if (!row.ok && !report) await page.screenshot({ path: join(out, `${phase}-${tier}-${person.id}-${how}.png`) })
      }
    }
  }
}
await browser.close()

for (const r of rows) {
  const line = `${r.ok ? 'ok  ' : 'FAIL'} ${r.phase.padEnd(7)} ${r.tier.padEnd(7)} ${r.who.padEnd(22)} ${r.how.padEnd(5)} ${r.result}`
  console.log(line)
  if (!r.ok) failed++
}
const tried = rows.filter(r => !/not on screen|no pin|under the interface/.test(r.result))
console.log(`${tried.length} clicks tried of ${rows.length}; ${failed} failed; page errors: ${errors.length ? errors.join(' | ') : 'none'}`)
writeFileSync(join(out, 'people.json'), JSON.stringify({ rows, errors }, null, 1) + '\n')
if (!report && (failed || errors.length || tried.length < 10)) process.exitCode = 1
