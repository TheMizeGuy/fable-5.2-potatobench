// Which cue answers which event, how often each may sound, and how they queue when several fall on one day.
// Kept apart from the live engine so the sound check plays the same events through the same rules.
import type { GameEvent } from '../sim/index.ts'
import * as cue from './cues.ts'
import * as farm from './farmstead.ts'
import type { Rig } from './synth.ts'

// 0: a pick, barely there. 1: routine work and paperwork. 2: something worth turning the head for.
// 3: a moment that must not be missed.
export type Rank = 0 | 1 | 2 | 3

export interface CueSpec {
  id: string
  on: string         // what it answers
  what: string       // what is heard
  rank: Rank
  gap: number        // least seconds between two soundings
  share?: string     // cues with the same share count as one for the gap
  play(rig: Rig, t: number, arg: number): number   // returns when it has finished sounding
}

// Warning pitches, low: more serious is lower.
const C4 = 261.6, A3 = 220, G3 = 196, E3 = 164.8, D3 = 146.8
// At the fastest clock eight days go by in a second: a job is heard once, not once a field.
const JOB_GAP = 1

const chime = (id: string, on: string, note: string, hz: number): CueSpec => ({
  id, on, what: `The warning chime, one low struck note, at ${note}`, rank: 2, gap: 2.5, share: 'warn',
  play: (r, t) => (cue.chime(r, t, hz), t + 0.6),
})
const close = (id: 'ledger' | 'kept' | 'lost', on: string, what: string): CueSpec => ({
  id, on, what, rank: 3, gap: 4, share: 'close', play: (r, t) => cue.cadence(r, t + 0.22, id),
})
const pick = (id: string, on: string, what: string, play: (r: Rig, t: number, arg: number) => void): CueSpec => ({
  id, on, what, rank: 0, gap: 0.07, share: 'pick', play: (r, t, a) => (play(r, t, a), t + 0.2),
})

export const CUES: CueSpec[] = [
  pick('pickField', 'a field picked', 'One step onto worked ground', farm.pickField),
  pick('pickTract', 'a tract of woods, brush or stumps picked', 'A twig underfoot and the leaves it stirs', farm.pickTract),
  pick('pickPerson', 'a person picked', 'Two taps of a tool handle, the second higher; each person has a pitch of their own', farm.pickPerson),
  pick('pickYard', 'a yard picked', 'The gate: its hinge, then its latch (the Dufour gate lower)', farm.pickYard),
  { id: 'heard', on: 'any order taken; pickers hired or sent home; winter work set', what: 'One knuckle on the tractor fender', rank: 1, gap: 0.09, play: (r, t) => (cue.heard(r, t), t + 0.15) },

  { id: 'planted', on: 'planted', what: 'Two pats on earth', rank: 1, gap: JOB_GAP, play: (r, t) => (cue.planted(r, t), t + 0.4) },
  { id: 'hilled', on: 'hilled', what: 'Two sweeps of soil', rank: 1, gap: JOB_GAP, play: (r, t) => (cue.hilled(r, t), t + 0.5) },
  { id: 'sprayed', on: 'sprayed', what: 'Two breaths of a nozzle', rank: 1, gap: JOB_GAP, play: (r, t) => (cue.sprayed(r, t), t + 0.4) },
  { id: 'watered', on: 'watered', what: 'Two drops into standing water', rank: 1, gap: JOB_GAP, play: (r, t) => (cue.watered(r, t), t + 0.35) },
  { id: 'rocks', on: 'rocks picked off a field', what: 'Three stones thrown on the stone boat: one on its planks, two on stone, and one that settles', rank: 1, gap: JOB_GAP, play: farm.rocks },
  { id: 'brushed', on: 'hedgerows cut back', what: 'Two swings of a brush hook, a stem parting after each', rank: 1, gap: JOB_GAP, play: farm.brushed },
  { id: 'sample', on: 'a test dig', what: 'The hill\'s tubers laid on a wooden tray one at a time', rank: 3, gap: 0.5, share: 'barrel', play: (r, t, n) => cue.barrel(r, t, 'sample', n || 5) },
  { id: 'dug', on: 'a field dug', what: 'A basket tipped into the barrel, slowing as the last tubers settle', rank: 3, gap: 0.5, share: 'barrel', play: (r, t) => cue.barrel(r, t, 'dig', 0) },
  { id: 'ticket', on: 'weighed: the crop is in and the weigh ticket cut', what: 'The poise run out along the scale beam, the beam tapping its stop twice, and the ticket torn off the pad', rank: 3, gap: 1, play: farm.ticket },
  { id: 'sold', on: 'sold, delivered, a contract filled, the cellar overflowing to the buyer', what: 'Two coins on a wooden counter', rank: 1, gap: 0.4, play: (r, t) => (cue.sold(r, t), t + 0.35) },

  { id: 'felled', on: 'a tract felled', what: 'The last tree down: the hinge cracking faster and faster, the rush, the ground, branches settling', rank: 2, gap: 4, play: farm.felled },
  { id: 'stumped', on: 'the stumps pulled: a tract is a field', what: 'A chain taking up, roots parting, the stump free and soil falling off it', rank: 2, gap: 2, play: farm.stumped },
  { id: 'tiled', on: 'tile drains laid', what: 'Two lengths of clay pipe set end to end, and water finding them', rank: 2, gap: 2, play: farm.tiled },
  { id: 'logs', on: 'logs sold', what: 'Two logs rolled onto the mill\'s truck, then the two coins', rank: 2, gap: 0.6, play: farm.logs },
  { id: 'begun', on: 'a building started', what: 'Two boards dropped on the stack', rank: 1, gap: 0.5, play: farm.begun },
  { id: 'built', on: 'a building standing', what: 'The last nail driven home in four blows, each higher than the last, and a board set down', rank: 2, gap: 2, play: farm.built },

  { id: 'hired', on: 'someone hired', what: 'The gate latch, and two steps up onto the porch', rank: 2, gap: 0.5, play: farm.hired },
  { id: 'left', on: 'someone quits or is hired away', what: 'Two steps down off the porch and the door pulled to', rank: 2, gap: 1.5, play: farm.left },
  { id: 'better', on: 'someone a level better at their work', what: 'A tap on hot iron and a ring off the anvil a fourth above', rank: 2, gap: 3, play: farm.better },
  { id: 'wornOut', on: 'someone worn out', what: 'The porch triangle, an iron bar struck once (D5)', rank: 2, gap: 4, share: 'people', play: (r, t) => farm.iron(r, t, 587.3, 1) },
  { id: 'unhappy', on: 'someone unhappy enough to quit', what: 'The porch triangle struck once, lower (B4)', rank: 2, gap: 4, share: 'people', play: (r, t) => farm.iron(r, t, 493.9, 1) },
  { id: 'hurt', on: 'someone hurt', what: 'The porch triangle struck twice, lower still (A4)', rank: 2, gap: 4, share: 'people', play: (r, t) => farm.iron(r, t, 440, 2) },

  { id: 'signed', on: 'a contract signed, land rented, a raise, a foreman named, a contractor ordered', what: 'A steel nib on ledger paper: five strokes and a full stop', rank: 1, gap: 0.3, share: 'paper', play: farm.signed },
  { id: 'deed', on: 'land bought', what: 'Two strokes of the nib and a rubber stamp', rank: 2, gap: 0.5, share: 'paper', play: (r, t) => farm.stamped(r, t, false) },
  { id: 'paidOff', on: 'the mortgage paid, at the year end or early', what: 'Two strokes of the nib, the stamp, and the two coins', rank: 1, gap: 0.5, share: 'paper', play: (r, t) => farm.stamped(r, t, true) },

  { id: 'brokeDown', on: 'a tractor broken down', what: 'A rod letting go, and the engine running down in six slowing beats', rank: 2, gap: 3, play: farm.brokeDown },
  { id: 'repaired', on: 'a tractor going again', what: 'Five clicks of a ratchet, then the engine catching and picking up', rank: 2, gap: 3, play: farm.repaired },
  { id: 'door', on: 'an incident: a decision is asked for', what: 'Three knocks at the door', rank: 3, gap: 1.5, play: farm.atTheDoor },
  { id: 'settled', on: 'an incident answered or let lapse', what: 'The door eased shut and its latch dropping', rank: 1, gap: 0.5, play: farm.settled },
  { id: 'goal', on: 'a goal on the ladder met', what: 'The year-end amen in small on the parlour organ (IV to I in F) under four struck bars climbing C, F, A, C', rank: 3, gap: 3, play: farm.goalMet },

  chime('warnFrost', 'frost, the freeze-up', 'C4', C4),
  chime('warnWatch', 'blight weather', 'A3', A3),
  chime('warnSeen', 'blight seen; any other bad news', 'G3', G3),
  chime('warnDry', 'a field dry; the pond dry', 'E3', E3),
  chime('warnLost', 'a field lost, a crop frozen in its barrels, rot through a pile', 'D3', D3),

  close('ledger', 'the year closed', 'Parlour organ: IV to I in F, the plain amen'),
  close('kept', 'five seasons kept', 'Parlour organ: IV, I over its fifth, a suspension on V resolving, and home'),
  close('lost', 'the farm lost', 'Parlour organ: the same first chord, then down to D with no third, left to die'),
]

const BY_ID = new Map(CUES.map(c => [c.id, c]))

export interface Play { id: string; arg: number }

const SAME: Record<string, string> = {
  planted: 'planted', hilled: 'hilled', sprayed: 'sprayed', watered: 'watered', rocks: 'rocks', brushed: 'brushed',
  dug: 'dug', weighed: 'ticket', sold: 'sold', overflow: 'sold', delivered: 'sold', contractFilled: 'sold',
  felled: 'felled', stumped: 'stumped', tiled: 'tiled', logsSold: 'logs', building: 'begun', built: 'built',
  hired: 'hired', quit: 'left', poached: 'left', skillUp: 'better', wornOut: 'wornOut', unhappy: 'unhappy', hurt: 'hurt',
  accepted: 'signed', rented: 'signed', raise: 'signed', foreman: 'signed', stumping: 'signed', tiling: 'signed',
  landBought: 'deed', mortgage: 'paidOff', mortgagePaid: 'paidOff', pickers: 'heard', winterSet: 'heard',
  repaired: 'repaired', incidentDone: 'settled', kept: 'kept',
  frost: 'warnFrost', freeze: 'warnFrost', watch: 'warnWatch', blightSeen: 'warnSeen', dry: 'warnDry', pondDry: 'warnDry',
  frozenInField: 'warnLost',
}
// Bad news that has a sound of its own, or (a dig cut short by the freeze) is told by the barrel.
const OWN_BAD = new Set(['dug', 'quit', 'poached', 'hurt', 'lost', 'breakdown', 'frozenInField', 'blightSeen'])
// When several warnings fall on one day only the gravest is struck.
const GRAVEST = ['warnLost', 'warnSeen', 'warnFrost', 'warnWatch', 'warnDry']

// The cues a day's events call for, each once, in the order they should sound. Pure.
export function cuesFor(events: GameEvent[]): Play[] {
  // The bank calling the note has its own close and nothing else.
  if (events.some(e => e.type === 'lost' && e.field < 0)) return [{ id: 'lost', arg: 0 }]
  const want = new Map<string, number>()
  const add = (id: string, arg = 0) => { if (!want.has(id)) want.set(id, arg) }
  for (const e of events) {
    if (e.type === 'sample') {
      const w = e.data?.weights
      add('sample', Array.isArray(w) ? w.length : 5)
    } else if (e.type === 'lost') {
      add('warnLost')
    } else if (e.type === 'breakdown') {
      // One word for two things: a tractor in the season, and rot through a pile in the cellar.
      add(e.level === 'bad' ? 'warnLost' : 'brokeDown')
    } else if (e.type === 'incident') {
      if (e.data?.kind === 'breakdown') add('brokeDown')
      add('door')
    } else if (SAME[e.type]) {
      add(SAME[e.type])
    }
    if (e.level === 'bad' && !OWN_BAD.has(e.type)) add('warnSeen')
  }
  // A basket into the barrel covers a test dig on the same day.
  if (want.has('dug')) want.delete('sample')
  const grave = GRAVEST.find(id => want.has(id))
  for (const id of GRAVEST) if (id !== grave) want.delete(id)
  const rank = (id: string) => BY_ID.get(id)!.rank
  // Short answers first, then the longer ones one after another with the most pressing at the head.
  const out = [...want].map(([id, arg]) => ({ id, arg }))
  const quick = out.filter(p => rank(p.id) <= 1)
  const slow = out.filter(p => rank(p.id) > 1).sort((a, b) => rank(b.id) - rank(a.id))
  return [...quick, ...slow]
}

// How long a cue of each rank will wait its turn before it is dropped as stale.
const PATIENCE = [0, 0, 2.5, 8]

export class Director {
  rig: Rig
  private last: Record<string, number> = {}
  // The longer cues take turns: when the last of them will be done.
  private lineUntil = 0
  private barrelUntil = 0
  // When the farm was last kept or lost: the close is the reward then, and a goal's is not added to it.
  private finalAt = -Infinity

  constructor(rig: Rig) {
    this.rig = rig
  }

  private ready(c: CueSpec, now: number): boolean {
    const key = c.share ?? c.id
    if (now - (this.last[key] ?? -Infinity) < c.gap) return false
    this.last[key] = now
    return true
  }

  // Sounds a cue of rank 2 or 3 when the line is free, and returns when it will be done: 0 if it would have come
  // too late to mean anything, and was dropped.
  private queue(c: CueSpec, arg: number, now: number, earliest: number): number {
    const at = Math.max(earliest, this.lineUntil)
    if (at - now > PATIENCE[c.rank]) return 0
    const end = c.play(this.rig, at, arg)
    // The next may begin over the tail of this one.
    this.lineUntil = Math.max(at + 0.3, end - 0.3)
    return end
  }

  events(events: GameEvent[], now: number): void {
    let k = 0
    for (const p of cuesFor(events)) {
      const c = BY_ID.get(p.id)!
      // A tumble of tubers is never cut across by another.
      if (c.share === 'barrel' && now < this.barrelUntil) continue
      if (!this.ready(c, now)) continue
      if (c.id === 'kept' || c.id === 'lost') this.finalAt = now
      const slot = now + 0.03 + 0.11 * k
      if (c.rank <= 1) {
        c.play(this.rig, slot, p.arg)
        k++
      } else {
        const end = this.queue(c, p.arg, now, slot)
        if (c.share === 'barrel') this.barrelUntil = end
      }
    }
  }

  private one(id: string, now: number, arg = 0): void {
    const c = BY_ID.get(id)!
    if (!this.ready(c, now)) return
    if (c.rank <= 1) c.play(this.rig, now + 0.01, arg)
    else this.queue(c, arg, now, now + 0.03)
  }

  // The player gave an order and it was taken.
  order(now: number): void {
    this.one('heard', now)
  }

  // The player picked something: a field, a tract still to clear, a person (id is theirs), a yard (-1 or -2).
  pick(what: 'field' | 'tract' | 'person' | 'yard', id: number, now: number): void {
    this.one(what === 'field' ? 'pickField' : what === 'tract' ? 'pickTract' : what === 'person' ? 'pickPerson' : 'pickYard', now, id)
  }

  // The year closing: the cellar gives way to the ledger. Silent if the kept or lost close has just begun.
  ledger(now: number): void {
    this.one('ledger', now)
  }

  // A goal on the ladder met. It waits for whatever is sounding, a close included, and then has the air to itself.
  goal(now: number): void {
    const c = BY_ID.get('goal')!
    if (now - this.finalAt < 12 || !this.ready(c, now)) return
    this.queue(c, 0, now, now + 0.35)
  }
}
