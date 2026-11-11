// When WebGL cannot start: a flat drawing of the six fields, so the game can still be read and played.
import type { App } from '../game/app.ts'
import type { FieldView } from '../game/contracts.ts'
import { COLS, FIELD_COUNT, HILLS, ROWS } from '../sim/index.ts'
import { snapshot, type Snapshot } from './state.ts'

const SOIL: Record<string, string> = {
  'standing water': '#4c3024', wet: '#59382a', good: '#774a37', drying: '#84543d', dry: '#925d44', wilting: '#9d6b54',
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
  let rings: { field: number; until: number }[] = []

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
    const now = performance.now()
    rings = rings.filter(r => r.until > now)
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
            ctx.fillStyle = look.kind === 'dead' ? '#8a7a5c' : look.blight > 0.05 ? '#4b3324' : look.yellow > 0.4 ? '#8f9a4a' : look.stunted ? '#a9bd72' : '#3f7d48'
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
      const selected = app.selection.includes(i), ringing = rings.some(q => q.field === i)
      if (selected || app.hover === i || ringing) {
        ctx.strokeStyle = '#f3ecdc'
        ctx.globalAlpha = selected || ringing ? 1 : 0.5
        ctx.lineWidth = ringing ? 5 : selected ? 3 : 2
        ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6)
        ctx.globalAlpha = 1
      }
    })
    dirty = rings.length > 0
  }

  const at = (e: MouseEvent): number => {
    const b = canvas.getBoundingClientRect()
    const x = e.clientX - b.left, y = e.clientY - b.top
    return rects.findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  }
  const onClick = (e: MouseEvent) => { const i = at(e); app.select(i, i >= 0 && e.shiftKey) }
  const onDouble = (e: MouseEvent) => { const i = at(e); if (i >= 0) app.selectLike(i) }
  const onMenu = (e: MouseEvent) => { e.preventDefault(); const i = at(e); if (i >= 0) app.smartOrder(i) }
  const onMove = (e: MouseEvent) => app.setHover(at(e))
  const onLeave = () => app.setHover(-1)
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('dblclick', onDouble)
  canvas.addEventListener('contextmenu', onMenu)
  canvas.addEventListener('mousemove', onMove)
  canvas.addEventListener('mouseleave', onLeave)
  const off = app.on(e => {
    if (e.type === 'insets') layout()
    else if (e.type === 'order') { for (const f of e.fields) rings.push({ field: f, until: performance.now() + 700 }); dirty = true }
    else if (e.type !== 'saved' && e.type !== 'speed') { snap = snapshot(app); dirty = true }
  })
  layout()

  return {
    ready: Promise.resolve(),
    quality: () => ({ tier: 'flat', fps: 0 }),
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
      canvas.removeEventListener('dblclick', onDouble)
      canvas.removeEventListener('contextmenu', onMenu)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    },
  }
}
