import { expect, type Page } from '@playwright/test'
import { closeAll, HELPER, q } from '../tools/quality/shared.ts'

export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  // WebKit prints its own notice when the GPU drops a context; the game takes the flat drawing, which is not a fault.
  page.on('console', m => { if (m.type() === 'error' && m.text() !== 'WebGL: context lost.') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  return errors
}

// Opens the game on a clean browser. A query such as ?year=1990&seed=7 starts a fixed farm at its spring plan.
export async function open(page: Page, query = ''): Promise<void> {
  await page.goto('./' + query)
  await page.waitForFunction(() => '__county' in globalThis && !document.getElementById('splash'))
}

// For the screens a test only looks at: the capture tools' way of reaching a state through the real app.
// The play test never uses it.
export async function reach(page: Page, code: string): Promise<void> {
  await page.evaluate(HELPER)
  await q(page, code)
}

export async function putAway(page: Page): Promise<void> {
  await closeAll(page)
}

// Starts the fixed farm's first season the way a player does, and stops the clock on its first day.
export async function startSeason(page: Page): Promise<void> {
  await open(page, '?year=1990&seed=7')
  await page.getByTestId('begin-season').click()
  await expect(page.getByTestId('date')).toBeVisible()
  await pause(page)
}

// What the instruments show, read from the page as a player would read it.
// incidents: questions open in the game, read through the test hook, since the card that asks them belongs to the
// instruments and can change under these tests.
export interface Seen { paused: boolean; running: boolean; speed: number; date: string; cash: string; badges: string[]; ticket: boolean; done: boolean; hint: boolean; tray: boolean; queue: number; incidents: number; paper: boolean }

export async function look(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const el = (id: string) => document.querySelector<HTMLElement>(`#ui [data-testid="${id}"]`)
    const pressed = (id: string) => el(id)?.getAttribute('aria-pressed') === 'true'
    const cycle = el('speed-cycle')?.textContent ?? ''
    const done = !!el('end-season')
    const paused = !done && (el('speed-0') ? pressed('speed-0') : pressed('speed-toggle'))
    // The clock: pause and three speeds. Running is any of the three.
    const speed = paused || done ? 0 : el('speed-0') ? [1, 2, 3].find(k => pressed(`speed-${k}`)) ?? 0 : Number(cycle[0] ?? 0)
    return {
      paused,
      running: speed > 0,
      speed,
      date: el('date')?.textContent ?? '',
      cash: el('cash')?.textContent ?? '',
      badges: [...document.querySelectorAll<HTMLElement>('#ui [data-testid^="badge-"]')].map(b => b.dataset.testid!),
      ticket: !!el('weighin'),
      done,
      hint: !!el('hint'),
      tray: !!el('sample-dialog'),
      queue: document.querySelectorAll('#ui [data-testid^="queue-"]:not([data-testid^="queue-first"]):not([data-testid="queue-more"]):not([data-testid^="queue-cancel"]):not([data-testid^="queue-who"])').length,
      incidents: (globalThis as unknown as { __county: { app: { campaign: { incidents: unknown[] } | null } } }).__county.app.campaign?.incidents.length ?? 0,
      paper: !!document.querySelector('#ui .dialog:not(.out)'),
    }
  })
}

export async function pause(page: Page): Promise<void> {
  if ((await look(page)).paused) return
  const whole = page.getByTestId('speed-0')
  await ((await whole.count()) ? whole : page.getByTestId('speed-toggle')).click()
  await expect.poll(async () => (await look(page)).paused).toBe(true)
}

export async function noSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

export { expect }
