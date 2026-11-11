import { chromium } from '@playwright/test'
const b = await chromium.launch({ args: [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 900)) })
p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 600)))
await p.goto(process.argv[2])
await p.waitForTimeout(6000)
console.log('field hook', await p.evaluate(() => typeof window.__countyField), 'county', await p.evaluate(() => typeof window.__county))
await b.close()
