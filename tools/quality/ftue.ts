// A new player's first year, traced: what the tutorial does to someone who takes it and then does only what the
// game asks of them. Every tenth of a second the page is read (the clock, why it stands, the tip on show, where
// the camera is); the player's own acts are written down beside it. From the two come the figures a tutorial is
// held to: how often it stopped the game, how many presses only put a tip away, how many words it showed, how
// often the clock or the camera moved without the player's hand, and how long the year took.
// It reads only what any build of the game shows, so it can be run on an old build and a new one.
// Usage: node tools/quality/ftue.ts <url> [--size=1440x900] [--limit=600]
import { chromium } from '@playwright/test'
import { GPU } from './shared.ts'

const args = process.argv.slice(2)
const [base = 'http://localhost:5317/'] = args.filter(a => !a.startsWith('--'))
const size = (args.find(a => a.startsWith('--size='))?.slice(7) ?? '1440x900').split('x').map(Number)
const limit = Number(args.find(a => a.startsWith('--limit='))?.slice(8) ?? 600) * 1000

const browser = await chromium.launch({ args: GPU })
const page = await (await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 })).newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(base)
await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'), null, { timeout: 60000 })

type Seen = {
  t: number; phase: string; speed: number; pace: number; why: string; cause: string; day: number
  tip: string; tipWords: number; tipText: string; tipKeys: string[]; target: string; drive: string
  offer: boolean; card: boolean; telegram: boolean; spray: boolean; paper: boolean; ticket: boolean; begin: boolean; skip: boolean; cam: string
}
const see = () => page.evaluate(() => {
  const g = globalThis as unknown as { __county: { app: { campaign: { phase: string; season?: { day: number } } | null; speed: number; pace: number; pauseReason: string; pauseCause: string } }; __countyField?: { rig?: { where(): { x: number; z: number; dist: number; yaw: number } } } }
  const app = g.__county.app, ui = document.getElementById('ui')!
  const vis = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && !e.hidden && !e.closest('[hidden], .leaving, .out') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'
  const q = (s: string) => [...ui.querySelectorAll<HTMLElement>(s)].find(vis) ?? null
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const slip = [...ui.querySelectorAll<HTMLElement>('[data-testid="guide-slip"]')].find(e => vis(e) && !e.classList.contains('guide-card')) ?? null
  const text = slip ? [...slip.querySelectorAll<HTMLElement>('.guide-ask, .guide-why, .tip-ask, .tip-why')].filter(vis).map(e => e.innerText).join(' ') : ''
  const drive = q('[data-testid="guide-drive"]')
  const w = g.__countyField?.rig?.where?.()
  return {
    t: performance.now(), phase: app.campaign?.phase ?? 'title', speed: app.speed, pace: app.pace, why: app.pauseReason ?? '', cause: app.pauseCause ?? '', day: app.campaign?.season?.day ?? -1,
    tip: slip?.dataset.lesson ?? '', tipWords: words(text), tipText: text.replace(/\s+/g, ' ').slice(0, 160), tipKeys: slip ? [...slip.querySelectorAll<HTMLElement>('button')].filter(vis).map(b => b.dataset.testid ?? '') : [], target: slip?.dataset.target ?? '',
    drive: drive ? drive.innerText.replace(/\s+/g, ' ').slice(0, 80) : '',
    offer: !!q('[data-testid="guide-offer"]'), card: !!q('.guide-card.frame'), telegram: !!q('.season-screen .telegram:not(.guide-card)'), spray: !!q('[data-testid="spray-way-auto"]'),
    paper: !!ui.querySelector('.paper-layer > .dialog:not(.out)'), ticket: !!q('.paper-layer [data-testid^="lot-sell-"]'), begin: !!q('[data-testid="begin-season"]'), skip: !!q('[data-testid="goal-faster"]'),
    cam: w ? [w.x, w.z, w.dist, w.yaw].map(n => Math.round(n * 2) / 2).join(',') : '',
  }
}) as Promise<Seen>

const acts: { t: number; what: string; kind: 'game' | 'tutorial' | 'offer' }[] = []
const act = async (what: string, kind: 'game' | 'tutorial' | 'offer', sel: string) => {
  const el = page.locator(`#ui ${sel}`).first()
  if (!(await el.isVisible().catch(() => false))) return false
  await el.click({ timeout: 2000 }).catch(() => {})
  acts.push({ t: await page.evaluate(() => performance.now()), what, kind })
  return true
}
const key = async (what: string, k: string) => { await page.keyboard.press(k); acts.push({ t: await page.evaluate(() => performance.now()), what, kind: 'game' }) }

await page.getByTestId('play').first().click()
const log: Seen[] = []
const t0 = Date.now()
let begun = 0, ticketAt = 0, idleSince = 0, tipSince = 0, lastTip = ''
while (Date.now() - t0 < limit) {
  const s = await see()
  log.push(s)
  if (s.phase === 'season' && !begun) begun = s.t
  if (s.ticket) { ticketAt = s.t; break }
  if (s.tip !== lastTip) { lastTip = s.tip; tipSince = Date.now() }
  let did = false
  // What a new player does: answers what is asked, presses what a tip points at, reads a tip before putting it away.
  if (s.offer) did = await act('take the tutorial', 'offer', '[data-testid="guide-accept"]')
  else if (s.card) did = (await act('put the year card away', 'tutorial', '.guide-card.frame [data-testid="guide-noted"]')) || (await act('put the year card away', 'tutorial', '.guide-card.frame button'))
  else if (s.telegram) did = await act('answer a telegram', 'game', '.season-screen .telegram:not(.guide-card) .reply')
  else if (s.spray) did = await act('answer the spraying question', 'game', '[data-testid="spray-way-auto"]')
  else if (s.tip) {
    if (s.tipKeys.includes('guide-act')) did = await act(`${s.tip}: its own key`, 'game', '[data-testid="guide-slip"] [data-testid="guide-act"]')
    else if (/^badge-/.test(s.target)) did = await act(`${s.tip}: the stamp it points at`, 'game', `[data-testid="${s.target}"]`)
    else if (s.target === 'begin-season') did = await act('start the season', 'game', '[data-testid="begin-season"]')
    else if (s.target === 'goal-faster') did = await act('skip ahead', 'game', '[data-testid="goal-faster"]')
    else if (s.target === 'paused-go' || s.target === 'speed-0' || s.target === 'speed-toggle') { await key(`${s.tip}: run the days (Space)`, 'Space'); did = true }
    else if (s.target === 'speed-2' || s.target === 'speed-3' || s.target === 'speed-cycle') did = await act(`${s.tip}: a faster speed`, 'game', `[data-testid="${s.target}"]`)
    else if (Date.now() - tipSince > 1500 + s.tipWords * 120 && (s.tipKeys.includes('guide-noted') || s.tipKeys.includes('guide-pass')) && s.speed === 0 && /tip from the county agent/i.test(s.why)) did = (await act(`${s.tip}: Got it`, 'tutorial', '[data-testid="guide-slip"] [data-testid="guide-noted"]')) || (await act(`${s.tip}: Got it`, 'tutorial', '[data-testid="guide-slip"] [data-testid="guide-pass"]'))
  }
  if (!did && s.phase === 'plan' && s.begin && !s.tip && !s.offer && !s.card) did = await act('start the season', 'game', '[data-testid="begin-season"]')
  // Nothing asked and the days standing: after a moment the player runs them (the key the game offers, or Space).
  // With the key the game offers for a wait on show (Skip ahead), the player uses it once nothing else is asked.
  if (!did && s.phase === 'season' && !s.paper && !s.drive && !s.tip && (s.speed === 0 || (s.skip && s.speed < 3))) {
    if (!idleSince) idleSince = Date.now()
    else if (Date.now() - idleSince > 2500) { if (!(s.skip && await act('skip ahead', 'game', '[data-testid="goal-faster"]'))) { if (s.speed === 0) await key('run the days (Space)', 'Space') } idleSince = 0 }
  } else idleSince = 0
  await page.waitForTimeout(did ? 250 : 100)
}

// What the trace says.
const season = log.filter(s => s.phase === 'season')
const tips: { id: string; words: number; text: string; held: boolean; ms: number }[] = []
for (let k = 0; k < season.length; k++) {
  const s = season[k]
  if (s.tip && (k === 0 || season[k - 1].tip !== s.tip)) tips.push({ id: s.tip, words: s.tipWords, text: s.tipText, held: false, ms: 0 })
  if (s.tip && tips.length) { const x = tips[tips.length - 1]; if (k > 0 && season[k - 1].tip === s.tip) x.ms += s.t - season[k - 1].t; if (s.speed === 0 && /tip from the county agent/i.test(s.why)) x.held = true }
}
const near = (t: number) => acts.some(a => a.t <= t && t - a.t < 700)
let clock = 0, cam = 0, lastCam = -1e9, slows = 0
for (let k = 1; k < season.length; k++) {
  const a = season[k - 1], b = season[k]
  // (the days slowed to the first speed while a tip is up, and put back when it goes, are counted apart)
  const forTip = (!!b.tip && b.speed === 1 && a.speed > 1) || (!b.tip && a.speed === 1 && b.speed > 1 && season.slice(Math.max(0, k - 12), k).some(x => x.tip))
  if (forTip) slows++
  else if ((a.speed !== b.speed || a.pace !== b.pace) && !near(b.t) && !(b.speed === 0 && b.cause)) clock++
  // (the view the season opens on is the game's own)
  if (a.cam && b.cam && a.cam !== b.cam && b.t - lastCam > 1500 && b.t - begun > 6000) { cam++ } if (a.cam !== b.cam) lastCam = b.t
}
// How long the days stood with nothing on show that asked for anything: time a new player spends not knowing what to do.
const idle: number[] = []
{ let run = 0; for (let k = 1; k < season.length; k++) { const s = season[k]; if (s.speed === 0 && !s.tip && !s.telegram && !s.spray && !s.paper && !s.cause) run += s.t - season[k - 1].t; else { if (run) idle.push(run); run = 0 } } if (run) idle.push(run) }
let heldMs = 0
for (let k = 1; k < season.length; k++) if (season[k].speed === 0 && /tip from the county agent/i.test(season[k].why)) heldMs += season[k].t - season[k - 1].t
console.log(`the first year, from Start the season to the first weigh ticket: ${ticketAt ? `${Math.round((ticketAt - begun) / 1000)} s` : `not reached in ${Math.round(limit / 1000)} s (day ${log.at(-1)?.day})`}`)
console.log(`tips shown in the season: ${tips.length}, ${tips.reduce((n, x) => n + x.words, 0)} words in all, the longest ${Math.max(0, ...tips.map(x => x.words))}`)
console.log(`times a tip stopped the game: ${tips.filter(x => x.held).length} (${Math.round(heldMs / 1000)} s stopped for tips)`)
console.log(`presses that only put a tip or its card away: ${acts.filter(a => a.kind === 'tutorial').length}; presses that played the game: ${acts.filter(a => a.kind === 'game').length}`)
console.log(`the longest the game stood still with nothing asked: ${Math.round(Math.max(0, ...idle) / 1000)} s`)
console.log(`times the clock changed without the player's hand (the game's own stops for a decision aside): ${clock}`)
console.log(`times the days were slowed to 1x for a tip or put back after one: ${slows}`)
console.log(`times the camera moved without the player's hand: ${cam}`)
for (const x of tips) console.log(`  ${x.id.padEnd(9)} ${String(x.words).padStart(3)} words, ${x.held ? 'stopped the game' : 'the game went on'}, up ${(x.ms / 1000).toFixed(1)} s: ${x.text}`)
console.log(`the player's presses: ${acts.map(a => `${a.kind === 'tutorial' ? '[tip] ' : ''}${a.what}`).join(' > ')}`)
console.log(`${errors.length} page errors${errors.length ? `: ${errors[0]}` : ''}`)
await browser.close()
