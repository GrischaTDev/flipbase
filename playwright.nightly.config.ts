import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// Dateiname und npm-Befehl bleiben kompatibel; es gibt keinen Nachtzeitplan mehr.
export default defineConfig({
  ...baseConfig,
  grep: /@pr-smoke\b|@core-smoke\b/,
  forbidOnly: true,
  retries: 1,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
