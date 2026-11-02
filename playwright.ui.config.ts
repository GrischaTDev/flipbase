import { defineConfig } from '@playwright/test';
import prConfig from './playwright.pr.config';
import {
  representativeBrowserGrepInvert,
  sharedUiBrowserGrep,
  uiBrowserFiles,
} from './scripts/browser-test-selection.mjs';

const plan: unknown = JSON.parse(process.env['AFFECTED_TEST_PLAN'] ?? 'null');
if (!plan || typeof plan !== 'object' || !('full' in plan) || typeof plan.full !== 'boolean')
  throw new Error('Betroffene UI-Browserauswahl fehlt.');
function validFiles(files: unknown): files is string[] {
  return (
    Array.isArray(files) &&
    files.every((file: unknown) => typeof file === 'string' && uiBrowserFiles.includes(file))
  );
}
const normal: unknown = 'uiBrowserFiles' in plan ? plan.uiBrowserFiles : [];
const changed: unknown = 'changedUiBrowserFiles' in plan ? plan.changedUiBrowserFiles : [];
const requestedLayout: unknown = 'layoutBrowserFiles' in plan ? plan.layoutBrowserFiles : [];
if (
  !validFiles(normal) ||
  !validFiles(changed) ||
  !Array.isArray(requestedLayout) ||
  !requestedLayout.every((file: unknown) => typeof file === 'string')
)
  throw new Error('Ungültige oder leere UI-Browserauswahl.');
const layout = requestedLayout.filter((file: string) => uiBrowserFiles.includes(file));
if (normal.length + changed.length + layout.length === 0)
  throw new Error('Leere UI-Browserauswahl.');
const previewUrl = process.env['PLAYWRIGHT_BASE_URL'] || undefined;

// Diese Dateien setzen ihre Sitzung und Serverantworten vollständig über Fixtures.
// Die echte Backend-Anmeldung bleibt ausschließlich in der Integrationskonfiguration.
export default defineConfig({
  ...prConfig,
  globalSetup: undefined,
  webServer: previewUrl
    ? undefined
    : Array.isArray(prConfig.webServer)
      ? prConfig.webServer[0]
      : prConfig.webServer,
  use: {
    ...prConfig.use,
    baseURL: previewUrl ?? prConfig.use?.baseURL,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
  },
  grep: /.*/,
  projects: [
    ...(layout.length
      ? [
          {
            name: 'ui-layout',
            use: { browserName: 'chromium' as const },
            testMatch: layout.map((file: string) => file.slice(4)),
            grep: sharedUiBrowserGrep,
          },
        ]
      : []),
    ...(normal.length
      ? [
          {
            name: 'ui',
            use: { browserName: 'chromium' as const },
            testMatch: normal.map((file) => file.slice(4)),
            grepInvert: representativeBrowserGrepInvert,
          },
        ]
      : []),
    ...(changed.length
      ? [
          {
            name: 'changed-ui',
            use: { browserName: 'chromium' as const },
            testMatch: changed.map((file) => file.slice(4)),
            grep: /.*/,
          },
        ]
      : []),
  ],
});
