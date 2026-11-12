// People: skills and what they do to speed and results, traits, tiredness, mood, wages, housing, applicants.
import { holdsDufourLand, HOME_YARD } from './farm.ts'
import * as P from './params.ts'
import { hashUnit } from './rng.ts'
import type { Applicant, Campaign, JobKind, Skill, Trait, Unit, UnitKind } from './types.ts'

export const SKILL_LABEL: Record<Skill, string> = { machine: 'machine work', field: 'field work', woods: 'woods work', build: 'building', pack: 'packing' }

export function zeroSkills(): Record<Skill, number> {
  return { machine: 0, field: 0, woods: 0, build: 0, pack: 0 }
}

// Default priorities from skill: the best skill first, other skills above 2 second, the rest third.
export function defaultPrio(skills: Record<Skill, number>): Record<Skill, number> {
  let best = 0
  for (const k of P.SKILLS) if (skills[k] > best) best = skills[k]
  const out = zeroSkills()
  for (const k of P.SKILLS) out[k] = skills[k] === best ? 1 : skills[k] > 2 ? 2 : 3
  return out
}

export function bestSkill(skills: Record<Skill, number>): Skill {
  let best: Skill = 'machine'
  for (const k of P.SKILLS) if (skills[k] > skills[best]) best = k
  return best
}

// What a person with these skills asks to be paid, dollars a month, to the nearest $10.
export function askFor(skills: Record<Skill, number>): number {
  let sum = 0, best = 0
  for (const k of P.SKILLS) { sum += skills[k]; if (skills[k] > best) best = skills[k] }
  return Math.round((P.ASK_BASE + P.ASK_BEST * best + P.ASK_LEVEL * sum) / 10) * 10
}

function person(id: number, kind: UnitKind, name: string, skills: Record<Skill, number>, trait: Trait | '', wage: number, ask: number, prio: Record<Skill, number>): Unit {
  return {
    id, kind, name, at: HOME_YARD, wage, job: -1, to: HOME_YARD, road: 0, paidTo: 0,
    skills: { ...skills }, xp: zeroSkills(), trait, tired: 0, mood: P.MOOD_START, ask, prio,
    foreman: '', winter: 'off', winterField: -1, low: 0, rig: '', out: -1, rest: 'auto',
  }
}

export function newFarmer(): Unit {
  const prio = zeroSkills()
  for (const k of P.SKILLS) prio[k] = 2
  return person(0, 'farmer', P.FARMER_NAME, P.FARMER_SKILLS, '', 0, 0, prio)
}

// Someone from the hiring hall for a kind of work: average at it, paid the standard wage, set never to do the other
// kind (a field hand drives no tractor, an operator does not walk the fields) until the player says otherwise.
export function hallHire(c: Campaign, kind: 'hand' | 'operator'): Unit {
  const names = kind === 'hand' ? P.HAND_NAMES : P.OPERATOR_NAMES
  const taken = new Set(c.crew.map(u => u.name))
  const name = names.find(n => !taken.has(n)) ?? `${names[0]} ${c.nextUnit}`
  const skills = kind === 'hand' ? P.HAND_SKILLS : P.OPERATOR_SKILLS
  const wage = kind === 'hand' ? P.HAND_WAGE : P.OPERATOR_WAGE
  const prio = defaultPrio(skills)
  if (kind === 'hand') prio.machine = 0
  else prio.field = 0
  const id = c.nextUnit++
  const trait = P.TRAIT_LIST[Math.floor(hashUnit(c.seed, id, 6151, c.year) * P.TRAIT_LIST.length)]
  return person(id, kind, name, skills, trait, wage, wage, prio)
}

export function fromApplicant(c: Campaign, a: Applicant): Unit {
  const kind: UnitKind = bestSkill(a.skills) === 'machine' ? 'operator' : 'hand'
  return person(c.nextUnit++, kind, a.name, a.skills, a.trait, a.ask, a.ask, defaultPrio(a.skills))
}

// This spring's applicants, from the campaign seed and the year (no draw on the game's random stream), named apart
// from everyone already on the farm. Ids are unique to the year.
export function applicantsFor(seed: number, year: number, taken: Set<string>, n = P.APPLICANTS, salt = 0): Applicant[] {
  const out: Applicant[] = []
  const used = new Set(taken)
  for (let k = 0; k < n; k++) {
    const u = (s: number) => hashUnit(seed, year, 5303 + salt * 97 + k, s)
    let name = ''
    for (let t = 0; t < 40 && (!name || used.has(name)); t++) {
      name = `${P.FIRST_NAMES[Math.floor(u(10 + t) * P.FIRST_NAMES.length)]} ${P.LAST_NAMES[Math.floor(u(60 + t) * P.LAST_NAMES.length)]}`
    }
    used.add(name)
    const skills = zeroSkills()
    for (const s of P.SKILLS) skills[s] = Math.floor(u(1 + P.SKILLS.indexOf(s)) * 6)
    // A specialty: machine and field work most often, packing least.
    const r = u(7)
    const special: Skill = r < 0.3 ? 'machine' : r < 0.6 ? 'field' : r < 0.8 ? 'woods' : r < 0.95 ? 'build' : 'pack'
    skills[special] = 4 + Math.floor(u(8) * 5)
    const trait = P.TRAIT_LIST[Math.floor(u(9) * P.TRAIT_LIST.length)]
    const ask = Math.round(askFor(skills) * (0.9 + 0.2 * u(100)) / 10) * 10
    out.push({ id: year * 100 + salt * 10 + k + 1, name, skills, trait, ask })
  }
  return out
}

// Fills in what a person saved before people had skills lacks: the farmer's own skills, and the hiring hall's for
// a hand or an operator, with the old limits on what each did kept as priorities.
export function upgradePerson(u: Record<string, unknown>, seed: number, year: number): void {
  const kind = u.kind as UnitKind
  const skills = kind === 'farmer' ? P.FARMER_SKILLS : kind === 'hand' ? P.HAND_SKILLS : P.OPERATOR_SKILLS
  u.skills ??= { ...skills }
  u.xp ??= zeroSkills()
  if (u.trait === undefined) u.trait = kind === 'farmer' ? '' : P.TRAIT_LIST[Math.floor(hashUnit(seed, u.id as number, 6151, year) * P.TRAIT_LIST.length)]
  u.tired ??= 0
  u.mood ??= P.MOOD_START
  u.ask ??= u.wage
  if (u.prio === undefined) {
    const prio = defaultPrio(skills)
    if (kind === 'farmer') for (const k of P.SKILLS) prio[k] = 2
    if (kind === 'hand') prio.machine = 0
    if (kind === 'operator') prio.field = 0
    u.prio = prio
  }
  u.foreman ??= ''
  u.winter ??= 'off'
  u.winterField ??= -1
  u.low ??= 0
  u.rig ??= ''
  u.rest ??= 'auto'
}

// Whether a person takes today off: rests by themselves once worn out (unless told to work on), or was told to rest
// until fresh.
export function resting(u: Unit): boolean {
  const mode = u.rest ?? 'auto'
  return mode === 'now' || (mode === 'auto' && u.tired >= P.HURT_TIRED)
}

// Whether a person is laid up hurt today.
export function hurt(u: Unit, day: number): boolean {
  return u.out > day
}

// The level a person works at for results: steady hands count two levels more at machine work.
export function resultLevel(u: Unit, skill: Skill): number {
  return u.skills[skill] + (skill === 'machine' && u.trait === 'steady' ? P.STEADY_LEVELS : 0)
}

// Share of normal speed a person works at in a skill, before anything about the place or the equipment.
export function speed(u: Unit, skill: Skill): number {
  let v = P.SKILL_SPEED_BASE + P.SKILL_SPEED_PER * u.skills[skill]
  if (u.trait === 'strong' && (skill === 'field' || skill === 'woods')) v *= P.STRONG_SPEED
  if (u.trait === 'early') v *= P.EARLY_SPEED
  if (u.trait === 'slow') v *= P.SLOW_SPEED
  if (u.tired > P.TIRED_SLOW_FROM) v *= 1 - P.TIRED_SLOW * (u.tired - P.TIRED_SLOW_FROM) / (1 - P.TIRED_SLOW_FROM)
  return v * (P.MOOD_SPEED_BASE + P.MOOD_SPEED_PER * u.mood)
}

// Chance that this person, walking a field, finds a hill with visible lesions.
export function scoutChance(u: Unit): number {
  let p = Math.min(P.SCOUT_MAX, P.SCOUT_BASE + P.SCOUT_PER * u.skills.field)
  if (u.trait === 'sharp') p += P.SHARP_SCOUT
  if (u.trait === 'careless') p -= P.CARELESS_SCOUT
  return p < 0.05 ? 0.05 : p > 0.95 ? 0.95 : p
}

// Share of full protection this person's spraying lays down.
export function sprayCover(u: Unit): number {
  return Math.min(1, P.SPRAY_BASE + P.SPRAY_PER * resultLevel(u, 'machine'))
}

export function jobSkill(kind: JobKind): Skill {
  return P.JOB_SKILL[kind]
}

// Whether this person will do this kind of order at all.
export function willDo(u: Unit, kind: JobKind): boolean {
  return u.foreman === '' && u.prio[jobSkill(kind)] > 0
}

// Dollars a month actually paid: a foreman earns 40% more.
export function payOf(u: Unit): number {
  return u.foreman ? Math.round(u.wage * P.FOREMAN_PAY) : u.wage
}

export function hiredCount(c: Campaign): number {
  let n = 0
  for (const u of c.crew) if (u.kind !== 'farmer') n++
  return n
}

// Beds in the bunkhouses the farm has built (one in the Dufour yard only while Dufour land is held).
export function beds(c: Campaign): number {
  let n = 0
  for (const b of c.buildings) if (b.kind === 'bunk' && b.built && (b.yard === HOME_YARD || holdsDufourLand(c.fields))) n++
  return n * P.BUNK_BEDS
}

// How many hired people the farm can house: two live out, the rest in bunkhouse beds.
export function housingLimit(c: Campaign): number {
  return P.HOUSED_OUT + beds(c)
}

// Whether a hired person has a bed in the bunkhouse: the first hired take the beds.
export function hasBed(c: Campaign, u: Unit): boolean {
  if (u.kind === 'farmer') return false
  let k = 0
  for (const x of c.crew) {
    if (x.kind === 'farmer') continue
    if (x === u) return k < beds(c)
    k++
  }
  return false
}

// The mood a person is drawn toward today.
export function moodTarget(c: Campaign, u: Unit, fieldsIn: number): number {
  let t = P.MOOD_BASE
  if (hasBed(c, u)) t += P.MOOD_BED
  if (u.ask > 0) t += P.MOOD_PAY * (u.wage - u.ask) / u.ask
  if (u.tired > P.MOOD_TIRED_FROM) t -= P.MOOD_TIRED * (u.tired - P.MOOD_TIRED_FROM)
  t += P.MOOD_PER_FIELD * fieldsIn
  for (const o of c.crew) if (o !== u && o.trait === 'cheerful') t += P.CHEERFUL_OTHERS
  return t < 0 ? 0 : t > 1 ? 1 : t
}

export function tiredWord(t: number): string {
  return t >= 0.85 ? 'worn out' : t >= 0.6 ? 'tired' : t >= 0.3 ? 'weary' : 'fresh'
}

export function moodWord(m: number): string {
  return m >= 0.85 ? 'happy' : m >= 0.65 ? 'content' : m >= 0.45 ? 'fed up' : m >= 0.25 ? 'unhappy' : 'about to quit'
}

// Puts days of a person's time at a kind of work into their experience; returns each level gained.
export function gainXp(u: Unit, skill: Skill, days: number): number[] {
  const levels: number[] = []
  if (days <= 0) return levels
  u.xp[skill] += days
  while (u.skills[skill] < P.SKILL_MAX && u.xp[skill] >= xpNeed(u.skills[skill])) {
    u.xp[skill] -= xpNeed(u.skills[skill])
    u.skills[skill]++
    levels.push(u.skills[skill])
  }
  if (u.skills[skill] >= P.SKILL_MAX) u.xp[skill] = 0
  return levels
}

// Points needed to go from this level to the next.
export function xpNeed(level: number): number {
  return P.XP_BASE + P.XP_PER_LEVEL * level
}
