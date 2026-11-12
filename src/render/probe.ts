// What a frame costs, pass by pass and part by part, timed on the GPU itself (where the browser gives timer queries).
// Off unless a tool turns it on: then every pass (and each shadow map) is a timed section, and with `parts` every part
// of the scene is one too, in the picture and in each shadow map, with the triangles and draw calls it sent.
import type { Camera, Object3D, WebGLRenderer } from 'three'

interface Open { name: string; q: WebGLQuery | null; t0: number; tris: number; calls: number; frame: number }
interface Row { gpu: number; cpu: number; tris: number; calls: number }
export interface Cost { name: string; gpu: number; cpu: number; tris: number; calls: number; share: number }

const TIME_ELAPSED = 0x88bf, GPU_DISJOINT = 0x8fbb

export class Probe {
  on = false
  private parts = false
  private gl: WebGL2RenderingContext
  private ext: unknown
  private open: Open | null = null
  private waiting: (Open & { cpu: number; dTris: number; dCalls: number })[] = []
  // Per frame: each section's cost summed (a part is drawn in more than one stretch of a pass).
  private frames = new Map<number, Map<string, Row>>()
  private frameNo = 0
  private pass = ''
  private cascades: Camera[] = []
  private tagged = new WeakSet<Object3D>()

  private renderer: WebGLRenderer

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.gl = renderer.getContext() as WebGL2RenderingContext
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2')
    const map = renderer.shadowMap, draw = map.render.bind(map)
    map.render = (lights, scene, camera) => {
      if (!this.on) { draw(lights, scene, camera); return }
      const was = this.pass
      this.sect('shadow')
      draw(lights, scene, camera)
      this.sect(was)
    }
  }

  get timed(): boolean { return !!this.ext }

  start(parts = false): void {
    this.close()
    this.on = true
    this.parts = parts
    this.frames.clear()
  }

  stop(): void {
    this.close()
    this.on = false
  }

  // The shadow cameras, so a shadow section can say which cascade it is in.
  setCascades(cams: Camera[]): void { this.cascades = cams }

  // Mark every drawn thing under `root` as belonging to the part `part` (or to the part `sub` names for it).
  tag(part: string, root: Object3D, sub?: (o: Object3D) => string | undefined): void {
    root.traverse(o => {
      const m = o as Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean }
      if (!(m.isMesh || m.isPoints || m.isLine) || this.tagged.has(o)) return
      this.tagged.add(o)
      const name = sub?.(o) ?? part
      const before = o.onBeforeRender, shadow = o.onBeforeShadow
      o.onBeforeRender = (...a) => { if (this.on) this.mark(name); before.apply(o, a) }
      o.onBeforeShadow = (...a) => {
        if (this.on) { const k = this.cascades.indexOf(a[3]); this.pass = k >= 0 ? `shadow${k}` : 'shadow'; this.mark(name) }
        shadow.apply(o, a)
      }
    })
  }

  private mark(part: string): void {
    const name = this.parts ? `${this.pass}/${part}` : this.pass
    if (this.open?.name !== name) this.begin(name)
  }

  // A new pass begins (and the one before it ends).
  sect(pass: string): void {
    if (!this.on) return
    this.pass = pass
    this.begin(pass)
  }

  private begin(name: string): void {
    this.close()
    const gl = this.gl, info = this.renderer.info.render
    let q: WebGLQuery | null = null
    if (this.ext) { q = gl.createQuery(); gl.beginQuery(TIME_ELAPSED, q!) }
    this.open = { name, q, t0: performance.now(), tris: info.triangles, calls: info.calls, frame: this.frameNo }
  }

  private close(): void {
    const o = this.open
    if (!o) return
    this.open = null
    const info = this.renderer.info.render
    if (o.q) this.gl.endQuery(TIME_ELAPSED)
    const done = { ...o, cpu: performance.now() - o.t0, dTris: info.triangles - o.tris, dCalls: info.calls - o.calls }
    if (o.q) this.waiting.push(done)
    else this.add(done.frame, done.name, 0, done.cpu, done.dTris, done.dCalls)
  }

  private add(frame: number, name: string, gpu: number, cpu: number, tris: number, calls: number): void {
    let f = this.frames.get(frame)
    if (!f) this.frames.set(frame, (f = new Map()))
    const r = f.get(name)
    if (r) { r.gpu += gpu; r.cpu += cpu; r.tris += tris; r.calls += calls } else f.set(name, { gpu, cpu, tris, calls })
  }

  // The frame is over: close what is open and gather the timings that have come back.
  endFrame(): void {
    if (!this.open && !this.waiting.length) return
    this.close()
    if (this.on) this.frameNo++
    const gl = this.gl
    if (!this.waiting.length) return
    const bad = gl.getParameter(GPU_DISJOINT)
    this.waiting = this.waiting.filter(w => {
      if (!gl.getQueryParameter(w.q!, gl.QUERY_RESULT_AVAILABLE)) return true
      // (not kept if the GPU was taken from the page meanwhile: the time then means nothing)
      if (!bad) this.add(w.frame, w.name, gl.getQueryParameter(w.q!, gl.QUERY_RESULT) / 1e6, w.cpu, w.dTris, w.dCalls)
      gl.deleteQuery(w.q!)
      return false
    })
  }

  // What has been measured since start(): for each section the typical cost when it runs (the middle one: other work
  // on the GPU only ever adds time), and the share of frames it ran in. Then the frames forgotten.
  take(): { frames: number; total: number; sum: number; rows: Cost[] } {
    const pend = new Set(this.waiting.map(w => w.frame))
    const by = new Map<string, Row[]>()
    let frames = 0
    const totals: number[] = []
    for (const [n, f] of this.frames) {
      if (n >= this.frameNo || pend.has(n)) continue
      frames++
      let sum = 0
      for (const [name, r] of f) {
        sum += r.gpu
        let list = by.get(name)
        if (!list) by.set(name, (list = []))
        list.push(r)
      }
      totals.push(sum)
      this.frames.delete(n)
    }
    const mid = (xs: number[]) => { const a = xs.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0 }
    const rows: Cost[] = [...by].map(([name, list]) => ({
      name, gpu: mid(list.map(r => r.gpu)), cpu: mid(list.map(r => r.cpu)), tris: mid(list.map(r => r.tris)), calls: mid(list.map(r => r.calls)), share: frames ? list.length / frames : 0,
    }))
    return { frames, total: rows.reduce((s, r) => s + r.gpu * r.share, 0), sum: totals.reduce((s, t) => s + t, 0), rows }
  }
}
