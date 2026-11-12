// The seams between the app, the field view and the interface. Each side depends only on these.
import type { App } from './app.ts'

// Something on the land that is not a field, a yard or one of the farm's own people, but looks like someone or is
// worth a name: a machine, someone at the gate or by a car, a picker, an animal. k: which of its kind; holder: the
// person who has a machine in hand, or -1.
export type ThingKind = 'tractor' | 'truck' | 'asking' | 'neighbour' | 'buyer' | 'picker' | 'cow' | 'deer'
export interface Thing { kind: ThingKind; k: number; holder: number }
// What the pointer is over on the land, in CSS pixels: a person (-1 none), a thing, a field (-1), a yard (0 none).
export interface Pointing { x: number; y: number; unit: number; thing: Thing | null; field: number; yard: number }

// The field view draws the land and owns the pointer on the canvas and the camera keys:
//   click a field or a tract: app.select(i); with Shift held: app.select(i, true); on empty ground: app.select(-1)
//   click a yard or one of its buildings: app.selectYard(yard) (-1 home, -2 Dufour); the selected yard (app.yard) is marked
//   double-click a field: app.selectLike(i) and bring it into frame; on empty ground: as Home
//   right-click or long-press a field: app.smartOrder(i)
//   pointer over a field: app.setHover(i)
//   click a person, or the tractor or truck they are on: app.selectUnit(id, 'land'); the picked person (app.unit) is marked
//   click anything else that looks like someone or is worth a name: app.inspect(thing); elsewhere: app.inspect(null)
//   pointer over the land: app.point(what is under it), and the hand cursor over anything a click answers
//   drag: pan; wheel or pinch: zoom toward the pointer; right-drag, two-finger twist, Q and E: turn; arrow keys: pan;
//   right-drag up and down, Page Up and Page Down: tip the view toward straight down and back (Home levels it);
//   Home: out a tier (the field in hand, the home farm, the whole map, and round again)
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
  // A field's four corners on the ground, in CSS pixels, going round it, for drawing its selection on the land.
  // visible: the corner is in front of the camera (it may still be off the screen).
  fieldCorners(field: number): { x: number; y: number; visible: boolean }[]
  // Where a person is on the screen (a point just above them), and where a yard's marker should sit.
  unitAnchor(unit: number): { x: number; y: number; visible: boolean }
  // The ground under a person, for a mark there.
  unitFoot(unit: number): { x: number; y: number; visible: boolean }
  // A thing on the land: where it stands on the screen (its top), and what is under a point of the screen.
  thingAnchor(thing: Thing): { x: number; y: number; visible: boolean }
  thingAt(x: number, y: number): Thing | null
  // Brings a person into the middle of the picture and keeps them there until the player moves the view; -1 lets go.
  follow(unit: number): void
  // What the Home key does: back out to the farm, and in again.
  home(): void
  yardAnchor(yard: number): { x: number; y: number; visible: boolean }
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
  // A cue by its name in the director's list, for a moment only the interface sees (the scale landing, a coupon torn).
  cue?(id: string, arg?: number): void
}

export type CreateFieldView = (canvas: HTMLCanvasElement, app: App) => FieldView
export type MountHud = (root: HTMLElement, app: App, view: FieldView, sound?: Sound) => Hud
export type CreateSound = (app: App) => Sound
