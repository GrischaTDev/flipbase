import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  grep: /@pr-smoke/,
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
