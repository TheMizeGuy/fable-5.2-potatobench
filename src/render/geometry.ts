// Shapes built in code: a potato plant of leaves, its flowers, a tuft of oats, tubers.
import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three'
import { rng } from './noise.ts'

interface Build { pos: number[]; nrm: number[]; uv: number[]; extra: number[]; idx: number[] }

function finish(b: Build, extraName: string, extraSize: number): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nrm), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(b.uv), 2))
  g.setAttribute(extraName, new BufferAttribute(new Float32Array(b.extra), extraSize))
  g.setIndex(b.idx)
  return g
}

function norm(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

// A potato plant one unit across and about 0.62 high, base at the origin: a few stems carrying compound leaves, each
// leaf a bent card that takes the leaf texture. aLeaf: the leaf's own number, how far along the leaf, 1 leaf / 0 stem.
export function plantGeometry(): BufferGeometry {
  const r = rng(42)
  const b: Build = { pos: [], nrm: [], uv: [], extra: [], idx: [] }
  const leaf = (az: number, y: number, out: number, rise: number, len: number, id: number) => {
    const wide = len * 0.86
    const dir = [Math.cos(az) * Math.cos(rise), Math.sin(rise), Math.sin(az) * Math.cos(rise)]
    const side = [-Math.sin(az), 0, Math.cos(az)]
    const bend = rise - 0.75 - r() * 0.25
    const dir2 = [Math.cos(az) * Math.cos(bend), Math.sin(bend), Math.sin(az) * Math.cos(bend)]
    const p0 = [Math.cos(az) * out, y, Math.sin(az) * out]
    const p1 = [p0[0] + dir[0] * len * 0.5, p0[1] + dir[1] * len * 0.5, p0[2] + dir[2] * len * 0.5]
    const p2 = [p1[0] + dir2[0] * len * 0.5, p1[1] + dir2[1] * len * 0.5, p1[2] + dir2[2] * len * 0.5]
    const o = b.pos.length / 3
    const rows: [number[], number[], number][] = [[p0, dir, 0], [p1, dir, 0.5], [p2, dir2, 1]]
    for (const [p, d, v] of rows) {
      // The card's own normal, leaned toward the outside of the bush so the plant shades as one soft form.
      const n = [d[1] * side[2] - d[2] * side[1], d[2] * side[0] - d[0] * side[2], d[0] * side[1] - d[1] * side[0]]
      const up = n[1] < 0 ? -1 : 1
      for (const s of [-1, 1]) {
        const x = p[0] + side[0] * s * wide * 0.5, yy = p[1], z = p[2] + side[2] * s * wide * 0.5
        const dome = norm([x, (yy - 0.12) * 1.4 + 0.25, z])
        const nn = norm([n[0] * up * 0.55 + dome[0] * 0.45 + side[0] * s * 0.2, n[1] * up * 0.55 + dome[1] * 0.45, n[2] * up * 0.55 + dome[2] * 0.45 + side[2] * s * 0.2])
        b.pos.push(x, yy, z)
        b.nrm.push(nn[0], nn[1], nn[2])
        b.uv.push((s + 1) / 2, v)
        b.extra.push(id, v, 1)
      }
    }
    for (let k = 0; k < 2; k++) {
      const a = o + k * 2
      b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const stem = (az: number, lean: number, height: number) => {
    const top = [Math.cos(az) * lean, height, Math.sin(az) * lean]
    for (const turn of [0, Math.PI / 2]) {
      const sx = Math.cos(az + turn) * 0.018, sz = Math.sin(az + turn) * 0.018
      const o = b.pos.length / 3
      const corners = [[-sx, 0, -sz], [sx, 0, sz], [top[0] - sx * 0.5, top[1], top[2] - sz * 0.5], [top[0] + sx * 0.5, top[1], top[2] + sz * 0.5]]
      corners.forEach((c, k) => {
        b.pos.push(c[0], c[1], c[2])
        const n = norm([Math.cos(az), 0.6, Math.sin(az)])
        b.nrm.push(n[0], n[1], n[2])
        b.uv.push(0.5, 0.2 + (k > 1 ? 0.3 : 0))
        b.extra.push(0.5, 0, 0)
      })
      b.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
    }
  }
  const golden = 2.39996
  for (let k = 0; k < 4; k++) stem(k * 1.7 + 0.4, 0.07 + r() * 0.05, 0.4 + r() * 0.1)
  // Low leaves reach out, the ones above them stand up more, the crown stands nearly upright.
  for (let k = 0; k < 5; k++) leaf(k * golden, 0.07 + r() * 0.08, 0.04, 0.2 + r() * 0.2, 0.46 + r() * 0.08, r())
  for (let k = 0; k < 5; k++) leaf(k * golden + 0.9, 0.22 + r() * 0.1, 0.05, 0.62 + r() * 0.22, 0.4 + r() * 0.08, r())
  for (let k = 0; k < 4; k++) leaf(k * golden * 1.3 + 0.3, 0.36 + r() * 0.08, 0.03, 1.05 + r() * 0.22, 0.3 + r() * 0.07, r())
  return finish(b, 'aLeaf', 3)
}

// Flowers in clusters held just above the canopy. Each is a small card that turns to face the eye.
// position: where the flower sits on the unit plant. aFlower: the card's corner (x, y), the share of bloom at which it
// opens, and its own number.
export function blossomGeometry(): BufferGeometry {
  const r = rng(77)
  const b: Build = { pos: [], nrm: [], uv: [], extra: [], idx: [] }
  const clusters = 5
  let n = 0
  const total = clusters * 4
  for (let c = 0; c < clusters; c++) {
    const a = c * 2.39996 + r() * 0.5, d = c === 0 ? 0.05 : 0.18 + r() * 0.2
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 0.66 - d * 0.5 + r() * 0.05
    for (let f = 0; f < 4; f++) {
      const fa = r() * Math.PI * 2, fr = 0.03 + r() * 0.045
      const x = cx + Math.cos(fa) * fr, y = cy + (r() - 0.5) * 0.05, z = cz + Math.sin(fa) * fr
      const open = ((n * 7) % total + 0.5) / total, own = r()
      const o = b.pos.length / 3
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        b.pos.push(x, y, z)
        b.nrm.push(0, 1, 0)
        b.uv.push((u + 1) / 2, (v + 1) / 2)
        b.extra.push(u, v, open, own)
      }
      b.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
      n++
    }
  }
  return finish(b, 'aFlower', 4)
}

// Oats: a tuft of blades one unit high, the tallest carrying a nodding head. aBlade: its own number, height along the
// blade (0 root, 1 tip), 1 on the head.
export function oatGeometry(): BufferGeometry {
  const r = rng(5)
  const b: Build = { pos: [], nrm: [], uv: [], extra: [], idx: [] }
  for (let k = 0; k < 7; k++) {
    const a = r() * Math.PI * 2, lean = 0.06 + r() * 0.16, h = 0.72 + r() * 0.28, w = 0.03 + r() * 0.012, own = r()
    const bx = Math.cos(a) * 0.07 * r(), bz = Math.sin(a) * 0.07 * r()
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w
    const o = b.pos.length / 3
    const levels = [0, 0.5, 1]
    levels.forEach((t, j) => {
      const taper = 1 - t * 0.85
      const x = bx + Math.cos(a) * lean * t * t, z = bz + Math.sin(a) * lean * t * t, y = h * t
      for (const s of [-1, 1]) {
        b.pos.push(x + px * s * taper, y, z + pz * s * taper)
        b.nrm.push(Math.cos(a) * 0.35, 0.9, Math.sin(a) * 0.35)
        b.uv.push((s + 1) / 2, t)
        b.extra.push(own, t, 0)
      }
      if (j > 0) { const q = o + (j - 1) * 2; b.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2) }
    })
    if (k < 4) {
      // The head: a loose spray hanging to one side of the tip.
      const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean
      const q = b.pos.length / 3
      const hang = 0.16 + r() * 0.06, wideH = 0.055
      const pts = [[tx - px * 0.6, h * 0.86, tz - pz * 0.6], [tx + Math.cos(a) * wideH * 2 + px, h * 0.96, tz + Math.sin(a) * wideH * 2 + pz],
        [tx + Math.cos(a) * wideH, h - hang, tz + Math.sin(a) * wideH], [tx + Math.cos(a) * wideH * 3.2, h - hang * 0.5, tz + Math.sin(a) * wideH * 3.2]]
      for (const p of pts) {
        b.pos.push(p[0], p[1], p[2])
        b.nrm.push(Math.cos(a) * 0.3, 0.92, Math.sin(a) * 0.3)
        b.uv.push(0.5, 1)
        b.extra.push(own, 1, 1)
      }
      b.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
    }
  }
  return finish(b, 'aBlade', 3)
}

// Meadow grass: a clump of broad blades one unit high, a few carrying a seed head. aBlade as for oats.
export function grassGeometry(): BufferGeometry {
  const r = rng(15)
  const b: Build = { pos: [], nrm: [], uv: [], extra: [], idx: [] }
  for (let k = 0; k < 13; k++) {
    const a = r() * Math.PI * 2, lean = 0.18 + r() * 0.5, h = 0.5 + r() * 0.5, w = 0.07 + r() * 0.05, own = r()
    const bx = Math.cos(a) * 0.16 * r(), bz = Math.sin(a) * 0.16 * r()
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w
    const o = b.pos.length / 3
    ;[0, 0.45, 0.8, 1].forEach((t, j) => {
      const taper = 1 - t * t
      const x = bx + Math.cos(a) * lean * t * t, z = bz + Math.sin(a) * lean * t * t, y = h * (t - 0.25 * t * t * lean)
      for (const s of [-1, 1]) {
        b.pos.push(x + px * s * taper, y, z + pz * s * taper)
        b.nrm.push(Math.cos(a) * 0.4, 0.86, Math.sin(a) * 0.4)
        b.uv.push((s + 1) / 2, t)
        b.extra.push(own, t, 0)
      }
      if (j > 0) { const q = o + (j - 1) * 2; b.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2) }
    })
    if (k < 3) {
      const tx = bx + Math.cos(a) * lean * 0.5, tz = bz + Math.sin(a) * lean * 0.5
      const q = b.pos.length / 3
      for (const [dx, dy] of [[-0.035, 1.02], [0.035, 1.02], [-0.02, 1.34], [0.02, 1.34]]) {
        b.pos.push(tx + px / w * dx, h * dy, tz + pz / w * dx)
        b.nrm.push(Math.cos(a) * 0.3, 0.92, Math.sin(a) * 0.3)
        b.uv.push(0.5, 1)
        b.extra.push(own, 1, 1)
      }
      b.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
    }
  }
  return finish(b, 'aBlade', 3)
}

export function tuberGeometry(): BufferGeometry {
  const g = new SphereGeometry(0.5, 10, 7)
  const p = g.getAttribute('position') as BufferAttribute
  const r = rng(4)
  const seen = new Map<string, number>()
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
    let k = seen.get(key)
    if (k === undefined) { k = 1 + (r() - 0.5) * 0.16; seen.set(key, k) }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}
