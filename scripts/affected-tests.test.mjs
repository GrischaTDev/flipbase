import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectAffectedTests } from './affected-tests.mjs';

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
    });
    assert.equal(plan.full, false, path);
    assert.deepEqual(plan.browserFiles, ['e2e/marketplace-overview.spec.ts'], path);
    assert.equal(plan.pwa, false, path);
  }
});
