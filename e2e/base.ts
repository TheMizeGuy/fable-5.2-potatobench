// Every test runs on the short-day clock the game had before days were long (four seconds a day at its first speed),
// so a test that waits for a day waits seconds: these are tests of the game's rules and its interface, not of the
// length of a day. The long day has its own tests (e2e/longday.spec.ts), which ask for the game's own clock.
import { test as plain } from '@playwright/test'

export * from '@playwright/test'

export const test = plain.extend<{ days: 'brisk' | 'long' }>({
  days: ['brisk', { option: true }],
  page: async ({ page, days }, use) => {
    if (days === 'brisk') await page.addInitScript(() => { (globalThis as { __countyDays?: string }).__countyDays = 'brisk' })
    await use(page)
  },
})
