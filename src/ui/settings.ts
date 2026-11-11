import * as S from '../sim/index.ts'
import { confirmDialog, type Ctx } from './core.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'

export function endSeasonEarly(ctx: Ctx): void {
  const c = ctx.app.campaign
  if (!c || c.phase !== 'season' || !c.season) return
  if (S.seasonDone(c)) { ctx.run({ t: 'endSeason' }); return }
  const left: string[] = []
  const digging: string[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const f = S.fieldInfo(c, i)
    if (f.status === 'digging') digging.push(f.name)
    else if (f.status !== 'rest' && f.status !== 'dug' && f.status !== 'lost') left.push(f.name)
  }
  void confirmDialog(ctx, {
    title: 'End the season now?',
    text: [
      left.length ? h('p', null, `${F.list(left)} ${left.length === 1 ? 'is' : 'are'} still in the ground. ${left.length === 1 ? 'That crop' : 'Those crops'} will be lost, and the work on them with ${left.length === 1 ? 'it' : 'them'}.`) : null,
      digging.length ? h('p', null, `${F.list(digging)} ${digging.length === 1 ? 'is' : 'are'} half dug. What is out of the ground is kept; the rest is left.`) : null,
      h('p', null, 'The cellar opens next, and the season cannot be reopened.'),
    ],
    yes: 'End the season',
    no: 'Keep farming',
    danger: true,
  }).then(ok => { if (ok) ctx.run({ t: 'endSeason' }) })
}

export function openSettings(ctx: Ctx): void {
  const app = ctx.app
  const set = app.settings
  const toggle = (key: 'sound' | 'reducedMotion' | 'hints' | 'autoPause', label: string, hint: string) =>
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: set[key], testid: `set-${key}`, onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked
          app.setSetting(key, on)
          if (key === 'sound') document.querySelector<HTMLInputElement>('[data-testid="set-volume"]')!.disabled = !on
        },
      }),
      h('span', null, h('span', { class: 'check-label' }, label), h('span', { class: 'sub' }, hint)))

  ctx.dialogs.open({
    title: 'Menu',
    testid: 'settings',
    cls: 'settings',
    body: close => {
      const status = h('p', { class: 'form-status', role: 'status' })
      const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', tabindex: '-1', 'aria-label': 'Save file to import' })
      file.addEventListener('change', async () => {
        const f = file.files?.[0]
        if (!f) return
        const text = await f.text()
        file.value = ''
        if (app.importSave(text)) { ctx.toast('Save loaded.', 'good'); close() }
        else status.textContent = 'That file is not a save from this game, or it is from a newer version.'
      })
      const c = app.campaign
      const inGame = !!c && app.screen !== 'title'
      return [
        h('fieldset', { class: 'group' },
          h('legend', null, 'Units'),
          h('div', { class: 'seg' },
            (['us', 'metric'] as const).map(u => h('label', { class: 'seg-opt' },
              h('input', { type: 'radio', name: 'units', value: u, checked: set.units === u, testid: `units-${u}`, onchange: () => app.setSetting('units', u) }),
              h('span', null, u === 'us' ? '°F, inches, hundredweight, acres' : '°C, millimetres, tonnes, hectares'))))),
        h('fieldset', { class: 'group' },
          h('legend', null, 'Play'),
          toggle('hints', 'Coach', 'Suggest the next job and say why.'),
          toggle('autoPause', 'Stop the clock for news', 'Pause when blight, frost, a test dig or a harvest needs you.'),
          toggle('reducedMotion', 'Reduce motion', 'Fewer moving parts on the land and in the panels.')),
        h('fieldset', { class: 'group' },
          h('legend', null, 'Sound'),
          toggle('sound', 'Sound', 'Weather, machinery and the farm.'),
          h('label', { class: 'slider' },
            h('span', null, 'Volume'),
            h('input', {
              type: 'range', min: 0, max: 100, step: 5, value: Math.round(set.volume * 100), disabled: !set.sound, testid: 'set-volume',
              'aria-valuetext': `${Math.round(set.volume * 100)}%`,
              oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).setAttribute('aria-valuetext', `${v}%`); app.setSetting('volume', v / 100) },
            }))),
        h('fieldset', { class: 'group' },
          h('legend', null, 'Save'),
          h('p', { class: 'sub' }, 'The game saves itself in this browser. Export a copy to move it or keep it safe.'),
          h('div', { class: 'row-wrap' },
            h('button', {
              class: 'btn', type: 'button', testid: 'save-export', disabled: !c, onclick: () => {
                const text = app.exportSave()
                if (!text || !c) return
                const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `the-county-${c.startYear}-${c.year}.json` })
                document.body.append(a)
                a.click()
                a.remove()
                setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                status.textContent = 'Save exported.'
              },
            }, 'Export save'),
            h('button', { class: 'btn', type: 'button', testid: 'save-import', onclick: () => file.click() }, 'Import save'),
            h('button', {
              class: 'btn danger', type: 'button', testid: 'save-delete', disabled: !app.savedGame() && !c, onclick: async () => {
                const ok = await confirmDialog(ctx, {
                  title: 'Delete the save?',
                  text: h('p', null, 'The farm in this browser is erased and cannot be brought back. Export it first if you might want it.'),
                  yes: 'Delete', danger: true,
                })
                if (ok) { close(); app.deleteSave(); ctx.toast('Save deleted.', 'info') }
              },
            }, 'Delete save')),
          file, status),
        inGame ? h('fieldset', { class: 'group' },
          h('legend', null, 'Leave'),
          h('div', { class: 'row-wrap' },
            c && c.phase === 'season' && !S.seasonDone(c) ? h('button', { class: 'btn', type: 'button', testid: 'end-season-early', onclick: () => { close(); endSeasonEarly(ctx) } }, 'End the season early') : null,
            h('button', { class: 'btn', type: 'button', testid: 'quit-title', onclick: () => { close(); app.quitToTitle() } }, 'Save and quit to title'))) : null,
      ]
    },
  })
}
