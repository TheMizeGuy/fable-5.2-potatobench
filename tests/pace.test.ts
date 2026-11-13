// How often the picture is drawn and how large (src/render/pace.ts): a fast display is not drawn on every beat, a
// land where nothing moves comes to rest, and the picture's size settles instead of swinging.
import { describe, expect, it } from 'vitest'
import { Climb, HELD_MS, HOLD_AFTER_S, Pace, Rate, SIZES, Sizer, UNWATCHED_S, judge, startOn } from '../src/render/pace.ts'

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

  // A display beating `hz` times a second and a page whose drawn frame takes `cost(t)` ms of its thread: the page is
  // called on the next beat after its work is done, so work that runs past a beat misses it. Gives the gaps between
  // the frames drawn after the first three seconds, and every number of beats to a frame the pace took up.
  function play(hz: number, cost: (t: number) => number, seconds = 20, hold = false): { gaps: number[]; every: number[] } {
    const beat = 1000 / hz, p = new Pace()
    const gaps: number[] = [], every = new Set<number>()
    for (let t = 0, last = 0, drawn = 0; t < seconds * 1000;) {
      const ms = t > last ? p.tick(t - last, true, false, hold && t > 3000) : 0
      last = t
      let work = 0.3
      if (ms > 0) { if (t > 3000) { gaps.push(t - drawn); every.add(p.every) } drawn = t; work = cost(t) }
      t = Math.max(Math.floor((t + 1e-6) / beat) + 1, Math.ceil((t + work) / beat)) * beat
    }
    return { gaps, every: [...every] }
  }
  const spread = (gaps: number[]) => Math.max(...gaps) - Math.min(...gaps)

  it('keeps an even sixtieth of a second on a fast display when a frame runs past one beat of it', () => {
    // counted in beats, a frame of 8.5 ms on a 120-a-second display came 8, 17 and 25 ms after the last by turns
    for (const cost of [3, 6, 7.5, 8, 8.5, 9, 10, 12, 15]) {
      const r = play(120, () => cost)
      expect(spread(r.gaps), `${cost} ms a frame`).toBeLessThan(0.01)
      expect(r.gaps[0], `${cost} ms a frame`).toBeCloseTo(1000 / 60, 3)
    }
    for (const cost of [3, 6, 7.5, 9, 12]) {
      const r = play(144, () => cost)
      expect(spread(r.gaps), `${cost} ms a frame at 144`).toBeLessThan(0.01)
      expect(r.gaps[0]).toBeCloseTo(2000 / 144, 3)
    }
  })

  it('does not swing between paces as the cost of a frame swings about one beat', () => {
    for (const hz of [120, 144]) {
      const r = play(hz, t => 8.5 + 2.5 * Math.sin((t / 2000) * Math.PI * 2))
      expect(r.every, `${hz} a second`).toEqual([2])
      expect(spread(r.gaps), `${hz} a second`).toBeLessThan(0.01)
    }
    // a dear frame among cheap ones is late by itself, and the frames after it are not
    let n = 0
    const r = play(120, () => (n++ % 12 === 0 ? 20 : 6))
    expect(r.gaps.filter(g => g > 17).length).toBeLessThanOrEqual(Math.ceil(r.gaps.length / 12) + 1)
    expect(r.gaps.filter(g => g < 16).length).toBe(0)
  })

  it('is not taken for a slower display by frames that are late for a while', () => {
    // twelve seconds of frames too dear for a 120-a-second display, then cheap ones again
    const r = play(120, t => (t < 15000 ? 19 : 5), 24)
    const after = r.gaps.slice(-300)
    expect(spread(after)).toBeLessThan(0.01)
    expect(after[0]).toBeCloseTo(1000 / 60, 3)
  })

  it('keeps its pace through a long move in which every frame runs past a beat', () => {
    // three seconds of cheap frames on a 120-a-second display, then the camera moves and every frame costs 12 ms
    for (const hold of [true, false]) {
      const r = play(120, t => (t < 3000 ? 5 : 12), 20, hold)
      expect(spread(r.gaps), hold ? 'camera moving' : 'camera still').toBeLessThan(0.01)
      expect(r.gaps[0]).toBeCloseTo(1000 / 60, 3)
    }
  })

  it('changes the beats to a frame only when the camera is at rest', () => {
    // a window carried from a 60-a-second display to a 120-a-second one while the camera moves
    const p = new Pace()
    run(p, 1000 / 60, 2, true)
    expect(p.every).toBe(1)
    for (let k = 0; k < 480; k++) p.tick(1000 / 120, true, false, true)
    expect(p.every).toBe(1)
    p.tick(1000 / 120, true, false, false)
    expect(p.every).toBe(2)
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

  it('comes down by as much as the frames are late, not a size at a time', () => {
    // frames taking twice their time: half the pixels in one go
    const s = new Sizer()
    s.feed(true, 1.5, 2)
    expect(s.feed(true, 1.5, 2)).toBe('smaller')
    expect(s.size).toBe(SIZES[SIZES.length - 1])
    // half as late again: about two thirds of the pixels
    const t = new Sizer()
    t.feed(true, 1.5, 1.5)
    t.feed(true, 1.5, 1.5)
    expect(t.size ** 2).toBeLessThanOrEqual(1.15 / 1.5)
    expect(t.size ** 2).toBeGreaterThan(0.6)
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

describe('a setting that came down by itself', () => {
  it('goes up again only after a minute at the full size and in time', () => {
    const c = new Climb()
    let at = -1
    for (let k = 0; k < 60 && at < 0; k++) if (c.feed(true, 1.5)) at = k
    expect((at + 1) * 1.5).toBeGreaterThanOrEqual(60)
    expect((at + 1) * 1.5).toBeLessThan(70)
    // a slow stretch, or a picture not at its full size, starts the wait again
    const d = new Climb()
    for (let k = 0; k < 200; k++) expect(d.feed(k % 30 !== 29, 1.5)).toBe(false)
  })

  it('waits twice as long each time going up did not hold', () => {
    const c = new Climb()
    const waits: number[] = []
    for (let n = 0; n < 5; n++) {
      let t = 0
      while (!c.feed(true, 1.5)) t += 1.5
      waits.push(t)
      // down again within a few seconds
      c.feed(false, 6)
      c.fell()
    }
    for (let n = 1; n < waits.length; n++) expect(waits[n]).toBeGreaterThanOrEqual(waits[n - 1] * 1.9)
    expect(waits[4]).toBeGreaterThan(900)
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

describe('a fast display on a machine that keeps its beat', () => {
  it('is drawn on its every beat once it is asked to be, and at about sixty again when it is not', () => {
    for (const hz of [120, 144, 165, 240]) {
      const p = new Pace()
      run(p, 1000 / hz, 1, true)
      p.full = true
      const drawn = run(p, 1000 / hz, 2, true) / 2
      expect(p.every, `${hz} a second`).toBe(1)
      expect(drawn, `${hz} a second`).toBeGreaterThan(hz - 2)
      expect(p.frameMs, `${hz} a second`).toBeCloseTo(1000 / hz, 1)
      p.full = false
      const back = run(p, 1000 / hz, 2, true) / 2
      expect(back, `${hz} a second`).toBeLessThanOrEqual(91)
    }
  })

  it('is tried on every beat after a clean while, and only with room for it', () => {
    const r = new Rate()
    expect(r.feed(false, 1.5, false)).toBe('')
    for (let k = 0; k < 10; k++) expect(r.feed(false, 1.5, false), 'a sixty-a-second display, or a picture made smaller').toBe('')
    const said: string[] = []
    for (let k = 0; k < 4; k++) said.push(r.feed(false, 1.5, true))
    expect(said).toEqual(['', '', '', 'full'])
    expect(r.full).toBe(true)
    // In time: it stays.
    for (let k = 0; k < 40; k++) expect(r.feed(false, 1.5, true)).toBe('')
  })

  it('goes back to about sixty after two slow stretches, not one, and waits twice as long before each next try', () => {
    const r = new Rate()
    const until = (want: string, slow: boolean) => { let n = 0; while (r.feed(slow, 1.5, true) !== want && n < 5000) n++; return (n + 1) * 1.5 }
    const first = until('full', false)
    expect(r.feed(true, 1.5, true)).toBe('')
    expect(r.feed(false, 1.5, true)).toBe('')
    expect(r.feed(true, 1.5, true)).toBe('')
    expect(r.feed(true, 1.5, true)).toBe('sixty')
    const second = until('full', false)
    expect(second).toBeGreaterThanOrEqual(first * 2 - 1.5)
    until('sixty', true)
    const third = until('full', false)
    expect(third).toBeGreaterThanOrEqual(second * 2 - 1.5)
    // A slow stretch while waiting starts the wait again.
    until('sixty', true)
    for (let k = 0; k < 3; k++) r.feed(false, 1.5, true)
    r.feed(true, 1.5, true)
    expect(until('full', false)).toBeGreaterThanOrEqual(third * 2 - 1.5)
  })

  it('says how long the browser took to call again, whatever it then draws: on a display of 240 a second that the page keeps only every other beat of, the wait is two beats, not the four or five a picture covers', () => {
    const p = new Pace()
    run(p, 1000 / 240, 1, true)
    expect(p.every).toBe(4)
    const waits: number[] = [], covered: number[] = []
    for (let k = 0; k < 600; k++) {
      // (a call on one beat, then one that misses a beat, turn about)
      const gap = (1000 / 240) * (k % 2 ? 2 : 1)
      const ms = p.tick(gap, true)
      if (ms > 0) { waits.push(p.gap); covered.push(ms) }
    }
    expect(Math.max(...waits)).toBeLessThanOrEqual(1000 / 120 + 1e-6)
    // The pictures themselves come a beat late as often as not: taken for lateness, that would make the picture smaller.
    expect(covered.filter(ms => ms > 1.23 * p.frameMs).length).toBeGreaterThan(covered.length * 0.27)
    expect(waits.filter(ms => ms > 1.23 * p.frameMs).length).toBe(0)
  })

  it('goes back at once when the picture is made smaller or the setting comes down', () => {
    const r = new Rate()
    while (r.feed(false, 1.5, true) !== 'full') { /* until it is tried */ }
    expect(r.feed(false, 1.5, false)).toBe('sixty')
  })
})

// A display's calls played through the pace, the frames judged, and the pace of drawing and the picture's size left to
// follow as src/render/index.ts has them follow. gaps: how long the browser takes to call again, turn about.
function play(hz: number, gaps: (beat: number, drew: boolean) => number, seconds: number): { fps: number; every: number; step: number; full: boolean } {
  const p = new Pace(), r = new Rate(), z = new Sizer()
  const beat = 1000 / hz
  let waits: number[] = [], covered: number[] = [], forMs = 0, drawn = 0, since = 0, drew = false
  for (let t = 0; t < seconds * 1000;) {
    const gap = gaps(beat, drew)
    t += gap
    const ms = p.tick(gap, true)
    drew = ms > 0
    if (!drew) continue
    if (t > (seconds - 4) * 1000) { drawn++; since += ms }
    waits.push(Math.min(ms, p.gap))
    covered.push(ms)
    forMs += ms
    if (forMs < 1500) continue
    const j = judge(waits, covered, p.frameMs)
    const went = r.feed(p.full ? !j.fast : j.slow, forMs / 1000, p.sixty > 1 && z.step === 0)
    if (went) p.full = r.full
    else if (!p.full) z.feed(j.slow, forMs / 1000, j.late)
    waits = []; covered = []; forMs = 0
  }
  return { fps: Math.round(drawn / (since / 1000)), every: p.every, step: z.step, full: p.full }
}

describe('a fast display, with the frames judged as the picture judges them', () => {
  it('is drawn on its every beat by a machine that keeps the beat: 120, 144, 165 and 240 a second', () => {
    for (const hz of [120, 144, 165, 240]) {
      const got = play(hz, beat => beat, 40)
      expect(got.full, `${hz} a second`).toBe(true)
      expect(got.fps, `${hz} a second`).toBeGreaterThan(hz * 0.97)
      expect(got.step, `${hz} a second: the picture at its full size`).toBe(0)
    }
  })

  it('is drawn on every call, and never made smaller, where the page keeps only every other beat of 240 a second after a picture', () => {
    // (the beat after a picture is missed: the page was still at it)
    const got = play(240, (beat, drew) => (drew ? beat * 2 : beat), 60)
    expect(got.step, 'the picture at its full size').toBe(0)
    expect(got.fps).toBeGreaterThan(100)
  })

  it('goes back to about sixty where every beat cannot be kept (a picture takes a sixtieth of a second on a 120 a second display), without the picture being made smaller for it', () => {
    const got = play(120, (beat, drew) => (drew ? beat * 2 : beat), 60)
    expect(got.fps).toBeGreaterThanOrEqual(58)
    expect(got.fps).toBeLessThanOrEqual(62)
    expect(got.step).toBe(0)
  })

  it('is still made smaller where the machine does not keep up at all: every call a fortieth of a second apart', () => {
    for (const hz of [60, 144]) expect(play(hz, () => 25, 30).step, `${hz} a second`).toBeGreaterThan(0)
  })
})
