// Tree cards and a hardwood's leaves are drawn in two passes (src/render/flora.ts): a first that writes only depth,
// then the light where the depth is theirs. A first pass that drew a tree its mesh no longer draws would leave that
// tree's shape with nothing in it, so the two must always draw the same trees.
import { InstancedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import { Flora } from '../src/render/flora.ts'

const flora = new Flora()
// Every mesh that has a first pass, with it.
function pairs(): [InstancedMesh, InstancedMesh][] {
  const out: [InstancedMesh, InstancedMesh][] = []
  flora.group.traverse(o => { const first = o.userData.first as InstancedMesh | undefined; if (first) out.push([o as InstancedMesh, first]) })
  return out
}
const apart = () => pairs().filter(([m, first]) => first.count !== m.count).length

describe('a first pass draws the trees its mesh draws', () => {
  it('as built', () => {
    expect(pairs().length).toBeGreaterThan(20)
    expect(apart()).toBe(0)
  })

  it('as a tract is felled, tree by tree and to the last', () => {
    for (const tract of [14, 15, 16, 17]) {
      const trees = flora.stand(tract).length
      expect(trees).toBeGreaterThan(50)
      for (const share of [0.25, 0.5, 1]) {
        expect(flora.setFelled(tract, share)).toBe(Math.round(share * trees))
        expect(apart()).toBe(0)
      }
    }
    // (and the felling did take trees out of meshes that have a first pass)
    expect(pairs().filter(([m]) => m.count === 0).length).toBeGreaterThan(0)
  })

  it('with trees held standing while they go over, and on each setting', () => {
    flora.holdStanding(14, 6)
    flora.setFelled(14, 0.6)
    expect(apart()).toBe(0)
    for (const tier of ['low', 'medium', 'high'] as const) {
      flora.setTier(tier)
      expect(apart()).toBe(0)
    }
  })
})
