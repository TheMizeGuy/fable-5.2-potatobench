// A decision from outside the farm (design/incident.html): a telegram, with the clock stopped. Who it is from, what
// happened and to whom, the days left to answer, and the replies numbered with their keys, each with what it does and
// what it costs set against the other. Put away, it waits as a mark on the time book.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { ringFor } from './crew.ts'
import { firstName, jobText, SKILL_NAME } from './rules.ts'
import { key, stamp } from './system/parts.ts'
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
  poach: ['A neighbouring farm', 'an offer for one of your people'],
  breakdown: ['Grange Supply', 'implements, parts and repairs'],
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
        return v ? [h('span', { class: 'c-green num' }, F.money(v * S.BUYER_PREMIUM)), ' more than the market today'] : null
      }
      case 'let': return u ? (u.mood < S.POACH_MOOD ? [h('span', { class: 'c-red' }, `${firstName(u.name)} goes`)] : 'Costs nothing, if they stay') : 'Costs nothing'
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
      return [u ? ['Under ', h('b', null, u.kind === 'farmer' ? 'you' : firstName(u.name)), j ? `, ${jobText(j, c, j.building).replace(/^./, x => x.toLowerCase())}` : '', '. '] : '',
        'Waiting for the part, it is back on ', h('b', null, F.date(c.year, inc.back, true)), '.']
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
      if (u) return u.mood < S.POACH_MOOD ? `${firstName(u.name)} is not happy enough here, and goes.` : `${firstName(u.name)} is ${S.moodWord(u.mood)} here, and stays.`
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
      h('div', { class: `replies${info.choices.length > 2 ? ' three' : ''}` }, info.choices.map((ch, k) => ch.ok
        ? h('button', { class: `reply${ch.id === info.fallback ? '' : ' first'}`, type: 'button', testid: `answer-${ch.id}`, 'aria-keyshortcuts': keys ? String(k + 1) : null, onclick: () => answer(c, info, ch) },
          key(String(k + 1)), h('b', { class: 'c-title' }, ch.label), h('span', { class: 'c-does' }, does(c, inc, ch)), h('span', { class: 'c-cost' }, cost(c, inc, ch)))
        : h('div', { class: 'reply off', testid: `answer-${ch.id}-off` }, key(String(k + 1)), h('b', { class: 'c-title' }, ch.label), h('span', { class: 'c-does' }, F.localize(ch.why))))),
      err ? h('p', { class: 'tg-err c-red', role: 'status' }, err) : null,
      fallback ? h('p', { class: 'lapse' }, stamp(`Lapses ${F.date(c.year, info.until + 1, true)}`, { small: true, ink: 'violet' }), ` Unanswered: ${fallback.label.toLowerCase()}.`) : null,
    ]
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
    app.holding = info ? 'A telegram wants an answer. Answer it, or put it away (Escape) to go on.' : ''
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
    isUp: () => shown >= 0,
  }
}
