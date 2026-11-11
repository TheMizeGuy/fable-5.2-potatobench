import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h } from './dom.ts'

// Name tags pinned over the fields on the land, hidden wherever a panel covers them.
// quiet: when it says so, only the chosen field keeps its tag, so the tags do not cover a small view of the land.
export function fieldLabels(ctx: Ctx, layer: HTMLElement, text: (i: number) => string, quiet: () => boolean = () => false): () => void {
  const app = ctx.app
  const els: HTMLElement[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const l = h('div', { class: 'field-label' })
    l.addEventListener('click', () => app.select(app.selected === i ? -1 : i))
    els.push(l)
    layer.append(l)
  }
  return () => {
    const ins = app.insets
    const only = quiet()
    for (let i = 0; i < S.FIELD_COUNT; i++) {
      const a = ctx.view.fieldAnchor(i)
      const l = els[i]
      const show = a.visible && (!only || app.selected === i) &&
        a.x > ins.left + 30 && a.x < innerWidth - ins.right - 30 && a.y > ins.top + 12 && a.y < innerHeight - ins.bottom - 12
      if (l.hidden === show) l.hidden = !show
      if (!show) continue
      const t = text(i)
      if (l.textContent !== t) l.textContent = t
      const move = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -100%)`
      if (l.style.transform !== move) l.style.transform = move
      if (l.classList.contains('on') !== (app.selected === i)) l.classList.toggle('on', app.selected === i)
    }
  }
}
