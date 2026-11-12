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

// ?kit opens the living kit of the interface instead of the game (src/ui/system/kit.ts).
if (new URLSearchParams(location.search).has('kit')) {
  document.getElementById('splash')?.remove()
  document.getElementById('field')?.remove()
  void import('./ui/system/kit.ts').then(m => m.mountKit(document.getElementById('ui') as HTMLElement))
} else start()

function start(): void {
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
}
