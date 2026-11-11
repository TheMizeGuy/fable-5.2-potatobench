// How each person on the farm looks, the same on the land and in the interface, so a chip can be matched to a figure.
// Worked out from the person's id alone: it never changes and is not saved.

export interface PersonLook {
  shirt: string     // CSS hex colours
  hat: string
  skin: string
  hair: string
  build: number     // 0.9 slight .. 1.1 heavy
  hatKind: 'cap' | 'brim' | 'none'
}

// Work shirts that stay apart from one another, from the crop and from the soil at a distance.
const SHIRTS = ['#b8402e', '#2f6f9f', '#d9a441', '#6b4c8a', '#e7e0cf', '#2e7d6b', '#c96f2c', '#7a8794', '#a23b62', '#3d4f73', '#8a9a3b', '#5b3a29']
const HATS = ['#d8c48a', '#3b3f45', '#8c5a2b', '#c9c2b0', '#6e7f4f', '#27425c']
const SKINS = ['#e8b996', '#d9a47c', '#c48a62', '#a8704c', '#f0c8a8']
const HAIRS = ['#2b211a', '#5a3d24', '#8a6a3c', '#b9b4a8', '#1c1c1c', '#7a3b1f']
const HAT_KINDS: PersonLook['hatKind'][] = ['brim', 'cap', 'cap', 'none', 'brim', 'cap']

function mix(id: number, salt: number): number {
  let h = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35)
  return (h ^ (h >>> 13)) >>> 0
}

export function personLook(id: number): PersonLook {
  // The farmer: the red check shirt and straw hat of the title.
  if (id === 0) return { shirt: SHIRTS[0], hat: HATS[0], skin: SKINS[0], hair: HAIRS[1], build: 1, hatKind: 'brim' }
  // Hired people take the shirts in turn, so the first eleven on a farm are all different.
  const k = 1 + ((id - 1) % (SHIRTS.length - 1))
  return {
    shirt: SHIRTS[k],
    hat: HATS[mix(id, 1) % HATS.length],
    skin: SKINS[mix(id, 2) % SKINS.length],
    hair: HAIRS[mix(id, 3) % HAIRS.length],
    build: 0.9 + (mix(id, 4) % 21) / 100,
    hatKind: HAT_KINDS[mix(id, 5) % HAT_KINDS.length],
  }
}
