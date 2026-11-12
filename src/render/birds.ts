// Birds: crows that circle high over the fields, flap and glide, and swallows hawking low over the crop and the brook
// in the evening. They sit out rain, snow and the night.
import { BufferAttribute, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial } from 'three'
import { FARM_CENTER } from './layout.ts'
import { rng } from './noise.ts'

export class Birds {
  readonly mesh: Mesh
  private u = { uTime: { value: 0 }, uTint: { value: new Color() } }
  private geo: InstancedBufferGeometry
  private mat: ShaderMaterial

  constructor() {
    const r = rng(311)
    const crows = 9, swallows = 16, count = crows + swallows
    // A thin body and two swept wings; the wing tips are what beat.
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0.2, 0, 0, -0.2, 0, 0.04, -0.2, 0, -0.04,
      0.08, 0, 0, -0.06, 0, 0, -0.1, 0, 0.42,
      0.08, 0, 0, -0.1, 0, -0.42, -0.06, 0, 0,
    ]), 3))
    geo.setAttribute('aWing', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 1, 0]), 1))
    const bird = new Float32Array(count * 4), home = new Float32Array(count * 4)
    for (let k = 0; k < count; k++) {
      if (k < crows) {
        bird.set([16 + r() * 44, 11 + r() * 9, r() * 6.283, (3.2 + r() * 2.2) * (r() < 0.5 ? -1 : 1)], k * 4)
        home.set([FARM_CENTER.x, FARM_CENTER.z - 4, 1, 0.8], k * 4)
      } else {
        // Over the bottom fields and along the water, where the insects rise at the end of the day.
        bird.set([5 + r() * 9, 1.4 + r() * 2.6, r() * 6.283, (8 + r() * 4) * (r() < 0.5 ? -1 : 1)], k * 4)
        home.set([-14 + r() * 34, 9 + r() * 15, 0.5, 1.1], k * 4)
      }
    }
    geo.setAttribute('aBird', new InstancedBufferAttribute(bird, 4))
    geo.setAttribute('aHome', new InstancedBufferAttribute(home, 4))
    geo.instanceCount = count
    const mat = new ShaderMaterial({
      uniforms: this.u,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aWing;
        attribute vec4 aBird;   // radius of its round, height, where on it, speed
        attribute vec4 aHome;   // the middle of its round, its size, how much it rises and dips
        uniform float uTime;
        void main() {
          float a = aBird.z + uTime * aBird.w / aBird.x;
          // A swallow's round is a figure of eight; a crow's an oval.
          float small = step(aHome.z, 0.75);
          vec2 on = vec2(cos(a), sin(a * (1.0 + small)) * 0.62);
          vec2 fwd = normalize(vec2(-sin(a), cos(a * (1.0 + small)) * 0.62 * (1.0 + small))) * sign(aBird.w);
          // A few beats, then a glide.
          float beat = sin(uTime * mix(8.0, 17.0, small) + aBird.z * 7.0) * smoothstep(-0.2, 0.3, sin(uTime * mix(0.6, 1.7, small) + aBird.z * 3.0));
          vec3 p = position * aHome.z;
          p.y += aWing * (0.05 + 0.2 * beat) * aHome.z;
          vec3 at = vec3(aHome.x + on.x * aBird.x, aBird.y + sin(a * 3.0 + aBird.z) * aHome.w, aHome.y + on.y * aBird.x);
          vec3 world = at + vec3(fwd.x * p.x - fwd.y * p.z, p.y, fwd.y * p.x + fwd.x * p.z);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: 'uniform vec3 uTint;\nvoid main() {\n  gl_FragColor = vec4(uTint, 1.0);\n}',
    })
    this.geo = geo
    this.mat = mat
    this.mesh = new Mesh(geo, mat)
    this.mesh.frustumCulled = false
  }

  // clock: one that slows to a stop under reduced motion. tint: the colour of the air, which a dark bird takes a little of.
  update(clock: number, away: number, tint: Color): void {
    this.u.uTime.value = clock
    this.mesh.visible = away <= 0.15
    this.u.uTint.value.copy(tint).multiplyScalar(0.05)
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
  }
}
