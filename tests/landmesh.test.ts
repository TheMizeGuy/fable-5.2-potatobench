// The land's triangles (src/render/landmesh.ts): laid coarse, cut fine only where asked, and with no seam anywhere.
import { describe, expect, it } from 'vitest'
import { landIndex } from '../src/render/landmesh.ts'

// A grid like the land's own: ten metres apart, five over a farm in the middle, a pace and a half over two yards and
// along a brook, and widening rings outside.
function lines(lo: number, hi: number, bands: [number, number, number][]): number[] {
  const all: number[] = []
  for (let v = lo; v <= hi + 1e-6; v += 10) all.push(v)
  for (const [a, b, st] of bands) for (let v = a; v <= b; v += st) all.push(v)
  all.sort((p, q) => p - q)
  const out: number[] = []
  for (const v of all) if (!out.length || v - out[out.length - 1] > 0.45) out.push(v)
  let s = 10
  for (let k = 0; k < 12; k++) { s *= 1.07; out.unshift(out[0] - s); out.push(out[out.length - 1] + s) }
  return out
}
const xs = lines(-600, 900, [[-200, 400, 5], [60, 170, 1.6], [520, 610, 1.6]])
const zs = lines(-700, 700, [[-300, 240, 5], [-110, -20, 1.6], [-60, 40, 1.6], [221, 321, 1.6]])
const fine = [
  { x0: 60, x1: 170, z0: -110, z1: -20 }, { x0: 520, x1: 610, z0: -60, z1: 40 },
  { x0: -Infinity, x1: Infinity, z0: 221, z1: 321 },
]
const nx = xs.length, nz = zs.length
const index = landIndex(xs, zs, fine)
const at = (v: number) => [xs[v % nx], zs[Math.floor(v / nx)]]

describe('the land laid in triangles', () => {
  it('covers the whole grid once, every triangle the same way up', () => {
    let area = 0
    for (let t = 0; t < index.length; t += 3) {
      const [ax, az] = at(index[t]), [bx, bz] = at(index[t + 1]), [cx, cz] = at(index[t + 2])
      const twice = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
      // the way the plain grid's own triangles go round
      expect(twice).toBeLessThan(0)
      area -= twice / 2
    }
    expect(area).toBeCloseTo((xs[nx - 1] - xs[0]) * (zs[nz - 1] - zs[0]), 3)
  })

  it('has no seam: every edge inside the land is shared by two triangles, once each way', () => {
    const edges = new Map<number, number>()
    const key = (a: number, b: number) => a * (nx * nz) + b
    for (let t = 0; t < index.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = index[t + k], b = index[t + (k + 1) % 3]
        edges.set(key(a, b), (edges.get(key(a, b)) ?? 0) + 1)
      }
    }
    let open = 0
    for (const [k, n] of edges) {
      expect(n).toBe(1)
      const a = Math.floor(k / (nx * nz)), b = k % (nx * nz)
      if (edges.has(key(b, a))) continue
      // an edge with no partner lies on the land's outer edge
      const [ax, az] = at(a), [bx, bz] = at(b)
      const outer = (ax === bx && (ax === xs[0] || ax === xs[nx - 1])) || (az === bz && (az === zs[0] || az === zs[nz - 1]))
      if (!outer) open++
    }
    expect(open).toBe(0)
  })

  it('keeps every point of the grid in the fine places', () => {
    const used = new Set(index)
    for (const f of fine) {
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          if (xs[i] > f.x0 && xs[i] < f.x1 && zs[j] > f.z0 && zs[j] < f.z1) expect(used.has(j * nx + i)).toBe(true)
        }
      }
    }
  })

  it('is far fewer triangles than the grid cut by every line, and none of its squares outside the fine places is wider than the coarse lines', () => {
    expect(index.length / 3).toBeLessThan((nx - 1) * (nz - 1) * 2 * 0.75)
    // the farm keeps its five metres: no triangle there spans more than a little over that
    for (let t = 0; t < index.length; t += 3) {
      const p = [at(index[t]), at(index[t + 1]), at(index[t + 2])]
      const inFarm = p.every(([x, z]) => x > -190 && x < 390 && z > -290 && z < 210)
      if (!inFarm) continue
      const wide = Math.max(...p.map(q => q[0])) - Math.min(...p.map(q => q[0])), deep = Math.max(...p.map(q => q[1])) - Math.min(...p.map(q => q[1]))
      expect(Math.max(wide, deep)).toBeLessThanOrEqual(5.2 + 1e-6)
    }
  })
})
