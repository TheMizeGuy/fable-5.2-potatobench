// Something has happened that asks for a decision: one card, with the clock stopped, saying what happened and to whom,
// each choice with what it does, and the day it lapses to its default. Put away, it waits as a marker on the people bar.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { portrait } from './people.ts'
import { SKILL_NAME } from './rules.ts'

export interface IncidentCard {
  el: HTMLElement
  update(c: S.Campaign): void
  // Opens the first incident waiting, or the one named.
  open(id?: number): void
  // Puts the card away; it stays waiting. False when none was up.
  putAway(): boolean
  // Incidents waiting for an answer whose card is not up.
  waiting(c: S.Campaign): S.IncidentInfo[]
  isUp(): boolean
}

const GLYPH: Record<S.IncidentKind, string> = { applicant: 'hire', poach: 'unhappy', breakdown: 'tractor', buyer: 'sell' }

export function incidentCard(ctx: Ctx): IncidentCard {
  const app = ctx.app
  const el = h('section', { class: 'incident instrument', testid: 'incident', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'incident-title', hidden: true })
  const away = new Set<number>()
  let shown = -1
  let seen = new Set<number>()
  let err = ''

  // Who it is about: the person a neighbour wants or who was driving, or the one asking for work.
  function about(c: S.Campaign, inc: S.Incident | undefined): Child {
    if (!inc) return null
    if (inc.applicant) {
      const a = inc.applicant
      const top = [...S.SKILLS].sort((x, y) => a.skills[y] - a.skills[x]).slice(0, 3)
      return h('p', { class: 'inc-who' }, icon('hire', 'ic s'), h('strong', null, a.name),
        h('span', { class: 'inc-skills num' }, top.map(k => h('span', null, `${SKILL_NAME[k]} ${a.skills[k]}`))),
        h('span', { class: 'sub' }, S.TRAITS[a.trait].name))
    }
    const u = inc.unit !== undefined ? c.crew.find(x => x.id === inc.unit) : undefined
    if (!u) return null
    return h('p', { class: 'inc-who' }, portrait(u.id, 'portrait s'), h('strong', null, u.name === S.FARMER_NAME ? 'You' : u.name),
      h('span', { class: 'sub' }, inc.kind === 'breakdown' ? 'was driving' : `${F.money(u.wage)} a month here, ${S.moodWord(u.mood)}`))
  }

  function answer(c: S.Campaign, info: S.IncidentInfo, ch: S.IncidentChoice): void {
    const r = app.do({ t: 'answer', incident: info.id, choice: ch.id })
    if (!r.ok) { err = F.localize(r.err); ctx.announce(err); ctx.dirty(); return }
    err = ''
    shown = -1
    ctx.announce(F.localize(r.events[0]?.text ?? `${ch.label}.`))
    // The game stopped the clock for this; with nothing else asking, the days go on at the pace of play.
    if (app.speed === 0 && app.pauseReason && !S.incidentInfo(c).some(x => !away.has(x.id)) && !ctx.papers.isOpen()) app.setSpeed(1)
  }

  function body(c: S.Campaign, info: S.IncidentInfo): Child {
    const inc = c.incidents.find(x => x.id === info.id)
    const fallback = info.choices.find(x => x.id === info.fallback)
    return [
      h('header', { class: 'inc-head' },
        h('span', { class: 'inc-glyph' }, icon(GLYPH[info.kind])),
        h('div', null,
          h('h2', { class: 't-head', id: 'incident-title' }, info.title),
          h('p', { class: 'card-sub' }, info.daysLeft <= 1 ? 'Answer today' : `${info.daysLeft} days to answer`)),
        h('button', { class: 'nicon', type: 'button', testid: 'incident-later', 'aria-label': `Decide later${ctx.touch() ? '' : ' (Escape)'}`, title: ctx.touch() ? undefined : 'Decide later', onclick: () => putAway() }, icon('close'))),
      h('p', { class: 'inc-text' }, F.localize(info.text)),
      about(c, inc),
      h('div', { class: 'inc-choices' }, info.choices.map(ch => ch.ok
        ? h('button', { class: `choice${ch.id === info.fallback ? '' : ' first'}`, type: 'button', testid: `answer-${ch.id}`, onclick: () => answer(c, info, ch) },
          h('strong', null, ch.label), h('span', { class: 'choice-does' }, F.localize(ch.does)))
        : h('div', { class: 'choice off', testid: `answer-${ch.id}-off` }, h('strong', null, ch.label), h('span', { class: 'choice-does' }, F.localize(ch.why))))),
      err ? h('p', { class: 'card-line flash lv-warn', role: 'status' }, err) : null,
      fallback ? h('p', { class: 'inc-lapse' }, `Left unanswered, on ${F.date(c.year, info.until + 1, true)}: ${fallback.label.toLowerCase()}.`) : null,
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
      ctx.announce(`${info.title}. ${F.localize(info.text)}`)
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
    requestAnimationFrame(() => el.querySelector<HTMLElement>('.choice.first, .choice')?.focus({ preventScroll: true }))
  }

  function putAway(): boolean {
    if (shown < 0) return false
    away.add(shown)
    shown = -1
    ctx.dirty()
    return true
  }

  return {
    el, update, open, putAway,
    waiting: c => (c.phase === 'season' ? S.incidentInfo(c) : []).filter(x => x.id !== shown),
    isUp: () => shown >= 0,
  }
}

