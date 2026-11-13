// What would get a waiting job done, from the farm as it stands: for each person who could do it, what stops them and
// the press that clears it; a day off; no machine running; nobody on the farm for the work; and waiting. Each says what
// it costs, the most useful first. Built for any kind of job, not one.
import { hireBlock } from './crew.ts'
import * as P from './params.ts'
import { hurt, jobSkill, resting, SKILL_LABEL, speed } from './people.ts'
import { FIELD_NAMES, JOB_LABEL, tractorsRunning, workday } from './season.ts'
import { formatDay } from './calendar.ts'
import { fieldInfo } from './view.ts'
import type { Campaign, Cmd, JobKind, Unit } from './types.ts'

export interface Remedy {
  id: string                       // what kind of remedy: 'push', 'let', 'free', 'sunday', 'hire', 'wait'
  unit: number                     // the person it is about, or -1
  label: string                    // the key: "Let Lucien drive"
  cost: string                     // what it costs, in a few words
  cmds: Cmd[]                      // what a press does (none for waiting)
}

const first = (u: Unit) => u.name.split(' ')[0]
const who = (u: Unit, you: string, them: string) => (u.kind === 'farmer' ? you : `${first(u)} ${them}`)

// The work, after "Let Lucien".
const DOES: Record<string, string> = { machine: 'drive', field: 'do the field work', woods: 'work in the woods', build: 'build', pack: 'pack' }

export function remedies(c: Campaign, kind: JobKind, field: number): Remedy[] {
  const s = c.season
  if (!s || c.phase !== 'season') return []
  const skill = jobSkill(kind)
  const job = s.jobs.find(j => j.kind === kind && j.field === field)
  const out: Remedy[] = []
  const order: Cmd[] = job ? [] : [{ t: 'job', kind, field }]
  const people = c.crew.filter(u => !u.foreman && !hurt(u, s.day))
  // Pinned to someone who can't: anyone may take it.
  if (job && job.unit >= 0) {
    const u = c.crew.find(x => x.id === job.unit)
    if (u && (u.foreman || hurt(u, s.day) || resting(u) || u.prio[skill] <= 0)) out.push({ id: 'free', unit: u.id, label: 'Let anyone do it', cost: `${who(u, 'you', 'is')} can't today`, cmds: [{ t: 'assign', id: job.id, unit: -1 }] })
  }
  // No machine running: nobody can do it until the repair.
  if (skill === 'machine' && tractorsRunning(c, s.day) === 0 && !(kind === 'haul' && c.upgrades.truck)) {
    const back = Math.min(...c.broken.filter(b => b > s.day))
    out.push({ id: 'wait', unit: -1, label: 'Wait for the tractor', cost: `back on ${formatDay(s.year, back, true)}`, cmds: order })
    return out
  }
  const able = people.filter(u => u.prio[skill] > 0 && !resting(u))
  // Someone can, but not today: a Sunday off, or the machine.
  if (able.length) {
    if (!workday(c, s)) out.push({ id: 'sunday', unit: -1, label: 'Work Sundays', cost: 'everyone works seven days, so they tire faster', cmds: [...order, { t: 'sundays', off: false }] })
    else if (skill === 'machine') out.push({ id: 'wait', unit: -1, label: 'Wait for the tractor', cost: `${who(able[0], 'you\'ll', 'will')} take it when it's free`, cmds: order })
    out.push({ id: 'wait', unit: -1, label: 'Wait', cost: waitCost(c, kind, field), cmds: [] })
    return dedupe(out)
  }
  // Resting, worn out: pushing on today.
  for (const u of people) {
    if (!resting(u) || u.prio[skill] <= 0) continue
    out.push({ id: 'push', unit: u.id, label: u.kind === 'farmer' ? 'Push on today' : `Ask ${first(u)} to push on today`, cost: `${u.kind === 'farmer' ? 'you' : first(u)}: more tired, slower tomorrow`, cmds: [...order, { t: 'rest', unit: u.id, mode: 'push' }] })
  }
  // Set never to do this work: letting them, at their own speed for it.
  for (const u of people) {
    if (u.prio[skill] > 0 || resting(u)) continue
    out.push({ id: 'let', unit: u.id, label: u.kind === 'farmer' ? `Do ${SKILL_LABEL[skill]} yourself` : `Let ${first(u)} ${DOES[skill]}`, cost: `${u.kind === 'hand' ? 'field hand' : u.kind === 'operator' ? 'tractor operator' : 'you'}, ${skill} ${u.skills[skill]} of 10: about ${Math.round(speed(u, skill) * 10) * 10}% speed`, cmds: [...order, { t: 'priority', unit: u.id, work: skill, level: 2 }] })
  }
  // Nobody on the farm for this work: hiring someone who does it.
  const hireKind = skill === 'machine' ? 'operator' : 'hand'
  if (!c.crew.some(u => !u.foreman && u.prio[skill] > 0 && u.kind !== 'farmer') && !hireBlock(c, hireKind) && (skill === 'machine' || skill === 'field')) {
    out.push({ id: 'hire', unit: -1, label: hireKind === 'operator' ? 'Hire a tractor operator' : 'Hire a field hand', cost: `$${(hireKind === 'operator' ? P.OPERATOR_WAGE : P.HAND_WAGE).toLocaleString('en-US')} a month`, cmds: [...order, { t: 'hire', kind: hireKind }] })
  }
  out.push({ id: 'wait', unit: -1, label: 'Wait', cost: waitCost(c, kind, field), cmds: [] })
  return dedupe(out)
}

// One wait at most: waiting for the tractor says more than waiting.
function dedupe(out: Remedy[]): Remedy[] {
  return out.filter((m, k) => m.id !== 'wait' || out.findIndex(x => x.id === 'wait') === k)
}

// Why nobody takes the work, person by person: "You're resting, worn out, and Lucien is set never to drive."
// dayOff: whether a day off holds the job up (a frost haul goes out Sunday or not).
export function heldUpBy(c: Campaign, kind: JobKind, dayOff = true): string {
  const s = c.season
  if (!s) return ''
  const skill = jobSkill(kind)
  const parts: string[] = []
  if (dayOff && !workday(c, s)) parts.push('it\'s a Sunday off')
  if (skill === 'machine' && tractorsRunning(c, s.day) === 0) parts.push('the tractor is broken down')
  for (const u of c.crew) {
    if (u.foreman) parts.push(`${who(u, 'you\'re', 'is')} a foreman`)
    else if (hurt(u, s.day)) parts.push(`${who(u, 'you\'re', 'is')} hurt until ${formatDay(s.year, u.out, true)}`)
    else if (u.prio[skill] <= 0) parts.push(`${who(u, 'you\'re', 'is')} set never to ${DOES[skill]}`)
    else if (resting(u)) parts.push(`${who(u, 'you\'re', 'is')} resting, worn out`)
  }
  if (!parts.length) return ''
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `${said.replace(/^./, x => x.toUpperCase())}.`
}

// What waiting costs: for a spray, the protection left; otherwise what the season holds against it.
function waitCost(c: Campaign, kind: JobKind, field: number): string {
  if (kind === 'spray' && field >= 0) return `${FIELD_NAMES[field]}'s leaves are ${Math.round(fieldInfo(c, field).protect * 100)}% protected now`
  return `${JOB_LABEL[kind].toLowerCase()} waits until someone can`
}
