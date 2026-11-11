import * as S from '../sim/index.ts'
import type { Ctx, DialogSpec } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import * as R from './rules.ts'

export const CAUSE_LABEL: Record<S.Cause, string> = {
  green: 'Greened', scab: 'Scab', hollow: 'Hollow heart', knob: 'Knobs and cracks', skin: 'Thin skins',
  bruise: 'Bruised', blight: 'Tuber blight', frost: 'Frozen', rot: 'Soft rot', small: 'Too small',
}
const CULLED: S.Cause[] = ['green', 'blight', 'frost', 'rot', 'small']

export function lotKey(c: S.Campaign, id: number): string {
  return `${c.seed}:${c.startYear}:${id}`
}

// What went to the cull pile on dig day. A sale empties the pile, so the causes are the lasting record.
export function culledAtDig(lot: S.Lot): number {
  return CULLED.reduce((a, k) => a + lot.loss[k], 0)
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

function fieldLog(c: S.Campaign, field: number, type: string): S.GameEvent[] {
  return (c.season?.log ?? []).filter(e => e.field === field && e.type === type)
}

// The day the digger went in and the day it finished.
export function digDays(c: S.Campaign, lot: S.Lot): { start: number; end: number } {
  const done = fieldLog(c, lot.field, 'dug').pop()?.day ?? c.season?.fields[lot.field]?.dugDay ?? -1
  return { start: lot.dugDay, end: done >= lot.dugDay ? done : lot.dugDay }
}

export function digDatesText(c: S.Campaign, lot: S.Lot): string {
  const { start, end } = digDays(c, lot)
  return end > start ? `Digging started ${F.date(lot.year, start)} and finished ${F.date(lot.year, end)}` : `Dug ${F.date(lot.year, start)}`
}

function gradeRows(ctx: Ctx, c: S.Campaign, lot: S.Lot): { key: S.Grade | 'skinned'; label: string; note: string }[] {
  const last = S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom)
  return [
    { key: 'no1', label: 'US No. 1', note: 'the full price' },
    { key: 'chef', label: 'Large', note: `over ${F.grams(S.SIZE_CHEF)}: ${R.largeRule(ctx.app.world, c, lot.variety)}` },
    { key: 'b', label: 'B size', note: `under ${F.grams(S.SIZE_A)}: ${F.pct(S.GRADE_PRICE.b)} of the No. 1 price` },
    { key: 'no2', label: 'US No. 2', note: `blemished: ${F.pct(S.GRADE_PRICE.no2)} of the No. 1 price` },
    { key: 'skinned', label: 'Thin-skinned', note: `No. 2 price; the No. 1 price only straight from the field, up to ${F.date(lot.year, last)} and within six days of the dig` },
    { key: 'cull', label: 'Culls', note: `to the starch factory at ${F.price(S.CULL_PRICE)}` },
  ]
}

// ---------------------------------------------------------------- the test dig

interface Placed { w: number; mark: number; x: number; y: number; a: number; b: number; rot: number }

function layoutTray(weights: number[], marks: number[], shape: number, width: number): { items: Placed[]; height: number; pxPerCm: number } {
  const pxPerCm = width / 34
  const gap = 1.4 * pxPerCm
  // An ellipsoid of the tuber's weight at 1.08 g/cm3, with semi-axes in the ratio length : width : depth.
  const dims = weights.map((w, k) => {
    const long = shape * (1.06 + ((k * 7) % 5) * 0.02), deep = 0.82
    const r = Math.cbrt((w / 1.08) / ((4 / 3) * Math.PI * long * deep))
    return { k, w, a: long * r * pxPerCm, b: r * pxPerCm }
  }).sort((p, q) => q.w - p.w)
  const items: Placed[] = []
  let x = gap, y = gap, rowH = 0
  for (const d of dims) {
    const wBox = d.a * 2, hBox = d.b * 2 + 20
    if (x + wBox > width - gap && x > gap) { x = gap; y += rowH + gap; rowH = 0 }
    items.push({ w: d.w, mark: marks[d.k], x: x + d.a, y: y + d.b, a: d.a, b: d.b, rot: ((d.k * 37) % 13) - 6 })
    x += wBox + gap
    rowH = Math.max(rowH, hBox)
  }
  return { items, height: y + rowH + gap * 0.6, pxPerCm }
}

function tuberMark(t: Placed): SVGElement[] {
  const { a, b } = t
  const out: SVGElement[] = []
  const cause = t.mark > 0 ? S.CAUSES[t.mark - 1] : null
  switch (cause) {
    case 'green': out.push(s('ellipse', { class: 'm-green', cx: -a * 0.25, cy: -b * 0.2, rx: a * 0.6, ry: b * 0.6 })); break
    case 'scab':
      for (let k = 0; k < 7; k++) out.push(s('circle', { class: 'm-scab', cx: (((k * 53) % 10) / 10 - 0.5) * a * 1.3, cy: (((k * 31) % 10) / 10 - 0.5) * b * 1.2, r: Math.max(1.2, b * 0.11) }))
      break
    case 'hollow':
      out.push(s('line', { class: 'm-cut', x1: -a, y1: 0, x2: a, y2: 0 }))
      out.push(s('path', { class: 'm-hollow', d: `M${-a * 0.35} 0 Q0 ${-b * 0.45} ${a * 0.35} 0 Q0 ${b * 0.45} ${-a * 0.35} 0z` }))
      break
    case 'knob': out.push(s('circle', { class: 't-skin', cx: a * 0.85, cy: -b * 0.45, r: b * 0.45 })); break
    case 'skin': out.push(s('ellipse', { class: 'm-skin', cx: a * 0.2, cy: b * 0.1, rx: a * 0.45, ry: b * 0.4 })); break
    case 'bruise': out.push(s('ellipse', { class: 'm-bruise', cx: a * 0.3, cy: b * 0.15, rx: a * 0.3, ry: b * 0.35 })); break
    case 'blight': out.push(s('path', { class: 'm-blight', d: `M${-a * 0.6} ${-b * 0.1} q${a * 0.3} ${-b * 0.6} ${a * 0.7} ${-b * 0.2} q${a * 0.4} ${b * 0.5} ${-a * 0.1} ${b * 0.7} q${-a * 0.5} ${b * 0.1} ${-a * 0.6} ${-b * 0.5}z` })); break
    case 'frost': out.push(s('ellipse', { class: 'm-frost', cx: 0, cy: 0, rx: a * 0.95, ry: b * 0.95 })); break
    case 'rot': out.push(s('ellipse', { class: 'm-rot', cx: a * 0.45, cy: 0, rx: a * 0.55, ry: b * 0.8 })); break
    default: break
  }
  return out
}

function tray(weights: number[], marks: number[], v: S.Variety, W: number): SVGElement {
  const L = layoutTray(weights, marks, v.shape, W)
  const ten = F.metric() ? 5 : 5.08
  const kids: SVGElement[] = [s('rect', { class: 'tray-bed', x: 0, y: 0, width: W, height: L.height + 26, rx: 6 })]
  for (const t of L.items) {
    const cause = t.mark > 0 ? S.CAUSES[t.mark - 1] : null
    const { a, b } = t
    kids.push(s('g', { transform: `translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) rotate(${t.rot})` },
      s('ellipse', { class: 't-skin', cx: 0, cy: 0, rx: a, ry: b, fill: hex(v.skin) }),
      s('ellipse', { class: 't-light', cx: -a * 0.28, cy: -b * 0.32, rx: a * 0.42, ry: b * 0.3 }),
      [[-0.45, -0.1], [0.2, 0.35], [0.55, -0.3]].map(([ex, ey]) => s('path', { class: 't-eye', d: `M${(ex * a - 2).toFixed(1)} ${(ey * b).toFixed(1)}q2 1.6 4 0` })),
      tuberMark(t),
      s('ellipse', { class: 't-edge', cx: 0, cy: 0, rx: a, ry: b })))
    kids.push(s('text', { class: 'tray-w', x: t.x.toFixed(1), y: (t.y + t.b + 13).toFixed(1) }, F.grams(t.w)))
    if (cause) kids.push(s('text', { class: 'tray-m', x: t.x.toFixed(1), y: (t.y + t.b + 25).toFixed(1) }, CAUSE_LABEL[cause].toLowerCase()))
  }
  const sx = 14, sy = L.height + 14, len = ten * L.pxPerCm
  kids.push(s('line', { class: 'tray-scale', x1: sx, x2: sx + len, y1: sy, y2: sy }))
  kids.push(s('text', { class: 'tray-scale-label', x: sx + len + 8, y: sy + 4 }, F.metric() ? '5 cm' : '2 in'))
  const sound = marks.filter(m => m === 0).length
  return s('svg', {
    class: 'tray', viewBox: `0 0 ${W} ${(L.height + 26).toFixed(0)}`, role: 'img',
    'aria-label': `${F.plural(weights.length, 'tuber')} on a tray at true relative size, ${sound} sound. Weights: ${weights.map(w => F.grams(w)).join(', ')}.`,
  }, kids)
}

// before: what the grower thought going in. mark: one figure to set against the range, drawn as a tick.
function estimateRows(before: S.Estimate | null, after: S.Estimate | null, mark: { at: number; label: string } | null, again: boolean): HTMLElement | null {
  if (!after) return null
  const max = Math.max(after.hi, before?.hi ?? 0, mark?.at ?? 0) * 1.15 || 1
  const band = (e: S.Estimate) => `left:${(e.lo / max * 100).toFixed(1)}%;width:${Math.max(1.5, (e.hi - e.lo) / max * 100).toFixed(1)}%`
  const moving = h('span', { class: 'range-band after', style: band(before ?? after) })
  requestAnimationFrame(() => requestAnimationFrame(() => moving.setAttribute('style', band(after))))
  const tick = mark ? h('span', { class: 'band-tick', style: `left:${(mark.at / max * 100).toFixed(1)}%` }) : null
  const val = (e: S.Estimate) => F.perAreaSpan(e.lo, e.hi).replace(` ${F.perAreaUnit()}`, '')
  return h('div', { class: 'est-compare' },
    h('h3', { class: 'sub-title' }, again ? 'The yield estimate now' : 'The yield estimate'),
    before ? h('div', { class: 'est-row' },
      h('span', { class: 'label' }, 'Before'),
      h('div', { class: 'band bare dim', role: 'img', 'aria-label': `Before: ${F.perAreaSpan(before.lo, before.hi)}` }, h('span', { class: 'range-band', style: band(before) })),
      h('span', { class: 'num est-val' }, val(before))) : null,
    h('div', { class: 'est-row' },
      h('span', { class: 'label' }, 'Now'),
      h('div', { class: 'band bare', role: 'img', 'aria-label': `Now: ${F.perAreaSpan(after.lo, after.hi)}${mark ? `. ${mark.label}` : ''}` }, moving, tick),
      h('span', { class: 'num est-val strong' }, val(after))),
    h('p', { class: 'sub' },
      `${F.perAreaUnit()}, from ${F.plural(after.digs, 'test dig')}.`,
      mark ? ` The tick is this hill: ${mark.label}.` : '',
      ' Each hill usually narrows the range; none closes it, because one hill is not the field.'))
}

// again: the dig is being looked at a second time, from the field panel.
export function showSample(ctx: Ctx, e: S.GameEvent, before: S.Estimate | null, again = false): DialogSpec {
  const c = ctx.app.campaign!
  const v = S.variety(c.plans[e.field].variety)
  const weights = (e.data?.weights as number[]) ?? []
  const marks = (e.data?.marks as number[]) ?? []
  const grams = Number(e.data?.grams ?? 0)
  const after = S.fieldInfo(c, e.field).estimate
  const counts = new Map<string, number>()
  marks.forEach((m, k) => {
    const w = weights[k] ?? 0
    const key = m > 0 ? CAUSE_LABEL[S.CAUSES[m - 1]].toLowerCase() : w < S.SIZE_A ? `sound but B size (under ${F.grams(S.SIZE_A)})` : w > S.SIZE_CHEF ? 'sound and large' : 'sound, US No. 1 size'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  const small = marks.filter(m => m > 0 && S.CAUSES[m - 1] === 'small').length
  const alone = grams * S.PLANTS_PER_ACRE / S.GRAMS_PER_CWT
  return {
    title: `Test dig, ${S.FIELD_NAMES[e.field]}`,
    testid: 'sample-dialog',
    wide: true,
    sticky: true,
    cls: 'sample',
    body: () => [
      h('p', { class: 'dialog-lede' }, `${F.date(c.year, e.day)}: one hill of ${v.name} lifted. ${F.plural(weights.length, 'tuber')}, ${F.hillMass(grams)} in all.`),
      tray(weights, marks, v, ctx.phone() ? 360 : 560),
      h('p', { class: 'tally' }, [...counts].map(([k, n]) => `${n} ${k}`).join(' · ')),
      small > weights.length / 2 ? h('p', { class: 'sub' }, 'Most of them are still small. They keep sizing for as long as the vines stay green.') : null,
      estimateRows(before, after, grams > 0 ? { at: alone, label: `a field of hills like it would give ${F.perArea(alone)}` } : null, again),
    ],
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'sample-close', autofocus: true, onclick: close }, 'Back to the field'),
  }
}

// ---------------------------------------------------------------- dig day

function why(ctx: Ctx, c: S.Campaign, lot: S.Lot, cause: S.Cause): string {
  const name = S.FIELD_NAMES[lot.field]
  const f = S.fieldInfo(c, lot.field)
  const v = S.variety(lot.variety)
  const date = (d: number) => F.date(c.year, d)
  const first = (type: string) => fieldLog(c, lot.field, type)[0]
  const dry = first('dry')
  const planted = first('planted')
  const killed = first('killed')
  const died = first('vinesDead')
  const reel = c.upgrades.reel
  const water = reel ? 'Watering in those weeks prevents it.' : 'Rain or irrigation in those weeks prevents it; without an irrigation reel, most growers here wait for rain.'
  switch (cause) {
    case 'green': {
      const p = f.hillPasses
      const storms: number[] = []
      if (planted) for (let d = planted.day; d < lot.dugDay && d < (c.season?.day ?? 0); d++) if (S.getDay(ctx.app.world, c.year, d).prcp >= S.STORM_MM) storms.push(d)
      return `Tubers that grew up into the light turn green and bitter. ${name} was ${p === 0 ? 'never hilled' : p === 1 ? 'hilled once' : 'hilled twice'}${p < 2 ? '; a second hilling before the rows close keeps them covered' : ''}.`
        + (storms.length ? ` Heavy rain on ${F.list(storms.map(date))} washed soil off the hills.` : '')
        + (v.green >= 1.3 ? ` ${v.name} sets its tubers high in the hill.` : '')
    }
    case 'scab': {
      const ti = first('ti')
      const watered = fieldLog(c, lot.field, 'watered').length
      const inWindow = !!dry && !!ti && dry.day >= ti.day - 7 && dry.day <= ti.day + 35
      return `Common scab comes with dry soil in the five weeks after the tubers set${ti ? ` (in ${name}, ${date(ti.day)} to ${date(ti.day + 35)})` : ''}.`
        + (inWindow ? ` ${name} was drying out by ${date(dry.day)}.` : ` ${name} was dry for part of that time.`)
        + (watered ? ` It was watered ${F.plural(watered, 'time')}.` : reel ? ' It was not watered.' : '')
        + ` ${water}`
        + ` ${v.name} ${v.scab >= 1.3 ? 'scabs easily' : v.scab < 0.7 ? 'resists scab' : 'is average on scab'}.`
        + (f.soil < 0.6 ? ' Potatoes after potatoes leave scab in the soil.' : '')
    }
    case 'hollow':
      return `The big tubers went hollow inside: growth that stalls in a dry spell and then surges after rain does it, and so does cold soil when the tubers set.${dry ? ` ${name} was drying out by ${date(dry.day)}.` : ''} ${v.name} ${v.hollow >= 0.1 ? 'is prone to it' : 'is seldom troubled by it'}.`
    case 'knob':
      return `A dry spell broken by rain makes tubers grow in fits and crack${dry ? `; ${name} was drying out by ${date(dry.day)}` : ''}.${v.rough >= 1.2 ? ` ${v.name} roughens easily.` : ''} Steady water through the bulking weeks, from rain or irrigation, prevents it.`
    case 'skin': {
      const dead = killed ?? died
      const last = F.date(lot.year, S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom))
      if (!dead) return `Dug with the vines still green, so the skins had not set. They need ${S.SKIN_DAYS} days after the vines die.`
      const k = lot.dugDay - dead.day
      return `The skins had not set: dug ${F.plural(k, 'day')} after the vines died, and skins need ${S.SKIN_DAYS}. They sell as No. 2, or at the No. 1 price straight off the field up to ${last}, within six days of the dig.`
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lotKey(c, lot.id)]
      return `${t !== undefined ? `The soil was ${F.temp(t)} on dig day, and c` : 'C'}old tubers bruise in the digger below about ${F.temp(S.BRUISE_SOIL_T)}. Digging before the ground chills avoids it.`
    }
    case 'blight': {
      const seen = [...fieldLog(c, lot.field, 'blightSeen'), ...fieldLog(c, lot.field, 'scout').filter(e => Number(e.data?.found ?? 0) > 0)].sort((a, b) => a.day - b.day)[0]
      const sprays = fieldLog(c, lot.field, 'sprayed').length
      return `Rain washed spores off blighted leaves down into the hill. ${seen ? `Blight was first found in ${name} on ${date(seen.day)}` : 'Blight was never found on the leaves here, so it got in unseen'}${sprays ? `; the field was sprayed ${F.plural(sprays, 'time')}` : '; the field was not sprayed'}. A full hill and an early vine kill keep spores off the tubers.`
    }
    case 'frost': {
      const frosts = fieldLog(c, lot.field, 'frost').map(e => e.day)
      return `${frosts.length ? `Frost came on ${F.list(frosts.slice(-3).map(date))}` : 'Hard frost came before the dig'}, and tubers under a thin hill froze in the ground.${f.elev === 0 ? ' Cold air pools on the bottom land.' : ''} Dig before the hard frosts.`
    }
    case 'rot': {
      const logged = first('logged')
      return `${logged ? `Water stood in ${name} from ${date(logged.day)}, and tubers sitting in waterlogged soil rot.` : 'Tubers that sit in wet soil rot.'}${f.elev === 0 ? ' Bottom land holds water after rain.' : ''}`
    }
    case 'small': {
      const blight = [...fieldLog(c, lot.field, 'blightSeen'), ...fieldLog(c, lot.field, 'scout').filter(e => Number(e.data?.found ?? 0) > 0)].sort((a, b) => a.day - b.day)[0]
      let end = ` In ${name} they were dug green on ${date(lot.dugDay)}.`
      if (killed && (!died || killed.day <= died.day)) {
        end = blight && blight.day <= killed.day
          ? ` In ${name} the vines were killed on ${date(killed.day)} with blight in the field: the kill gave up size to save the tubers from blight.`
          : ` In ${name} the vines were killed on ${date(killed.day)}: each week they stand adds size, and each week risks blight and frost.`
      } else if (died) {
        end = died.text.startsWith('Frost') ? ` In ${name} frost finished the vines on ${date(died.day)}.`
          : died.text.startsWith('Blight') ? ` In ${name} blight took the vines on ${date(died.day)}.`
            : ` In ${name} the vines went down on ${date(died.day)}.`
      }
      return `Under ${F.metric() ? '4 cm' : '1½ inches'} across: too small to grade, so they go to the starch factory with the culls. Tubers keep sizing until the vines die.${end}${v.maturity === 'late' || v.maturity === 'very late' ? ` ${v.name} needs a long season.` : ''}`
    }
  }
}

// What a grower weighs before keeping a crop: today's price, where prices go, what the cellar costs, when it sprouts.
export function sellOrKeep(ctx: Ctx, c: S.Campaign, lot: S.Lot): HTMLElement[] {
  const world = ctx.app.world
  const v = S.variety(lot.variety)
  const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
  return [
    h('p', null, `Today's price for ${v.name}: ${F.price(S.basePrice(world, c, lot.variety))} for US No. 1. This crop is worth `, h('strong', { class: 'num' }, F.money(S.lotValue(world, c, lot))), ' today.'),
    ...(v.contract ? [h('p', null, R.contractText(v))] : [h('p', null, R.outlookText(c)), h('p', null, R.moodText(world, c))]),
    h('p', null, R.storageText(c, S.lotCwt(lot))),
    h('p', null, `Dug ${F.date(lot.year, lot.dugDay)}, this ${v.name} ${R.sproutText(m)}${m < S.CELLAR_MONTHS.length ? '. Sprouted potatoes sell for 15% less and shrink faster' : ''}.`),
  ]
}

// fresh: the dialog is the dig-day reveal itself, not a second look from the field panel.
export function showWeighIn(ctx: Ctx, lotId: number, fresh = false): DialogSpec {
  const app = ctx.app
  const c = app.campaign!
  const lot = c.lots.find(l => l.id === lotId)!
  const v = S.variety(lot.variety)
  const name = S.FIELD_NAMES[lot.field]
  const key = lotKey(c, lotId)
  // Selling scales every grade down together, so a lot seen after a sale is scaled back up to dig-day size.
  const snap = ctx.memo.lots[key]
  const now = S.lotCwt(lot)
  const scale = snap ? 1 : now > 0 ? (now + lot.sold) / now : 1
  const base = snap ?? lot
  const known = !!snap || now > 0
  const amount = (k: S.Grade | 'skinned') => k === 'cull' ? culledAtDig(lot) : (k === 'skinned' ? base.skinned : base.grades[k]) * scale
  const market = known ? S.lotCwt(base) * scale : lot.sold
  const cull = culledAtDig(lot)
  const total = market + cull
  const rows = gradeRows(ctx, c, lot).map(r => ({ ...r, cwt: amount(r.key) })).filter(r => r.cwt >= 0.5 || r.key === 'no1')
  const shown = F.massParts(rows.map(r => r.cwt))
  const losses = S.CAUSES.map(k => ({ k, cwt: lot.loss[k] })).filter(x => x.cwt >= 0.5).sort((a, b) => b.cwt - a.cwt)
  const lost = losses.reduce((a, x) => a + x.cwt, 0)
  const advice = S.advise(app.world, c).find(a => a.act === 'sell' && a.lot === lotId)
  const inCellar = S.openLots(c).reduce((a, l) => a + S.lotCwt(l), 0)
  const cap = S.cellarCapacity(c)
  const max = Math.max(...rows.map(r => r.cwt), 1)
  const est = ctx.memo.digEst[key] ?? null
  const seen = ctx.memo.digSeen[key] ?? null
  const perAcre = total / S.FIELD_ACRES

  // What never grew: plants stunted by virus and seed that did not come up.
  const never: { head: string; cwt: number; text: string }[] = []
  const stunted = seen?.stunted ?? 0
  if (stunted >= 0.05) {
    const share = (1 - S.VIRUS_VIGOR) * stunted
    never.push({
      head: 'Virus', cwt: total * share / (1 - share),
      text: `${F.pct(stunted)} of the plants in ${name} were stunted by virus, and a stunted plant gives about ${F.pct(1 - S.VIRUS_VIGOR)} less. It came in with the seed${c.plans[lot.field]?.seed === 'saved' ? ': saved seed carries more every year it is kept' : ''}.`,
    })
  }
  const stand = seen?.stand ?? S.fieldInfo(c, lot.field).stand
  if (stand < 0.92 && stand > 0) {
    const planted = fieldLog(c, lot.field, 'planted')[0]
    never.push({
      head: 'Thin stand', cwt: total * (1 - stand) / stand,
      text: `${F.pct(1 - stand)} of the seed pieces rotted before they came up${planted ? `, after planting on ${F.date(c.year, planted.day)}` : ''}. Seed rots in cold ground; it wants soil near ${F.temp(10)}.`,
    })
  }

  return {
    title: `Dig day, ${name}`,
    testid: 'weighin',
    wide: true,
    sticky: true,
    cls: 'weighin',
    onClose: () => {
      if (!fresh || !lot.open || ctx.memo.keptTold[key] || app.campaign !== c || c.phase !== 'season') return
      ctx.memo.keptTold[key] = true
      ctx.toast(`${F.mass(S.lotCwt(lot))} of ${v.name} from ${name} went into the cellar. The cellar line by the land sells it.`, 'info')
    },
    foot: close => {
      if (!lot.open) return [
        h('p', { class: 'sub' }, lot.sold > 0 ? `Sold for ${F.money(lot.revenue)}.` : 'Nothing to sell.'),
        h('button', { class: 'btn primary', type: 'button', testid: `lot-keep-${lot.id}`, autofocus: true, onclick: close }, 'Close'),
      ]
      const value = S.lotValue(app.world, c, lot)
      return [
        h('button', { class: 'btn', type: 'button', testid: `lot-keep-${lot.id}`, onclick: close }, 'Keep it for the cellar'),
        h('button', { class: 'btn', type: 'button', testid: `lot-sell-${lot.id}`, onclick: () => { if (ctx.run({ t: 'sell', lot: lot.id, frac: 1 }).ok) close() } }, `Sell it all now, ${F.money(value)}`),
      ]
    },
    body: () => {
      const fills: HTMLElement[] = []
      const bar = (cwt: number) => {
        const fill = h('span', { class: 'wbar-fill', style: 'width:0%' })
        fill.dataset.w = (cwt / max * 100).toFixed(1)
        fills.push(fill)
        return h('span', { class: 'wbar' }, fill)
      }
      requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach((x, k) => { x.style.transitionDelay = `${k * 90}ms`; x.style.width = `${x.dataset.w}%` })))
      const scaleMax = est ? Math.max(est.hi, perAcre) * 1.15 || 1 : 1
      const inside = est ? perAcre >= est.lo && perAcre <= est.hi : false
      return [
        h('p', { class: 'dialog-lede' }, `${digDatesText(c, lot)}. ${v.name} off ${F.area(S.FIELD_ACRES)}: `,
          h('strong', { class: 'num' }, `${F.mass(market)} to sell`), `, ${F.perArea(market / S.FIELD_ACRES)}, and ${F.mass(cull)} culled.`),
        est ? h('div', { class: 'expected' },
          h('h3', { class: 'sub-title' }, 'What you expected, and what the field gave'),
          h('div', { class: 'band bare', role: 'img', 'aria-label': `Your estimate ${F.perAreaSpan(est.lo, est.hi)}; the field gave ${F.perArea(perAcre)}` },
            h('span', { class: 'range-band', style: `left:${(est.lo / scaleMax * 100).toFixed(1)}%;width:${Math.max(1.5, (est.hi - est.lo) / scaleMax * 100).toFixed(1)}%` }),
            h('span', { class: 'band-tick truth', style: `left:${(perAcre / scaleMax * 100).toFixed(1)}%` })),
          h('p', null, `Going in you put ${name} at `, h('strong', { class: 'num' }, F.perAreaSpan(est.lo, est.hi)),
            ` of tubers under the vines, ${est.digs ? `from ${F.plural(est.digs, 'test dig')}` : 'by eye, with no test dig'}. The digger lifted `,
            h('strong', { class: 'num' }, F.perArea(perAcre)), `, culls and all: ${inside ? 'inside your range' : perAcre < est.lo ? 'under your range' : 'over your range'}.`)) : null,
        h('h3', { class: 'sub-title' }, 'The weigh-in'),
        known ? h('table', { class: 'weigh' },
          h('caption', { class: 'visually-hidden' }, 'Harvest by grade, with what each grade sells for'),
          h('tbody', null, rows.map((r, k) => h('tr', { class: `g-${r.key}` },
            h('th', { scope: 'row' }, h('span', null, r.label), h('span', { class: 'sub' }, r.note)),
            h('td', { class: 'wbar-cell' }, bar(r.cwt)),
            h('td', { class: 'num' }, shown.parts[k]),
            h('td', { class: 'num sub' }, total > 0 ? F.pct(r.cwt / total) : ''))))) : h('p', { class: 'sub' }, 'The grade sheet for this crop went with the sale.'),
        h('h3', { class: 'sub-title' }, losses.length ? `What lost grade: ${F.mass(lost)}` : 'Nothing lost grade'),
        losses.length ? h('ul', { class: 'losses' }, losses.map(x => h('li', null,
          h('div', { class: 'loss-head' },
            h('strong', null, CAUSE_LABEL[x.k]),
            h('span', { class: 'num' }, F.mass(x.cwt)),
            h('span', { class: 'sub' }, x.k === 'skin' ? 'downgraded' : CULLED.includes(x.k) ? 'culled' : 'down to No. 2')),
          h('p', null, why(ctx, c, lot, x.k))))) : h('p', null, 'Every tuber made a grade. A clean dig.'),
        never.length ? [
          h('h3', { class: 'sub-title' }, 'What never grew'),
          h('ul', { class: 'losses' }, never.map(x => h('li', null,
            h('div', { class: 'loss-head' }, h('strong', null, x.head), h('span', { class: 'num' }, `about ${F.mass(x.cwt)}`), h('span', { class: 'sub' }, 'not in the crop')),
            h('p', null, x.text)))),
        ] : null,
        lot.open ? h('div', { class: 'choice' },
          h('h3', { class: 'sub-title' }, 'Sell now or keep it?'),
          advice ? h('p', { class: 'hint' }, F.localize(advice.why)) : null,
          sellOrKeep(ctx, c, lot),
          h('p', { class: inCellar > cap ? 'warn-text' : 'sub' }, `The cellar holds ${F.mass(cap)}; kept, this crop brings it to ${F.mass(inCellar)}.${inCellar > cap ? ' Whatever does not fit is sold off the field when the season closes.' : ''}`)) : null,
      ] as Child
    },
  }
}

// ---------------------------------------------------------------- the cellar, during the season

export function openCellar(ctx: Ctx): void {
  const app = ctx.app
  ctx.dialogs.open({
    title: 'In the cellar',
    testid: 'cellar-lots',
    wide: true,
    cls: 'cellar-lots',
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'cellar-close', autofocus: true, onclick: close }, 'Back to the field'),
    body: () => {
      const box = h('div', { class: 'cellar-list' })
      const draw = () => {
        const c = app.campaign
        if (!c) return
        const lots = S.openLots(c)
        const kept = lots.reduce((a, l) => a + S.lotCwt(l), 0)
        const worth = lots.reduce((a, l) => a + S.lotValue(app.world, c, l), 0)
        box.replaceChildren(
          h('p', { class: 'dialog-lede' }, lots.length
            ? `${F.mass(kept)} kept so far, worth ${F.money(worth)} at today's prices. The cellar holds ${F.mass(S.cellarCapacity(c))}. What is still here when the season closes is sold through the winter.`
            : 'The cellar is empty.'),
          ...lots.map(lot => {
            const v = S.variety(lot.variety)
            return h('article', { class: 'lot', 'aria-labelledby': `cl-${lot.id}` },
              h('header', { class: 'lot-head' },
                h('h3', { id: `cl-${lot.id}` }, v.name, h('span', { class: 'sub' }, ` from ${S.FIELD_NAMES[lot.field]}`)),
                h('span', { class: 'num lot-value' }, F.mass(S.lotCwt(lot)))),
              h('div', { class: 'choice' }, sellOrKeep(ctx, c, lot)),
              h('div', { class: 'row-wrap' },
                h('button', { class: 'btn small', type: 'button', testid: `cellar-sell-${lot.id}`, onclick: () => { if (ctx.run({ t: 'sell', lot: lot.id, frac: 1 }).ok) draw() } },
                  `Sell it all now, ${F.money(S.lotValue(app.world, c, lot))}`)))
          }))
      }
      draw()
      return box
    },
  })
}
