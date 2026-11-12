// The sun and its shadow in three cascades: a fine one round what the camera looks at, a wider one, and one for the
// country beyond. The first light carries the sunlight; the other two carry no light, only their shadow maps, which
// the shared lighting code in shaders.ts reads.
// Sizes are metres. From the field tier the fine cascade holds the field in hand at about a hand's breadth to the
// texel, so a person throws a shadow; the second holds the fields beyond and the edge of the woods; the third the
// back country, where a wood shades as a mass.
import { DirectionalLight, Matrix4, Vector3, type Color, type Scene } from 'three'
import { clamp } from './noise.ts'
import { U } from './shaders.ts'

const UP = new Vector3(0, 1, 0), ORIGIN = new Vector3()
// How far ahead of the point looked at each cascade is centred, as a share of its radius: the picture shows far more
// ground beyond that point than before it.
const LEAD = [0.2, 0.42, 0.5]

export class SunShadows {
  readonly lights: DirectionalLight[] = []
  private radius = [160, 560, 2000]
  private basis = new Matrix4()
  private right = new Vector3()
  private up = new Vector3()
  private c = new Vector3()
  private frame = 0
  // True while the first cascade is wide enough to hold a whole field: the plants then need throw no shadow into the second.
  holdsFarm = false
  // How often each cascade is redrawn, in frames (the quality setting's): the fine one every frame or every other, the
  // wider ones less often. They are redrawn on different frames, so no frame carries all three.
  every: [number, number, number] = [1, 2, 6]
  // A tool may hold a cascade as it is (never redrawn), to see what redrawing it costs.
  held = [false, false, false]

  constructor(scene: Scene) {
    for (let k = 0; k < 3; k++) {
      const l = new DirectionalLight(0xffffff, k === 0 ? 1 : 0)
      l.castShadow = true
      l.shadow.mapSize.set(2048, 2048)
      l.shadow.radius = k === 0 ? 1.6 : 1.3
      l.shadow.autoUpdate = k === 0
      // Only what is flagged for a cascade is drawn into it: layer 3 for the fine one round the camera's focus, 1 and 2 for
      // the wider ones.
      l.shadow.camera.layers.set(k === 0 ? 3 : k)
      scene.add(l, l.target)
      this.lights.push(l)
    }
  }

  setSizes(sizes: [number, number, number]): void {
    this.lights.forEach((l, k) => {
      if (l.shadow.mapSize.x === sizes[k]) return
      l.shadow.mapSize.set(sizes[k], sizes[k])
      l.shadow.needsUpdate = true
    })
  }

  // focus: the point on the ground the picture is looking at; dist: how far the camera is from it; aheadX, aheadZ: the
  // way the camera looks, on the ground. all: redraw every cascade now (a still picture).
  update(sunDir: Vector3, color: Color, focus: Vector3, dist: number, all: boolean, aheadX = 0, aheadZ = 0): void {
    this.lights[0].color.copy(color)
    this.frame++
    // Steps of radius, so zooming does not make every shadow crawl.
    const r0 = clamp(12 * Math.pow(1.3, Math.round(Math.log(Math.max(dist, 1) * 0.46 / 12) / Math.log(1.3))), 12, 420)
    this.radius[0] = r0
    this.radius[1] = clamp(r0 * 3.4, 150, 1500)
    this.radius[2] = clamp(this.radius[1] * 3.6, 900, 4500)
    this.holdsFarm = r0 >= 110
    this.basis.lookAt(sunDir, ORIGIN, UP)
    this.right.setFromMatrixColumn(this.basis, 0)
    this.up.setFromMatrixColumn(this.basis, 1)
    // A low sun lays the cascade out along the ground: the light must stand far enough back to hold all of it.
    const slope = Math.max(sunDir.y / Math.max(Math.hypot(sunDir.x, sunDir.z), 1e-3), 0.16)
    for (let k = 0; k < 3; k++) {
      const l = this.lights[k], sh = l.shadow
      const n = Math.max(1, this.every[k])
      const due = !this.held[k] && (all || this.frame % n === (k * 3) % n)
      if (k === 0) sh.autoUpdate = n <= 1 && !this.held[0]
      if (!due) continue
      if (!sh.autoUpdate) sh.needsUpdate = true
      const r = this.radius[k], texel = (2 * r) / sh.mapSize.x
      this.c.set(focus.x + aheadX * r * LEAD[k], focus.y, focus.z + aheadZ * r * LEAD[k])
      // Snap to the map's own grid, so shadows hold still as the camera pans.
      const px = this.c.dot(this.right), py = this.c.dot(this.up)
      this.c.addScaledVector(this.right, Math.round(px / texel) * texel - px).addScaledVector(this.up, Math.round(py / texel) * texel - py)
      const back = Math.min(r / slope, 6500) + 140
      l.target.position.copy(this.c)
      l.position.copy(this.c).addScaledVector(sunDir, back)
      l.target.updateMatrixWorld()
      l.updateMatrixWorld()
      const cam = sh.camera
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r
      cam.near = 1
      cam.far = back * 2
      cam.updateProjectionMatrix()
      // The ground lies nearly along a low sun's light, so from one texel to the next its depth in the map changes by
      // texel over slope: the bias is a share of that, in metres, whatever the map's own depth.
      sh.bias = -(0.02 + 0.32 * texel / slope) / (cam.far - cam.near)
      sh.normalBias = texel * (k === 0 ? 1.1 : 1.6)
    }
    U.uShadowFade.value.set(dist + this.radius[2] * 0.7, dist + this.radius[2] * 0.95)
  }

  dispose(): void {
    for (const l of this.lights) { l.shadow.map?.dispose(); l.dispose() }
  }
}
