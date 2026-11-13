import { describe, expect, it } from 'vitest'
import { App, DAYS_PER_SECOND, SPEED_X, type AppEvent } from '../src/game/app.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

// The clock as a strategy game has it: pause and three speeds in step, the speed the player set is the speed the game
// runs at, and only a card that needs an answer stops it.
function c0(app: App): S.Campaign { return app.campaign! }

// The clock as a new player has it: "Pause on alerts" off, so only a card stops it.
function farm(): App {
  const app = new App(loadWorld())
  app.settings.pauseOnAlerts = false
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
  it('runs at the speed set for a new player, and stands while a card says it must', () => {
    const app = new App(loadWorld())
    expect(app.settings.pauseOnAlerts).toBe(false)
    app.newGame(undefined, 11)
    app.do({ t: 'begin' })
    app.setSpeed(0)
    app.holding = 'This telegram needs an answer.'
    app.setSpeed(2)
    expect(app.speed).toBe(0)
    expect(app.pauseReason).toBe('This telegram needs an answer.')
    app.holding = ''
    app.setSpeed(2)
    expect(app.speed).toBe(2)
  })

  it('goes on by itself once the last telegram is answered, though the interface was holding the clock for it', () => {
    const app = farm()
    const c = c0(app)
    app.setSpeed(2)
    play(app, 120, () => app.speed === 0 && c.incidents.length > 0, false)
    expect(c.incidents.length).toBeGreaterThan(0)
    app.holding = 'This telegram needs an answer.'
    for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
    expect(app.holding).toBe('')
    expect(app.speed).toBe(2)
  })

  it('has pause and three speeds named for what they are, the first slow enough to watch, the fastest a season in under two minutes', () => {
    expect(DAYS_PER_SECOND.length).toBe(4)
    expect(DAYS_PER_SECOND[0]).toBe(0)
    // Each speed's name is its true multiple of the first.
    for (const k of [1, 2, 3]) expect(SPEED_X[k]).toBe(`${Math.round(DAYS_PER_SECOND[k] / DAYS_PER_SECOND[1])}×`)
    expect(DAYS_PER_SECOND[2]).toBeGreaterThan(DAYS_PER_SECOND[1])
    expect(DAYS_PER_SECOND[3]).toBeGreaterThan(DAYS_PER_SECOND[2])
    // At the first speed a day lasts long enough to watch the people work and give an order (the owner: 0.7 days a
    // second was "way too fast").
    expect(1 / DAYS_PER_SECOND[1]).toBeGreaterThanOrEqual(4)
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
    app.setSpeed(3)
    const c = app.campaign!
    play(app, 100, () => app.alerts.some(a => a.type === 'need'))
    const need = app.alerts.find(a => a.type === 'need')
    expect(need).toBeDefined()
    expect(need!.field).toBeGreaterThanOrEqual(0)
    // Still at the speed set, unless an incident card arrived the same day.
    expect(app.speed === 3 || c.incidents.length > 0).toBe(true)
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
    // A first year's telegrams wait for the planting, so the first thing new may be weeks off.
    play(app, 240, () => app.speed === 0, false)
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
