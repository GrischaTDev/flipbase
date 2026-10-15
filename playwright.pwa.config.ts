import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'pwa-production.spec.ts',
    'pwa-purchase-drafts.spec.ts',
    'pwa-purchase-buffer-documents.spec.ts',
    'pwa-push-navigation.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4218',
    storageState: { cookies: [], origins: [] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-pwa-test-server.mjs',
    url: 'http://127.0.0.1:4218',
    timeout: 30_000,
    env: {
      PWA_TEST_ROOT: '.superpowers/pwa-test-builds/a/browser',
      PWA_TEST_BUILD_B: '.superpowers/pwa-test-builds/b/browser',
    },
  },
  projects: [
    { name: 'chromium-pwa', use: { browserName: 'chromium', serviceWorkers: 'allow' } },
    {
      name: 'android-pwa-updates',
      use: { ...devices['Pixel 7'], serviceWorkers: 'allow' },
      grep: /a real second build|legacy network-worker|frozen background/,
    },
    {
      name: 'webkit-ui',
      use: { browserName: 'webkit', serviceWorkers: 'block' },
      grepInvert: /@worker/,
    },
  ],
});
