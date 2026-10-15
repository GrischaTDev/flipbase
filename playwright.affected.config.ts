import { defineConfig } from '@playwright/test';
import prConfig from './playwright.pr.config';

const plan: unknown = JSON.parse(process.env['AFFECTED_TEST_PLAN'] ?? 'null');
if (
  !plan ||
  typeof plan !== 'object' ||
  !('full' in plan) ||
  typeof plan.full !== 'boolean' ||
  !('browserFiles' in plan) ||
  !('changedBrowserFiles' in plan)
)
  throw new Error('Betroffene Browserauswahl fehlt.');
const normal: unknown = plan.browserFiles;
const changed: unknown = plan.changedBrowserFiles;
function validFiles(files: unknown): files is string[] {
  return (
    Array.isArray(files) &&
    files.every((file: unknown) => typeof file === 'string' && /^e2e\/[\w-]+\.spec\.ts$/.test(file))
  );
}
if (!validFiles(normal) || !validFiles(changed) || normal.length + changed.length === 0)
  throw new Error('Ungültige oder leere Browserauswahl.');

export default defineConfig({
  ...prConfig,
  grep: plan.full ? prConfig.grep : /.*/,
  projects: [
    ...(normal.length
      ? [
          {
            name: 'chromium',
            use: { browserName: 'chromium' as const },
            testMatch: normal.map((file) => file.slice(4)),
          },
        ]
      : []),
    // Geänderte Testdateien vollständig prüfen, auch wenn ein neuer Fall noch
    // keine historische Kernmarkierung hat. Beide Gruppen überschneiden sich nicht.
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
