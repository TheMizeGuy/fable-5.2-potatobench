// The interface is drawn for a window of about 1600 by 900 CSS pixels. On a larger one it is scaled up whole (CSS
// zoom on the interface's root), so its words and keys keep their share of the screen and stay readable on a big
// monitor. Under zoom the browser gives rectangles (getBoundingClientRect), the window's size and the pointer in
// screen pixels, while an element's offset sizes and every length written to its style are in the scaled interface's
// own pixels: `toScreen` and `toLocal` turn one into the other where the two meet.
export type ScalePref = 'auto' | '1' | '1.25' | '1.5' | '1.75' | '2'

const BASE_W = 1600, BASE_H = 900
let z = 1

// The browsers whose zoom follows the standard (rectangles in screen pixels, offsets in the element's own): the ones
// that also say what an element's zoom is.
const standard = (): boolean => typeof Element !== 'undefined' && 'currentCSSZoom' in Element.prototype && typeof CSS !== 'undefined' && CSS.supports('zoom', '1.5')

// The scale a window of this size takes: by quarters, never under 1, and never so large that the interface is left
// less room than it was drawn for at its full layout (1440 by 860 of its own pixels), since the stylesheets' rules for
// small windows go by the real window and would not come into play.
export function fitScale(w: number, h: number, pref: ScalePref = 'auto'): number {
  const most = Math.max(1, Math.min(2, Math.floor(Math.min(w / 1440, h / 860) * 4) / 4))
  if (pref !== 'auto') return Math.min(Number(pref), most)
  const fit = Math.round(Math.min(w / BASE_W, h / BASE_H) * 4) / 4
  return Math.max(1, Math.min(fit, most))
}

export function uiScale(): number { return z }
// A size in the interface's own pixels (an offset width, a constant of the design), as screen pixels.
export function toScreen(n: number): number { return n * z }
// Screen pixels (a rectangle's edge, the pointer, a point of the land) as a length to write inside the interface.
export function toLocal(n: number): number { return n / z }
// The window as the interface sees it.
export function localWidth(): number { return innerWidth / z }
export function localHeight(): number { return innerHeight / z }

// Sets the scale on the page, and again whenever the window or the player's choice changes.
export function mountScale(pref: () => ScalePref, onChange: () => void): () => void {
  const root = document.documentElement
  const apply = (): void => {
    const next = standard() ? fitScale(innerWidth, innerHeight, pref()) : 1
    if (next === z && root.style.getPropertyValue('--z')) return
    z = next
    root.style.setProperty('--z', String(z))
    // Viewport units are not scaled with the interface: where it is zoomed they are given in its own pixels.
    if (z > 1) { root.style.setProperty('--vw', `${innerWidth / z / 100}px`); root.style.setProperty('--vh', `${innerHeight / z / 100}px`) }
    else { root.style.removeProperty('--vw'); root.style.removeProperty('--vh') }
    root.classList.toggle('scaled', z > 1)
    onChange()
  }
  const sized = (): void => {
    if (z > 1) { root.style.setProperty('--vw', `${innerWidth / z / 100}px`); root.style.setProperty('--vh', `${innerHeight / z / 100}px`) }
    apply()
  }
  addEventListener('resize', sized)
  apply()
  return apply
}
