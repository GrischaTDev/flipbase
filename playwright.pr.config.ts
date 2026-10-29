import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';
import { coreBrowserGrep } from './scripts/browser-test-selection.mjs';

export default defineConfig({
  ...baseConfig,
  // Die kleine zentrale Kernliste wird auch von der betroffenen Auswahl verwendet.
  grep: coreBrowserGrep,
  forbidOnly: true,
  retries: 0,
  maxFailures: 1,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    ...baseConfig.use,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
