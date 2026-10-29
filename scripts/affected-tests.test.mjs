import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  selectAffectedTests,
  buildUnitMatrix,
  buildBrowserMatrix,
  readSelectionFiles,
} from './affected-tests.mjs';

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
    assert.ok(plan.coreBrowserFiles.length > 0);
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

test('auch umfassende Browserläufe führen jede kleinere Projektgruppe nur einmal aus', () => {
  const { result, invocations } = runBrowserGroups(twoBrowserGroups, '', []);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    invocations.map(({ project }) => project),
    ['chromium', 'changed-tests'],
  );
  assert.ok(invocations.every(({ args }) => !args.some((arg) => arg.startsWith('--shard='))));
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

test('gezielte Fachauswahlen behalten kleine Jobs und teilen große Gruppen ohne leere Jobs', () => {
  for (const [count, shards] of [
    [0, []],
    [1, ['1/1']],
    [10, ['1/1']],
    [11, ['1/3', '2/3', '3/3']],
    [15, ['1/3', '2/3', '3/3']],
    [30, ['1/3', '2/3', '3/3']],
    [31, ['1/4', '2/4', '3/4', '4/4']],
  ]) {
    const plan = {
      ...twoBrowserGroups,
      full: false,
      browserFiles: Array.from({ length: count }, (_, index) => `e2e/feature-${index}.spec.ts`),
      changedBrowserFiles: [],
    };
    assert.deepEqual(
      buildBrowserMatrix(plan),
      shards.map((shard) => ({ project: 'chromium', shard })),
      `${count} Fachdateien`,
    );
  }
});

test('große Fachauswahlen erhalten die bestehenden Kern-, Layout- und Änderungsgruppen', () => {
  const files = (prefix) =>
    Array.from({ length: 15 }, (_, index) => `e2e/${prefix}-${index}.spec.ts`);
  for (const [full, layout, changed] of [
    [false, ['1/1'], ['1/1']],
    [true, ['1/2', '2/2'], ['1/3', '2/3', '3/3']],
  ]) {
    const plan = {
      ...twoBrowserGroups,
      full,
      coreBrowserFiles: files('core'),
      layoutBrowserFiles: files('layout'),
      browserFiles: files('feature'),
      changedBrowserFiles: files('changed'),
    };
    assert.deepEqual(buildBrowserMatrix(plan), [
      { project: 'core-smoke', shard: '1/1' },
      ...layout.map((shard) => ({ project: 'layout', shard })),
      ...['1/3', '2/3', '3/3'].map((shard) => ({ project: 'chromium', shard })),
      ...changed.map((shard) => ({ project: 'changed-tests', shard })),
    ]);
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

test('unbekannte gemeinsame Dateien und gelöschte Browserdateien bleiben konservativ', () => {
  for (const path of [
    'src/app/shared/new-control.ts',
    'src/app/core/new-boundary.ts',
    'e2e/removed.spec.ts',
  ]) {
    const plan = selectAffectedTests([path], files);
    assert.equal(plan.full, true, path);
    assert.ok(plan.coreBrowserFiles.length > 0, path);
    assert.equal(plan.pwa, true, path);
  }
});

test('Kern und Layout gehören nur zum umfassenden Plan und ersetzen keine direkt geänderte Datei', () => {
  const sources = {
    ...files,
    'e2e/admin-layout.spec.ts': '',
    'e2e/pwa-mobile-layout.spec.ts': '',
  };
  const targeted = selectAffectedTests(
    ['src/app/features/purchases/purchases.component.html'],
    sources,
  );
  assert.deepEqual(targeted.coreBrowserFiles, []);
  assert.deepEqual(targeted.layoutBrowserFiles, []);
  const global = selectAffectedTests(
    ['package-lock.json', 'e2e/pwa-mobile-layout.spec.ts'],
    sources,
  );
  assert.ok(global.coreBrowserFiles.includes('e2e/purchase-profitability.spec.ts'));
  assert.deepEqual(global.layoutBrowserFiles, ['e2e/admin-layout.spec.ts']);
  assert.deepEqual(global.changedBrowserFiles, ['e2e/pwa-mobile-layout.spec.ts']);
  assert.deepEqual(
    buildBrowserMatrix(global).map(({ project }) => project),
    ['core-smoke', 'layout', 'changed-tests'],
  );
});

test('Dateileser berücksichtigt unversionierte Quellen und Vorlagen, aber keine ignorierten Ausgaben', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'flipbase-selection-files-'));
  try {
    assert.equal(spawnSync('git', ['init', '--quiet', directory]).status, 0);
    for (const folder of ['src/app/features/purchases', 'src/node_modules', 'e2e'])
      mkdirSync(join(directory, folder), { recursive: true });
    writeFileSync(join(directory, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(directory, 'src/tracked.ts'), 'export const tracked = true;');
    assert.equal(spawnSync('git', ['add', 'src/tracked.ts'], { cwd: directory }).status, 0);
    const component = 'src/app/features/purchases/new-form';
    writeFileSync(
      join(directory, component + '.ts'),
      "@Component({templateUrl: './new-form.html'}) export class Form {}",
    );
    writeFileSync(join(directory, component + '.html'), '<button>Speichern</button>');
    writeFileSync(join(directory, component + '.spec.ts'), "import './new-form';");
    writeFileSync(join(directory, 'e2e/purchase-profitability.spec.ts'), '');
    writeFileSync(join(directory, 'src/node_modules/ignored.ts'), 'export const ignored = true;');
    const discovered = await readSelectionFiles(directory);
    assert.deepEqual(
      Object.keys(discovered).sort(),
      [
        'e2e/purchase-profitability.spec.ts',
        component + '.html',
        component + '.spec.ts',
        component + '.ts',
        'src/tracked.ts',
      ].sort(),
    );
    const plan = selectAffectedTests([component + '.html'], discovered);
    assert.equal(plan.full, false);
    assert.deepEqual(plan.units.node, [component + '.spec.ts']);
    assert.deepEqual(plan.browserFiles, ['e2e/purchase-profitability.spec.ts']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('große umfassende Dateigruppen behalten getrennte Sitzungen ohne doppelte CI-Aufrufe', () => {
  const plan = {
    ...twoBrowserGroups,
    coreBrowserFiles: ['e2e/login.spec.ts'],
    layoutBrowserFiles: ['e2e/admin-layout.spec.ts', 'e2e/settings-layout.spec.ts'],
    browserFiles: ['e2e/purchase-tax-costs.spec.ts', 'e2e/company-documents.spec.ts'],
    changedBrowserFiles: [
      'e2e/responsive-admin-layout.spec.ts',
      'e2e/vinted-kleinanzeigen-transfer.spec.ts',
    ],
  };
  const { result, invocations } = runBrowserGroups(plan, '', []);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    invocations.map(({ project, args }) => [
      project,
      args.find((arg) => arg.startsWith('--shard=')) ?? null,
    ]),
    [
      ['core-smoke', null],
      ['layout', '--shard=1/2'],
      ['layout', '--shard=2/2'],
      ['chromium', '--shard=1/2'],
      ['chromium', '--shard=2/2'],
      ['changed-tests', '--shard=1/2'],
      ['changed-tests', '--shard=2/2'],
    ],
  );
  const failed = runBrowserGroups(plan, 'changed-tests', [], '2/2');
  assert.equal(failed.result.status, 7);
  for (const { project, shard } of buildBrowserMatrix(plan)) {
    const ci = runBrowserGroups(plan, '', ['--shard=' + shard], '', project);
    assert.equal(ci.result.status, 0, ci.result.stderr);
    assert.equal(ci.invocations.length, 1);
    assert.equal(ci.invocations[0].project, project);
  }
});

test('unabhängige Änderungen verdecken keinen unbekannten Shared- oder Core-Pfad', () => {
  const sources = { ...files, 'e2e/admin-layout.spec.ts': '' };
  const knownShared = 'src/app/shared/components/product-gallery/product-gallery.component.html';
  for (const orphan of ['src/app/shared/new-control.ts', 'src/app/core/new-boundary.ts']) {
    for (const unrelated of [
      'src/app/features/purchases/purchases.ts',
      'e2e/purchase-profitability.spec.ts',
      knownShared,
    ]) {
      const plan = selectAffectedTests([orphan, unrelated], sources);
      assert.equal(plan.full, true, orphan + ' + ' + unrelated);
      assert.equal(plan.pwa, true);
      assert.ok(plan.layoutBrowserFiles.includes('e2e/admin-layout.spec.ts'));
      assert.ok(
        plan.coreBrowserFiles.length > 0 ||
          plan.browserFiles.length > 0 ||
          plan.changedBrowserFiles.length > 0,
      );
    }
  }
});

test('betroffene Fachdateien ersetzen ihre Kern-/Layoutüberschneidung vollständig', () => {
  const accounting =
    'src/app/features/accounting/components/bank-assignment-dialog/bank-assignment-dialog.component.html';
  const audit = 'src/app/features/audit/new-boundary.ts';
  const sources = {
    ...files,
    [accounting]: '<app-custom-select />',
    [audit]: 'export const boundary = true;',
    'e2e/responsive-admin-layout.spec.ts': "test('unmarked banking error', () => {});",
    'e2e/company-documents.spec.ts': "test('invoice boundary', () => {});",
  };
  for (const feature of [accounting, audit]) {
    const plan = selectAffectedTests(['package-lock.json', feature], sources);
    assert.equal(plan.full, true);
    assert.ok(plan.browserFiles.includes('e2e/company-documents.spec.ts'));
    assert.ok(!plan.coreBrowserFiles.includes('e2e/company-documents.spec.ts'));
    assert.ok(!plan.layoutBrowserFiles.some((file) => plan.browserFiles.includes(file)));
    assert.ok(!plan.coreBrowserFiles.some((file) => plan.browserFiles.includes(file)));
    assert.equal(
      buildBrowserMatrix(plan).filter(({ project }) => project === 'chromium').length,
      Math.min(3, plan.browserFiles.length),
    );
  }
  const plan = selectAffectedTests([accounting], sources);
  assert.deepEqual(plan.coreBrowserFiles, []);
  assert.deepEqual(plan.layoutBrowserFiles, []);
});
