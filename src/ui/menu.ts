// The menu: carry on, the help, the settings, the save, and the ways out.
import type { Quality } from '../game/app.ts'
import * as S from '../sim/index.ts'
import { confirmPaper, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { seasonCount, yearWord } from './rules.ts'
import { PHASE_LABEL } from './top.ts'

function endSeasonEarly(ctx: Ctx): void {
  const c = ctx.app.campaign
  if (!c || c.phase !== 'season' || !c.season) return
  if (S.seasonDone(c)) { ctx.run({ t: 'endSeason' }); return }
  const left: string[] = []
  const digging: string[] = []
  const bare: string[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const f = S.fieldInfo(c, i)
    if (f.status === 'digging') digging.push(f.name)
    else if (f.status === 'idle') bare.push(f.name)
    else if (f.status !== 'rest' && f.status !== 'dug' && f.status !== 'lost' && f.status !== 'off') left.push(f.name)
  }
  void confirmPaper(ctx, {
    title: 'End the season now?',
    text: [
      left.length ? h('p', null, `${F.list(left)} ${left.length === 1 ? 'is' : 'are'} still in the ground. ${left.length === 1 ? 'That crop will be lost, and the work that went into it' : 'Those crops will be lost, and the work that went into them'}.`) : null,
      bare.length ? h('p', null, `${F.list(bare)} ${bare.length === 1 ? 'was' : 'were'} never planted. The ${F.money(S.FIELD_COST)} a field already spent on ${bare.length === 1 ? 'it' : 'them'} is gone, and ${bare.length === 1 ? 'it grows' : 'they grow'} nothing this year.`) : null,
      digging.length ? h('p', null, `${F.list(digging)} ${digging.length === 1 ? 'is' : 'are'} half dug. What is out of the ground is kept; the rest is left.`) : null,
      h('p', null, `The cellar opens next, and the season cannot be reopened. The note and the household, ${F.money(S.NOTE_PAYMENT + S.LIVING)}, still come due at the year end.`),
    ],
    yes: 'End the season',
    no: 'Keep farming',
    danger: true,
  }).then(ok => { if (ok) ctx.run({ t: 'endSeason' }) })
}

const TIER_WORD = { high: 'full detail', medium: 'medium detail', low: 'low detail', flat: 'the flat drawing' }

export function openMenu(ctx: Ctx, o: { onHelp: () => void; onAlmanac: () => void }): void {
  const app = ctx.app
  const set = app.settings
  const toggle = (key: 'sound' | 'reducedMotion' | 'hints' | 'pauseOnAlerts', label: string, hint: string) =>
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: set[key], testid: `set-${key}`, onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked
          app.setSetting(key, on)
          if (key === 'sound') document.querySelector<HTMLInputElement>('[data-k="set-volume"]')!.disabled = !on
        },
      }),
      h('span', null, h('span', { class: 'check-label' }, label), h('span', { class: 'sub' }, hint)))

  const c = app.campaign
  const inGame = !!c && app.screen !== 'title'
  ctx.papers.open({
    title: inGame ? 'The County' : 'Settings',
    testid: 'menu',
    size: inGame ? 'wide' : 'medium',
    cls: 'menu',
    body: close => {
      const status = h('p', { class: 'sub form-status', role: 'status' })
      const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', tabindex: '-1', 'aria-label': 'Save file to import' })
      file.addEventListener('change', async () => {
        const f = file.files?.[0]
        if (!f) return
        const text = await f.text()
        file.value = ''
        if (app.importSave(text)) { ctx.say('Save loaded.', 'good'); close() }
        else status.textContent = 'That file is not a save from this game, or it is from a newer version.'
      })
      const q = ctx.view.quality()
      const settings = h('div', { class: 'menu-settings' },
        h('fieldset', { class: 'group' },
          h('legend', { class: 'block-head' }, 'Units'),
          h('div', { class: 'seg' },
            (['us', 'metric'] as const).map(u => h('label', { class: 'seg-opt' },
              h('input', { type: 'radio', name: 'units', value: u, checked: set.units === u, testid: `units-${u}`, onchange: () => app.setSetting('units', u) }),
              h('span', null, u === 'us' ? '°F, inches, cwt, acres' : '°C, mm, tonnes, hectares'))))),
        h('fieldset', { class: 'group' },
          h('legend', { class: 'block-head' }, 'Play'),
          toggle('hints', 'Tips', 'One sentence the first time each order is called for.'),
          toggle('pauseOnAlerts', 'Pause on alerts', 'Stop the clock, instead of slowing it, when something new needs you.'),
          toggle('reducedMotion', 'Reduce motion', 'Papers and figures change at once, and the land holds still.')),
        h('fieldset', { class: 'group' },
          h('legend', { class: 'block-head' }, 'Sound'),
          toggle('sound', 'Sound', 'Weather, machinery and the farm.'),
          h('label', { class: 'slider' },
            h('span', null, 'Volume'),
            h('input', {
              type: 'range', min: 0, max: 100, step: 5, value: Math.round(set.volume * 100), disabled: !set.sound, testid: 'set-volume',
              style: `--fill:${Math.round(set.volume * 100)}%`, 'aria-valuetext': `${Math.round(set.volume * 100)}%`,
              oninput: (e: Event) => {
                const el = e.target as HTMLInputElement
                const v = Number(el.value)
                el.setAttribute('aria-valuetext', `${v}%`)
                el.style.setProperty('--fill', `${v}%`)
                app.setSetting('volume', v / 100)
              },
            }))),
        h('fieldset', { class: 'group' },
          h('legend', { class: 'block-head' }, 'Picture'),
          h('div', { class: 'seg' },
            (['auto', 'high', 'medium', 'low'] as Quality[]).map(k => h('label', { class: 'seg-opt' },
              h('input', { type: 'radio', name: 'quality', value: k, checked: set.quality === k, testid: `quality-${k}`, onchange: () => app.setSetting('quality', k) }),
              h('span', null, F.upper(k))))),
          h('p', { class: 'sub', testid: 'quality-now' }, `Drawing ${TIER_WORD[q.tier]}${q.fps > 0 ? ` at ${Math.round(q.fps)} frames a second` : ''}.`)))
      const save = h('fieldset', { class: 'group' },
        h('legend', { class: 'block-head' }, 'The save'),
        h('p', { class: 'sub' }, 'The game saves itself in this browser. Export a copy to move it or keep it safe.'),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn', type: 'button', testid: 'save-export', disabled: !c, onclick: () => {
              const text = app.exportSave()
              if (!text || !c) return
              const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `the-county-${yearWord(c.year).replace(' ', '-')}.json` })
              document.body.append(a)
              a.click()
              a.remove()
              setTimeout(() => URL.revokeObjectURL(a.href), 1000)
              status.textContent = 'Save exported.'
            },
          }, 'Export'),
          h('button', { class: 'btn', type: 'button', testid: 'save-import', onclick: () => file.click() }, 'Import'),
          h('button', {
            class: 'btn danger', type: 'button', testid: 'save-delete', disabled: !app.savedGame() && !c, onclick: async () => {
              const ok = await confirmPaper(ctx, {
                title: 'Delete the save?',
                text: h('p', null, 'The farm in this browser is erased and cannot be brought back. Export it first if you might want it.'),
                yes: 'Delete it', no: 'Keep it', danger: true,
              })
              if (ok) { close(); app.deleteSave(); ctx.say('Save deleted.', 'info') }
            },
          }, 'Delete')),
        file, status)
      if (!inGame) return [settings, save]
      const season = c!.phase === 'season'
      return h('div', { class: 'menu-cols' },
        h('nav', { class: 'menu-nav', 'aria-label': 'Menu' },
          h('p', { class: 'sub' }, `${seasonCount(c!)} · ${PHASE_LABEL[c!.phase].toLowerCase()}`),
          h('button', { class: 'btn primary big', type: 'button', testid: 'menu-continue', autofocus: true, onclick: close }, 'Continue'),
          season ? h('button', { class: 'btn big', type: 'button', testid: 'menu-almanac', onclick: () => { close(); o.onAlmanac() } }, 'The almanac') : null,
          h('button', { class: 'btn big', type: 'button', testid: 'how-open', onclick: () => o.onHelp() }, 'How to play'),
          season && !S.seasonDone(c!) ? h('button', { class: 'btn big', type: 'button', testid: 'end-season-early', onclick: () => { close(); endSeasonEarly(ctx) } }, 'End the season early') : null,
          h('button', { class: 'btn big', type: 'button', testid: 'quit-title', onclick: () => { close(); app.quitToTitle() } }, 'Save and quit to the title'),
          save),
        settings)
    },
  })
}
