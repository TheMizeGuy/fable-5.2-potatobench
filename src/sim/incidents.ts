// Incidents: things that happen in the season and ask for a decision, what each choice does, and the default taken
// when nobody answers.
import { formatDay, withCommas } from './calendar.ts'
import { lotCwt } from './harvest.ts'
import * as P from './params.ts'
import { SKILL_LABEL, bestSkill } from './people.ts'
import type { Campaign, Incident, IncidentKind, Unit } from './types.ts'
import { variety } from './varieties.ts'

export const INCIDENT_TITLE: Record<IncidentKind, string> = {
  applicant: 'Someone asks for work',
  poach: 'A neighbour wants one of your people',
  breakdown: 'A tractor has broken down',
  buyer: 'A buyer stops in',
}

export const CHOICE_LABEL: Record<string, string> = {
  hire: 'Take them on', pass: 'Not now',
  match: 'Match the offer', let: 'Let them choose',
  rush: 'Pay for a rush part', wait: 'Wait for the part',
  take: 'Take the offer', refuse: 'Turn it down',
}

// The situation in plain words.
export function incidentText(c: Campaign, inc: Incident): string {
  const day = (d: number) => formatDay(c.year, d)
  switch (inc.kind) {
    case 'applicant': {
      const a = inc.applicant!
      const best = bestSkill(a.skills)
      return `${a.name} is looking for work: best at ${SKILL_LABEL[best]} (level ${a.skills[best]}), ${P.TRAITS[a.trait].name.toLowerCase()}, asking $${withCommas(a.ask)} a month.`
    }
    case 'poach': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u ? `A neighbour has offered ${u.name} $${withCommas(inc.wage!)} a month, against the $${withCommas(u.wage)} paid here.` : 'The neighbour\'s offer has lapsed.'
    }
    case 'breakdown':
      return `A tractor has broken down. Waiting for the part, it is back on ${day(inc.back!)}.`
    case 'buyer': {
      const lot = c.lots.find(l => l.id === inc.lot)
      return lot ? `A buyer offers 10% over the market for all ${withCommas(lotCwt(lot))} cwt of ${variety(lot.variety).name}, this week only.` : 'The buyer has gone.'
    }
  }
}

// What a choice does, in one sentence.
export function choiceDoes(c: Campaign, inc: Incident, choice: string): string {
  switch (choice) {
    case 'hire': return `${inc.applicant!.name} starts at $${withCommas(inc.applicant!.ask)} a month, with their own skills and trait.`
    case 'pass': return inc.kind === 'buyer' ? 'The lot stays to be sold or stored as before.' : 'They look elsewhere.'
    case 'match': return `The wage goes up ${Math.round(P.POACH_RAISE * 100)}%, to $${withCommas(inc.wage!)} a month.`
    case 'let': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u && u.mood < P.POACH_MOOD ? `${u.name} is not happy here and will go.` : `${u?.name ?? 'They'} may stay if happy enough here: they go if their mood is under ${P.POACH_MOOD}.`
    }
    case 'rush': return `$${withCommas(P.RUSH_PART)}, and the tractor is back tomorrow.`
    case 'wait': return `The tractor is back on ${formatDay(c.year, inc.back!)}, for nothing.`
    case 'take': return 'The whole lot is sold now at 10% over what it would fetch on the market today.'
    case 'refuse': return 'The lot stays to be sold or stored as before.'
  }
  return ''
}

// Chance that a tractor breaks down under this driver today: likelier with long hours (the driver's tiredness), half
// as likely with a machine shed.
export function breakdownChance(u: Unit, shed: boolean): number {
  return P.BREAK_CHANCE * (1 + P.BREAK_TIRED * u.tired) * (shed ? P.BREAK_SHED : 1)
}

// Chance that someone working in the woods or on a machine today is hurt: only when worn out, never for the slow
// and sure.
export function hurtChance(u: Unit): number {
  return u.tired > P.HURT_TIRED && u.trait !== 'slow' ? P.HURT_CHANCE : 0
}

// The choice taken when nobody answers: the last on the list.
export function defaultChoice(inc: Incident): string {
  return inc.choices[inc.choices.length - 1]
}
