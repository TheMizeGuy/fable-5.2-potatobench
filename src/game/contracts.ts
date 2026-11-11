// The seams between the app, the field view and the interface. Each side depends only on these.
import type { App } from './app.ts'

// The field view draws the land and owns the pointer on the canvas and the camera keys:
//   click a field: app.select(i); with Shift held: app.select(i, true); on empty ground: app.select(-1)
//   double-click a field: app.selectLike(i); on empty ground: frame the whole farm
//   right-click or long-press a field: app.smartOrder(i)
//   pointer over a field: app.setHover(i)
//   drag: pan; wheel or pinch: zoom toward the pointer; right-drag, two-finger twist, Q and E: turn; arrow keys: pan; Home: whole farm
// It draws the selection (app.selection), the hover (app.hover) and a ring on the fields of an 'order' app event,
// and moves the camera to a field on a 'focus' app event. Every other key belongs to the interface.
export interface FieldView {
  // Settles once the first frame can be drawn.
  ready: Promise<void>
  resize(): void
  // Called every animation frame with the milliseconds since the last one.
  frame(dtMs: number): void
  // Where a field's plate should sit: the top centre of the field, in CSS pixels relative to the canvas.
  fieldAnchor(field: number): { x: number; y: number; visible: boolean }
  // Settles once the land has shown a test dig's hill lifted, or the last row of a day's digging come out
  // (at once when there is nothing to show), so the paper result can arrive after the land has shown it.
  whenShown(kind: 'sample' | 'dig', field: number): Promise<void>
  // The quality tier in use and the frame rate measured, for the settings screen.
  quality(): { tier: 'high' | 'medium' | 'low' | 'flat'; fps: number }
  dispose(): void
}

export interface Hud {
  frame(dtMs: number): void
  dispose(): void
}

export interface Sound {
  frame(dtMs: number): void
  dispose(): void
}

export type CreateFieldView = (canvas: HTMLCanvasElement, app: App) => FieldView
export type MountHud = (root: HTMLElement, app: App, view: FieldView) => Hud
export type CreateSound = (app: App) => Sound
