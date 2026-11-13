// How often the picture is drawn and how large it is. A display that runs faster than sixty frames a second is drawn
// on its every beat by a machine that keeps that beat (Rate), and otherwise on every second or third of its beats;
// when nothing has moved for a while the land comes to rest and is drawn a couple of times a second; a picture that moves by itself with nobody at it (the opening) is drawn at half its pace;
// and the picture's size follows whether frames keep their beat. Nothing is drawn here: index.ts asks and obeys.
// A frame is due by the time gone since the last one, not by a count of beats: on a fast display a frame whose work
// runs past one beat is called again on the next, and is drawn then, a sixtieth of a second after the last as ever.
// Counted in beats it would wait one more, and every such frame came half as late again.

export const HOLD_AFTER_S = 5      // how long after the last thing moved the land is let come to rest
const REST_S = 1.6                 // how long it takes to come to rest
const STIR_S = 0.3                 // and to stir again
export const HELD_MS = 500         // at rest, how long between frames
export const UNWATCHED_S = 90      // how long with no hand on anything before what moves by itself is drawn at half pace
const SURE_MS = 4000               // how long a slower beat is seen before the display is taken to have changed
const SLOWEST_MS = 21              // the longest beat a display is taken to have (fifty a second, with a little over)

export class Pace {
  // The display's beat in milliseconds, and how many of its beats go to one frame drawn.
  beat = 1000 / 60
  every = 1
  // How many beats make about a sixtieth of a second; and whether a faster display is drawn on its every beat.
  sixty = 1
  full = false
  // How long the browser took to call again, the last time it did: the wait that says whether the machine keeps up.
  // (The time a drawn frame covers says nothing of that on a fast display drawn at about sixty: it is so many beats
  // by choice, and one beat more whenever a call falls just short.)
  gap = 0
  // 0 while things move .. 1 at rest
  still = 0
  private gaps: number[] = []
  private gapWas = 0
  private owed = 0
  private lastMs = 0
  // The display's beat as the gaps have it; `beat` and `every` follow it when the camera is at rest.
  private learnt = 1000 / 60
  // A longer beat than the one believed, and for how long it has been seen (ms).
  private slow = 0
  private slowFor = 0
  private span = 0
  private quiet = 0
  private untouched = 0
  // True while the picture is being drawn at half its pace: its frames then say nothing of what the machine can do.
  halved = false

  // Something has been touched or asked for: draw every frame again.
  wake(): void { this.quiet = this.untouched = 0 }

  // An animation frame has come round, dtMs after the last. Gives the time the next frame drawn covers, or 0 to draw
  // none on this beat. busy: something moves or is being moved. alone: what moves, moves by itself (the opening).
  // hold: the camera is moving, and the pace is left as it is until it has stopped.
  tick(dtMs: number, busy: boolean, alone = false, hold = false): number {
    const dt = Math.min(dtMs, 250)
    this.gap = dt
    this.owed += dt
    this.untouched += dt / 1000
    this.halved = alone && this.untouched > UNWATCHED_S
    if (dtMs > 2 && dtMs < 70) this.learn(dtMs)
    if (!hold && this.beat !== this.learnt) {
      this.beat = this.learnt
      this.sixty = Math.max(1, Math.floor(1000 / this.beat / 60 + 0.25))
    }
    this.every = this.full ? 1 : this.sixty
    this.quiet = busy ? 0 : this.quiet + dt / 1000
    const rest = this.quiet > HOLD_AFTER_S
    this.still = Math.min(1, Math.max(0, this.still + (rest ? dt / 1000 / REST_S : -dt / 1000 / STIR_S)))
    if (this.still >= 1) {
      if (this.owed < HELD_MS) return 0
    } else {
      const beats = this.every * (this.halved ? 2 : 1)
      let gone = this.owed
      // A beat that comes early after a late frame (a busy machine) is the late frame's own beat, come at last.
      if (gone < this.beat * 0.75) gone += Math.min(this.beat, Math.max(0, this.lastMs - beats * this.beat))
      if (gone < (beats - 0.4) * this.beat) return 0
    }
    const ms = this.owed
    this.lastMs = ms
    this.owed = 0
    return ms
  }

  // The display's beat, from the gaps between the times the page is called.
  private learn(dtMs: number): void {
    this.span += dtMs
    // Gaps are taken two at a time: on a busy machine a late frame is followed by an early one, and the two together
    // are two beats.
    if (this.gapWas) this.gaps.push((dtMs + this.gapWas) / 2)
    this.gapWas = dtMs
    if (this.gaps.length < 30) return
    // The display's own beat is the shortest gap that keeps coming: a late frame only ever makes a gap longer.
    this.gaps.sort((a, b) => a - b)
    const seen = this.gaps[6], span = this.span
    this.gaps.length = 0
    this.span = 0
    if (seen <= this.learnt * 1.04) {
      // A shorter beat is believed at once.
      if (seen < this.learnt) this.learnt = seen
      this.slowFor = 0
    } else if (seen > SLOWEST_MS) {
      // No display beats as slowly as that: these are frames that are all late.
      this.slowFor = 0
    } else {
      // A longer one only when it has been the same for some seconds: frames that are late for a while make every gap
      // long, and a display taken for a slower one would be drawn on every beat when they are in time again.
      if (this.slowFor > 0 && Math.abs(seen - this.slow) > this.slow * 0.04) this.slowFor = 0
      if (this.slowFor === 0) this.slow = seen
      this.slowFor += span
      if (this.slowFor >= SURE_MS) { this.learnt = this.slow; this.slowFor = 0 }
    }
  }

  // How fast the land's own clocks run: 1 while things move, easing to 0 at rest.
  get live(): number {
    const s = 1 - this.still
    return s * s * (3 - 2 * s)
  }

  // The time one drawn frame has, in milliseconds. Never taken for more than a fiftieth of a second: when every frame
  // is late, the gaps between them say nothing of the display.
  get frameMs(): number { return Math.min(this.beat * this.every, 20) }
}

// The picture's size as a share of what the quality setting allows, along a side.
export const SIZES = [1, 0.92, 0.84, 0.77, 0.7]

// Follows whether frames keep their beat, a stretch at a time, and says when the picture should be drawn smaller or
// may be drawn larger again. It goes down after two slow stretches, by as many sizes as the frames are late (the
// pixels in proportion, so a picture twice too dear is at its smallest in one go and not in four), and up a size at
// a time only after a wait that doubles each time going up was followed by coming down again, so it settles and does
// not swing. The smallest is seven tenths of the side, half the pixels. (It goes by frames missed and not by the
// GPU's own timer: a graphics card with little to do slows itself down, and its timer then reads as if it were hard
// pressed.)
export class Sizer {
  step = 0
  private bad = 0
  private good = 0
  private clock = 0
  private wentUp = -1e9
  private changed = -1e9
  private wait = 30

  get size(): number { return SIZES[this.step] }

  // To the full size, or (`least`) to the smallest: where a setting newly gone up to begins.
  reset(least = false): void {
    this.step = least ? SIZES.length - 1 : 0
    this.bad = this.good = 0
    this.changed = this.clock
  }

  // One stretch of `seconds`. slow: frames were being missed in it; late: how long its slower frames took, as a
  // multiple of the time a frame has. Gives 'smaller' or 'larger' when the size has changed, 'floor' when the picture
  // is as small as it goes and frames are still missed.
  feed(slow: boolean, seconds: number, late = 1.3): 'smaller' | 'larger' | 'floor' | '' {
    this.clock += seconds
    if (slow) {
      this.good = 0
      if (++this.bad < 2) return ''
      this.bad = 0
      if (this.step >= SIZES.length - 1) return 'floor'
      const want = SIZES[this.step] ** 2 * (1.15 / Math.max(late, 1.3))
      do this.step++
      while (this.step < SIZES.length - 1 && SIZES[this.step] ** 2 > want)
      if (this.clock - this.wentUp < 30) this.wait = Math.min(this.wait * 2, 3600)
      this.changed = this.clock
      return 'smaller'
    }
    this.bad = 0
    // A long clean stretch is the only sign there may be room.
    this.good++
    if (this.step === 0 || this.good < 4 || this.clock - this.changed < this.wait) return ''
    this.step--
    this.good = 0
    this.wentUp = this.changed = this.clock
    return 'larger'
  }
}

// Whether a display faster than sixty a second is drawn on its every beat. It begins at about sixty; after a clean
// while at the full size it is tried on every beat, and kept there for as long as the frames keep that beat. Two slow
// stretches running put it back, and the wait before the next try doubles each time a try did not hold, so a machine
// that cannot keep the display's beat is asked less and less often.
export class Rate {
  full = false
  private bad = 0
  private clean = 0
  private wait = 6
  private clock = 0
  private wentUp = -1e9

  // One stretch of `seconds`. slow: frames were being missed in it. room: the display is a fast one and the picture is
  // at its full size on a setting that has not come down. Gives 'full' or 'sixty' when the pace has changed.
  feed(slow: boolean, seconds: number, room: boolean): 'full' | 'sixty' | '' {
    this.clock += seconds
    if (this.full) {
      if (!room) return this.fall()
      if (!slow) { this.bad = 0; return '' }
      return ++this.bad < 2 ? '' : this.fall()
    }
    if (slow || !room) { this.clean = 0; return '' }
    this.clean += seconds
    if (this.clean < this.wait) return ''
    this.clean = 0
    this.full = true
    this.bad = 0
    this.wentUp = this.clock
    return 'full'
  }

  private fall(): 'sixty' {
    if (this.clock - this.wentUp < 60) this.wait = Math.min(this.wait * 2, 3600)
    this.full = false
    this.bad = 0
    this.clean = 0
    return 'sixty'
  }
}

// When a setting that came down by itself may go up a step again: only after the picture has been at its full size
// and in time for a good while, and the while doubles each time going up did not hold.
export class Climb {
  private clean = 0
  private wait = 60
  private clock = 0
  private wentUp = -1e9

  // One stretch of `seconds`. room: the picture was at its full size and its frames in time. True when the setting
  // may go up.
  feed(room: boolean, seconds: number): boolean {
    this.clock += seconds
    if (!room) { this.clean = 0; return false }
    this.clean += seconds
    if (this.clean < this.wait) return false
    this.clean = 0
    this.wentUp = this.clock
    return true
  }

  // The setting has come down.
  fell(): void {
    if (this.clock - this.wentUp < 180) this.wait = Math.min(this.wait * 2, 3600)
    this.clean = 0
  }
}

// Which setting to start on, from what a frame at the high setting was measured to cost (milliseconds, the whole of
// it: the page's own work and the GPU's): the highest that fits a sixtieth of a second with a little to spare. The
// middle setting costs about two thirds of the high one. A machine near the line starts on the higher side of it:
// the picture's size and then the setting come down by themselves if frames are missed, and never go up.
export function startOn(highMs: number): 'high' | 'medium' | 'low' {
  const room = 14
  return highMs <= room ? 'high' : highMs * 0.67 <= room ? 'medium' : 'low'
}
