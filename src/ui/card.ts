// The command card: what is selected, what is known about it, and the orders it can take now.
import * as S from '../sim/index.ts'
import { EXIT_MS, gauge, patch, type Ctx, type Level } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { culledAtDig } from './dig.ts'
import { isTract } from './map.ts'
import { portrait } from './people.ts'
import { CLEAR_STEPS, firstName, hillWord, isJob, isStale, JOB_KEY, JOB_VERB, jobText, jobWhat, stonesText, stonesWord } from './rules.ts'

const MAX_ORDERS = 5
const HOLD_MS = 1400
const FLASH_MS = 5000

// The stage as the card's second line says it; the reading below gives the rest.
const SHORT_STAGE: Record<string, string> = { 'Planted, not up': 'planted', 'Vines dead, skins setting': 'vines dead', 'Vines dead, skins set': 'vines dead' }

interface Offer { kind: S.JobKind; fields: number[]; days: number; cost: number; score: number }

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

export function commandCard(ctx: Ctx, o: { onTray: (field: number) => void; onTicket: (lot: number) => void }): Card {
  const app = ctx.app
  const el = h('section', { class: 'card instrument', 'aria-label': 'Selected', testid: 'card', hidden: true })
  let page = 0
  let shownFor = ''
  let flashed: { text: string; level: Level; until: number } | null = null
  // After an order is given its button holds its place for a moment, so a second tap never lands on a neighbour.
  let held: { until: number; kinds: S.JobKind[]; given: S.JobKind[] } | null = null

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
    if (!app.selection.length) { ctx.say(ctx.touch() ? 'Tap a field first, then give it an order.' : 'Select a field first: click it, or press its number.'); return }
    const u = picked(c)
    const busy = u ? S.unitBlock(c, kind, u.id) : ''
    if (u && busy) { flash(`${JOB_VERB[kind]}: ${busy} Close their card to let anyone take orders.`); return }
    const before = shown(offers(c, app.selection)).map(x => x.kind)
    const res = app.order(kind, { first })
    const took = res.filter(r => r.ok)
    if (!took.length) {
      flash(res.length === 1 ? `${JOB_VERB[kind]}: ${res[0].err}` : `${JOB_VERB[kind]}: ${res.map(r => `${S.FIELD_NAMES[r.field]}. ${r.err}`).join(' ')}`)
      return
    }
    flashed = null
    held = { until: performance.now() + HOLD_MS, kinds: held && performance.now() < held.until ? held.kinds : before, given: [...(held?.given ?? []), kind] }
    setTimeout(() => ctx.dirty(), HOLD_MS + 50)
    ctx.announce(`${JOB_VERB[kind]}: ${first ? 'first on the list' : 'on the list'} for ${F.list(took.map(r => S.FIELD_NAMES[r.field]))}${u ? `, for ${u.name === S.FARMER_NAME ? 'you' : u.name}` : ''}.`)
  }

  function suggested(): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? 'Tap a field first.' : 'Select a field first: click it, or press its number.'); return }
    const fails: string[] = []
    const took: number[] = []
    for (const i of [...app.selection]) {
      const r = app.smartOrder(i)
      if (r.ok) took.push(i)
      else fails.push(app.selection.length > 1 ? `${S.FIELD_NAMES[i]}. ${r.err}` : r.err)
    }
    if (took.length) ctx.announce(`The suggested order is on the list for ${F.list(took.map(i => S.FIELD_NAMES[i]))}.`)
    else flash(fails.join(' '), 'info')
  }

  // The five to show, in the order of the season.
  function shown(all: Offer[]): Offer[] {
    if (all.length <= MAX_ORDERS) return all
    const top = [...all].sort((a, b) => b.score - a.score).slice(0, MAX_ORDERS).map(x => x.kind)
    return all.filter(x => page === 0 ? top.includes(x.kind) : !top.includes(x.kind))
  }

  function orderRow(c: S.Campaign, sel: number[], suggestedKind: S.JobKind | null, extra: HTMLElement[] = []): Child {
    const all = offers(c, sel)
    const now = performance.now()
    if (held && now >= held.until) held = null
    const live = shown(all)
    const kinds = held ? held.kinds : live.map(x => x.kind)
    const touch = ctx.touch()
    const tight = ctx.layout() === 'narrow' || ctx.layout() === 'short'
    const cells = kinds.map(kind => {
      const x = all.find(y => y.kind === kind)
      if (!x) {
        const given = held?.given.includes(kind)
        return h('span', { class: `order ghost${given ? ' given' : ''}`, k: `order-${kind}` }, given ? [icon('check'), h('span', { class: 'order-name' }, 'On the list')] : null)
      }
      const part = x.fields.length < sel.length ? `${x.fields.length} of ${sel.length}` : ''
      // Where five orders share a phone's width, the time and cost are set close.
      const meta = tight ? `${F.days(x.days).replace(/ days?$/, 'd')}${x.cost ? ` ${F.money(x.cost)}` : ''}` : `${F.days(x.days)}${x.cost ? ` · ${F.money(x.cost)}` : ''}`
      return h('button', {
        class: `order${kind === suggestedKind ? ' suggested' : ''}`, type: 'button', testid: `order-${kind}`, 'aria-keyshortcuts': JOB_KEY[kind],
        title: touch ? undefined : jobWhat(kind),
        onclick: (e: Event) => give(kind, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey),
        oncontextmenu: (e: Event) => { e.preventDefault(); give(kind, true) },
      },
      icon(kind),
      h('span', { class: 'order-name' }, tight && kind === 'kill' ? 'Kill' : JOB_VERB[kind], part ? h('span', { class: 'order-part num' }, ` ${part}`) : null),
      touch ? null : h('span', { class: 'key', 'aria-hidden': 'true' }, JOB_KEY[kind]),
      h('span', { class: 'order-meta num' }, ` ${meta}`),
      h('span', { class: 'sr' }, `. ${jobWhat(kind)}${kind === suggestedKind ? ' Suggested now.' : ''}`))
    })
    const u = picked(c)
    const who = u ? h('span', { class: 'order-who', title: touch ? undefined : `Orders go to ${u.name === S.FARMER_NAME ? 'you' : u.name}` },
      portrait(u.id, 'portrait s'), h('span', { class: 'order-who-name' }, firstName(u.name)), h('span', { class: 'sr' }, `: these orders go to ${u.name === S.FARMER_NAME ? 'you' : u.name}`)) : null
    const more = all.length > MAX_ORDERS && !held ? h('button', {
      class: 'order more', type: 'button', testid: 'order-more', 'aria-label': page === 0 ? 'More orders' : 'Back to the first orders', 'aria-pressed': String(page === 1),
      onclick: () => { page = page === 0 ? 1 : 0; ctx.dirty() },
    }, icon(page === 0 ? 'more' : 'back')) : null
    const room = extra.slice(0, Math.max(0, MAX_ORDERS - cells.length))
    return cells.length || more || room.length ? h('div', { class: 'orders', role: 'group', 'aria-label': u ? `Orders for ${u.name === S.FARMER_NAME ? 'you' : u.name}` : 'Orders' }, who, cells, room, more) : null
  }

  // A contractor's job, ordered and paid for at once: stumps pulled, tile laid.
  function contractor(c: S.Campaign, i: number, kind: 'stump' | 'tile'): HTMLElement | null {
    const why = kind === 'stump' ? S.stumpBlock(c, i) : S.tileBlock(c, i)
    if (why) return null
    const fee = kind === 'stump' ? S.STUMP_FEE : S.TILE_FEE
    const days = kind === 'stump' ? S.STUMP_DAYS : S.TILE_DAYS
    return h('button', {
      class: 'order', type: 'button', testid: `order-${kind}`,
      title: ctx.touch() ? undefined : kind === 'stump' ? 'A contractor with a bulldozer pulls the stumps.' : 'A contractor lays tile under the field: it drains like the slope, and holds a little less water in a drought.',
      onclick: () => {
        const r = ctx.run({ t: kind, field: i })
        if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? ''))
      },
    }, icon(kind), h('span', { class: 'order-name' }, kind === 'stump' ? 'Pull stumps' : 'Tile drains'), h('span', { class: 'order-meta num' }, ` ${F.money(fee)} · ${days}d`),
    h('span', { class: 'sr' }, `. A contractor, ${days} season days.`))
  }

  // The land under the crop, where it matters: stones, shelter, barrels waiting to be hauled.
  function landLine(c: S.Campaign, f: S.FieldInfo): HTMLElement | null {
    const parts: HTMLElement[] = []
    const haul = barrels(app.world, c, f.index)
    if (haul) {
      const who = haul.hauler >= 0 ? c.crew.find(u => u.id === haul.hauler) : undefined
      parts.push(h('span', { class: `reading${haul.frostChance >= 30 ? ' blight' : ''}`, testid: 'barrels' }, icon('haul', 'ic s'),
        h('span', null, `${F.mass(haul.cwt)} in barrels${who ? `, ${firstName(who.name)} hauling` : haul.digging ? '' : ', waiting to be hauled'}${haul.frostChance >= 30 ? `; ${haul.frostChance}% frost tonight` : ''}`)))
    }
    if (f.works) parts.push(h('span', { class: 'reading' }, icon(f.works.kind, 'ic s'), h('span', null, `${f.works.kind === 'stump' ? 'Stumps coming out' : 'Tile going in'}: ${F.plural(f.works.left, 'day')} more`)))
    if (f.stones >= 0.4 || (c.history.length > 0 && f.stones >= 0.3)) parts.push(h('span', { class: 'reading quiet', testid: 'stones' }, icon('rocks', 'ic s'), h('span', null, `${F.upper(stonesWord(f.stones))}: ${stonesText(f.stones)}`)))
    if (f.sheltered && f.status !== 'dug') parts.push(h('span', { class: 'reading quiet', testid: 'shelter' }, icon('woods', 'ic s'), h('span', null, `Sheltered by ${f.shelteredBy}: less wind, more blight weather`)))
    if (f.brushed > 0) parts.push(h('span', { class: 'reading quiet' }, icon('brush', 'ic s'), h('span', null, `Hedgerows cut: back in ${F.plural(f.brushed, 'year')}`)))
    if (f.raw && f.status !== 'off') parts.push(h('span', { class: 'reading quiet' }, icon('idle', 'ic s'), h('span', null, 'New ground: a first potato crop grows less')))
    return parts.length ? h('div', { class: 'card-land' }, parts) : null
  }

  // A tract: where its clearing stands, what the next step costs and yields, and the orders that move it on.
  function tractBody(c: S.Campaign, i: number): Child {
    const t = S.tractInfo(c).find(x => x.field === i)!
    const f = S.fieldInfo(c, i)
    const cropped = t.stage === 'done' && f.status !== 'off'
    const at = t.stage === 'fell' ? 0 : t.stage === 'stump' ? 1 : t.stage === 'rocks' ? 2 : cropped ? 4 : 3
    const steps = [...CLEAR_STEPS.slice(0, 3), { stage: 'done' as S.ClearStage, word: 'Picked', glyph: 'rocks' }, CLEAR_STEPS[3]]
    const left = t.stage === 'fell' ? t.fellLeft : 0
    const logs = t.timber * (1 - t.felled) * (S.FELL_YIELD_BASE + S.FELL_YIELD_PER * 5)
    const stone = S.ROCKS_LOADS * Math.min(t.stones, S.ROCKS_TAKE)
    const yields = t.stage === 'fell' ? `Yields about ${Math.round(logs)} loads of logs.` : t.stage === 'rocks' ? `Yields about ${Math.round(stone)} loads of fieldstone.` : ''
    const shelters = t.shelters.length ? `It shelters ${F.list(t.shelters.map(x => S.FIELD_NAMES[x]))}.` : ''
    const extra = [contractor(c, i, 'stump')].filter((x): x is HTMLElement => !!x)
    const rows = orderRow(c, [i], t.stage === 'fell' ? 'fell' : t.stage === 'rocks' ? 'rocks' : null, extra)
    const next = t.works ? `The bulldozer is pulling stumps: ${F.plural(t.works.left, 'season day')} more.` : t.next ? F.localize(t.next) : f.status === 'off' ? 'Cleared. It can be cropped next spring: a year in oats and clover first lifts the raw ground.' : ''
    return [
      head(t.name, `${F.upper(t.coverWord)} · ${t.tenure === 'none' ? `for sale, ${F.money(t.price)}` : 'the farm\'s'}`, 'close'),
      h('ol', { class: 'clear-track', testid: 'clear-track', 'aria-label': `Clearing: ${steps[at].word.toLowerCase()}, step ${at + 1} of ${steps.length}` },
        steps.map((st, k) => h('li', { class: k < at ? 'done' : k === at ? 'now' : '' },
          icon(k < at ? 'check' : st.glyph, 'ic s'), h('span', null, st.word),
          k === 0 && at === 0 && t.felled > 0 ? gauge(t.felled, { label: 'Felled', text: `${F.pct(t.felled)} felled` }) : null))),
      h('div', { class: 'card-main' },
        h('p', { class: 'card-line note' }, next, left > 0 && c.phase === 'season' ? ' In the season it goes at half speed.' : ''),
        yields || shelters ? h('p', { class: 'card-line' }, [yields, shelters].filter(Boolean).join(' ')) : null,
        t.tenure === 'none' ? line(`It can be bought in spring, ${F.money(t.price)}.`) : !rows ? line(queuedHere(c, i)) : line('')),
      rows,
    ]
  }

  // What is on the list for a tract, in words, when nothing more can be ordered there.
  function queuedHere(c: S.Campaign, i: number): string {
    const jobs = c.season?.jobs.filter(j => j.field === i) ?? []
    if (!jobs.length) return c.phase === 'season' ? 'Nothing more can be done here now.' : ''
    const who = jobs.map(j => c.crew.find(u => u.job === j.id)).find(Boolean)
    return `${jobText(jobs[0])} is on the list${who ? `: ${firstName(who.name)} is on it` : ''}.`
  }

  function line(text: Child, cls = ''): HTMLElement {
    return h('p', { class: `card-line ${cls}`, testid: 'card-line' }, text || null)
  }

  // Why now, why wait, or why nothing can be done: one line, always in the same place.
  function adviceLine(c: S.Campaign, sel: number[], canAny: boolean): HTMLElement {
    if (flashed && performance.now() < flashed.until) return line(flashed.text, `flash lv-${flashed.level}`)
    const s = c.season!
    const needs = app.needs()
    if (sel.length === 1) {
      const i = sel[0]
      const { need, hold } = needs[i] ?? { need: null, hold: null }
      if (need && isJob(need.act)) return line([h('strong', null, `${JOB_VERB[need.act]}. `), F.localize(need.why)], need.urgent ? 'urgent' : 'need')
      if (need && need.act === 'sell') return line([h('strong', null, 'Sell. '), F.localize(need.why)], 'need')
      if (hold) return line(`${F.localize(hold.text)} ${F.localize(hold.why)}`)
      if (!canAny) {
        const f = S.fieldInfo(c, i)
        const job = s.jobs.find(j => j.kind === 'dig' && j.field === i)
        return line(s.frozen ? 'The ground has frozen. Nothing more can be done in the field.'
          : f.status === 'rest' ? `Resting in oats and clover. It earns ${F.money(S.REST_INCOME)} in the fall and puts the soil back.`
            : f.status === 'planted' ? 'Planted. Nothing to do here until the rows are up.'
              : f.status === 'digging' ? `Being dug: ${job ? F.pct(job.done / job.need) : 'part'} of the rows are out. The weigh ticket comes with the last row.`
                : f.status === 'lost' ? 'This crop is lost.'
                  : picked(c) ? `Nothing here that ${picked(c)!.name} can do now.`
                    : 'Everything this field can take is already on the list.')
      }
      return line('')
    }
    const want = sel.filter(i => isJob(needs[i]?.need?.act))
    if (want.length) return line(`${F.list(want.map(i => S.FIELD_NAMES[i]))} ${want.length === 1 ? 'has' : 'have'} a suggested order. ${ctx.touch() ? 'Tap a badge to give it.' : 'Enter gives each its own.'}`, 'need')
    if (!canAny) return line(s.frozen ? 'The ground has frozen. Nothing more can be done in the field.' : picked(c) ? `Nothing here that ${picked(c)!.name} can do now.` : 'None of these fields can take an order now.')
    return line('')
  }

  function gauges(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const s = c.season!
    const watch = s.watchDay >= 0
    const waterCls = f.moistureLabel === 'wilting' ? 'bad' : f.moistureLabel === 'dry' ? 'warn' : f.tooWet ? 'cold' : ''
    const waterWord = f.moistureLabel === 'standing water' ? 'flooded' : f.moistureLabel
    // Each gauge has its name in words where there is room, and as a glyph where there is not.
    const cell = (label: string, glyph: string, value: string, g: HTMLElement, cls = '') => h('div', { class: `g ${cls}` },
      h('span', { class: 'g-head' }, icon(glyph, 'ic s g-ic'), h('span', { class: 't-label g-label' }, label), h('span', { class: 'g-v num' }, value)), g)
    return h('div', { class: 'gauges' },
      cell('Leaf', 'leaf', F.pct(f.canopy), gauge(f.canopy, { label: 'Leaf cover', cls: 'leaf' })),
      cell('Water', 'water', waterWord, gauge(Math.min(1, f.moisture), { label: 'Soil water', text: `${f.moistureLabel}, ${F.pct(f.moisture)} of what plants can use`, cls: waterCls }), waterCls),
      cell('Protection', 'shield', f.protect > 0.02 ? F.pct(f.protect) : 'none', gauge(f.protect, { label: 'Protectant on the leaf', cls: watch && f.protect < 0.35 ? 'warn' : '' }), watch && f.protect < 0.35 && f.status === 'growing' ? 'warn' : ''),
      cell('Hill', 'hill', `${f.hillPasses} of 2`, gauge(f.hillPasses / 2, { label: 'Hilled', text: hillWord(f.hillPasses), mark: 0.5 })))
  }

  // Blight as last seen, and how old that is. Before the rows are up, the soil; once the vines are dead, the skins.
  function reading(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const s = c.season!
    if (f.status === 'idle' || f.status === 'planted') {
      const t = S.today(app.world, c)
      const soil = (t ? t.soilT : 0) + S.SOIL_T_OFFSET[f.elev]
      return h('p', { class: 'reading' }, icon('planted', 'ic s'), h('span', null, `Soil ${F.temp(soil)} here. Seed wants ${F.temp(10)}.`))
    }
    if (f.status === 'dead') {
      const left = Math.ceil((1 - f.skin) * S.SKIN_DAYS)
      return h('p', { class: 'reading' }, icon('dead', 'ic s'), h('span', null, f.skin >= 1 ? 'Skins are set.' : `Skins ${F.pct(f.skin)} set, about ${F.plural(left, 'day')} to go.`))
    }
    if (f.status === 'digging') {
      const job = s.jobs.find(j => j.kind === 'dig' && j.field === f.index)
      return h('p', { class: 'reading' }, icon('dig', 'ic s'), h('span', null, `${job ? F.pct(job.done / job.need) : 'Part'} of the rows are out.`))
    }
    const age = f.scoutAge
    const stale = isStale(f)
    const seen = f.blightHills > 0
    return h('p', { class: `reading${seen ? ' blight' : ''}${stale ? ' stale' : ''}`, testid: 'blight-reading' },
      icon(seen ? (stale ? 'blight-old' : 'blight') : stale ? 'stale' : 'check', 'ic s'),
      h('span', null, seen ? `Blight on ${F.plural(f.blightHills, 'hill')}` : age < 0 ? 'Not walked yet' : 'No blight seen'),
      age >= 0 ? h('span', { class: 'age' }, `walked ${F.ago(age)}`) : seen ? h('span', { class: 'age' }, 'seen from the road') : null)
  }

  function estimate(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const e = f.estimate
    if (!e) return h('p', { class: 'reading quiet' }, icon('bulk', 'ic s'), h('span', null, 'No yield estimate until the tubers set.'))
    const max = Math.max(500, Math.ceil(e.hi / 100) * 100)
    const sample = [...(c.season?.log ?? [])].reverse().find(x => x.type === 'sample' && x.field === f.index)
    return h('div', { class: 'estimate', testid: 'estimate' },
      h('span', { class: 't-label' }, 'Yield'),
      h('span', { class: 'gauge range', role: 'img', 'aria-label': `Yield estimate ${F.perAreaSpan(e.lo, e.hi)}, ${e.digs ? `from ${F.plural(e.digs, 'test dig')}` : 'by eye'}` },
        h('i', { style: `left:${(e.lo / max * 100).toFixed(1)}%;width:${Math.max(2, (e.hi - e.lo) / max * 100).toFixed(1)}%` })),
      h('span', { class: 'est-v num' }, F.perAreaSpan(e.lo, e.hi)),
      sample ? h('button', {
        class: 'nicon s', type: 'button', testid: 'sample-again', 'aria-label': `See the test dig of ${F.date(c.year, sample.day)}`, title: ctx.touch() ? undefined : `See the test dig of ${F.date(c.year, sample.day)}`,
        onclick: () => o.onTray(f.index),
      }, icon('sample', 'ic s')) : h('span', { class: 'est-by' }, 'by eye'))
  }

  function head(title: string, sub: string, k: string): HTMLElement {
    return h('header', { class: 'card-head' },
      h('div', null, h('h2', { class: 't-head', testid: 'card-title' }, title), h('p', { class: 'card-sub' }, sub)),
      h('button', { class: 'nicon', type: 'button', testid: 'card-close', k, 'aria-label': `Deselect${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.select(-1) }, icon('close')))
  }

  function one(c: S.Campaign, i: number): Child {
    const f = S.fieldInfo(c, i)
    if (isTract(i) && (f.cover !== 'open' || f.status === 'off')) return tractBody(c, i)
    const need = app.needs()[i]?.need
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    if (f.status === 'dug' && lot && !f.weighed) {
      return [
        head(f.name, `${f.variety} · dug, coming in`, 'close'),
        h('div', { class: 'card-main' }, landLine(c, f), line('The weigh ticket comes when the last barrel is in the potato house.')),
      ]
    }
    if (f.status === 'dug' && lot) {
      const value = lot.open ? S.lotValue(app.world, c, lot) : 0
      const cull = culledAtDig(lot)
      const deal = deals(app.world, c, lot)[0]
      return [
        head(f.name, `${f.variety} · dug ${F.date(c.year, lot.dugDay, true)}`, 'close'),
        h('div', { class: 'card-main' },
          h('p', { class: 'reading' }, icon('dig', 'ic s'), h('span', null, lot.open
            ? `${F.mass(S.lotCwt(lot))} in the cellar, worth ${F.money(value)} today.${lot.sold > 0 ? ` ${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}.` : ''}`
            : lot.sold > 0 ? `${F.mass(lot.sold)} sold for ${F.money(lot.revenue)}. ${F.mass(cull)} culled.` : 'Nothing was fit to sell.')),
          deal ? line(`${deal.k.buyer} takes ${F.mass(deal.take)} for ${F.money(deal.pays)}, ${versusMarket(deal)}.`, 'need')
            : need && need.act === 'sell' ? line([h('strong', null, 'Sell. '), F.localize(need.why)], 'need') : line('')),
        h('div', { class: 'orders' },
          deal ? h('button', { class: 'order wide suggested', type: 'button', testid: `field-deliver-${lot.id}`, onclick: () => deliver(ctx, lot, deal) },
            icon('deliver'), h('span', { class: 'order-name' }, `Deliver to ${deal.k.buyer.replace(/^The /, 'the ')}`), h('span', { class: 'order-meta num' }, F.money(deal.pays))) : null,
          lot.open ? h('button', { class: 'order wide', type: 'button', testid: `field-sell-${lot.id}`, onclick: () => ctx.run({ t: 'sell', lot: lot.id, frac: 1 }) },
            icon('check'), h('span', { class: 'order-name' }, deal ? 'Sell all' : 'Sell'), h('span', { class: 'order-meta num' }, F.money(value))) : null,
          h('button', { class: 'order wide', type: 'button', testid: `weighin-${lot.id}`, onclick: () => o.onTicket(lot.id) },
            icon('ticket'), h('span', { class: 'order-name' }, 'Ticket'), h('span', { class: 'order-meta' }, 'the weigh-in'))),
      ]
    }
    const extra = c.history.length > 0 ? [contractor(c, i, 'tile')].filter((x): x is HTMLElement => !!x) : []
    const rows = orderRow(c, [i], need && isJob(need.act) ? need.act : null, extra)
    if (f.status === 'rest' || f.status === 'lost') {
      return [head(f.name, f.status === 'rest' ? 'Oats and clover · resting' : `${f.variety} · lost`, 'close'), h('div', { class: 'card-main' }, landLine(c, f), adviceLine(c, [i], !!rows)), rows]
    }
    return [
      head(f.name, `${f.variety} · ${(SHORT_STAGE[f.stage] ?? f.stage).toLowerCase()}`, 'close'),
      gauges(c, f),
      h('div', { class: 'card-main' }, h('div', { class: 'card-known' }, reading(c, f), estimate(c, f)), landLine(c, f), adviceLine(c, [i], !!rows)),
      rows,
    ]
  }

  function many(c: S.Campaign, sel: number[]): Child {
    const rows = orderRow(c, sel, null)
    return [
      head(`${sel.length} fields`, F.list(sel.map(i => S.FIELD_NAMES[i])), 'close'),
      h('div', { class: 'card-main' }, adviceLine(c, sel, !!rows)),
      rows,
    ]
  }

  function update(c: S.Campaign): void {
    const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT && S.held(c, i))
    const was = el.hidden
    if (!sel.length) {
      // The card leaves as it came: nothing cuts out on one frame.
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
    if (key !== shownFor) { shownFor = key; page = 0; held = null; flashed = null }
    const s = c.season!
    const model = {
      sel, layout: ctx.layout(), day: s.day, jobs: s.jobs.map(j => [j.id, j.kind, j.field, Math.round(j.done * 20)]), u: app.settings.units, t: ctx.touch(), page,
      held: held && performance.now() < held.until ? [held.kinds, held.given] : 0, flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      f: sel.map(i => { const f = S.fieldInfo(c, i); return [f.status, f.stage, Math.round(f.canopy * 100), Math.round(f.moisture * 50), f.moistureLabel, Math.round(f.protect * 100), f.hillPasses, f.blightHills, f.scoutAge, f.estimate ? [Math.round(f.estimate.lo), Math.round(f.estimate.hi), f.estimate.digs] : 0, Math.round(f.skin * 100), f.lot, f.cover, Math.round(f.stones * 100), f.works, Math.round(f.inField), f.weighed, f.sheltered, f.brushed, c.fields[i].felled] }),
      cash: Math.round(c.cash / 100), crew: c.crew.map(u => [u.id, u.job, u.prio]), fc: S.haulInfo(app.world, c).map(x => [x.field, x.frostChance, x.hauler]),
      n: app.needs().filter((_, i) => sel.includes(i)).map(x => [x.need?.id, x.need?.why, x.hold?.id, x.hold?.why]),
      lots: c.lots.filter(l => sel.includes(l.field)).map(l => [l.id, l.open, Math.round(S.lotCwt(l)), Math.round(l.sold), l.open ? Math.round(S.lotValue(app.world, c, l)) : 0]),
      frozen: s.frozen, w: s.watchDay >= 0, soil: Math.round(s.soilT * 2), unit: app.unit,
      k: c.contracts.map(k => [k.id, Math.round(k.delivered), k.settled]),
    }
    patch(el, JSON.stringify(model), () => sel.length === 1 ? one(c, sel[0]) : many(c, sel))
    el.setAttribute('aria-label', sel.length === 1 ? `Selected: ${S.FIELD_NAMES[sel[0]]}` : `Selected: ${sel.length} fields`)
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  return { el, update, give, suggested, flash }
}
