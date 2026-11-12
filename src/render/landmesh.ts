// The land's triangles. The grid's fine lines are wanted only where the ground has to hold a shape (`fine`: the yards
// and the brook's bed), but each runs on across the whole land, and left in they cut it into slivers a pace wide: three
// quarters of the land's triangles, and from far off, where each is narrower than a pixel, the dearest thing in the
// picture to shade. So the land is laid in the squares of its coarser lines (five metres on the farm, ten beyond); a
// square that touches a fine place is cut by every line through it, and a square beside one takes the points along
// their common side, so that no seam opens between them.
export function landIndex(xs: number[], zs: number[], fine: { x0: number; x1: number; z0: number; z1: number }[]): Uint32Array {
  const nx = xs.length
  const coarse = (v: number[]) => {
    const k = [0]
    for (let i = 1; i < v.length; i++) {
      const last = v[k[k.length - 1]]
      if (i === v.length - 1 || v[i] - last >= 4.5 || v[i + 1] - last > 5.2) k.push(i)
    }
    return k
  }
  const kx = coarse(xs), kz = coarse(zs), cx = kx.length - 1, cz = kz.length - 1
  const cut = new Uint8Array(cx * cz)
  for (let b = 0; b < cz; b++) {
    for (let a = 0; a < cx; a++) {
      const x0 = xs[kx[a]], x1 = xs[kx[a + 1]], z0 = zs[kz[b]], z1 = zs[kz[b + 1]]
      if (fine.some(f => x0 < f.x1 && x1 > f.x0 && z0 < f.z1 && z1 > f.z0)) cut[b * cx + a] = 1
    }
  }
  const isCut = (a: number, b: number) => a >= 0 && b >= 0 && a < cx && b < cz && cut[b * cx + a] === 1
  const out: number[] = []
  const ring: [number, number][] = []
  // which way round three points of the grid go (the land's triangles all go the one way)
  const turn = (p: [number, number], q: [number, number], r: [number, number]) =>
    (xs[q[0]] - xs[p[0]]) * (zs[r[1]] - zs[p[1]]) - (zs[q[1]] - zs[p[1]]) * (xs[r[0]] - xs[p[0]])
  for (let b = 0; b < cz; b++) {
    for (let a = 0; a < cx; a++) {
      const i0 = kx[a], i1 = kx[a + 1], j0 = kz[b], j1 = kz[b + 1]
      if (cut[b * cx + a]) {
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) { const p = j * nx + i, q = p + 1, r = p + nx; out.push(p, r, q, q, r, r + 1) }
        }
        continue
      }
      // Round the square: up its left side, along its top, down its right and back along its bottom, with the points
      // a cut neighbour has along a side; then corner after corner is taken off it as a triangle until none is left.
      ring.length = 0
      ring.push([i0, j0])
      if (isCut(a - 1, b)) for (let j = j0 + 1; j < j1; j++) ring.push([i0, j])
      ring.push([i0, j1])
      if (isCut(a, b + 1)) for (let i = i0 + 1; i < i1; i++) ring.push([i, j1])
      ring.push([i1, j1])
      if (isCut(a + 1, b)) for (let j = j1 - 1; j > j0; j--) ring.push([i1, j])
      ring.push([i1, j0])
      if (isCut(a, b - 1)) for (let i = i1 - 1; i > i0; i--) ring.push([i, j0])
      while (ring.length >= 3) {
        let took = false
        for (let k = 0; k < ring.length; k++) {
          const p = ring[(k + ring.length - 1) % ring.length], q = ring[k], r = ring[(k + 1) % ring.length]
          if (turn(p, q, r) > -1e-6) continue
          // (not if the cut would run along a side that still has points on it: they would be left out, and a seam with them)
          if (ring.some(m => m !== p && m !== q && m !== r && Math.abs(turn(p, r, m)) < 1e-6 && Math.min(p[0], r[0]) <= m[0] && m[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= m[1] && m[1] <= Math.max(p[1], r[1]))) continue
          out.push(p[1] * nx + p[0], q[1] * nx + q[0], r[1] * nx + r[0])
          ring.splice(k, 1)
          took = true
          break
        }
        if (!took) break
      }
    }
  }
  return new Uint32Array(out)
}
