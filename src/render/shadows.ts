// The sun and its shadow in three cascades: a fine one round what the camera looks at, a wider one, and one for the
// country beyond. The first light carries the sunlight; the other two carry no light, only their shadow maps, which
// the shared lighting code in shaders.ts reads.
import { DirectionalLight, Matrix4, Vector3, type Color, type Scene } from 'three'
import { U } from './shaders.ts'

const UP = new Vector3(0, 1, 0), ORIGIN = new Vector3()

export class SunShadows {
  readonly lights: DirectionalLight[] = []
  private radius = [40, 130, 480]
  private basis = new Matrix4()
  private right = new Vector3()
  private up = new Vector3()
  private c = new Vector3()
  private frame = 0
  // True while the first cascade is wide enough to hold the whole farm.
  holdsFarm = false
  // The fine cascade is redrawn every frame, or every other on a slow machine.
  nearEvery = 1

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

  // focus: the point on the ground the camera looks at; dist: how far the camera is from it.
  update(sunDir: Vector3, color: Color, focus: Vector3, dist: number, all: boolean): void {
    this.lights[0].color.copy(color)
    this.frame++
    // Steps of radius, so zooming does not make every shadow crawl.
    const r0 = Math.min(66, Math.max(10, 10 * Math.pow(1.3, Math.round(Math.log(dist * 0.64 / 10) / Math.log(1.3)))))
    this.radius[0] = r0
    this.radius[1] = Math.min(230, r0 * 3.4)
    this.radius[2] = Math.min(820, this.radius[1] * 3.6)
    this.holdsFarm = r0 > 44
    this.basis.lookAt(sunDir, ORIGIN, UP)
    this.right.setFromMatrixColumn(this.basis, 0)
    this.up.setFromMatrixColumn(this.basis, 1)
    for (let k = 0; k < 3; k++) {
      const l = this.lights[k], sh = l.shadow
      const due = all || (k === 0 && this.frame % this.nearEvery === 0) || (k === 1 && this.frame % 2 === 0) || (k === 2 && this.frame % 6 === 3)
      if (k === 0) sh.autoUpdate = this.nearEvery <= 1
      if (!due) continue
      if (!sh.autoUpdate) sh.needsUpdate = true
      const r = this.radius[k], texel = (2 * r) / sh.mapSize.x
      // Snap to the map's own grid, so shadows hold still as the camera pans.
      const cx = Math.round(focus.dot(this.right) / texel) * texel, cy = Math.round(focus.dot(this.up) / texel) * texel
      this.c.copy(focus).addScaledVector(this.right, cx - focus.dot(this.right)).addScaledVector(this.up, cy - focus.dot(this.up))
      const back = k === 0 ? 160 : k === 1 ? 320 : 700
      l.target.position.copy(this.c)
      l.position.copy(this.c).addScaledVector(sunDir, back)
      l.target.updateMatrixWorld()
      l.updateMatrixWorld()
      const cam = sh.camera
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r
      cam.near = 1
      cam.far = back * 2 + r
      cam.updateProjectionMatrix()
      sh.bias = -0.00012 - 0.00005 * k
      sh.normalBias = texel * (k === 0 ? 1.1 : 1.6)
    }
    U.uShadowFade.value.set(dist + this.radius[2] * 0.62, dist + this.radius[2] * 0.9)
  }

  dispose(): void {
    for (const l of this.lights) { l.shadow.map?.dispose(); l.dispose() }
  }
}
