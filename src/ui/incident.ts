// A decision from outside the farm (design/incident.html): a telegram, with the clock stopped. Who it is from, what
// happened and to whom, the days left to answer, and the replies numbered with their keys, each with what it does and
// what it costs set against the other. Put away, it waits as a mark on the time book.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { ringFor } from './crew.ts'
import { answerSpray, putSprayAway, SPRAY_WAYS, sprayAsking, sprayWay } from './people.ts'
import { firstName, jobText, SKILL_NAME } from './rules.ts'
import { fist, key, stamp } from './system/parts.ts'
import { agentLine } from './tutorial.ts'
import { portrait, ringed } from './system/people.ts'

export interface IncidentCard {
  el: HTMLElement
  update(c: S.Campaign): void
  // Opens the first incident waiting, or the one named.
  open(id?: number): void
  // Puts the telegram away; it stays waiting. False when none was up.
  putAway(): boolean
  // Incidents waiting for an answer whose telegram is not up.
  waiting(c: S.Campaign): S.IncidentInfo[]
  isUp(): boolean
  // Answers the telegram that is up with its reply numbered n (1, 2, ...). False when none is up or n is not a reply.
  reply(n: number): boolean
}

// Who sends each kind of telegram.
const FROM: Record<S.IncidentKind, [string, string]> = {
  applicant: ['The hiring hall', 'hands and operators, by the season'],
  poach: ['A neighboring farm', 'an offer for one of your people'],
  breakdown: ['Grange Supply', 'equipment, parts and repairs'],
  buyer: ['A produce buyer', 'cash for a whole lot, this week only'],
}

export function incidentCard(ctx: Ctx): IncidentCard {
  const app = ctx.app
  const el = h('section', { class: 'telegram sheet sys incident', testid: 'incident', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'incident-title', hidden: true })
  const away = new Set<number>()
  let shown = -1
  let seen = new Set<number>()
  let err = ''

  // What each reply costs against the other, in plain words: the figure that differs, or that it costs nothing.
  function cost(c: S.Campaign, inc: S.Incident | undefined, ch: S.IncidentChoice): Child {
    const red = (t: string) => h('span', { class: 'c-red num' }, t)
    if (!inc) return null
    const u = inc.unit !== undefined ? c.crew.find(x => x.id === inc.unit) : undefined
    switch (ch.id) {
      case 'rush': return [red(F.money(S.RUSH_PART)), ' more than waiting']
      case 'hire': return inc.applicant ? [red(F.money(inc.applicant.ask)), ' a month in wages'] : null
      case 'match': return u && inc.wage ? [red(F.money(inc.wage - u.wage)), ' a month more'] : null
      case 'take': {
        const lot = c.lots.find(l => l.id === inc.lot)
        const v = lot ? S.lotValue(app.world, c, lot) : 0
        return v ? [h('span', { class: 'c-green num' }, F.money(v * S.BUYER_PREMIUM)), ' more than today\'s market price'] : null
      }
      case 'let': return u ? (u.mood < S.POACH_MOOD ? [h('span', { class: 'c-red' }, `${firstName(u.name)} leaves`)] : 'Costs nothing if they stay') : 'Costs nothing'
      default: return 'Costs nothing'
    }
  }

  // Who it is about: the person a neighbour wants or who was driving, or the one asking for work.
  function about(c: S.Campaign, inc: S.Incident | undefined): Child {
    if (!inc) return icon('help', 'i')
    if (inc.applicant) return portrait(inc.applicant, 52)
    const u = inc.unit !== undefined ? c.crew.find(x => x.id === inc.unit) : undefined
    return u ? ringed(u, ringFor(c, u.id), 52) : icon('ask', 'i tg-ic')
  }

  // The line under the title: who, doing what, and what follows.
  function who(c: S.Campaign, inc: S.Incident | undefined, info: S.IncidentInfo): Child {
    if (inc?.applicant) {
      const a = inc.applicant
      const best = [...S.SKILLS].sort((x, y) => a.skills[y] - a.skills[x])[0]
      return [h('b', null, a.name), `, best at ${SKILL_NAME[best].toLowerCase()} (${a.skills[best]}), ${S.TRAITS[a.trait].name.toLowerCase()}.`]
    }
    // A breakdown says whose tractor and what it was at, as a telegram would.
    if (inc?.kind === 'breakdown' && inc.back !== undefined) {
      const u = c.crew.find(x => x.id === inc.unit)
      const j = u && c.season ? c.season.jobs.find(x => x.id === u.job) : undefined
      return [u ? [h('b', null, u.kind === 'farmer' ? 'You' : firstName(u.name)), u.kind === 'farmer' ? ' were driving it' : ' was driving it', j ? `, ${jobText(j, c, j.building).replace(/^./, x => x.toLowerCase())}` : '', '. '] : '',
        'If you wait for the part, it\'ll be running again on ', h('b', null, F.date(c.year, inc.back, true)), '.']
    }
    return F.localize(info.text)
  }

  function answer(c: S.Campaign, info: S.IncidentInfo, ch: S.IncidentChoice): void {
    const r = app.do({ t: 'answer', incident: info.id, choice: ch.id })
    if (!r.ok) { err = F.localize(r.err); ctx.announce(err); ctx.dirty(); return }
    err = ''
    shown = -1
    app.holding = ''
    ctx.announce(F.localize(r.events[0]?.text ?? `${ch.label}.`))
    // The game stopped the clock for this; with nothing else asking, the days go on at the speed they had.
    if (!S.incidentInfo(c).some(x => !away.has(x.id)) && !ctx.papers.isOpen()) app.resumeAfterCard()
  }

  // What a choice does, in the grower's words: whether someone stays is told by how they feel, not by a figure.
  function does(c: S.Campaign, inc: S.Incident | undefined, ch: S.IncidentChoice): string {
    if (ch.id === 'let' && inc) {
      const u = c.crew.find(x => x.id === inc.unit)
      if (u) return u.mood < S.POACH_MOOD ? `${firstName(u.name)} isn't happy enough here and will leave.` : `${firstName(u.name)} is ${S.moodWord(u.mood)} here and will stay.`
    }
    return F.localize(ch.does)
  }

  function body(c: S.Campaign, info: S.IncidentInfo): Child {
    const inc = c.incidents.find(x => x.id === info.id)
    const fallback = info.choices.find(x => x.id === info.fallback)
    const [from, trade] = FROM[info.kind]
    const keys = !ctx.touch()
    return [
      h('header', { class: 'tg-head' },
        h('p', { class: 'tg-name', 'aria-hidden': 'true' }, 'Telegram'),
        h('p', { class: 'tg-from' }, h('span', { class: 't-label' }, 'From'), ' ', h('b', null, from), ' ', h('span', { class: 't-caption' }, trade)),
        h('p', { class: 'days', 'aria-label': info.daysLeft <= 1 ? 'Answer today' : `${info.daysLeft} days to answer` }, h('b', { class: 'num' }, String(Math.max(1, info.daysLeft))), h('span', { class: 't-label' }, info.daysLeft <= 1 ? 'today' : 'days')),
        h('button', { class: 'close tg-later', type: 'button', testid: 'incident-later', 'aria-label': `Decide later${keys ? ' (Escape)' : ''}`, title: keys ? 'Decide later (Escape)' : undefined, onclick: () => putAway() }, icon('close', 'i'))),
      h('div', { class: 'tg-body' },
        about(c, inc),
        h('div', null, h('h2', { id: 'incident-title' }, F.localize(info.title)), h('p', null, who(c, inc, info)))),
      agentLine('telegram', `${c.seed}:${c.year}:${info.id}`),
      h('div', { class: `replies${info.choices.length > 2 ? ' three' : ''}` }, info.choices.map((ch, k) => ch.ok
        ? h('button', { class: `reply${ch.id === info.fallback ? '' : ' first'}`, type: 'button', testid: `answer-${ch.id}`, 'aria-keyshortcuts': keys ? String(k + 1) : null, onclick: () => answer(c, info, ch) },
          key(String(k + 1)), h('b', { class: 'c-title' }, ch.label), h('span', { class: 'c-does' }, does(c, inc, ch)), h('span', { class: 'c-cost' }, cost(c, inc, ch)))
        : h('div', { class: 'reply off', testid: `answer-${ch.id}-off` }, key(String(k + 1)), h('b', { class: 'c-title' }, ch.label), h('span', { class: 'c-does' }, F.localize(ch.why))))),
      err ? h('p', { class: 'tg-err c-red', role: 'status' }, err) : null,
      fallback ? h('p', { class: 'lapse' }, stamp(`Expires ${F.date(c.year, info.until + 1, true)}`, { small: true, ink: 'violet' }), ` If you don't answer: ${fallback.label.toLowerCase()}.`) : null,
    ]
  }

  // The spraying question, asked once when blight weather first comes, on this same card (people.ts).
  function sprayBody(c: S.Campaign): Child {
    const keys = !ctx.touch()
    const now = sprayWay(c)
    return h('div', { testid: 'spray-ask' },
      h('header', { class: 'tg-head' },
        h('p', { class: 'tg-name', 'aria-hidden': 'true' }, 'Telegram'),
        h('p', { class: 'tg-from' }, h('span', { class: 't-label' }, 'From'), ' ', h('b', null, 'The county agent'), ' ', h('span', { class: 't-caption' }, 'blight weather is here')),
        h('button', { class: 'close tg-later', type: 'button', testid: 'spray-ask-close', 'aria-label': `Decide later${keys ? ' (Escape)' : ''}`, title: keys ? 'Decide later (Escape)' : undefined, onclick: () => putAway() }, icon('close', 'i'))),
      h('div', { class: 'tg-body' },
        icon('spray', 'i tg-ic'),
        h('div', null, h('h2', { id: 'incident-title' }, 'Spraying this season'), h('p', null, 'Blight can wipe out a field in one wet week, and a spray protects it for about a week.'))),
      h('div', { class: 'replies three' }, SPRAY_WAYS.map((w, k) => h('button', {
        class: `reply${w.id === 'auto' ? ' first' : ''}${now === w.id ? ' is-on' : ''}`, type: 'button', testid: `spray-way-${w.id}`, 'aria-keyshortcuts': keys ? String(k + 1) : null,
        'aria-pressed': now ? String(now === w.id) : null, onclick: () => answerSprayHere(c, w.id),
      }, key(String(k + 1)), h('b', { class: 'c-title' }, w.name, w.id === 'auto' ? fist() : null),
      h('span', { class: 'c-does' }, w.id === 'auto' ? h('b', { class: 'usual', testid: 'spray-usual' }, 'The usual choice. ') : null, sprayShort(c, w.id))))))
  }

  // The card's own few words for each way; the people's sheet has the long ones.
  function sprayShort(c: S.Campaign, way: 'auto' | 'ask' | 'none'): string {
    if (way === 'ask') return 'A stamp shows up when a field needs spraying.'
    if (way === 'none') return 'Nothing stops blight if it comes.'
    const o = S.sprayOutlook(app.world, c)
    return o.dollars > 0 ? `Your crew handles it automatically, for about ${F.money(o.dollars)} this season.` : 'Your crew handles it automatically.'
  }

  function answerSprayHere(c: S.Campaign, way: 'auto' | 'ask' | 'none'): void {
    answerSpray(ctx, c, way)
    if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    app.holding = ''
    if (!S.incidentInfo(c).some(x => !away.has(x.id)) && !ctx.papers.isOpen()) app.resumeAfterCard()
  }

  function update(c: S.Campaign): void {
    const all = c.phase === 'season' ? S.incidentInfo(c) : []
    const ids = new Set(all.map(x => x.id))
    for (const id of [...away]) if (!ids.has(id)) away.delete(id)
    // A new incident comes up by itself; one put away waits for the player.
    const fresh = all.find(x => !seen.has(x.id) && !away.has(x.id))
    seen = new Set([...seen].filter(id => ids.has(id)))
    for (const x of all) seen.add(x.id)
    if (fresh && shown < 0) { shown = fresh.id; err = '' }
    if (shown >= 0 && !ids.has(shown)) shown = -1
    const info = all.find(x => x.id === shown)
    const spray = !info && c.phase === 'season' && sprayAsking()
    const orClose = ctx.touch() ? 'Reply, or close it to keep playing.' : 'Reply, or press Escape to close it and keep playing.'
    app.holding = info ? `This telegram needs an answer. ${orClose}` : spray ? `This question needs an answer. ${orClose}` : ''
    if (spray && !ctx.papers.isOpen()) {
      const was = el.hidden || el.classList.contains('out')
      el.classList.remove('out')
      el.hidden = false
      patch(el, JSON.stringify(['spray', sprayWay(c), ctx.touch(), Math.round(S.sprayOutlook(app.world, c).dollars / 50)]), () => sprayBody(c))
      if (was) {
        if (!ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
        ctx.announce('Telegram. Spraying this season: keep the fields sprayed, ask me each time, or not this year.')
        requestAnimationFrame(() => el.querySelector<HTMLElement>('.reply.first')?.focus({ preventScroll: true }))
      }
      return
    }
    if (!info || ctx.papers.isOpen()) {
      if (!el.hidden && !ctx.reduced()) {
        el.classList.add('out')
        setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
      } else el.hidden = true
      return
    }
    const was = el.hidden || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    patch(el, JSON.stringify([info, err, ctx.touch(), c.crew.map(u => [u.id, u.wage, Math.round(u.mood * 20)])]), () => body(c, info))
    if (was) {
      if (!ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
      ctx.announce(`Telegram. ${F.localize(info.title)}. ${F.localize(info.text)}`)
    }
  }

  function open(id?: number): void {
    const c = app.campaign
    if (!c) return
    const all = S.incidentInfo(c)
    const pick = id !== undefined ? all.find(x => x.id === id) : all[0]
    if (!pick) return
    away.delete(pick.id)
    shown = pick.id
    err = ''
    ctx.dirty()
    requestAnimationFrame(() => el.querySelector<HTMLElement>('.reply.first, button.reply')?.focus({ preventScroll: true }))
  }

  function putAway(): boolean {
    if (shown < 0 && putSprayAway(ctx)) {
      app.holding = ''
      if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      const c = app.campaign
      if (c && !S.incidentInfo(c).some(x => !away.has(x.id)) && !ctx.papers.isOpen()) app.resumeAfterCard()
      return true
    }
    if (shown < 0) return false
    away.add(shown)
    shown = -1
    app.holding = ''
    ctx.dirty()
    const c = app.campaign
    if (c && !S.incidentInfo(c).some(x => !away.has(x.id)) && !ctx.papers.isOpen()) app.resumeAfterCard()
    return true
  }

  function reply(n: number): boolean {
    const c = app.campaign
    if (c && shown < 0 && sprayAsking() && SPRAY_WAYS[n - 1]) { answerSprayHere(c, SPRAY_WAYS[n - 1].id); return true }
    if (!c || shown < 0) return false
    const info = S.incidentInfo(c).find(x => x.id === shown)
    const ch = info?.choices[n - 1]
    if (!info || !ch) return false
    if (ch.ok) answer(c, info, ch)
    else { err = F.localize(ch.why); ctx.dirty() }
    return true
  }

  return {
    el, update, open, putAway, reply,
    waiting: c => (c.phase === 'season' ? S.incidentInfo(c) : []).filter(x => x.id !== shown),
    isUp: () => shown >= 0 || sprayAsking(),
  }
}
