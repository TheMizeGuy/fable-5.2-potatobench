// Which cue answers which event. Kept apart from the live engine so the sound check can play the same events.
import type { GameEvent } from '../sim/index.ts'
import * as cue from './cues.ts'
import type { Rig } from './synth.ts'

// Warning chime pitches: A minor pentatonic, low. More serious is lower.
const WARN_HZ: [string, number][] = [
  ['lost', 146.8], ['breakdown', 146.8], ['blightSeen', 196], ['frost', 261.6], ['freeze', 261.6], ['watch', 220], ['dry', 164.8],
]
const BAD_HZ = 196
// A new need: higher and lighter than a warning, a call to look rather than an alarm.
const NEED_HZ = 523
const JOB_GAP = 1

export class Director {
  rig: Rig
  private last: Record<string, number> = {}
  private barrelUntil = 0

  constructor(rig: Rig) {
    this.rig = rig
  }

  private ready(key: string, gap: number, now: number): boolean {
    if (now - (this.last[key] ?? -Infinity) < gap) return false
    this.last[key] = now
    return true
  }

  events(events: GameEvent[], now: number): void {
    const rig = this.rig
    const has = new Set(events.map(e => e.type))
    let k = 0
    const slot = () => now + 0.03 + 0.11 * k++

    // At the fastest clock eight days go by in a second: a job is heard once, not once a field.
    if (has.has('planted') && this.ready('planted', JOB_GAP, now)) cue.planted(rig, slot())
    if (has.has('hilled') && this.ready('hilled', JOB_GAP, now)) cue.hilled(rig, slot())
    if (has.has('sprayed') && this.ready('sprayed', JOB_GAP, now)) cue.sprayed(rig, slot())
    if (has.has('watered') && this.ready('watered', JOB_GAP, now)) cue.watered(rig, slot())
    if ((has.has('dug') || has.has('sample')) && now >= this.barrelUntil) {
      const w = events.find(e => e.type === 'sample')?.data?.weights
      this.barrelUntil = cue.barrel(rig, slot(), has.has('dug') ? 'dig' : 'sample', Array.isArray(w) ? w.length : 5)
    }
    if ((has.has('sold') || has.has('overflow') || has.has('delivered') || has.has('contractFilled')) && this.ready('sold', 0.4, now)) cue.sold(rig, slot())
    // A deal struck or someone taken on: the same dry knock that answers an order.
    if ((has.has('hired') || has.has('accepted') || has.has('rented') || has.has('landBought')) && this.ready('order', 0.09, now)) cue.heard(rig, slot())

    // The bank calling the note has its own close, and no chime.
    if (events.some(e => e.type === 'lost' && e.field < 0)) {
      if (this.ready('cadence', 4, now)) cue.cadence(rig, slot() + 0.25, 'lost')
      return
    }

    let hz = 0
    for (const [type, f] of WARN_HZ) if (has.has(type)) { hz = f; break }
    if (!hz && events.some(e => e.level === 'bad' && e.type !== 'dug')) hz = BAD_HZ
    if (hz && this.ready('warn', 2.5, now)) cue.chime(rig, slot(), hz)

    if (has.has('kept') && this.ready('cadence', 4, now)) cue.cadence(rig, slot() + 0.25, 'kept')
  }

  // Something new needs the player: a soft chime, not more than one every few seconds.
  need(now: number): void {
    if (this.ready('need', 3, now)) cue.chime(this.rig, now + 0.02, NEED_HZ)
  }

  // The player gave an order and it was taken.
  order(now: number): void {
    if (this.ready('order', 0.09, now)) cue.heard(this.rig, now + 0.01)
  }

  // The year closing: the cellar gives way to the ledger. Silent if the kept or lost close has just begun.
  ledger(now: number): void {
    if (this.ready('cadence', 4, now)) cue.cadence(this.rig, now + 0.2, 'ledger')
  }
}
