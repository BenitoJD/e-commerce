// Browser end-to-end suite. Requires the full stack to be running:
//   backend  http://localhost:9000  (Postgres seeded)
//   storefront http://localhost:3000 (production build or `next dev`)
// Run: pnpm test:e2e
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The suite drives one real database; run serially so stock and order assertions hold.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
