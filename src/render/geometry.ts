// Shapes built in code: a potato plant, its flowers, an oat tuft, trees, tubers.
import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng } from './noise.ts'

function jitter(g: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const r = rng(seed)
  const p = g.getAttribute('position') as BufferAttribute
  // Vertices shared by position move together so the surface stays closed.
  const seen = new Map<string, [number, number, number]>()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    let d = seen.get(key)
    if (!d) { d = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]; seen.set(key, d) }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2])
  }
  return g
}

function shade(g: BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]): BufferGeometry {
  const p = g.getAttribute('position') as BufferAttribute
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) c.set(fn(p.getX(i), p.getY(i), p.getZ(i)), i * 3)
  g.setAttribute('color', new BufferAttribute(c, 3))
  return g
}

function strip(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name)
  return g.index ? g.toNonIndexed() : g
}

// A potato plant one unit across and about half a unit high, base at y = 0.
export function plantGeometry(): BufferGeometry {
  const r = rng(42)
  const parts: BufferGeometry[] = []
  const lobes: [number, number, number, number][] = [[0, 0.36, 0, 0.24]]
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r() * 0.5
    lobes.push([Math.cos(a) * 0.27, 0.2 + r() * 0.08, Math.sin(a) * 0.27, 0.17 + r() * 0.05])
  }
  for (let k = 0; k < 4; k++) {
    const a = r() * Math.PI * 2
    lobes.push([Math.cos(a) * 0.14, 0.33 + r() * 0.06, Math.sin(a) * 0.14, 0.15])
  }
  lobes.forEach(([x, y, z, s], k) => {
    const g = new IcosahedronGeometry(s, 1)
    jitter(g, s * 0.35, 100 + k)
    g.scale(1, 0.78, 1)
    g.translate(x, y, z)
    parts.push(strip(g))
  })
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return shade(g, (_x, y) => {
    const v = 0.55 + 0.5 * Math.min(1, y / 0.5)
    return [v, v, v]
  })
}

// Dead vines: a low, open tangle.
export function deadGeometry(): BufferGeometry {
  const r = rng(9)
  const parts: BufferGeometry[] = []
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.4
    const len = 0.32 + r() * 0.16
    const g = new CylinderGeometry(0.018, 0.026, len, 4, 1)
    g.rotateZ(Math.PI / 2 - 0.25 - r() * 0.3)
    g.translate(len * 0.45, 0.05 + r() * 0.05, 0)
    g.rotateY(a)
    parts.push(strip(g))
  }
  for (let k = 0; k < 5; k++) {
    const g = new IcosahedronGeometry(0.1 + r() * 0.05, 0)
    jitter(g, 0.05, 300 + k)
    g.scale(1, 0.45, 1)
    const a = r() * Math.PI * 2, d = 0.12 + r() * 0.18
    g.translate(Math.cos(a) * d, 0.05, Math.sin(a) * d)
    parts.push(strip(g))
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return shade(g, (_x, y) => { const v = 0.7 + 1.5 * y; return [v, v, v] })
}

// Flowers in clusters held above the top of a plant. Each flower carries its centre and an opening threshold.
export function blossomGeometry(): BufferGeometry {
  const r = rng(77)
  const parts: BufferGeometry[] = []
  const clusters = 7
  let k = 0
  const total = clusters * 3
  for (let c = 0; c < clusters; c++) {
    const a = (c / clusters) * Math.PI * 2 + r() * 0.6, d = c === 0 ? 0.04 : 0.16 + r() * 0.17
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d
    const cy = 0.6 - d * 0.75 + r() * 0.04
    const lilac = r() < 0.4
    for (let f = 0; f < 3; f++) {
      const b = r() * Math.PI * 2
      const x = cx + Math.cos(b) * 0.045, z = cz + Math.sin(b) * 0.045, y = cy + (r() - 0.5) * 0.04
      const s = 0.05 + r() * 0.015
      const g = new IcosahedronGeometry(s, 0)
      g.scale(1, 0.45, 1)
      g.translate(x, y, z)
      const flat = strip(g)
      const n = flat.getAttribute('position').count
      const fc = new Float32Array(n * 3), fk = new Float32Array(n), col = new Float32Array(n * 3)
      const thr = ((k * 7) % total + 0.5) / total
      for (let i = 0; i < n; i++) {
        fc.set([x, y, z], i * 3)
        fk[i] = thr
        col.set(lilac ? [0.86, 0.8, 0.95] : [1, 1, 1], i * 3)
      }
      flat.setAttribute('aFc', new BufferAttribute(fc, 3))
      flat.setAttribute('aFk', new BufferAttribute(fk, 1))
      flat.setAttribute('color', new BufferAttribute(col, 3))
      parts.push(flat)
      k++
    }
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

// Oats and clover: a tuft of blades, some carrying a head. Base at y = 0, about one unit high.
export function tuftGeometry(): BufferGeometry {
  const r = rng(5)
  const pos: number[] = [], col: number[] = []
  for (let k = 0; k < 11; k++) {
    const a = r() * Math.PI * 2, lean = 0.1 + r() * 0.28, h = 0.65 + r() * 0.4, w = 0.05
    const bx = Math.cos(a) * 0.08, bz = Math.sin(a) * 0.08
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz)
    col.push(0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 1, 1, 1)
    if (k % 3 === 0) {
      for (let s = 0; s < 3; s++) {
        const hy = h - 0.05 - s * 0.09, hx = bx + (tx - bx) * (hy / h), hz = bz + (tz - bz) * (hy / h)
        const ox = (s % 2 ? 1 : -1) * 0.06
        pos.push(hx, hy, hz, hx + ox, hy - 0.08, hz + 0.02, hx + ox * 0.4, hy - 0.11, hz - 0.03)
        col.push(1.15, 1.1, 0.9, 1.15, 1.1, 0.9, 1.1, 1.05, 0.9)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.computeVertexNormals()
  // Blades are lit as if they faced up, which reads better at this scale.
  const n = g.getAttribute('normal') as BufferAttribute
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3)
  n.needsUpdate = true
  return g
}

// A spruce one unit high: stacked rough cones and a short trunk.
export function spruceGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  const trunk = new CylinderGeometry(0.025, 0.04, 0.2, 5)
  trunk.translate(0, 0.1, 0)
  parts.push(shade(strip(trunk), () => [0.35, 0.27, 0.2]))
  const tiers = 5
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers
    const rad = 0.24 * (1 - t * 0.78)
    const h = 0.34 * (1 - t * 0.35)
    const g = new ConeGeometry(rad, h, 8, 1)
    jitter(g, rad * 0.25, 500 + k)
    g.translate(0, 0.16 + t * 0.7 + h / 2, 0)
    parts.push(shade(strip(g), (_x, y) => { const v = 0.75 + 0.35 * y; return [v, v, v] }))
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

// A birch trunk with a few limbs; the crown is drawn separately so it can turn and fall.
export function birchTrunkGeometry(): BufferGeometry {
  const r = rng(12)
  const parts: BufferGeometry[] = []
  const trunk = new CylinderGeometry(0.018, 0.032, 1, 6, 6)
  trunk.translate(0, 0.5, 0)
  jitter(trunk, 0.01, 31)
  parts.push(shade(strip(trunk), (_x, y) => {
    const mark = Math.sin(y * 61) > 0.82 || Math.sin(y * 23 + 1) > 0.93 ? 0.25 : 1
    return [0.93 * mark, 0.92 * mark, 0.88 * mark]
  }))
  for (let k = 0; k < 5; k++) {
    const g = new CylinderGeometry(0.006, 0.012, 0.28, 4)
    g.translate(0, 0.14, 0)
    g.rotateZ(0.6 + r() * 0.4)
    g.rotateY(r() * Math.PI * 2)
    g.translate(0, 0.45 + k * 0.1, 0)
    parts.push(shade(strip(g), () => [0.45, 0.4, 0.36]))
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

export function birchCrownGeometry(): BufferGeometry {
  const r = rng(21)
  const parts: BufferGeometry[] = []
  for (let k = 0; k < 6; k++) {
    const g = new IcosahedronGeometry(0.13 + r() * 0.05, 1)
    jitter(g, 0.05, 700 + k)
    g.translate((r() - 0.5) * 0.22, 0.55 + r() * 0.4, (r() - 0.5) * 0.22)
    parts.push(strip(g))
  }
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return shade(g, (_x, y) => { const v = 0.7 + 0.4 * (y - 0.45); return [v, v, v] })
}

export function tuberGeometry(): BufferGeometry {
  const g = new SphereGeometry(0.5, 9, 6)
  jitter(g, 0.08, 4)
  g.computeVertexNormals()
  return strip(g)
}
