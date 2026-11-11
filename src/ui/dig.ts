import * as S from '../sim/index.ts'
import type { Ctx, DialogSpec } from './core.ts'
import { h, s } from './dom.ts'
import * as F from './fmt.ts'

export const CAUSE_LABEL: Record<S.Cause, string> = {
  green: 'Greened', scab: 'Scab', hollow: 'Hollow heart', knob: 'Knobs and cracks', skin: 'Thin skins',
  bruise: 'Bruised', blight: 'Tuber blight', frost: 'Frozen', rot: 'Soft rot', small: 'Too small',
}
const CULLED: S.Cause[] = ['green', 'blight', 'frost', 'rot', 'small']

const GRADE_ROWS: { key: S.Grade | 'skinned'; label: string; note: () => string }[] = [
  { key: 'no1', label: 'US No. 1', note: () => 'the full price' },
  { key: 'chef', label: 'Large', note: () => `over ${F.grams(S.SIZE_CHEF)}` },
  { key: 'b', label: 'B size', note: () => `under ${F.grams(S.SIZE_A)}, about half price` },
  { key: 'no2', label: 'US No. 2', note: () => 'blemished, under half price' },
  { key: 'skinned', label: 'Thin-skinned', note: () => 'No. 2 price, or new potatoes in early September' },
  { key: 'cull', label: 'Culls', note: () => 'starch factory, $1 a hundredweight' },
]

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

function fieldLog(c: S.Campaign, field: number, type: string): S.GameEvent[] {
  return (c.season?.log ?? []).filter(e => e.field === field && e.type === type)
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
    'aria-label': `${weights.length} tubers on a tray at true relative size, ${sound} sound. Weights: ${weights.map(w => F.grams(w)).join(', ')}.`,
  }, kids)
}

function estimateRows(before: S.Estimate | null, after: S.Estimate | null): HTMLElement | null {
  if (!after) return null
  const max = Math.max(after.hi, before?.hi ?? 0) * 1.15
  const band = (e: S.Estimate) => `left:${(e.lo / max * 100).toFixed(1)}%;width:${Math.max(1.5, (e.hi - e.lo) / max * 100).toFixed(1)}%`
  const moving = h('span', { class: 'range-band after', style: band(before ?? after) })
  requestAnimationFrame(() => requestAnimationFrame(() => moving.setAttribute('style', band(after))))
  return h('div', { class: 'est-compare' },
    h('h3', { class: 'sub-title' }, 'The yield estimate'),
    before ? h('div', { class: 'est-row' },
      h('span', { class: 'label' }, 'Before'),
      h('div', { class: 'band bare dim', role: 'img', 'aria-label': `Before: ${F.perArea(before.lo)} to ${F.perArea(before.hi)}` }, h('span', { class: 'range-band', style: band(before) })),
      h('span', { class: 'num est-val' }, `${F.num(F.perAreaValue(before.lo))}–${F.num(F.perAreaValue(before.hi))}`)) : null,
    h('div', { class: 'est-row' },
      h('span', { class: 'label' }, 'Now'),
      h('div', { class: 'band bare', role: 'img', 'aria-label': `Now: ${F.perArea(after.lo)} to ${F.perArea(after.hi)}` }, moving),
      h('span', { class: 'num est-val strong' }, `${F.num(F.perAreaValue(after.lo))}–${F.num(F.perAreaValue(after.hi))}`)),
    h('p', { class: 'sub' }, `${F.perAreaUnit()}, from ${F.plural(after.digs, 'test dig')}. Each hill narrows the range; none closes it, because one hill is not the field.`))
}

export function showSample(ctx: Ctx, e: S.GameEvent, before: S.Estimate | null): DialogSpec {
  const c = ctx.app.campaign!
  const v = S.variety(c.plans[e.field].variety)
  const weights = (e.data?.weights as number[]) ?? []
  const marks = (e.data?.marks as number[]) ?? []
  const grams = Number(e.data?.grams ?? 0)
  const after = S.fieldInfo(c, e.field).estimate
  const counts = new Map<string, number>()
  for (const m of marks) {
    const key = m === 0 ? 'sound' : CAUSE_LABEL[S.CAUSES[m - 1]].toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const small = marks.filter(m => m > 0 && S.CAUSES[m - 1] === 'small').length
  return {
    title: `Test dig, ${S.FIELD_NAMES[e.field]}`,
    testid: 'sample-dialog',
    wide: true,
    cls: 'sample',
    body: () => [
      h('p', { class: 'dialog-lede' }, `${F.date(c.year, e.day)}: one hill of ${v.name} lifted. ${F.plural(weights.length, 'tuber')}, ${F.hillMass(grams)} in all.`),
      tray(weights, marks, v, ctx.phone() ? 360 : 560),
      h('p', { class: 'tally' }, [...counts].map(([k, n]) => `${n} ${k}`).join(' · ')),
      small > weights.length / 2 ? h('p', { class: 'sub' }, 'Most of them are still small. They keep sizing for as long as the vines stay green.') : null,
      estimateRows(before, after),
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
  const deadE = first('killed') ?? first('vinesDead')
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
      return `Common scab comes with dry soil in the five weeks after the tubers set${ti ? ` (in ${name}, from ${date(ti.day)})` : ''}.`
        + (dry ? ` The field was drying out by ${date(dry.day)}${watered ? ` and was watered ${F.plural(watered, 'time')}` : ' and was never watered'}.` : '')
        + ` ${v.name} ${v.scab >= 1.3 ? 'scabs easily' : v.scab < 0.7 ? 'resists scab' : 'is average on scab'}.`
        + (f.soil < 0.6 ? ' Potatoes after potatoes leave scab in the soil.' : '')
    }
    case 'hollow':
      return `The big tubers went hollow inside: growth that stalls in a dry spell and then surges after rain does it, and so does cold soil when the tubers set.${dry ? ` ${name} was drying out by ${date(dry.day)}.` : ''} ${v.name} ${v.hollow >= 0.1 ? 'is prone to it' : 'is seldom troubled by it'}.`
    case 'knob':
      return `A dry spell broken by rain makes tubers grow in fits and crack${dry ? `; ${name} was drying out by ${date(dry.day)}` : ''}.${v.rough >= 1.2 ? ` ${v.name} roughens easily.` : ''} Steady water through August prevents it.`
    case 'skin': {
      if (!deadE) return `Dug with the vines still green, so the skins had not set. They need ${S.SKIN_DAYS} days after the vines die.`
      const k = lot.dugDay - deadE.day
      return `The skins had not set: dug ${F.plural(k, 'day')} after the vines died, and skins need ${S.SKIN_DAYS}. They sell as No. 2, or as new potatoes straight off the field before September 5.`
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lot.id]
      return `${t !== undefined ? `The soil was ${F.temp(t)} on dig day, and c` : 'C'}old tubers bruise in the digger below about ${F.temp(S.BRUISE_SOIL_T)}. Digging before the ground chills avoids it.`
    }
    case 'blight': {
      const seen = [...fieldLog(c, lot.field, 'blightSeen'), ...fieldLog(c, lot.field, 'scout').filter(e => Number(e.data?.found ?? 0) > 0)].sort((a, b) => a.day - b.day)[0]
      const sprays = fieldLog(c, lot.field, 'sprayed').length
      return `Rain washed spores off blighted leaves down into the hill. ${seen ? `Blight was first found in ${name} on ${date(seen.day)}` : 'Blight was never found on the leaves here, so it got in unseen'}${sprays ? `; the field was sprayed ${F.plural(sprays, 'time')}` : '; the field was never sprayed'}. A full hill and an early vine kill keep spores off the tubers.`
    }
    case 'frost': {
      const frosts = fieldLog(c, lot.field, 'frost').map(e => e.day)
      return `${frosts.length ? `Frost came on ${F.list(frosts.slice(-3).map(date))}` : 'Hard frost came before the dig'}, and tubers under a thin hill froze in the ground.${f.elev === 0 ? ' Cold air pools on the bottom land.' : ''} Dig before the hard frosts.`
    }
    case 'rot': {
      const logged = first('logged')
      return `${logged ? `Water stood in ${name} from ${date(logged.day)}, and tubers sitting in waterlogged soil rot.` : 'Tubers that sit in wet soil rot.'}${f.elev === 0 ? ' Bottom land holds water after rain.' : ''}`
    }
    case 'small':
      return `Under ${F.metric() ? '4 cm' : '1½ inches'} across: too small to sell. Tubers keep sizing until the vines die${deadE ? `, and in ${name} they died on ${date(deadE.day)}` : ''}.${v.maturity === 'late' || v.maturity === 'very late' ? ` ${v.name} needs a long season.` : ''}`
  }
}

export function showWeighIn(ctx: Ctx, lotId: number): DialogSpec {
  const app = ctx.app
  const c = app.campaign!
  const lot = c.lots.find(l => l.id === lotId)!
  const v = S.variety(lot.variety)
  const name = S.FIELD_NAMES[lot.field]
  // Selling scales every grade down together, so a lot seen after a sale is scaled back up to dig-day size.
  const snap = ctx.memo.lots[lotId]
  const now = S.lotCwt(lot)
  const scale = snap ? 1 : now > 0 ? (now + lot.sold) / now : 1
  const base = snap ?? lot
  const amount = (k: S.Grade | 'skinned') => (k === 'skinned' ? base.skinned : base.grades[k]) * scale
  const market = S.lotCwt(base) * scale
  const cull = base.grades.cull * scale
  const total = market + cull
  const rows = GRADE_ROWS.map(r => ({ ...r, cwt: amount(r.key) })).filter(r => r.cwt >= 0.5 || r.key === 'no1')
  const losses = S.CAUSES.map(k => ({ k, cwt: lot.loss[k] })).filter(x => x.cwt >= 0.5).sort((a, b) => b.cwt - a.cwt)
  const lost = losses.reduce((a, x) => a + x.cwt, 0)
  const advice = S.advise(app.world, c).find(a => a.act === 'sell' && a.lot === lotId)
  const inCellar = S.openLots(c).reduce((a, l) => a + S.lotCwt(l), 0)
  const cap = S.cellarCapacity(c)
  const max = Math.max(...rows.map(r => r.cwt), 1)
  return {
    title: `Dig day, ${name}`,
    testid: 'weighin',
    wide: true,
    cls: 'weighin',
    foot: close => {
      if (!lot.open) return [
        h('p', { class: 'sub' }, lot.sold > 0 ? `Sold for ${F.money(lot.revenue)}.` : 'Nothing to sell.'),
        h('button', { class: 'btn primary', type: 'button', testid: `lot-keep-${lot.id}`, autofocus: true, onclick: close }, 'Close'),
      ]
      const value = S.lotValue(app.world, c, lot)
      return [
        h('button', { class: 'btn', type: 'button', testid: `lot-keep-${lot.id}`, autofocus: true, onclick: close }, 'Keep it for the cellar'),
        h('button', { class: 'btn primary', type: 'button', testid: `lot-sell-${lot.id}`, onclick: () => { if (ctx.run({ t: 'sell', lot: lot.id, frac: 1 }).ok) close() } }, `Sell it all now, ${F.money(value)}`),
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
      return [
        h('p', { class: 'dialog-lede' }, `${F.date(c.year, lot.dugDay)}. ${v.name} off ${F.area(S.FIELD_ACRES)}: `,
          h('strong', { class: 'num' }, `${F.mass(market)} to sell`), `, ${F.perArea(market / S.FIELD_ACRES)}, and ${F.mass(cull)} culled.`),
        h('h3', { class: 'sub-title' }, 'The weigh-in'),
        h('table', { class: 'weigh' },
          h('caption', { class: 'visually-hidden' }, 'Harvest by grade'),
          h('tbody', null, rows.map(r => h('tr', { class: `g-${r.key}` },
            h('th', { scope: 'row' }, h('span', null, r.label), h('span', { class: 'sub' }, r.note())),
            h('td', { class: 'wbar-cell' }, bar(r.cwt)),
            h('td', { class: 'num' }, F.mass(r.cwt)),
            h('td', { class: 'num sub' }, total > 0 ? F.pct(r.cwt / total) : ''))))),
        h('h3', { class: 'sub-title' }, losses.length ? `Where ${F.mass(lost)} went` : 'Nothing lost'),
        losses.length ? h('ul', { class: 'losses' }, losses.map(x => h('li', null,
          h('div', { class: 'loss-head' },
            h('strong', null, CAUSE_LABEL[x.k]),
            h('span', { class: 'num' }, F.mass(x.cwt)),
            h('span', { class: 'sub' }, x.k === 'skin' ? 'downgraded' : CULLED.includes(x.k) ? 'culled' : 'down to No. 2')),
          h('p', null, why(ctx, c, lot, x.k))))) : h('p', null, 'Every tuber made a grade. A clean dig.'),
        lot.open ? h('div', { class: 'choice' },
          h('h3', { class: 'sub-title' }, 'Sell now or store?'),
          advice ? h('p', { class: 'hint' }, F.localize(advice.why)) : null,
          h('p', null, `Today's price for ${v.name}: ${F.price(S.basePrice(app.world, c, lot.variety))} for US No. 1. Maine prices usually run about ${F.pct(S.MONTH_CURVE[5] / S.MONTH_CURVE[0] - 1)} higher in April than in November, while the pile shrinks and, after about ${Math.round(v.dormancy / 30)} months, sprouts.`),
          h('p', { class: inCellar > cap ? 'warn-text' : 'sub' }, `The cellar holds ${F.mass(cap)}; ${F.mass(inCellar)} is waiting to go in.${inCellar > cap ? ' Whatever does not fit is sold off the field when the season closes.' : ''}`)) : null,
      ]
    },
  }
}
