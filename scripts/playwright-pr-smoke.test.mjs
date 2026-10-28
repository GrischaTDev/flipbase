import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readSelectionFiles, selectAffectedTests, buildBrowserMatrix } from './affected-tests.mjs';
import { coreBrowserTests } from './browser-test-selection.mjs';

const executeFile = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const sources = await readSelectionFiles(root);

function collectSpecs(suites, parentTitles = []) {
  return suites.flatMap((suite) => {
    const titles = [...parentTitles, suite.title];
    return [
      ...(suite.specs ?? []).map((spec) => ({
        ...spec,
        // Der Dateiname bildet einen eigenen Schlüssel; describe-Gruppen unterscheiden Gerätefälle.
        titlePath: [...titles.slice(1), spec.title],
      })),
      ...collectSpecs(suite.suites ?? [], titles),
    ];
  });
}

async function listTests(config, selectionArguments = [], environment = {}) {
  const env = { ...process.env, CI: 'true', ...environment };
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
  const { stdout } = await executeFile(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      `--config=${config}`,
      ...(config === 'playwright.affected.config.ts' ? [] : ['--project=chromium']),
      '--list',
      '--reporter=json',
      ...selectionArguments,
    ],
    { cwd: root, env, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const report = JSON.parse(stdout);
  assert.deepEqual(report.errors ?? [], []);
  const selected = collectSpecs(report.suites).map((spec) => [
    spec.file.split(/[\\/]/).at(-1),
    spec.titlePath.join(' > '),
  ]);
  return { report, selected };
}

const keys = (entries) => entries.map((entry) => JSON.stringify(entry)).sort();

async function listPlan(paths, selectionArguments = [], files = sources) {
  const plan = selectAffectedTests(paths, files);
  const listed = await listTests('playwright.affected.config.ts', selectionArguments, {
    AFFECTED_TEST_PLAN: JSON.stringify(plan),
  });
  return { ...listed, plan };
}

test('PR-Kern bleibt klein, eindeutig und bewahrt Traces ohne Wiederholungen', async () => {
  const { report, selected } = await listTests('playwright.pr.config.ts');
  assert.equal(selected.length, coreBrowserTests.length);
  assert.ok(selected.length >= 10 && selected.length <= 25);
  for (const [file, title] of coreBrowserTests)
    assert.equal(
      selected.filter(
        ([actualFile, actualTitle]) => actualFile === file && actualTitle.endsWith(title),
      ).length,
      1,
      title,
    );
  assert.equal(new Set(keys(selected)).size, selected.length);
  assert.equal(report.config.forbidOnly, true);
  assert.equal(report.config.maxFailures, 1);
  assert.equal(report.config.workers, 1);
  const config = await readFile(new URL('../playwright.pr.config.ts', import.meta.url), 'utf8');
  assert.match(config, /trace: 'retain-on-failure'/u);
  assert.ok(!config.includes('E2E_TRACE'));
  for (const project of report.config.projects) {
    assert.equal(project.retries, 0);
  }
});

test('Galerie prüft Telefon und Desktop sowie Fokus und Fehler, ohne fachfremde Abläufe', async () => {
  const { selected, plan } = await listPlan([
    'src/app/shared/components/product-gallery/product-gallery.component.html',
  ]);
  assert.equal(plan.full, false);
  assert.equal(plan.pwa, false);
  assert.deepEqual([...new Set(selected.map(([file]) => file))].sort(), [
    'vinted-listing-edge-cases.spec.ts',
    'vinted-workspace-ui.spec.ts',
  ]);
  assert.ok(selected.length > 0 && selected.length < 29);
  assert.ok(selected.some(([, title]) => title.includes('Großansicht behält den Tastaturfokus')));
  assert.ok(selected.some(([, title]) => title.includes('Bildfehlerrahmen')));
  assert.ok(selected.some(([, title]) => title.includes('390px dark')));
  assert.ok(selected.some(([, title]) => title.includes('1440px light')));
  assert.ok(
    !selected.some(([, title]) => /Vinted-Mosaik und Zeit-Badges bei (320|834)px/u.test(title)),
  );
});

test('Einkaufsübersicht prüft gezielt Telefon und Desktop in beiden Farbschemata', async () => {
  const { selected, plan } = await listPlan([
    'src/app/features/purchases/purchases.component.html',
  ]);
  assert.equal(plan.full, false);
  assert.equal(plan.pwa, false);
  assert.equal(selected.length, 4);
  assert.ok(
    selected.every(
      ([file, title]) => file === 'purchase-profitability.spec.ts' && /(?:390|1440)px/u.test(title),
    ),
  );
  assert.deepEqual(plan.coreBrowserFiles, []);
});

test('Marktplatzänderung erhält Ausfälle, Kontotrennung, Produktgrenzen und passende Varianten', async () => {
  const { selected, plan } = await listPlan([
    'src/app/features/marketplaces/components/marketplace-overview/marketplace-overview.component.html',
  ]);
  assert.equal(plan.full, false);
  assert.equal(plan.pwa, false);
  assert.ok(selected.length > 0 && selected.length < 33);
  assert.ok(
    selected.every(([file]) =>
      ['marketplace-overview.spec.ts', 'kleinanzeigen-accounts.spec.ts'].includes(file),
    ),
  );
  for (const title of [
    'Ein Vinted-Ausfall',
    'Sichtbarkeit bleibt nach Neuladen',
    'Fehlende Vinted-Freigabe',
    'Desktop- und Touch-Buttons',
  ])
    assert.ok(
      selected.some(([, actual]) => actual.includes(title)),
      title,
    );
});

test('globale und unbekannte Änderungen wählen Kern und breite Layoutvarianten einschließlich Touch', async () => {
  for (const paths of [['package-lock.json'], ['unknown/config.json']]) {
    const { selected, plan } = await listPlan(paths);
    assert.equal(plan.full, true);
    assert.equal(plan.pwa, true);
    assert.ok(selected.length > coreBrowserTests.length && selected.length < 250);
    assert.ok(selected.some(([, title]) => title.includes('bei 320px per Touch')));
    assert.ok(selected.some(([, title]) => title.includes('bei 768px per Touch')));
    assert.ok(selected.some(([, title]) => title.includes('iPad desktop mode')));
    assert.ok(selected.some(([, title]) => title.includes('WCAG AA')));
    assert.equal(new Set(keys(selected)).size, selected.length);
  }
});

test('Dokumentation erzeugt keinen scheinbar erfolgreichen leeren Browserjob', () => {
  const plan = selectAffectedTests(['docs/testing/example.md'], sources);
  assert.deepEqual(buildBrowserMatrix(plan), []);
  assert.equal(plan.pwa, false);
});

test('direkt geänderte unmarkierte Browserdatei läuft vollständig', async () => {
  const { selected } = await listPlan(['e2e/date-picker-layer.spec.ts']);
  const complete = await listTests('playwright.config.ts', ['date-picker-layer.spec.ts']);
  assert.deepEqual(keys(selected), keys(complete.selected));
  assert.ok(selected.some(([, title]) => !/@(?:pr|core)-smoke/u.test(title)));
});

test('direkt geänderte Galerie hebt die Variantenreduktion vollständig auf', async () => {
  const { selected } = await listPlan(['e2e/vinted-listing-edge-cases.spec.ts']);
  const complete = await listTests('playwright.config.ts', ['vinted-listing-edge-cases.spec.ts']);
  assert.deepEqual(keys(selected), keys(complete.selected));
  assert.equal(selected.length, 23);
});

test('gelöschte und umbenannte Browserdateien führen zu einer konservativen echten Auswahl', async () => {
  for (const paths of [
    ['e2e/deleted-calendar.spec.ts'],
    ['e2e/old-calendar.spec.ts', 'e2e/date-picker-layer.spec.ts'],
  ]) {
    const { selected, plan } = await listPlan(paths);
    assert.equal(plan.full, true);
    assert.ok(selected.length >= coreBrowserTests.length);
    assert.ok(
      selected.every(
        ([file]) => !file.includes('deleted-calendar') && !file.includes('old-calendar'),
      ),
    );
    if (paths.length === 2)
      assert.ok(selected.some(([file]) => file === 'date-picker-layer.spec.ts'));
  }
});

test('jede echte Browsermatrixgruppe enthält Fälle und zusammen jede Auswahl genau einmal', async () => {
  const paths = [
    'src/styles.scss',
    'e2e/responsive-admin-layout.spec.ts',
    'e2e/vinted-kleinanzeigen-transfer.spec.ts',
  ];
  const { plan, selected: complete } = await listPlan(paths);
  const grouped = [];
  for (const { project, shard } of buildBrowserMatrix(plan)) {
    const { selected } = await listPlan(paths, ['--project=' + project, '--shard=' + shard]);
    assert.ok(selected.length > 0, project + ' ' + shard);
    grouped.push(...selected);
  }
  assert.equal(new Set(keys(grouped)).size, grouped.length);
  assert.deepEqual(keys(grouped), keys(complete));
});

test('bestehende vollständige Browserregression bleibt mit allen bisherigen Markierungen verfügbar', async () => {
  const complete = await listTests('playwright.config.ts');
  const marked = await listTests('playwright.nightly.config.ts');
  assert.ok(marked.selected.length >= 250);
  const actual = new Set(keys(complete.selected));
  for (const entry of marked.selected) assert.ok(actual.has(JSON.stringify(entry)));
  for (const [file, title] of coreBrowserTests)
    assert.ok(
      complete.selected.some(
        ([actualFile, actualTitle]) => actualFile === file && actualTitle.endsWith(title),
      ),
    );
});

test('normale Browserkonfigurationen behalten die gesonderte Produktions-PWA-Grenze', async () => {
  for (const config of ['playwright.pr.config.ts', 'playwright.nightly.config.ts']) {
    const { selected } = await listTests(config, ['--grep=.*']);
    assert.ok(selected.length > 0);
    assert.ok(
      selected.every(
        ([file]) =>
          !/^pwa-(?:production|purchase-drafts|purchase-buffer-documents|push-navigation)\.spec\.ts$/u.test(
            file,
          ),
      ),
    );
  }
});

test('CI prüft MV3-Wiederaufnahme und Veröffentlichung einmal im eigenen Extension-Job', async () => {
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const browserJob = ci.split('  browser-smoke:')[1]?.split('  extension:')[0] ?? '';
  const extensionJob = ci.split('  extension:')[1]?.split('  worker-browser:')[0] ?? '';
  const install = extensionJob.indexOf('run: npx playwright install --with-deps chromium');
  const run = extensionJob.indexOf('run: node scripts/run-marketplace-checks.mjs extension');
  assert.ok(
    install >= 0 && run > install,
    'Extension benötigt vor ihren beiden Prüfungen den vollständigen Chromium.',
  );
  assert.ok(!browserJob.includes('run-marketplace-checks.mjs extension'));
  assert.ok(extensionJob.includes("needs.changes.outputs.extension_required == 'true'"));
  const { marketplaceCheckCommands } = await import('./run-marketplace-checks.mjs');
  assert.deepEqual(
    marketplaceCheckCommands('extension', { extensionRequired: true, workerBrowserTests: [] }),
    [
      ['scripts/kleinanzeigen-extension-browser.mjs'],
      ['scripts/kleinanzeigen-publication-browser.mjs'],
    ],
  );
});

test('CI verlangt alle Browsermatrixjobs innerhalb der bisherigen Schutzgrenzen', async () => {
  const { readFile } = await import('node:fs/promises');
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const browserJob = ci.split('  browser-smoke:')[1]?.split('  pwa:')[0] ?? '';
  assert.match(browserJob, /fail-fast: false/);
  assert.ok(browserJob.includes('matrix: ${{ fromJSON(needs.changes.outputs.browser_matrix) }}'));
  assert.ok(browserJob.includes('AFFECTED_BROWSER_PROJECT: ${{ matrix.project }}'));
  assert.ok(browserJob.includes('browser --shard=${{ matrix.shard }}'));
  assert.match(browserJob, /timeout-minutes: 30/);
  assert.ok(
    browserJob.includes(
      'name: browser-smoke-failure-${{ matrix.project }}-${{ strategy.job-index }}',
    ),
  );
  const required = ci.split('  required-checks:')[1]?.split('  deploy:')[0] ?? '';
  assert.ok(required.includes('browser-smoke'));
  assert.ok(required.includes('BROWSER_RESULT: ${{ needs.browser-smoke.result }}'));
});

test('globale Zusatzänderung erhält sämtliche zugeordneten Bank- und Settingsfälle genau einmal', async () => {
  for (const path of [
    'src/app/features/accounting/components/bank-assignment-dialog/bank-assignment-dialog.component.html',
    'src/app/features/settings/pages/app-settings/app-settings.component.html',
  ]) {
    const targeted = await listPlan([path]);
    const broad = await listPlan([path, 'package-lock.json']);
    const actual = keys(broad.selected);
    for (const entry of keys(targeted.selected))
      assert.equal(
        actual.filter((key) => key === entry).length,
        1,
        'Verlorener oder doppelter Fachfall: ' + entry,
      );
    if (path.includes('bank-assignment')) {
      for (const title of [
        'ordnet Einnahmen und Ausgänge zu, erlaubt Änderungen und bucht erst getrennt',
        'behält die Auswahl bei Speicherfehlern und bietet Laden erneut an',
      ]) {
        const bankCases = targeted.selected.filter(([, actualTitle]) =>
          actualTitle.includes(title),
        );
        assert.ok(bankCases.length > 0, title);
        assert.ok(
          bankCases.every(
            ([, actualTitle]) => !/@(?:pr|core)-smoke|@pwa-layout/u.test(actualTitle),
          ),
        );
      }
    } else {
      assert.ok(targeted.selected.some(([, title]) => title.includes('Apple-Controlrollen')));
    }
    assert.equal(new Set(actual).size, actual.length);
  }
});

test('unbekannter gemeinsamer Pfad bleibt neben unabhängigen Feature-/Browseränderungen umfassend', async () => {
  for (const unrelated of [
    'src/app/features/purchases/purchases.component.html',
    'e2e/date-picker-layer.spec.ts',
    'src/app/shared/components/product-gallery/product-gallery.component.html',
  ]) {
    const { selected, plan } = await listPlan(['src/app/shared/unknown-control.ts', unrelated]);
    assert.equal(plan.full, true);
    assert.equal(plan.pwa, true);
    assert.ok(selected.some(([file]) => file === 'login.spec.ts'));
    assert.ok(selected.some(([, title]) => title.includes('bei 320px per Touch')));
  }
});

test('Kernüberschneidung erzeugt keine leeren Fachprojekte oder Teilgruppen', async () => {
  const sourcesWithAudit = {
    ...sources,
    'src/app/features/audit/new-boundary.ts': 'export const boundary = true;',
  };
  for (const paths of [
    ['package-lock.json', 'src/app/features/audit/new-boundary.ts'],
    [
      'package-lock.json',
      'src/app/features/audit/new-boundary.ts',
      'src/app/features/purchases/purchases.component.html',
    ],
  ]) {
    const complete = await listPlan(paths, [], sourcesWithAudit);
    const grouped = [];
    for (const { project, shard } of buildBrowserMatrix(complete.plan)) {
      const { selected } = await listPlan(
        paths,
        ['--project=' + project, '--shard=' + shard],
        sourcesWithAudit,
      );
      assert.ok(selected.length > 0, project + ' ' + shard);
      grouped.push(...selected);
    }
    assert.equal(new Set(keys(grouped)).size, grouped.length);
    assert.deepEqual(keys(grouped), keys(complete.selected));
    assert.equal(grouped.filter(([file]) => file === 'company-documents.spec.ts').length, 1);
    assert.ok(!complete.plan.coreBrowserFiles.includes('e2e/company-documents.spec.ts'));
  }
});
