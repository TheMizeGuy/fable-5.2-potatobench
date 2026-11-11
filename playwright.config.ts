import { defineConfig, devices } from '@playwright/test'

// BASE_URL points the same tests at the deployed site: BASE_URL=https://themizeguy.github.io/the-county/ npm run test:e2e
const live = process.env.BASE_URL
// Chromium renders on the real GPU where there is one to ask for: Metal on a Mac, Direct3D on Windows.
const gl = process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']
  : process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
// One browser at a time on the laptop; the Windows check box has room for more.
const workers = process.env.WORKERS ? Number(process.env.WORKERS) : process.platform === 'win32' ? 3 : 1

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers,
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
