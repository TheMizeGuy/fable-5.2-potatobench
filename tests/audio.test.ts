import { describe, expect, it } from 'vitest'
import { CUES, cuesFor } from '../src/audio/director.ts'
import { workFor } from '../src/audio/index.ts'
import { sceneFor, type SceneInput, type Sky } from '../src/audio/scene.ts'
import { FAR, NEAR } from '../src/audio/work.ts'
import type { App } from '../src/game/app.ts'
import * as S from '../src/sim/index.ts'
import { loadWorld } from '../tools/balance/world.ts'

const ev = (type: string, level: S.GameEvent['level'] = 'info', field = -1, data?: S.GameEvent['data']): S.GameEvent => ({ day: 0, type, field, text: '', level, data })
const ids = (events: S.GameEvent[]) => cuesFor(events).map(p => p.id)

describe('which cue answers which event', () => {
  it('names every cue once', () => {
    expect(new Set(CUES.map(c => c.id)).size).toBe(CUES.length)
    for (const c of CUES) expect(c.on.length > 0 && c.what.length > 0 && c.gap > 0).toBe(true)
  })

  it('has a sound for every event of the farmstead', () => {
    const known = new Set(CUES.map(c => c.id))
    const events: [string, S.GameEvent['level']][] = [
      ['skillUp', 'good'], ['wornOut', 'warn'], ['unhappy', 'warn'], ['quit', 'bad'], ['raise', 'info'], ['foreman', 'info'],
      ['felled', 'good'], ['rocks', 'info'], ['brushed', 'info'], ['stumping', 'info'], ['stumped', 'good'], ['tiling', 'info'],
      ['tiled', 'good'], ['logsSold', 'good'], ['mortgage', 'info'], ['mortgagePaid', 'good'], ['building', 'info'], ['built', 'good'],
      ['weighed', 'good'], ['frozenInField', 'bad'], ['pondDry', 'warn'], ['incident', 'warn'], ['incidentDone', 'info'],
      ['poached', 'bad'], ['hurt', 'bad'], ['breakdown', 'warn'], ['repaired', 'good'], ['hired', 'info'],
    ]
    const heard = new Set<string>()
    for (const [type, level] of events) {
      const got = ids([ev(type, level)])
      expect(got.length, type).toBe(1)
      expect(known.has(got[0]), type).toBe(true)
      heard.add(got[0])
    }
    // The two that must not be missed have a sound to themselves.
    expect(ids([ev('incident', 'warn')])).toEqual(['door'])
    expect(heard.size).toBeGreaterThan(18)
  })

  it('keeps the people who leave, and the hurt, off the crop warning', () => {
    expect(ids([ev('quit', 'bad')])).toEqual(['left'])
    expect(ids([ev('poached', 'bad')])).toEqual(['left'])
    expect(ids([ev('hurt', 'bad')])).toEqual(['hurt'])
  })

  it('tells a tractor broken down from rot through a pile', () => {
    expect(ids([ev('breakdown', 'warn')])).toEqual(['brokeDown'])
    expect(ids([ev('breakdown', 'bad', 3)])).toEqual(['warnLost'])
    expect(ids([ev('incident', 'warn', -1, { kind: 'breakdown' })])).toEqual(['door', 'brokeDown'])
  })

  it('strikes only the gravest warning of a day, and nothing over the bank calling the note', () => {
    expect(ids([ev('frost', 'bad', 1)])).toEqual(['warnFrost'])
    expect(ids([ev('frozenInField', 'bad', 1)])).toEqual(['warnLost'])
    expect(ids([ev('frost', 'bad', 1), ev('blightSeen', 'bad', 2)])).toEqual(['warnSeen'])
    expect(ids([ev('frost', 'bad'), ev('watch', 'warn'), ev('lost', 'bad', 2)])).toEqual(['warnLost'])
    expect(ids([ev('dry', 'warn', 1), ev('watch', 'warn')])).toEqual(['warnWatch'])
    expect(ids([ev('contractShort', 'bad')])).toEqual(['warnSeen'])
    expect(ids([ev('lost', 'bad', -1), ev('frost', 'warn'), ev('sold', 'good')])).toEqual(['lost'])
  })

  it('sounds the short answers first and the most pressing of the long ones at their head', () => {
    const got = ids([ev('felled', 'good', 14), ev('rocks'), ev('weighed', 'good', 0), ev('incident', 'warn'), ev('skillUp', 'good')])
    expect(got).toEqual(['rocks', 'ticket', 'door', 'felled', 'better'])
    expect(ids([ev('sample', 'info', 0, { weights: [1, 2, 3] }), ev('dug', 'good', 0)])).toEqual(['dug'])
    expect(cuesFor([ev('sample', 'info', 0, { weights: [1, 2, 3] })])).toEqual([{ id: 'sample', arg: 3 }])
  })
})

describe('the seasons in the bed', () => {
  const season = (month: number, dom: number, sky: Sky, tmean: number, wind: number): SceneInput =>
    ({ place: 'season', month, dom, weather: { wind, prcp: 0, sky, tmean } })
  const spring = sceneFor(season(4, 20, 'clear', 12, 3))
  const summer = sceneFor(season(7, 5, 'clear', 20, 2.5))
  const harvest = sceneFor(season(9, 5, 'cloud', 9, 5))
  const winter = sceneFor({ place: 'cellar', month: 0, weather: null })

  it('gives each of the four voices the other three do not have', () => {
    expect(spring.peepers).toBeGreaterThan(0.2)
    expect(spring.birds).toBeGreaterThanOrEqual(3)
    expect(spring.brook).toBeGreaterThan(0.5)
    expect([spring.crickets, spring.bees, spring.geese, spring.crows, spring.frost, spring.dry]).toEqual([0, 0, 0, 0, 0, 0])

    expect(summer.crickets).toBeGreaterThan(0.5)
    expect(summer.bees).toBeGreaterThan(0.5)
    expect([summer.peepers, summer.birds, summer.geese, summer.crows, summer.frost, summer.dry]).toEqual([0, 0, 0, 0, 0, 0])

    expect(harvest.geese).toBeGreaterThan(0.5)
    expect(harvest.crows).toBeGreaterThan(0.5)
    expect(harvest.dry).toBeGreaterThan(0.5)
    expect([harvest.peepers, harvest.crickets, harvest.bees, harvest.frost]).toEqual([0, 0, 0, 0])

    expect(winter.frost).toBe(1)
    expect(winter.cold).toBeGreaterThan(0.5)
    expect([winter.peepers, winter.crickets, winter.bees, winter.geese, winter.rain]).toEqual([0, 0, 0, 0, 0])
    expect(winter.brook).toBeLessThan(0.05)
  })

  it('moves from one to the next without a jump at the turn of a month', () => {
    for (let m = 3; m < 10; m++) {
      const a = sceneFor(season(m, 30, 'cloud', 14, 3)), b = sceneFor(season(m + 1, 1, 'cloud', 14, 3))
      for (const k of ['leaf', 'dry', 'brook', 'peepers', 'bees', 'geese', 'crows'] as const) expect(Math.abs(a[k] - b[k]), `${k} at the end of month ${m}`).toBeLessThan(0.25)
    }
  })

  it('quiets the fair-weather voices in a storm', () => {
    const storm = sceneFor({ place: 'season', month: 9, dom: 5, weather: { wind: 12, prcp: 40, sky: 'storm', tmean: 8 } })
    expect([storm.geese, storm.crows, storm.birds, storm.bees]).toEqual([0, 0, 0, 0])
    expect(storm.dry).toBeLessThan(0.3)
  })
})

describe('work you can hear', () => {
  const record = loadWorld()
  const world = S.climateWorld(record, 7)
  const farm = () => {
    const c = S.createCampaign(world, { seed: 7, startYear: S.FARM_YEAR0 + 1 })
    S.apply(world, c, { t: 'begin' })
    return c
  }
  const app = (c: S.Campaign, over: Partial<App> = {}) => ({ campaign: c, screen: 'season', speed: 1, unit: -1, selection: [], yard: 0, ...over }) as unknown as App
  const tract = S.TRACTS[0]

  it('is far off until the person or the place is picked, and stops with the clock', () => {
    const c = farm()
    c.season!.worked = [{ kind: 'fell', field: tract, unit: 0 }]
    expect(workFor(app(c)).work.fell).toBe(FAR)
    expect(workFor(app(c, { unit: 0 })).work.fell).toBe(NEAR)
    expect(workFor(app(c, { selection: [tract] })).work.fell).toBe(NEAR)
    expect(workFor(app(c, { selection: [0] })).work.fell).toBe(FAR)
    expect(workFor(app(c, { speed: 0 })).work.fell).toBe(0)
    // Felling is done on foot: no tractor for it.
    expect(workFor(app(c)).tractor).toEqual([0, 0])
  })

  it('takes brush for burning, a yard for building, and the potato house for barrels', () => {
    const c = farm()
    const brush = c.fields.findIndex(f => f.cover === 'brush')
    c.season!.worked = [{ kind: 'fell', field: brush, unit: 0 }, { kind: 'build', field: S.HOME_YARD, unit: 0 }, { kind: 'haul', field: 2, unit: 0 }]
    const far = workFor(app(c))
    expect([far.work.brush, far.work.fell, far.work.build, far.work.barrels]).toEqual([FAR, 0, FAR, FAR])
    expect(far.truck).toBe(0)
    expect(far.tractor).toEqual([1, 1])
    const yard = workFor(app(c, { yard: S.HOME_YARD }))
    expect([yard.work.build, yard.work.barrels, yard.work.brush]).toEqual([NEAR, NEAR, FAR])
    c.upgrades.truck = true
    const truck = workFor(app(c))
    expect(truck.truck).toBeGreaterThan(0)
    expect(truck.tractor).toEqual([0, 0])
  })

  it('keeps the tractor as it was: working from the seat, idling for work on foot', () => {
    const c = farm()
    c.season!.worked = [{ kind: 'scout', field: 1, unit: 0 }]
    expect(workFor(app(c)).tractor).toEqual([0.4, 0])
    c.season!.worked.push({ kind: 'plant', field: 0, unit: 0 })
    expect(workFor(app(c)).tractor).toEqual([1, 1])
    c.season!.worked = []
    expect(workFor(app(c)).tractor).toEqual([0, 0])
  })

  it('goes on far off through the winter for those kept on', () => {
    const c = farm()
    c.crew[0].winter = 'woods'
    c.crew[0].winterField = tract
    expect(workFor(app(c, { screen: 'cellar', speed: 0 })).work.fell).toBe(FAR)
    expect(workFor(app(c, { screen: 'cellar', speed: 0, unit: 0 })).work.fell).toBe(NEAR)
  })
})
