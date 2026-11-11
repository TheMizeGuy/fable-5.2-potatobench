// Placeholder field view: a flat top-down drawing, enough to drive the game while the real one is built.
import type { CreateFieldView } from '../game/contracts.ts'
import { COLS, FIELD_COUNT, ROWS, hillLook } from '../sim/index.ts'

export const createFieldView: CreateFieldView = (canvas, app) => {
  const g = canvas.getContext('2d')!
  const rects: { x: number; y: number; w: number; h: number }[] = []
  function resize(): void {
    canvas.width = innerWidth
    canvas.height = innerHeight
    canvas.style.width = '100vw'
    canvas.style.height = '100vh'
    rects.length = 0
    const w = Math.min(innerWidth * 0.26, 320), h = w * 0.62
    for (let i = 0; i < FIELD_COUNT; i++) {
      rects.push({ x: innerWidth / 2 - w - 10 + (i % 2) * (w + 20), y: 110 + Math.floor(i / 2) * (h + 20), w, h })
    }
  }
  resize()
  canvas.addEventListener('click', e => {
    const k = rects.findIndex(r => e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h)
    app.select(k)
  })
  return {
    resize,
    frame() {
      g.fillStyle = '#243229'
      g.fillRect(0, 0, canvas.width, canvas.height)
      const s = app.campaign?.season
      rects.forEach((r, i) => {
        g.fillStyle = '#5b4332'
        g.fillRect(r.x, r.y, r.w, r.h)
        if (s) {
          const f = s.fields[i]
          for (let h = 0; h < ROWS * COLS; h++) {
            const look = hillLook(f, h)
            if (look.kind === 'bare' || look.kind === 'seed') continue
            const cx = r.x + ((h % COLS) + 0.5) * (r.w / COLS), cy = r.y + (Math.floor(h / COLS) + 0.5) * (r.h / ROWS)
            g.fillStyle = look.kind === 'dug' || look.kind === 'pulled' ? '#3a2a20' : look.kind === 'dead' ? '#8a7a55' : look.blight > 0.05 ? '#6b4a2a' : '#3f8a4a'
            g.beginPath()
            g.arc(cx, cy, 2 + look.canopy * (r.w / COLS) * 0.45, 0, 6.3)
            g.fill()
          }
        }
        if (app.selected === i) { g.strokeStyle = '#f0e2b8'; g.lineWidth = 3; g.strokeRect(r.x, r.y, r.w, r.h) }
      })
    },
    fieldAnchor(i) {
      const r = rects[i]
      return { x: r.x + r.w / 2, y: r.y, visible: true }
    },
    dispose() {},
  }
}
