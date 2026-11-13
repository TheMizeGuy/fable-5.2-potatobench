// The two moments the crop shows itself: the test-dig tray, and dig day: the platform scale's face, the weigh ticket
// it prints and the full reckoning behind it (design/ticket-reveal.html, design/ticket.html, design/MOTION.md).
import * as S from '../sim/index.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { count, type Ctx, type PaperSpec } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import * as R from './rules.ts'
import { storeCall } from './store-band.ts'
import { coupon, range } from './system/parts.ts'
import { agentLine } from './tutorial.ts'

const CAUSE_LABEL: Record<S.Cause, string> = {
  green: 'Greened', scab: 'Scab', hollow: 'Hollow heart', knob: 'Knobs and cracks', skin: 'Thin skins',
  bruise: 'Bruised', blight: 'Tuber blight', frost: 'Frozen', rot: 'Soft rot', small: 'Too small', stone: 'Stone bruise',
}
const CULLED: S.Cause[] = ['green', 'blight', 'frost', 'rot', 'small']
// Why the season asked for the vines to be killed (S.killTiming), as the ticket says it: a trade, never a fault.
// A kill this many days or more before it was due is the player's loss; a day or two either way is the trade.
const EARLY_DAYS = 3
const KILL_ASKED: Record<string, string> = { blight: 'blight was winning', frost: 'frost was coming', made: 'the crop had finished growing', late: 'the season was running out' }

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

// "Sep 16 to 18", "Sep 29 to Oct 2", "Sep 16".
function daySpan(year: number, a: number, b: number): string {
  if (b <= a) return F.date(year, a, true)
  const same = S.monthDay(year, a).month === S.monthDay(year, b).month
  return `${F.date(year, a, true)} to ${same ? S.monthDay(year, b).dom : F.date(year, b, true)}`
}

// A weight without its unit, as a machine stamps it: "1,374".
function bare(cwt: number): string {
  return F.mass(cwt).replace(/ (cwt|t)$/, '')
}

// What a capture asks the staging to hold still on (tools/quality/capture.ts): 'sweep' or 'tear'.
function held(what: string): boolean {
  return document.documentElement.dataset.hold === what
}

// --ease-out and --ease-paper, for movements driven from here.
const EASE_PAPER = 'cubic-bezier(.3, 1.25, .5, 1)'
const EASE_IN = 'cubic-bezier(.5, 0, .9, .4)'
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (u: number, a: number, b: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3
  return t => {
    let lo = 0, hi = 1, u = t
    for (let i = 0; i < 24; i++) {
      const x = at(u, x1, x2)
      if (Math.abs(x - t) < 1e-4) break
      if (x < t) lo = u; else hi = u
      u = (lo + hi) / 2
    }
    return at(u, y1, y2)
  }
}
const easeOut = bezier(0.2, 0.7, 0.2, 1)

// ---------------------------------------------------------------- the test dig

interface Placed { w: number; mark: number; k: number; x: number; ground: number; a: number; b: number; rot: number }

const LABEL_H = 36
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

// The grading tray, printed: a keylined board with the hill's tubers on it at true relative size, each weight stamped
// under its tuber and its mark written beside, a two-inch rule in the corner.
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
    s('rect', { class: 'flat-rim', x: 0.75, y: 0.75, width: W - 1.5, height: H - 1.5 }),
    s('rect', { class: 'flat-bed', x: 5, y: 5, width: W - 10, height: H - 10 }),
  ]
  const grounds = [...new Set(L.items.map(t => t.ground))]
  for (const g of grounds) kids.push(s('path', { class: 'flat-slat', d: `M5 ${(g + 1.5).toFixed(1)}H${W - 5}` }))
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
      s('text', { class: 'tray-w', x: t.x.toFixed(1), y: (t.ground + 18).toFixed(1) }, F.grams(t.w)),
      cause ? s('text', { class: 'tray-m', x: t.x.toFixed(1), y: (t.ground + 33).toFixed(1) }, TRAY_MARK[cause]) : null))
  })
  const len = (F.metric() ? 5 : 5.08) * L.pxPerCm
  kids.push(s('path', { class: 'tray-scale', d: `M14 ${H - 13}v-5M14 ${H - 15.5}h${len.toFixed(1)}M${(14 + len).toFixed(1)} ${H - 13}v-5` }))
  kids.push(s('text', { class: 'tray-scale-label', x: (20 + len).toFixed(1), y: H - 10 }, F.metric() ? '5 cm' : '2 in'))
  const sound = marks.filter(m => m === 0).length
  return s('svg', {
    class: 'tray', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${F.plural(weights.length, 'potato', 'potatoes')} on a tray, drawn to scale, ${sound} of them sound. Weights: ${weights.map(w => F.grams(w)).join(', ')}.`,
  }, kids)
}

// The estimate before and now on one scale, with the hill itself as the violet mark. Staged, the band narrows from
// the old range to the new one (a clip opening on the union of the two), and the figures count.
function narrowing(before: S.Estimate | null, after: S.Estimate, hill: number, staged: boolean, delay: number): HTMLElement {
  // The scale is fitted to these figures, so the narrowing is wide enough to see.
  const max = Math.ceil(Math.max(after.hi, before?.hi ?? 0, hill) * 1.2 / 50) * 50 || 50
  const digits = F.metric() ? 1 : 0
  const show = (n: number) => F.num(F.perAreaValue(n), digits)
  const from = before ?? after
  const now = range({ lo: after.lo, hi: after.hi, max, mark: hill > 0 ? Math.min(hill, max) : undefined, cls: 'now',
    label: `Now: ${F.perAreaSpan(after.lo, after.hi)}. A whole field of hills like this one would yield ${F.perArea(hill)}.` })
  const lo = h('span', null, show(staged ? from.lo : after.lo)), hi = h('span', null, show(staged ? from.hi : after.hi))
  now.style.setProperty('--at', `${Math.max(0, delay - 300)}ms`)
  if (staged) {
    const band = now.querySelector<HTMLElement>('.band')!
    const u0 = Math.min(from.lo, after.lo), u1 = Math.max(from.hi, after.hi)
    const x = (v: number) => `${(Math.max(0, Math.min(1, v / max)) * 100).toFixed(1)}%`
    const inset = (e: S.Estimate) => `inset(0 ${((u1 - e.hi) / (u1 - u0 || 1) * 100).toFixed(1)}% 0 ${((e.lo - u0) / (u1 - u0 || 1) * 100).toFixed(1)}%)`
    band.style.left = x(u0)
    band.style.width = `calc(${x(u1)} - ${x(u0)})`
    band.style.clipPath = inset(from)
    setTimeout(() => {
      if (!now.isConnected) return
      band.style.transition = 'clip-path 600ms var(--ease-out)'
      band.style.clipPath = inset(after)
      count(lo, from.lo, after.lo, show)
      count(hi, from.hi, after.hi, show)
      setTimeout(() => { band.style.cssText = `left:${x(after.lo)};width:calc(${x(after.hi)} - ${x(after.lo)})` }, 640)
    }, delay)
  }
  return h('div', { class: 'narrowing' },
    before ? h('div', { class: 'nrow was' },
      h('span', { class: 't-label' }, term('Before', 'estimate before')),
      range({ lo: before.lo, hi: before.hi, max, label: `Before: ${F.perAreaSpan(before.lo, before.hi)}` }),
      h('span', { class: 'num' }, F.perAreaSpan(before.lo, before.hi).replace(` ${F.perAreaUnit()}`, ''))) : null,
    h('div', { class: 'nrow' },
      h('span', { class: 't-label' }, 'Now'),
      now,
      h('b', { class: 'num' }, lo, '–', hi)),
    h('p', { class: 't-caption' }, `Yield in ${F.perAreaUnit()}, from ${F.plural(after.digs, 'test dig')}. The tick is this hill, and one hill isn't the whole field, so the range moves but never narrows to one number.${F.cwtNote()}`))
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
  const narrow = ctx.layout() === 'narrow'
  const W = narrow ? Math.min(360, innerWidth - 48) : 360
  const staged = o.staged && !ctx.reduced()
  const arrive = Math.min(6, weights.length) * 90 + 420
  const el = h('section', { class: `tray-paper sheet sys${staged ? ' staged' : ''}`, role: 'region', 'aria-label': `Test dig, ${S.FIELD_NAMES[e.field]}`, testid: 'sample-dialog', 'data-layout': ctx.layout() },
    h('header', { class: 'tray-head' },
      h('div', null,
        h('p', { class: 't-label' }, icon('sample', 'i'), 'Test dig'),
        h('h2', null, S.FIELD_NAMES[e.field])),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close the tray', testid: 'sample-close', onclick: o.onClose }, icon('close', 'i'))),
    h('p', { class: 'tray-lede' }, `${F.date(c.year, e.day)}, one hill of ${v.name}. ${F.plural(weights.length, 'potato', 'potatoes')} weighing `, h('span', { class: 'stamped' }, F.hillMass(grams)), '.'),
    // On a phone the tubers keep to one row where they can, so the tray leaves the land its room.
    tray(weights, marks, v, W, narrow),
    h('div', { class: 'tally sheet laid', role: 'list', 'aria-label': 'The tally' },
      [...tally].map(([k, n]) => h('p', { class: 'lead', role: 'listitem' }, h('span', null, F.upper(k)), h('span', { class: 'dots' }), h('b', { class: 'num' }, n)))),
    after ? narrowing(before, after, alone, staged, arrive + 500) : null)
  // A click anywhere on the tray skips the staging.
  if (staged) el.addEventListener('pointerdown', () => el.classList.remove('staged'), { once: true })
  return el
}

// ---------------------------------------------------------------- dig day: the causes

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
    case 'green': return x.f.hillPasses === 0 ? 'never hilled, so the potatoes saw daylight' : x.f.hillPasses === 1 ? 'hilled only once, so thin hills let light in'
      : inDay - lot.dugDay > 2 ? `sat ${inDay - lot.dugDay} days in barrels in the sun` : 'rain washed soil off the hills'
    case 'scab': return 'dry soil in the weeks after the potatoes formed'
    case 'hollow': return 'growth stalled, then surged'
    case 'knob': return 'a dry spell followed by rain'
    case 'skin': {
      const dead = x.killed ?? x.died
      return dead ? `dug ${F.plural(lot.dugDay - dead.day, 'day')} after the vines died, but skins need ${S.SKIN_DAYS}` : 'dug with the vines still green'
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lotKey(c, lot.id)]
      return t !== undefined ? `dug with the soil at ${F.temp(t)}` : 'dug from cold ground'
    }
    case 'blight': return 'spores washed down from blighted leaves'
    case 'frost': {
      const nights = barrelFrosts(c, lot)
      return nights.length ? `froze in the barrels on ${F.list(nights.map(d => F.date(c.year, d, true)))}, before they were hauled in` : 'froze in the ground before the harvest'
    }
    case 'rot': return 'sat in waterlogged soil'
    case 'small':
      if (x.killed && (!x.died || x.killed.day <= x.died.day)) {
        // Whether the kill came before the coach asked for it (the player's early kill) or when asked (the trade it asked for).
        const kt = S.killTiming(c, lot.field)
        const on = F.date(c.year, x.killed.day, true)
        if (kt.killed >= 0 && kt.early >= EARLY_DAYS) return `the vines were killed on ${on}, ${F.plural(kt.early, 'day')} early, before these finished growing`
        return `the vines were killed on ${on}${KILL_ASKED[kt.why] ? `, on schedule because ${KILL_ASKED[kt.why]}` : ''}, trading some size for skins that toughened in time`
      }
      if (x.died) return x.died.text.startsWith('Frost') ? 'frost killed the vines before these grew to size' : x.died.text.startsWith('Blight') ? 'blight killed the vines before these grew to size' : 'the vines died back before these grew to size'
      return 'dug while the vines were green, before these grew to size'
    case 'stone': return `${x.name} is ${stonesWord(x.f.stones)}, and the digger knocked potatoes against stones`
  }
}

// Each cause in full: tied to the field's own dates and the player's own acts.
function why(ctx: Ctx, c: S.Campaign, lot: S.Lot, cause: S.Cause): string {
  const { name, f, v, planted, killed, died, dry } = facts(c, lot)
  const date = (d: number) => F.date(c.year, d)
  const first = (type: string) => fieldLog(c, lot.field, type)[0]
  const reel = c.upgrades.reel
  const water = reel ? 'Watering in those weeks prevents it.' : 'Rain or irrigation in those weeks prevents it, but without an irrigation reel most growers here just wait for rain.'
  switch (cause) {
    case 'green': {
      const p = f.hillPasses
      const storms: number[] = []
      if (planted) for (let d = planted.day; d < lot.dugDay && d < (c.season?.day ?? 0); d++) if (S.getDay(ctx.app.world, c.year, d).prcp >= S.STORM_MM) storms.push(d)
      const barrels = weighDay(c, lot) - lot.dugDay
      return `Potatoes that grow up into the light turn green and bitter. ${name} was ${p === 0 ? 'never hilled, and hilling twice' : p === 1 ? 'hilled once, and a second hilling' : 'hilled twice'}${p < 2 ? ' before the rows close keeps them covered' : ''}.`
        + (storms.length ? ` Heavy rain on ${F.list(storms.map(date))} washed soil off the hills.` : '')
        + (barrels > 2 ? ` The crop sat ${barrels} days in barrels in the field, and every sunny day turns more of it green.` : '')
        + (v.green >= 1.3 ? ` ${v.name} forms its potatoes high in the hill.` : '')
    }
    case 'scab': {
      const ti = first('ti')
      const watered = fieldLog(c, lot.field, 'watered').length
      const inWindow = !!dry && !!ti && dry.day >= ti.day - 7 && dry.day <= ti.day + 35
      return `Common scab shows up when the soil is dry in the five weeks after the potatoes form${ti ? ` (in ${name}, ${date(ti.day)} to ${date(ti.day + 35)})` : ''}.`
        + (inWindow ? ` ${name} was drying out by ${date(dry.day)}` : ` ${name} was dry for part of that time`)
        + (watered ? ` and was watered ${F.times(watered)}.` : reel ? ' and wasn\'t watered.' : '.')
        + ` ${water}`
        + ` ${v.name} ${v.scab >= 1.3 ? 'scabs easily' : v.scab < 0.7 ? 'resists scab' : 'is about average for scab'}`
        + (f.soil < 0.6 ? ', and growing potatoes year after year leaves scab in the soil.' : '.')
    }
    case 'hollow':
      return `The big potatoes went hollow inside. That happens when growth stalls in a dry spell and then surges after rain, or when the soil is cold as the potatoes form.${dry ? ` ${name} was drying out by ${date(dry.day)}.` : ''} ${v.name} ${v.hollow >= 0.1 ? 'is prone to it' : 'rarely has this problem'}.`
    case 'knob':
      return `A dry spell followed by rain makes potatoes grow in spurts and crack${dry ? `, and ${name} was drying out by ${date(dry.day)}` : ''}.${v.rough >= 1.2 ? ` ${v.name} gets rough easily.` : ''} Steady water while the potatoes are filling out, from rain or irrigation, prevents it.`
    case 'skin': {
      const dead = killed ?? died
      const last = F.date(lot.year, S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom))
      if (!dead) return `This field was dug with the vines still green, so the skins hadn't toughened. They need ${S.SKIN_DAYS} days after the vines die.`
      const k = lot.dugDay - dead.day
      return `The skins hadn't toughened yet, because this field was dug ${F.plural(k, 'day')} after the vines died and skins need ${S.SKIN_DAYS}. These sell as No. 2, or at the No. 1 price if you sell them straight off the field by ${last} and within six days of the harvest.`
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lotKey(c, lot.id)]
      return `${t !== undefined ? `The soil was ${F.temp(t)} on harvest day, and c` : 'C'}old potatoes bruise in the digger below about ${F.temp(S.BRUISE_SOIL_T)}. Digging before the ground gets cold avoids it.`
    }
    case 'blight': {
      const seen = facts(c, lot).blight
      const sprays = fieldLog(c, lot.field, 'sprayed').length
      return `Rain washed spores off blighted leaves down into the hill. ${seen ? `Blight was first found in ${name} on ${date(seen.day)}` : 'Blight was never found on the leaves here, so it got in unseen'}${sprays ? `, and the field was sprayed ${F.times(sprays)}` : ', and the field wasn\'t sprayed'}. A full hill and killing the vines early keep spores off the potatoes.`
    }
    case 'frost': {
      const nights = barrelFrosts(c, lot)
      if (nights.length) return `A hard frost on ${F.list(nights.map(date))} caught the crop in barrels in ${name} before it was hauled in, and a fifth of what was sitting there froze. Another person hauling, a second tractor or the truck would bring it in as fast as it's dug.`
      const frosts = fieldLog(c, lot.field, 'frost').map(e => e.day)
      return `${frosts.length ? `Frost came on ${F.list(frosts.slice(-3).map(date))}` : 'A hard frost came before the harvest'}, and potatoes under a thin hill froze in the ground.${f.elev === 0 ? ' Cold air settles on bottom land.' : ''} Dig before the hard frosts arrive.`
    }
    case 'rot': {
      const logged = first('logged')
      return `${logged ? `Water stood in ${name} from ${date(logged.day)}, and potatoes sitting in waterlogged soil rot.` : 'Potatoes that sit in wet soil rot.'}${f.elev === 0 ? ' Bottom land holds water after rain.' : ''}`
    }
    case 'small': {
      const blight = facts(c, lot).blight
      let end = ` In ${name} they were dug on ${date(lot.dugDay)} while the vines were still green.`
      const kt = S.killTiming(c, lot.field)
      if (killed && (!died || killed.day <= died.day) && kt.killed >= 0 && kt.early >= EARLY_DAYS) {
        end = ` In ${name} the vines were killed on ${date(killed.day)}, ${F.plural(kt.early, 'day')} earlier than needed, so the potatoes hadn't finished growing.`
      } else if (killed && (!died || killed.day <= died.day) && kt.killed >= 0 && kt.asked >= 0) {
        end = ` In ${name} the vines were killed on ${date(killed.day)}, right on schedule${KILL_ASKED[kt.why] ? ` because ${KILL_ASKED[kt.why]}` : ''}. Some small potatoes are the price of skins that toughen in time.`
      } else if (killed && (!died || killed.day <= died.day)) {
        end = blight && blight.day <= killed.day
          ? ` In ${name} the vines were killed on ${date(killed.day)} with blight in the field, which gave up some size to save the potatoes from blight.`
          : ` In ${name} the vines were killed on ${date(killed.day)}. Every extra week adds size, but it also risks blight and frost.`
      } else if (died) {
        end = died.text.startsWith('Frost') ? ` In ${name} frost killed the vines on ${date(died.day)}.`
          : died.text.startsWith('Blight') ? ` In ${name} blight killed the vines on ${date(died.day)}.`
            : ` In ${name} the vines died back on ${date(died.day)}.`
      }
      return `These were under ${F.metric() ? '4 cm' : '1½ inches'} across, too small to grade, so they go to the starch factory with the culls. Potatoes keep growing until the vines die.${end}${v.maturity === 'late' || v.maturity === 'very late' ? ` ${v.name} needs a long season.` : ''}`
    }
    case 'stone': return `${name} is ${stonesWord(f.stones)}, and potatoes that hit stones as the digger lifted them dropped to No. 2. Frost pushes more stones up every winter. Picking rocks while no crop is in the field clears most of them, and a skilled digger operator bruises fewer.`
  }
}

// ---------------------------------------------------------------- dig day: the grades

type GradeKey = S.Grade | 'skinned'
const GRADE_LABEL: Record<GradeKey, string> = { no1: 'US No. 1', chef: 'Large', b: 'B size', no2: 'US No. 2', skinned: 'Thin-skinned', cull: 'Culls' }
const GRADE_ORDER: GradeKey[] = ['no1', 'chef', 'b', 'no2', 'skinned', 'cull']
// The printer's tints (design/system.css .g1 to .g5); thin skins, a sixth grade no frame shows, take the hatch turned.
const TINT: Record<GradeKey, string> = { no1: 'g1', chef: 'g2', b: 'g3', no2: 'g4', skinned: 'g6', cull: 'g5' }

function gradeNote(ctx: Ctx, c: S.Campaign, lot: S.Lot, key: GradeKey): string {
  const last = S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom)
  switch (key) {
    case 'no1': return 'the full price'
    case 'chef': return `over ${F.grams(S.SIZE_CHEF)}, ${R.largeRule(ctx.app.world, c, lot.variety)}`
    case 'b': return `under ${F.grams(S.SIZE_A)}, ${F.pct(S.GRADE_PRICE.b)} of the No. 1 price`
    case 'no2': return `blemished, ${F.pct(S.GRADE_PRICE.no2)} of the No. 1 price`
    case 'skinned': return `No. 2 price, or the No. 1 price if sold straight from the field by ${F.date(lot.year, last)} and within six days of the harvest`
    case 'cull': return `to the starch factory at ${F.price(S.CULL_PRICE)}`
  }
}

interface AtDig { known: boolean; market: number; cull: number; total: number; rows: { key: GradeKey; cwt: number }[] }

// The crop as it stood on dig day, whatever has been sold since. The grades come largest first, as the grader
// fills its bins, the culls last.
function atDig(ctx: Ctx, c: S.Campaign, lot: S.Lot): AtDig {
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
  rows.sort((a, b) => (a.key === 'cull' ? 1 : 0) - (b.key === 'cull' ? 1 : 0) || b.cwt - a.cwt)
  return { known, market, cull, total: market + cull, rows }
}

function gradebar(d: AtDig, parts: string[]): HTMLElement {
  return h('div', { class: 'gradebar', role: 'img', 'aria-label': `By grade: ${d.rows.map((r, k) => `${GRADE_LABEL[r.key]} ${parts[k]}`).join(', ')}` },
    d.rows.map(r => h('i', { class: TINT[r.key], style: `width:${(d.total > 0 ? r.cwt / d.total * 100 : 0).toFixed(1)}%` })))
}

// What a grower weighs before keeping a crop, in full.
function sellOrKeep(ctx: Ctx, c: S.Campaign, lot: S.Lot): HTMLElement[] {
  const world = ctx.app.world
  const v = S.variety(lot.variety)
  const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
  return [
    h('p', null, `Today's price for ${v.name} is ${F.price(S.basePrice(world, c, lot.variety))} for US No. 1. Selling this crop today pays `, h('strong', { class: 'num' }, F.money(S.lotValue(world, c, lot))), `. ${F.upper(storeCall(S.storeOutlook(world, c, lot)).phrase)}.`),
    ...(v.contract ? [h('p', null, R.contractText(v))] : [h('p', null, R.outlookText(c)), h('p', null, R.moodText(world, c))]),
    h('p', null, R.storageText(c, S.lotCwt(lot))),
    h('p', null, `This ${v.name} was dug on ${F.date(lot.year, lot.dugDay)} and ${R.sproutText(m)}${m < S.CELLAR_MONTHS.length ? '. Sprouted potatoes sell for 15% less and shrink faster' : ''}.`),
  ]
}

// The potato houses and what is kept in them, with this crop counted in: what will not fit is sold off the field.
export function storageLine(c: S.Campaign): string {
  const st = S.storageInfo(c)
  const over = st.stored - st.capacity
  const houses = st.houses.length === 1 ? `The potato house holds ${F.mass(st.capacity)}` : `Your potato houses hold ${F.mass(st.capacity)} in all (${F.list(st.houses.map(x => `${x.name.replace(/ potato house$/, '').replace(/^(Home|Second)$/, w => w.toLowerCase())} ${F.mass(x.cwt)}`))})`
  return `${houses}. If you store this crop you'll have ${F.mass(st.stored)} in storage${over > 0.5 ? `, and the ${F.mass(over)} that won't fit gets sold off the field when the season ends` : `, with room for ${F.mass(st.free)} more`}.`
}

function ticketNo(c: S.Campaign, lot: S.Lot): string {
  return `${R.yearShort(lot.year || c.year)}-${lot.id}`
}

// ---------------------------------------------------------------- the full reckoning

// Everything behind the ticket, in the ticket's own hand: every grade and its rule, every cause in full, what never
// grew, and whether to sell or keep.
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
      text: `${F.pct(stunted)} of the plants in ${name} were stunted by virus, and a stunted plant yields about ${F.pct(1 - S.VIRUS_VIGOR)} less. The virus came in with the seed${c.plans[lot.field]?.seed === 'saved' ? ', and saved seed carries more every year you keep it' : ''}.`,
    })
  }
  const stand = seen?.stand ?? S.fieldInfo(c, lot.field).stand
  if (stand < 0.92 && stand > 0) {
    const planted = fieldLog(c, lot.field, 'planted')[0]
    never.push({
      head: 'Thin stand', cwt: d.total * (1 - stand) / stand,
      text: `${F.pct(1 - stand)} of the seed pieces rotted before they came up${planted ? `, after planting on ${F.date(c.year, planted.day)}` : ''}. Seed rots in cold ground, so wait for soil near ${F.temp(10)}.`,
    })
  }
  const st = S.storageInfo(c)
  const head = (text: string) => h('h3', { class: 'reck-h t-label' }, text)
  return {
    title: `The full breakdown, ${name}`,
    kicker: `Behind weigh ticket No. ${ticketNo(c, lot)}`,
    testid: 'reckoning',
    size: 'wide',
    cls: 'reckoning-paper',
    body: () => h('div', { class: 'reck' },
      h('p', { class: 'reck-lede' }, `${F.upper(digDatesText(c, lot))}. ${S.variety(lot.variety).name} from ${F.area(S.FIELD_ACRES)} gave `,
        h('span', { class: 'stamped' }, F.mass(d.market)), ' to sell and ', h('span', { class: 'stamped' }, F.mass(d.cull)), ` culled.${F.cwtNote()}`),
      h('section', { class: 'reck-part' },
        head('Grade by grade'),
        d.known ? [
          gradebar(d, shown.parts),
          h('table', { class: 'losses reck-grades' },
            h('thead', { class: 'sr' }, h('tr', null, h('th', { scope: 'col' }, 'Grade'), h('th', { scope: 'col' }, 'What it sells for'), h('th', { scope: 'col' }, 'Weight'), h('th', { scope: 'col' }, 'Share'))),
            h('tbody', null, d.rows.map((r, k) => h('tr', null,
              h('th', { scope: 'row' }, h('i', { class: `sw ${TINT[r.key]}` }), GRADE_LABEL[r.key]),
              h('td', { class: 'reck-note' }, gradeNote(ctx, c, lot, r.key)),
              h('td', { class: 'num' }, shown.parts[k]),
              h('td', { class: 'num share' }, d.total > 0 ? (r.cwt / d.total < 0.005 ? 'under 1%' : F.pct(r.cwt / d.total)) : ''))))),
        ] : h('p', { class: 't-caption' }, 'The grade sheet for this crop went with the sale.')),
      h('section', { class: 'reck-part' },
        head(losses.length ? `Downgraded and culled: ${F.mass(lost)}` : 'Nothing downgraded or culled'),
        losses.length ? h('table', { class: 'losses reck-causes' },
          h('tbody', null, losses.map(x => h('tr', null,
            h('th', { scope: 'row' }, term(CAUSE_LABEL[x.k])),
            h('td', { class: 'num' }, `−${F.mass(x.cwt)}`),
            h('td', null, h('span', { class: 't-label' }, x.k === 'skin' ? 'Downgraded' : CULLED.includes(x.k) ? 'Culled' : 'Down to No. 2'), h('p', null, why(ctx, c, lot, x.k))))))) : h('p', null, 'Every potato kept its grade. A clean harvest.')),
      never.length ? h('section', { class: 'reck-part' },
        head('What never grew'),
        h('table', { class: 'losses reck-causes' },
          h('tbody', null, never.map(x => h('tr', null,
            h('th', { scope: 'row' }, x.head),
            h('td', { class: 'num' }, `about ${F.mass(x.cwt)}`),
            h('td', null, h('span', { class: 't-label' }, 'Not in the crop'), h('p', null, x.text))))))) : null,
      lot.open ? h('section', { class: 'reck-part reck-keep' },
        head('Sell now or store it?'),
        sellOrKeep(ctx, c, lot),
        h('p', { class: st.stored > st.capacity ? 'c-ochre' : 'quiet' }, storageLine(c))) : null),
    foot: close => h('button', { class: 'btn', type: 'button', testid: 'reckoning-close', autofocus: true, onclick: close }, icon('back', 'i'), 'Back to the ticket'),
  }
}

// ---------------------------------------------------------------- dig day: the platform scale

// The dial's own units: hundreds of cwt, or tonnes.
function dialUnits(cwt: number): number {
  return F.metric() ? F.massValue(cwt) : cwt / 100
}

// The scale's capacity rounded up to a figure a maker would print, with the needle well short of it, and a step for
// the numbers round the rim that gives five to ten of them.
function capacity(gross: number): { max: number; step: number } {
  const caps = [5, 10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500, 600, 800, 1000]
  const max = caps.find(k => gross <= k * 0.87) ?? Math.ceil(gross / 0.87 / 100) * 100
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find(k => max / k <= 10 && Number.isInteger(max / k)) ?? max / 10
  return { max, step }
}

let dialSeq = 0

interface Dial { el: SVGElement; set(v: number, ghosts?: [number, number] | null): void }

// The printed face of the potato house's platform scale (design/tools/dial.py, drawn live): the grades as they came
// off the grader round the rim in the printer's tints, each inked in as the needle passes it.
function dial(rows: { key: GradeKey; cwt: number }[], gross: number, inked: boolean): Dial {
  const id = `dial${++dialSeq}`
  const C = 235, A0 = -225, A1 = 45
  const g = dialUnits(gross)
  const { max, step } = capacity(g)
  const deg = (v: number) => A0 + (A1 - A0) * Math.max(0, Math.min(1, v / max))
  const pt = (v: number, r: number): [number, number] => { const a = deg(v) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)] }
  const f = (n: number) => n.toFixed(1)
  const arc = (v0: number, v1: number, r0: number, r1: number) => {
    const large = (v1 - v0) / max * (A1 - A0) > 180 ? 1 : 0
    const [x0, y0] = pt(v0, r1), [x1, y1] = pt(v1, r1), [x2, y2] = pt(v1, r0), [x3, y3] = pt(v0, r0)
    return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`
  }
  const mid = (v0: number, v1: number, r: number) => {
    const large = (v1 - v0) / max * (A1 - A0) > 180 ? 1 : 0
    const [x0, y0] = pt(v0, r), [x1, y1] = pt(v1, r)
    return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`
  }
  const INK = '#1e1c19', INK2 = '#4b463d', RED = '#9c3226'
  const pattern: Record<GradeKey, SVGElement | null> = {
    no1: s('pattern', { id: `${id}-g1`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, s('rect', { width: 4, height: 4, fill: INK })),
    chef: s('pattern', { id: `${id}-g2`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, s('path', { d: 'M0 1h4', stroke: INK, 'stroke-width': 1.4 })),
    b: s('pattern', { id: `${id}-g3`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, s('circle', { cx: 2, cy: 2, r: 1.1, fill: INK })),
    no2: s('pattern', { id: `${id}-g4`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('path', { d: 'M0 0v5', stroke: INK, 'stroke-width': 1.5 })),
    skinned: s('pattern', { id: `${id}-g6`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, s('path', { d: 'M0 0v5', stroke: INK, 'stroke-width': 1.5 })),
    cull: null,
  }
  const kids: Child[] = [
    s('defs', null, rows.map(r => pattern[r.key]), s('path', { id: `${id}-top`, d: 'M145 235a90 90 0 0 1 180 0' })),
    s('circle', { cx: C, cy: C, r: 232, fill: '#2c2620' }),
    s('circle', { cx: C, cy: C, r: 224, fill: '#f6f1e4', stroke: INK, 'stroke-width': 2 }),
    s('circle', { cx: C, cy: C, r: 160, fill: 'none', stroke: INK, 'stroke-width': 1 }),
    // The rim's track, dashed where no grade has come yet.
    s('path', { d: arc(0, max, 176, 200), fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
  ]
  const bands: { v0: number; v1: number; fill: SVGElement | null; line: SVGElement }[] = []
  let v = 0
  for (const r of rows) {
    const w = dialUnits(r.cwt)
    const v0 = v, v1 = v + w
    v = v1
    const pat = pattern[r.key]
    const fill = pat ? s('path', { class: 'd-ink', d: mid(v0, v1, 188), fill: 'none', stroke: `url(#${pat.getAttribute('id')})`, 'stroke-width': 24, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': inked ? 0 : 1 }) : null
    const sweep = (v1 - v0) / max * (A1 - A0) * Math.PI / 180 * 208
    const label = GRADE_LABEL[r.key].toUpperCase()
    const [lx, ly] = pt((v0 + v1) / 2, 208)
    const named = sweep >= label.length * 8.6 + 10
      ? s('text', { x: f(lx), y: f(ly), 'text-anchor': 'middle', 'font-family': 'Gothic', 'font-size': 14, 'letter-spacing': 1.5, fill: INK, transform: `rotate(${f(deg((v0 + v1) / 2) + 90)} ${f(lx)} ${f(ly)})` }, label)
      : null
    const line = s('g', { class: `d-band${inked ? ' is-in' : ''}` },
      s('path', { d: arc(v0, v1, 176, 200), fill: 'none', stroke: INK, 'stroke-width': 1.2 }), named)
    kids.push(fill, line)
    bands.push({ v0, v1, fill, line })
  }
  // The graduations: a long mark at each half step, the figures at each step.
  const minor = step / 10
  for (let k = 0; k <= Math.round(max / minor); k++) {
    const val = k * minor
    const big = k % 5 === 0
    const [x0, y0] = pt(val, big ? 172 : 166), [x1, y1] = pt(val, 152)
    kids.push(s('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), stroke: INK, 'stroke-width': big ? 2.2 : 1 }))
    if (k % 10 === 0) {
      const [x, y] = pt(val, 132)
      kids.push(s('text', { x: f(x), y: f(y + 9), 'text-anchor': 'middle', 'font-family': 'Gothic', 'font-size': 28, fill: INK }, String(Math.round(val * 10) / 10)))
    }
  }
  kids.push(
    s('text', { 'font-family': 'Gothic', 'font-size': 15, 'letter-spacing': 3, fill: INK2 }, s('textPath', { href: `#${id}-top`, startOffset: '50%', 'text-anchor': 'middle' }, 'FARMERS’ PLATFORM SCALE')),
    s('text', { x: C, y: C + 62, 'text-anchor': 'middle', 'font-family': 'Gothic', 'font-size': 18, 'letter-spacing': 3, fill: INK2 }, F.metric() ? 'TONNES' : 'CWT × 100'),
    s('text', { x: C, y: C + 86, 'text-anchor': 'middle', 'font-family': 'Caslon', 'font-style': 'italic', 'font-size': 15, fill: INK2 }, `capacity ${F.metric() ? `${max} t` : F.mass(max * 100)}`))
  // The needle, drawn pointing straight up and turned; two faint places it has just swept through follow it round.
  const ghost = (op: number) => s('line', { class: 'd-ghost', x1: C, y1: C, x2: C, y2: C - 168, stroke: RED, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: op })
  const ghosts = [ghost(0.12), ghost(0.22)]
  const needle = s('line', { x1: C, y1: C + 30, x2: C, y2: C - 170, stroke: RED, 'stroke-width': 5, 'stroke-linecap': 'round' })
  kids.push(ghosts, needle, s('circle', { cx: C, cy: C, r: 15, fill: INK }), s('circle', { cx: C, cy: C, r: 5, fill: RED }))
  const names = rows.map(r => GRADE_LABEL[r.key].replace('Large', 'large').replace('Culls', 'culls'))
  const el = s('svg', { viewBox: '0 0 470 470', role: 'img', 'aria-label': `The scale's needle swings round to ${F.mass(gross)}, past ${F.list(names)}` }, kids)
  const turn = (x: SVGElement, val: number) => x.setAttribute('transform', `rotate(${f(deg(val) + 90)} ${C} ${C})`)
  const set = (val: number, trail: [number, number] | null = null) => {
    turn(needle, val)
    ghosts.forEach((x, k) => { if (trail) { x.style.display = ''; turn(x, trail[k]) } else x.style.display = 'none' })
    for (const b of bands) {
      const p = Math.max(0, Math.min(1, (val - b.v0) / (b.v1 - b.v0 || 1)))
      b.fill?.setAttribute('stroke-dashoffset', (1 - p).toFixed(3))
      b.line.classList.toggle('is-in', val > b.v0 + 1e-6 || p >= 1)
    }
  }
  set(inked ? g : 0)
  return { el, set: (val, trail) => set(val, trail ?? null) }
}

interface Face { el: HTMLElement; slip: HTMLElement; set(f: number, trail?: [number, number] | null): void }

// The scale's face as a sheet: the dial, the violet figure counting under it, and the slot the ticket prints from.
function scaleFace(c: S.Campaign, lot: S.Lot, d: AtDig): Face {
  const name = S.FIELD_NAMES[lot.field]
  const g = dial(d.rows, d.total, false)
  const gross = dialUnits(d.total)
  const figure = h('span', { class: 'stamped' }, bare(0))
  const slip = h('div', { class: 'slip' }, h('span', null, 'Weigh ticket'), h('span', { class: 'stamped' }, `No. ${ticketNo(c, lot)}`))
  const el = h('section', { class: 'scale-face sheet', role: 'status', 'aria-label': `Weighing ${name}, ${F.mass(d.total)} off the field` },
    h('p', { class: 't-label' }, `${name} · ${S.variety(lot.variety).name} · on the scale`),
    h('div', { class: 'dial' }, g.el),
    h('p', { class: 'readout', 'aria-hidden': 'true' }, figure, h('span', { class: 't-label' }, `${F.massUnit()} off the field`)),
    h('div', { class: 'printing', 'aria-hidden': 'true' }, slip))
  return {
    el, slip,
    set(f, trail) {
      g.set(gross * f, trail ? [gross * trail[0], gross * trail[1]] : null)
      figure.textContent = bare(d.total * f)
    },
  }
}

// ---------------------------------------------------------------- dig day: the weigh ticket

let stampSeq = 0

// The round violet stamp the scale house brings down on a weighed crop.
function weighedStamp(date: string, year: string): SVGElement {
  const id = `wr${++stampSeq}`
  const ring = (r: number, w: number) => s('circle', { cx: 80, cy: 80, r, fill: 'none', stroke: 'currentColor', 'stroke-width': w })
  return s('svg', { class: 'weighed', viewBox: '0 0 160 160', role: 'img', 'aria-label': `Stamped: weighed, ${date}, ${year}` },
    s('defs', null, s('path', { id: `${id}-t`, d: 'M26 80a54 54 0 0 1 108 0' }), s('path', { id: `${id}-b`, d: 'M30 80a50 50 0 0 0 100 0' })),
    ring(74, 4), ring(67, 1.6), ring(40, 1.6),
    s('text', { 'font-family': 'Gothic', 'font-size': 16, 'letter-spacing': 2.5, fill: 'currentColor' }, s('textPath', { href: `#${id}-t`, startOffset: '50%', 'text-anchor': 'middle' }, 'HOME POTATO HOUSE')),
    s('text', { 'font-family': 'Gothic', 'font-size': 15, 'letter-spacing': 3, fill: 'currentColor' }, s('textPath', { href: `#${id}-b`, startOffset: '50%', 'text-anchor': 'middle' }, year.toUpperCase())),
    s('text', { x: 80, y: 77, 'font-family': 'Gothic', 'font-size': 25, 'letter-spacing': 1.5, 'text-anchor': 'middle', fill: 'currentColor' }, 'WEIGHED'),
    s('text', { x: 80, y: 99, 'font-family': 'Gothic', 'font-size': 18, 'letter-spacing': 2, 'text-anchor': 'middle', fill: 'currentColor' }, date.toUpperCase()))
}

// The violet net weight arriving like a numbering machine: digit by digit, left to right, in at most 600 ms. The
// figure is set out blank at once, so nothing moves when it is struck.
function numbering(el: HTMLElement, text: string): { run(ms: number): void; done(): void } {
  const chars = [...text]
  const cells = chars.map(ch => h('span', { class: 'nm-cell nm-wait' }, ch))
  el.replaceChildren(...cells)
  const digits = cells.filter((_, k) => /\d/.test(chars[k]))
  const timers: number[] = []
  const done = () => { timers.forEach(clearTimeout); el.textContent = text }
  return {
    done,
    run(ms) {
      const each = ms / Math.max(1, digits.length)
      let shown = 0
      const strike = () => {
        // A digit and whatever stands before it since the last one struck: "1," then "3", "7", "4".
        const upTo = cells.indexOf(digits[shown])
        for (let k = 0; k <= upTo; k++) cells[k].classList.remove('nm-wait')
        digits[shown].animate([{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: Math.min(90, each), easing: 'ease-out' })
        if (++shown < digits.length) timers.push(window.setTimeout(strike, each))
        else timers.push(window.setTimeout(done, 100))
      }
      if (digits.length) strike()
      else done()
    },
  }
}

interface Way { el: HTMLElement; key: string }

// The weigh ticket. fresh: this is dig day itself, so it wants an answer, and unless the clock was racing it is
// weighed on the scale first.
export function ticket(ctx: Ctx, lotId: number, o: { fresh: boolean; staged?: boolean }): PaperSpec | null {
  const app = ctx.app
  const c = app.campaign
  const lot = c?.lots.find(l => l.id === lotId)
  if (!c || !lot) return null
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
  const reveal = fresh && !!o.staged && !ctx.reduced() && d.known && d.total > 0
  const advice = S.advise(app.world, c).find(a => a.act === 'sell' && a.lot === lotId)
  const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
  const dug = digDays(c, lot)
  const inDay = weighDay(c, lot)
  const no = ticketNo(c, lot)
  const cold = R.coldPlanting(c, lot, ctx.memo.digSeen[key]?.stand ?? (c.season?.year === lot.year ? S.fieldInfo(c, lot.field).stand : null), d.total)
  let answered = false
  let busy = false
  let worthEl: HTMLElement | null = null
  let paper: HTMLElement | null = null
  let ways: Way[] = []
  let revealing = false
  let skip: () => void = () => {}

  // While this ticket is on top its ways answer to their keys, and during the reveal any key or press skips to the end.
  const onKey = (e: KeyboardEvent) => {
    if (!paper?.isConnected) { off(); return }
    if (ctx.papers.top() !== paper || e.ctrlKey || e.metaKey || e.altKey) return
    if (revealing) { if (e.key !== 'Escape' && e.key !== 'Tab') skip(); return }
    const way = ways.find(w => w.key === e.key)
    if (way && !busy) { e.preventDefault(); way.el.click() }
  }
  const onPress = () => { if (revealing && paper && ctx.papers.top() === paper) skip() }
  const shade = () => paper?.parentElement?.querySelector<HTMLElement>(':scope > .veil')
  const off = () => {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('pointerdown', onPress, true)
  }

  // Taking a way tears its coupon off along the perforation, then the ticket goes or shows what is left.
  const tear = (el: HTMLElement, then: () => void) => {
    busy = true
    ctx.cue('tearOff')
    if (ctx.reduced()) { then(); return }
    el.classList.add('is-torn')
    const a = el.animate([
      { transform: 'none', clipPath: 'inset(-32px -4px -6px -4px)' },
      { transform: 'translateY(6px) rotate(3deg)', clipPath: 'inset(-32px 2px 3px 2px)' },
    ], { duration: 260, easing: EASE_IN, fill: 'forwards' })
    if (held('tear')) return
    a.onfinish = then
  }

  return {
    title: `Weigh ticket, ${name}`,
    testid: 'weighin',
    size: 'medium',
    plain: true,
    cls: `dig-paper${reveal ? ' is-reveal' : ''}`,
    sticky: fresh && lot.open,
    // A dig-day ticket still waiting when its crop has already been sold or delivered has nothing to ask.
    stale: () => (fresh && !lot.open) || app.campaign !== c || !c.lots.includes(lot),
    closeLabel: lot.open ? 'Store it and close' : 'Close',
    onClose: () => {
      off()
      shade()?.classList.remove('deep')
      if (!fresh || app.campaign !== c || c.phase !== 'season') return
      if (lot.open && !answered) ctx.say(`${F.mass(S.lotCwt(lot))} from ${name} went into the cellar.`, 'info')
      // The decision is made: the days run again.
      if (!ctx.papers.pending()) app.resumeAfterCard()
    },
    body: close => {
      const sold = !lot.open
      const net = h('span', { class: 'stamped huge num', testid: 'ticket-weight' }, bare(d.market))
      const worth = h('span', { class: 't-figure num', testid: 'ticket-value' }, F.money(value))
      worthEl = worth
      const stampDay = inDay >= 0 ? inDay : dug.end
      const stamp = weighedStamp(F.date(lot.year, stampDay, true), R.yearName(lot.year))
      const max = est ? Math.max(500, Math.ceil(Math.max(est.hi, perAcre) / 100) * 100) : 500
      const inside = est ? perAcre >= est.lo && perAcre <= est.hi : false
      const box = h('div', { class: 'choice' })

      const tk = h('article', { class: `ticket sheet s-buff${reveal ? ' is-waiting' : ''}`, 'aria-labelledby': `tk-${lotId}` },
        h('div', { class: 'stub', role: 'img', 'aria-label': `Ticket number ${no}, ${name}` }, h('span', null, `No. ${no} `, h('b', null, name))),
        h('div', { class: 'tk' },
          h('header', { class: 'tk-head' },
            h('div', null,
              h('p', { class: 't-label' }, icon('scale', 'i'), 'Home potato house'),
              h('h2', { id: `tk-${lotId}` }, 'Weigh ticket')),
            stamp,
            fresh ? null : h('button', { class: 'close', type: 'button', 'aria-label': lot.open ? 'Close the ticket' : 'Close', onclick: close }, icon('close', 'i'))),
          fresh && lot.open ? agentLine('ticket', `${c.seed}:${lot.year}:${lotId}`) : null,
          h('p', { class: 'tk-line' },
            h('span', null, h('span', { class: 't-label' }, 'Variety'), ' ', h('b', null, v.name)),
            h('span', null, h('span', { class: 't-label' }, 'Dug'), ' ', h('b', { class: 'num' }, daySpan(lot.year, dug.start, dug.end))),
            inDay > dug.end ? h('span', null, h('span', { class: 't-label' }, 'Hauled in'), ' ', h('b', { class: 'num' }, F.date(lot.year, inDay, true))) : null,
            h('span', null, h('span', { class: 't-label' }, 'From'), ' ', h('b', { class: 'num' }, F.area(S.FIELD_ACRES)))),
          h('div', { class: 'tk-net' },
            h('p', { class: 'net' }, net, h('span', { class: 'unit' }, F.massUnit(), h('br'), sold ? 'sold' : 'to sell')),
            h('div', { class: 'net-side' },
              h('p', null, h('span', { class: 't-label' }, sold ? 'Sold for' : 'Sell today for')),
              h('p', null, worth),
              h('p', { class: 'quiet num' }, `${F.perArea(d.market / S.FIELD_ACRES)} · ${F.mass(d.cull)} culled`),
              est ? [
                range({ lo: est.lo, hi: est.hi, max, mark: perAcre, label: `You expected ${F.perAreaSpan(est.lo, est.hi)} and the field gave ${F.perArea(perAcre)}` }),
                h('p', { class: 'carried', testid: 'carried' }, 'You expected ', h('span', { class: 'num' }, F.perAreaSpan(est.lo, est.hi)), ` ${est.digs ? `from ${F.plural(est.digs, 'test dig')}` : 'by eye'}. The field gave `,
                  h('b', { class: 'num' }, F.perArea(perAcre)), ` with the culls, which is ${inside ? 'inside that range' : perAcre < est.lo ? 'under it' : 'over it'}.`),
              ] : null)),
          d.known ? h('div', { class: 'grades' },
            gradebar(d, parts.parts),
            h('ul', null, d.rows.map((r, k) => h('li', { class: `lead${r.key === 'cull' ? ' quiet' : ''}` },
              h('i', { class: `sw ${TINT[r.key]}` }), GRADE_LABEL[r.key], h('span', { class: 'dots' }), h('b', { class: 'num' }, parts.parts[k].replace(/ (cwt|t)$/, '')))))) : h('p', { class: 'grades t-caption' }, 'The grade sheet for this crop went with the sale.'),
          h('table', { class: 'losses' },
            h('caption', { class: 't-label' }, losses.length ? 'The biggest losses' : 'Losses'),
            h('tbody', null, losses.length ? losses.slice(0, 3).map(x => h('tr', null,
              h('th', { scope: 'row' }, term(CAUSE_LABEL[x.k])), h('td', { class: 'num' }, `−${F.mass(x.cwt)}`), h('td', null, phrase(ctx, c, lot, x.k))))
              : h('tr', null, h('td', { colspan: 3 }, 'Every potato kept its grade. A clean harvest.')))),
          cold ? h('p', { class: 'tk-cold', testid: 'ticket-cold' }, icon('planted', 'i'), h('span', null, cold)) : null,
          box))

      const reckon = () => h('button', { class: 'btn quiet', type: 'button', testid: 'reckoning-open', onclick: () => ctx.papers.open(reckoning(ctx, lotId)) }, 'See full breakdown')
      let delivered = false
      // Delivering takes the No. 1 and large tubers a contract wants; what is left still has to be sold or stored.
      const draw = () => {
        busy = false
        if (!lot.open && !sold) { answered = true; close(); return }
        if (sold) {
          ways = []
          box.replaceChildren(h('p', { class: 'tk-more' }, h('button', { class: 'btn', type: 'button', testid: `lot-keep-${lot.id}`, autofocus: true, onclick: close }, 'Close'), reckon()))
          return
        }
        const deal = deals(app.world, c, lot)[0]
        const now = S.lotValue(app.world, c, lot)
        if (worthEl) worthEl.textContent = F.money(now)
        const month = Math.round(S.lotCwt(lot) * S.STORE_COST)
        const st = S.storageInfo(c)
        // The farm stand sells from the newest crop weighed, whatever is chosen here.
        const s0 = c.season
        const newest = s0 ? S.standLot(c, s0) : undefined
        const stand = S.hasBuilt(c, 'stand') && newest?.id === lot.id
          ? `Your farm stand sells about ${F.mass(S.STAND_CWT)} a day of this crop at twice the market price${s0 && s0.day < S.dayIndex(c.year, S.STAND_FROM.month, S.STAND_FROM.dom) ? ', starting August 1' : ''}, for as long as it's your newest crop.`
          : ''
        const outlook = S.storeOutlook(app.world, c, lot)
        const call = storeCall(outlook)
        const best = deal && deal.pays >= deal.market - 0.5 ? 'deliver' : advice || !call.store ? 'sell' : 'store'
        let n = 0
        const k = () => String(++n)
        const list: Way[] = []
        const add = (el: HTMLElement) => { list.push({ el, key: el.getAttribute('aria-keyshortcuts') ?? '' }); return el }
        const deliverWay = deal ? add(coupon({
          icon: 'deliver', label: `Deliver to ${deal.k.buyer.replace(/^The /, 'the ')}`, amount: F.money(deal.pays), take: 'Deliver', key: k(), best: best === 'deliver',
          does: `${F.mass(deal.take)} at ${F.price(deal.k.price)}, ${versusMarket(deal)}.${deal.take < deal.k.needed - 0.5 ? ` You'll still owe ${F.mass(deal.k.needed - deal.take)}.` : ' That fills the contract.'}`,
          testid: `lot-deliver-${lot.id}`,
          onclick: e => { if (busy || !deliver(ctx, lot, deal)) return; delivered = true; tear(e.currentTarget as HTMLElement, draw) },
        })) : null
        const sellWay = add(coupon({
          icon: 'sell', label: delivered ? 'Sell the rest' : 'Sell now', amount: F.money(now), take: 'Sell', key: k(), best: best === 'sell',
          does: advice && !delivered ? h('span', { class: 'choice-advice' }, F.localize(advice.why)) : `${F.price(S.basePrice(app.world, c, lot.variety))} today for US No. 1.`,
          testid: `lot-sell-${lot.id}`,
          onclick: e => { if (busy) return; answered = true; if (ctx.run({ t: 'sell', lot: lot.id, frac: 1 }).ok) tear(e.currentTarget as HTMLElement, close) },
        }))
        const storeWay = add(coupon({
          icon: 'store', label: delivered ? 'Store the rest' : fresh ? 'Store it' : 'Keep it stored', take: 'Store', key: k(), best: best === 'store',
          amount: [h('span', { 'aria-hidden': 'true' }, `−${F.money(month).replace('−', '')}`, h('small', null, '/mo')), h('span', { class: 'sr' }, `Storing costs ${F.money(month)} a month.`)],
          does: `${F.upper(call.phrase)}. It ${R.sproutText(m)}.`,
          testid: `lot-keep-${lot.id}`,
          onclick: e => { if (busy) return; answered = true; if (fresh) ctx.say(`${F.mass(S.lotCwt(lot))} from ${name} went into the cellar.`, 'info'); tear(e.currentTarget as HTMLElement, close) },
        }))
        ways = list
        // After a delivery, what is left and what becomes of it if the ticket is simply closed: it goes into store.
        const left = delivered ? h('p', { class: 'tk-left', testid: 'ticket-left', role: 'status' },
          icon('deliver', 'i'), `Delivered. You have ${F.mass(S.lotCwt(lot))} left to sell now or store. If you just close the ticket (Escape), it goes into the potato house.`) : null
        box.replaceChildren(...(left ? [left] : []),
          h('div', { class: `ways${deal ? '' : ' two'}`, role: 'group', 'aria-label': 'What to do with the crop' }, deliverWay, sellWay, storeWay),
          h('div', { class: 'tk-more' },
            reckon(),
            h('div', { class: 'tk-notes' },
              h('p', { class: st.stored > st.capacity + 0.5 ? 'c-ochre' : '', testid: 'store-houses' }, storageLine(c)),
              S.hasBuilt(c, 'packing') ? h('p', { testid: 'store-packing' }, `If you pack it over the winter, its No. 1 sells for ${F.pct(S.PACK_NO1)} more and its B size for ${F.pct(S.PACK_B)} of the No. 1 price, minus ${F.money(S.PACK_CHARGE)} a hundredweight for packing.`) : null,
              F.cwtNote() ? h('p', null, F.cwtNote().trim()) : null,
              stand ? h('p', { class: 'choice-stand', testid: 'ticket-stand' }, icon('stand', 'i'), stand) : null)))
      }
      draw()

      const root = h('div', { class: `dig-day${reveal ? ' revealing' : ''}`, 'data-layout': ctx.layout() }, tk)
      const placeLayout = () => { if (!root.isConnected) { removeEventListener('resize', placeLayout); return } root.dataset.layout = ctx.layout() }
      addEventListener('resize', placeLayout)

      // Mounted: find the paper this sits in, listen for keys, dim the land further.
      setTimeout(() => {
        paper = root.closest<HTMLElement>('.dialog')
        if (!paper) return
        shade()?.classList.add('deep')
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPress, true)
      }, 0)

      if (!reveal) {
        if (fresh) ctx.cue('ticket')
        return root
      }

      // The reveal (MOTION.md, "Dig day"): the scale's face laid down, the needle sweeping round the grades as the
      // figure counts, the ticket fed out of the slot, the face lifted away and the ticket laid in its place, the
      // net weight numbered and the Weighed stamp brought down.
      const face = scaleFace(c, lot, d)
      root.prepend(face.el)
      revealing = true
      stamp.classList.add('is-up')
      const numbers = numbering(net, bare(d.market))
      const timers: number[] = []
      let raf = 0
      const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (root.isConnected) fn() }, ms)) }
      const end = () => {
        revealing = false
        timers.forEach(clearTimeout)
        cancelAnimationFrame(raf)
        numbers.done()
        face.el.remove()
        root.classList.remove('revealing')
        tk.classList.remove('is-waiting')
        stamp.classList.remove('is-up')
      }
      skip = () => { if (revealing && !held('sweep')) end() }
      face.el.animate([{ transform: 'translateY(14px)' }, { transform: 'none' }], { duration: 320, easing: EASE_PAPER })
      const SWEEP = 1400
      at(320, () => {
        // The sound runs to the same clock: a clack per band, the feed, the numbering machine, the stamp.
        ctx.cue('ticket')
        const t0 = performance.now()
        const lag = (p: number, back: number) => easeOut(Math.max(0, p - back))
        const step = (now: number) => {
          if (!root.isConnected) return
          const p = Math.min(1, (now - t0) / SWEEP)
          const fr = easeOut(p)
          if (held('sweep') && fr >= 0.72) { face.set(fr, [lag(p, 0.1), lag(p, 0.05)]); return }
          face.set(fr, p < 1 ? [lag(p, 0.1), lag(p, 0.05)] : null)
          if (p < 1) raf = requestAnimationFrame(step)
          else printed()
        }
        raf = requestAnimationFrame(step)
      })
      const printed = () => {
        const printing = face.slip.parentElement!
        at(50, () => {
          printing.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 500, easing: 'linear', fill: 'forwards' })
          face.slip.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 500, easing: 'linear', fill: 'forwards' })
        })
        at(550, () => {
          face.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-16px)', opacity: 0 }], { duration: 200, easing: EASE_IN, fill: 'forwards' })
          tk.classList.remove('is-waiting')
          tk.animate([{ transform: 'translateY(14px)' }, { transform: 'none' }], { duration: 320, easing: EASE_PAPER })
        })
        at(760, () => { face.el.remove(); root.classList.remove('revealing') })
        at(900, () => numbers.run(500))
        at(1550, () => {
          stamp.classList.remove('is-up')
          stamp.animate([{ transform: 'rotate(10deg) scale(1.2)', opacity: 0 }, { transform: 'rotate(10deg) scale(1)', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(.2, .7, .2, 1)' })
        })
        at(1700, end)
      }
      return root
    },
  }
}
