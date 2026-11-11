// What the first blind playtests and reviews found in the interface, held fixed.
import { test, type Page } from '@playwright/test'
import { closeDialogs, expect, open, playUntil, watchErrors } from './helpers.ts'

async function startSeason(page: Page): Promise<void> {
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('speed-0')).toBeVisible()
}

test('the year picker shows the year before and nothing about the year chosen', async ({ page }) => {
  await open(page)
  await page.getByTestId('new-farm').click()
  await page.getByTestId('start-year-1976').click()
  const detail = page.locator('.year-detail')
  await expect(detail).toContainText('the year before, 1975')
  await expect(detail).toContainText('Five seasons follow, 1976 to 1980')
  const note = await page.evaluate(() => String((globalThis as any).__county.app.world.notes['1976'] ?? ''))
  expect(note.length).toBeGreaterThan(10)
  const text = (await page.getByTestId('new-farm-dialog').textContent()) ?? ''
  expect(text).not.toContain(note.slice(0, 24))
  expect(text).not.toContain('1976 dollars')
})

test('a stop says why, day one says nothing can be queued, and 0 pauses from a focused field chip', async ({ page }) => {
  const errors = watchErrors(page)
  await startSeason(page)
  await expect(page.getByTestId('clock-note')).toContainText('Nothing can be queued yet')
  // Days run until the clock stops itself for the coach's first job.
  const reason = await page.evaluate(() => {
    const a = (globalThis as any).__county.app
    a.setSpeed(1)
    for (let k = 0; k < 90 && a.speed > 0; k++) a.do({ t: 'day' })
    return { speed: a.speed, why: String(a.pauseReason) }
  })
  expect(reason.speed).toBe(0)
  expect(reason.why.length).toBeGreaterThan(3)
  await expect(page.getByTestId('clock-note')).toContainText('The clock stopped itself')
  await expect(page.getByTestId('clock-note')).toContainText(reason.why.slice(0, 12))
  await expect(page.getByTestId('speed-0')).toHaveAttribute('aria-label', /stopped itself/)

  await page.getByTestId('speed-1').click()
  await page.getByTestId('field-1').focus()
  await page.keyboard.press('Space')
  expect(await page.evaluate(() => (globalThis as any).__county.app.selected)).toBe(1)
  await page.keyboard.press('0')
  expect(await page.evaluate(() => (globalThis as any).__county.app.speed)).toBe(0)
  expect(errors, errors.join('\n')).toEqual([])
})

for (const [w, h] of [[320, 640], [844, 390], [820, 1180], [1024, 700], [1280, 720]]) {
  test(`the season screen holds together at ${w} by ${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await startSeason(page)
    await page.getByTestId('field-0').click()
    await page.waitForTimeout(400)
    const found = await page.evaluate(() => {
      const out: string[] = []
      const ins = (globalThis as any).__county.app.insets
      const freeW = innerWidth - ins.left - ins.right, freeH = innerHeight - ins.top - ins.bottom
      if (freeW < 240 || freeH < 130) out.push(`the land has ${freeW} by ${freeH} px`)
      if (document.documentElement.scrollWidth > innerWidth) out.push('the page scrolls sideways')
      const date = document.querySelector('.date')!.getBoundingClientRect(), clock = document.querySelector('.clock')!.getBoundingClientRect()
      if (date.height > 30) out.push('the date wraps')
      if (date.right > clock.left + 0.5 && date.left < clock.right - 0.5 && date.bottom > clock.top + 0.5 && date.top < clock.bottom - 0.5) out.push('the date is under the clock')
      for (const chip of document.querySelectorAll('.chip')) {
        const name = chip.querySelector('.chip-name')!
        const range = document.createRange()
        range.selectNodeContents(name)
        const text = range.getBoundingClientRect(), box = chip.getBoundingClientRect()
        if (text.height > 22 || text.right > box.right - 1) out.push(`the chip ${name.textContent} is narrower than its name`)
      }
      const pad = document.querySelector('.pad')!.getBoundingClientRect()
      if (document.querySelectorAll('.job-btn').length !== 9) out.push('not nine jobs')
      if (pad.top < 0 || pad.bottom > innerHeight + 0.5) out.push('the job pad is not all on screen')
      return out
    })
    expect(found, found.join('; ')).toEqual([])
  })
}

test('queuing a job leaves the other job buttons where they were', async ({ page }) => {
  await startSeason(page)
  await page.getByTestId('field-0').click()
  await expect(page.locator('.job-btn')).toHaveCount(9)
  const where = () => page.evaluate(() => [...document.querySelectorAll('.job-btn')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)].join(',') }).join(' '))
  const before = await where()
  await page.getByTestId('act-plant').click()
  await expect(page.getByTestId('act-plant')).toHaveAttribute('aria-disabled', 'true')
  expect(await where()).toBe(before)
  // Every job says what it does without the help being opened.
  await page.getByTestId('act-rogue').focus()
  await expect(page.locator('.pad-detail')).toContainText('blighted plants')
})

test('dig day sets the estimate beside the crop, cannot be tapped away, and the kept crop stays in sight', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, '?year=1990&seed=7')
  // One field goes in on saved seed that carries virus.
  await page.evaluate(() => {
    const a = (globalThis as any).__county.app
    a.campaign.seedStock = [{ variety: 'katahdin', fields: 1, virus: 0.3, blight: 0 }]
    a.do({ t: 'plan', field: 0, plan: { crop: 'potato', variety: 'katahdin', seed: 'saved' } })
  })
  await expect(page.getByTestId('seed-note-0')).toContainText('about 30% of plants')
  await page.getByTestId('begin-season').click()
  await playUntil(page, 'firstDig')
  for (let k = 0; k < 20 && !(await page.getByTestId('weighin').count()); k++) await page.keyboard.press('Escape')
  const dialog = page.getByTestId('weighin')
  await expect(dialog).toContainText('What you expected, and what the field gave')
  await expect(dialog).toContainText('Digging started')
  await expect(dialog).toContainText('of the No. 1 price')
  await expect(dialog.locator('.dialog-foot .btn.primary')).toHaveCount(0)
  await page.waitForTimeout(600)
  await page.mouse.click(4, 4)
  await expect(dialog).toBeVisible()
  await dialog.locator('[data-testid^="lot-keep-"]').click()
  await expect(page.locator('.toasts')).toContainText('went into the cellar')
  await closeDialogs(page)
  await expect(page.getByTestId('cellar-line')).toBeVisible()
  // An ordinary dialog ignores a tap in its first half second, then closes on one.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="cellar-line"]')!.click()
    document.querySelector<HTMLElement>('.shade')!.click()
  })
  await expect(page.getByTestId('cellar-lots')).toContainText('The cellar charges')
  await page.waitForTimeout(650)
  await page.mouse.click(4, 4)
  await expect(page.getByTestId('cellar-lots')).toHaveCount(0)

  // The field on saved seed: its weigh-in says what the virus cost.
  await page.evaluate(() => {
    const { app, sim } = (globalThis as any).__county
    const c = app.campaign
    for (let k = 0; k < 400 && c.phase === 'season' && sim.fieldInfo(c, 0).status !== 'dug' && !sim.seasonDone(c); k++) {
      for (const x of sim.advise(app.world, c)) if (x.act !== 'wait' && x.act !== 'close' && x.act !== 'sell' && x.act !== 'sample') app.do({ t: 'job', kind: x.act, field: x.field })
      app.do({ t: 'day' })
    }
  })
  await closeDialogs(page)
  const status = await page.evaluate(() => { const { app, sim } = (globalThis as any).__county; return sim.fieldInfo(app.campaign, 0).status })
  expect(status).toBe('dug')
  await page.getByTestId('field-0').click()
  await page.locator('[data-testid^="weighin-"]').click()
  await expect(page.getByTestId('weighin')).toContainText('What never grew')
  await expect(page.getByTestId('weighin')).toContainText('stunted by virus')
  expect(errors, errors.join('\n')).toEqual([])
})
