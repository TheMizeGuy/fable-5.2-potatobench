// Placeholder interface: a plain debug panel that can play the whole game.
import type { MountHud } from '../game/contracts.ts'
import * as S from '../sim/index.ts'

export const mountHud: MountHud = (root, app) => {
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:13px/1.35 system-ui;color:#eee'
  const box = document.createElement('div')
  box.style.cssText = 'position:absolute;left:8px;top:8px;bottom:8px;width:330px;overflow:auto;background:#000a;padding:8px;pointer-events:auto'
  root.append(box)
  const btn = (label: string, fn: () => void, off = false) => {
    const b = document.createElement('button')
    b.textContent = label
    b.disabled = off
    b.style.cssText = 'margin:2px;font:inherit'
    b.onclick = () => { fn(); draw() }
    return b
  }
  const line = (text: string) => { const p = document.createElement('div'); p.textContent = text; return p }
  function draw(): void {
    box.replaceChildren()
    const c = app.campaign
    if (!c || app.screen === 'title') {
      box.append(line('The County (debug interface)'))
      const years = app.startYears()
      box.append(btn('New game', () => app.newGame(years[Math.floor(years.length / 2)])))
      if (app.savedGame()) box.append(btn('Continue', () => { app.continueGame() }))
      return
    }
    box.append(line(`${c.year}  phase ${c.phase}  cash $${Math.round(c.cash)}`))
    if (c.phase === 'plan') {
      c.plans.forEach((p, i) => box.append(line(`${S.FIELD_NAMES[i]}: ${p.crop} ${p.variety} ${p.seed}`), btn('toggle', () => app.do({ t: 'plan', field: i, plan: { ...p, crop: p.crop === 'rest' ? 'potato' : 'rest' } }))))
      box.append(btn('Begin season', () => app.do({ t: 'begin' })))
    } else if (c.phase === 'season' && c.season) {
      const s = c.season, t = S.today(app.world, c)!
      box.append(line(`${S.formatDay(c.year, s.day)}  ${t.sky}  ${t.day.tmin.toFixed(0)}..${t.day.tmax.toFixed(0)}C rain ${t.day.prcp}mm soil ${t.soilT.toFixed(1)}C sv ${t.sv}`))
      ;[0, 1, 2, 3].forEach(k => box.append(btn(['pause', '1x', '3x', '8x'][k], () => app.setSpeed(k as 0))))
      box.append(btn('day', () => app.do({ t: 'day' })), btn('end season', () => app.do({ t: 'endSeason' })))
      box.append(line('work: ' + s.jobs.map(j => `${j.kind}@${j.field}`).join(', ')))
      for (let i = 0; i < S.FIELD_COUNT; i++) {
        const f = S.fieldInfo(c, i)
        box.append(line(`${i === app.selected ? '> ' : ''}${f.name} [${f.variety}] ${f.stage} canopy ${(f.canopy * 100).toFixed(0)}% water ${f.moistureLabel} blight ${(f.blightKnown * 100).toFixed(0)}% est ${f.estimate ? `${f.estimate.lo.toFixed(0)}-${f.estimate.hi.toFixed(0)}` : '-'}`))
        for (const a of S.fieldActions(app.world, c, i)) if (a.ok) box.append(btn(a.kind, () => app.do({ t: 'job', kind: a.kind, field: i })))
      }
      for (const l of S.openLots(c)) box.append(btn(`sell lot ${l.id} ($${Math.round(S.lotValue(app.world, c, l))})`, () => app.do({ t: 'sell', lot: l.id, frac: 1 })))
      s.log.slice(-8).forEach(e => box.append(line(`${S.formatDay(c.year, e.day, true)} ${e.text}`)))
    } else if (c.phase === 'cellar') {
      box.append(line(`Cellar, ${S.CELLAR_MONTHS[c.month]}`))
      for (const l of S.openLots(c)) box.append(line(`lot ${l.id} ${l.variety} ${Math.round(S.lotCwt(l))} cwt`), btn(`sell ($${Math.round(S.lotValue(app.world, c, l))})`, () => app.do({ t: 'sell', lot: l.id, frac: 1 })))
      box.append(btn('next month', () => app.do({ t: 'month' })))
    } else if (c.phase === 'ledger') {
      const h = c.history[c.history.length - 1]
      box.append(line(`Year ${h.year}: revenue ${Math.round(h.revenue)} costs ${Math.round(h.costs)} cash ${Math.round(h.cashEnd)} ${c.outcome}`))
      box.append(btn('next year', () => app.do({ t: 'next' })))
    } else box.append(line(`Over: ${c.outcome}`), btn('title', () => app.quitToTitle()))
  }
  app.on(e => { if (e.type !== 'saved') draw() })
  draw()
  return { frame() {}, dispose() { box.remove() } }
}
