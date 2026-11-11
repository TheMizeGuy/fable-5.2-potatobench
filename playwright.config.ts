import { defineConfig, devices } from '@playwright/test'

// BASE_URL points the same tests at the deployed site: BASE_URL=https://themizeguy.github.io/the-county/ npm run test:e2e
const live = process.env.BASE_URL
const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: { baseURL: live ?? 'http://localhost:4173/', trace: 'retain-on-failure' },
  webServer: live ? undefined : { command: 'npm run build && npm run preview', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: gl } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testMatch: /play\.spec/, use: { ...devices['Pixel 7'], launchOptions: { args: gl } } },
  ],
})
