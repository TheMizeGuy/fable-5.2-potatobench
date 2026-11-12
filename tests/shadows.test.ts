// The sun's three shadow maps are drawn again on different frames (src/render/shadows.ts): a frame that carried two
// of them would be the dear one of its dozen, and come late on a machine with little to spare.
import { Color, Scene, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { SunShadows } from '../src/render/shadows.ts'

describe('the shadow maps', () => {
  it('are never two drawn again in one frame while the camera moves, at any setting', () => {
    const sun = new Vector3(0.4, 0.7, 0.3).normalize(), light = new Color(1, 1, 1)
    for (const every of [[2, 4, 12], [2, 6, 24], [3, 12, 60]] as [number, number, number][]) {
      const s = new SunShadows(new Scene())
      s.every = every
      const drawn = [0, 0, 0]
      for (let f = 0; f < 1200; f++) {
        // the camera pans three metres a frame: every map's ground has moved by the time its turn comes
        s.update(sun, light, new Vector3(f * 3, 0, f * 2), 30, false, 0, -1)
        const maps = [0, 1, 2].filter(k => s.redrawn & (1 << k))
        expect(maps.length, `frame ${f}, turns ${every.join(' ')}`).toBeLessThanOrEqual(1)
        for (const k of maps) drawn[k]++
      }
      for (let k = 0; k < 3; k++) expect(drawn[k], `map ${k}, turns ${every.join(' ')}`).toBe(1200 / every[k])
    }
  })
})
