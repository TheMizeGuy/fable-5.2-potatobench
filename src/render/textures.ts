// Textures made at start-up, on canvases or from numbers. Nothing is downloaded.
import {
  CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping,
  SRGBColorSpace, UnsignedByteType,
} from 'three'
import { hash2, rng } from './noise.ts'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function tex(c: HTMLCanvasElement, repeat: boolean): CanvasTexture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping
  t.anisotropy = 8
  return t
}

// A cut-out (leaf, flower, spray) as a texture whose clear pixels carry the colour of the drawn ones.
// A canvas keeps no colour where it is clear, so when the picture is shrunk for distance its edges would go black
// and a far-off plant with them. Here the mean colour is written under the clear pixels before upload.
function cutout(c: HTMLCanvasElement): DataTexture {
  const g = c.getContext('2d')!
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  let r = 0, gr = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++ }
  if (n) { r /= n; gr /= n; b /= n }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 8) continue
    d[i] = r
    d[i + 1] = gr
    d[i + 2] = b
  }
  const t = new DataTexture(new Uint8Array(d.buffer), c.width, c.height, RGBAFormat, UnsignedByteType)
  t.colorSpace = SRGBColorSpace
  t.flipY = true
  t.magFilter = LinearFilter
  t.minFilter = LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

// Value noise that repeats every `period` cells, so the texture tiles.
function tile(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const w = (i: number, j: number) => hash2(((i % period) + period) % period + seed * 131, ((j % period) + period) % period + seed * 17)
  const a = w(ix, iy), b = w(ix + 1, iy), c = w(ix, iy + 1), d = w(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function tileFbm(u: number, v: number, base: number, octaves: number, seed: number): number {
  let s = 0, a = 0.5, f = base, norm = 0
  for (let k = 0; k < octaves; k++) {
    s += a * tile(u * f, v * f, f, seed + k)
    norm += a
    a *= 0.5
    f *= 2
  }
  return s / norm
}

// One repeating texture of noise for the whole scene. Red and green: the slope of a fine bumpy surface (for grain in
// soil and grass). Blue: broad billows (cloud, cloud shadow, gusts, snow patches). Alpha: fine mottle.
export function noiseTexture(): DataTexture {
  const N = 256
  const height = new Float32Array(N * N)
  const data = new Uint8Array(N * N * 4)
  const stretch = (v: number, k: number) => Math.max(0, Math.min(1, (v - 0.5) * k + 0.5))
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N, o = (j * N + i) * 4
      height[j * N + i] = tileFbm(u, v, 16, 4, 3)
      data[o + 2] = Math.round(255 * stretch(tileFbm(u, v, 3, 5, 1), 2.3))
      data[o + 3] = Math.round(255 * stretch(tileFbm(u, v, 12, 4, 2), 2.0))
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const o = (j * N + i) * 4
      const dx = height[j * N + ((i + 1) % N)] - height[j * N + ((i + N - 1) % N)]
      const dy = height[((j + 1) % N) * N + i] - height[((j + N - 1) % N) * N + i]
      data[o] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + dx * 4)))
      data[o + 1] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + dy * 4)))
    }
  }
  const t = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType)
  t.colorSpace = NoColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.magFilter = LinearFilter
  t.minFilter = LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

// One leaflet: broad at the base, drawn to a point, with a midrib and side veins. Tone only; the plant gives the colour.
function leaflet(g: CanvasRenderingContext2D, x: number, y: number, len: number, wide: number, angle: number, tone: number): void {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  const body = () => {
    g.beginPath()
    g.moveTo(0, 0)
    g.bezierCurveTo(wide * 0.95, -len * 0.08, wide * 0.9, -len * 0.62, 0, -len)
    g.bezierCurveTo(-wide * 0.9, -len * 0.62, -wide * 0.95, -len * 0.08, 0, 0)
    g.closePath()
  }
  const grad = g.createLinearGradient(-wide, 0, wide, 0)
  const l = (v: number) => `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)})`
  grad.addColorStop(0, l(tone * 0.84))
  grad.addColorStop(0.46, l(tone * 0.99))
  grad.addColorStop(0.54, l(tone * 0.92))
  grad.addColorStop(1, l(tone * 0.8))
  body()
  g.fillStyle = grad
  g.fill()
  g.save()
  body()
  g.clip()
  g.strokeStyle = 'rgba(255,255,255,0.32)'
  g.lineWidth = Math.max(1, wide * 0.05)
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, -len)
  for (let k = 1; k <= 5; k++) {
    const t = k / 6
    for (const s of [-1, 1]) {
      g.moveTo(0, -len * t)
      g.quadraticCurveTo(s * wide * 0.45, -len * (t + 0.1), s * wide * 0.95, -len * (t + 0.26))
    }
  }
  g.stroke()
  // The surface between the veins is quilted: a little shade below each one.
  g.strokeStyle = 'rgba(0,0,0,0.1)'
  g.lineWidth = Math.max(1, wide * 0.09)
  g.beginPath()
  for (let k = 1; k <= 5; k++) {
    const t = k / 6 - 0.045
    for (const s of [-1, 1]) {
      g.moveTo(s * wide * 0.1, -len * t)
      g.quadraticCurveTo(s * wide * 0.45, -len * (t + 0.1), s * wide * 0.95, -len * (t + 0.26))
    }
  }
  g.stroke()
  g.restore()
  g.restore()
}

// A potato leaf: a terminal leaflet and three pairs along the stalk, with small ones between. Stalk at the bottom centre.
export function leafTexture(): DataTexture {
  const S = 256
  const [c, g] = canvas(S, S)
  const r = rng(71)
  g.strokeStyle = 'rgb(150,150,150)'
  g.lineWidth = 5
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(S / 2, S - 2)
  g.lineTo(S / 2, 70)
  g.stroke()
  const pairs: [number, number, number][] = [[226, 58, 36], [172, 70, 42], [116, 76, 44]]
  for (const [y, len, wide] of pairs) {
    for (const s of [-1, 1]) {
      // small leaflets between the pairs
      leaflet(g, S / 2, y + 28, 26, 15, s * 1.45, 0.82 + r() * 0.1)
      leaflet(g, S / 2, y, len * 1.3, wide * 0.8, s * (1.2 + r() * 0.14), 0.84 + r() * 0.14)
    }
  }
  leaflet(g, S / 2, 88, 88, 50, 0, 0.98)
  return cutout(c)
}

// A potato flower: five joined petals round a yellow cone.
export function flowerTexture(): DataTexture {
  const S = 64
  const [c, g] = canvas(S, S)
  g.translate(S / 2, S / 2)
  g.fillStyle = '#ffffff'
  g.beginPath()
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rad = k % 2 ? 22 : 30
    if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad)
    else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
  }
  g.closePath()
  g.fill()
  g.strokeStyle = 'rgba(190,180,205,0.55)'
  g.lineWidth = 1.5
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(Math.cos(a) * 27, Math.sin(a) * 27)
    g.stroke()
  }
  g.fillStyle = '#f0c63e'
  g.beginPath()
  g.arc(0, 0, 8.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#d99a26'
  g.beginPath()
  g.arc(0, 0, 4, 0, Math.PI * 2)
  g.fill()
  return cutout(c)
}

// A spray of hardwood leaves for the crowns of birch and maple.
export function sprayTexture(): DataTexture {
  const S = 128
  const [c, g] = canvas(S, S)
  const r = rng(19)
  for (let k = 0; k < 110; k++) {
    const x = 10 + r() * (S - 20), y = 10 + r() * (S - 20), a = r() * Math.PI * 2, s = 5 + r() * 5
    const v = Math.round(255 * (0.62 + r() * 0.38))
    g.save()
    g.translate(x, y)
    g.rotate(a)
    g.fillStyle = `rgb(${v},${v},${v})`
    g.beginPath()
    g.moveTo(0, -s)
    g.quadraticCurveTo(s * 0.75, -s * 0.2, 0, s)
    g.quadraticCurveTo(-s * 0.75, -s * 0.2, 0, -s)
    g.fill()
    g.restore()
  }
  return cutout(c)
}

// A soft round puff for smoke, dust, spray and exhaust.
export function puffTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128)
  const r = rng(5)
  for (let i = 0; i < 16; i++) {
    const x = 64 + (r() - 0.5) * 38, y = 64 + (r() - 0.5) * 38, rad = 20 + r() * 26
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, 'rgba(255,255,255,0.3)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  return tex(c, false)
}

// Painted boards with a little weathering; tinted by the material colour. Clapboards run across, barn boards up and down.
export function boardsTexture(horizontal: boolean, seed: number): CanvasTexture {
  const [c, g] = canvas(256, 256)
  const r = rng(seed)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.05})`
    g.fillRect(r() * 256, r() * 256, horizontal ? 10 + r() * 40 : 2, horizontal ? 2 : 10 + r() * 50)
  }
  for (let k = 0; k < 16; k++) {
    const v = 0.9 + r() * 0.1
    g.fillStyle = `rgba(0,0,0,${1 - v})`
    if (horizontal) g.fillRect(0, k * 16, 256, 13)
    else g.fillRect(k * 16, 0, 14, 256)
    g.fillStyle = 'rgba(0,0,0,0.34)'
    if (horizontal) g.fillRect(0, k * 16 + 13, 256, 3)
    else g.fillRect(k * 16 + 14, 0, 2, 256)
  }
  return tex(c, true)
}

export function shingleTexture(): CanvasTexture {
  const [c, g] = canvas(256, 256)
  const r = rng(3)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 256)
  for (let row = 0; row < 16; row++) {
    const off = (row % 2) * 8
    for (let k = -1; k < 17; k++) {
      const v = 0.74 + r() * 0.26
      g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)})`
      g.fillRect(k * 16 + off, row * 16, 15, 15)
    }
    g.fillStyle = 'rgba(0,0,0,0.36)'
    g.fillRect(0, row * 16 + 13, 256, 3)
  }
  return tex(c, true)
}

// A dirt road: two wheel tracks worn pale, grass down the middle, soft at the edges. Runs along v, repeats along it.
export function roadTexture(): CanvasTexture {
  const W = 128, H = 256
  const [c, g] = canvas(W, H)
  const r = rng(23)
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), o = (y * W + x) * 4
      const edge = Math.min(u, 1 - u)
      const track = Math.max(Math.exp(-(((u - 0.3) / 0.11) ** 2)), Math.exp(-(((u - 0.7) / 0.11) ** 2)))
      const n = hash2(x * 3 + 1, y * 5 + 2) * 0.5 + tile((x / W) * 8, (y / H) * 16, 16, 9) * 0.5
      const wear = Math.max(0, Math.min(1, track * 1.15 - 0.2 + (n - 0.5) * 0.5))
      const v = 0.58 + 0.42 * wear + (r() - 0.5) * 0.08
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(255 * Math.max(0, Math.min(1, v)))
      const a = Math.min(1, edge / 0.14) * (0.45 + 0.55 * Math.max(wear, 0.3 + 0.7 * Math.min(1, edge / 0.3)))
      img.data[o + 3] = Math.round(255 * Math.max(0, Math.min(1, a - (n - 0.5) * 0.25 * (1 - wear))))
    }
  }
  g.putImageData(img, 0, 0)
  const t = tex(c, false)
  t.wrapT = RepeatWrapping
  return t
}

// A ring of light for the ground under a selected field's corner or a working unit.
export function ringTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128)
  const grad = g.createRadialGradient(64, 64, 34, 64, 64, 62)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.0)')
  grad.addColorStop(0.72, 'rgba(255,255,255,1)')
  grad.addColorStop(0.86, 'rgba(255,255,255,0.9)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return tex(c, false)
}
