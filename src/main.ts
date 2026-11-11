import weatherJson from './data/weather/caribou.json'
import neighbor from './data/neighbor.json'
import notes from './data/notes.json'
import prices from './data/prices.json'
import records from './data/records.json'
import { createSound } from './audio/index.ts'
import { App } from './game/app.ts'
import { createFieldView } from './render/index.ts'
import * as sim from './sim/index.ts'
import { mountHud } from './ui/index.ts'

const world = sim.makeWorld(weatherJson as unknown as sim.WeatherData, {
  priceLevel: prices as Record<string, number>,
  records: records as Record<string, sim.YearRecord>,
  neighbor: neighbor as Record<string, sim.NeighborYear>,
  notes: notes as Record<string, string>,
})

const app = new App(world)
const canvas = document.getElementById('field') as HTMLCanvasElement
const view = createFieldView(canvas, app)
const hud = mountHud(document.getElementById('ui') as HTMLElement, app, view)
const sound = createSound(app)

// A fixed seed and year from the address bar make a run repeatable: ?year=1987&seed=42
const q = new URLSearchParams(location.search)
// It never replaces a farm already saved in this browser, and only starts in a year that can be played.
if (q.has('year') && !app.savedGame() && app.startYears().includes(Number(q.get('year')))) {
  app.newGame(Number(q.get('year')), q.has('seed') ? Number(q.get('seed')) : undefined)
}

// The landing page says what this is an entry in.
const credit = document.createElement('p')
credit.id = 'credit'
credit.style.cssText = 'position:fixed;right:20px;bottom:16px;margin:0;z-index:5;pointer-events:none;text-align:right;color:#f3ecdc;' +
  'font:600 15px/1.35 "Public Sans Variable","Public Sans",system-ui,sans-serif;text-shadow:0 1px 3px rgb(16 20 14 / .85),0 0 14px rgb(16 20 14 / .5)'
const creditTop = document.createElement('span')
creditTop.textContent = 'Fable 5.2 - PotatoBench'
const creditBy = document.createElement('span')
creditBy.textContent = 'PotatoBench made by TheMizeGuy'
creditBy.style.cssText = 'display:block;font-weight:400;font-size:13px'
credit.append(creditTop, creditBy)
document.body.append(credit)
const showCredit = (): void => { credit.style.display = app.screen === 'title' ? '' : 'none' }
app.on(e => { if (e.type === 'screen') showCredit() })
showCredit()

let last = performance.now()
function loop(now: number): void {
  const dt = Math.min(100, now - last)
  last = now
  app.tick(dt)
  view.frame(dt)
  hud.frame(dt)
  sound.frame(dt)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

addEventListener('resize', () => view.resize())
document.addEventListener('visibilitychange', () => { if (document.hidden) app.save() })
addEventListener('pagehide', () => app.save())

// For end-to-end tests and bug reports.
;(globalThis as Record<string, unknown>).__county = { app, sim }
