import { defineConfig } from '@playwright/test';
import prConfig from './playwright.pr.config';
import {
  coreBrowserGrep,
  layoutBrowserGrep,
  representativeBrowserGrepInvert,
} from './scripts/browser-test-selection.mjs';

const plan: unknown = JSON.parse(process.env['AFFECTED_TEST_PLAN'] ?? 'null');
if (!plan || typeof plan !== 'object' || !('full' in plan) || typeof plan.full !== 'boolean')
  throw new Error('Betroffene Browserauswahl fehlt.');
function validFiles(files: unknown): files is string[] {
  return (
    Array.isArray(files) &&
    files.every((file: unknown) => typeof file === 'string' && /^e2e\/[\w-]+\.spec\.ts$/.test(file))
  );
}
const normal: unknown = 'browserFiles' in plan ? plan.browserFiles : null;
const changed: unknown = 'changedBrowserFiles' in plan ? plan.changedBrowserFiles : null;
const core: unknown = 'coreBrowserFiles' in plan ? plan.coreBrowserFiles : [];
const layout: unknown = 'layoutBrowserFiles' in plan ? plan.layoutBrowserFiles : [];
if (
  !validFiles(normal) ||
  !validFiles(changed) ||
  !validFiles(core) ||
  !validFiles(layout) ||
  normal.length + changed.length + core.length + layout.length === 0
)
  throw new Error('Ungültige oder leere Browserauswahl.');

export default defineConfig({
  ...prConfig,
  grep: /.*/,
  projects: [
    ...(core.length
      ? [
          {
            name: 'core-smoke',
            use: { browserName: 'chromium' as const },
            testMatch: core.map((file) => file.slice(4)),
            grep: coreBrowserGrep,
          },
        ]
      : []),
    ...(layout.length
      ? [
          {
            name: 'layout',
            use: { browserName: 'chromium' as const },
            testMatch: layout.map((file) => file.slice(4)),
            grep: layoutBrowserGrep,
            grepInvert: coreBrowserGrep,
          },
        ]
      : []),
    ...(normal.length
      ? [
          {
            name: 'chromium',
            use: { browserName: 'chromium' as const },
            testMatch: normal.map((file) => file.slice(4)),
            // Breite Änderungen behalten alle zugeordneten Varianten. Gezielte
            // Änderungen reduzieren ausschließlich bekannte Wiederholungsfamilien.
            grepInvert: [...(plan.full ? [] : representativeBrowserGrepInvert)],
          },
        ]
      : []),
    // Direkt geänderte Dateien laufen vollständig, auch ohne Markierung.
    ...(changed.length
      ? [
          {
            name: 'changed-tests',
            use: { browserName: 'chromium' as const },
            testMatch: changed.map((file) => file.slice(4)),
            grep: /.*/,
          },
        ]
      : []),
  ],
});
