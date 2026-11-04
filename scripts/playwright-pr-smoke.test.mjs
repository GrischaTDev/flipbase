import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readSelectionFiles, selectAffectedTests, buildBrowserMatrix } from './affected-tests.mjs';
import {
  coreBrowserTests,
  representativeBrowserFamilies,
  representativeBrowserGrepInvert,
  uiBrowserFiles,
} from './browser-test-selection.mjs';

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
      ...(['playwright.affected.config.ts', 'playwright.ui.config.ts'].includes(config)
        ? []
        : ['--project=chromium']),
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
  const selectedProject = selectionArguments
    .find((argument) => argument.startsWith('--project='))
    ?.slice('--project='.length);
  const projects = buildBrowserMatrix(plan)
    .map(({ project }) => project)
    .filter((project) => !selectedProject || project === selectedProject);
  const configs = [
    ...new Set(
      projects.map((project) =>
        ['ui', 'changed-ui', 'ui-layout'].includes(project)
          ? 'playwright.ui.config.ts'
          : 'playwright.affected.config.ts',
      ),
    ),
  ];
  const listed = await Promise.all(
    configs.map((config) =>
      listTests(config, selectionArguments, {
        AFFECTED_TEST_PLAN: JSON.stringify(plan),
      }),
    ),
  );
  return { selected: listed.flatMap(({ selected }) => selected), plan };
}

test('PR-Kern bleibt klein, eindeutig und bewahrt Traces ohne Wiederholungen', async () => {
  const { report, selected } = await listTests('playwright.pr.config.ts');
  assert.equal(selected.length, coreBrowserTests.length);
  assert.ok(selected.length > 0 && selected.length <= 10);
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
  const gallery = await listTests('playwright.config.ts', ['vinted-listing-edge-cases.spec.ts']);
  const workspace = await listTests('playwright.config.ts', ['vinted-workspace-ui.spec.ts']);
  assert.ok(
    selected.length > 0 && selected.length < gallery.selected.length + workspace.selected.length,
  );
  assert.ok(selected.some(([, title]) => title.includes('Großansicht behält den Tastaturfokus')));
  assert.ok(selected.some(([, title]) => title.includes('Bildfehlerrahmen')));
  assert.ok(selected.some(([, title]) => title.includes('390px dark')));
  assert.ok(selected.some(([, title]) => title.includes('1440px light')));
  assert.ok(
    !selected.some(([, title]) => /Vinted-Mosaik und Zeit-Badges bei (320|834)px/u.test(title)),
  );
});

test('Einkaufsübersicht prüft Telefon hell und Desktop dunkel statt der vollständigen Matrix', async () => {
  const { selected, plan } = await listPlan([
    'src/app/features/purchases/purchases.component.html',
  ]);
  assert.equal(plan.full, false);
  assert.equal(plan.pwa, false);
  assert.equal(selected.length, 2);
  assert.ok(
    selected.every(
      ([file, title]) => file === 'purchase-profitability.spec.ts' && /(?:390|1440)px/u.test(title),
    ),
  );
  assert.deepEqual(plan.coreBrowserFiles, []);
  assert.ok(selected.some(([, title]) => title.includes('390px im light-Theme')));
  assert.ok(selected.some(([, title]) => title.includes('1440px im dark-Theme')));
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

test('globale und unbekannte Änderungen wählen einen kleinen echten Integrationskern', async () => {
  for (const paths of [['package-lock.json'], ['unknown/config.json']]) {
    const { selected, plan } = await listPlan(paths);
    assert.equal(plan.full, true);
    assert.equal(selected.length, coreBrowserTests.length);
    assert.ok(selected.some(([file]) => file === 'login.spec.ts'));
    assert.ok(selected.some(([, title]) => title.includes('genau einmal')));
    assert.deepEqual(plan.layoutBrowserFiles, []);
    assert.equal(new Set(keys(selected)).size, selected.length);
  }
});

test('Dokumentation erzeugt keinen scheinbar erfolgreichen leeren Browserjob', () => {
  const plan = selectAffectedTests(['docs/testing/example.md'], sources);
  assert.deepEqual(buildBrowserMatrix(plan), []);
  assert.equal(plan.pwa, false);
});

test('UI-Fixtures benötigen keine Datenbank und erlauben keine echte Backend-Testdatei', async () => {
  const plan = selectAffectedTests(
    [
      'src/app/features/marketplaces/components/marketplace-overview/marketplace-overview.component.html',
    ],
    sources,
  );
  const matrix = buildBrowserMatrix(plan);
  assert.ok(matrix.length > 0);
  assert.ok(matrix.every(({ project, database }) => project === 'ui' && database === false));
  for (const file of uiBrowserFiles) {
    assert.match(sources[file], /storageState:\s*\{\s*cookies:\s*\[\],\s*origins:\s*\[\]/u, file);
    assert.doesNotMatch(
      sources[file],
      /from ['"].*(?:local-supabase|support\/fixtures)['"]/u,
      file,
    );
  }
  await assert.rejects(
    () =>
      listTests('playwright.ui.config.ts', [], {
        AFFECTED_TEST_PLAN: JSON.stringify({
          ...plan,
          uiBrowserFiles: ['e2e/login.spec.ts'],
          changedUiBrowserFiles: [],
        }),
      }),
    /Ungültige oder leere UI-Browserauswahl/u,
  );
});

test('Aktionsübersicht bleibt datenbankfrei und erhält Tabletwechsel und Speicherfehler', async () => {
  const path = 'e2e/vinted-action-overview.spec.ts';
  const { plan, selected } = await listPlan([path]);
  const complete = await listTests('playwright.config.ts', [path]);
  assert.deepEqual(plan.changedUiBrowserFiles, [path]);
  assert.deepEqual(buildBrowserMatrix(plan), [
    { project: 'changed-ui', shard: '1/1', database: false },
  ]);
  assert.equal(complete.selected.length, 17);
  assert.equal(selected.length, 10);
  for (const title of [
    'Aktionsübersicht 390px > öffnet nur laufende Aktionen am Header-Icon in dark',
    'Aktionsübersicht 1280px > öffnet nur laufende Aktionen am Header-Icon in light',
    'Workspace-Auswahl 1440px > speichert das Ausblenden',
    'Workspace-Auswahl 320px > speichert das Ausblenden',
    'behält den Entwurf bei Speicherfehler und speichert auf erneuten Klick',
    'bietet bei fehlgeschlagener erster Wiederherstellung nur erneutes Lesen an',
  ])
    assert.equal(selected.filter(([, actual]) => actual.includes(title)).length, 1, title);
});

test('gemeinsame Controls prüfen sechs echte Verbraucher ohne vollständige Seitenmatrix', async () => {
  const { selected, plan } = await listPlan([
    'src/app/shared/components/button/button.component.html',
  ]);
  assert.equal(plan.full, false);
  assert.equal(plan.pwa, false);
  assert.equal(selected.length, 6);
  assert.ok(
    buildBrowserMatrix(plan).every(
      ({ project, database }) => project === 'ui-layout' && database === false,
    ),
  );
  for (const title of ['390px', '1440px', '834px', 'Desktop light', 'Desktop dark'])
    assert.ok(
      selected.some(([, actualTitle]) => actualTitle.includes(title)),
      title,
    );
});

test('eigene ruhende UI-Vorschau startet weder Anwendungsserver noch echte Anmeldung', async () => {
  const plan = selectAffectedTests(['e2e/marketplace-overview.spec.ts'], sources);
  const environment = { AFFECTED_TEST_PLAN: JSON.stringify(plan) };
  const ordinary = await listTests('playwright.ui.config.ts', [], {
    ...environment,
    PLAYWRIGHT_BASE_URL: '',
  });
  assert.equal(ordinary.report.config.globalSetup, null);
  assert.match(ordinary.report.config.webServer.command, /npm start/u);
  const preview = await listTests('playwright.ui.config.ts', [], {
    ...environment,
    PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4307',
  });
  assert.equal(preview.report.config.globalSetup, null);
  assert.equal(preview.report.config.webServer, null);
  assert.deepEqual(keys(preview.selected), keys(ordinary.selected));
  const backend = await listTests('playwright.affected.config.ts', [], {
    AFFECTED_TEST_PLAN: JSON.stringify(selectAffectedTests(['e2e/login.spec.ts'], sources)),
  });
  assert.match(backend.report.config.globalSetup, /global-setup\.ts$/u);
});

test('direkt geänderte unmarkierte Browserdatei läuft vollständig', async () => {
  const { selected } = await listPlan(['e2e/date-picker-layer.spec.ts']);
  const complete = await listTests('playwright.config.ts', ['date-picker-layer.spec.ts']);
  assert.deepEqual(keys(selected), keys(complete.selected));
  assert.ok(selected.some(([, title]) => !/@(?:pr|core)-smoke/u.test(title)));
});

test('direkt geänderte Galerie reduziert 33 Varianten auf vierzehn unterschiedliche Nachweise', async () => {
  const { selected } = await listPlan(['e2e/vinted-listing-edge-cases.spec.ts']);
  const complete = await listTests('playwright.config.ts', ['vinted-listing-edge-cases.spec.ts']);
  assert.equal(complete.selected.length, 33);
  assert.equal(selected.length, 14);
  const completeKeys = new Set(keys(complete.selected));
  assert.ok(keys(selected).every((key) => completeKeys.has(key)));
  assert.ok(selected.some(([, title]) => title.includes('Großansicht behält den Tastaturfokus')));
  assert.ok(selected.some(([, title]) => title.includes('Bildfehlerrahmen')));
  for (const title of [
    'Bildbearbeitung liest bereits angezeigte private Originalfotos mit echtem Browsercache',
    'Unvollständigen Vinted-Entwurf direkt im Formular ergänzen bei 390px light',
    'Vinted-Mosaik und Zeit-Badges bei 390px dark',
    'Vinted-Mosaik und Zeit-Badges bei 1440px light',
    'Bekannte leere Beschreibung startet auch beim Wiederöffnen keinen Browserabruf',
    'Beschreibungen stammen beim Öffnen und Relisten aus dem gespeicherten Hintergrundstand',
    'Preis direkt ändern und nach einem Fehler erneut speichern bei 390px light',
    'Bestehendes Inserat vollständig bearbeiten und nur nach Vinted-Bestätigung übernehmen bei 1440px',
    'Relisten und Vorlage bewahren Originale und übernehmen vollständige Daten bei 1440px dark',
    'Inserat löschen wahrt Bestätigung und zeigt den Fortschritt bei 390px light',
    'Relist-Auftrag schließt das Modal und übernimmt Originale bis zur verzögerten Veröffentlichung',
  ])
    assert.equal(selected.filter(([, actual]) => actual.includes(title)).length, 1, title);
  for (const width of [390, 1440])
    assert.equal(
      selected.filter(([, title]) =>
        title.includes(`Bildfehlerrahmen und langen Titel bei ${width}px`),
      ).length,
      1,
    );
});

test('bekannte Variantenfamilien behalten jeden Risikofall und lassen unbekannte Titel ungekürzt', async () => {
  const paths = [...new Set(representativeBrowserFamilies.map(({ file }) => `e2e/${file}`))];
  const complete = await listTests('playwright.config.ts', paths);
  const { selected } = await listPlan(paths);
  const normalized = (title) => title.replaceAll(' > ', ' ');
  const isExcluded = ([file, title]) =>
    representativeBrowserGrepInvert.some((pattern) => pattern.test(`${file} ${normalized(title)}`));
  assert.deepEqual(keys(selected), keys(complete.selected.filter((entry) => !isExcluded(entry))));
  for (const { file, variants, representatives } of representativeBrowserFamilies) {
    assert.ok(representatives.length > 0 && representatives.length <= 2, file);
    assert.equal(new Set(variants).size, variants.length, file);
    for (const title of variants)
      assert.equal(
        complete.selected.filter(
          ([actualFile, actual]) => actualFile === file && normalized(actual).endsWith(title),
        ).length,
        1,
        `${file}: ${title}`,
      );
    for (const title of representatives) {
      assert.ok(variants.includes(title), title);
      assert.equal(
        selected.filter(
          ([actualFile, actual]) => actualFile === file && normalized(actual).endsWith(title),
        ).length,
        1,
        `${file}: ${title}`,
      );
    }
  }
  for (const [file, title] of [
    ['vinted-listing-edge-cases.spec.ts', 'Neuer Speicherfehler bleibt bei 320px dark erkennbar'],
    [
      'vinted-listing-edge-cases.spec.ts',
      'Vinted-Mosaik und Zeit-Badges bei 360px dark @marketplace-preview @core-smoke',
    ],
    [
      'vinted-listing-edge-cases.spec.ts',
      'Vinted-Mosaik und Zeit-Badges bei 320px light @marketplace-preview @core-smoke @ci-breakpoint',
    ],
    [
      'vinted-listing-edge-cases.spec.ts',
      'Neue Fehlerbeschreibung Vinted-Mosaik und Zeit-Badges bei 320px light @marketplace-preview @core-smoke',
    ],
    [
      'new-feature.spec.ts',
      'Kleinanzeigen-Konten bleiben bei 320px im dark-Theme bedienbar @core-smoke',
    ],
  ])
    assert.equal(isExcluded([file, title]), false, `${file}: ${title}`);
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

for (const { name, paths, full } of [
  {
    name: 'umfassende Änderungen',
    paths: [
      'src/styles.scss',
      'src/app/core/models/supabase.types.ts',
      'e2e/global-setup.ts',
      'e2e/responsive-admin-layout.spec.ts',
      'e2e/vinted-kleinanzeigen-transfer.spec.ts',
    ],
    full: true,
  },
  {
    name: 'gezielte Vinted-Runtime',
    paths: ['tools/flipbase-extension/vinted-listing-runtime.js'],
    full: false,
  },
])
  test(`jede echte Browsermatrixgruppe enthält Fälle und zusammen jede Auswahl genau einmal (${name})`, async () => {
    const { plan, selected: complete } = await listPlan(paths);
    assert.equal(plan.full, full);
    if (!full) {
      assert.ok(plan.browserFiles.length + (plan.uiBrowserFiles?.length ?? 0) > 0);
      assert.ok(complete.length > 0);
    }
    const grouped = [];
    for (const { project, shard } of buildBrowserMatrix(plan)) {
      const { selected } = await listPlan(paths, ['--project=' + project, '--shard=' + shard]);
      assert.ok(selected.length > 0, project + ' ' + shard);
      // Auch 219 gezielte Fachfälle überschritten in CI das 30-Minuten-Budget.
      // Beide Referenzpläne brauchen Reserve und müssen alle Fälle erhalten.
      if (['chromium', 'ui'].includes(project))
        assert.ok(selected.length <= 80, `${project} ${shard}: ${selected.length}`);
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
  assert.ok(browserJob.includes('if: ${{ matrix.database != false }}'));
  assert.ok(browserJob.includes('if: ${{ always() && matrix.database != false }}'));
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
    assert.ok(selected.some(([file]) => file === 'login.spec.ts'));
    assert.ok(selected.some(([, title]) => title.includes('genau einmal')));
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

test('Relist-Fix bleibt begrenzt und seine echten CI-Teilgruppen verlieren oder duplizieren keinen Fall', async () => {
  const feature = 'src/app/features/marketplaces/';
  const paths = [
    `${feature}models/marketplace-read.models.ts`,
    `${feature}models/vinted-listing-source.ts`,
    `${feature}services/vinted-listing-operation.store.ts`,
    `${feature}services/vinted-listing-original-photo.service.ts`,
    `${feature}components/vinted-listing-editor/vinted-listing-editor.component.ts`,
    `${feature}components/vinted-listings/vinted-listings.component.html`,
    `${feature}components/vinted-action-overview-menu/vinted-action-overview-menu.component.html`,
    'e2e/vinted-listing-edge-cases.spec.ts',
  ];
  const complete = await listPlan(paths);
  const matrix = buildBrowserMatrix(complete.plan);
  assert.deepEqual(matrix, [
    { project: 'ui', shard: '1/2', database: false },
    { project: 'ui', shard: '2/2', database: false },
    { project: 'changed-ui', shard: '1/1', database: false },
  ]);
  assert.ok(complete.selected.length > 0 && complete.selected.length <= 60);
  assert.deepEqual([...new Set(complete.selected.map(([file]) => file))].sort(), [
    'vinted-action-overview.spec.ts',
    'vinted-listing-drafts.spec.ts',
    'vinted-listing-edge-cases.spec.ts',
    'vinted-workspace-ui.spec.ts',
  ]);
  assert.ok(
    complete.selected.some(([, title]) =>
      title.includes('Relisten und Vorlage bewahren Originale'),
    ),
  );
  assert.ok(
    complete.selected.some(([, title]) =>
      title.includes('Serverfreigabe und unvollständige Angaben'),
    ),
  );
  const grouped = [];
  for (const { project, shard } of matrix) {
    const { selected } = await listPlan(paths, [`--project=${project}`, `--shard=${shard}`]);
    assert.ok(selected.length > 0, `${project} ${shard}`);
    grouped.push(...selected);
  }
  assert.equal(new Set(keys(grouped)).size, grouped.length);
  assert.deepEqual(keys(grouped), keys(complete.selected));
});
