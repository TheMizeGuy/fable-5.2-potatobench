// When WebGL cannot start: a flat drawing of the six fields, so the game can still be read and played.
import type { App } from '../game/app.ts'
import type { FieldView } from '../game/contracts.ts'
import { COLS, FIELD_COUNT, HILLS, ROWS } from '../sim/index.ts'
import { snapshot, type Snapshot } from './state.ts'

const SOIL: Record<string, string> = {
  'standing water': '#3f2e23', wet: '#4a3528', good: '#614634', drying: '#6d5039', dry: '#7a5a43', wilting: '#8c6c52',
}

export function createFallbackView(original: HTMLCanvasElement, app: App): FieldView {
  let canvas = original
  let g = canvas.getContext('2d')
  if (!g) {
    // The canvas already holds a failed WebGL context; draw on a fresh one in its place.
    const fresh = document.createElement('canvas')
    fresh.id = original.id
    for (const a of ['aria-label', 'class']) { const v = original.getAttribute(a); if (v) fresh.setAttribute(a, v) }
    original.replaceWith(fresh)
    canvas = fresh
    g = canvas.getContext('2d')
  }
  const ctx = g
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:manipulation'
  let rects: { x: number; y: number; w: number; h: number }[] = []
  let snap: Snapshot = snapshot(app)
  let dirty = true
  let dpr = 1

  function layout(): void {
    const W = canvas.clientWidth || innerWidth, H = canvas.clientHeight || innerHeight
    dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const i = app.insets
    const aw = Math.max(120, W - i.left - i.right), ah = Math.max(120, H - i.top - i.bottom)
    const gap = Math.min(aw, ah) * 0.03
    const fw = Math.min((aw - gap * 3) / 2, ((ah - gap * 4) / 3) * (COLS / ROWS) * 0.9)
    const fh = (fw * ROWS) / COLS / 0.9
    const x0 = i.left + (aw - (fw * 2 + gap)) / 2, y0 = i.top + (ah - (fh * 3 + gap * 2)) / 2
    rects = []
    for (let k = 0; k < FIELD_COUNT; k++) rects.push({ x: x0 + (k % 2) * (fw + gap), y: y0 + Math.floor(k / 2) * (fh + gap), w: fw, h: fh })
    dirty = true
  }

  function draw(): void {
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const W = canvas.width / dpr, H = canvas.height / dpr
    const winter = snap.mode === 'cellar'
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, winter ? '#9fb0bd' : '#a7c4d8')
    grad.addColorStop(1, winter ? '#dde1e1' : '#e9eee6')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    rects.forEach((r, i) => {
      const f = snap.fields[i]
      ctx.fillStyle = winter ? '#e4e8ea' : f.crop === 'rest' ? '#5f7f3d' : SOIL[f.moisture] ?? SOIL.good
      ctx.fillRect(r.x, r.y, r.w, r.h)
      if (!winter && f.crop === 'potato') {
        const cw = r.w / COLS, ch = r.h / ROWS
        for (let h = 0; h < HILLS; h++) {
          const look = f.hills[h]
          const cx = r.x + ((h % COLS) + 0.5) * cw, cy = r.y + (Math.floor(h / COLS) + 0.5) * ch
          if (look.kind === 'plant' || look.kind === 'dead') {
            ctx.fillStyle = look.kind === 'dead' ? '#6e5f4a' : look.blight > 0.05 ? '#4b3324' : look.yellow > 0.4 ? '#8f9a4a' : look.stunted ? '#a9bd72' : '#3f7d48'
            ctx.beginPath()
            ctx.arc(cx, cy, Math.max(1.5, (0.15 + 0.4 * look.canopy) * Math.min(cw, ch)), 0, Math.PI * 2)
            ctx.fill()
            if (f.bloom > 0.3 && look.kind === 'plant') {
              ctx.fillStyle = '#f2ecf7'
              ctx.fillRect(cx - 1, cy - 1, 2, 2)
            }
          } else if (look.kind === 'seed' || look.kind === 'dug') {
            ctx.fillStyle = look.kind === 'dug' ? '#3a2a20' : '#544030'
            ctx.fillRect(cx - cw * 0.35, cy - 1, cw * 0.7, 2)
          }
        }
      }
      if (app.selected === i) {
        ctx.strokeStyle = '#f3ecdc'
        ctx.lineWidth = 3
        ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6)
      }
    })
    dirty = false
  }

  const onClick = (e: MouseEvent) => {
    const b = canvas.getBoundingClientRect()
    const x = e.clientX - b.left, y = e.clientY - b.top
    app.select(rects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h))
  }
  canvas.addEventListener('click', onClick)
  const off = app.on(e => {
    if (e.type === 'insets') layout()
    else if (e.type !== 'saved' && e.type !== 'speed') { snap = snapshot(app); dirty = true }
  })
  layout()

  return {
    resize: layout,
    frame() {
      if (dirty && !document.hidden) draw()
    },
    fieldAnchor(i) {
      const r = rects[i]
      return r ? { x: r.x + r.w / 2, y: r.y, visible: true } : { x: 0, y: 0, visible: false }
    },
    dispose() {
      off()
      canvas.removeEventListener('click', onClick)
    },
  }
}
