// The menu: carry on, the help, the settings, the save, and the ways out.
import type { Quality } from '../game/app.ts'
import * as S from '../sim/index.ts'
import { confirmPaper, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
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
      left.length ? h('p', null, `${F.list(left)} still ${left.length === 1 ? 'has its crop' : 'have their crops'} in the ground. You'll lose ${left.length === 1 ? 'that crop and the work that went into it' : 'those crops and the work that went into them'}.`) : null,
      bare.length ? h('p', null, `${F.list(bare)} ${bare.length === 1 ? 'was' : 'were'} never planted. The ${F.money(S.FIELD_COST)}${bare.length === 1 ? '' : ' a field'} you already spent on ${bare.length === 1 ? 'it' : 'them'} is gone, and ${bare.length === 1 ? 'it' : 'they'} won't grow anything this year.`) : null,
      digging.length ? h('p', null, `${F.list(digging)} ${digging.length === 1 ? 'is' : 'are'} only partly dug. You keep what's already out of the ground and lose the rest.`) : null,
      h('p', null, `Winter in the cellar comes next, and you can't come back to this season. You'll still owe ${F.money(S.NOTE_PAYMENT + S.LIVING)} for the bank payment and your family's living costs at the end of the year.`),
    ],
    yes: 'End the season',
    no: 'Keep farming',
    danger: true,
  }).then(ok => { if (ok) ctx.run({ t: 'endSeason' }) })
}

const TIER_WORD = { high: 'in full detail', medium: 'in medium detail', low: 'in low detail', flat: 'the simple flat view' }

// The menu (design/menu.html): the office file open over the live land, the menu on its left page and the settings on
// its right. From the title it holds the settings and the save.
export function openMenu(ctx: Ctx, o: { onHelp: () => void; onAlmanac: () => void; onGuide?: () => void }): void {
  const app = ctx.app
  const set = app.settings
  const toggle = (key: 'sound' | 'reducedMotion' | 'hints' | 'pauseOnAlerts', label: string, hint: string) => {
    const tick = h('i', { class: `tick${set[key] ? ' on' : ''}` })
    return h('label', { class: 'check' },
      h('span', { class: 'check-in' }, h('input', {
        type: 'checkbox', checked: set[key], testid: `set-${key}`, onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked
          tick.classList.toggle('on', on)
          app.setSetting(key, on)
          if (key === 'sound') document.querySelector<HTMLInputElement>('[data-k="set-volume"]')!.disabled = !on
        },
      }), tick),
      h('span', null, h('b', null, label), ' ', h('span', { class: 'quiet' }, hint)))
  }
  const seg = (name: string, label: string, opts: [string, string][], now: string, pick: (v: string) => void) =>
    h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': label }, opts.map(([v, text]) => h('label', null,
      h('input', { type: 'radio', name, value: v, checked: now === v, testid: `${name === 'units' ? 'units' : 'quality'}-${v}`, onchange: () => pick(v) }),
      h('span', null, text))))

  const c = app.campaign
  const inGame = !!c && app.screen !== 'title'
  const season = inGame && c!.phase === 'season'
  ctx.papers.open({
    title: inGame ? 'Menu and settings' : 'Settings',
    testid: 'menu',
    plain: true,
    cls: 'menu-dialog',
    body: close => {
      const status = h('p', { class: 't-caption form-status', role: 'status' })
      const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', tabindex: '-1', 'aria-label': 'Save file to import' })
      file.addEventListener('change', async () => {
        const f = file.files?.[0]
        if (!f) return
        const text = await f.text()
        file.value = ''
        if (app.importSave(text)) { ctx.say('Save loaded.', 'good'); close() }
        else status.textContent = 'That file isn\'t a save from this game, or it\'s from a newer version. Try a different file.'
      })
      const q = ctx.view.quality()
      const vol = Math.round(set.volume * 100)
      const exportSave = () => {
        const text = app.exportSave()
        if (!text || !c) return
        const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `the-county-${yearWord(c.year).replace(' ', '-')}.json` })
        document.body.append(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        status.textContent = 'A copy was saved to your downloads.'
        ctx.say('Saved a copy of your farm.', 'good')
      }
      const deleteSave = async () => {
        const ok = await confirmPaper(ctx, {
          title: 'Delete the save?',
          text: h('p', null, 'This deletes the farm saved in this browser, and it can\'t be undone. Save a copy first if you might want it back.'),
          yes: 'Delete it', no: 'Keep it', danger: true,
        })
        if (ok) { close(); app.deleteSave(); ctx.say('Save deleted.', 'info') }
      }
      const when = c && c.season && c.phase === 'season' ? ` · ${F.date(c.year, c.season.day)}` : c ? ` · ${PHASE_LABEL[c.phase].toLowerCase()}` : ''
      const menuPage = h('section', { 'aria-label': 'Menu' },
        h('p', { class: 't-label' }, c ? `${seasonCount(c)}${when}` : 'The farm'),
        h('h1', { class: 'mini-mark' }, h('span', { class: 'the' }, 'The'), h('span', { class: 'county' }, 'County')),
        h('div', { class: 'rule double' }),
        h('nav', { class: 'menu-list', 'aria-label': 'Menu' },
          inGame ? h('button', { class: 'btn go wide', type: 'button', testid: 'menu-continue', autofocus: true, onclick: close }, 'Continue', icon('arrow', 'i')) : null,
          season ? h('button', { class: 'btn wide', type: 'button', testid: 'menu-almanac', onclick: () => { close(); o.onAlmanac() } }, icon('almanac', 'i'), 'The almanac') : null,
          h('button', { class: 'btn wide', type: 'button', testid: 'save-export', disabled: !c, onclick: exportSave }, icon('save', 'i'), 'Save a copy'),
          h('button', { class: 'btn wide', type: 'button', testid: 'save-import', onclick: () => file.click() }, icon('ticket', 'i'), 'Load a saved farm'),
          h('button', { class: 'btn wide', type: 'button', testid: 'how-open', onclick: () => o.onHelp() }, icon('key', 'i'), 'How to play'),
          o.onGuide ? h('button', { class: 'btn wide', type: 'button', testid: 'guide-open', title: ctx.touch() ? undefined : 'Read the tutorial\'s lessons again. Your farm stays as it is.', onclick: () => o.onGuide!() }, icon('fist', 'i'), 'Guided first year', h('span', { class: 'sr' }, '. The tutorial\'s lessons, to read again. Your farm stays as it is.')) : null,
          season && !S.seasonDone(c!) ? h('button', { class: 'btn wide hazard', type: 'button', testid: 'end-season-early', onclick: () => { close(); endSeasonEarly(ctx) } }, icon('skip', 'i'), 'End the season early') : null,
          inGame ? h('button', { class: 'btn wide', type: 'button', testid: 'quit-title', onclick: () => { close(); app.quitToTitle() } }, icon('letgo', 'i'), 'Quit to the title') : null,
          h('button', { class: 'btn wide hazard menu-delete', type: 'button', testid: 'save-delete', disabled: !app.savedGame() && !c, onclick: deleteSave }, 'Delete the save')),
        h('p', { class: 't-caption' }, 'The game saves automatically in this browser.'),
        file, status)
      const settings = h('section', { 'aria-label': 'Settings' },
        h('header', { class: 'form-head' },
          h('h2', { class: 't-title' }, 'Settings'),
          h('button', { class: 'close', type: 'button', testid: 'paper-close', 'aria-label': 'Close (Escape)', autofocus: !inGame, onclick: close }, icon('close', 'i'))),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, 'Units'),
          seg('units', 'Units', [['us', '°F, inches, cwt, acres'], ['metric', '°C, mm, tonnes, hectares']], set.units, v => app.setSetting('units', v as 'us' | 'metric'))),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, 'Sound'),
          toggle('sound', 'Sound', 'weather, machinery and the farm'),
          h('label', { class: 'slider' },
            h('span', { class: 'sr' }, 'Volume'),
            h('input', {
              class: 'slider-in', type: 'range', min: 0, max: 100, step: 5, value: vol, disabled: !set.sound, testid: 'set-volume',
              style: `--fill:${vol}%`, 'aria-valuetext': `${vol}%`,
              oninput: (e: Event) => {
                const el = e.target as HTMLInputElement
                const v = Number(el.value)
                el.setAttribute('aria-valuetext', `${v}%`)
                el.style.setProperty('--fill', `${v}%`)
                el.parentElement!.querySelector('.num')!.textContent = String(v)
                app.setSetting('volume', v / 100)
              },
            }),
            h('b', { class: 'num' }, String(vol)))),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, 'Play'),
          toggle('hints', 'Hints', 'a short tip the first time each order comes up'),
          toggle('pauseOnAlerts', 'Pause on alerts', 'pause the game when something new needs you'),
          toggle('reducedMotion', 'Reduce motion', 'sheets switch instantly and the land stays still')),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, 'Picture'),
          seg('quality', 'Picture', (['auto', 'high', 'medium', 'low'] as Quality[]).map(k => [k, F.upper(k)]), set.quality, v => app.setSetting('quality', v as Quality)),
          h('p', { class: 't-caption', testid: 'quality-now' }, `Drawing ${TIER_WORD[q.tier]}${q.fps > 0 ? `, at ${Math.round(q.fps)} frames a second` : ''}.`)))
      return h('section', { class: 'file sys' },
        h('span', { class: 'file-tab', 'aria-hidden': 'true' }, 'The office file'),
        h('div', { class: 'file-pages' }, menuPage, settings))
    },
  })
}
