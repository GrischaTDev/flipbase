import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectAffectedTests, buildUnitMatrix, buildBrowserMatrix } from './affected-tests.mjs';

const files = {
  'src/app/shared/components/product-gallery/product-gallery.component.ts': `@Component({templateUrl: './product-gallery.component.html'}) export class Gallery {}`,
  'src/app/shared/components/product-gallery/product-gallery.component.html':
    '<button>Foto</button>',
  'src/app/features/marketplaces/components/vinted-listing-detail/detail.ts': `import { Gallery } from '../../../../shared/components/product-gallery/product-gallery.component';`,
  'src/app/features/marketplaces/components/vinted-listing-detail/detail.angular.spec.ts': `import './detail';`,
  'src/app/features/purchases/purchases.ts': 'export const purchase = 1;',
  'src/app/features/purchases/purchases.spec.ts': `import './purchases';`,
  'e2e/vinted-listing-edge-cases.spec.ts': '',
  'e2e/purchase-profitability.spec.ts': '',
};

test('Profiländerung wählt die Profilbearbeitung ohne Artikel- oder Verkaufsabläufe', () => {
  const profilePath =
    'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts';
  const plan = selectAffectedTests([profilePath], {
    ...files,
    [profilePath]: 'export class Editor {}',
    'e2e/vinted-profile.spec.ts': 'test()',
  });
  assert.equal(plan.full, false);
  assert.deepEqual(plan.browserFiles, ['e2e/vinted-profile.spec.ts']);
});

test('Galerievorlage wählt abhängige Artikeltests statt Einkauf und PWA', () => {
  const plan = selectAffectedTests(
    ['src/app/shared/components/product-gallery/product-gallery.component.html'],
    files,
  );
  assert.equal(plan.full, false);
  assert.deepEqual(plan.units.angular, [
    'src/app/features/marketplaces/components/vinted-listing-detail/detail.angular.spec.ts',
  ]);
  assert.deepEqual(plan.units.node, []);
  assert.deepEqual(plan.browserFiles, ['e2e/vinted-listing-edge-cases.spec.ts']);
  assert.equal(plan.pwa, false);
});

test('mehrere Änderungen bilden die Vereinigung der betroffenen Funktionen', () => {
  const plan = selectAffectedTests(
    [
      'src/app/features/purchases/purchases.ts',
      'src/app/shared/components/product-gallery/product-gallery.component.html',
    ],
    files,
  );
  assert.deepEqual(plan.units.node, ['src/app/features/purchases/purchases.spec.ts']);
  assert.deepEqual(plan.browserFiles, [
    'e2e/purchase-profitability.spec.ts',
    'e2e/vinted-listing-edge-cases.spec.ts',
  ]);
});

test('gemeinsame Abhängigkeiten wählen auch fachübergreifende Nutzer aus', () => {
  const sources = {
    ...files,
    'src/app/core/models/value.ts': 'export const value = 1;',
    'src/app/features/purchases/purchases.ts': `import '../../core/models/value';`,
    'src/app/features/marketplaces/components/vinted-listing-detail/detail.ts': `import '../../../../core/models/value';`,
  };
  const plan = selectAffectedTests(['src/app/core/models/value.ts'], sources);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.browserFiles, [
    'e2e/purchase-profitability.spec.ts',
    'e2e/vinted-listing-edge-cases.spec.ts',
  ]);
});

test('gelöschte Importe bleiben als Abhängigkeiten sichtbar', () => {
  const plan = selectAffectedTests(['src/app/features/purchases/purchases.ts'], {
    ...files,
    'src/app/features/purchases/purchases.ts': undefined,
  });
  assert.deepEqual(plan.units.node, ['src/app/features/purchases/purchases.spec.ts']);
});

test('Dokumentation und eigenständiger Worker starten keine Anwendungstests', () => {
  for (const paths of [
    ['AGENTS.md', 'docs/test-selection.md'],
    ['services/marketplace-worker/src/vinted-account-import.ts'],
  ]) {
    const plan = selectAffectedTests(paths, files);
    assert.equal(plan.full, false);
    assert.deepEqual(plan.browserFiles, []);
    assert.deepEqual(plan.units.angular, []);
    assert.equal(plan.pwa, false);
  }
});

test('bekannte Landingpage startet ihre Vertragsprüfung ohne Anwendungs- oder Browserlauf', () => {
  const plan = selectAffectedTests(['landing/index.html'], files);
  assert.equal(plan.full, false);
  assert.equal(plan.checks.landing, true);
  assert.deepEqual(plan.browserFiles, []);
  assert.deepEqual(plan.units.node, []);
  assert.equal(plan.pwa, false);
});

test('eigenständiger Push-Worker prüft ausschließlich seinen Dienst', () => {
  const plan = selectAffectedTests(['services/push-worker/src/main.ts'], files);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.checks, { marketplace: false, push: true, landing: false });
  assert.deepEqual(plan.browserFiles, []);
  assert.deepEqual(plan.units.node, []);
  assert.equal(plan.pwa, false);
});

test('Einkaufsübersicht wählt keine eigenständige Artikelanlage aus', () => {
  const plan = selectAffectedTests(['src/app/features/purchases/purchases.component.html'], {
    ...files,
    'src/app/features/purchases/purchases.component.html': '<table></table>',
    'e2e/purchase-entry.spec.ts': '',
  });
  assert.deepEqual(plan.browserFiles, ['e2e/purchase-profitability.spec.ts']);
});

test('PWA-Änderungen wählen die Produktionsprüfung aus', () => {
  const plan = selectAffectedTests(['public/sw.js'], files);
  assert.equal(plan.pwa, true);
});

test('globale Browservorbereitung und zentraler Appstart behalten einen umfassenden Lauf', () => {
  for (const file of ['e2e/global-setup.ts', 'src/app/core/services/app-startup.service.ts']) {
    const plan = selectAffectedTests([file], files);
    assert.equal(plan.full, true, file);
    assert.equal(plan.pwa, true, file);
    assert.ok(plan.browserFiles.length > 0);
  }
});

test('globale Provider und Testvorbereitung werden indirekt erkannt, Lazy-Routen bleiben begrenzt', () => {
  const sources = {
    ...files,
    'src/app/app.config.ts': `import './core/errors/app-error-handler'; import './app.routes';`,
    'src/app/core/errors/app-error-handler.ts': `import '../services/stale-chunk-recovery.service';`,
    'src/app/core/services/stale-chunk-recovery.service.ts': 'export const recover = true;',
    'src/app/app.routes.ts': `const load = () => import('./features/purchases/purchases');`,
    'e2e/global-setup.ts': `import './support/test-account';`,
    'e2e/support/test-account.ts': 'export const account = true;',
  };
  for (const path of [
    'src/app/core/errors/app-error-handler.ts',
    'src/app/core/services/stale-chunk-recovery.service.ts',
    'e2e/support/test-account.ts',
  ])
    assert.equal(selectAffectedTests([path], sources).full, true, path);
  assert.equal(
    selectAffectedTests(['src/app/features/purchases/purchases.ts'], sources).full,
    false,
  );
});

test('gemeinsame Hilfsdatei einer Produktions-PWA-Prüfung wählt PWA aus', () => {
  const plan = selectAffectedTests(['e2e/support/offline-fixture.ts'], {
    ...files,
    'e2e/support/offline-fixture.ts': 'export const ready = true;',
    'e2e/pwa-production.spec.ts': `import './support/offline-fixture';`,
  });
  assert.equal(plan.pwa, true);
});

test('unbekannte Änderungen, globale Konfiguration und fehlender Diff wählen umfassend', () => {
  for (const paths of [
    null,
    ['package-lock.json'],
    ['.github/workflows/ci.yml'],
    ['src/app/core/guards/auth.guard.ts'],
    ['unknown/config.json'],
  ]) {
    const plan = selectAffectedTests(paths, files);
    assert.equal(plan.full, true, JSON.stringify(paths));
    assert.equal(plan.pwa, true);
    assert.deepEqual(plan.units.node, ['src/app/features/purchases/purchases.spec.ts']);
  }
});

test('direkt geänderte Browserfälle werden auch ohne Kernmarkierung ausgewählt', () => {
  const plan = selectAffectedTests(['e2e/purchase-profitability.spec.ts'], files);
  assert.deepEqual(plan.changedBrowserFiles, ['e2e/purchase-profitability.spec.ts']);
  assert.deepEqual(plan.browserFiles, []);
});

test('Templates, JS-Importpfade, Reexports und zyklische Importe werden verfolgt', () => {
  const sources = {
    ...files,
    'src/app/features/purchases/purchases.ts': `export * from './bridge.js';`,
    'src/app/features/purchases/bridge.ts': `import './purchases'; export * from './amount';`,
    'src/app/features/purchases/amount.ts': 'export const amount = 2;',
  };
  const plan = selectAffectedTests(['src/app/features/purchases/amount.ts'], sources);
  assert.deepEqual(plan.units.node, ['src/app/features/purchases/purchases.spec.ts']);
});

test('fehlender Plan, leere Auswahl und fehlende Testdatei werden nie als Erfolg gemeldet', () => {
  const runner = fileURLToPath(new URL('./run-affected-tests.mjs', import.meta.url));
  for (const plan of [
    null,
    { full: false, units: { node: [] }, browserFiles: [], changedBrowserFiles: [] },
    {
      full: false,
      units: { node: ['src/missing-affected-test.spec.ts'] },
      browserFiles: [],
      changedBrowserFiles: [],
    },
  ]) {
    const result = spawnSync(process.execPath, [runner, 'unit', 'node', '1/1'], {
      encoding: 'utf8',
      env: { ...process.env, AFFECTED_TEST_PLAN: JSON.stringify(plan) },
    });
    assert.notEqual(result.status, 0, result.stdout);
  }
});

test('Marktplatzübersicht und ihre Auswahl wählen die eigenen Browserfälle', () => {
  const paths = [
    'src/app/features/marketplaces/components/marketplace-overview/marketplace-overview.component.html',
    'src/app/features/marketplaces/components/marketplace-listing-section/marketplace-listing-section.component.html',
    'src/app/features/marketplaces/services/marketplace-overview.store.ts',
    'src/app/features/marketplaces/models/marketplace-listing-selection.ts',
  ];
  for (const path of paths) {
    const plan = selectAffectedTests([path], {
      ...files,
      [path]: '',
      'e2e/marketplace-overview.spec.ts': '',
      'e2e/kleinanzeigen-accounts.spec.ts': '',
    });
    assert.equal(plan.full, false, path);
    assert.deepEqual(
      plan.browserFiles,
      ['e2e/kleinanzeigen-accounts.spec.ts', 'e2e/marketplace-overview.spec.ts'],
      path,
    );
    assert.equal(plan.pwa, false, path);
  }
});

test('Kleinanzeigen-Konten wählen eigene Konten- und Übersichtsabläufe', () => {
  const path = 'src/app/features/marketplaces/services/kleinanzeigen-account.service.ts';
  const plan = selectAffectedTests([path], {
    ...files,
    [path]: '',
    'e2e/kleinanzeigen-accounts.spec.ts': '',
    'e2e/marketplace-overview.spec.ts': '',
  });
  assert.equal(plan.full, false);
  assert.deepEqual(plan.browserFiles, [
    'e2e/kleinanzeigen-accounts.spec.ts',
    'e2e/marketplace-overview.spec.ts',
  ]);
});

test('Kleinanzeigen-Erweiterungsänderungen wählen den Transferablauf und seine Kontenprüfung', () => {
  const path = 'tools/flipbase-extension/kleinanzeigen-publication-jobs.js';
  const plan = selectAffectedTests([path], {
    ...files,
    [path]: '',
    'e2e/kleinanzeigen-accounts.spec.ts': '',
    'e2e/vinted-kleinanzeigen-transfer.spec.ts': '',
  });
  assert.deepEqual(plan.browserFiles, [
    'e2e/kleinanzeigen-accounts.spec.ts',
    'e2e/vinted-kleinanzeigen-transfer.spec.ts',
  ]);
  assert.equal(plan.checks.marketplace, true);
});

function runBrowserGroups(
  plan,
  failProject = '',
  browserArgs = ['--list'],
  failShard = '',
  project = '',
) {
  const directory = mkdtempSync(join(tmpdir(), 'flipbase-browser-groups-'));
  try {
    const cliDirectory = join(directory, 'node_modules', '@playwright', 'test');
    mkdirSync(cliDirectory, { recursive: true });
    const logPath = join(directory, 'invocations.jsonl');
    writeFileSync(
      join(cliDirectory, 'cli.js'),
      `
      const { appendFileSync } = require('node:fs');
      const args = process.argv.slice(2);
      const project = args.find((arg) => arg.startsWith('--project='))?.slice(10);
      appendFileSync(process.env.BROWSER_GROUP_LOG, JSON.stringify({ project, args }) + '\\n');
      // Ein gemeinsamer Aufruf bildet die abgelaufene Anmeldung der zweiten Gruppe nach.
      const fail = project === process.env.BROWSER_FAIL_PROJECT && (!process.env.BROWSER_FAIL_SHARD || args.includes('--shard=' + process.env.BROWSER_FAIL_SHARD));
      process.exit(!project ? 86 : fail ? 7 : 0);
    `,
    );
    const runner = fileURLToPath(new URL('./run-affected-tests.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [runner, 'browser', ...browserArgs], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        AFFECTED_TEST_PLAN: JSON.stringify(plan),
        BROWSER_GROUP_LOG: logPath,
        BROWSER_FAIL_PROJECT: failProject,
        BROWSER_FAIL_SHARD: failShard,
        AFFECTED_BROWSER_PROJECT: project,
      },
    });
    const invocations = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    return { result, invocations };
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('flipbase-browser-groups-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

const twoBrowserGroups = {
  full: true,
  units: {},
  browserFiles: ['e2e/core-smoke.spec.ts'],
  changedBrowserFiles: ['e2e/admin-layout.spec.ts'],
};

test('jede Browsergruppe startet getrennt mit eigener Playwright-Vorbereitung', () => {
  const { result, invocations } = runBrowserGroups(twoBrowserGroups);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    invocations.map(({ project }) => project),
    ['chromium', 'changed-tests'],
  );
  assert.ok(invocations.every(({ args }) => args.includes('--list')));
  assert.ok(
    invocations.every(({ args }) => args.includes('--config=playwright.affected.config.ts')),
  );
});

test('ein fehlgeschlagener Browserlauf stoppt vor der nächsten Gruppe', () => {
  const { result, invocations } = runBrowserGroups(twoBrowserGroups, 'chromium');
  assert.equal(result.status, 7);
  assert.deepEqual(
    invocations.map(({ project }) => project),
    ['chromium'],
  );
});

test('auch die zweite Browsergruppe muss erfolgreich sein', () => {
  const { result, invocations } = runBrowserGroups(twoBrowserGroups, 'changed-tests');
  assert.equal(result.status, 7);
  assert.equal(invocations.length, 2);
});

test('die umfassende Browserauswahl erhält drei getrennte frische Sitzungen', () => {
  const { result, invocations } = runBrowserGroups(twoBrowserGroups, '', []);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    invocations.map(({ project, args }) => [
      project,
      args.find((arg) => arg.startsWith('--shard=')) ?? null,
    ]),
    [
      ['chromium', '--shard=1/3'],
      ['chromium', '--shard=2/3'],
      ['chromium', '--shard=3/3'],
      ['changed-tests', null],
    ],
  );
});

test('ein Fehler in der zweiten Teilgruppe stoppt vor weiteren Browserfällen', () => {
  const { result, invocations } = runBrowserGroups(twoBrowserGroups, 'chromium', [], '2/3');
  assert.equal(result.status, 7);
  assert.equal(invocations.length, 2);
});

test('gezielte Browserläufe bleiben ohne zusätzliche Teilgruppen', () => {
  const { result, invocations } = runBrowserGroups({ ...twoBrowserGroups, full: false }, '', []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(invocations.length, 2);
  assert.ok(invocations.every(({ args }) => !args.some((arg) => arg.startsWith('--shard='))));
});

for (const project of ['chromium', 'changed-tests']) {
  test(`eine einzelne Browsergruppe ${project} wird genau einmal ausgeführt`, () => {
    const plan = {
      ...twoBrowserGroups,
      browserFiles: project === 'chromium' ? twoBrowserGroups.browserFiles : [],
      changedBrowserFiles: project === 'changed-tests' ? twoBrowserGroups.changedBrowserFiles : [],
    };
    const { result, invocations } = runBrowserGroups(plan);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      invocations.map(({ project: actual }) => actual),
      [project],
    );
  });
}

test('Finanzseiten wählen die vorhandenen Browserfälle für gemeinsame Controls', () => {
  for (const feature of ['accounting', 'analytics', 'expenses', 'fulfillment']) {
    const source = 'src/app/features/' + feature + '/' + feature + '.component.html';
    const plan = selectAffectedTests([source], {
      [source]: '<app-card />',
      'e2e/responsive-admin-layout.spec.ts': '',
    });
    assert.equal(plan.full, false);
    assert.ok(plan.browserFiles.includes('e2e/responsive-admin-layout.spec.ts'), feature);
    assert.equal(plan.pwa, false);
  }
});

test('Bankzuordnung wählt ihre Modelle, Dienste und den bestehenden Finanz-Browserfall', () => {
  const root = 'src/app/features/accounting/';
  const model = root + 'models/bank-assignment.models';
  const service = root + 'services/bank-assignment.service';
  const dialog = root + 'components/bank-assignment-dialog/bank-assignment-dialog.component';
  const bank = 'src/app/core/services/bank-reconciliation.service';
  const sources = {
    [model + '.ts']: 'export const target = 1;',
    [model + '.spec.ts']: "import './bank-assignment.models';",
    [service + '.ts']:
      "import '../models/bank-assignment.models'; import '../../../core/services/bank-reconciliation.service';",
    [service + '.spec.ts']: "import './bank-assignment.service';",
    [dialog + '.ts']:
      "@Component({templateUrl: './bank-assignment-dialog.component.html'}) import '../../services/bank-assignment.service';",
    [dialog + '.html']: '<app-custom-select />',
    [bank + '.ts']: 'export class BankReconciliationService {}',
    [bank + '.spec.ts']: "import './bank-reconciliation.service';",
    'e2e/responsive-admin-layout.spec.ts': '',
  };
  for (const changed of [model + '.ts', service + '.ts', dialog + '.html', bank + '.ts']) {
    const plan = selectAffectedTests([changed], sources);
    assert.equal(plan.full, false, changed);
    assert.ok(plan.browserFiles.includes('e2e/responsive-admin-layout.spec.ts'), changed);
    assert.equal(plan.pwa, false, changed);
    if (changed === model + '.ts') {
      assert.ok(plan.units.node.includes(model + '.spec.ts'));
      assert.ok(plan.units.node.includes(service + '.spec.ts'));
    }
    if (changed === bank + '.ts') {
      assert.ok(plan.units.node.includes(bank + '.spec.ts'));
      assert.ok(plan.units.node.includes(service + '.spec.ts'));
    }
  }
});

test('vollständige Angular-Matrix verteilt alle Dateien auf ausreichend kleine Jobs', () => {
  for (const [count, groups] of [
    [1, 1],
    [60, 1],
    [61, 2],
    [100, 2],
    [101, 2],
    [260, 5],
    [273, 5],
  ]) {
    const plan = {
      full: true,
      units: {
        node: ['a.spec.ts'],
        dom: [],
        angular: Array.from({ length: count }, (_, i) => 'case-' + i + '.angular.spec.ts'),
      },
    };
    const matrix = buildUnitMatrix(plan);
    assert.deepEqual(matrix, [
      { suite: 'node', shard: '1/1' },
      ...Array.from({ length: groups }, (_, i) => ({
        suite: 'angular',
        shard: i + 1 + '/' + groups,
      })),
    ]);
  }
  assert.deepEqual(
    buildUnitMatrix({
      full: false,
      units: { node: [], dom: [], angular: Array(260).fill('case.angular.spec.ts') },
    }),
    [{ suite: 'angular', shard: '1/1' }],
  );
  assert.deepEqual(buildUnitMatrix({ full: true, units: { node: [], dom: [], angular: [] } }), []);
});

test('die Browsermatrix enthält jeden gewählten Bereich und jede Teilgruppe genau einmal', () => {
  for (const full of [false, true]) {
    for (const normal of [false, true]) {
      for (const changed of [false, true]) {
        const plan = {
          ...twoBrowserGroups,
          full,
          browserFiles: normal ? twoBrowserGroups.browserFiles : [],
          changedBrowserFiles: changed ? twoBrowserGroups.changedBrowserFiles : [],
        };
        const groups = 1;
        const expected = [normal ? 'chromium' : null, changed ? 'changed-tests' : null]
          .filter(Boolean)
          .flatMap((project) =>
            Array.from({ length: groups }, (_, index) => ({
              project,
              shard: String(index + 1) + '/' + String(groups),
            })),
          );
        assert.deepEqual(buildBrowserMatrix(plan), expected);
      }
    }
  }
});

test('ein Browsermatrixjob führt ausschließlich seine gewählte Teilgruppe aus', () => {
  for (const { project, shard } of buildBrowserMatrix(twoBrowserGroups)) {
    const { result, invocations } = runBrowserGroups(
      twoBrowserGroups,
      '',
      ['--shard=' + shard],
      '',
      project,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].project, project);
    assert.ok(invocations[0].args.includes('--shard=' + shard));
  }
});

test('die Browsermatrix reicht einen Testfehler unverändert an die Pflichtfreigabe weiter', () => {
  const { result, invocations } = runBrowserGroups(
    twoBrowserGroups,
    'changed-tests',
    ['--shard=2/3'],
    '2/3',
    'changed-tests',
  );
  assert.equal(result.status, 7);
  assert.equal(invocations.length, 1);
});

test('eine nicht gewählte Browsermatrixgruppe kann nie erfolgreich sein', () => {
  for (const project of ['missing', 'changed-tests']) {
    const runner = fileURLToPath(new URL('./run-affected-tests.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [runner, 'browser', '--list'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AFFECTED_TEST_PLAN: JSON.stringify({ ...twoBrowserGroups, changedBrowserFiles: [] }),
        AFFECTED_BROWSER_PROJECT: project,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Nicht ausgewählte Browsergruppe/);
  }
});

test('wenige Browserdateien erzeugen keine leeren Teilgruppen', () => {
  for (const count of [1, 2, 3, 12]) {
    const plan = {
      ...twoBrowserGroups,
      browserFiles: [],
      changedBrowserFiles: Array(count).fill('e2e/example.spec.ts'),
    };
    const expected = Math.min(3, count);
    assert.deepEqual(
      buildBrowserMatrix(plan),
      Array.from({ length: expected }, (_, index) => ({
        project: 'changed-tests',
        shard: String(index + 1) + '/' + String(expected),
      })),
    );
  }
});

test('Vinted-Verkaufsansicht wählt nur die zugehörigen Browserfälle', () => {
  const path = 'src/app/features/marketplaces/components/vinted-sales/vinted-sales.component.html';
  const plan = selectAffectedTests([path], {
    [path]: '<section>Verkäufe</section>',
    'e2e/vinted-sales.spec.ts': 'test()',
    'e2e/vinted-workspace-ui.spec.ts': 'test()',
  });
  assert.equal(plan.full, false);
  assert.deepEqual(plan.browserFiles, ['e2e/vinted-sales.spec.ts']);
});

test('Vinted-Anbieterentwuerfe und Datenuebernahme waehlen ihre bestehenden Browserdateien', () => {
  for (const path of [
    'src/app/features/marketplaces/components/vinted-provider-drafts/vinted-provider-drafts.component.ts',
    'src/app/features/marketplaces/components/vinted-listing-copy-dialog/vinted-listing-copy-dialog.component.ts',
  ]) {
    const plan = selectAffectedTests([path], {
      [path]: 'export class Component {}',
      'e2e/vinted-listing-drafts.spec.ts': 'test()',
      'e2e/vinted-listing-edge-cases.spec.ts': 'test()',
      'e2e/vinted-workspace-ui.spec.ts': 'test()',
      'e2e/vinted-sales.spec.ts': 'test()',
    });
    assert.equal(plan.full, false);
    assert.deepEqual(plan.browserFiles, [
      'e2e/vinted-listing-drafts.spec.ts',
      'e2e/vinted-listing-edge-cases.spec.ts',
      'e2e/vinted-workspace-ui.spec.ts',
    ]);
  }
});

test('Aktionsübersicht wählt ihre Browsermatrix für Anzeige und persönliche Einstellung', () => {
  const overview =
    'src/app/features/marketplaces/components/vinted-action-overview/vinted-action-overview.component.ts';
  const preference = 'src/app/core/services/app-display-preferences.service.ts';
  const settings = 'src/app/features/settings/pages/app-settings/app-settings.component.ts';
  const browser = 'e2e/vinted-action-overview.spec.ts';
  const sources = {
    ...files,
    [overview]: 'export class Overview {}',
    [preference]: 'export class Preferences {}',
    [settings]: `import '../../../../core/services/app-display-preferences.service';`,
    [browser]: 'test()',
  };
  for (const changed of [overview, preference, settings]) {
    const plan = selectAffectedTests([changed], sources);
    assert.equal(plan.full, false);
    assert.ok(plan.browserFiles.includes(browser), changed);
  }
});
