// What a person is doing now, said once: the time book's word under their face, their card's line and the name the
// pointer shows all print from this. It reads the farm as it stands between days: the order they hold, or the one
// they worked on the last day and have not finished, where they are, what holds them up, and, with nothing ahead of
// them, the work they finished that day.
import * as S from '../sim/index.ts'
import { JOB_DOING, jobText } from './rules.ts'

export interface Now {
  glyph: string
  word: string          // one word, for the time book: "Spraying", "Heading", "Waiting", "Idle"
  rest: string          // the rest of the line after the word: "Brook Field", "to Brook Field to spray"
  line: string          // the whole line: word and rest
  place: number         // where it happens: a field, or a yard
  progress: number      // how far through the order, 0..1
}

// What holds the work up, by the word the season gives, after "Waiting for".
const WAIT_FOR: Partial<Record<string, string>> = {
  raining: 'the rain to stop', 'ground too wet': 'the ground to dry out', 'heavy rain': 'the rain to ease', 'too windy': 'the wind to drop',
  'the soil is too cold': 'the soil to warm up', 'waiting for the digger': 'the digger to lift more of the crop',
}

// The work, after "Heading to Brook Field to".
const TO_DO: Record<S.JobKind, string> = {
  plant: 'plant', hill: 'hill', scout: 'walk the rows', spray: 'spray', water: 'water', rogue: 'pull blighted plants', sample: 'do a test dig',
  kill: 'kill the vines', dig: 'dig', fell: 'fell trees', rocks: 'pick rocks', brush: 'cut brush', build: 'build', haul: 'haul the crop in',
}

// Work finished on the last day worked, by someone with nothing ahead of them: said as done, never as idle. The land
// shows that day's work while the next one waits, so "Idle" under someone seen spraying would be two tellings.
const DID: Record<S.JobKind, [string, (name: string) => string]> = {
  plant: ['Planted', n => n], hill: ['Hilled', n => n], scout: ['Walked', n => `the rows in ${n}`], spray: ['Sprayed', n => n], water: ['Watered', n => n],
  rogue: ['Pulled', n => `blighted plants in ${n}`], sample: ['Dug', n => `a test hill in ${n}`], kill: ['Killed', n => `the vines in ${n}`], dig: ['Dug', n => n],
  fell: ['Felled', n => `trees in ${n}`], rocks: ['Picked', n => `rocks in ${n}`], brush: ['Cut', n => `brush around ${n}`], build: ['Built', n => `in ${n}`],
  haul: ['Hauled', n => `the crop in from ${n}`],
}

function said(glyph: string, word: string, rest: string, place: number, progress = 0): Now {
  return { glyph, word, rest, line: rest ? `${word} ${rest}` : word, place, progress }
}

export function personNow(c: S.Campaign, id: number, waits: Record<number, string>): Now {
  const u = c.crew.find(x => x.id === id)
  const s = c.season
  const at = u?.at ?? S.HOME_YARD
  if (!u || !s || c.phase !== 'season') return said('stale', 'Idle', '', at)
  if (u.foreman) return said('foreman', 'Foreman', `of ${S.BLOCK_NAME[u.foreman]}`, at)
  if (S.hurt(u, s.day)) return said('hurt', 'Hurt', `and laid up until ${S.formatDay(s.year, u.out, true)}`, at)
  if (s.frozen) return said('frost', 'Frozen', 'out: the ground has frozen', at)
  if (!S.workday(c, s)) return said('sunday', 'Sunday', 'off', at)
  if (S.resting(u)) return said('tired', 'Resting', 'today, worn out', at)
  const others = (j: S.Job) => c.crew.some(o => o !== u && o.job === j.id)
  // The order they hold, or the one they worked on the last day and have not finished.
  const held = u.job >= 0 ? s.jobs.find(j => j.id === u.job) : undefined
  const last = s.worked.filter(w => w.unit === id).at(-1)
  const going = held ?? (last ? s.jobs.find(j => j.kind === last.kind && j.field === last.field && (j.unit < 0 || j.unit === id) && !others(j)) : undefined)
  if (going) {
    const progress = going.need > 0 ? going.done / going.need : 0
    if (u.road <= 0 && u.at === going.field) {
      const word = JOB_DOING[going.kind].replace(/ (in|from|around)$/, '')
      return said(going.kind, word, jobText(going, c, going.building).slice(word.length + 1), going.field, progress)
    }
    return said('go', 'Heading', `to ${S.placeName(going.field)} to ${TO_DO[going.kind]}`, going.field, progress)
  }
  if (u.road > 0) return said('go', 'Heading', `to ${S.placeName(u.to)}`, u.to)
  // Work they could take: held up, or theirs to start on the next working morning.
  const could = s.jobs.filter(j => (j.unit < 0 || j.unit === id) && S.willDo(u, j.kind) && !others(j))
  // Machine work waits for a machine while everyone else's hold all the farm has running (season.ts books their hours).
  const tractors = S.tractorsRunning(c, s.day)
  const free = (j: S.Job) => S.jobSkill(j.kind) !== 'machine' || c.crew.filter(o => o !== u && o.rig === 'tractor').length < tractors ||
    (j.kind === 'haul' && c.upgrades.truck && !c.crew.some(o => o !== u && o.rig === 'truck'))
  const next = could.find(j => !waits[j.id] && free(j))
  if (next) return said(next.kind, 'Next', jobText(next, c, next.building).replace(/^./, x => x.toLowerCase()), next.field)
  if (could.some(j => !waits[j.id])) return said('stale', 'Waiting', tractors > 1 ? 'for a tractor' : 'for the tractor', at)
  if (could.length) return said('stale', 'Waiting', `for ${WAIT_FOR[waits[could[0].id]] ?? waits[could[0].id]}`, at)
  // Nothing ahead of them, and they worked the last day through: what they did.
  if (last) { const [word, rest] = DID[last.kind]; return said(last.kind, word, rest(S.placeName(last.field)), last.field, 1) }
  const where = at === S.HOME_YARD ? '' : `at ${S.placeName(at)}, `
  // "Idle" is for someone standing while work is on the list; with the list empty they are simply free.
  return said('stale', s.jobs.length ? 'Idle' : 'Free', `${where}${s.jobs.length ? `nothing on the work list for ${u.kind === 'farmer' ? 'you' : 'them'}` : 'the work list is empty'}`, at)
}
