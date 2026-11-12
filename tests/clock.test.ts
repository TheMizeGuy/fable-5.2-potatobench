import { describe, expect, it } from 'vitest'
import { App, DAYS_PER_SECOND, type AppEvent } from '../src/game/app.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

// The clock as a strategy game has it: pause and three speeds in step, the speed the player set is the speed the game
// runs at, and only a card that needs an answer stops it.
function c0(app: App): S.Campaign { return app.campaign! }

function farm(): App {
  const app = new App(loadWorld())
  app.newGame(undefined, 11)
  app.do({ t: 'begin' })
  return app
}

// Runs the clock for this many seconds of play, a frame at a time. An incident card is answered as a player in a hurry
// would, with its default, and the clock goes on; answer: false leaves it for the test.
function play(app: App, seconds: number, stop: () => boolean = () => false, answer = true): void {
  const c = app.campaign!
  for (let ms = 0; ms < seconds * 1000 && !stop(); ms += 50) {
    if (answer && app.speed === 0 && c.incidents.length) {
      for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
      app.resumeAfterCard()
    }
    app.tick(50)
  }
}

describe('the clock', () => {
  it('has pause and three speeds in step, the fastest still a season in about a minute and a half', () => {
    expect(DAYS_PER_SECOND.length).toBe(4)
    expect(DAYS_PER_SECOND[0]).toBe(0)
    expect(DAYS_PER_SECOND[2] / DAYS_PER_SECOND[1]).toBeCloseTo(2)
    expect(DAYS_PER_SECOND[3] / DAYS_PER_SECOND[1]).toBeCloseTo(3)
    // At 1x a day lasts long enough to watch the work and give an order.
    expect(1 / DAYS_PER_SECOND[1]).toBeGreaterThan(1.2)
    const season = 204
    expect(season / DAYS_PER_SECOND[3]).toBeGreaterThan(60)
    expect(season / DAYS_PER_SECOND[3]).toBeLessThan(150)
  })

  it('runs at the speed set while needs come and go: nothing slows it', () => {
    const app = farm()
    app.setSpeed(3)
    const speeds: number[] = []
    app.on((e: AppEvent) => { if (e.type === 'speed') speeds.push(e.speed) })
    const c = app.campaign!
    // Through planting and the first weeks of growth, when new needs appear day after day.
    play(app, 60, () => c.season!.fields.some(f => f.hillPasses > 0) || c.season!.fields.some(f => f.weighed))
    expect(c.season!.day).toBeGreaterThan(S.dayIndex(c.year, 3, 30))
    // The only stops were for incident cards, and each time the clock went back to 3x.
    expect(speeds.filter(s => s !== 0 && s !== 3)).toEqual([])
    expect(app.speed).toBe(3)
  })

  it('a new need is said as an alert that names the field, without changing the speed', () => {
    const app = farm()
    app.setSpeed(2)
    const c = app.campaign!
    play(app, 60, () => app.alerts.some(a => a.type === 'need'))
    const need = app.alerts.find(a => a.type === 'need')
    expect(need).toBeDefined()
    expect(need!.field).toBeGreaterThanOrEqual(0)
    // Still at 2x, unless an incident card arrived the same day.
    expect(app.speed === 2 || c.incidents.length > 0).toBe(true)
  })

  it('stops for a card that needs an answer, and goes on at the speed it had once it is answered', () => {
    const app = farm()
    const c = app.campaign!
    // Bring the crop to the dig the coach's way, then let the clock run the haul in at 2x.
    for (let n = 0; n < 400 && !c.season!.fields.some(f => f.status === 'digging' || f.status === 'dug'); n++) {
      for (const a of S.advise(app.world, c)) if (a.act !== 'wait' && a.act !== 'close' && a.act !== 'sell') app.do({ t: 'job', kind: a.act, field: a.field })
      app.do({ t: 'day' })
    }
    app.setSpeed(2)
    play(app, 120, () => app.speed === 0, false)
    expect(app.speed).toBe(0)
    expect(app.pauseReason).not.toBe('')
    // A weigh ticket, a card, or barrels in the field ahead of a frost.
    expect(c.season!.fields.some(f => f.weighed) || c.incidents.length > 0 || app.alerts.some(a => a.type === 'frostBarrels')).toBe(true)
    app.resumeAfterCard()
    expect(app.speed).toBe(2)
  })

  it('a clock the player stopped stays stopped when a card is answered; Space goes on at the speed it had', () => {
    const app = farm()
    app.setSpeed(3)
    app.togglePause()
    expect(app.speed).toBe(0)
    app.resumeAfterCard()
    expect(app.speed).toBe(0)
    app.togglePause()
    expect(app.speed).toBe(3)
    app.cycleSpeed()
    expect(app.speed).toBe(1)
    app.cycleSpeed()
    expect(app.speed).toBe(2)
  })

  it('pause on alerts, for players who want the old stopping, stops the clock for something new', () => {
    const app = farm()
    app.settings.pauseOnAlerts = true
    app.setSpeed(2)
    c0(app).incidents = []
    play(app, 60, () => app.speed === 0, false)
    expect(app.speed).toBe(0)
    expect(app.pauseReason).not.toBe('')
  })

  it('answering the last question, from anywhere, lets the days go on at the speed they had', () => {
    const app = farm()
    const c = c0(app)
    app.setSpeed(3)
    play(app, 120, () => app.speed === 0 && c.incidents.length > 0, false)
    expect(c.incidents.length).toBeGreaterThan(0)
    expect(app.speed).toBe(0)
    for (const inc of [...c.incidents]) expect(app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) }).ok).toBe(true)
    expect(app.speed).toBe(3)
  })
})
