import { describe, expect, it } from 'vitest'
import { fitScale } from '../src/ui/scale.ts'

describe('the interface\'s scale for a window', () => {
  it('is 100% on a laptop and grows by quarters on a larger monitor', () => {
    expect(fitScale(1280, 720)).toBe(1)
    expect(fitScale(1440, 900)).toBe(1)
    expect(fitScale(1512, 982)).toBe(1)
    expect(fitScale(1728, 1117)).toBe(1)
    expect(fitScale(1920, 1080)).toBe(1.25)
    expect(fitScale(2560, 1440)).toBe(1.5)
    expect(fitScale(3840, 2160)).toBe(2)
  })

  it('never scales a phone or a small window', () => {
    expect(fitScale(390, 844)).toBe(1)
    expect(fitScale(844, 390)).toBe(1)
    expect(fitScale(1024, 700)).toBe(1)
  })

  it('always leaves the interface its full layout\'s room: 1440 by 860 of its own pixels once scaled', () => {
    for (let w = 1280; w <= 5120; w += 80) for (let h = 720; h <= 2880; h += 60) {
      const z = fitScale(w, h)
      expect(z).toBeGreaterThanOrEqual(1)
      expect(z * 4).toBe(Math.round(z * 4))
      if (z > 1) { expect(w / z).toBeGreaterThanOrEqual(1440); expect(h / z).toBeGreaterThanOrEqual(860) }
    }
  })

  it('takes the player\'s choice, but never past what the window has room for', () => {
    expect(fitScale(2560, 1440, '1')).toBe(1)
    expect(fitScale(2560, 1440, '1.25')).toBe(1.25)
    expect(fitScale(2560, 1440, '2')).toBe(1.5)
    expect(fitScale(1440, 900, '1.5')).toBe(1)
  })
})
