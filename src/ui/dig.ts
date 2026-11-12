// The two moments the crop shows itself: the test-dig tray and the weigh ticket, with the full reckoning behind it.
import * as S from '../sim/index.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { count, type Ctx, type PaperSpec } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import * as R from './rules.ts'

const CAUSE_LABEL: Record<S.Cause, string> = {
  green: 'Greened', scab: 'Scab', hollow: 'Hollow heart', knob: 'Knobs and cracks', skin: 'Thin skins',
  bruise: 'Bruised', blight: 'Tuber blight', frost: 'Frozen', rot: 'Soft rot', small: 'Too small', stone: 'Stone bruise',
}
const CULLED: S.Cause[] = ['green', 'blight', 'frost', 'rot', 'small']

export function lotKey(c: S.Campaign, id: number): string {
  return `${c.seed}:${c.startYear}:${c.year}:${id}`
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
function digDays(c: S.Campaign, lot: S.Lot): { start: number; end: number } {
  const done = fieldLog(c, lot.field, 'dug').pop()?.day ?? c.season?.fields[lot.field]?.dugDay ?? -1
  return { start: lot.dugDay, end: done >= lot.dugDay ? done : lot.dugDay }
}

// The day the last barrel came in and the ticket was cut, or -1.
function weighDay(c: S.Campaign, lot: S.Lot): number {
  return fieldLog(c, lot.field, 'weighed').pop()?.day ?? -1
}

// The nights the barrels in the field froze before they were hauled in.
function barrelFrosts(c: S.Campaign, lot: S.Lot): number[] {
  return fieldLog(c, lot.field, 'frozenInField').map(e => e.day).filter(d => d >= lot.dugDay)
}

function stonesWord(stones: number): string {
  return stones >= 0.6 ? 'very stony' : stones >= 0.35 ? 'stony' : 'a little stony'
}

function digDatesText(c: S.Campaign, lot: S.Lot): string {
  const { start, end } = digDays(c, lot)
  return end > start ? `dug ${F.date(lot.year, start)} to ${F.date(lot.year, end)}` : `dug ${F.date(lot.year, start)}`
}

// ---------------------------------------------------------------- the test dig

interface Placed { w: number; mark: number; k: number; x: number; ground: number; a: number; b: number; rot: number }

const LABEL_H = 34
// What a mark is called under its tuber, in a word or two.
const TRAY_MARK: Record<S.Cause, string> = { green: 'green', scab: 'scab', hollow: 'hollow', knob: 'knobby', skin: 'thin skin', bruise: 'bruised', blight: 'blight', frost: 'frozen', rot: 'rot', small: 'small', stone: 'stone bruise' }

// Tubers in weight order on one ground line, or two when one would make them too small to read.
// close: a phone's tray, where the labels stand nearer each other so one row of tubers can do.
function layoutTray(weights: number[], marks: number[], shape: number, width: number, close: boolean): { items: Placed[]; height: number; pxPerCm: number } {
  const LABEL_W = close ? 44 : 50
  const minPx = close ? 3.4 : 5.2
  // An ellipsoid of the tuber's weight at 1.08 g/cm3, with semi-axes in the ratio length : width : depth.
  const dims = weights.map((w, k) => {
    const long = shape * (1.06 + ((k * 7) % 5) * 0.02), deep = 0.82
    const r = Math.cbrt((w / 1.08) / ((4 / 3) * Math.PI * long * deep))
    return { k, w, a: long * r, b: r }
  }).sort((p, q) => q.w - p.w)
  const pad = 14, gap = close ? 6 : 8
  const rowsFor = (n: number) => n === 1 ? [dims] : [dims.slice(0, Math.ceil(dims.length / 2)), dims.slice(Math.ceil(dims.length / 2))]
  const need = (row: typeof dims, px: number) => row.reduce((sum, d) => sum + Math.max(d.a * 2 * px, LABEL_W) + gap, -gap)
  const fit = (rows: (typeof dims)[]) => {
    let lo = 1, hi = 10
    for (let n = 0; n < 14; n++) { const mid = (lo + hi) / 2; if (rows.every(r => need(r, mid) <= width - pad * 2)) lo = mid; else hi = mid }
    return lo
  }
  let rows = rowsFor(1)
  let px = fit(rows)
  if (px < minPx && dims.length > 3) { rows = rowsFor(2); px = fit(rows) }
  const items: Placed[] = []
  let y = pad
  for (const row of rows) {
    const tall = Math.max(...row.map(d => d.b * 2 * px))
    const ground = y + tall
    let x = (width - need(row, px)) / 2
    for (const d of row) {
      const slot = Math.max(d.a * 2 * px, LABEL_W)
      items.push({ w: d.w, mark: marks[d.k], k: d.k, x: x + slot / 2, ground, a: d.a * px, b: d.b * px, rot: ((d.k * 37) % 9) - 4 })
      x += slot + gap
    }
    y = ground + LABEL_H + 6
  }
  return { items, height: y + 20, pxPerCm: px }
}

// A closed, slightly lumpy outline: no two tubers alike, none a perfect oval.
function blob(a: number, b: number, seed: number): string {
  const n = 10
  const pts: [number, number][] = []
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2
    const j = 1 + 0.06 * Math.sin(seed * 1.7 + k * 2.3) + 0.04 * Math.sin(seed * 0.9 + k * 4.1)
    pts.push([Math.cos(t) * a * j, Math.sin(t) * b * j * (Math.sin(t) > 0 ? 0.94 : 1)])
  }
  const at = (i: number) => pts[(i + n) % n]
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return `${d}z`
}

function tuberMark(t: Placed): SVGElement[] {
  const { a, b } = t
  const out: SVGElement[] = []
  const cause = t.mark > 0 ? S.CAUSES[t.mark - 1] : null
  switch (cause) {
    case 'green': out.push(s('ellipse', { class: 'm-green', cx: -a * 0.25, cy: -b * 0.3, rx: a * 0.75, ry: b * 0.7 })); break
    case 'scab':
      for (let k = 0; k < 8; k++) out.push(s('circle', { class: 'm-scab', cx: (((k * 53 + t.k * 17) % 10) / 10 - 0.5) * a * 1.4, cy: (((k * 31 + t.k * 7) % 10) / 10 - 0.5) * b * 1.3, r: Math.max(1.2, b * 0.12) }))
      break
    case 'hollow':
      out.push(s('path', { class: 'm-cut', d: `M${-a * 1.1} ${-b * 0.05}H${a * 1.1}` }))
      out.push(s('path', { class: 'm-hollow', d: `M${-a * 0.35} 0 Q0 ${-b * 0.42} ${a * 0.35} 0 Q0 ${b * 0.42} ${-a * 0.35} 0z` }))
      break
    case 'skin': out.push(s('path', { class: 'm-skin', d: `M${-a * 0.1} ${-b * 0.5}q${a * 0.5} ${b * 0.1} ${a * 0.45} ${b * 0.6}q${-a * 0.4} ${b * 0.25} ${-a * 0.6} ${-b * 0.15}z` })); break
    case 'bruise': out.push(s('ellipse', { class: 'm-bruise', cx: a * 0.3, cy: b * 0.15, rx: a * 0.32, ry: b * 0.38 })); break
    case 'blight': out.push(s('path', { class: 'm-blight', d: `M${-a * 0.7} ${-b * 0.1} q${a * 0.3} ${-b * 0.7} ${a * 0.8} ${-b * 0.3} q${a * 0.4} ${b * 0.6} ${-a * 0.1} ${b * 0.8} q${-a * 0.6} ${b * 0.1} ${-a * 0.7} ${-b * 0.5}z` })); break
    case 'frost': out.push(s('ellipse', { class: 'm-frost', cx: 0, cy: 0, rx: a * 1.2, ry: b * 1.2 })); break
    case 'rot': out.push(s('ellipse', { class: 'm-rot', cx: a * 0.5, cy: b * 0.1, rx: a * 0.6, ry: b * 0.9 })); break
    default: break
  }
  return out
}

let traySeq = 0

function tray(weights: number[], marks: number[], v: S.Variety, W: number, close: boolean): SVGElement {
  const L = layoutTray(weights, marks, v.shape, W, close)
  const id = `tray${++traySeq}`
  const H = L.height
  const russet = v.id === 'burbank' || v.id === 'caribou'
  const kids: SVGElement[] = [
    s('defs', null,
      s('radialGradient', { id: `${id}-form`, cx: '36%', cy: '28%', r: '85%' },
        s('stop', { offset: '0', 'stop-color': '#fff6e0', 'stop-opacity': '0.42' }),
        s('stop', { offset: '0.5', 'stop-color': '#fff6e0', 'stop-opacity': '0' }),
        s('stop', { offset: '1', 'stop-color': '#2a1a0c', 'stop-opacity': '0.42' }))),
    s('rect', { class: 'flat-rim', x: 0.5, y: 0.5, width: W - 1, height: H - 1 }),
    s('rect', { class: 'flat-bed', x: 6, y: 6, width: W - 12, height: H - 12 }),
  ]
  const grounds = [...new Set(L.items.map(t => t.ground))]
  for (const g of grounds) kids.push(s('path', { class: 'flat-slat', d: `M6 ${(g + 1.5).toFixed(1)}H${W - 6}` }))
  L.items.forEach((t, n) => {
    const cause = t.mark > 0 ? S.CAUSES[t.mark - 1] : null
    const { a, b } = t
    const d = blob(a, b, t.k * 3.1 + t.w * 0.013)
    const cy = t.ground - b
    const eyes: SVGElement[] = []
    const count = Math.max(2, Math.min(5, Math.round(a / 9)))
    for (let e = 0; e < count; e++) {
      const ang = (e * 2.4 + t.k * 1.3) % (Math.PI * 2), rr = 0.25 + ((e * 37 + t.k * 11) % 40) / 100
      const ex = Math.cos(ang) * a * rr, ey = Math.sin(ang) * b * rr
      const tilt = ((e * 53 + t.k * 29) % 60) - 30
      eyes.push(s('path', { class: 't-eye', d: 'M-2.2 0q2.2 1.4 4.4 0', transform: `translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${tilt})` }))
    }
    const specks: SVGElement[] = []
    if (russet) for (let e = 0; e < 14; e++) specks.push(s('circle', { class: 't-net', cx: ((((e * 71 + t.k * 13) % 100) / 100) - 0.5) * a * 1.6, cy: ((((e * 43 + t.k * 31) % 100) / 100) - 0.5) * b * 1.5, r: 0.7 }))
    kids.push(s('g', { class: 'tuber', style: `--n:${n}` },
      s('ellipse', { class: 't-shadow', cx: t.x.toFixed(1), cy: (t.ground + 1).toFixed(1), rx: (a * 0.92).toFixed(1), ry: Math.max(2, b * 0.16).toFixed(1) }),
      s('g', { transform: `translate(${t.x.toFixed(1)} ${cy.toFixed(1)}) rotate(${t.rot})` },
        s('clipPath', { id: `${id}-c${n}` }, s('path', { d })),
        s('path', { d, fill: hex(v.skin) }),
        s('g', { 'clip-path': `url(#${id}-c${n})` }, specks, tuberMark(t), s('path', { d, fill: `url(#${id}-form)`, transform: 'scale(1.02)' })),
        cause === 'knob' ? s('path', { class: 't-knob', d: blob(b * 0.5, b * 0.42, t.k), fill: hex(v.skin), transform: `translate(${(a * 0.92).toFixed(1)} ${(-b * 0.5).toFixed(1)})` }) : null,
        cause === 'hollow' ? null : eyes,
        s('path', { class: 't-edge', d })),
      s('text', { class: 'tray-w', x: t.x.toFixed(1), y: (t.ground + 17).toFixed(1) }, F.grams(t.w)),
      cause ? s('text', { class: 'tray-m', x: t.x.toFixed(1), y: (t.ground + 31).toFixed(1) }, TRAY_MARK[cause]) : null))
  })
  const len = (F.metric() ? 5 : 5.08) * L.pxPerCm
  kids.push(s('path', { class: 'tray-scale', d: `M14 ${H - 13}v-5M14 ${H - 15.5}h${len.toFixed(1)}M${(14 + len).toFixed(1)} ${H - 13}v-5` }))
  kids.push(s('text', { class: 'tray-scale-label', x: (20 + len).toFixed(1), y: H - 11 }, F.metric() ? '5 cm' : '2 in'))
  const sound = marks.filter(m => m === 0).length
  return s('svg', {
    class: 'tray', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${F.plural(weights.length, 'tuber')} on a tray at true relative size, ${sound} sound. Weights: ${weights.map(w => F.grams(w)).join(', ')}.`,
  }, kids)
}

// The estimate before and now on one scale, with the hill itself as a tick.
function narrowing(before: S.Estimate | null, after: S.Estimate, hill: number, staged: boolean, delay: number): HTMLElement {
  // The scale is fitted to these figures, so the narrowing is wide enough to see.
  const max = Math.ceil(Math.max(after.hi, before?.hi ?? 0, hill) * 1.2 / 50) * 50 || 50
  const band = (e: S.Estimate) => `left:${(e.lo / max * 100).toFixed(1)}%;width:${Math.max(1.5, (e.hi - e.lo) / max * 100).toFixed(1)}%`
  const from = before ?? after
  const now = h('i', { style: band(staged ? from : after) })
  const lo = h('span', null, ''), hi = h('span', null, '')
  const digits = F.metric() ? 1 : 0
  const show = (n: number) => F.num(F.perAreaValue(n), digits)
  lo.textContent = show(staged ? from.lo : after.lo)
  hi.textContent = show(staged ? from.hi : after.hi)
  if (staged) {
    setTimeout(() => {
      if (!now.isConnected) return
      now.setAttribute('style', band(after))
      count(lo, from.lo, after.lo, show)
      count(hi, from.hi, after.hi, show)
    }, delay)
  }
  return h('div', { class: 'narrowing' },
    before ? h('div', { class: 'nrow was' },
      h('span', { class: 't-label' }, 'Before'),
      h('span', { class: 'gauge range', role: 'img', 'aria-label': `Before: ${F.perAreaSpan(before.lo, before.hi)}` }, h('i', { style: band(before) })),
      h('span', { class: 'num' }, F.perAreaSpan(before.lo, before.hi).replace(` ${F.perAreaUnit()}`, ''))) : null,
    h('div', { class: 'nrow' },
      h('span', { class: 't-label' }, 'Now'),
      h('span', { class: 'gauge range', role: 'img', 'aria-label': `Now: ${F.perAreaSpan(after.lo, after.hi)}. A field of hills like this one would give ${F.perArea(hill)}.` },
        now, hill > 0 ? h('b', { class: 'tick', style: `left:${Math.min(100, hill / max * 100).toFixed(1)}%;animation-delay:${Math.max(0, delay - 300)}ms` }) : null),
      h('span', { class: 'num strong' }, lo, '–', hi)),
    h('p', { class: 'sub' }, `${F.perAreaUnit()}, from ${F.plural(after.digs, 'test dig')}. The tick is this hill. One hill is not the field: the range moves, it does not close.`))
}

// The tray paper for one test dig. It sits beside the land and does not stop the clock.
export function trayPaper(ctx: Ctx, e: S.GameEvent, before: S.Estimate | null, o: { staged: boolean; onClose: () => void }): HTMLElement {
  const c = ctx.app.campaign!
  const v = S.variety(c.plans[e.field].variety)
  const weights = (e.data?.weights as number[]) ?? []
  const marks = (e.data?.marks as number[]) ?? []
  const grams = Number(e.data?.grams ?? 0)
  const after = S.fieldInfo(c, e.field).estimate
  const tally = new Map<string, number>()
  marks.forEach((m, k) => {
    const w = weights[k] ?? 0
    const key = m > 0 ? CAUSE_LABEL[S.CAUSES[m - 1]].toLowerCase() : w < S.SIZE_A ? 'sound, B size' : w > S.SIZE_CHEF ? 'sound and large' : 'sound, No. 1 size'
    tally.set(key, (tally.get(key) ?? 0) + 1)
  })
  const alone = grams * S.PLANTS_PER_ACRE / S.GRAMS_PER_CWT
  const W = ctx.layout() === 'narrow' ? Math.min(360, innerWidth - 48) : 360
  const staged = o.staged && !ctx.reduced()
  const arrive = Math.min(6, weights.length) * 90 + 420
  const el = h('section', { class: `paper tray-paper${staged ? ' staged' : ''}`, role: 'region', 'aria-label': `Test dig, ${S.FIELD_NAMES[e.field]}`, testid: 'sample-dialog' },
    h('header', { class: 'tray-head' },
      h('div', null,
        h('span', { class: 't-label' }, 'Test dig'),
        h('h2', { class: 't-head' }, S.FIELD_NAMES[e.field])),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Put the tray away', testid: 'sample-close', onclick: o.onClose }, icon('close'))),
    h('p', { class: 't-small tray-lede' }, `${F.date(c.year, e.day)}: one hill of ${v.name}. ${F.plural(weights.length, 'tuber')}, ${F.hillMass(grams)}.`),
    // On a phone the tubers keep to one row where they can, so the tray leaves the land its room.
    tray(weights, marks, v, W, ctx.layout() === 'narrow'),
    h('p', { class: 't-small tally' }, [...tally].map(([k, n]) => `${n} ${k}`).join(' · ')),
    after ? narrowing(before, after, alone, staged, arrive + 500) : null)
  // A click anywhere on the tray skips the staging.
  if (staged) el.addEventListener('pointerdown', () => el.classList.remove('staged'), { once: true })
  return el
}

// ---------------------------------------------------------------- dig day

interface Facts { name: string; f: S.FieldInfo; v: S.Variety; planted?: S.GameEvent; killed?: S.GameEvent; died?: S.GameEvent; dry?: S.GameEvent; blight?: S.GameEvent }

function facts(c: S.Campaign, lot: S.Lot): Facts {
  const first = (type: string) => fieldLog(c, lot.field, type)[0]
  const blight = [...fieldLog(c, lot.field, 'blightSeen'), ...fieldLog(c, lot.field, 'scout').filter(e => Number(e.data?.found ?? 0) > 0)].sort((a, b) => a.day - b.day)[0]
  return { name: S.FIELD_NAMES[lot.field], f: S.fieldInfo(c, lot.field), v: S.variety(lot.variety), planted: first('planted'), killed: first('killed'), died: first('vinesDead'), dry: first('dry'), blight }
}

// Each cause in a phrase, for the ticket.
function phrase(ctx: Ctx, c: S.Campaign, lot: S.Lot, cause: S.Cause): string {
  const x = facts(c, lot)
  const inDay = weighDay(c, lot)
  switch (cause) {
    case 'green': return x.f.hillPasses === 0 ? 'never hilled, so the tubers saw light' : x.f.hillPasses === 1 ? 'hilled once: a thin hill let the light in'
      : inDay - lot.dugDay > 2 ? `${inDay - lot.dugDay} days in the barrels in the sun` : 'rain washed soil off the hills'
    case 'scab': return 'dry soil in the weeks after the tubers set'
    case 'hollow': return 'growth stalled, then surged'
    case 'knob': return 'a dry spell broken by rain'
    case 'skin': {
      const dead = x.killed ?? x.died
      return dead ? `dug ${F.plural(lot.dugDay - dead.day, 'day')} after the vines died; skins need ${S.SKIN_DAYS}` : 'dug with the vines still green'
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lotKey(c, lot.id)]
      return t !== undefined ? `dug with the soil at ${F.temp(t)}` : 'dug from cold ground'
    }
    case 'blight': return 'spores washed down from blighted leaf'
    case 'frost': {
      const nights = barrelFrosts(c, lot)
      return nights.length ? `froze in the barrels on ${F.list(nights.map(d => F.date(c.year, d, true)))}, before the haul` : 'froze in the ground before the dig'
    }
    case 'rot': return 'sat in waterlogged soil'
    case 'small':
      if (x.killed && (!x.died || x.killed.day <= x.died.day)) return `the vines were killed on ${F.date(c.year, x.killed.day, true)}, before these sized`
      if (x.died) return x.died.text.startsWith('Frost') ? 'frost finished the vines before these sized' : x.died.text.startsWith('Blight') ? 'blight took the vines before these sized' : 'the vines went down before these sized'
      return 'dug green, before they sized'
    case 'stone': return `${x.name} is ${stonesWord(x.f.stones)}: tubers knocked on stones in the digger`
  }
}

// Each cause in full: tied to the field's own dates and the player's own acts.
function why(ctx: Ctx, c: S.Campaign, lot: S.Lot, cause: S.Cause): string {
  const { name, f, v, planted, killed, died, dry } = facts(c, lot)
  const date = (d: number) => F.date(c.year, d)
  const first = (type: string) => fieldLog(c, lot.field, type)[0]
  const reel = c.upgrades.reel
  const water = reel ? 'Watering in those weeks prevents it.' : 'Rain or irrigation in those weeks prevents it; without an irrigation reel, most growers here wait for rain.'
  switch (cause) {
    case 'green': {
      const p = f.hillPasses
      const storms: number[] = []
      if (planted) for (let d = planted.day; d < lot.dugDay && d < (c.season?.day ?? 0); d++) if (S.getDay(ctx.app.world, c.year, d).prcp >= S.STORM_MM) storms.push(d)
      const barrels = weighDay(c, lot) - lot.dugDay
      return `Tubers that grew up into the light turn green and bitter. ${name} was ${p === 0 ? 'never hilled' : p === 1 ? 'hilled once' : 'hilled twice'}${p < 2 ? '; a second hilling before the rows close keeps them covered' : ''}.`
        + (storms.length ? ` Heavy rain on ${F.list(storms.map(date))} washed soil off the hills.` : '')
        + (barrels > 2 ? ` The crop sat ${barrels} days in barrels in the field, and every bright day greens some of it.` : '')
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
      const seen = facts(c, lot).blight
      const sprays = fieldLog(c, lot.field, 'sprayed').length
      return `Rain washed spores off blighted leaves down into the hill. ${seen ? `Blight was first found in ${name} on ${date(seen.day)}` : 'Blight was never found on the leaves here, so it got in unseen'}${sprays ? `; the field was sprayed ${F.plural(sprays, 'time')}` : '; the field was not sprayed'}. A full hill and an early vine kill keep spores off the tubers.`
    }
    case 'frost': {
      const nights = barrelFrosts(c, lot)
      if (nights.length) return `A hard frost on ${F.list(nights.map(date))} caught the crop in barrels in ${name} before it was hauled in, and a fifth of what lay there froze. Another pair of hands on the haul, a second tractor or the truck brings it in as the digger goes.`
      const frosts = fieldLog(c, lot.field, 'frost').map(e => e.day)
      return `${frosts.length ? `Frost came on ${F.list(frosts.slice(-3).map(date))}` : 'Hard frost came before the dig'}, and tubers under a thin hill froze in the ground.${f.elev === 0 ? ' Cold air pools on the bottom land.' : ''} Dig before the hard frosts.`
    }
    case 'rot': {
      const logged = first('logged')
      return `${logged ? `Water stood in ${name} from ${date(logged.day)}, and tubers sitting in waterlogged soil rot.` : 'Tubers that sit in wet soil rot.'}${f.elev === 0 ? ' Bottom land holds water after rain.' : ''}`
    }
    case 'small': {
      const blight = facts(c, lot).blight
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
    case 'stone': return `${name} is ${stonesWord(f.stones)}, and tubers knocked on the stones as the digger lifted them went down to No. 2. Frost heaves more up every winter. Picking the rocks with no crop in takes most of them off, and a practised hand on the digger bruises fewer.`
  }
}

type GradeKey = S.Grade | 'skinned'
const GRADE_LABEL: Record<GradeKey, string> = { no1: 'US No. 1', chef: 'Large', b: 'B size', no2: 'US No. 2', skinned: 'Thin-skinned', cull: 'Culls' }
const GRADE_ORDER: GradeKey[] = ['no1', 'chef', 'b', 'no2', 'skinned', 'cull']

function gradeNote(ctx: Ctx, c: S.Campaign, lot: S.Lot, key: GradeKey): string {
  const last = S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom)
  switch (key) {
    case 'no1': return 'the full price'
    case 'chef': return `over ${F.grams(S.SIZE_CHEF)}: ${R.largeRule(ctx.app.world, c, lot.variety)}`
    case 'b': return `under ${F.grams(S.SIZE_A)}: ${F.pct(S.GRADE_PRICE.b)} of the No. 1 price`
    case 'no2': return `blemished: ${F.pct(S.GRADE_PRICE.no2)} of the No. 1 price`
    case 'skinned': return `No. 2 price; the No. 1 price only straight from the field, up to ${F.date(lot.year, last)} and within six days of the dig`
    case 'cull': return `to the starch factory at ${F.price(S.CULL_PRICE)}`
  }
}

// The crop as it stood on dig day, whatever has been sold since.
function atDig(ctx: Ctx, c: S.Campaign, lot: S.Lot): { known: boolean; market: number; cull: number; total: number; rows: { key: GradeKey; cwt: number }[] } {
  const snap = ctx.memo.lots[lotKey(c, lot.id)]
  const now = S.lotCwt(lot)
  // Selling scales every grade down together, so a lot seen after a sale is scaled back up to dig-day size.
  const scale = snap ? 1 : now > 0 ? (now + lot.sold) / now : 1
  const base = snap ?? lot
  const known = !!snap || now > 0
  const cull = culledAtDig(lot)
  const market = known ? S.lotCwt(base) * scale : lot.sold
  const amount = (k: GradeKey) => k === 'cull' ? cull : (k === 'skinned' ? base.skinned : base.grades[k]) * scale
  const rows = GRADE_ORDER.map(key => ({ key, cwt: amount(key) })).filter(r => r.cwt >= 0.5 || r.key === 'no1')
  return { known, market, cull, total: market + cull, rows }
}

// What a grower weighs before keeping a crop, in full.
function sellOrKeep(ctx: Ctx, c: S.Campaign, lot: S.Lot): HTMLElement[] {
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

// The potato houses and what is kept in them, with this crop counted in: what will not fit is sold off the field.
export function storageLine(c: S.Campaign): string {
  const st = S.storageInfo(c)
  const over = st.stored - st.capacity
  const houses = st.houses.length === 1 ? `The potato house holds ${F.mass(st.capacity)}` : `${F.list(st.houses.map(x => `${x.name.replace(/ potato house$/, '').replace(/^Home$/, 'the home one')} ${F.mass(x.cwt)}`))}: ${F.mass(st.capacity)} in all`
  return `${houses}. Kept, this crop brings what is stored to ${F.mass(st.stored)}${over > 0.5 ? `, and ${F.mass(over)} will not fit: it is sold off the field when the season closes` : `, leaving room for ${F.mass(st.free)}`}.`
}

// Everything behind the ticket: every grade rule, every cause, and what never grew.
function reckoning(ctx: Ctx, lotId: number): PaperSpec {
  const c = ctx.app.campaign!
  const lot = c.lots.find(l => l.id === lotId)!
  const name = S.FIELD_NAMES[lot.field]
  const key = lotKey(c, lotId)
  const d = atDig(ctx, c, lot)
  const shown = F.massParts(d.rows.map(r => r.cwt))
  const losses = S.CAUSES.map(k => ({ k, cwt: lot.loss[k] })).filter(x => x.cwt >= 0.5).sort((a, b) => b.cwt - a.cwt)
  const lost = losses.reduce((a, x) => a + x.cwt, 0)
  const seen = ctx.memo.digSeen[key] ?? null
  const never: { head: string; cwt: number; text: string }[] = []
  const stunted = seen?.stunted ?? 0
  if (stunted >= 0.05) {
    const share = (1 - S.VIRUS_VIGOR) * stunted
    never.push({
      head: 'Virus', cwt: d.total * share / (1 - share),
      text: `${F.pct(stunted)} of the plants in ${name} were stunted by virus, and a stunted plant gives about ${F.pct(1 - S.VIRUS_VIGOR)} less. It came in with the seed${c.plans[lot.field]?.seed === 'saved' ? ': saved seed carries more every year it is kept' : ''}.`,
    })
  }
  const stand = seen?.stand ?? S.fieldInfo(c, lot.field).stand
  if (stand < 0.92 && stand > 0) {
    const planted = fieldLog(c, lot.field, 'planted')[0]
    never.push({
      head: 'Thin stand', cwt: d.total * (1 - stand) / stand,
      text: `${F.pct(1 - stand)} of the seed pieces rotted before they came up${planted ? `, after planting on ${F.date(c.year, planted.day)}` : ''}. Seed rots in cold ground; it wants soil near ${F.temp(10)}.`,
    })
  }
  const st = S.storageInfo(c)
  return {
    title: `The reckoning, ${name}`,
    testid: 'reckoning',
    size: 'wide',
    body: () => [
      h('p', { class: 't-lede' }, `${F.upper(digDatesText(c, lot))}. ${S.variety(lot.variety).name} off ${F.area(S.FIELD_ACRES)}: ${F.mass(d.market)} to sell and ${F.mass(d.cull)} culled.`),
      h('h3', { class: 'block-head' }, 'Grade by grade'),
      d.known ? h('table', { class: 'money grades' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Grade'), h('th', { scope: 'col' }, 'Weight'), h('th', { scope: 'col' }, 'Share'))),
        h('tbody', null, d.rows.map((r, k) => h('tr', null,
          h('th', { scope: 'row' }, GRADE_LABEL[r.key], h('span', { class: 'sub' }, ` ${gradeNote(ctx, c, lot, r.key)}`)),
          h('td', null, shown.parts[k]),
          h('td', null, d.total > 0 ? (r.cwt / d.total < 0.005 ? 'under 1%' : F.pct(r.cwt / d.total)) : ''))))) : h('p', { class: 'sub' }, 'The grade sheet for this crop went with the sale.'),
      h('h3', { class: 'block-head' }, losses.length ? `What lost grade: ${F.mass(lost)}` : 'Nothing lost grade'),
      losses.length ? h('ul', { class: 'causes' }, losses.map(x => h('li', null,
        h('div', { class: 'cause-head' },
          h('strong', null, CAUSE_LABEL[x.k]),
          h('span', { class: 'num' }, F.mass(x.cwt)),
          h('span', { class: 'sub' }, x.k === 'skin' ? 'downgraded' : CULLED.includes(x.k) ? 'culled' : 'down to No. 2')),
        h('p', null, why(ctx, c, lot, x.k))))) : h('p', null, 'Every tuber made a grade. A clean dig.'),
      never.length ? [
        h('h3', { class: 'block-head' }, 'What never grew'),
        h('ul', { class: 'causes' }, never.map(x => h('li', null,
          h('div', { class: 'cause-head' }, h('strong', null, x.head), h('span', { class: 'num' }, `about ${F.mass(x.cwt)}`), h('span', { class: 'sub' }, 'not in the crop')),
          h('p', null, x.text)))),
      ] : null,
      lot.open ? [
        h('h3', { class: 'block-head' }, 'Sell now or store it?'),
        sellOrKeep(ctx, c, lot),
        h('p', { class: st.stored > st.capacity ? 'warn-text' : 'sub' }, storageLine(c)),
      ] : null,
    ] as Child,
    foot: close => h('button', { class: 'btn primary', type: 'button', testid: 'reckoning-close', autofocus: true, onclick: close }, 'Back to the ticket'),
  }
}

// The weigh ticket. fresh: this is dig day itself, so it is staged and wants an answer.
export function ticket(ctx: Ctx, lotId: number, o: { fresh: boolean; staged?: boolean }): PaperSpec {
  const app = ctx.app
  const c = app.campaign!
  const lot = c.lots.find(l => l.id === lotId)!
  const v = S.variety(lot.variety)
  const name = S.FIELD_NAMES[lot.field]
  const key = lotKey(c, lotId)
  const d = atDig(ctx, c, lot)
  const parts = F.massParts(d.rows.map(r => r.cwt))
  const losses = S.CAUSES.map(k => ({ k, cwt: lot.loss[k] })).filter(x => x.cwt >= 0.5).sort((a, b) => b.cwt - a.cwt)
  const est = ctx.memo.digEst[key] ?? null
  const perAcre = d.total / S.FIELD_ACRES
  const value = lot.open ? S.lotValue(app.world, c, lot) : lot.revenue
  const fresh = o.fresh
  const staged = fresh && !!o.staged && !ctx.reduced()
  const advice = S.advise(app.world, c).find(a => a.act === 'sell' && a.lot === lotId)
  const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
  const dug = digDays(c, lot)
  const inDay = weighDay(c, lot)
  let answered = false
  let worthEl: HTMLElement | null = null

  return {
    title: `Weigh ticket, ${name}`,
    testid: 'weighin',
    size: 'medium',
    cls: `ticket-paper${staged ? ' staged' : ''}`,
    sticky: fresh && lot.open,
    bare: true,
    // A dig-day ticket still waiting when its crop has already been sold or delivered has nothing to ask.
    stale: () => fresh && !lot.open,
    closeLabel: lot.open ? 'Store it and close' : 'Close',
    onClose: () => {
      if (!fresh || app.campaign !== c || c.phase !== 'season') return
      if (lot.open && !answered) ctx.say(`${F.mass(S.lotCwt(lot))} from ${name} went into the cellar.`, 'info')
      // The decision is made: the days run again.
      if (!ctx.papers.pending()) app.resumeAfterCard()
    },
    body: () => {
      const weight = h('span', { class: 'figure num', testid: 'ticket-weight' }, F.mass(d.market))
      const worth = h('span', { class: 'figure num', testid: 'ticket-value' }, F.money(value))
      worthEl = worth
      const max = est ? Math.max(500, Math.ceil(Math.max(est.hi, perAcre) / 100) * 100) : 500
      const inside = est ? perAcre >= est.lo && perAcre <= est.hi : false
      const root = h('div', { class: 'ticket' },
        h('header', { class: 'ticket-head' },
          h('span', { class: 't-label' }, 'Weigh ticket'),
          h('h3', { class: 't-title' }, name),
          // Set out as the form a scale house fills in.
          h('dl', { class: 'ticket-form' },
            h('div', null, h('dt', { class: 't-label' }, 'Variety'), h('dd', null, v.name)),
            h('div', null, h('dt', { class: 't-label' }, 'Dug'), h('dd', { class: 'num' }, dug.end > dug.start ? `${F.date(lot.year, dug.start, true)} to ${F.date(lot.year, dug.end, true)}` : F.date(lot.year, dug.start, true))),
            inDay >= 0 && inDay > dug.end
              ? h('div', null, h('dt', { class: 't-label' }, 'Hauled in'), h('dd', { class: 'num' }, F.date(lot.year, inDay, true)))
              : h('div', null, h('dt', { class: 't-label' }, 'Off'), h('dd', { class: 'num' }, F.area(S.FIELD_ACRES))),
            h('div', null, h('dt', { class: 't-label' }, 'Ticket'), h('dd', { class: 'num' }, `${R.yearShort(c.year)}-${lot.id}`)))),
        est ? h('div', { class: 'carried' },
          h('span', { class: 't-label' }, 'You expected'),
          h('span', { class: 'gauge range', role: 'img', 'aria-label': `Your estimate ${F.perAreaSpan(est.lo, est.hi)}; the field gave ${F.perArea(perAcre)}` },
            h('i', { style: `left:${(est.lo / max * 100).toFixed(1)}%;width:${Math.max(1.5, (est.hi - est.lo) / max * 100).toFixed(1)}%` }),
            h('b', { class: 'tick truth', style: `left:${Math.min(100, perAcre / max * 100).toFixed(1)}%` })),
          h('p', { class: 'carried-text', testid: 'carried' }, h('span', { class: 'num' }, F.perAreaSpan(est.lo, est.hi)), `, ${est.digs ? `from ${F.plural(est.digs, 'test dig')}` : 'by eye'}. The field gave `,
            h('strong', { class: 'num' }, F.perArea(perAcre)), `, culls and all: ${inside ? 'inside your range' : perAcre < est.lo ? 'under your range' : 'over your range'}.`)) : null,
        h('div', { class: 'ticket-big' },
          h('div', null, h('span', { class: 't-label' }, lot.open ? 'To sell' : 'Sold'), weight, h('span', { class: 'sub num' }, `${F.perArea(d.market / S.FIELD_ACRES)} · ${F.mass(d.cull)} culled`)),
          h('div', null, h('span', { class: 't-label' }, lot.open ? 'Worth today' : 'Sold for'), worth, h('span', { class: 'sub num' }, lot.open ? `${F.price(S.basePrice(app.world, c, lot.variety))} for No. 1` : ''))),
        d.known ? [
          h('div', { class: 'gradebar', role: 'img', 'aria-label': `By grade: ${d.rows.map((r, k) => `${GRADE_LABEL[r.key]} ${parts.parts[k]}`).join(', ')}` },
            d.rows.map(r => h('i', { class: `g-${r.key}`, style: `flex-grow:${Math.max(r.cwt, d.total * 0.004).toFixed(2)}` }))),
          h('ul', { class: 'grade-key' }, d.rows.map((r, k) => h('li', null, h('i', { class: `g-${r.key}` }), h('span', null, GRADE_LABEL[r.key]), h('span', { class: 'num' }, parts.parts[k])))),
        ] : h('p', { class: 'sub' }, 'The grade sheet for this crop went with the sale.'),
        h('div', { class: 'losses' },
          h('h4', { class: 't-label' }, losses.length ? 'The largest losses' : 'Losses'),
          losses.length ? h('ol', null, losses.slice(0, 3).map((x, k) => h('li', { style: `--n:${k}` },
            h('strong', null, CAUSE_LABEL[x.k]), h('span', { class: 'num' }, F.mass(x.cwt)), h('span', { class: 'loss-why' }, phrase(ctx, c, lot, x.k))))) : h('p', null, 'Every tuber made a grade. A clean dig.'),
          h('button', { class: 'btn small', type: 'button', testid: 'reckoning-open', onclick: () => ctx.papers.open(reckoning(ctx, lotId)) }, 'The full reckoning')))
      if (staged) {
        // The truth lands on the estimate first, then the scale fills as the weight counts, then the losses.
        setTimeout(() => { if (root.isConnected && root.closest('.staged')) { count(weight, 0, d.market, n => F.mass(n)); count(worth, 0, value, n => F.money(n)) } }, 800)
        // A press or a key anywhere on the ticket skips to the end of it.
        setTimeout(() => {
          const paper = root.closest<HTMLElement>('.staged')
          const skip = () => paper?.classList.remove('staged')
          paper?.addEventListener('pointerdown', skip, { once: true })
          paper?.addEventListener('keydown', skip, { once: true })
        }, 0)
      }
      return root
    },
    foot: close => {
      if (!lot.open) return h('button', { class: 'btn primary', type: 'button', testid: `lot-keep-${lot.id}`, autofocus: true, onclick: close }, 'Close')
      const box = h('div', { class: 'choice-box' })
      let delivered = false
      // Delivering takes the No. 1 and large tubers a contract wants; what is left still has to be sold or stored.
      const draw = () => {
        if (!lot.open) { answered = true; close(); return }
        const deal = deals(app.world, c, lot)[0]
        const now = S.lotValue(app.world, c, lot)
        if (worthEl) worthEl.textContent = F.money(now)
        const month = Math.round(S.lotCwt(lot) * S.STORE_COST)
        const st = S.storageInfo(c)
        // The farm stand sells from the newest crop weighed, whatever is chosen here.
        const s = c.season
        const newest = s ? S.standLot(c, s) : undefined
        const stand = S.hasBuilt(c, 'stand') && newest?.id === lot.id
          ? `The farm stand sells about ${F.mass(S.STAND_CWT)} a day of this crop at twice the market price${s && s.day < S.dayIndex(c.year, S.STAND_FROM.month, S.STAND_FROM.dom) ? ', from August 1' : ''}, while it is the newest in.`
          : ''
        box.replaceChildren(h('div', { class: `choice${deal ? ' three' : ''}` },
          advice && !delivered ? h('p', { class: 'choice-advice' }, F.localize(advice.why)) : null,
          deal ? h('div', { class: 'choice-opt' },
            h('button', { class: 'btn big', type: 'button', testid: `lot-deliver-${lot.id}`, onclick: () => { if (deliver(ctx, lot, deal)) { delivered = true; draw() } } },
              `Deliver to ${deal.k.buyer.replace(/^The /, 'the ')}`, h('span', { class: 'num' }, F.money(deal.pays))),
            h('p', { class: 'sub' }, `${F.mass(deal.take)} of No. 1 at ${F.price(deal.k.price)}: ${versusMarket(deal)}.${deal.take < deal.k.needed - 0.5 ? ` That leaves ${F.mass(deal.k.needed - deal.take)} still owed.` : ' That fills it.'}`)) : null,
          h('div', { class: 'choice-opt' },
            h('button', { class: 'btn big', type: 'button', testid: `lot-sell-${lot.id}`, onclick: () => { answered = true; if (ctx.run({ t: 'sell', lot: lot.id, frac: 1 }).ok) close() } },
              delivered ? 'Sell the rest' : 'Sell now', h('span', { class: 'num' }, F.money(now))),
            h('p', { class: 'sub' }, `${F.price(S.basePrice(app.world, c, lot.variety))} today for US No. 1.`)),
          h('div', { class: 'choice-opt' },
            h('button', { class: 'btn big', type: 'button', testid: `lot-keep-${lot.id}`, onclick: () => { answered = true; if (fresh) ctx.say(`${F.mass(S.lotCwt(lot))} from ${name} went into the cellar.`, 'info'); close() } }, delivered ? 'Store the rest' : fresh ? 'Store it' : 'Keep it stored'),
            h('p', { class: 'sub' }, `${F.upper(R.aprilPhrase(c, v))}. Storing costs ${F.money(month)} a month, and it ${R.sproutText(m)}.`),
            S.hasBuilt(c, 'packing') ? h('p', { class: 'sub good-text', testid: 'store-packing' }, `Packed over the winter, its No. 1 brings ${F.pct(S.PACK_NO1)} more and B size ${F.pct(S.PACK_B)} of the No. 1 price, less ${F.money(S.PACK_CHARGE)} a hundredweight.`) : null,
            h('p', { class: `sub${st.stored > st.capacity + 0.5 ? ' warn-text' : ''}`, testid: 'store-houses' }, storageLine(c))),
          stand ? h('p', { class: 'choice-stand sub', testid: 'ticket-stand' }, icon('house', 'ic s'), stand) : null))
      }
      draw()
      return box
    },
  }
}
