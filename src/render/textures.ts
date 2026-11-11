// Textures painted on canvases at start-up. Nothing is downloaded.
import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three'
import { rng } from './noise.ts'

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
  t.anisotropy = 4
  return t
}

// The cut face of the block: turf, Caribou loam, subsoil, glacial till, ledge. 128 px per unit of depth.
export const STRATA_PX = 128
export function strataTexture(): CanvasTexture {
  const W = 512, H = 640
  const [c, g] = canvas(W, H)
  const r = rng(11)
  const bands: [number, string][] = [[0, '#4a4a2c'], [0.12, '#5e4331'], [0.8, '#8a6a4f'], [1.75, '#a39280'], [3.1, '#858078']]
  for (let k = 0; k < bands.length; k++) {
    const y0 = bands[k][0] * STRATA_PX, y1 = k + 1 < bands.length ? bands[k + 1][0] * STRATA_PX : H
    g.fillStyle = bands[k][1]
    g.beginPath()
    g.moveTo(0, y0)
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y0 + (k ? Math.sin(x * 0.031 + k) * 5 + (r() - 0.5) * 6 : 0))
    g.lineTo(W, y1 + 8)
    g.lineTo(0, y1 + 8)
    g.fill()
  }
  // Grain and specks.
  for (let i = 0; i < 9000; i++) {
    const x = r() * W, y = r() * H
    const l = r() < 0.5 ? 0 : 255
    g.fillStyle = `rgba(${l},${l},${l},${0.04 + r() * 0.06})`
    g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2)
  }
  // Roots in the topsoil.
  g.strokeStyle = 'rgba(40,30,20,0.35)'
  g.lineWidth = 1
  for (let i = 0; i < 60; i++) {
    let x = r() * W, y = 6 + r() * 20
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 10; y += 4 + r() * 8; g.lineTo(x, y) }
    g.stroke()
  }
  // Stones: a few in the subsoil, many in the till, blocks in the ledge.
  const stones = (n: number, y0: number, y1: number, rmin: number, rmax: number, cols: string[]) => {
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = y0 + r() * (y1 - y0), rr = rmin + r() * (rmax - rmin)
      g.fillStyle = cols[Math.floor(r() * cols.length)]
      g.beginPath()
      g.ellipse(x, y, rr * (1 + r() * 0.6), rr * (0.6 + r() * 0.3), (r() - 0.5) * 0.8, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.beginPath()
      g.ellipse(x - rr * 0.3, y - rr * 0.25, rr * 0.45, rr * 0.25, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  stones(40, 0.85 * STRATA_PX, 1.7 * STRATA_PX, 2, 5, ['#8d8273', '#9a9184', '#6f665a'])
  stones(160, 1.75 * STRATA_PX, 3.1 * STRATA_PX, 3, 11, ['#9b958c', '#7d776f', '#aaa398', '#6c675f', '#8e8170'])
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = 3.15 * STRATA_PX + r() * (H - 3.15 * STRATA_PX)
    g.fillStyle = ['#5f5a53', '#77716a', '#55514b'][i % 3]
    g.fillRect(x, y, 30 + r() * 60, 12 + r() * 20)
  }
  g.strokeStyle = 'rgba(30,28,25,0.4)'
  for (let i = 0; i < 18; i++) {
    const y = 3.2 * STRATA_PX + r() * (H - 3.2 * STRATA_PX)
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(W, y + (r() - 0.5) * 30)
    g.stroke()
  }
  return tex(c, true)
}

// A soft round puff for smoke, spray and mist.
export function puffTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128)
  const r = rng(5)
  for (let i = 0; i < 14; i++) {
    const x = 64 + (r() - 0.5) * 40, y = 64 + (r() - 0.5) * 40, rad = 20 + r() * 30
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, 'rgba(255,255,255,0.32)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  return tex(c, false)
}

// Painted clapboards with a little weathering; tinted by the material colour.
export function boardsTexture(horizontal: boolean, seed: number): CanvasTexture {
  const [c, g] = canvas(256, 256)
  const r = rng(seed)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.04})`
    g.fillRect(r() * 256, r() * 256, horizontal ? 10 + r() * 30 : 2, horizontal ? 2 : 10 + r() * 30)
  }
  g.fillStyle = 'rgba(0,0,0,0.22)'
  for (let k = 0; k < 16; k++) {
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
      const v = 0.82 + r() * 0.18
      g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)})`
      g.fillRect(k * 16 + off, row * 16, 15, 15)
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fillRect(0, row * 16 + 14, 256, 2)
  }
  return tex(c, true)
}
