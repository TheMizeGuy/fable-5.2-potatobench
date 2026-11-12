// Soft drifting puffs: dust behind the tractor, exhaust, spray, chaff, turned earth, chimney smoke.
// They take the light of the sky and glow when the sun is behind them.
import {
  BufferAttribute, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, type Texture,
} from 'three'
import { FRAG_LIB, HAZE, SHARED, U } from './shaders.ts'

// The most puffs alive at once: machines at work in several fields lay dust, exhaust and spray by the hundred.
const CAP = 2400
const SHARE = { high: 1, medium: 0.7, low: 0.42 }
const N = 15

export class Particles {
  readonly mesh: Mesh
  private n = 0
  private most = CAP
  // Per puff: position, velocity, size, growth, age, life, colour, alpha, how far the wind takes it, how fast it goes on rising.
  private p = new Float32Array(CAP * N)
  private at: InstancedBufferAttribute
  private tint: InstancedBufferAttribute
  private geo = new InstancedBufferGeometry()
  private mat: ShaderMaterial

  constructor(tex: Texture) {
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3))
    this.geo.setIndex([0, 1, 2, 1, 3, 2])
    this.at = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4)
    this.tint = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4)
    this.at.setUsage(DynamicDrawUsage)
    this.tint.setUsage(DynamicDrawUsage)
    this.geo.setAttribute('aAt', this.at)
    this.geo.setAttribute('aTint', this.tint)
    this.geo.instanceCount = 0
    this.mat = new ShaderMaterial({
      uniforms: { ...U, uMap: { value: tex } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        ${SHARED}
        attribute vec4 aAt;
        attribute vec4 aTint;
        varying vec4 vTint;
        varying vec2 vUv;
        void main() {
          vTint = aTint;
          vUv = position.xy * 0.5 + 0.5;
          vWorld = aAt.xyz;
          vec4 mv = viewMatrix * vec4(aAt.xyz, 1.0);
          mv.xy += position.xy * aAt.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${SHARED}
        ${FRAG_LIB}
        uniform sampler2D uMap;
        varying vec4 vTint;
        varying vec2 vUv;
        void main() {
          float a = texture2D(uMap, vUv).a * vTint.a;
          if (a < 0.004) discard;
          vec3 dir = normalize(vWorld - cameraPosition);
          float through = pow(max(dot(dir, uSunDir), 0.0), 3.0);
          vec3 lit = skyIrradiance(vec3(0.0, 1.0, 0.0)) * 0.3 + uSunCol * (0.11 + 0.6 * through) * cloudShade(vWorld);
          gl_FragColor = vec4(vTint.rgb * lit, a);
          ${HAZE}
        }`,
    })
    this.mesh = new Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 8
  }

  // drift: how much of the wind the puff takes (0 heavy clods, 1 smoke). lift: metres a second it keeps rising (warm
  // smoke), after the push it was given has died away.
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number, r: number, g: number, b: number, alpha: number, drift = 1, lift = 0): void {
    if (this.n >= this.most) return
    this.p.set([x, y, z, vx, vy, vz, size, grow, 0, life, r, g, b, alpha * 10 + Math.min(0.99, drift), lift], this.n * N)
    this.n++
  }

  update(dt: number, windX: number, windZ: number): void {
    const p = this.p, at = this.at.array as Float32Array, tint = this.tint.array as Float32Array
    let n = 0
    for (let k = 0; k < this.n; k++) {
      const o = k * N
      const age = p[o + 8] + dt, life = p[o + 9]
      if (age >= life) continue
      const q = n * N
      if (q !== o) p.copyWithin(q, o, o + N)
      const packed = p[q + 13], alpha = Math.floor(packed) / 10, drift = packed - Math.floor(packed)
      p[q + 8] = age
      p[q] += (p[q + 3] + windX * drift) * dt
      p[q + 1] += (p[q + 4] + p[q + 14]) * dt
      p[q + 2] += (p[q + 5] + windZ * drift) * dt
      const slow = Math.exp(-dt * 1.4)
      p[q + 3] *= slow
      p[q + 5] *= slow
      p[q + 4] *= Math.exp(-dt * 0.9)
      const u = age / life
      at[n * 4] = p[q]
      at[n * 4 + 1] = p[q + 1]
      at[n * 4 + 2] = p[q + 2]
      at[n * 4 + 3] = p[q + 6] + p[q + 7] * age
      tint[n * 4] = p[q + 10]
      tint[n * 4 + 1] = p[q + 11]
      tint[n * 4 + 2] = p[q + 12]
      tint[n * 4 + 3] = alpha * Math.min(1, u * 8) * (1 - u) * (1 - u)
      n++
    }
    this.n = n
    this.geo.instanceCount = n
    if (n > 0) {
      for (const a of [this.at, this.tint]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true }
    }
  }

  setTier(tier: 'high' | 'medium' | 'low'): void {
    this.most = Math.round(CAP * SHARE[tier])
  }

  clear(): void {
    this.n = 0
    this.geo.instanceCount = 0
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
  }
}
