// One picture of the field view for working on the look: runs a snippet in the page, then takes a screenshot.
// Usage: node tools/render/look.ts <base-url> <out.png> [WxH] [snippet.js] [--ui] [--soft] [--browser=firefox|webkit]
// The snippet is the body of an async function with `app`, `sim`, `field` (window.__countyField) and `frames(n)` in scope.
import { readFileSync } from 'node:fs'
import { chromium, firefox, webkit } from '@playwright/test'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const [base, out, size = '1440x900', snippet] = args
const [w, h] = size.split('x').map(Number)
const soft = process.argv.includes('--soft')
const other = process.argv.find(a => a.startsWith('--browser='))?.slice(10)
const browser = other === 'firefox' ? await firefox.launch() : other === 'webkit' ? await webkit.launch() : await chromium.launch({
  args: soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); else if (m.text().startsWith('look:')) console.log(m.text()) })
page.on('pageerror', e => errors.push(e.message))
const t0 = Date.now()
await page.goto(base)
try {
  await page.waitForFunction(() => (window as any).__countyField !== undefined, undefined, { timeout: 20000 })
} catch {
  console.log('the field view never came up')
}
console.log(`up in ${Date.now() - t0} ms`)
const insets = (process.argv.find(a => a.startsWith('--insets='))?.slice(9) ?? '0,0,0,0').split(',').map(Number)
if (!process.argv.includes('--ui')) {
  // The interface is hidden and the screen edges it would cover are held as given.
  await page.evaluate(([t, r, b, l]) => {
    const { app } = (window as any).__county
    ;(document.getElementById('ui') as HTMLElement).style.display = 'none'
    const set = app.setInsets.bind(app)
    app.setInsets = () => set(t, r, b, l)
    set(t, r, b, l)
  }, insets)
}
const body = snippet ? readFileSync(snippet, 'utf8') : 'field.settle(); await frames(4)'
const result = await page.evaluate(async body => {
  const { app, sim } = (window as any).__county
  const field = (window as any).__countyField
  const frames = (n: number) => new Promise<void>(res => { let k = 0; const t = () => (++k >= n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t) })
  const fn = new (Object.getPrototypeOf(async function () {}).constructor)('app', 'sim', 'field', 'frames', body)
  try { return await fn(app, sim, field, frames) } catch (e) { return `snippet failed: ${String(e)}` }
}, body)
if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result))
await page.screenshot({ path: out })
console.log(out)
if (errors.length) console.log('console:\n  ' + [...new Set(errors)].slice(0, 12).join('\n  '))
await browser.close()
