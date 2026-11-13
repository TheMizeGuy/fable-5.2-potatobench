// Plays two years on the fixed farm the way the game asks (the word to plant, the season's spraying answered, the
// stamps pressed, each crop sold at its ticket; a hand hired and a sprayer bought in the second spring) and, on every
// game day, writes down what the page says beside what the farm holds, so that two places which disagree can be found.
// Usage: node tools/quality/agree.ts <base url> <out dir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { closeAll, GPU, HELPER, q } from './shared.ts'

const [base, out] = process.argv.slice(2)
if (!base || !out) throw new Error('usage: agree.ts <base url> <out dir>')
mkdirSync(out, { recursive: true })

// Runs in the page: one day's reading. What is printed, from the page; what is so, from the farm.
const READ = `window.__read = () => {
  const { app, sim } = window.__county
  const c = app.campaign, s = c.season
  const t = (sel, root) => [...(root || document).querySelectorAll(sel)].filter(e => e.offsetParent !== null || e.getClientRects().length).map(e => (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim())
  const one = sel => t(sel)[0] || ''
  const el = id => document.querySelector('#ui [data-testid="' + id + '"]')
  const people = c.crew.map(u => ({
    id: u.id, name: u.name, kind: u.kind, job: u.job, at: u.at, road: u.road, rig: u.rig,
    chip: (el('unit-' + u.id)?.querySelector('.unit-text')?.textContent || '').trim(),
    chipTitle: el('unit-' + u.id)?.getAttribute('title') || '',
    pin: el('pin-' + u.id)?.getAttribute('aria-label') || '',
  }))
  const fields = s ? s.fields.map((f, i) => !sim.isField(c, i) ? null : ({
    i, name: sim.FIELD_NAMES[i], status: f.status, plantDay: f.plantDay, killDay: f.killDay, deadDay: f.deadDay, weighed: !!f.weighed, lastSpray: f.lastSpray,
    jobs: s.jobs.filter(j => j.field === i).map(j => j.kind),
    need: app.needs()[i]?.need ? { act: app.needs()[i].need.act, text: app.needs()[i].need.text, urgent: !!app.needs()[i].need.urgent } : null,
    hold: app.needs()[i]?.hold ? { act: app.needs()[i].hold.act, text: app.needs()[i].hold.text } : null,
    badge: el('badge-' + i)?.getAttribute('title') || (el('badge-' + i) ? 'badge' : ''),
    tag: el('field-' + i)?.getAttribute('title') || '',
    listed: !!el('field-' + i)?.querySelector('.listed'),
  })).filter(Boolean) : []
  return {
    day: s ? s.day : -1, date: one('#ui [data-testid="date"]'), phase: c.phase, year: c.year,
    word: s ? sim.plantWordGiven(s) : null, done: s ? sim.seasonDone(c) : null, frozen: s ? !!s.frozen : null,
    speed: app.speed, pause: app.pauseCause, cash: Math.round(c.cash),
    people, fields,
    jobs: s ? s.jobs.map(j => ({ id: j.id, kind: j.kind, field: j.field, unit: j.unit, by: j.by, done: j.done, need: j.need })) : [],
    worked: s ? s.worked.map(w => ({ unit: w.unit, kind: w.kind, field: w.field })) : [],
    goalT: one('#ui [data-testid="goal"] .goal-t'), goalWhen: one('#ui [data-testid="goal"] .goal-when'), goalN: one('#ui [data-testid="goal"] .goal-n'),
    goalDo: one('#ui [data-testid="goal-do"]'), goalFaster: one('#ui [data-testid="goal-faster"]'),
    notes: t('#ui .notes .alert'), pressing: one('#ui [data-testid="pressing"]'),
    queue: [...document.querySelectorAll('#ui .queue .q')].map(e => (e.querySelector('.sr')?.textContent || '').trim()),
    cashLabel: one('#ui .bank .t-label'), cashShown: one('#ui [data-testid="cash"]'), cashMoved: one('#ui [data-testid="cash-moved"]'),
    outlook: one('#ui [data-testid="outlook"]'), why: one('#ui [data-testid="outlook-why"]'),
    phases: el('phases')?.getAttribute('aria-label') || '', status: one('#ui [data-testid="paused"], #ui [data-testid="running"]'),
    paper: one('#ui .dialog:not(.out)').slice(0, 1600), card: one('#ui [data-testid="card"]').slice(0, 900),
    who: one('#ui [data-testid="person-doing"]'), whois: one('#ui [data-testid="whois-now"]') + ' ' + one('#ui [data-testid="whois-where"]'), whoOf: app.unit,
    holding: String(app.holding || ''), ticketUp: !!el('weighin'),
    incidents: c.incidents.map(x => x.kind), lots: c.lots.map(l => ({ id: l.id, field: l.field, year: l.year, sold: l.sold, open: !!l.open })),
    alerts: app.alerts.slice(-6).map(a => ({ day: a.day, type: a.type, field: a.field, text: a.text })),
    said: (window.__said || []).splice(0),
  }
}
// Every slip that comes up, with the day it came on (one shows at a time, and the next takes its place).
window.__said = []
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches && n.matches('.alert')) window.__said.push({ day: window.__county.app.campaign?.season?.day ?? -1, text: (n.innerText || '').replace(/\\s+/g, ' ').trim() }) }).observe(document.getElementById('ui'), { childList: true, subtree: true })`

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(base + '?year=1990&seed=7')
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
await page.evaluate(HELPER)
await page.evaluate(READ)

const rows: unknown[] = []
const read = async (tag: string) => { const r = await page.evaluate('window.__read()') as Record<string, unknown>; r.tag = tag; rows.push(r); return r }
const settle = (ms = 70) => page.waitForTimeout(ms)

async function season(label: string): Promise<void> {
  await page.getByTestId('begin-season').click()
  await page.getByTestId('date').waitFor()
  await q(page, 'q.g().app.setSpeed(0)')
  await settle(300)
  await read(`${label} first day`)
  for (let n = 0; n < 420; n++) {
    const state = await q(page, `const { app, sim } = q.g(); const c = app.campaign; return { done: c.phase !== 'season' || sim.seasonDone(c), crew: c.crew.length, fields: c.season.fields.length }`) as { done: boolean; crew: number; fields: number }
    if (state.done) break
    // The season's spraying question, answered on its card: keep the fields sprayed.
    const ask = page.getByTestId('spray-way-auto')
    if (await ask.isVisible().catch(() => false)) { await read(`${label} spray question`); await ask.click(); await settle(200) }
    // What a player who follows the game does: the word to plant, the spraying answered "keep the fields sprayed",
    // every stamp pressed that is theirs to press, a telegram answered, the crop sold from its ticket.
    await q(page, `const { app, sim } = q.g(); const c = app.campaign
      const auto = new Set(sim.routineInfo(c).filter(r => r.auto).map(r => r.kind))
      app.needs().forEach((n, i) => { const a = n.need; if (!a || a.act === 'wait' || a.act === 'close' || a.act === 'sell') return
        if (a.act === 'plant' ? sim.plantWordGiven(c.season) : auto.has(a.act)) return
        app.do({ t: 'job', kind: a.act, field: i }) })
      for (const x of [...c.incidents]) app.do({ t: 'answer', incident: x.id, choice: x.kind === 'applicant' && c.year > 1990 ? 'hire' : x.choices[x.choices.length - 1] })
      app.do({ t: 'day' }); app.setSpeed(0)`)
    await settle()
    // One field's card and one person's page a day, in turn.
    await q(page, `const { app, sim } = q.g(); const c = app.campaign; const fs = c.season.fields.map((_, i) => i).filter(i => sim.isField(c, i) && c.season.fields[i].status !== 'off')
      app.selectUnit(-1); app.select(fs[${n} % fs.length])`)
    await settle()
    const a = await read(`${label} field`)
    await q(page, `const { app } = q.g(); const c = app.campaign; app.select(-1); const u = c.crew[${n} % c.crew.length]; app.selectUnit(u.id, ${n % 2 ? `'land'` : `'list'`})`)
    await settle()
    await read(`${label} person`)
    await q(page, `const { app } = q.g(); app.selectUnit(-1)`)
    // A weigh ticket: read as it stands, then sold by its first key.
    for (let k = 0; k < 4 && await page.getByTestId('weighin').count(); k++) {
      await settle(1600)
      await read(`${label} ticket`)
      await page.keyboard.press('1')
      await settle(700)
      await read(`${label} sold`)
      await closeAll(page)
      await settle(300)
    }
    if (a.paper) await closeAll(page)
  }
  await read(`${label} last day`)
  await closeAll(page)
  await q(page, `const { app, sim } = q.g(); const c = app.campaign; for (const l of sim.openLots(c)) app.do({ t: 'sell', lot: l.id, frac: 1 }); if (c.phase === 'season') app.do({ t: 'endSeason' })`)
  await settle(400)
  await read(`${label} winter`)
  for (let k = 0; k < 12; k++) {
    const phase = await q(page, `return q.g().app.campaign.phase`)
    if (phase !== 'cellar') break
    await q(page, `q.g().app.do({ t: 'month' })`)
    await settle(120)
  }
  await settle(600)
  const led = await page.evaluate(() => (document.querySelector<HTMLElement>('#ui')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 2600))
  rows.push({ tag: `${label} ledger`, text: led })
}

await read('spring one')
await season('year one')
await q(page, `const { app } = q.g(); if (app.campaign.phase === 'ledger') app.do({ t: 'next' })`)
await settle(600)
await q(page, `const { app } = q.g(); app.do({ t: 'hire', kind: 'hand' }); app.do({ t: 'buy', upgrade: 'boom' })`)
await settle(300)
rows.push({ tag: 'spring two', text: await page.evaluate(() => (document.querySelector<HTMLElement>('#ui')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 2600)) })
await season('year two')
await browser.close()

writeFileSync(`${out}/days.jsonl`, rows.map(r => JSON.stringify(r)).join('\n'))
console.log(`${rows.length} readings written to ${out}/days.jsonl; ${errors.length} page errors`)
for (const e of errors.slice(0, 10)) console.log(`  ${e}`)
