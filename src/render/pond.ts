// The irrigation pond: a level bed cut into the foot of the slope and a dam banked up round it, highest on the brook's
// side; raw while it is being dug and grassed over once it stands; its water at the level the farm has left in it, and wet mud between that and the full mark.
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { POND, groundY } from './layout.ts'
import { fbm2 } from './noise.ts'
import { SNOW_RIME, linear, patch } from './shaders.ts'
import type { FarmVis } from './state.ts'

const RINGS = [0, 0.3, 0.55, 0.74, 0.86, 0.96, 1.04, 1.1, 1.28, 1.5, 1.72]
const SEGS = 44
const BANK = 0.42

export class Pond {
  readonly group = new Group()
  private disposables: { dispose(): void }[] = []
  private dug = { value: 0 }
  private level = { value: 0 }
  private water: Mesh
  private bedY: number
  private fullY: number

  constructor() {
    // The outline is not a true oval.
    const reach = (a: number) => 1 + 0.16 * (fbm2(Math.cos(a) * 1.3 + 4.1, Math.sin(a) * 1.3 + 2.7) - 0.5) * 2
    const at = (ring: number, seg: number): [number, number] => {
      const a = (seg / SEGS) * Math.PI * 2, k = RINGS[ring] * (ring < 8 ? reach(a) : 0.5 + 0.5 * reach(a))
      return [POND.x + Math.cos(a) * POND.rx * k, POND.z + Math.sin(a) * POND.rz * k]
    }
    // The bed is level, at the height of the highest ground it is cut into, and dished a little toward its middle.
    let top = -1e9
    for (let r = 0; r <= 3; r++) for (let s = 0; s < SEGS; s++) { const [x, z] = at(r, s); top = Math.max(top, groundY(x, z)) }
    top += 0.04
    const crest = top + BANK
    const bed = (k: number, g: number) => Math.max(g + 0.03, top - 0.17 * (1 - (k / 0.74) ** 2))
    this.bedY = bed(0, groundY(POND.x, POND.z))
    this.fullY = crest - 0.1
    const pos: number[] = [], rise: number[] = [], part: number[] = [], idx: number[] = []
    for (let r = 0; r < RINGS.length; r++) {
      for (let s = 0; s <= SEGS; s++) {
        const [x, z] = at(r, s % SEGS), g = groundY(x, z)
        const k = RINGS[r]
        // the bed, the inner slope up to a level crest, the outer slope down into the meadow
        const up = k <= 0.74 ? bed(k, g) - g : k <= 1.1 ? top + (crest - top) * Math.min(1, (k - 0.74) / 0.22) ** 1.4 - g
          : (crest - g) * Math.max(0, 1 - (k - 1.1) / 0.62) ** 1.4 - 0.07 * Math.min(1, (k - 1.1) / 0.62)
        pos.push(x, g + up, z)
        rise.push(up)
        part.push(k <= 0.74 ? 0 : k < 1.0 ? 0.5 : 1)
      }
    }
    for (let r = 0; r < RINGS.length - 1; r++) {
      for (let s = 0; s < SEGS; s++) {
        const a = r * (SEGS + 1) + s, b = a + 1, c = a + SEGS + 1, d = c + 1
        idx.push(a, b, c, b, d, c)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('aRise', new BufferAttribute(new Float32Array(rise), 1))
    geo.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    // The shape is kept apart from the ground it rises from, so the bank can go up as it is dug.
    const gp = geo.getAttribute('position') as BufferAttribute
    for (let k = 0; k < gp.count; k++) gp.setY(k, gp.getY(k) - rise[k])
    const bankMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 }), {
      uniforms: { uDug: this.dug, uLevel: this.level, uFull: { value: this.fullY } },
      vertexHead: 'attribute float aRise; attribute float aPart; uniform float uDug; varying float vPart;',
      // It goes up as it is dug: the spoil from the middle makes the bank.
      vertexBegin: 'transformed.y += aRise * smoothstep(0.0, 0.9, uDug); vPart = aPart;',
      vertexNormal: 'objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), objectNormal, 0.35 + 0.65 * smoothstep(0.0, 0.9, uDug)));',
      fragmentHead: 'uniform float uDug; uniform float uLevel; uniform float uFull; varying float vPart; float pondWet;',
      fragmentColor: /* glsl */ `
        {
          vec4 n = texture2D(uNoise, vWorld.xz * 0.43);
          float fine = n.a, broad = texture2D(uNoise, vWorld.xz * 0.06).b;
          vec3 clay = mix(${linear('#7b5f48')}, ${linear('#9c8062')}, fine) * (0.82 + 0.3 * broad);
          vec3 turf = uGrass * (0.62 + 0.62 * broad) * (0.78 + 0.44 * fine) * mix(vec3(1.2, 1.07, 0.78), vec3(0.86, 0.95, 0.84), smoothstep(0.3, 0.7, texture2D(uNoise, vWorld.xz * 0.19).a));
          // Grass takes the bank once the digging is done; the inside stays clay down to the water.
          float grown = smoothstep(0.92, 1.0, uDug) * smoothstep(0.55, 0.95, vPart + (fine - 0.5) * 0.4);
          vec3 col = mix(clay, turf, grown);
          // Below the full mark the bed is mud: wet and dark by the water, drying pale and cracked above it.
          float below = (1.0 - smoothstep(uFull - 0.03, uFull + 0.02, vWorld.y)) * step(0.999, uDug) * (1.0 - step(0.75, vPart));
          float dryness = smoothstep(uLevel, uLevel + 0.22, vWorld.y);
          vec3 mud = mix(${linear('#33271d')}, ${linear('#8d7a60')} * (0.88 + 0.2 * smoothstep(0.3, 0.7, fine)) * (1.0 - 0.34 * (1.0 - smoothstep(0.012, 0.05, abs(texture2D(uNoise, vWorld.xz * 0.9).b - 0.5)))), dryness);
          col = mix(col, mud, below);
          pondWet = below * (1.0 - dryness);
          diffuseColor.rgb = col;
        }
        ${SNOW_RIME}`,
      fragmentRoughness: 'roughnessFactor = mix(0.94, 0.35, pondWet);',
    })
    const bank = new Mesh(geo, bankMat)
    bank.receiveShadow = true
    bank.castShadow = true
    this.group.add(bank)
    this.disposables.push(geo, bankMat)

    // The water: a sheet inside the crest, which the bank and the bed cut to its shore.
    const wp: number[] = [], wi: number[] = []
    wp.push(POND.x, 0, POND.z)
    for (let s = 0; s <= SEGS; s++) { const [x, z] = at(6, s % SEGS); wp.push(x, 0, z) }
    for (let s = 1; s <= SEGS; s++) wi.push(0, s + 1, s)
    const wgeo = new BufferGeometry()
    wgeo.setAttribute('position', new BufferAttribute(new Float32Array(wp), 3))
    wgeo.setIndex(wi)
    wgeo.computeVertexNormals()
    const waterMat = patch(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true }), {
      shine: 0.3,
      fragmentHead: 'vec2 pondRipple;',
      fragmentColor: /* glsl */ `
        {
          pondRipple = (texture2D(uNoise, vWorld.xz * 0.31 + vec2(uTime * 0.011, uTime * 0.006)).rg - 0.5) * (0.25 + 0.6 * min(uSway, 1.0));
          diffuseColor.rgb = mix(${linear('#27332a')}, ${linear('#3d4630')}, texture2D(uNoise, vWorld.xz * 0.11).b);
          diffuseColor.a = 0.93;
        }`,
      fragmentNormal: 'normal = normalize(normal + (viewMatrix * vec4(pondRipple.x, 0.0, pondRipple.y, 0.0)).xyz * 0.2);',
      fragmentEmissive: /* glsl */ `
        {
          vec3 wN = inverseTransformDirection( normal, viewMatrix );
          vec3 wV = normalize( cameraPosition - vWorld );
          float fres = 0.07 + 0.93 * pow( 1.0 - max( dot( wN, wV ), 0.0 ), 5.0 );
          vec3 wR = reflect( - wV, wN );
          wR.y = abs( wR.y );
          totalEmissiveRadiance += skyRadiance( wR, 0.06 ) * fres * mix( 1.0, 0.3, smoothstep( 0.7, 1.0, uCloud.y ) );
        }`,
    })
    this.water = new Mesh(wgeo, waterMat)
    this.water.receiveShadow = true
    this.water.renderOrder = 2
    this.group.add(this.water)
    this.disposables.push(wgeo, waterMat)
    this.group.visible = false
  }

  set(farm: FarmVis): void {
    const b = farm.buildings.find(x => x.kind === 'pond')
    this.group.visible = !!b
    if (!b) return
    this.dug.value = b.built ? 1 : Math.max(0.05, b.progress)
    const y = this.bedY + 0.05 + Math.max(0, Math.min(1, farm.pond)) * (this.fullY - this.bedY - 0.05)
    this.level.value = y
    this.water.position.y = y
    this.water.visible = b.built
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
