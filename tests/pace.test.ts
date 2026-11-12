// How often the picture is drawn and how large (src/render/pace.ts): a fast display is not drawn on every beat, a
// land where nothing moves comes to rest, and the picture's size settles instead of swinging.
import { describe, expect, it } from 'vitest'
import { HELD_MS, HOLD_AFTER_S, Pace, SIZES, Sizer, UNWATCHED_S, startOn } from '../src/render/pace.ts'

// Frames drawn over `seconds` of a display beating every `beat` ms.
function run(p: Pace, beat: number, seconds: number, busy: boolean, alone = false): number {
  let drawn = 0
  for (let t = 0; t < seconds * 1000; t += beat) if (p.tick(beat, busy, alone) > 0) drawn++
  return drawn
}

describe('the pace of drawing', () => {
  it('draws every beat of a sixty-a-second display, and a sixtieth of a second at a time', () => {
    const p = new Pace()
    expect(run(p, 1000 / 60, 2, true)).toBeGreaterThanOrEqual(119)
    expect(p.tick(1000 / 60, true)).toBeCloseTo(1000 / 60, 3)
  })

  it('draws a faster display at about sixty a second, on an even beat', () => {
    for (const [hz, every] of [[75, 1], [90, 1], [120, 2], [144, 2], [165, 3], [240, 4]]) {
      const p = new Pace()
      run(p, 1000 / hz, 1, true)
      expect(p.every, `${hz} a second`).toBe(every)
      const drawn = run(p, 1000 / hz, 2, true) / 2
      expect(drawn, `${hz} a second`).toBeGreaterThan(54)
      expect(drawn, `${hz} a second`).toBeLessThanOrEqual(91)
    }
  })

  it('takes the display for its shortest beat, not for a late frame', () => {
    const p = new Pace()
    // a display of 120 a second on which every third frame comes a beat late
    for (let k = 0; k < 120; k++) p.tick(k % 3 === 0 ? 16.7 : 8.33, true)
    expect(p.every).toBe(2)
  })

  it('does not take a busy machine, late with one frame and early with the next, for a fast display', () => {
    const p = new Pace()
    let drawn = 0
    for (let k = 0; k < 240; k++) if (p.tick(k % 2 ? 8.3 : 25, true) > 0) drawn++
    expect(p.every).toBe(1)
    expect(drawn).toBe(240)
  })

  it('does not take a machine that is late with every frame for a slow display', () => {
    const p = new Pace()
    for (let k = 0; k < 120; k++) p.tick(33.3, true)
    expect(p.every).toBe(1)
    expect(p.frameMs).toBeLessThanOrEqual(20)
    const q = new Pace()
    for (let k = 0; k < 120; k++) q.tick(1000 / 120, true)
    expect(q.frameMs).toBeCloseTo(1000 / 60, 3)
  })

  it('comes to rest when nothing moves, and then draws a small share of the frames', () => {
    const p = new Pace()
    const moving = run(p, 1000 / 60, 10, true)
    run(p, 1000 / 60, HOLD_AFTER_S + 2.5, false)
    expect(p.still).toBe(1)
    expect(p.live).toBe(0)
    const resting = run(p, 1000 / 60, 10, false)
    expect(resting).toBeLessThanOrEqual(Math.ceil(10000 / HELD_MS))
    expect(resting / moving).toBeLessThan(0.05)
  })

  it('draws the very next beat when something is touched, and is back at full pace in half a second', () => {
    const p = new Pace()
    run(p, 1000 / 60, HOLD_AFTER_S + 3, false)
    expect(p.still).toBe(1)
    p.wake()
    expect(p.tick(1000 / 60, false)).toBeGreaterThan(0)
    expect(run(p, 1000 / 60, 0.5, false)).toBeGreaterThanOrEqual(29)
    expect(p.live).toBe(1)
  })

  it('does not come to rest while anything moves', () => {
    const p = new Pace()
    run(p, 1000 / 60, 30, true)
    expect(p.still).toBe(0)
  })

  it('draws what moves by itself at half pace once nobody has touched anything for a while, and at full pace at a touch', () => {
    const p = new Pace()
    expect(run(p, 1000 / 60, 10, true, true)).toBeGreaterThanOrEqual(599)
    run(p, 1000 / 60, UNWATCHED_S, true, true)
    const unwatched = run(p, 1000 / 60, 10, true, true)
    expect(unwatched).toBeGreaterThanOrEqual(299)
    expect(unwatched).toBeLessThanOrEqual(301)
    expect(p.halved).toBe(true)
    p.wake()
    expect(run(p, 1000 / 60, 10, true, true)).toBeGreaterThanOrEqual(599)
    // a game being played is never drawn at half pace, however long the hands are off it
    const q = new Pace()
    run(q, 1000 / 60, UNWATCHED_S + 10, true, false)
    expect(run(q, 1000 / 60, 10, true, false)).toBeGreaterThanOrEqual(599)
  })
})

describe('the size of the picture', () => {
  it('holds its size while frames keep their beat', () => {
    const s = new Sizer()
    for (let k = 0; k < 400; k++) expect(s.feed(false, 1.5)).toBe('')
    expect(s.size).toBe(1)
  })

  it('comes down a size after two slow stretches, not one', () => {
    const s = new Sizer()
    expect(s.feed(true, 1.5)).toBe('')
    expect(s.feed(true, 1.5)).toBe('smaller')
    expect(s.size).toBe(SIZES[1])
    // one slow stretch among clean ones changes nothing
    const t = new Sizer()
    for (let k = 0; k < 50; k++) expect(t.feed(k % 2 === 1, 1.5)).toBe('')
  })

  it('says so when at its smallest frames are still missed', () => {
    const s = new Sizer()
    const said: string[] = []
    for (let k = 0; k < 40; k++) said.push(s.feed(true, 1.5))
    expect(said.filter(x => x === 'smaller').length).toBe(SIZES.length - 1)
    expect(said).toContain('floor')
    expect(s.size).toBe(SIZES[SIZES.length - 1])
  })

  it('goes back up only after a wait, a size at a time', () => {
    const s = new Sizer()
    s.feed(true, 1.5); s.feed(true, 1.5)
    let up = 0, first = -1
    for (let k = 0; k < 60; k++) if (s.feed(false, 1.5) === 'larger') { up++; if (first < 0) first = k }
    expect(up).toBe(1)
    expect(first * 1.5).toBeGreaterThanOrEqual(25)
    expect(s.size).toBe(1)
  })

  it('settles when going up does not hold', () => {
    // A machine that keeps its beat at one size and not at the next: left to try again at every clean stretch it would
    // swing for ever.
    const s = new Sizer()
    let changes = 0, late = 0
    for (let k = 0; k < 2400; k++) {
      const say = s.feed(s.step === 0, 1.5)
      if (say) { changes++; if (k >= 1600) late++ }
    }
    // an hour of play: a handful of changes in all, and next to none by the end
    expect(changes).toBeLessThan(16)
    expect(late).toBeLessThanOrEqual(2)
  })
})

describe('the setting a machine starts on', () => {
  it('is the highest that leaves room in a sixtieth of a second', () => {
    expect(startOn(6)).toBe('high')
    expect(startOn(14)).toBe('high')
    expect(startOn(16)).toBe('medium')
    expect(startOn(20)).toBe('medium')
    expect(startOn(24)).toBe('low')
    expect(startOn(200)).toBe('low')
  })
})
