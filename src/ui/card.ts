// A field's card (design/season-card.html, design/tract.html): opened beside the field (tie.ts), the field's record
// above (its meters and what is known), and its orders as real buttons, each with its key, its cost, then its catch;
// the suggested one filled ochre. An order given is answered at once: "On the list". Everything on it is about the
// field in hand: what the whole farm does (how spraying is done this season) is at the foot, with the people.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx, type Level } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { culledAtDig } from './dig.ts'
import { fates, ringFor } from './crew.ts'
import { isTract } from './map.ts'
import { firstName, hillWord, isJob, isStale, JOB_KEY, JOB_VERB, jobText, jobWhat, stonesText, stonesWord } from './rules.ts'
import { term } from './glossary.ts'
import { meter, order, range } from './system/parts.ts'
import { ringed } from './system/people.ts'

const MAX_ORDERS = 5
// The crop's orders, each in its own place on the card whatever the field's state.
const CROP: S.JobKind[] = ['plant', 'hill', 'scout', 'spray', 'water', 'rogue', 'sample', 'kill', 'dig']
const HOLD_MS = 1400
const FLASH_MS = 5000

// The stage as the record's caption says it.
const SHORT_STAGE: Record<string, string> = { 'Planted, not up': 'planted', 'Vines dead, skins setting': 'vines dead', 'Vines dead, skins set': 'vines dead', 'In bloom': 'in bloom' }

// What a card's head says the thing is, over its name: "Potato field / North Ridge", "Woods to clear / Home Woodlot".
const TRACT_KIND: Record<S.Cover, string> = { woods: 'Woods to clear', brush: 'Brush to clear', stumps: 'Stumps to pull', open: 'Cleared ground' }
function fieldKind(f: S.FieldInfo): string {
  return f.status === 'rest' ? 'Resting field' : 'Potato field'
}

interface Offer { kind: S.JobKind; fields: number[]; days: number; cost: number; score: number; given?: boolean }

export interface Card {
  el: HTMLElement
  update(c: S.Campaign): void
  // Gives an order to the selection, by button or by key.
  give(kind: S.JobKind, first: boolean): void
  // Gives each selected field what reference practice has for it.
  suggested(): void
  flash(text: string, level?: Level): void
}

// How much an order matters here now, to choose five when more than five can be given.
function score(kind: S.JobKind, f: S.FieldInfo, s: S.Season, suggested: boolean): number {
  if (suggested) return 100
  switch (kind) {
    case 'plant': return 90
    case 'rogue': return 80
    case 'hill': return 70
    case 'water': return f.moistureLabel === 'dry' || f.moistureLabel === 'wilting' || f.moistureLabel === 'drying' ? 65 : 20
    case 'spray': return 60
    case 'scout': return 55
    case 'sample': return 50
    case 'kill': return s.fields[f.index].matureDay >= 0 || f.blightKnown >= 0.05 || s.day >= S.dayIndex(s.year, 7, 20) ? 45 : 25
    case 'dig': return f.status === 'dead' ? 85 : 10
    case 'fell': return 75
    case 'rocks': return 40
    case 'brush': return 30
    case 'build': case 'haul': return 0
  }
}

// Care of the land beyond the crop is offered once the farm has a year behind it, or where it is badly wanted: stones
// a careful grower would pick, hedgerows that hold frost on bottom land. Felling belongs to the tracts.
function landCare(c: S.Campaign, f: S.FieldInfo, kind: S.JobKind): boolean {
  if (kind === 'fell') return isTract(f.index)
  if (kind === 'rocks') return isTract(f.index) || f.stones >= S.ROCKS_ADVISE || (c.history.length > 0 && f.stones >= 0.3)
  if (kind === 'brush') return c.history.length > 0 && f.elev === 0
  return true
}

// What the crop in barrels faces until it is hauled in.
function barrels(world: S.World, c: S.Campaign, i: number): S.HaulInfo | undefined {
  return S.haulInfo(world, c).find(x => x.field === i)
}

// An order's cost as its button prints it: the time, then the money.
function costText(days: number, cost: number): string {
  return `${F.days(days)}${cost ? ` · ${F.money(cost)}` : ''}`
}

export function commandCard(ctx: Ctx, o: { onTray: (field: number) => void; onTicket: (lot: number) => void }): Card {
  const app = ctx.app
  const el = h('section', { class: 'command sheet sys card', 'aria-label': 'Selected', testid: 'card', hidden: true })
  let page = 0
  let shownFor = ''
  let flashed: { text: string; level: Level; until: number } | null = null
  // After an order is given its button holds its place for a moment, so a second tap never lands on a neighbour.
  let held: { until: number; kinds: S.JobKind[]; given: S.JobKind[] } | null = null
  // A refused order's catch says why, in red, until the next press.
  let refused: { kind: S.JobKind; why: string; until: number } | null = null

  // The crew the orders go to, when one is picked.
  function picked(c: S.Campaign): S.Unit | null {
    return app.unit >= 0 ? c.crew.find(u => u.id === app.unit) ?? null : null
  }

  function offers(c: S.Campaign, sel: number[]): Offer[] {
    const s = c.season!
    const needs = app.needs()
    const by = new Map<S.JobKind, Offer>()
    const u = picked(c)
    for (const i of sel) {
      const f = S.fieldInfo(c, i)
      const need = needs[i]?.need?.act
      for (const a of S.fieldActions(app.world, c, i)) {
        if (!a.ok || (u && S.unitBlock(c, a.kind, u.id)) || !landCare(c, f, a.kind)) continue
        const sc = score(a.kind, f, s, need === a.kind)
        const x = by.get(a.kind)
        if (x) { x.fields.push(i); x.days += a.days; x.cost += a.cost; x.score = Math.max(x.score, sc) }
        else by.set(a.kind, { kind: a.kind, fields: [i], days: a.days, cost: a.cost, score: sc })
      }
    }
    // What is already on the list for the selection stays in its place, stamped, so the answer to an order is seen.
    for (const j of s.jobs) {
      if (!sel.includes(j.field) || by.has(j.kind) || j.kind === 'build' || j.kind === 'haul') continue
      const f = sel.length === 1 ? S.fieldInfo(c, sel[0]) : null
      by.set(j.kind, { kind: j.kind, fields: [j.field], days: 0, cost: 0, score: f ? score(j.kind, f, s, needs[sel[0]]?.need?.act === j.kind) : 5, given: true })
    }
    return S.JOBS.filter(k => by.has(k)).map(k => by.get(k)!)
  }

  function flash(text: string, level: Level = 'warn'): void {
    flashed = { text: F.localize(text), level, until: performance.now() + FLASH_MS }
    ctx.announce(flashed.text)
    setTimeout(() => ctx.dirty(), FLASH_MS + 50)
    ctx.dirty()
  }

  function give(kind: S.JobKind, first: boolean): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? 'Pick a field first. Tap one, then give it an order.' : 'Pick a field first. Click one, or press its number key.'); return }
    const u = picked(c)
    const busy = u ? S.unitBlock(c, kind, u.id) : ''
    if (u && busy) { refuse(kind, `${busy} Close their card so anyone can take the order.`); return }
    const before = shown(offers(c, app.selection)).map(x => x.kind)
    const res = app.order(kind, { first })
    const took = res.filter(r => r.ok)
    if (!took.length) {
      refuse(kind, res.length === 1 ? res[0].err : res.map(r => `${S.FIELD_NAMES[r.field]}. ${r.err}`).join(' '))
      return
    }
    flashed = null
    refused = null
    held = { until: performance.now() + HOLD_MS, kinds: held && performance.now() < held.until ? held.kinds : before, given: [...(held?.given ?? []), kind] }
    setTimeout(() => ctx.dirty(), HOLD_MS + 50)
    ctx.announce(`${JOB_VERB[kind]} is ${first ? 'first on the work list' : 'on the work list'} for ${F.list(took.map(r => S.FIELD_NAMES[r.field]))}${u ? `, assigned to ${u.name === S.FARMER_NAME ? 'you' : u.name}` : ''}.`)
  }

  // An order that cannot be given says why at once: on its own button when it is on the bar, on the note otherwise.
  function refuse(kind: S.JobKind, why: string): void {
    const c = app.campaign
    const on = !!c && shown(offers(c, app.selection)).some(x => x.kind === kind)
    if (on) {
      refused = { kind, why: F.localize(why), until: performance.now() + FLASH_MS }
      ctx.announce(`${JOB_VERB[kind]}: ${refused.why}`)
      setTimeout(() => ctx.dirty(), FLASH_MS + 50)
    }
    flash(`${JOB_VERB[kind]}: ${why}`)
  }

  function suggested(): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? 'Pick a field first by tapping it.' : 'Pick a field first. Click one, or press its number key.'); return }
    const fails: string[] = []
    const took: number[] = []
    for (const i of [...app.selection]) {
      const r = app.smartOrder(i)
      if (r.ok) took.push(i)
      else fails.push(app.selection.length > 1 ? `${S.FIELD_NAMES[i]}. ${r.err}` : r.err)
    }
    if (took.length) ctx.announce(`The suggested order is on the work list for ${F.list(took.map(i => S.FIELD_NAMES[i]))}.`)
    else flash(fails.join(' '), 'info')
  }

  // The five to show, in the order of the season.
  function shown(all: Offer[]): Offer[] {
    if (all.length <= MAX_ORDERS) return all
    const top = [...all].sort((a, b) => b.score - a.score).slice(0, MAX_ORDERS).map(x => x.kind)
    return all.filter(x => page === 0 ? top.includes(x.kind) : !top.includes(x.kind))
  }

  // An order's catch, in a few words: why now for the suggested one, what stands against it for the rest.
  function catchFor(c: S.Campaign, kind: S.JobKind, f: S.FieldInfo | null, suggestedWhy: string): string {
    if (suggestedWhy) return suggestedWhy
    if (!f) return jobWhat(kind)
    switch (kind) {
      case 'plant': { const hold = app.needs()[f.index]?.hold; return F.localize(hold ? hold.why : S.plantReady(app.world, c, f.index).why) }
      case 'hill': return f.hillPasses > 0 ? `Hilled ${hillWord(f.hillPasses)}.` : 'Not hilled yet.'
      case 'scout': return f.scoutAge < 0 ? 'Not scouted yet.' : `Last scouted ${F.ago(f.scoutAge)}.`
      case 'spray': return f.protect > 0.02 ? `${F.pct(f.protect)} of the spray protection is left.` : 'No spray protection on the leaves.'
      case 'water': return `The soil is ${f.moistureLabel}.`
      case 'rogue': return f.blightHills > 0 ? `Blight seen on ${F.plural(f.blightHills, 'plant')}.` : jobWhat(kind)
      case 'sample': return 'It\'s your only look at the crop.'
      case 'kill': return c.season!.fields[f.index].matureDay < 0 && f.blightKnown < 0.05 ? 'Too soon. Killing the vines stops the crop growing.' : `Growth stops and skins set in ${S.SKIN_DAYS} days.`
      case 'dig': return f.skin >= 1 ? 'Skins are set.' : `Skins are only ${F.pct(f.skin)} set, so they'll bruise.`
      case 'fell': return c.phase === 'season' ? 'Half speed during the season, and full speed for anyone you keep on over the winter.' : jobWhat(kind)
      case 'rocks': return f.stones > 0.05 ? `${F.upper(stonesText(f.stones))}.` : jobWhat(kind)
      case 'brush': return 'Less blight weather and frost, but it grows back.'
      default: return jobWhat(kind)
    }
  }

  function orderRow(c: S.Campaign, sel: number[], suggestedKind: S.JobKind | null, why: string, extra: HTMLElement[] = []): Child {
    const all = offers(c, sel)
    const now = performance.now()
    if (held && now >= held.until) held = null
    if (refused && now >= refused.until) refused = null
    const live = shown(all)
    const kinds = held ? held.kinds : live.map(x => x.kind)
    const touch = ctx.touch()
    const f = sel.length === 1 ? S.fieldInfo(c, sel[0]) : null
    const cells = kinds.map(kind => {
      const x = all.find(y => y.kind === kind)
      const given = !!x?.given || !!held?.given.includes(kind)
      if (!x || given) {
        return order({ key: touch ? '' : JOB_KEY[kind], icon: kind, name: JOB_VERB[kind], given: true, catch: catchFor(c, kind, f, ''), testid: `order-${kind}-given`, attrs: { 'data-k': `order-${kind}`, tabindex: '-1', 'aria-disabled': 'true' } })
      }
      const part = x.fields.length < sel.length ? ` ${x.fields.length} of ${sel.length}` : ''
      const no = refused?.kind === kind
      return order({
        key: touch ? '' : JOB_KEY[kind], icon: kind, name: [JOB_VERB[kind], part ? h('span', { class: 'order-part num' }, part) : null],
        cost: kind === 'fell' || kind === 'rocks' || kind === 'brush' ? `${F.num(Math.ceil(x.days))} crew-days${x.cost ? ` · ${F.money(x.cost)}` : ''}` : costText(x.days, x.cost), catch: no ? refused!.why : catchFor(c, kind, f, kind === suggestedKind ? why : ''), suggested: kind === suggestedKind, refused: no,
        testid: `order-${kind}`, title: touch ? undefined : jobWhat(kind), said: jobWhat(kind),
        onclick: (e: Event) => give(kind, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey),
        attrs: { 'data-k': `order-${kind}`, oncontextmenu: (e: Event) => { e.preventDefault(); give(kind, true) } },
      })
    })
    const u = picked(c)
    const who = u ? h('p', { class: 'order-who' }, ringed(u, ringFor(c, u.id), 26), h('span', null, 'Orders go to ', h('b', null, u.kind === 'farmer' ? 'you' : firstName(u.name)))) : null
    const more = all.length > MAX_ORDERS && !held ? h('button', {
      class: 'btn quiet order-more', type: 'button', testid: 'order-more', 'aria-pressed': String(page === 1),
      onclick: () => { page = page === 0 ? 1 : 0; ctx.dirty() },
    }, icon(page === 0 ? 'more' : 'back', 'i'), page === 0 ? `${all.length - MAX_ORDERS} more orders` : 'Back to the first orders') : null
    const room = extra.slice(0, Math.max(0, MAX_ORDERS - cells.length))
    return cells.length || more || room.length || who ? h('div', { class: 'orders', role: 'group', 'aria-label': u ? `Orders for ${u.name === S.FARMER_NAME ? 'you' : u.name}` : 'Orders' }, who, cells, room, more) : null
  }

  // The crop's nine orders in fixed places: one that can be given, one on the list (stamped), or one that cannot be
  // given now, greyed, its reason said under the pointer, on focus, and on a press. say: the line under them, which
  // shows the catch of the order under the pointer and goes back to what it said.
  function slots(c: S.Campaign, sel: number[], suggestedKind: S.JobKind | null, why: string): { el: HTMLElement; canAny: boolean; wire(say: HTMLElement): void } {
    const s = c.season!
    const now = performance.now()
    if (refused && now >= refused.until) refused = null
    const touch = ctx.touch()
    const u = picked(c)
    const f = sel.length === 1 ? S.fieldInfo(c, sel[0]) : null
    const acts = sel.map(i => S.fieldActions(app.world, c, i))
    const tell: { el: HTMLElement; text: string }[] = []
    let canAny = false
    const cells = CROP.map(kind => {
      const mine = acts.map(a => a.find(x => x.kind === kind)!)
      const busy = u ? S.unitBlock(c, kind, u.id) : ''
      const can = sel.filter((_, k) => mine[k].ok && !busy)
      const listed = sel.filter(i => s.jobs.some(j => j.field === i && j.kind === kind))
      const key = touch ? '' : JOB_KEY[kind]
      const attrs = (cls = '') => ({ 'data-k': `order-${kind}`, class: `slot${cls}` })
      let el: HTMLElement
      let text: string
      if (!can.length && listed.length) {
        text = catchFor(c, kind, f, '')
        el = order({ key, icon: kind, name: JOB_VERB[kind], given: true, catch: '', said: text, testid: `order-${kind}-given`, attrs: { ...attrs(), 'aria-disabled': 'true' } })
      } else if (!can.length) {
        text = busy || F.localize(mine.find(x => !x.ok)?.why ?? '') || jobWhat(kind)
        el = order({
          key, icon: kind, name: JOB_VERB[kind], catch: '', said: `Can't be given right now. ${text}`, testid: `order-${kind}-off`, title: touch ? undefined : text,
          attrs: attrs(' is-off'), onclick: () => refuse(kind, text),
        })
      } else {
        canAny = true
        const days = can.reduce((t, i) => t + mine[sel.indexOf(i)].days, 0)
        const cost = can.reduce((t, i) => t + mine[sel.indexOf(i)].cost, 0)
        const part = can.length < sel.length ? ` ${can.length} of ${sel.length}` : ''
        const no = refused?.kind === kind
        text = no ? refused!.why : catchFor(c, kind, f, kind === suggestedKind ? why : '')
        el = order({
          key, icon: kind, name: [JOB_VERB[kind], part ? h('span', { class: 'order-part num' }, part) : null], cost: costText(days, cost), catch: '',
          suggested: kind === suggestedKind, refused: no, testid: `order-${kind}`, title: touch ? undefined : jobWhat(kind), said: `${jobWhat(kind)} ${text}`,
          onclick: (e: Event) => give(kind, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey),
          attrs: { ...attrs(), oncontextmenu: (e: Event) => { e.preventDefault(); give(kind, true) } },
        })
      }
      tell.push({ el, text })
      return el
    })
    const who = u ? h('p', { class: 'order-who' }, ringed(u, ringFor(c, u.id), 26), h('span', null, 'Orders go to ', h('b', null, u.kind === 'farmer' ? 'you' : firstName(u.name)))) : null
    const el = h('div', { class: 'orders slots', role: 'group', 'aria-label': u ? `Orders for ${u.name === S.FARMER_NAME ? 'you' : u.name}` : 'Orders' }, who, cells)
    return {
      el, canAny,
      wire(say: HTMLElement) {
        const base = [...say.childNodes]
        const back = () => say.replaceChildren(...base)
        for (const t of tell) {
          const show = () => say.replaceChildren(t.text)
          t.el.addEventListener('pointerenter', e => { if ((e as PointerEvent).pointerType === 'mouse') show() })
          t.el.addEventListener('pointerleave', back)
          t.el.addEventListener('focus', show)
          t.el.addEventListener('blur', back)
        }
      },
    }
  }

  // Care of the land beside the crop's orders, when it is wanted: rocks, hedgerows, tile drains.
  function landRow(c: S.Campaign, i: number): HTMLElement | null {
    const f = S.fieldInfo(c, i)
    const kinds = (['rocks', 'brush'] as S.JobKind[]).filter(k => landCare(c, f, k))
    const acts = S.fieldActions(app.world, c, i)
    const u = picked(c)
    const touch = ctx.touch()
    const cells: HTMLElement[] = kinds.map(kind => {
      const a = acts.find(x => x.kind === kind)!
      const ok = a.ok && !(u && S.unitBlock(c, kind, u.id))
      return order({
        key: touch ? '' : JOB_KEY[kind], icon: kind, name: JOB_VERB[kind], cost: ok ? `${F.num(Math.ceil(a.days))} crew-days${a.cost ? ` · ${F.money(a.cost)}` : ''}` : undefined,
        catch: ok ? catchFor(c, kind, f, '') : F.localize(a.why), testid: ok ? `order-${kind}` : `order-${kind}-off`,
        attrs: { 'data-k': `order-${kind}`, class: ok ? '' : 'is-off', 'aria-disabled': ok ? null : 'true' },
        onclick: () => (ok ? give(kind, false) : refuse(kind, F.localize(a.why))),
      })
    })
    if (c.history.length > 0) { const t = contractor(c, i, 'tile'); if (t) cells.push(t) }
    return cells.length ? h('div', { class: 'orders land-orders', role: 'group', 'aria-label': 'The land' }, cells) : null
  }

  // A contractor's job, ordered and paid for at once: stumps pulled, tile laid.
  function contractor(c: S.Campaign, i: number, kind: 'stump' | 'tile'): HTMLElement | null {
    const why = kind === 'stump' ? S.stumpBlock(c, i) : S.tileBlock(c, i)
    const fee = kind === 'stump' ? S.STUMP_FEE : S.TILE_FEE
    const days = kind === 'stump' ? S.STUMP_DAYS : S.TILE_DAYS
    // Stumps the tract is ready for are always on its bar: ordered, or with why not, never missing.
    if (why) return kind === 'stump' && S.tractInfo(c).find(t => t.field === i)?.stage === 'stump'
      ? order({ key: '', icon: kind, name: 'Pull stumps', cost: `${F.money(fee)} · ${days} days`, catch: F.localize(why), refused: true, disabled: true, testid: 'order-stump' }) : null
    return order({
      key: '', icon: kind, name: kind === 'stump' ? 'Pull stumps' : 'Tile drains', cost: `${F.money(fee)} · ${days} days`,
      catch: kind === 'stump' ? 'A contractor with a bulldozer pulls them.' : 'The field drains like a slope, but holds a little less water in a drought.', testid: `order-${kind}`,
      onclick: () => { const r = ctx.run({ t: kind, field: i }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
    })
  }

  // The land under the crop, where it matters: stones, shelter, barrels waiting to be hauled.
  function landLines(c: S.Campaign, f: S.FieldInfo): HTMLElement[] {
    const parts: HTMLElement[] = []
    const haul = barrels(app.world, c, f.index)
    if (haul) {
      const who = haul.hauler >= 0 ? c.crew.find(u => u.id === haul.hauler) : undefined
      parts.push(h('p', { class: haul.frostChance >= 30 ? 'c-red' : '', testid: 'barrels' }, icon('haul', 'i'),
        h('span', null, F.metric() ? F.mass(haul.cwt) : term(F.mass(haul.cwt), 'cwt'), ` in barrels${who ? `, and ${who.kind === 'farmer' ? 'you\'re' : `${firstName(who.name)} is`} hauling them in` : haul.digging ? '' : ', waiting to be hauled in'}${haul.frostChance >= 30 ? `. ${haul.frostChance}% chance of frost tonight` : ''}`)))
    }
    if (f.works) parts.push(h('p', null, icon(f.works.kind, 'i'), h('span', null, `${f.works.kind === 'stump' ? 'Pulling stumps' : 'Laying tile drains'}, ${F.plural(f.works.left, 'day')} to go`)))
    if (f.stones >= 0.4 || (c.history.length > 0 && f.stones >= 0.3)) parts.push(h('p', { class: 'quiet', testid: 'stones' }, icon('rocks', 'i'), h('span', null, `${F.upper(stonesWord(f.stones))}: ${stonesText(f.stones)}`)))
    if (f.sheltered && f.status !== 'dug') parts.push(h('p', { class: 'quiet', testid: 'shelter' }, icon('woods', 'i'), h('span', null, `Sheltered by ${f.shelteredBy}, so less wind but more blight weather`)))
    if (f.brushed > 0) parts.push(h('p', { class: 'quiet' }, icon('brush', 'i'), h('span', null, `Hedgerows cut back, and they regrow in ${F.plural(f.brushed, 'year')}`)))
    if (f.raw && f.status !== 'off') parts.push(h('p', { class: 'quiet' }, icon('idle', 'i'), h('span', null, 'New ground, so its first potato crop will yield less')))
    return parts
  }

  function headWith(label: string, title: string, sub: Child): HTMLElement {
    return h('header', { class: 'command-head' },
      h('div', null, h('p', { class: 't-label' }, label), h('h2', { class: 't-title', testid: 'card-title' }, title), h('p', { class: 't-caption' }, sub)),
      h('button', { class: 'close', type: 'button', testid: 'card-close', 'data-k': 'close', 'aria-label': `Deselect${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.select(-1) }, icon('close', 'i')))
  }

  function head(label: string, title: string, sub: string): HTMLElement {
    return h('header', { class: 'command-head' },
      h('div', null, h('p', { class: 't-label' }, label), h('h2', { class: 't-title', testid: 'card-title' }, title), sub ? h('p', { class: 't-caption' }, sub) : null),
      h('button', { class: 'close', type: 'button', testid: 'card-close', 'data-k': 'close', 'aria-label': `Deselect${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.select(-1) }, icon('close', 'i')))
  }

  // What the bar has to say beyond its orders: a refusal, why a field waits, why nothing can be done. Empty otherwise.
  function note(text: Child, cls = ''): HTMLElement {
    return h('p', { class: `note card-line${cls ? ` ${cls}` : ''}`, testid: 'card-line', role: cls.includes('flash') ? 'status' : null }, text || null)
  }

  function adviceLine(c: S.Campaign, sel: number[], canAny: boolean): HTMLElement {
    if (flashed && performance.now() < flashed.until) return note(flashed.text, `flash lv-${flashed.level}`)
    const s = c.season!
    const needs = app.needs()
    if (sel.length === 1) {
      const i = sel[0]
      const { need, hold } = needs[i] ?? { need: null, hold: null }
      if (need && need.act === 'sell') return note([h('b', null, 'Sell. '), F.localize(need.why)])
      if (need && isJob(need.act)) return note('')
      if (hold) return note(`${F.localize(hold.text)} ${F.localize(hold.why)}`)
      if (!canAny) {
        const f = S.fieldInfo(c, i)
        const job = s.jobs.find(j => j.kind === 'dig' && j.field === i)
        return note(s.frozen ? 'The ground has frozen, so nothing more can be done in the field.'
          : f.status === 'rest' ? `Resting in oats and clover. It earns ${F.money(S.REST_INCOME)} in the fall and restores the soil.`
            : f.status === 'planted' ? 'Planted. There\'s nothing to do here until the plants come up.'
              : f.status === 'digging' ? `Being dug, with ${job ? F.pct(job.done / job.need) : 'part'} of the rows out so far. You'll get the weigh ticket once it's all hauled in.`
                : f.status === 'lost' ? 'This crop is lost.'
                  : picked(c) ? nothingFor(picked(c)!)
                    : 'Everything this field needs is already on the work list.')
      }
      return note('')
    }
    const want = sel.filter(i => isJob(needs[i]?.need?.act))
    if (want.length) return note(`${F.list(want.map(i => S.FIELD_NAMES[i]))} ${want.length === 1 ? 'has' : 'have'} a suggested order. ${ctx.touch() ? 'Tap a stamp to give it.' : 'Press Enter to give each field its own.'}`)
    if (!canAny) return note(s.frozen ? 'The ground has frozen, so nothing more can be done in the field.' : picked(c) ? nothingFor(picked(c)!) : 'None of these fields can take an order right now.')
    return note('')
  }

  function nothingFor(u: S.Unit): string {
    return `There's nothing here that ${u.kind === 'farmer' ? 'you' : u.name} can do right now.`
  }

  function gauges(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const s = c.season!
    const watch = s.watchDay >= 0
    const waterKind = f.moistureLabel === 'wilting' ? 'bad' : f.moistureLabel === 'dry' ? 'warn' : f.tooWet ? 'wet' : undefined
    const waterWord = f.moistureLabel === 'standing water' ? 'flooded' : f.moistureLabel
    const bare = watch && f.protect < 0.35 && f.status === 'growing'
    const cell = (label: string, value: string, m: HTMLElement, cls = '') => h('div', { class: `gauge${cls ? ` ${cls}` : ''}` }, h('span', { class: 't-label' }, term(label, label === 'Hill' ? 'hilled' : label.toLowerCase())), h('b', null, value), m)
    return h('div', { class: 'gauges' },
      cell('Leaf', F.pct(f.canopy), meter(f.canopy, { label: 'Leaf cover' })),
      cell('Water', waterWord, meter(Math.min(1, f.moisture), { label: 'Soil water', text: `${f.moistureLabel}, ${F.pct(f.moisture)} of what plants can use`, kind: waterKind }), waterKind === 'wet' ? '' : waterKind ?? ''),
      cell('Protection', f.protect > 0.02 ? F.pct(f.protect) : 'none', meter(f.protect, { label: 'Spray protection on the leaves', kind: bare ? (f.protect < 0.05 ? 'bad' : 'warn') : undefined }), bare ? (f.protect < 0.05 ? 'bad' : 'warn') : ''),
      cell('Hill', f.hillPasses >= 2 ? 'twice' : f.hillPasses === 1 ? 'once' : 'not yet', meter(f.hillPasses / 2, { label: 'Hilled', text: hillWord(f.hillPasses), half: true })))
  }

  // Blight as last seen, and how old that is; before the rows are up, the soil; once the vines are dead, the skins.
  function known(c: S.Campaign, f: S.FieldInfo): HTMLElement[] {
    const s = c.season!
    const coach = app.needs()[f.index]?.hold ?? (app.needs()[f.index]?.need?.act === 'plant' ? app.needs()[f.index]?.need : null)
    if (f.status === 'idle' && coach && /°/.test(F.localize(`${coach.text} ${coach.why}`))) return []
    // The one planting rule (S.plantReady), the same the coach and the routine go by.
    if (f.status === 'idle' || f.status === 'planted') {
      const pr = S.plantReady(app.world, c, f.index)
      const why = F.localize(pr.why)
      return [h('p', null, icon('planted', 'i'), h('span', null, f.status === 'idle' && why.includes('°') ? why : `The soil here is ${F.temp(pr.soilT)}.${f.status === 'idle' ? ` ${why}` : ''}`))]
    }
    if (f.status === 'dead') {
      const left = Math.ceil((1 - f.skin) * S.SKIN_DAYS)
      return [h('p', null, icon('dead', 'i'), h('span', null, f.skin >= 1 ? 'Skins are set.' : `Skins are ${F.pct(f.skin)} set, with about ${F.plural(left, 'day')} to go.`))]
    }
    if (f.status === 'digging') {
      const job = s.jobs.find(j => j.kind === 'dig' && j.field === f.index)
      return [h('p', null, icon('dig', 'i'), h('span', null, `${job ? F.pct(job.done / job.need) : 'Part'} of the rows are out.`))]
    }
    const age = f.scoutAge
    const stale = isStale(f)
    const seen = f.blightHills > 0 || f.blightSeen
    const pull = f.pullBy === 'you' ? ', and pulling them is up to you' : f.pullBy ? ', and your crew will pull them automatically' : ''
    const blight = h('p', { class: `${seen ? 'c-red blight' : ''}${stale ? ' stale' : ''}`.trim(), testid: 'blight-reading' },
      icon(seen ? (stale ? 'blight-old' : 'blight') : stale ? 'stale' : 'check', 'i'),
      h('span', null, f.blightHills > 0 ? `Blight on ${F.plural(f.blightHills, 'plant')}${pull}` : seen ? 'Blight seen here' : age < 0 ? 'Not scouted yet' : 'No blight seen'),
      age >= 0 ? h('span', { class: 'quiet' }, `· scouted ${F.ago(age)}`) : seen ? h('span', { class: 'quiet' }, '· seen from the road') : null)
    const e = f.estimate
    if (!e) return [blight, h('p', { class: 'quiet' }, icon('bulk', 'i'), h('span', null, 'No yield estimate until potatoes form.'))]
    const max = Math.max(500, Math.ceil(e.hi / 100) * 100)
    const sample = [...(c.season?.log ?? [])].reverse().find(x => x.type === 'sample' && x.field === f.index)
    return [blight, h('p', { class: 'estimate', testid: 'estimate' }, icon('bloom', 'i'), h('b', { class: 'num' }, F.metric() ? F.perAreaSpan(e.lo, e.hi) : term(F.perAreaSpan(e.lo, e.hi), 'cwt/acre')),
      range({ lo: e.lo, hi: e.hi, max, label: `Yield estimate ${F.perAreaSpan(e.lo, e.hi)}, ${e.digs ? `from ${F.plural(e.digs, 'test dig')}` : 'by eye'}` }),
      sample ? h('button', {
        class: 'btn quiet est-by', type: 'button', testid: 'sample-again', 'aria-label': `See the test dig from ${F.date(c.year, sample.day)}`, title: ctx.touch() ? undefined : `See the test dig from ${F.date(c.year, sample.day)}`,
        onclick: () => o.onTray(f.index),
      }, icon('sample', 'i'), e.digs ? 'test dig' : 'by eye') : h('span', { class: 'quiet' }, 'by eye'))]
  }

  // A tract: where its clearing stands, what it takes and yields, and the orders that move it on.
  function tractBody(c: S.Campaign, i: number): Child {
    const t = S.tractInfo(c).find(x => x.field === i)!
    const f = S.fieldInfo(c, i)
    const cropped = t.stage === 'done' && f.status !== 'off'
    const at = t.stage === 'fell' ? 0 : t.stage === 'stump' ? 1 : t.stage === 'rocks' ? 2 : 3
    const steps = ['Fell', 'Stumps', 'Rocks', 'Field']
    const logs = t.timber * (1 - t.felled) * (S.FELL_YIELD_BASE + S.FELL_YIELD_PER * 5)
    const stone = S.ROCKS_LOADS * Math.min(t.stones, S.ROCKS_TAKE)
    const extra = [contractor(c, i, 'stump')].filter((x): x is HTMLElement => !!x)
    const sugg = t.stage === 'fell' ? 'fell' : t.stage === 'rocks' ? 'rocks' : null
    const rows = orderRow(c, [i], sugg, '', extra)
    const next = t.works ? `The bulldozer is pulling stumps, with ${F.plural(t.works.left, 'season day')} to go.` : t.next ? `Next: ${F.localize(t.next).replace(/^./, x => x.toLowerCase())}` : f.status === 'off' ? 'Cleared. You can plant it next spring, but a year in oats and clover first will improve the raw ground.' : ''
    return [
      head(TRACT_KIND[f.cover], t.name, `${F.upper(t.coverWord)}. ${t.tenure === 'none' ? `For sale at ${F.money(t.price)}.` : S.PARCELS[i].block === 'home' ? 'Part of the home farm.' : 'Owned by the farm.'}`),
      h('ol', { class: 'steps', testid: 'clear-track', 'aria-label': `Clearing: ${cropped ? 'a field again' : ['standing', 'felled', 'stumped', 'picked'][at]}, step ${at + 1} of ${steps.length}` },
        steps.map((st, k) => h('li', { class: k < at || cropped ? 'done' : k === at ? 'now' : '' }, st))),
      h('div', { class: 'readings' },
        t.stage === 'fell' ? h('p', null, icon('woods', 'i'), h('span', null, `${F.pct(t.felled)} felled`), meter(t.felled, { label: 'Felled', text: `${F.pct(t.felled)} felled` })) : null,
        t.stage === 'fell' ? h('p', null, icon('logs', 'i'), h('span', null, 'About ', h('b', { class: 'num' }, `${Math.round(logs)} loads`), ` of logs, worth ${F.money(Math.round(logs) * S.LOG_PRICE)} at the mill`)) : null,
        t.stage === 'rocks' ? h('p', null, icon('stone', 'i'), h('span', null, 'About ', h('b', { class: 'num' }, `${Math.round(stone)} loads`), ' of fieldstone')) : null,
        t.shelters.length ? h('p', { class: 'wrap' }, icon('leaf', 'i'), h('span', null, `It shelters ${F.list(t.shelters.map(x => S.FIELD_NAMES[x]))}, so ${t.shelters.length === 1 ? 'that field loses' : 'those fields lose'} less water but ${t.shelters.length === 1 ? 'gets' : 'get'} more blight weather.`)) : null,
        t.tenure === 'none' ? h('p', null, icon('land', 'i'), h('span', null, `You can buy it in spring for ${F.money(t.price)}.`)) : null),
      rows,
      !rows && t.tenure !== 'none' ? note(queuedHere(c, i)) : null,
      next ? h('p', { class: 'note' }, next) : null,
    ]
  }

  // What is on the list for a tract, in words, when nothing more can be ordered there.
  function queuedHere(c: S.Campaign, i: number): string {
    const jobs = c.season?.jobs.filter(j => j.field === i) ?? []
    if (!jobs.length) return c.phase === 'season' ? 'Nothing more can be done here right now.' : ''
    const who = jobs.map(j => c.crew.find(u => u.job === j.id)).find(Boolean)
    return `${jobText(jobs[0])} is on the work list${who ? `, and ${who.kind === 'farmer' ? 'you\'re' : `${firstName(who.name)} is`} working on it` : ''}.`
  }

  function one(c: S.Campaign, i: number): Child {
    const f = S.fieldInfo(c, i)
    if (isTract(i) && (f.cover !== 'open' || f.status === 'off')) return tractBody(c, i)
    const need = app.needs()[i]?.need
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    const land = landLines(c, f)
    if (f.status === 'dug' && lot && !f.weighed) {
      return [head(fieldKind(f), f.name, `${f.variety}, dug and being hauled in`), land.length ? h('div', { class: 'readings' }, land) : null, note('You\'ll get the weigh ticket once the last barrel is in the potato house.')]
    }
    if (f.status === 'dug' && lot) {
      const value = lot.open ? S.lotValue(app.world, c, lot) : 0
      const cull = culledAtDig(lot)
      const deal = deals(app.world, c, lot)[0]
      return [
        head(fieldKind(f), f.name, `${f.variety}, dug ${F.date(c.year, lot.dugDay, true)}`),
        h('div', { class: 'readings' },
          h('p', { class: 'wrap' }, icon('dig', 'i'), h('span', null, lot.open
            ? `${F.mass(S.lotCwt(lot))} in the cellar, worth ${F.money(value)} today.${lot.sold > 0 ? ` ${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}.` : ''}`
            : lot.sold > 0 ? `${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}. ${F.mass(cull)} culled.` : 'None of it was good enough to sell.'))),
        h('div', { class: 'orders', role: 'group', 'aria-label': 'The crop' },
          deal ? order({ key: '', icon: 'deliver', name: `Deliver to ${deal.k.buyer.replace(/^The /, 'the ')}`, cost: F.money(deal.pays), catch: `${F.mass(deal.take)}, ${versusMarket(deal)}.`, suggested: true, testid: `field-deliver-${lot.id}`, onclick: () => deliver(ctx, lot, deal) }) : null,
          lot.open ? order({ key: '', icon: 'sell', name: deal ? 'Sell all' : 'Sell', cost: F.money(value), catch: need && need.act === 'sell' ? F.localize(need.why) : 'At today\'s market price.', suggested: !deal && need?.act === 'sell', testid: `field-sell-${lot.id}`, onclick: () => ctx.run({ t: 'sell', lot: lot.id, frac: 1 }) }) : null,
          order({ key: '', icon: 'ticket', name: 'Ticket', catch: 'See the weigh ticket again, with its grades, losses and your choices.', testid: `weighin-${lot.id}`, onclick: () => o.onTicket(lot.id) })),
      ]
    }
    const sugg = need && isJob(need.act) ? need.act : null
    if (f.status === 'rest' || f.status === 'lost') {
      const extra = c.history.length > 0 ? [contractor(c, i, 'tile')].filter((x): x is HTMLElement => !!x) : []
      const rows = orderRow(c, [i], sugg, need && sugg ? F.localize(need.why) : '', extra)
      return [head(fieldKind(f), f.name, f.status === 'rest' ? 'Oats and clover, resting' : `${f.variety}, lost`), land.length ? h('div', { class: 'readings' }, land) : null, adviceLine(c, [i], !!rows), rows]
    }
    // The orders stand right under the gauges, so nothing above them comes or goes: a paragraph appearing never moves one.
    const g = slots(c, [i], sugg, need && sugg ? F.localize(need.why) : '')
    const say = sayLine(c, [i], g.canAny, sugg)
    g.wire(say)
    return [
      headWith(fieldKind(f), f.name, [`${f.variety}, `, term((SHORT_STAGE[f.stage] ?? f.stage).toLowerCase())]),
      // What is known first, then everything that can be ordered here in one group, then what the orders say back.
      gauges(c, f),
      g.el,
      landRow(c, i),
      say,
      whoseLine(c, i),
      h('div', { class: 'readings' }, known(c, f), land),
    ]
  }

  function many(c: S.Campaign, sel: number[]): Child {
    const g = slots(c, sel, null, '')
    const say = sayLine(c, sel, g.canAny, null)
    g.wire(say)
    return [
      head('Field records', `${sel.length} fields`, F.list(sel.map(i => S.FIELD_NAMES[i]))),
      g.el,
      say,
    ]
  }

  // Whose work is whose on this field: what the crew has on the list here by itself and when it is taken, and which
  // kinds of work wait for the player.
  function whoseLine(c: S.Campaign, i: number): HTMLElement | null {
    const s = c.season!
    const f = S.fieldInfo(c, i)
    if (f.status === 'dug' || f.status === 'rest' || f.status === 'lost' || f.status === 'off' || s.frozen) return null
    const of = fates(app.world, c).of
    const mine = s.jobs.filter(j => j.field === i && (j.by === 'routine' || j.by === 'foreman'))
    const crew = mine.slice(0, 2).map(j => {
      const o = of.get(j.id)
      const u = o && o.unit >= 0 ? c.crew.find(x => x.id === o.unit) : undefined
      const me = u?.kind === 'farmer'
      const when = !o ? '' : o.unit < 0 ? 'nobody can do it yet' : o.when === 'now' ? (me ? 'you\'re working on it' : `${firstName(u!.name)} is working on it`) : o.when === 'next' && /next\.$/.test(o.why) ? (me ? 'you\'re next' : `${firstName(u!.name)} is next`) : o.when === 'waiting' ? 'waiting' : me ? 'you\'ll get to it later' : `${firstName(u!.name)} will get to it later`
      return `${JOB_VERB[j.kind].toLowerCase()}${when ? ` (${when})` : ''}`
    })
    const r = S.routineInfo(c)
    const yours = r.filter(x => !x.auto && (CROP as string[]).includes(x.kind)).map(x => JOB_VERB[x.kind].toLowerCase())
    const parts: Child[] = []
    if (crew.length) parts.push(h('span', null, icon('sprout', 'i'), h('b', null, 'Your crew: '), `${crew.join(', ')}.`))
    else parts.push(h('span', { class: 'quiet' }, icon('sprout', 'i'), 'Your crew adds this field\'s routine work to the work list automatically.'))
    if (yours.length) parts.push(h('span', null, ' ', h('b', null, 'You: '), `${F.list(yours)}.`))
    // When the kill is due by the coach's reckoning; the vine kill the crew does by itself, with its date, and the way
    // to refuse it.
    const due = f.status === 'growing' ? S.killOutlook(c, i) : null
    if (due) parts.push(h('span', { testid: 'card-kill-due' }, ' ', h('b', null, 'Vine kill due: '), `around ${F.date(c.year, due.day, true)}${due.why === 'blight' ? ' because blight is winning' : due.why === 'frost' ? ' because a frost is coming' : ''}.`))
    const kill = fates(app.world, c).pressing.find(p => p.kind === 'kill' && p.field === i && p.job < 0)
    const kept = c.season!.fields[i].keepVines
    return h('div', { class: 'whose-box' },
      h('p', { class: 'whose', testid: 'card-whose' }, parts),
      kill ? h('p', { class: 'whose kill-date', testid: 'card-kill-date' }, icon('kill', 'i'), F.localize(kill.inWay), ' ',
        h('button', { class: 'btn quiet', type: 'button', testid: 'card-keep-vines', onclick: () => { const r = ctx.run({ t: 'keepVines', field: i, keep: true }); if (r.ok) ctx.announce(`${S.FIELD_NAMES[i]}: the crew will leave the vines up.`) } }, 'Keep them up')) : null,
      kept && f.status === 'growing' ? h('p', { class: 'whose', testid: 'card-vines-kept' }, icon('kill', 'i'), 'You\'re keeping these vines up, so killing them is your decision. ',
        h('button', { class: 'btn quiet', type: 'button', testid: 'card-let-vines', onclick: () => { ctx.run({ t: 'keepVines', field: i, keep: false }) } }, 'Let the crew kill them')) : null)
  }

  // The line under the orders: a refusal, why the field waits, or why the suggested order is suggested.
  function sayLine(c: S.Campaign, sel: number[], canAny: boolean, sugg: S.JobKind | null): HTMLElement {
    const line = adviceLine(c, sel, canAny)
    line.classList.add('order-say')
    if (!line.textContent && sugg && sel.length === 1) {
      const n = app.needs()[sel[0]]?.need
      if (n) line.replaceChildren(`${JOB_VERB[sugg]}: ${F.localize(n.why)}`)
    }
    return line
  }

  // The head with its cross stays put; what is under it scrolls when the window is short.
  function framed(parts: Child): Child {
    const list = (Array.isArray(parts) ? parts : [parts]) as Child[]
    return [list[0], h('div', { class: 'card-body', 'data-scroll': 'card' }, list.slice(1))]
  }

  function update(c: S.Campaign): void {
    const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT && S.held(c, i))
    const was = el.hidden
    if (!sel.length) {
      // The bar leaves as it came: nothing cuts out on one frame.
      if (!el.hidden && shownFor !== '' && !ctx.reduced()) {
        el.classList.remove('in')
        el.classList.add('out')
        setTimeout(() => { if (!app.selection.length) { el.hidden = true; el.classList.remove('out'); ctx.dirty() } }, EXIT_MS)
      } else if (!el.classList.contains('out')) el.hidden = true
      shownFor = ''
      return
    }
    el.classList.remove('out')
    el.hidden = false
    const key = sel.join(',')
    if (key !== shownFor) { shownFor = key; page = 0; held = null; flashed = null; refused = null }
    const s = c.season!
    const model = {
      sel, layout: ctx.layout(), day: s.day, jobs: s.jobs.map(j => [j.id, j.kind, j.field, Math.round(j.done * 20)]), u: app.settings.units, t: ctx.touch(), page,
      held: held && performance.now() < held.until ? [held.kinds, held.given] : 0, flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      refused: refused && performance.now() < refused.until ? [refused.kind, refused.why] : 0,
      f: sel.map(i => { const f = S.fieldInfo(c, i); return [f.status, f.stage, Math.round(f.canopy * 100), Math.round(f.moisture * 50), f.moistureLabel, Math.round(f.protect * 100), f.hillPasses, f.blightHills, f.blightSeen, f.pullBy, f.scoutAge, f.estimate ? [Math.round(f.estimate.lo), Math.round(f.estimate.hi), f.estimate.digs] : 0, Math.round(f.skin * 100), f.lot, f.cover, Math.round(f.stones * 100), f.works, Math.round(f.inField), f.weighed, f.sheltered, f.brushed, c.fields[i].felled] }),
      cash: Math.round(c.cash / 100), crew: c.crew.map(u => [u.id, u.job, u.prio]), fc: S.haulInfo(app.world, c).map(x => [x.field, x.frostChance, x.hauler]),
      n: app.needs().filter((_, i) => sel.includes(i)).map(x => [x.need?.id, x.need?.why, x.hold?.id, x.hold?.why]),
      lots: c.lots.filter(l => sel.includes(l.field)).map(l => [l.id, l.open, Math.round(S.lotCwt(l)), Math.round(l.sold), l.open ? Math.round(S.lotValue(app.world, c, l)) : 0]),
      frozen: s.frozen, w: s.watchDay >= 0, soil: Math.round(s.soilT * 2), unit: app.unit,
      k: c.contracts.map(k => [k.id, Math.round(k.delivered), k.settled]),
      kv: s.fields.map(x => x.keepVines ? 1 : 0), sw: c.sprayWay, r: c.routine, kill: fates(app.world, c).pressing.filter(p => p.kind === 'kill').map(p => [p.field, p.inWay]),
      fate: sel.flatMap(i => s.jobs.filter(j => j.field === i).map(j => [j.id, fates(app.world, c).of.get(j.id)?.why])),
    }
    patch(el, JSON.stringify(model), () => framed(sel.length === 1 ? one(c, sel[0]) : many(c, sel)))
    el.setAttribute('aria-label', sel.length === 1 ? `Selected: ${S.FIELD_NAMES[sel[0]]}` : `Selected: ${sel.length} fields`)
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  return { el, update, give, suggested, flash }
}
