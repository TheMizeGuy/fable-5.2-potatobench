// How each person on the farm looks, the same on the land and in the interface, so a chip can be matched to a figure.
// Worked out from the person's name alone (the farmer is 0 or 'You'): an applicant keeps the same face once hired,
// though hiring gives them a new id. It never changes and is not saved.

// The portrait cuts drawn in design/portraits.svg; each is tinted with the colours below.
export type PortraitCut = 'farmer' | 'cap-moustache' | 'felt-beard' | 'kerchief' | 'curls' | 'cap-glasses'

export interface PersonLook {
  shirt: string     // CSS hex colours
  hat: string
  skin: string
  hair: string
  build: number     // 0.9 slight .. 1.1 heavy
  hatKind: 'cap' | 'brim' | 'none' | 'fedora'
  cut: PortraitCut  // the portrait's head: its hat or hair, and a moustache, beard or spectacles
}

// Work shirts that stay apart from one another, from the crop and from the soil at a distance.
const SHIRTS = ['#b8402e', '#2f6f9f', '#d9a441', '#6b4c8a', '#e7e0cf', '#2e7d6b', '#c96f2c', '#7a8794', '#a23b62', '#3d4f73', '#8a9a3b', '#5b3a29']
const HATS = ['#d8c48a', '#3b3f45', '#8c5a2b', '#c9c2b0', '#6e7f4f', '#27425c']
const KERCHIEFS = ['#9c3226', '#2f507a', '#2e7d6b', '#d9a441']
const SKINS = ['#e8b996', '#d9a47c', '#c48a62', '#a8704c', '#f0c8a8']
const HAIRS = ['#2b211a', '#5a3d24', '#8a6a3c', '#b9b4a8', '#1c1c1c', '#7a3b1f']
const CUTS: Exclude<PortraitCut, 'farmer'>[] = ['cap-moustache', 'felt-beard', 'kerchief', 'curls', 'cap-glasses']
const HAT_OF: Record<PortraitCut, PersonLook['hatKind']> = {
  farmer: 'brim', 'cap-moustache': 'cap', 'felt-beard': 'fedora', kerchief: 'none', curls: 'none', 'cap-glasses': 'cap',
}

function mix(id: number, salt: number): number {
  let h = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35)
  return (h ^ (h >>> 13)) >>> 0
}

// A name to a number, the same in every browser.
function seedOf(key: number | string): number {
  if (typeof key === 'number') return key
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) % 1_000_003
}

export const FARMER_LOOK: PersonLook = { shirt: SHIRTS[0], hat: HATS[0], skin: SKINS[0], hair: HAIRS[1], build: 1, hatKind: 'brim', cut: 'farmer' }

// key: the person's name ('You' for the farmer), or 0 for the farmer.
export function personLook(key: number | string): PersonLook {
  if (key === 0 || key === 'You') return FARMER_LOOK
  const id = seedOf(key)
  const cut = CUTS[mix(id, 5) % CUTS.length]
  return {
    shirt: SHIRTS[1 + (mix(id, 0) % (SHIRTS.length - 1))],
    hat: cut === 'kerchief' ? KERCHIEFS[mix(id, 1) % KERCHIEFS.length] : HATS[1 + (mix(id, 1) % (HATS.length - 1))],
    skin: SKINS[mix(id, 2) % SKINS.length],
    hair: HAIRS[mix(id, 3) % HAIRS.length],
    build: 0.9 + (mix(id, 4) % 21) / 100,
    hatKind: HAT_OF[cut],
    cut,
  }
}
