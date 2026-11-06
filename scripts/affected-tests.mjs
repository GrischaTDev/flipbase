import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { isCiToolingPath } from './ci-tooling-paths.mjs';
import {
  coreBrowserFiles as coreFiles,
  layoutBrowserFiles as layoutFiles,
  uiBrowserFiles as uiFiles,
} from './browser-test-selection.mjs';
import {
  classifyChanges,
  detectChangedPaths,
  pathsSelectPush,
} from './detect-supabase-changes.mjs';

const exec = promisify(execFile);
const featureSpecs = {
  accounting: ['purchase-tax-costs', 'company-documents', 'responsive-admin-layout'],
  analytics: ['responsive-admin-layout'],
  audit: ['company-documents'],
  auth: ['login', 'beta-registration', 'beta-access-lifecycle', 'local-supabase'],
  'beta-discord': ['beta-registration'],
  'brand-labels': ['brand-label-library', 'clothing-size-guide'],
  catalog: [
    'core-smoke',
    'article-stock-removal',
    'sales-variant-picker',
    'article-workspace',
    'product-integration',
  ],
  dashboard: [
    'dashboard-interactions',
    'dashboard-layout',
    'dashboard-design',
    'responsive-admin-layout',
  ],
  'deal-calculator': [],
  'deal-monitor': ['deal-monitor', 'sniper-administration'],
  'ebay-fee-calculator': [],
  expenses: ['expense-recurrence-contract', 'responsive-admin-layout'],
  fulfillment: ['company-shop-shipping', 'responsive-admin-layout'],
  'image-optimizer': ['core-smoke'],
  inventory: ['inventory-sale', 'inventory-archive-columns', 'article-stock-removal'],
  listings: ['listing-studio', 'vinted-listing-drafts', 'vinted-listing-edge-cases'],
  'master-data': ['brand-label-library', 'clothing-size-guide', 'sale-platforms'],
  onboarding: ['beta-registration', 'company-settings'],
  'platform-admin': ['beta-registration', 'sniper-administration', 'beta-access-lifecycle'],
  purchases: [
    'optional-shop',
    'purchase-profitability',
    'purchase-tax-costs',
    'purchase-editable-draft',
    'purchase-detail-layout',
    'purchase-entry',
    'purchase-acceptance',
    'purchase-workspace',
  ],
  research: [],
  sales: [
    'free-sales',
    'inventory-sale',
    'sales-variant-picker',
    'article-stock-removal',
    'company-documents',
  ],
  sellers: ['purchase-entry', 'purchase-workspace'],
  settings: [
    'optional-shop',
    'company-settings',
    'company-documents',
    'company-shop-shipping',
    'settings-layout',
    'account-settings',
    'vinted-action-overview',
    'pwa-install-device',
  ],
  store: ['company-shop-shipping', 'product-editor-storefront'],
};

const globalPath =
  /^(?:package(?:-lock)?\.json|angular\.json|tsconfig[^/]*\.json|vitest[^/]*|src\/(?:main|test-setup)[^/]*|src\/environments\/|src\/styles|src\/index\.html|src\/app\/app\.|src\/app\/core\/guards\/)/u;
const sharedUiPath =
  /^src\/app\/(?:layout\/|shared\/components\/(?:badge|button|card|confirm-dialog|custom-checkbox|custom-search-input|custom-select|data-table|date-picker|entry-page-layout|form-field|loading-indicator|modal-shell|notice-banner|number-input|page-header|route-tabs|search-multi-select|section-navigation|split-pane|summary-metric|table-action-button|table-action-menu|table-column-menu|table-column-picker|table-pager|table-sort-header|text-field|toast|two-column-layout)\/)/u;
const runtimePath =
  /^(?:package(?:-lock)?\.json|angular\.json|src\/(?:main\.ts|environments\/|index\.html)|src\/app\/app\.(?:config|routes)\.ts|src\/app\/core\/(?:guards\/|services\/(?:app-startup|supabase|auth)\.service\.ts))/u;
const workflowPath =
  /^(?:scripts\/|\.github\/|deploy\/|docker\/|package(?:-lock)?\.json|(?:angular|tsconfig[^/]*|vitest[^/]*|playwright[^/]*)\.(?:json|ts)|\.dockerignore)/u;
const pwaPath =
  /^(?:public\/(?:sw\.js|manifest\.webmanifest|icons\/)|ngsw-config\.json|scripts\/(?:.*pwa.*|service-worker.*|app-startup.*)|e2e\/pwa-|src\/app\/(?:core\/services\/(?:pwa|push-navigation|web-push)|shared\/components\/(?:pwa-|push-navigation)|features\/purchases\/(?:components\/purchase-entry-form\/|guards\/purchase-entry|services\/(?:offline-purchase|purchase-buffer)|models\/offline-purchase|utils\/(?:offline-purchase|purchase-buffer))))/u;
const implicitGlobalPath =
  /^(?:e2e\/global-setup\.ts|src\/app\/core\/services\/app-startup\.service\.ts)$/u;
const marketplaceBrowserBoundary =
  /^src\/app\/features\/marketplaces\/(?:services\/(?:marketplace-api\.service|marketplace-account\.store)\.ts|vinted-workspace\.component\.ts|components\/vinted-account-content\/vinted-account-content\.component\.ts)$/u;

const isSpec = (file) => file.startsWith('src/') && file.endsWith('.spec.ts');
const isBrowser = (file) =>
  /^e2e\/[^/]+\.spec\.ts$/u.test(file) &&
  !/^e2e\/pwa-(?:production|purchase-drafts|purchase-buffer-documents|push-navigation)\.spec\.ts$/u.test(
    file,
  );
const isDocument = (file) =>
  file.startsWith('docs/') || (!file.includes('/') && file.endsWith('.md'));
const isLanding = (file) => /^(?:landing\/|scripts\/landing-)/u.test(file);
const sorted = (values) => [...new Set(values)].sort();

function browserSpecs(file) {
  if (/^tools\/flipbase-extension\/kleinanzeigen-/u.test(file))
    return ['kleinanzeigen-accounts', 'vinted-kleinanzeigen-transfer'];
  if (
    /^tools\/flipbase-extension\/(?:background\.js|flipbase-bridge\.js|manifest\.json|autofill-core\.js)$/u.test(
      file,
    )
  )
    return [
      'kleinanzeigen-accounts',
      'vinted-kleinanzeigen-transfer',
      'vinted-listing-edge-cases',
      'vinted-workspace-ui',
    ];

  const feature = /^src\/app\/features\/([^/]+)\//u.exec(file)?.[1];
  if (feature === 'purchases' && /purchases\.component\.|purchase-profitability/u.test(file))
    return ['purchase-profitability'];
  if (feature === 'marketplaces') {
    if (marketplaceBrowserBoundary.test(file)) return null;
    if (/ebay/u.test(file))
      return ['ebay-workspace', 'ebay-order-import', 'marketplace-accounts', 'settings-layout'];
    if (/vinted-action-overview/u.test(file)) return ['vinted-action-overview'];
    if (/vinted-profile|vinted-feedback-list/u.test(file)) return ['vinted-profile'];
    if (/vinted-provider-drafts|vinted-listing-copy/u.test(file))
      return ['vinted-listing-drafts', 'vinted-listing-edge-cases', 'vinted-workspace-ui'];
    if (/vinted-sales/u.test(file)) return ['vinted-sales'];
    if (/vinted-listing-editor/u.test(file))
      return ['vinted-listing-edge-cases', 'vinted-listing-drafts'];
    if (/vinted-listing-(?:source|original-photo|operation)/u.test(file))
      return ['vinted-listing-edge-cases'];
    if (/kleinanzeigen-(?:listing|publication|form|transfer)|listing-transfer/u.test(file))
      return ['kleinanzeigen-accounts', 'vinted-kleinanzeigen-transfer'];
    if (/kleinanzeigen/u.test(file)) return ['kleinanzeigen-accounts', 'marketplace-overview'];
    if (/marketplace-(?:overview|listing-section|listing-selection)/u.test(file))
      return ['kleinanzeigen-accounts', 'marketplace-overview'];
    if (/vinted-listing-(?:detail|age)|vinted-listings|vinted-listing-clock/u.test(file))
      return ['vinted-listing-edge-cases', 'vinted-workspace-ui'];
    if (/listing/u.test(file))
      return ['vinted-listing-edge-cases', 'vinted-listing-drafts', 'vinted-workspace-ui'];
    if (/message|inbox|negotiation|offer|favorite/u.test(file))
      return [
        'vinted-inbox-experience',
        'vinted-favorite-messages',
        'vinted-negotiation',
        'vinted-action-overview',
      ];
    return null;
  }
  return featureSpecs[feature] ?? [];
}

function isTypeOnlyModuleDeclaration(declaration) {
  if (!declaration) return false;
  if (ts.isImportDeclaration(declaration)) {
    const clause = declaration.importClause;
    return (
      !!clause &&
      (clause.isTypeOnly ||
        (!clause.name &&
          clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly)))
    );
  }
  return (
    ts.isExportDeclaration(declaration) &&
    (declaration.isTypeOnly ||
      (declaration.exportClause &&
        ts.isNamedExports(declaration.exportClause) &&
        declaration.exportClause.elements.length > 0 &&
        declaration.exportClause.elements.every((element) => element.isTypeOnly)))
  );
}

function isTypeOnlyReference(node) {
  return (
    !!(node.parent?.parent && ts.isImportTypeNode(node.parent.parent)) ||
    isTypeOnlyModuleDeclaration(node.parent)
  );
}

function isTypeOnlySource(file, content) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || typeof content !== 'string')
    return false;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  return (
    source.statements.length > 0 &&
    source.statements.every(
      (statement) =>
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        isTypeOnlyModuleDeclaration(statement),
    )
  );
}

/** Lokale Imports, Reexports und Angular-Ressourcen. Gelöschte Pfade bleiben auflösbar. */
function reverseDependencies(files, changedPaths, runtimeOnly = false) {
  const available = new Set([...Object.keys(files), ...changedPaths]);
  const reverse = new Map();
  for (const [file, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.[cm]?[jt]s$/u.test(file)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (
        ts.isStringLiteralLike(node) &&
        node.text.startsWith('.') &&
        (!runtimeOnly || !isTypeOnlyReference(node))
      ) {
        const base = posix.normalize(posix.join(posix.dirname(file), node.text));
        const dependency = [
          base,
          `${base}.ts`,
          `${base}.js`,
          `${base}/index.ts`,
          base.replace(/\.js$/u, '.ts'),
        ].find((candidate) => available.has(candidate));
        if (dependency) {
          if (!reverse.has(dependency)) reverse.set(dependency, new Set());
          reverse.get(dependency).add(file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return reverse;
}

/** Ermittelt tatsächlich abhängige Tests; keine Browserausführung bei leerer Auswahl. */
export function selectAffectedTests(paths, files) {
  const changed = paths ?? [];
  const runtimeChanged = changed.filter((file) => !isCiToolingPath(file));
  const reverse = reverseDependencies(files, changed);
  const runtimeReverse = reverseDependencies(files, changed, true);
  const browserChanges = runtimeChanged.filter(
    (file) => !sharedUiPath.test(file) && !isTypeOnlySource(file, files[file]),
  );
  const globalRoots = new Set(['src/main.ts', 'src/app/app.config.ts', 'e2e/global-setup.ts']);
  // Visuelle Controls erreichen regelmäßig die Appwurzel. Das allein ändert
  // weder deren Provider noch den PWA-Lebenszyklus.
  const globalConsumers = new Set(browserChanges);
  for (const file of globalConsumers) {
    if (file.endsWith('.routes.ts') || file.endsWith('.spec.ts')) continue;
    for (const consumer of runtimeReverse.get(file) ?? []) globalConsumers.add(consumer);
  }
  const applicationPaths = runtimeChanged.filter(
    (file) =>
      !isDocument(file) &&
      !isLanding(file) &&
      !file.startsWith('services/push-worker/') &&
      classifyChanges([file]).application_tests,
  );
  let full =
    paths === null ||
    [...globalConsumers].some((file) => globalRoots.has(file)) ||
    applicationPaths.some(
      (file) =>
        globalPath.test(file) ||
        implicitGlobalPath.test(file) ||
        (!pwaPath.test(file) &&
          !/^(?:src\/app\/(?:features|shared|core|layout)\/|e2e\/|services\/marketplace-worker\/|tools\/flipbase-extension\/|supabase\/)/u.test(
            file,
          )) ||
        (/^src\/app\/features\//u.test(file) &&
          !file.startsWith('src/app/features/marketplaces/') &&
          !Object.hasOwn(featureSpecs, file.split('/')[3])),
    );
  const affected = new Set(runtimeChanged);
  for (const file of affected)
    for (const consumer of reverse.get(file) ?? []) affected.add(consumer);
  // Lokal reichen bei generischen Controls deren eigene Verträge; die CI
  // prüft zusätzlich sämtliche abhängigen Komponenten. Fachliche Shared-
  // Bausteine wie die Produktgalerie behalten ihre konkreten Verbraucher.
  const localAffected = new Set(runtimeChanged.filter((file) => !sharedUiPath.test(file)));
  for (const file of localAffected)
    for (const consumer of reverse.get(file) ?? []) localAffected.add(consumer);
  const sharedDirectories = changed.filter((file) => sharedUiPath.test(file)).map(posix.dirname);
  for (const file of Object.keys(files))
    if (isSpec(file) && sharedDirectories.includes(posix.dirname(file))) localAffected.add(file);
  const candidates = new Set();
  let conservativeBrowser = false;
  const browserConsumers = new Set(browserChanges);
  for (const file of browserConsumers) {
    if (file.endsWith('.routes.ts') || file.endsWith('.spec.ts')) continue;
    // Direkte Sammleränderungen erhalten unten den Schutzkern. Ihre einzelnen
    // Verbraucher werden nicht erneut zu sämtlichen Fachseiten aufgefächert.
    if (marketplaceBrowserBoundary.test(file)) continue;
    for (const consumer of runtimeReverse.get(file) ?? []) browserConsumers.add(consumer);
  }
  for (const file of browserConsumers) {
    // Routensammlungen und Tests importieren mehrere Funktionen. Ihre indirekte
    // Berührung darf nicht wieder alle Funktionen als geändert behandeln.
    if (
      file.endsWith('.spec.ts') ||
      isTypeOnlySource(file, files[file]) ||
      (!changed.includes(file) &&
        (file.endsWith('.routes.ts') || marketplaceBrowserBoundary.test(file)))
    )
      continue;
    const specs = browserSpecs(file);
    if (specs === null) conservativeBrowser = true;
    else for (const name of specs) candidates.add(`e2e/${name}.spec.ts`);
  }
  const hasFeatureOrBrowserConsumer = (file) => {
    // Jede unsichere Änderung braucht ihren eigenen nachweisbaren Verbraucher.
    // Ein unabhängig geändertes Feature darf einen verwaisten Pfad nicht verdecken.
    const consumers = new Set([file]);
    for (const consumer of consumers)
      for (const dependent of reverse.get(consumer) ?? []) consumers.add(dependent);
    return [...consumers].some(
      (consumer) =>
        (/^src\/app\/features\//u.test(consumer) && !consumer.endsWith('.spec.ts')) ||
        isBrowser(consumer),
    );
  };
  // Verwaiste gemeinsame Dateien und entfernte Browserdateien lassen sich
  // nicht zuverlässig einem vorhandenen Verbraucher zuordnen.
  full ||= applicationPaths.some(
    (file) =>
      (isBrowser(file) && typeof files[file] !== 'string') ||
      (/^(?:src\/app\/(?:core|shared)\/|e2e\/support\/)/u.test(file) &&
        !file.endsWith('.spec.ts') &&
        !pwaPath.test(file) &&
        !sharedUiPath.test(file) &&
        !hasFeatureOrBrowserConsumer(file)),
  );
  const units = { node: [], dom: [], angular: [] };
  const localUnits = { node: [], dom: [], angular: [] };
  for (const file of Object.keys(files).sort()) {
    if (!isSpec(file) || typeof files[file] !== 'string') continue;
    const suite = file.endsWith('.angular.spec.ts')
      ? 'angular'
      : file.endsWith('.dom.spec.ts')
        ? 'dom'
        : 'node';
    if (localAffected.has(file)) localUnits[suite].push(file);
    if (full || affected.has(file)) units[suite].push(file);
  }
  const changedBrowsers = sorted(
    changed.filter((file) => isBrowser(file) && typeof files[file] === 'string'),
  );
  const browserFiles = sorted(
    Object.keys(files).filter(
      (file) =>
        typeof files[file] === 'string' &&
        isBrowser(file) &&
        !changedBrowsers.includes(file) &&
        (candidates.has(file) || browserConsumers.has(file)),
    ),
  );
  const available = (file) =>
    typeof files[file] === 'string' &&
    !changedBrowsers.includes(file) &&
    !browserFiles.includes(file);
  const coreBrowserFiles = full || conservativeBrowser ? sorted(coreFiles.filter(available)) : [];
  const layoutBrowserFiles = changed.some(
    (file) => sharedUiPath.test(file) || /^src\/styles/u.test(file),
  )
    ? sorted(layoutFiles.filter(available))
    : [];
  return {
    full,
    units,
    localUnits,
    coreBrowserFiles,
    layoutBrowserFiles,
    // Fachlich betroffene Dateien bleiben vollständig in ihrer eigenen Gruppe.
    // Kern/Layout ziehen diese Dateien vorher ab, keine einzelnen Fachfälle.
    browserFiles: browserFiles.filter((file) => !uiFiles.includes(file)),
    changedBrowserFiles: changedBrowsers.filter((file) => !uiFiles.includes(file)),
    uiBrowserFiles: browserFiles.filter((file) => uiFiles.includes(file)),
    changedUiBrowserFiles: changedBrowsers.filter((file) => uiFiles.includes(file)),
    checks: {
      marketplace:
        paths === null ||
        changed.some((file) =>
          /^(?:package(?:-lock)?\.json|services\/marketplace-worker\/|tools\/flipbase-extension\/|supabase\/functions\/(?:marketplace-|ebay-|_shared\/))/u.test(
            file,
          ),
        ),
      push: pathsSelectPush(paths),
      landing: paths === null || changed.some(isLanding),
      workflow: paths === null || changed.some((file) => workflowPath.test(file)),
    },
    pwa:
      paths === null ||
      changed.some((file) => runtimePath.test(file) || pwaPath.test(file)) ||
      [...globalConsumers].some(
        (file) => file === 'src/app/app.config.ts' || file === 'src/main.ts',
      ) ||
      [...browserConsumers].some(
        (file) =>
          (!file.endsWith('.spec.ts') || file.startsWith('e2e/')) &&
          !file.includes('/components/') &&
          pwaPath.test(file),
      ),
  };
}

export function selectionHash(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

export async function readSelectionFiles(cwd = process.cwd()) {
  const { stdout } = await exec(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      'src',
      'e2e',
      'services',
      'tools',
      'supabase',
    ],
    { cwd, maxBuffer: 8 * 1024 * 1024 },
  );
  const files = sorted(
    stdout.split('\0').filter((file) => /\.(?:ts|js|html|css|scss)$/u.test(file)),
  );
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        await readFile(resolve(cwd, file), 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        }),
      ]),
    ),
  );
}

export function buildUnitMatrix(plan) {
  const matrix = [];
  for (const suite of ['node', 'dom', 'angular']) {
    const files = plan.units[suite].length;
    if (!files) continue;
    // Die vollständigen Angular-Gruppen müssen einschließlich Vorbereitung in
    // das bestehende Zehn-Minuten-Limit passen; alle Dateien bleiben enthalten.
    const shards = suite === 'angular' ? Math.ceil(files / 60) : 1;
    for (let shard = 1; shard <= shards; shard++)
      matrix.push({ suite, shard: String(shard) + '/' + String(shards) });
  }
  return matrix;
}

export function buildBrowserMatrix(plan) {
  return [
    { project: 'core-smoke', files: plan.coreBrowserFiles ?? [], database: true },
    {
      project: 'layout',
      files: (plan.layoutBrowserFiles ?? []).filter((file) => !uiFiles.includes(file)),
      database: true,
    },
    {
      project: 'ui-layout',
      files: (plan.layoutBrowserFiles ?? []).filter((file) => uiFiles.includes(file)),
      database: false,
    },
    { project: 'chromium', files: plan.browserFiles ?? [], database: true },
    { project: 'changed-tests', files: plan.changedBrowserFiles ?? [], database: true },
    { project: 'ui', files: plan.uiBrowserFiles ?? [], database: false },
    { project: 'changed-ui', files: plan.changedUiBrowserFiles ?? [], database: false },
  ]
    .filter(({ files }) => files.length)
    .flatMap(({ project, files, database }) => {
      // Bei vier Gruppen mit je 110 Fällen erreichte eine im umfassenden eBay-Lauf
      // das 30-Minuten-Budget. Mindestens sechs Gruppen halten auch beim Auslagern
      // geänderter Dateien Reserve; große Dateimengen werden weiterhin feiner verteilt.
      const maxGroups =
        project === 'layout'
          ? 2
          : project === 'chromium'
            ? Math.max(plan.full ? 6 : 3, Math.ceil(files.length / 6))
            : 3;
      // Die UI-Jobzahl folgt einem Dateibudget, keiner garantierten Zeitprognose.
      const groups =
        project === 'ui'
          ? Math.ceil(files.length / 2)
          : (plan.full || (project === 'chromium' && files.length > 10)) &&
              project !== 'core-smoke' &&
              project !== 'ui-layout'
            ? Math.min(maxGroups, files.length)
            : 1;
      return Array.from({ length: groups }, (_, index) => ({
        project,
        shard: `${index + 1}/${groups}`,
        database,
      }));
    });
}

async function main() {
  const paths = process.argv.includes('--paths')
    ? process.argv.slice(process.argv.indexOf('--paths') + 1)
    : await detectChangedPaths({
        eventName: process.env.EVENT_NAME,
        prBaseSha: process.env.PR_BASE_SHA,
        pushBeforeSha: process.env.PUSH_BEFORE_SHA,
        headSha: process.env.HEAD_SHA,
      });
  const plan = selectAffectedTests(paths, await readSelectionFiles());
  const matrix = buildUnitMatrix(plan);
  const browserMatrix = buildBrowserMatrix(plan);
  const output = {
    test_plan: JSON.stringify(plan),
    selection_hash: selectionHash(plan),
    unit_required: matrix.length > 0,
    unit_matrix: JSON.stringify({
      include: matrix.length ? matrix : [{ suite: 'node', shard: '1/1' }],
    }),
    browser_required: browserMatrix.length > 0,
    browser_matrix: JSON.stringify({
      include: browserMatrix.length ? browserMatrix : [{ project: 'chromium', shard: '1/1' }],
    }),
    pwa_required: plan.pwa,
    marketplace_required: plan.checks.marketplace,
    landing_required: plan.checks.landing,
  };
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      Object.entries(output)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  const summary = `Betroffene Prüfungen: ${plan.full ? 'umfassend (gemeinsame/unklare Änderung)' : 'gezielt'}; Node ${plan.units.node.length}, DOM ${plan.units.dom.length}, Angular ${plan.units.angular.length}, Browserdateien ${new Set([...(plan.coreBrowserFiles ?? []), ...(plan.layoutBrowserFiles ?? []), ...plan.browserFiles, ...plan.changedBrowserFiles]).size}, PWA ${plan.pwa ? 'ja' : 'nein'}.\n`;
  console.log(JSON.stringify({ ...plan, selection_hash: output.selection_hash }));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
