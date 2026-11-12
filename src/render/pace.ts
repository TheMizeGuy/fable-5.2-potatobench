// How often the picture is drawn and how large it is. A display that runs faster than sixty frames a second is drawn
// on every second or third of its beats; when nothing has moved for a while the land comes to rest and is drawn a
// couple of times a second; a picture that moves by itself with nobody at it (the opening) is drawn at half its pace;
// and the picture's size follows whether frames keep their beat. Nothing is drawn here: index.ts asks and obeys.

export const HOLD_AFTER_S = 5      // how long after the last thing moved the land is let come to rest
const REST_S = 1.6                 // how long it takes to come to rest
const STIR_S = 0.3                 // and to stir again
export const HELD_MS = 500         // at rest, how long between frames
export const UNWATCHED_S = 90      // how long with no hand on anything before what moves by itself is drawn at half pace

export class Pace {
  // The display's beat in milliseconds, and how many of its beats go to one frame drawn.
  beat = 1000 / 60
  every = 1
  // 0 while things move .. 1 at rest
  still = 0
  private gaps: number[] = []
  private gapWas = 0
  private owed = 0
  private count = 0
  private quiet = 0
  private untouched = 0
  // True while the picture is being drawn at half its pace: its frames then say nothing of what the machine can do.
  halved = false

  // Something has been touched or asked for: draw every frame again.
  wake(): void { this.quiet = this.untouched = 0 }

  // An animation frame has come round, dtMs after the last. Gives the time the next frame drawn covers, or 0 to draw
  // none on this beat. busy: something moves or is being moved. alone: what moves, moves by itself (the opening).
  tick(dtMs: number, busy: boolean, alone = false): number {
    const dt = Math.min(dtMs, 250)
    this.owed += dt
    this.count++
    this.untouched += dt / 1000
    this.halved = alone && this.untouched > UNWATCHED_S
    if (dtMs > 2 && dtMs < 70) {
      // Gaps are taken two at a time: on a busy machine a late frame is followed by an early one, and the two together
      // are two beats.
      if (this.gapWas) this.gaps.push((dtMs + this.gapWas) / 2)
      this.gapWas = dtMs
      if (this.gaps.length >= 30) {
        // The display's own beat is the shortest gap that keeps coming: a late frame only ever makes a gap longer.
        this.gaps.sort((a, b) => a - b)
        this.beat = this.gaps[6]
        this.gaps.length = 0
        this.every = Math.max(1, Math.floor(1000 / this.beat / 60 + 0.25))
      }
    }
    this.quiet = busy ? 0 : this.quiet + dt / 1000
    const rest = this.quiet > HOLD_AFTER_S
    this.still = Math.min(1, Math.max(0, this.still + (rest ? dt / 1000 / REST_S : -dt / 1000 / STIR_S)))
    if (this.still >= 1 ? this.owed < HELD_MS : this.count < this.every * (this.halved ? 2 : 1)) return 0
    const ms = this.owed
    this.owed = 0
    this.count = 0
    return ms
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
// may be drawn larger again. It goes down after two slow stretches, and up only after a wait that doubles each time
// going up was followed by coming down again, so it settles and does not swing. (It goes by frames missed and not by
// the GPU's own timer: a graphics card with little to do slows itself down, and its timer then reads as if it were
// hard pressed.)
export class Sizer {
  step = 0
  private bad = 0
  private good = 0
  private clock = 0
  private wentUp = -1e9
  private changed = -1e9
  private wait = 30

  get size(): number { return SIZES[this.step] }

  reset(): void {
    this.step = 0
    this.bad = this.good = 0
    this.changed = this.clock
  }

  // One stretch of `seconds`. slow: frames were being missed in it. Gives 'smaller' or 'larger' when the size has
  // changed, 'floor' when the picture is as small as it goes and frames are still missed.
  feed(slow: boolean, seconds: number): 'smaller' | 'larger' | 'floor' | '' {
    this.clock += seconds
    if (slow) {
      this.good = 0
      if (++this.bad < 2) return ''
      this.bad = 0
      if (this.step >= SIZES.length - 1) return 'floor'
      this.step++
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

// Which setting to start on, from what a frame at the high setting was measured to cost (milliseconds, the whole of
// it: the page's own work and the GPU's): the highest that fits a sixtieth of a second with a little to spare. The
// middle setting costs about two thirds of the high one. A machine near the line starts on the higher side of it:
// the picture's size and then the setting come down by themselves if frames are missed, and never go up.
export function startOn(highMs: number): 'high' | 'medium' | 'low' {
  const room = 14
  return highMs <= room ? 'high' : highMs * 0.67 <= room ? 'medium' : 'low'
}
