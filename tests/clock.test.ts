import { describe, expect, it } from 'vitest'
import { App, DAYS_PER_SECOND, DAY_SECONDS, PLANT_PAUSE, SELF_PAUSES, SPEED_X, setDays, type AppEvent, type Speed } from '../src/game/app.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

// The clock as a strategy game has it: pause and three speeds in step, the speed the player set is the speed the game
// runs at, and only a card that needs an answer stops it.
// (the clock the tests below were written to: four seconds a day at the first speed; the long day has its own tests)
setDays('brisk')
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
// would, with its default, and the clock goes on; answer: false leaves it for the test. The word to plant, which
// pauses the game every year (round eight), is given where the crew asks, and the player resumes.
function play(app: App, seconds: number, stop: () => boolean = () => false, answer = true): void {
  const c = app.campaign!
  for (let ms = 0; ms < seconds * 1000 && !stop(); ms += 50) {
    if (app.speed === 0 && app.pauseCause === 'plantAsk') {
      const at = app.resumeSpeed
      app.order('plant', { fields: [app.needs().findIndex(n => n.need?.act === 'plant')] })
      app.setSpeed(at)
    }
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

  it('has pause and three speeds: a day of three to four minutes at the first, a season in under two minutes at the fastest', () => {
    // (the owner, 14 November: "days should last like 3-4 minutes at 1x you should be able to watch everyone on your
    // farm working")
    setDays('long')
    try {
      expect(DAYS_PER_SECOND.length).toBe(4)
      expect(DAYS_PER_SECOND[0]).toBe(0)
      expect(DAY_SECONDS).toBeGreaterThanOrEqual(180)
      expect(DAY_SECONDS).toBeLessThanOrEqual(240)
      expect(1 / DAYS_PER_SECOND[1]).toBeCloseTo(DAY_SECONDS)
      expect(DAYS_PER_SECOND[2]).toBeGreaterThan(DAYS_PER_SECOND[1])
      expect(DAYS_PER_SECOND[3]).toBeGreaterThan(DAYS_PER_SECOND[2])
      // Each speed is named for what it is against the first, in round figures no more than a tenth out.
      expect(SPEED_X.slice(1)).toEqual(['1×', '50×', '400×'])
      for (const k of [1, 2, 3]) {
        const x = DAYS_PER_SECOND[k] / DAYS_PER_SECOND[1]
        expect(Math.abs(Number(SPEED_X[k].slice(0, -1)) - x) / x).toBeLessThan(0.1)
      }
      const season = 204
      expect(season / DAYS_PER_SECOND[3]).toBeGreaterThan(60)
      expect(season / DAYS_PER_SECOND[3]).toBeLessThan(150)
      const app = new App(loadWorld())
      app.newGame(undefined, 11)
      app.do({ t: 'begin' })
      app.setSpeed(1)
      expect(app.daySeconds()).toBeCloseTo(DAY_SECONDS)
      app.setSpeed(0)
      expect(app.daySeconds(), 'paused: the speed it goes on at').toBeCloseTo(DAY_SECONDS)
    } finally { setDays('brisk') }
    expect(SPEED_X.slice(1)).toEqual(['1×', '3×', '8×'])
  })

  it('keeps its place in the day through a pause, and begins each day with the morning\'s orders', () => {
    const app = farm()
    const c = c0(app)
    app.setSpeed(1)
    for (let k = 0; k < 30; k++) app.tick(50)
    const day = c.season!.day
    expect(c.season!.clock, 'the day has begun').toBeDefined()
    expect(app.dayProgress).toBeGreaterThan(0.3)
    const at = app.dayProgress
    app.togglePause()
    expect(app.dayProgress).toBe(at)
    for (let k = 0; k < 20; k++) app.tick(50)
    expect(app.dayProgress).toBe(at)
    app.togglePause()
    app.tick(50)
    expect(app.dayProgress).toBeGreaterThan(at)
    expect(c.season!.day).toBe(day)
  })

  it('an order given part way through a day is worked in what is left of it, and what the land shows is that day', () => {
    const app = farm()
    const c = c0(app)
    app.setSpeed(1)
    // To the middle of a working day in the growing season with nothing on the list.
    const quiet = () => c.season!.jobs.length === 0 && S.workday(c, c.season!) && c.season!.fields.some(f => f.status === 'growing') && c.season!.fields.some(f => f.status === 'rest')
    play(app, 4000, () => !!c.season!.clock && app.dayProgress >= 0.5 && app.dayProgress < 0.7 && c.season!.clock.at === 0 && quiet())
    const s = c.season!
    const day = s.day
    const field = s.fields.findIndex(f => f.status === 'rest')
    expect(quiet(), 'a quiet day was found').toBe(true)
    expect(s.clock!.at).toBe(0)
    const events: AppEvent[] = []
    app.on(e => events.push(e))
    expect(app.do({ t: 'job', kind: 'rocks', field }).ok).toBe(true)
    // The farm was brought up to the moment of the order.
    expect(s.clock!.at).toBeCloseTo(app.dayProgress, 2)
    // What the land is to show: today, with the order worked this afternoon.
    const ahead = app.today()!
    expect(ahead).not.toBe(c)
    expect(ahead.season!.day).toBe(day)
    expect(ahead.season!.worked.some(w => w.kind === 'rocks' && w.field === field)).toBe(true)
    expect(s.worked.some(w => w.kind === 'rocks')).toBe(false)
    expect(app.today()).toBe(ahead)
    while (s.day === day) app.tick(50)
    expect(s.worked.some(w => w.kind === 'rocks' && w.field === field)).toBe(true)
    const job = s.jobs.find(j => j.kind === 'rocks' && j.field === field)
    expect(job?.done ?? 9).toBeLessThan(0.5 * 1.6)
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
    // The only stops were for incident cards and the word to plant, and each time the clock went back to 3x.
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

describe('a notice that asks nothing', () => {
  // A harvest with frost forecast on the barrels (the record's 1985, seed 8), run at the fastest speed: every reason
  // the clock gave for stopping itself, and whether the frost warning came.
  function harvest(pauseOnAlerts: boolean): { reasons: string[]; warned: number } {
    const app = new App(loadWorld())
    app.settings.pauseOnAlerts = pauseOnAlerts
    app.newGame(1985, 8)
    app.do({ t: 'begin' })
    app.do({ t: 'sprayWay', way: 'auto' })
    const c = app.campaign!
    const reasons: string[] = []
    app.on(e => { if (e.type === 'speed' && e.speed === 0 && app.pauseReason) reasons.push(app.pauseReason) })
    app.setSpeed(3)
    for (let ms = 0; ms < 400_000 && !S.seasonDone(c); ms += 50) {
      if (app.speed === 0) {
        for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
        for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) app.do({ t: 'sell', lot: lot.id, frac: 1 })
        app.setSpeed(3)
      }
      app.tick(50)
    }
    return { reasons, warned: c.season!.log.filter(e => e.type === 'frostBarrels').length }
  }

  it('frost forecast on the barrels is news, not a pause: the crew hauls ahead of it without being told', () => {
    const { reasons, warned } = harvest(false)
    expect(warned).toBeGreaterThan(0)
    expect(reasons.filter(r => /frost/i.test(r))).toEqual([])
    // What does stop it: a weigh ticket, a telegram, the season's end.
    expect(reasons.length).toBeGreaterThan(0)
  })

  it('and pauses the game for a player who asked to be paused on alerts', () => {
    const { reasons, warned } = harvest(true)
    expect(warned).toBeGreaterThan(0)
    expect(reasons.some(r => /^Frost is forecast/.test(r))).toBe(true)
  })
})

// Round eight: a decision that waits for the player pauses the game, and nothing else does.
describe('a decision that waits for the player pauses the game', () => {
  const potato = (c: S.Campaign) => [...Array(S.FIELD_COUNT).keys()].filter(i => c.plans[i]?.crop === 'potato' && c.fields[i].tenure !== 'none')
  // The clock run a frame at a time, telegrams answered and weighed crops sold, until the test says or the game
  // pauses for something else.
  function run(app: App, seconds: number, stop: () => boolean): void {
    const c = c0(app)
    for (let ms = 0; ms < seconds * 1000 && !stop() && c.phase === 'season'; ms += 50) {
      if (app.speed === 0 && (app.pauseCause === 'incident' || app.pauseCause === 'weighed' || app.pauseCause === 'alerts')) {
        const at = app.resumeSpeed
        for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
        for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) app.do({ t: 'sell', lot: lot.id, frac: 1 })
        app.setSpeed(at)
      }
      app.tick(50)
    }
  }
  // A first year played without the clock, the word given and the questions answered, then the second spring begun.
  function secondYear(app: App): void {
    const c = c0(app)
    app.do({ t: 'sprayWay', way: 'auto' })
    for (let n = 0; n < 400 && c.phase === 'season'; n++) {
      if (S.seasonDone(c)) { app.do({ t: 'endSeason' }); break }
      const at = S.fieldNeeds(app.world, c).findIndex(x => x.need?.act === 'plant')
      if (at >= 0 && !S.plantWordGiven(c.season!)) app.do({ t: 'job', kind: 'plant', field: at })
      for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
      for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) app.do({ t: 'sell', lot: lot.id, frac: 1 })
      app.do({ t: 'day' })
    }
    for (let m = 0; m < 14 && c.phase === 'cellar'; m++) app.do({ t: 'month' })
    if (c.phase === 'ledger') app.do({ t: 'next' })
    expect(c.phase).toBe('plan')
    expect(c.history.length).toBe(1)
    expect(app.do({ t: 'begin' }).ok).toBe(true)
  }
  const waitsForWord = (app: App) => app.speed === 0 && app.pauseCause === 'plantAsk'

  it('pauses the day the crew asks for the word, in years one and two, at 1x, 3x and 8x and whatever "Pause on alerts" says, with nothing planted', () => {
    for (const year of [1, 2]) for (const speed of [1, 2, 3] as Speed[]) for (const alerts of year === 1 && speed === 3 ? [false, true] : [false]) {
      const what = `year ${year} at ${SPEED_X[speed]}${alerts ? ', pause on alerts' : ''}`
      const app = farm()
      app.settings.pauseOnAlerts = alerts
      if (year === 2) secondYear(app)
      const c = c0(app)
      const stops: string[] = []
      app.on((e: AppEvent) => { if (e.type === 'speed' && e.speed === 0 && app.pauseCause === 'plantAsk') stops.push(app.pauseReason) })
      // "Skip ahead" and every "Fast-forward to ..." key only set the speed.
      app.setSpeed(speed)
      run(app, 600, () => waitsForWord(app))
      expect(waitsForWord(app), what).toBe(true)
      expect(app.pauseReason, what).toBe(PLANT_PAUSE)
      expect(PLANT_PAUSE).toBe('the soil is ready. Press a ringed Plant stamp, or resume and your crew starts in 3 days.')
      const s = c.season!
      expect(s.plantAsk, `${what}: paused on the day the crew asks`).toBe(s.day)
      expect(s.jobs.filter(j => j.kind === 'plant'), what).toEqual([])
      expect(potato(c).filter(i => s.fields[i].plantDay >= 0), what).toEqual([])
      expect(S.plantWordGiven(s), what).toBe(false)
      // The stamps are up: every fit potato field carries the need.
      expect(app.needs().filter(n => n.need?.act === 'plant').length, what).toBeGreaterThan(0)
      expect(app.resumeSpeed, what).toBe(speed)
      // Resumed without a press, the crew starts three days later (the first working morning the soil is still fit
      // from then), and the game does not pause for it again.
      app.togglePause()
      expect(app.speed, what).toBe(speed)
      let early = false
      run(app, 200, () => { if (s.day - s.plantAsk! < S.PLANT_WORD_DAYS && S.plantWordGiven(s)) early = true; return s.plantWord !== undefined })
      expect(early, `${what}: nothing planted in the three days`).toBe(false)
      expect(s.plantWordBy, what).toBe('crew')
      expect(s.plantWord! - s.plantAsk!, what).toBeGreaterThanOrEqual(S.PLANT_WORD_DAYS)
      expect(s.plantWord! - s.plantAsk!, what).toBeLessThanOrEqual(S.PLANT_WORD_DAYS + 4)
      expect(stops, what).toEqual([PLANT_PAUSE])
    }
  })

  it('a press on a Plant stamp answers the pause without changing the speed: the game stays paused until the player resumes', () => {
    const app = farm()
    const c = c0(app)
    app.setSpeed(3)
    run(app, 600, () => waitsForWord(app))
    const speeds: number[] = []
    app.on((e: AppEvent) => { if (e.type === 'speed') speeds.push(e.speed) })
    const r = app.smartOrder(app.needs().findIndex(n => n.need?.act === 'plant'))
    expect(r.ok).toBe(true)
    expect(c.season!.plantWordBy).toBe('you')
    expect(app.speed).toBe(0)
    expect(speeds.every(x => x === 0)).toBe(true)
    // The pause is the player's own now, said by nothing, and Space resumes at the speed the game had.
    expect(app.pauseReason).toBe('')
    expect(app.pauseCause).toBe('')
    app.togglePause()
    expect(app.speed).toBe(3)
  })

  it('lists every cause that can pause the game by itself, and a whole year at 8x pauses for those alone', () => {
    expect(Object.keys(SELF_PAUSES).sort()).toEqual(['alerts', 'incident', 'killCall', 'over', 'plantAsk', 'spray', 'weighed'])
    for (const why of Object.values(SELF_PAUSES)) expect(why.length).toBeGreaterThan(20)
    const app = farm()
    const c = c0(app)
    app.do({ t: 'sprayWay', way: 'auto' })
    const causes: string[] = []
    app.on((e: AppEvent) => { if (e.type === 'speed' && e.speed === 0 && app.pauseReason) causes.push(app.pauseCause) })
    app.setSpeed(3)
    for (let ms = 0; ms < 400_000 && !S.seasonDone(c); ms += 50) {
      if (app.speed === 0) {
        for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
        for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) app.do({ t: 'sell', lot: lot.id, frac: 1 })
        app.setSpeed(3)
      }
      app.tick(50)
    }
    expect(S.seasonDone(c)).toBe(true)
    // With "Pause on alerts" off and the routine as it comes: the word to plant once, each weigh ticket, each
    // telegram, the season's end. (The spraying question is the season screen's: it was answered above.)
    expect(causes.filter(x => x === 'plantAsk').length).toBe(1)
    expect([...new Set(causes)].filter(x => !['plantAsk', 'weighed', 'incident', 'over'].includes(x))).toEqual([])
    // The vine kill the crew does on its own date asked nothing of the player, so it paused nothing.
    expect(c.season!.log.filter(e => e.type === 'killCall')).toEqual([])
    expect(c.season!.fields.some(f => f.killDay >= 0)).toBe(true)
  })

  // A farm brought to the day reference practice first asks for a field's vines, the word given and the clock at 3x.
  function toKill(prepare: (app: App) => void): { app: App; c: S.Campaign } {
    const app = farm()
    const c = c0(app)
    app.do({ t: 'sprayWay', way: 'auto' })
    prepare(app)
    app.setSpeed(3)
    for (let ms = 0; ms < 400_000 && !S.seasonDone(c) && !(app.speed === 0 && app.pauseCause === 'killCall'); ms += 50) {
      if (app.speed === 0) {
        const at = app.needs().findIndex(n => n.need?.act === 'plant')
        if (app.pauseCause === 'plantAsk' && at >= 0) app.order('plant', { fields: [at] })
        for (const inc of [...c.incidents]) app.do({ t: 'answer', incident: inc.id, choice: S.defaultChoice(inc) })
        for (const lot of S.openLots(c)) if (c.season!.fields[lot.field]?.weighed) app.do({ t: 'sell', lot: lot.id, frac: 1 })
        app.setSpeed(3)
      }
      // The player keeps a field's vines up the day the crew would otherwise set a date for them.
      if (keep >= 0 && c.season!.fields[keep].killAsked !== undefined && !c.season!.fields[keep].keepVines && c.season!.fields[keep].status === 'growing' && c.season!.fields[keep].deadDay < 0 && !kept) { kept = app.do({ t: 'keepVines', field: keep, keep: true }).ok }
      app.tick(50)
    }
    return { app, c }
  }
  let keep = -1
  let kept = false

  it('pauses for a vine kill only when it is the player\'s to give: where the crew does not kill by itself, the day it comes due', () => {
    keep = -1
    // The kill and the dig both left to the player's own orders: the crew sets no date of its own.
    const { app, c } = toKill(a => { a.do({ t: 'routine', kind: 'dig', auto: false }) })
    expect(app.pauseCause).toBe('killCall')
    const s = c.season!
    const called = s.fields.map((f, i) => (f.killCall === s.day ? i : -1)).filter(i => i >= 0)
    expect(called.length).toBeGreaterThan(0)
    for (const i of called) expect(S.advise(app.world, c).some(a => a.act === 'kill' && a.field === i), S.FIELD_NAMES[i]).toBe(true)
    expect(app.pauseReason).toMatch(/^the vines in .+ are due to be killed, and that's your decision\. Press a ringed Kill vines stamp, or resume and they stay up\.$/)
    expect(app.pauseReason).toContain(S.FIELD_NAMES[called[0]])
    // Ordered, the pause is answered and the game stays paused. Each field is called once.
    app.order('kill', { fields: called })
    expect(app.pauseCause).toBe('')
    expect(app.speed).toBe(0)
    expect(s.log.filter(e => e.type === 'killCall' && e.data && (e.data.fields as number[]).includes(called[0])).length).toBe(1)
  })

  it('and where the player keeps the vines up, two days before the last day a kill still sets the skins', () => {
    keep = potato(c0(farm()))[0]
    kept = false
    const { app, c } = toKill(() => {})
    expect(kept).toBe(true)
    expect(app.pauseCause).toBe('killCall')
    const s = c.season!
    const latest = S.dayIndex(s.year, S.DIG_GREEN.month, S.DIG_GREEN.dom) - S.SKIN_DAYS
    expect(s.day).toBe(latest - S.KILL_CALL_DAYS)
    expect(s.fields[keep].killCall).toBe(s.day)
    expect(app.pauseReason).toBe(`you're keeping the vines up in ${S.FIELD_NAMES[keep]}. Press a ringed Kill vines stamp, or resume and they stay up.`)
    expect(s.log.find(e => e.type === 'killCall')!.text).toBe(`You're keeping the vines up in ${S.FIELD_NAMES[keep]}. Kill them by ${S.formatDay(s.year, latest)} so the skins toughen before the harvest, or the field gets dug green.`)
    // The other fields, which the crew killed on its own date, were never called.
    expect(s.fields.filter(f => f.killCall !== undefined).length).toBe(1)
    keep = -1
  })
})
