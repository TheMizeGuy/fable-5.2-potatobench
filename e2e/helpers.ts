import { expect, type Page } from '@playwright/test'

export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  return errors
}

export async function open(page: Page, query = ''): Promise<void> {
  await page.goto('./' + query)
  await page.waitForFunction(() => '__county' in globalThis)
}

// Plays days forward under the in-game advice until the test says stop. Runs in the page, through the real app.
export async function playUntil(page: Page, stop: 'firstDig' | 'seasonDone'): Promise<void> {
  await page.evaluate(stop => {
    const { app, sim } = (globalThis as any).__county
    const c = app.campaign
    let guard = 0
    while (c.phase === 'season' && guard++ < 400) {
      if (stop === 'firstDig' && c.lots.some((l: any) => l.open)) return
      if (sim.seasonDone(c)) return
      for (const a of sim.advise(app.world, c)) {
        if (a.act === 'wait' || a.act === 'close' || a.act === 'sell') continue
        app.do({ t: 'job', kind: a.act, field: a.field })
      }
      app.do({ t: 'day' })
    }
  }, stop)
}

export async function closeDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const dialog = page.locator('.dialog').last()
    if (!(await dialog.count())) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
  }
}

export async function cash(page: Page): Promise<string> {
  return (await page.getByTestId('cash').first().textContent()) ?? ''
}

export { expect }
