import { defineConfig } from '@playwright/test';

// Gegen eine bereits laufende lokale Vorschau. Keine echte Anmeldung/globalSetup.
export default defineConfig({
  testDir: '..',
  testMatch: 'marketplace-accounts.spec.ts',
  outputDir: process.env['MARKETPLACE_TEST_OUTPUT'] ?? '../../test-results/marketplace',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://127.0.0.1:4200',
    browserName: 'chromium',
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] },
    screenshot: 'only-on-failure',
  },
});
