// The game's own word over what the pointer rests on. A control's title is taken off it while the pointer is there
// (so the browser's grey box never shows) and said on a slip of the game's paper instead; it goes back when the
// pointer leaves, so a title is still what the page and a screen reader hold.
import { h } from './dom.ts'
import './tip.css'
import { toLocal, toScreen } from './scale.ts'

export function mountTips(root: HTMLElement): () => void {
  const tip = h('div', { class: 'game-tip sys', role: 'presentation', hidden: true })
  // (on the page itself: the interface's root is rebuilt under it)
  document.body.append(tip)
  let held: HTMLElement | null = null
  let timer = 0
  let at = { x: 0, y: 0 }

  const put = () => {
    const w = toScreen(tip.offsetWidth), hh = toScreen(tip.offsetHeight)
    const x = Math.max(8, Math.min(innerWidth - w - 8, at.x + 14))
    const y = at.y + 22 + hh > innerHeight - 8 ? at.y - hh - 12 : at.y + 22
    tip.style.transform = `translate3d(${Math.round(toLocal(x))}px, ${Math.round(toLocal(Math.max(8, y)))}px, 0)`
  }
  const drop = () => {
    clearTimeout(timer)
    tip.hidden = true
    if (held) { if (held.dataset.tip !== undefined && !held.hasAttribute('title')) held.setAttribute('title', held.dataset.tip); delete held.dataset.tip }
    held = null
  }
  const take = (el: HTMLElement) => {
    if (el === held) { if (el.hasAttribute('title')) { el.dataset.tip = el.getAttribute('title') ?? ''; el.removeAttribute('title'); if (!tip.hidden) tip.textContent = el.dataset.tip } return }
    drop()
    held = el
    el.dataset.tip = el.getAttribute('title') ?? ''
    el.removeAttribute('title')
    const text = el.dataset.tip
    if (!text) return
    timer = window.setTimeout(() => { tip.textContent = text; tip.hidden = false; put() }, 350)
  }
  const over = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    at = { x: e.clientX, y: e.clientY }
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[title], [data-tip]') : null
    if (t && root.contains(t)) take(t)
    else if (held) drop()
    if (!tip.hidden) put()
  }
  const away = () => drop()
  document.addEventListener('pointermove', over, true)
  document.addEventListener('pointerdown', away, true)
  document.addEventListener('keydown', away, true)
  document.addEventListener('wheel', away, { capture: true, passive: true })
  window.addEventListener('blur', away)
  return () => {
    drop()
    document.removeEventListener('pointermove', over, true)
    document.removeEventListener('pointerdown', away, true)
    document.removeEventListener('keydown', away, true)
    document.removeEventListener('wheel', away, true)
    window.removeEventListener('blur', away)
    tip.remove()
  }
}
