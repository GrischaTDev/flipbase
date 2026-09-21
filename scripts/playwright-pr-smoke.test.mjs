import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const executeFile = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

// Nur die tatsächliche Testauswahl prüfen, nicht Playwrights Parser nachtesten.
const coreTests = [
  [
    'beta-registration.spec.ts',
    'genehmigt eine Bewerbung und startet nach der Passwortvergabe 60 Beta-Tage @pr-smoke',
  ],
  ['core-smoke.spec.ts', 'speichert einen Artikel mit Bild und lädt ihn erneut @core-smoke'],
  ['core-smoke.spec.ts', 'öffnet die App und zentrale Arbeitsbereiche @core-smoke'],
  [
    'inventory-sale.spec.ts',
    'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke',
  ],
  [
    'listing-studio.spec.ts',
    'creates, publishes and completes the listing lifecycle on mobile @pr-smoke',
  ],
  [
    'local-supabase.spec.ts',
    'sperrt freie Registrierung und erlaubt Betreiber-Einladungen @pr-smoke',
  ],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening @pr-smoke',
  ],
  ['purchase-tax-costs.spec.ts', 'keeps per-item tax visible in the tax journal @pr-smoke'],
  [
    'purchase-tax-costs.spec.ts',
    'preserves additional purchase costs after reopening at 1440px @pr-smoke',
  ],
];

const regressionTests = [
  [
    'dashboard-interactions.spec.ts',
    'erkundet die Diagrammdaten vollstaendig mit der Tastatur @pr-smoke',
  ],
  ['date-picker-layer.spec.ts', 'can select a purchase date outside its card @pr-smoke'],
  ['deal-monitor.spec.ts', 'Vinted Bot Feed und Suchfilter verwalten dark @pr-smoke'],
  ['deal-monitor.spec.ts', 'Vinted Bot Feed und Suchfilter verwalten light @pr-smoke'],
  [
    'entry-pages.spec.ts',
    'keeps the new entry pages free of automated WCAG AA violations @pr-smoke',
  ],
  [
    'inventory-sale.spec.ts',
    'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke',
  ],
  [
    'product-editor-storefront.spec.ts',
    'Artikel mit Galerie, Zuschnitt und Suchvorschau erstellen 1440 @pr-smoke',
  ],
  [
    'product-integration.spec.ts',
    'Produktbild bleibt nach erneutem Laden sichtbar und unbekannter Scan öffnet den Picker @pr-smoke',
  ],
  [
    'purchase-dropdown-layer.spec.ts',
    'keeps cost options above the modal footer and preserves keyboard dismissal @pr-smoke',
  ],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening @pr-smoke',
  ],
  ['purchase-tax-costs.spec.ts', 'keeps per-item tax visible in the tax journal @pr-smoke'],
  [
    'purchase-tax-costs.spec.ts',
    'preserves additional purchase costs after reopening at 1440px @pr-smoke',
  ],
  [
    'sniper-administration.spec.ts',
    'Markenfilter anlegen, bearbeiten, aktivieren und pausieren dark @pr-smoke',
  ],
  [
    'sniper-administration.spec.ts',
    'Markenfilter anlegen, bearbeiten, aktivieren und pausieren light @pr-smoke',
  ],
];

function collectSpecs(suites) {
  return suites.flatMap((suite) => [...(suite.specs ?? []), ...collectSpecs(suite.suites ?? [])]);
}

async function listTests(config) {
  const env = { ...process.env, CI: 'true' };
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
  const { stdout } = await executeFile(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      `--config=${config}`,
      '--project=chromium',
      '--list',
      '--reporter=json',
    ],
    { cwd: root, env, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const report = JSON.parse(stdout);
  assert.deepEqual(report.errors ?? [], []);
  const selected = collectSpecs(report.suites).map((spec) => [
    spec.file.split(/[\\/]/).at(-1),
    spec.title,
  ]);
  return { report, selected };
}

const keys = (entries) => entries.map((entry) => JSON.stringify(entry)).sort();

test('PR-Auswahl: neun Kernfälle, keine Wiederholungen, kein test.only', async () => {
  const { report, selected } = await listTests('playwright.pr.config.ts');
  assert.deepEqual(keys(selected), keys(coreTests));
  assert.equal(report.config.forbidOnly, true);
  assert.equal(report.config.maxFailures, 1);
  assert.equal(report.config.workers, 1);
  assert.deepEqual(
    report.config.projects.map((project) => [project.name, project.retries]),
    [['chromium', 0]],
  );
});

test('manuelle Regression enthält alle bisherigen Fälle und die neuen Kernabläufe', async () => {
  const { selected } = await listTests('playwright.nightly.config.ts');
  const actual = new Set(keys(selected));
  assert.equal(actual.size, selected.length, 'Keine doppelten Fälle');
  for (const required of new Set(keys([...regressionTests, ...coreTests]))) {
    assert.ok(actual.has(required), `Fehlende Absicherung: ${required}`);
  }
});
