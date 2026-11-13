// Who is that: a click on a person on the land opens their card beside the point clicked, tied to them (tie.ts; a
// sheet from the bottom on a phone); a click on anything else that looks like someone (a machine, a caller, a picker,
// an animal) gives its name the same way. Before any click, the pointer over a person or a thing shows its name
// and a mark on the ground. In every phase where people are on the land.
import type { Thing } from '../game/contracts.ts'
import * as S from '../sim/index.ts'
import { confirmPaper, patch, type Ctx } from './core.ts'
import { doingWord, openCrew, ringFor } from './crew.ts'
import { personNow } from './now.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { moodSaid, restControl, restWords } from './people.ts'
import { firstName, jobText, KIND_NAME, LET_GO_TEXT, moodWhy, personSign, SKILL_NAME, skillCovers } from './rules.ts'
import { ringed } from './system/people.ts'
import { anchored, ties } from './tie.ts'
import './whois.css'

const SKILL_CUT: Record<S.Skill, string> = { machine: 'machine', field: 'field', woods: 'woods', build: 'hammer', pack: 'pack' }
const SKILL_SHORT: Record<S.Skill, string> = { machine: 'Machine', field: 'Field', woods: 'Woods', build: 'Build', pack: 'Pack' }
const WINTER_WORDS: Record<S.WinterWork, string> = { off: 'Off', woods: 'Woods', pack: 'Pack', build: 'Build' }

export interface Whois {
  el: HTMLElement
  update(): void
  frame(): void
  // The foot of the window its sheet covers on a phone, in pixels (0 at a desk).
  inset(): number
  // Puts away whatever is open; false when nothing was.
  escape(): boolean
  dispose(): void
}

// What a thing is, in a name and a line.
function thingWords(c: S.Campaign, t: Thing, touch = false): { name: string; line: string; glyph: string } {
  const who = (id: number) => { const u = c.crew.find(x => x.id === id); return u ? (u.kind === 'farmer' ? 'You\'re' : `${firstName(u.name)} is`) : '' }
  switch (t.kind) {
    case 'tractor': case 'truck': {
      const name = t.kind === 'tractor' ? (t.k ? `Your ${t.k === 1 ? 'second' : 'third'} tractor` : 'Your tractor') : 'Your truck'
      const holder = t.holder >= 0 ? who(t.holder) : ''
      const job = holder && c.season ? c.season.jobs.find(j => c.crew.find(u => u.id === t.holder)?.job === j.id) : undefined
      return { name, glyph: t.kind === 'tractor' ? 'machine' : 'haul', line: holder ? `${holder} using it${job ? `, ${jobText(job, c, job.building).replace(/^./, x => x.toLowerCase())}` : ''}.` : c.phase === 'season' ? 'Nobody is using it. It\'s parked where it was left, free for whoever needs it next.' : 'In the shed until the season starts.' }
    }
    case 'asking': {
      const a = c.applicants[t.k]
      return { name: a ? a.name : 'Someone at the gate', glyph: 'hire', line: a ? `Looking for work at ${F.money(a.ask)} a month.` : 'Looking for work.' }
    }
    case 'neighbour': return { name: t.k ? 'The neighbor\'s truck' : 'A neighbor', glyph: 'ask', line: 'Here to offer one of your people more pay. The telegram says how much.' }
    case 'buyer': return { name: t.k ? 'The buyer\'s car' : 'A produce buyer', glyph: 'sell', line: 'Here to buy a whole lot for more than the market price. The telegram has the offer.' }
    case 'picker': return { name: 'A picker', glyph: 'pickers', line: 'Hired by the day to help while the crop is being dug.' }
    case 'cow': return { name: 'The neighbor\'s cows', glyph: 'rest', line: 'Grazing in his pasture by the home yard. They aren\'t yours.' }
    case 'deer': return { name: 'A deer', glyph: 'woods', line: 'At the edge of the woods. It slips into the trees when anyone gets close.' }
    case 'yard': {
      const built = c.buildings.filter(b => b.yard === t.k && b.built).map(b => S.BUILDINGS[b.kind].name.toLowerCase())
      const stands = t.k === S.HOME_YARD ? ['the farmhouse', 'the potato house', ...built] : built
      return {
        name: t.k === S.HOME_YARD ? 'The home yard' : 'The Dufour yard', glyph: 'house',
        line: `${stands.length ? `${F.upper(F.list(stands))}.` : 'Nothing is built here yet.'} You can build here during the season${touch ? ' by tapping the yard' : '. Press Y, or click the yard'}.`,
      }
    }
  }
}

export function whois(ctx: Ctx, layer: HTMLElement): Whois {
  const app = ctx.app
  const card = h('section', { class: 'whois sheet sys', testid: 'whois', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'whois-name', hidden: true })
  const tcard = h('section', { class: 'whois thing sheet sys', testid: 'thing-card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'thing-name', hidden: true })
  const label = h('p', { class: 'hover-name', 'aria-hidden': 'true', hidden: true })
  const mark = h('i', { class: 'hover-mark', 'aria-hidden': 'true', hidden: true })
  const tied = { card: anchored(ctx, card), thing: anchored(ctx, tcard, { mark: true }) }
  const el = h('div', { class: 'whois-layer' }, mark, tied.card.parts, tied.thing.parts, label, card, tcard)
  layer.append(el)
  let shownFor = -1

  function phone(): boolean { return ctx.layout() === 'narrow' }

  // The person whose card is open: picked on the land, in any phase but the title. One card at a time: while a field
  // or a yard is in hand its card is the one up (orders given there still go to the person picked).
  function open(c: S.Campaign | null): S.PersonInfo | null {
    if (!c || app.screen === 'title' || app.unit < 0 || app.unitFrom !== 'land' || app.selection.length > 0 || app.yard !== 0) return null
    return S.peopleInfo(c).find(p => p.id === app.unit) ?? null
  }

  function run(cmd: S.Cmd, said: string): void {
    const r = ctx.run(cmd)
    if (r.ok) ctx.announce(said)
  }

  function body(c: S.Campaign, p: S.PersonInfo): Child {
    const farmer = p.kind === 'farmer'
    const name = farmer ? 'You' : p.name
    const ring = ringFor(c, p.id)
    const season = c.phase === 'season' && !!c.season
    // What they are at now, said as the time book says it (now.ts).
    const now = season ? personNow(c, p.id, S.jobWaits(app.world, c)) : null
    const busy = !!now && !['Idle', 'Waiting', 'Sunday'].includes(now.word)
    const lower = (t: string) => t.replace(/^./, x => x.toLowerCase())
    const detail = c.phase === 'cellar' ? lower(p.winterText) : !season ? 'waiting for the season to start' : now!.rest
    const sign = personSign(p, false)
    const best = [...S.SKILLS].sort((a, b) => p.skills[b] - p.skills[a])[0]
    const pulls = moodWhy(c, p)
    const keys = !ctx.touch()
    const place = ctx.view.unitPlace(p.id)
    return [
      h('header', { class: 'whois-head' },
        ringed(p, ring, 46),
        h('div', null,
          h('h2', { class: 't-head', id: 'whois-name', testid: 'whois-name' }, name),
          h('p', { class: 't-caption' }, farmer ? 'The farmer · every job, no wage' : `${KIND_NAME[p.kind]}${p.traitName ? ` · ${p.traitName.toLowerCase()}` : ''}`)),
        h('button', { class: 'close', type: 'button', testid: 'whois-close', 'aria-label': `Close${keys ? ' (Escape)' : ''}`, onclick: () => app.selectUnit(-1) }, icon('close', 'i'))),
      h('p', { class: 'whois-now', testid: 'whois-now' }, icon(now ? now.glyph : c.phase === 'cellar' ? 'winter' : 'idle', 'i'),
        h('span', null, h('b', null, now ? now.word : c.phase === 'cellar' ? 'This winter' : 'Spring'), ' ', h('span', { class: busy ? '' : 'quiet' }, detail))),
      // Where to look for them: on a machine they are its driver; off the land, indoors in the yard. Not said of
      // someone the line has at work in a field, which is where they are between days.
      place === 'machine' ? h('p', { class: 'whois-where quiet', testid: 'whois-where' }, icon('machine', 'i'), 'Driving, so look for the tractor.')
        : place === 'away' && c.phase !== 'cellar' && !(now && now.place >= 0 && busy) ? h('p', { class: 'whois-where quiet', testid: 'whois-where' }, icon('house', 'i'), 'Indoors in the yard, out of sight.') : null,
      h('dl', { class: 'whois-state' },
        h('div', null, h('dt', { class: p.tired >= S.HURT_TIRED ? 'c-red' : p.tired >= S.TIRED_SLOW_FROM ? 'c-ochre' : '' }, F.upper(p.tiredWord)),
          h('dd', null, sign?.glyph === 'hurt' ? `hurt, back on ${F.date(c.year, p.hurtUntil, true)}` : restWords(c, p))),
        h('div', null, h('dt', { class: p.quitIn >= 0 ? 'c-red' : p.mood < 0.45 ? 'c-ochre' : '' }, F.upper(p.moodWord)),
          h('dd', null, p.quitIn >= 0 ? `will quit in ${F.plural(p.quitIn, 'day')} unless their mood improves` : pulls.length ? moodSaid(pulls.slice(0, 2)) : 'no strong reasons either way')),
        h('div', null, h('dt', null, 'Best at'), h('dd', null, `${SKILL_NAME[best].toLowerCase()}, ${p.skills[best]} out of 10`)),
        h('div', null, h('dt', null, 'Pay'), h('dd', { class: 'num' }, farmer ? 'none. Your family\'s living costs come out at the end of the year.' : `${F.money(p.pay)} a month${p.foreman ? ' as foreman' : ''}`))),
      // The work they take first: one press puts a kind of work first for them.
      c.phase === 'cellar' ? h('div', { class: 'whois-first', role: 'group', 'aria-label': `${name} this winter` },
        h('span', { class: 't-label' }, 'This winter'),
        S.winterInfo(c).people.find(x => x.id === p.id)?.choices.map(ch => h('button', {
          class: `btn${p.winter === ch.work ? ' is-on' : ''}`, type: 'button', testid: `whois-winter-${ch.work}`, 'aria-pressed': String(p.winter === ch.work), disabled: !ch.ok && p.winter !== ch.work, title: ch.why || undefined,
          onclick: () => run({ t: 'winter', unit: p.id, work: ch.work, field: ch.work === 'woods' ? S.timberTracts(c)[0] : undefined }, `${name}: ${WINTER_WORDS[ch.work].toLowerCase()} this winter.`),
        }, WINTER_WORDS[ch.work]))) : p.foreman ? null : h('div', { class: 'whois-first prio-first', role: 'group', 'aria-label': `The work ${farmer ? 'you do' : `${name} does`} first` },
        h('span', { class: 't-label', title: keys ? `The work ${farmer ? 'you' : 'they'} do before anything else. Click one to put it first.` : undefined }, 'First priority'),
        S.SKILLS.map(k => h('button', {
          class: `key-btn${p.prio[k] === 1 ? ' is-on' : ''}${p.prio[k] === 0 ? ' never' : ''}`, type: 'button', testid: `whois-first-${k}`, 'aria-pressed': String(p.prio[k] === 1),
          title: `${SKILL_NAME[k]} work first: ${skillCovers(k).toLowerCase()}`,
          onclick: () => run({ t: 'priority', unit: p.id, work: k, level: 1 }, `${name}: ${SKILL_NAME[k].toLowerCase()} work first.`),
        }, icon(SKILL_CUT[k], 'i'), h('span', { class: 'key-name' }, SKILL_SHORT[k]), h('span', { class: 'sr' }, ' work first')))),
      restControl(ctx, c, p.id, 'whois-rest'),
      h('div', { class: 'whois-acts' },
        h('button', {
          class: `btn${ctx.view.followed() === p.id ? ' is-on' : ''}`, type: 'button', testid: 'whois-follow', 'aria-pressed': String(ctx.view.followed() === p.id),
          title: keys ? `The camera stays centered on ${farmer ? 'you' : 'them'} until you move it` : undefined,
          onclick: () => { const on = ctx.view.followed() === p.id; ctx.view.follow(on ? -1 : p.id); ctx.announce(on ? 'Stopped following.' : `Following ${farmer ? 'you' : name}. The camera stays centered on ${farmer ? 'you' : 'them'} until you move it.`); ctx.dirty() },
        }, icon('scout', 'i'), ctx.view.followed() === p.id ? 'Following' : 'Follow'),
        c.phase === 'season' && c.crew.length > 1 ? h('button', { class: 'btn', type: 'button', testid: 'whois-more', onclick: () => app.selectUnit(p.id, 'list') }, icon('people', 'i'), 'Details') : null,
        farmer ? null : h('button', {
          class: 'btn hazard', type: 'button', testid: 'whois-letgo',
          onclick: async () => {
            const yes = await confirmPaper(ctx, { title: `Let ${firstName(p.name)} go?`, text: LET_GO_TEXT, yes: 'Let them go', danger: true })
            if (!yes) return
            const r = ctx.run({ t: 'dismiss', unit: p.id })
            if (r.ok) { app.selectUnit(-1); ctx.announce(`You let ${p.name} go.`) }
          },
        }, icon('letgo', 'i'), 'Let go')),
    ]
  }

  function update(): void {
    const c = app.campaign
    const p = open(c)
    el.classList.toggle('phone', phone())
    if (!p || !c) {
      card.hidden = true
      shownFor = -1
    } else {
      const was = card.hidden
      card.hidden = false
      patch(card, JSON.stringify([p, c.phase, c.season?.day, c.season?.jobs.map(j => [j.id, j.kind, j.field]), ctx.touch(), phone(), c.sundaysOff, ctx.view.followed(), c.crew.find(u => u.id === p.id)?.rest, ctx.view.unitPlace(p.id)]), () => body(c, p))
      card.setAttribute('aria-label', p.kind === 'farmer' ? 'You' : p.name)
      if (was || shownFor !== p.id) {
        shownFor = p.id
        ctx.announce(`${p.kind === 'farmer' ? 'You' : p.name}: ${doingWord(c, p, S.jobWaits(app.world, c))}.`)
        if (!ctx.reduced()) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in') }
      }
    }
    tied.card.update(card.hidden ? null : ties().unit())
    const t = c && app.screen !== 'title' ? app.thing : null
    tcard.hidden = !t
    if (t && c) {
      const w = thingWords(c, t.thing, ctx.touch())
      patch(tcard, JSON.stringify([t.thing, w, ctx.touch()]), () => [
        h('header', { class: 'whois-head' },
          h('span', { class: 'thing-ic' }, icon(w.glyph, 'i')),
          h('div', null, h('h2', { class: 't-head', id: 'thing-name', testid: 'thing-name' }, w.name), h('p', { class: 't-caption' }, w.line)),
          h('button', { class: 'close', type: 'button', testid: 'thing-close', 'aria-label': `Close${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.inspect(null) }, icon('close', 'i'))),
        t.thing.kind === 'asking' && c.phase === 'plan' ? h('div', { class: 'whois-acts' }, h('button', { class: 'btn', type: 'button', testid: 'thing-hire', onclick: () => { app.inspect(null); openCrew(ctx) } }, icon('hire', 'i'), 'Hiring')) : null,
        t.thing.holder >= 0 ? h('div', { class: 'whois-acts' }, h('button', { class: 'btn', type: 'button', testid: 'thing-holder', onclick: () => app.selectUnit(t.thing.holder, 'land') }, icon('people', 'i'), 'See who has it')) : null,
      ])
    }
    tied.thing.update(tcard.hidden ? null : ties().thing())
  }

  // On a phone the sheet covers the foot of the land: how much of it, so what is in hand is kept in view above it.
  function inset(): number {
    if (!phone()) return 0
    const up = [card, tcard].find(x => !x.hidden)
    return up ? innerHeight - up.getBoundingClientRect().top + 6 : 0
  }

  function frame(): void {
    const mode = phone() ? 'sheet' : 'float'
    tied.card.frame(mode)
    tied.thing.frame(mode)
    // Before the click: the name of the person or thing under the pointer, and a mark on the ground under a person.
    const pt = app.pointing
    const c = app.campaign
    let name = ''
    let at: { x: number; y: number; visible: boolean } | null = null
    if (pt && c && app.screen !== 'title' && !ctx.touch()) {
      if (pt.unit >= 0 && !(pt.unit === app.unit && !card.hidden)) {
        const nm = (id: number) => { const u = c.crew.find(x => x.id === id); return !u ? '' : u.kind === 'farmer' ? 'You' : firstName(u.name) }
        const p = c.crew.find(u => u.id === pt.unit)
        if (p) { name = pt.group && pt.group.length > 1 ? pt.group.map(nm).filter(Boolean).join(', ') : p.kind === 'farmer' ? 'You' : p.name; at = ctx.view.unitAnchor(pt.unit) }
      } else if (pt.thing && !(app.thing && app.thing.thing.kind === pt.thing.kind && app.thing.thing.k === pt.thing.k)) {
        name = thingWords(c, pt.thing).name
        at = ctx.view.thingAnchor(pt.thing)
      }
    }
    label.hidden = !name || !at?.visible
    if (!label.hidden && at) {
      if (label.textContent !== name) label.textContent = name
      label.style.transform = `translate3d(${(at.x + 24).toFixed(1)}px, ${(at.y - 44).toFixed(1)}px, 0)`
    }
    const foot = pt && pt.unit >= 0 && !label.hidden ? ctx.view.unitFoot(pt.unit) : null
    mark.hidden = !foot?.visible
    if (foot?.visible) mark.style.transform = `translate3d(${foot.x.toFixed(1)}px, ${foot.y.toFixed(1)}px, 0)`
  }

  const off = app.on(e => {
    // One card at a time: a field or a yard taken in hand puts a thing's name card away.
    if ((e.type === 'select' && app.selection.length > 0) || (e.type === 'yard' && e.yard !== 0)) app.inspect(null)
    if (e.type === 'unit' || e.type === 'inspect' || e.type === 'screen' || e.type === 'select' || e.type === 'yard') ctx.dirty()
  })

  return {
    el,
    update,
    frame,
    inset,
    escape() {
      if (!tcard.hidden) { app.inspect(null); return true }
      if (!card.hidden) { app.selectUnit(-1); return true }
      return false
    },
    dispose() { off(); el.remove() },
  }
}
