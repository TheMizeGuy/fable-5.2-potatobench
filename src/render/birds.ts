// Crows over the fields: a few dark shapes that circle, flap and glide. They sit out rain and snow.
import { BufferAttribute, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2 } from 'three'
import { FARM_CENTER } from './layout.ts'
import { rng } from './noise.ts'

export class Birds {
  readonly mesh: Mesh
  private u = { uTime: { value: 0 }, uTint: { value: new Color() }, uCentre: { value: new Vector2(FARM_CENTER.x, FARM_CENTER.z - 4) } }
  private geo: InstancedBufferGeometry
  private mat: ShaderMaterial

  constructor() {
    const r = rng(311)
    const count = 9
    // A thin body and two swept wings; the wing tips are what beat.
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0.2, 0, 0, -0.2, 0, 0.04, -0.2, 0, -0.04,
      0.08, 0, 0, -0.06, 0, 0, -0.1, 0, 0.42,
      0.08, 0, 0, -0.1, 0, -0.42, -0.06, 0, 0,
    ]), 3))
    geo.setAttribute('aWing', new BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 0, 1, 0]), 1))
    const bird = new Float32Array(count * 4)
    for (let k = 0; k < count; k++) bird.set([16 + r() * 44, 11 + r() * 9, r() * 6.283, (3.2 + r() * 2.2) * (r() < 0.5 ? -1 : 1)], k * 4)
    geo.setAttribute('aBird', new InstancedBufferAttribute(bird, 4))
    geo.instanceCount = count
    const mat = new ShaderMaterial({
      uniforms: this.u,
      side: DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aWing;
        attribute vec4 aBird;   // radius of its circle, height, where on it, speed
        uniform float uTime; uniform vec2 uCentre;
        void main() {
          float a = aBird.z + uTime * aBird.w / aBird.x;
          vec2 on = vec2(cos(a), sin(a) * 0.62);
          vec2 fwd = normalize(vec2(-sin(a), cos(a) * 0.62)) * sign(aBird.w);
          // A few beats, then a glide.
          float beat = sin(uTime * 8.0 + aBird.z * 7.0) * smoothstep(-0.2, 0.3, sin(uTime * 0.6 + aBird.z * 3.0));
          vec3 p = position;
          p.y += aWing * (0.05 + 0.2 * beat);
          vec3 at = vec3(uCentre.x + on.x * aBird.x, aBird.y + sin(a * 3.0 + aBird.z) * 0.8, uCentre.y + on.y * aBird.x);
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
  update(clock: number, falling: number, tint: Color): void {
    this.u.uTime.value = clock
    this.mesh.visible = falling <= 0.15
    this.u.uTint.value.copy(tint).multiplyScalar(0.05)
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
  }
}
