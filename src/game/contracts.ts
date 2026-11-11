// The seams between the app, the 3D field and the interface. Each side depends only on these.
import type { App } from './app.ts'

export interface FieldView {
  resize(): void
  // Called every animation frame with the milliseconds since the last one.
  frame(dtMs: number): void
  // Where a field's label should sit, in CSS pixels relative to the canvas.
  fieldAnchor(field: number): { x: number; y: number; visible: boolean }
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
