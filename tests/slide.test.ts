// Nobody is slid over the ground as they stand: every figure drawn (src/render/crew.ts WATCH) through the days of each
// kind of work, at each clock, is either stepping, sat on something, or all but still. A figure carried faster than
// a slow walk for five frames running with its legs not stepping is a slide (tools/render/pose.ts holds the same in a
// browser).
import { describe, expect, it } from 'vitest'
import { WATCH } from '../src/render/crew.ts'
import { watch } from './crewsim.ts'

const SLID = 0.6

function slides(kind: string, speed: 1 | 2 | 3, foot = false): { slid: number; fastest: number; figures: number; tee: number } {
  const out = { slid: 0, fastest: 0, figures: 0, tee: 0 }
  let was: (number[] & { run?: number })[] = []
  WATCH.rows.length = 0
  WATCH.on = true
  try {
    watch(kind, speed, {
      seconds: 24, foot,
      frame: dt => {
        const rows = WATCH.rows.slice() as (number[] & { run?: number })[]
        WATCH.rows.length = 0
        for (const r of rows) {
          out.figures++
          const [x, , z, , extL, sideL, , , extR, sideR, , , flags] = r
          if (extL > 0.9 && extR > 0.9 && sideL > 0.7 && sideR > 0.7) out.tee++
          let near: (number[] & { run?: number }) | null = null, best = 1.5
          for (const o of was) { const d = Math.hypot(o[0] - x, o[2] - z); if (d < best) { best = d; near = o } }
          const v = near ? best / dt : 0
          r.run = v > SLID && !(flags & 16) && !(flags & 32) ? (near?.run ?? 0) + 1 : 0
          if (r.run === 5) { out.slid++; out.fastest = Math.max(out.fastest, v) }
          if (r.run === 5 && process.env.SLIDES) console.log(kind, speed, r.map(v => +v.toFixed(2)).join(' '), 'v', v.toFixed(2))
        }
        was = rows
      },
    })
  } finally { WATCH.on = false; WATCH.rows.length = 0 }
  return out
}

describe('nobody slides as they stand', () => {
  for (const [kind, foot] of [['plant', false], ['spray', false], ['dig', false], ['scout', true]] as const) {
    for (const speed of [1, 2, 3] as const) {
      it(`${kind} at ${['', '1x', '3x', '8x'][speed]}`, () => {
        const s = slides(kind, speed, foot)
        expect(s.figures, 'figures were drawn').toBeGreaterThan(100)
        expect(s.tee, 'held as a T').toBe(0)
        expect(s.slid, `slid as they stood, to ${s.fastest.toFixed(1)} m/s`).toBe(0)
      })
    }
  }
})
