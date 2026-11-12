// Holds one browser open on the game for a first-time player who sees only pictures: each request carries a few
// actions (as a person's hand would make them), the game runs only while they are carried out, and the
// answer is a picture of the screen. Between requests the game's clock stands still, so a slow player loses nothing.
// Usage: node tools/quality/player.mjs <game url> <port> [--size=1280x800] [--log=out/player.jsonl]
//   POST /act  body: [["click",x,y], ["dblclick",x,y], ["rightclick",x,y], ["move",x,y], ["drag",x1,y1,x2,y2,"left"|"right"],
//                     ["wheel",x,y,deltaY], ["key","Space"], ["hold","ArrowLeft",ms], ["type","text"], ["wait",ms]]
//   GET  /shot       the screen as it is
//   GET  /quit       close the browser and stop (it also stops by itself after 45 minutes with no request)
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import http from 'node:http'
import { chromium } from '@playwright/test'

const [url, port = '4701', ...rest] = process.argv.slice(2)
const opt = k => rest.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const [W, H] = (opt('size') ?? '1280x800').split('x').map(Number)
const log = opt('log') ?? `out/player-${port}.jsonl`
mkdirSync(dirname(log), { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
// The game's frame loop, and the time it reads, stand still while frozen.
await page.addInitScript(() => {
  const real = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window)
  let at = 0, lost = 0, held = []
  performance.now = () => (at || real()) - lost
  window.requestAnimationFrame = cb => raf(() => { if (at) held.push(cb); else cb(performance.now()) })
  window.__freeze = on => {
    if (on) { if (!at) at = real(); return }
    if (!at) return
    lost += real() - at; at = 0
    const h = held; held = []
    for (const cb of h) window.requestAnimationFrame(cb)
  }
})
await page.goto(url)
await page.waitForFunction(() => '__county' in globalThis, null, { timeout: 90000, polling: 500 })
await page.waitForTimeout(6000)
const freeze = on => page.evaluate(on => window.__freeze(on), on)
await freeze(true)
let turn = 0

// What the game holds, for the record only: the player never sees this.
const state = () => page.evaluate(() => {
  try {
    const { app } = globalThis.__county, c = app.campaign
    return { ms: Math.round(performance.now()), phase: c?.phase ?? 'title', year: c?.year, day: c?.season?.day, cash: c?.cash, sel: app.selection?.slice?.(), unit: app.unit, speed: app.speed, worked: c?.season?.worked?.length, jobs: c?.jobs?.length }
  } catch (e) { return { err: String(e) } }
}).catch(e => ({ err: String(e) }))

async function act(a) {
  const [kind, ...v] = a
  const run = ms => page.waitForTimeout(Math.max(0, Math.min(15000, ms)))
  if (kind === 'click') await page.mouse.click(v[0], v[1])
  else if (kind === 'dblclick') await page.mouse.dblclick(v[0], v[1])
  else if (kind === 'rightclick') await page.mouse.click(v[0], v[1], { button: 'right' })
  else if (kind === 'move') await page.mouse.move(v[0], v[1], { steps: 4 })
  else if (kind === 'drag') {
    const button = v[4] === 'right' ? 'right' : 'left'
    await page.mouse.move(v[0], v[1]); await page.mouse.down({ button })
    for (let k = 1; k <= 10; k++) { await page.mouse.move(v[0] + (v[2] - v[0]) * k / 10, v[1] + (v[3] - v[1]) * k / 10); await run(30) }
    await page.mouse.up({ button })
  } else if (kind === 'wheel') { await page.mouse.move(v[0], v[1]); await page.mouse.wheel(0, v[2]) }
  else if (kind === 'key') await page.keyboard.press(String(v[0]))
  else if (kind === 'hold') { await page.keyboard.down(String(v[0])); await run(Number(v[1]) || 500); await page.keyboard.up(String(v[0])) }
  else if (kind === 'type') await page.keyboard.type(String(v[0]))
  else if (kind === 'wait') { await run(Number(v[0]) || 1000); return }
  else throw new Error(`unknown action ${kind}`)
  await run(350)
}

let idle = setTimeout(quit, 45 * 60000)
async function quit() { await browser.close().catch(() => {}); process.exit(0) }

http.createServer(async (req, res) => {
  clearTimeout(idle); idle = setTimeout(quit, 45 * 60000)
  if (req.url === '/quit') { res.end('bye'); void quit(); return }
  try {
    if (req.method === 'POST' && req.url === '/act') {
      let body = ''
      for await (const chunk of req) body += chunk
      const actions = JSON.parse(body || '[]')
      if (!Array.isArray(actions) || actions.length > 8) throw new Error('send a list of at most 8 actions')
      await freeze(false)
      try { for (const a of actions) await act(a) } finally { await freeze(true) }
      appendFileSync(log, JSON.stringify({ turn: ++turn, actions, ...(await state()), errors: errors.splice(0) }) + '\n')
    } else if (!(req.method === 'GET' && req.url === '/shot')) { res.writeHead(404); res.end('POST /act or GET /shot'); return }
    const png = await page.screenshot({ timeout: 20000 })
    res.writeHead(200, { 'content-type': 'image/png' }); res.end(png)
  } catch (e) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end(String(e?.message ?? e)) }
}).listen(Number(port), '127.0.0.1', () => console.log(`player ready on ${port} (${W}x${H})`))
