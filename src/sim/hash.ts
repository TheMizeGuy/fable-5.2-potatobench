// A fingerprint of the whole game state. Two engines that agree on this agree on everything.
import type { Campaign } from './types.ts'

const buf = new DataView(new ArrayBuffer(8))

function mix(h: number, x: number): number {
  h ^= x
  return Math.imul(h, 0x01000193) >>> 0
}

function walk(h: number, v: unknown): number {
  if (typeof v === 'number') {
    buf.setFloat64(0, v)
    return mix(mix(h, buf.getUint32(0)), buf.getUint32(4))
  }
  if (typeof v === 'string') {
    for (let i = 0; i < v.length; i++) h = mix(h, v.charCodeAt(i))
    return mix(h, 0xff)
  }
  if (typeof v === 'boolean') return mix(h, v ? 1 : 2)
  if (v === null || v === undefined) return mix(h, 3)
  if (Array.isArray(v)) {
    h = mix(h, v.length)
    for (let i = 0; i < v.length; i++) h = walk(h, v[i])
    return h
  }
  const keys = Object.keys(v as object).sort()
  for (const k of keys) {
    h = walk(h, k)
    h = walk(h, (v as Record<string, unknown>)[k])
  }
  return mix(h, 0xfe)
}

export function hashCampaign(c: Campaign): string {
  return walk(0x811c9dc5, c).toString(16).padStart(8, '0')
}
