// The pointer on the land and the camera keys, as src/game/contracts.ts lays them down:
// drag pans, the wheel or a pinch zooms toward the pointer, right-drag or a twist or Q and E turn, arrows pan, Home frames
// the farm; a click on a crew picks it, a click on a field selects it, Shift-click adds, a double-click selects alike, a
// click on empty ground lets both go; a right-click or long press gives the field its order, to the person picked if
// there is one. A drag never selects.
import type { App } from '../game/app.ts'
import type { Thing } from '../game/contracts.ts'
import type { CameraRig, Viewport } from './camera.ts'

const LONG_PRESS_MS = 520
const DOUBLE_MS = 330

export interface Input {
  // Called every frame: held keys move the camera.
  frame(dt: number): void
  dispose(): void
}

export function attachInput(
  canvas: HTMLCanvasElement, app: App, rig: CameraRig, viewport: () => Viewport,
  pick: (x: number, y: number) => number, pickUnit: (x: number, y: number) => number, home: () => void,
  pickYard: (x: number, y: number) => number = () => 0,
  frameField: (field: number) => void = () => {},
  thingAt: (x: number, y: number) => Thing | null = () => null,
): Input {
  const pointers = new Map<number, { x: number; y: number }>()
  let downAt: { x: number; y: number; button: number; touch: boolean } | null = null
  let dragged = false
  let consumed = false
  let slop = 5
  let pressTimer = 0
  let lastClick = { t: 0, x: 0, y: 0, field: -2 }
  let pinch = { dist: 0, angle: 0, x: 0, y: 0 }
  const held = new Set<string>()

  const local = (e: { clientX: number; clientY: number }) => {
    const b = canvas.getBoundingClientRect()
    return { x: e.clientX - b.left, y: e.clientY - b.top }
  }
  const two = () => {
    const [a, b] = [...pointers.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  // What the pointer is over: a person first (the nearest within reach), then a thing, a field, a yard. Each says so
  // before the click: the hand cursor, and the interface's name and mark from app.point.
  const hover = (x: number, y: number) => {
    const unit = pickUnit(x, y)
    const thing = unit < 0 ? thingAt(x, y) : null
    const field = unit < 0 && !thing ? pick(x, y) : -1
    const yard = unit < 0 && !thing && field < 0 ? pickYard(x, y) : 0
    app.setHover(field)
    app.point({ x, y, unit, thing, field, yard })
    if (!downAt) canvas.style.cursor = unit >= 0 || thing || field >= 0 || yard ? 'var(--cur-point, pointer)' : 'var(--cur-grab, grab)'
  }
  const away = () => { app.setHover(-1); app.point(null); if (!downAt) canvas.style.cursor = 'var(--cur-grab, grab)' }

  const onDown = (e: PointerEvent) => {
    app.pressing = true
    // The player's first press on the land ends a Follow: the camera is theirs again.
    rig.idle = 0
    const p = local(e)
    pointers.set(e.pointerId, p)
    try { canvas.setPointerCapture?.(e.pointerId) } catch { /* the pointer is already gone */ }
    clearTimeout(pressTimer)
    if (pointers.size === 1) {
      const touch = e.pointerType !== 'mouse'
      downAt = { x: p.x, y: p.y, button: e.button, touch }
      dragged = false
      consumed = false
      slop = touch ? 11 : 5
      // A press takes hold of the land where it stands: whatever move it was in ends under the hand.
      rig.hold(true)
      if (touch) {
        pressTimer = window.setTimeout(() => {
          if (!downAt || dragged || pointers.size !== 1) return
          consumed = true
          const i = pick(downAt.x, downAt.y)
          if (i >= 0) { const r = app.orderAt(i); if (!r.ok) app.notice(r.err) }
        }, LONG_PRESS_MS)
      }
    } else if (pointers.size === 2) {
      pinch = two()
      dragged = true
      rig.hold(true)
    }
  }

  const onMove = (e: PointerEvent) => {
    const p = local(e)
    const was = pointers.get(e.pointerId)
    if (!was) {
      if (e.pointerType === 'mouse') hover(p.x, p.y)
      return
    }
    const vp = viewport()
    if (pointers.size >= 2) {
      pointers.set(e.pointerId, p)
      const now = two()
      if (pinch.dist > 0 && now.dist > 0) rig.zoomAt(pinch.dist / now.dist, now.x, now.y, vp)
      let turn = now.angle - pinch.angle
      if (turn > Math.PI) turn -= Math.PI * 2
      if (turn < -Math.PI) turn += Math.PI * 2
      if (Math.abs(turn) < 0.5) rig.turnBy(turn, vp)
      rig.pan(pinch.x, pinch.y, now.x, now.y, vp)
      pinch = now
      return
    }
    let from = was
    if (downAt && !dragged && Math.hypot(p.x - downAt.x, p.y - downAt.y) > slop) {
      dragged = true
      // The land is held from the point first pressed: the ground under it comes along from the first movement.
      rig.hold(true)
      from = downAt
      if (downAt.button !== 2) rig.grab(downAt.x, downAt.y, vp)
      clearTimeout(pressTimer)
      canvas.style.cursor = 'var(--cur-grabbing, grabbing)'
      if (app.hover !== -1) app.setHover(-1)
      app.point(null)
    }
    if (dragged && downAt && !consumed) {
      if (downAt.button === 2) { rig.turnBy((p.x - from.x) * 0.0062, vp); rig.leanBy((from.y - p.y) * 0.0035) }
      else rig.dragTo(p.x, p.y, vp)
    }
    pointers.set(e.pointerId, p)
  }

  const release = (e: PointerEvent, tap: boolean) => {
    const had = pointers.delete(e.pointerId)
    clearTimeout(pressTimer)
    if (pointers.size === 0) rig.hold(false)
    if (pointers.size === 1) {
      // One finger of a pinch lifted: the other carries on as a drag, and never as a tap.
      dragged = true
    }
    if (tap && had && pointers.size === 0 && downAt && !dragged && !consumed) {
      const p = local(e)
      const unit = downAt.button === 0 ? pickUnit(p.x, p.y) : -1
      const thing = downAt.button === 0 && unit < 0 ? thingAt(p.x, p.y) : null
      const i = pick(p.x, p.y)
      if (downAt.button === 2) {
        // a right-click always answers: the order given, or why not
        if (i >= 0) { const r = app.orderAt(i); if (!r.ok) app.notice(r.err) } else app.notice(app.unit >= 0 ? 'Right-click a field to send them there.' : 'Select someone first, then right-click a field to send them there.')
      } else if (unit >= 0) {
        // One thing in hand at a time: a person clicked lets the field or the yard go, and the other way about.
        app.select(-1)
        app.selectYard(0)
        app.selectUnit(unit, 'land')
        lastClick = { t: 0, x: p.x, y: p.y, field: -2 }
      } else if (thing) {
        app.select(-1)
        app.selectYard(0)
        app.selectUnit(-1)
        app.inspect(thing, p.x, p.y)
        lastClick = { t: 0, x: p.x, y: p.y, field: -2 }
      } else if (downAt.button === 0) {
        app.inspect(null)
        const now = performance.now()
        const again = now - lastClick.t < DOUBLE_MS && Math.hypot(p.x - lastClick.x, p.y - lastClick.y) < 12 && lastClick.field === i
        if (again) {
          // A double-click on a field selects every field in its state and brings it into frame.
          if (i >= 0) { app.selectLike(i); frameField(i) } else home()
          lastClick.t = 0
        } else {
          const yard = i < 0 ? pickYard(p.x, p.y) : 0
          app.select(i, i >= 0 && e.shiftKey)
          app.selectYard(yard)
          if (i < 0 && yard === 0) app.selectUnit(-1)
          // Outside the season a yard has no building bar: its name card says what stands there.
          if (yard && app.screen !== 'season') app.inspect({ kind: 'yard', k: yard, holder: -1 }, p.x, p.y)
          lastClick = { t: now, x: p.x, y: p.y, field: i }
        }
      }
    }
    if (pointers.size === 0) {
      app.pressing = false
      downAt = null
      canvas.style.cursor = app.hover >= 0 ? 'var(--cur-point, pointer)' : 'var(--cur-grab, grab)'
    }
  }
  const onUp = (e: PointerEvent) => release(e, true)
  const onCancel = (e: PointerEvent) => release(e, false)
  const onLeave = () => { if (!downAt) away() }
  const onMenu = (e: Event) => e.preventDefault()
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const p = local(e)
    const step = e.deltaY * (e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.008 : 0.0016)
    rig.zoomAt(Math.exp(Math.max(-0.8, Math.min(0.8, step))), p.x, p.y, viewport())
  }

  // Keys: only the camera's own, and never while the player is typing or a paper is open over the land.
  const mine = (e: KeyboardEvent): string => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return ''
    const t = e.target as HTMLElement | null
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], dialog, [role="dialog"], [role="menu"], [role="listbox"], [role="slider"], [role="radiogroup"], [role="tablist"]')) return ''
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home') return e.key
    if (e.key === 'q' || e.key === 'Q') return 'q'
    if (e.key === 'e' || e.key === 'E') return 'e'
    if (e.key === 'PageDown' || e.key === 'PageUp') return e.key
    return ''
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const k = mine(e)
    if (!k) return
    e.preventDefault()
    if (k === 'Home') { if (!e.repeat) home() } else held.add(k)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageDown', 'PageUp']) if (e.key === k) held.delete(k)
    if (e.key === 'q' || e.key === 'Q') held.delete('q')
    if (e.key === 'e' || e.key === 'E') held.delete('e')
  }
  const onBlur = () => held.clear()

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('contextmenu', onMenu)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  addEventListener('keydown', onKeyDown)
  addEventListener('keyup', onKeyUp)
  addEventListener('blur', onBlur)
  canvas.style.cursor = 'var(--cur-grab, grab)'

  return {
    frame(dt) {
      if (!held.size) return
      const vp = viewport()
      const x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
      const y = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0)
      if (x || y) rig.slide(x * dt, y * dt, vp)
      const turn = (held.has('e') ? 1 : 0) - (held.has('q') ? 1 : 0)
      if (turn) rig.turnBy(turn * 1.5 * dt, vp)
      const lean = (held.has('PageDown') ? 1 : 0) - (held.has('PageUp') ? 1 : 0)
      if (lean) rig.leanBy(lean * 0.9 * dt)
    },
    dispose() {
      clearTimeout(pressTimer)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('contextmenu', onMenu)
      canvas.removeEventListener('wheel', onWheel)
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      removeEventListener('blur', onBlur)
    },
  }
}
