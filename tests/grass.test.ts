// Grass is laid out round the camera a little in each frame (src/render/grass.ts): never a whole square of it in one
// frame, which is a frame come late, and never the same square twice.
import { PerspectiveCamera } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Grass } from '../src/render/grass.ts'
import { HOUSE, groundY } from '../src/render/layout.ts'

// A camera `height` metres over the ground by the house, looking down the slope.
function over(height: number, dx = 0): PerspectiveCamera {
  const cam = new PerspectiveCamera(40, 16 / 9, 0.5, 9000)
  const x = HOUSE.x + dx, z = HOUSE.z + 30
  cam.position.set(x, groundY(x, z) + height, z)
  cam.lookAt(x, groundY(x, z - 40), z - 40)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}
const off = new Array<number>(64).fill(1)

describe('laying grass out', () => {
  afterEach(() => vi.restoreAllMocks())

  // a clock that goes on a millisecond each time it is read: a frame's budget is then two or three steps of the work
  const slowClock = () => { let t = 0; vi.spyOn(performance, 'now').mockImplementation(() => (t += 1)) }

  it('does a few rows of a square in a frame, not the square', () => {
    slowClock()
    const g = new Grass()
    const cam = over(12)
    g.update(cam, off)
    expect(g.laid).toBe(0)
    let frames = 1
    while (g.laid === 0 && frames < 400) { g.update(cam, off); frames++ }
    // a square is 78 rows: at two or three a frame it is some thirty frames' work
    expect(frames).toBeGreaterThan(20)
    expect(frames).toBeLessThan(120)
    expect(g.group.children.some(m => m.visible)).toBe(true)
  })

  it('lays them all at once for a still picture', () => {
    const g = new Grass()
    g.update(over(12), off, true)
    expect(g.laid).toBeGreaterThan(20)
    const was = g.laid
    g.update(over(12), off, true)
    expect(g.laid).toBe(was)
  })

  it('begins while the camera is still on its way down, and shows nothing until it is low enough', () => {
    const g = new Grass()
    const high = over(150)
    for (let k = 0; k < 2000 && g.laid < 6; k++) g.update(high, off)
    expect(g.laid).toBeGreaterThanOrEqual(6)
    expect(g.group.children.some(m => m.visible)).toBe(false)
    g.update(over(400), off)
    expect(g.group.children.some(m => m.visible)).toBe(false)
  })

  it('keeps a square once laid: going away and coming back lays nothing again', () => {
    const g = new Grass()
    g.update(over(12), off, true)
    const was = g.laid, held = g.group.children.length
    for (let k = 0; k < 30; k++) g.update(over(900), off)
    expect(g.group.children.length).toBe(held)
    expect(g.group.children.some(m => m.visible)).toBe(false)
    g.update(over(12), off, true)
    expect(g.laid).toBe(was)
    expect(g.group.children.some(m => m.visible)).toBe(true)
  })

  it('lets the furthest squares go when a great many are held', () => {
    const g = new Grass()
    for (let k = 0; k < 14; k++) g.update(over(12, k * 150), off, true)
    expect(g.laid).toBeGreaterThan(200)
    for (let k = 0; k < 400; k++) g.update(over(900, 13 * 150), off)
    expect(g.held).toBeLessThanOrEqual(160)
    expect(g.held).toBeGreaterThan(100)
    // and the squares round the camera are not among those let go
    const laid = g.laid
    g.update(over(12, 13 * 150), off, true)
    expect(g.laid).toBe(laid)
  })
})
