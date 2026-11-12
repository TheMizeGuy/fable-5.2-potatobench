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
  poach: 'A neighbor wants one of your people',
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
      return `${a.name} is looking for work at $${withCommas(a.ask)} a month. Their best skill is ${SKILL_LABEL[best]} (level ${a.skills[best]}), and their trait is ${P.TRAITS[a.trait].name.toLowerCase()}.`
    }
    case 'poach': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u ? `A neighbor has offered ${u.name} $${withCommas(inc.wage!)} a month. You pay $${withCommas(u.wage)}.` : 'The neighbor\'s offer has expired.'
    }
    case 'breakdown':
      return `If you wait for the part, the tractor will be back on ${day(inc.back!)}.`
    case 'buyer': {
      const lot = c.lots.find(l => l.id === inc.lot)
      return lot ? `A buyer is offering 10% over the market price for all ${withCommas(lotCwt(lot))} cwt of your ${variety(lot.variety).name}, this week only.` : 'The buyer has left.'
    }
  }
}

// What a choice does, in one sentence.
export function choiceDoes(c: Campaign, inc: Incident, choice: string): string {
  switch (choice) {
    case 'hire': return `${inc.applicant!.name} starts at $${withCommas(inc.applicant!.ask)} a month, with their own skills and trait.`
    case 'pass': return inc.kind === 'buyer' ? 'You keep the lot to sell or store later.' : 'They\'ll look for work elsewhere.'
    case 'match': return `Their wage goes up ${Math.round(P.POACH_RAISE * 100)}% to $${withCommas(inc.wage!)} a month.`
    case 'let': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u && u.mood < P.POACH_MOOD ? `${u.name} isn't happy here and will leave.` : `${u?.name ?? 'They'} will stay only if happy enough here, and will leave if their mood is under ${P.POACH_MOOD}.`
    }
    case 'rush': return `It costs $${withCommas(P.RUSH_PART)}, and the tractor is back tomorrow.`
    case 'wait': return `It's free, and the tractor is back on ${formatDay(c.year, inc.back!)}.`
    case 'take': return 'You sell the whole lot now for 10% more than today\'s market price.'
    case 'refuse': return 'You keep the lot to sell or store later.'
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
