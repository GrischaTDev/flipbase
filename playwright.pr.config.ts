import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  grep: /@pr-smoke/,
  retries: 0,
  maxFailures: 1,
  workers: 1,
  use: {
    ...baseConfig.use,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
