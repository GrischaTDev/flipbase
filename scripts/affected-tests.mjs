import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
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
    'purchase-profitability',
    'purchase-tax-costs',
    'purchase-editable-draft',
    'purchase-detail-layout',
    'purchase-entry',
    'purchase-acceptance',
    'purchase-workspace',
  ],
  research: [],
  sales: ['inventory-sale', 'sales-variant-picker', 'article-stock-removal', 'company-documents'],
  sellers: ['purchase-entry', 'purchase-workspace'],
  settings: [
    'company-settings',
    'company-documents',
    'company-shop-shipping',
    'settings-layout',
    'account-settings',
    'pwa-install-device',
  ],
  store: ['company-shop-shipping', 'product-editor-storefront'],
};

const globalPath =
  /^(?:package(?:-lock)?\.json|angular\.json|tsconfig[^/]*\.json|vitest[^/]*|playwright\.[^/]*|\.github\/workflows\/ci\.yml|scripts\/(?:affected-tests|run-affected-tests|detect-supabase-changes|reuse-pr-checks|required-checks|playwright-pr-smoke)[^/]*|src\/(?:main|test-setup)[^/]*|src\/environments\/|src\/styles|src\/index\.html|src\/app\/app\.|src\/app\/layout\/|src\/app\/core\/guards\/|supabase\/)/u;
const pwaPath =
  /^(?:public\/(?:sw\.js|manifest\.webmanifest|icons\/)|ngsw-config\.json|scripts\/(?:.*pwa.*|service-worker.*|app-startup.*)|e2e\/pwa-|src\/app\/(?:core\/services\/(?:pwa|push-navigation|web-push)|shared\/components\/(?:pwa-|push-navigation)|features\/purchases\/(?:components\/purchase-entry-form\/|guards\/purchase-entry|services\/(?:offline-purchase|purchase-buffer)|models\/offline-purchase|utils\/(?:offline-purchase|purchase-buffer))))/u;
const implicitGlobalPath =
  /^(?:e2e\/global-setup\.ts|src\/app\/core\/services\/app-startup\.service\.ts)$/u;

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

function browserSpecs(file, files) {
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
    if (/vinted-sales/u.test(file)) return ['vinted-sales'];
    if (/kleinanzeigen-(?:listing|publication|form|transfer)|listing-transfer/u.test(file))
      return ['kleinanzeigen-accounts', 'vinted-kleinanzeigen-transfer'];
    if (/kleinanzeigen/u.test(file)) return ['kleinanzeigen-accounts', 'marketplace-overview'];
    if (/marketplace-(?:overview|listing-section|listing-selection)/u.test(file))
      return ['kleinanzeigen-accounts', 'marketplace-overview'];
    if (/vinted-listing-(?:detail|age)|vinted-listings|vinted-listing-clock/u.test(file))
      return ['vinted-listing-edge-cases', 'vinted-workspace-ui'];
    if (/listing/u.test(file))
      return [
        'vinted-listing-edge-cases',
        'vinted-listing-drafts',
        'listing-studio',
        'vinted-workspace-ui',
      ];
    if (/message|inbox|negotiation|offer|favorite/u.test(file))
      return ['vinted-inbox-experience', 'vinted-favorite-messages', 'vinted-negotiation'];
    if (/ebay/u.test(file)) return ['ebay-order-import', 'marketplace-accounts', 'settings-layout'];
    return Object.keys(files)
      .filter((path) => /^e2e\/(?:vinted|marketplace)[^/]*\.spec\.ts$/u.test(path))
      .map((path) => posix.basename(path, '.spec.ts'));
  }
  return featureSpecs[feature] ?? [];
}

/** Lokale Imports, Reexports und Angular-Ressourcen. Gelöschte Pfade bleiben auflösbar. */
function reverseDependencies(files, changedPaths) {
  const available = new Set([...Object.keys(files), ...changedPaths]);
  const reverse = new Map();
  for (const [file, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.[cm]?[jt]s$/u.test(file)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isStringLiteralLike(node) && node.text.startsWith('.')) {
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
  const reverse = reverseDependencies(files, changed);
  const globalRoots = new Set([
    'src/main.ts',
    'src/app/app.ts',
    'src/app/app.component.ts',
    'src/app/app.config.ts',
    'e2e/global-setup.ts',
  ]);
  const globalConsumers = new Set(changed);
  for (const file of globalConsumers) {
    if (file.endsWith('.routes.ts') || file.endsWith('.spec.ts')) continue;
    for (const consumer of reverse.get(file) ?? []) globalConsumers.add(consumer);
  }
  const applicationPaths = changed.filter(
    (file) =>
      !isDocument(file) &&
      !isLanding(file) &&
      !file.startsWith('services/push-worker/') &&
      classifyChanges([file]).application_tests,
  );
  const full =
    paths === null ||
    [...globalConsumers].some((file) => globalRoots.has(file)) ||
    applicationPaths.some(
      (file) =>
        globalPath.test(file) ||
        implicitGlobalPath.test(file) ||
        (!pwaPath.test(file) &&
          !/^(?:src\/app\/(?:features|shared|core)\/|e2e\/|services\/marketplace-worker\/|tools\/flipbase-extension\/)/u.test(
            file,
          )) ||
        (/^src\/app\/features\//u.test(file) &&
          !file.startsWith('src/app/features/marketplaces/') &&
          !Object.hasOwn(featureSpecs, file.split('/')[3])),
    );
  const affected = new Set(changed);
  for (const file of affected)
    for (const consumer of reverse.get(file) ?? []) affected.add(consumer);
  const units = { node: [], dom: [], angular: [] };
  for (const file of Object.keys(files).sort()) {
    if (!isSpec(file) || typeof files[file] !== 'string' || (!full && !affected.has(file)))
      continue;
    units[
      file.endsWith('.angular.spec.ts') ? 'angular' : file.endsWith('.dom.spec.ts') ? 'dom' : 'node'
    ].push(file);
  }
  const candidates = new Set();
  for (const file of affected) {
    // Routensammlungen und Tests importieren mehrere Funktionen. Ihre indirekte
    // Berührung darf nicht wieder alle Funktionen als geändert behandeln.
    if (
      file.endsWith('.spec.ts') ||
      (!changed.includes(file) &&
        (file.endsWith('.routes.ts') ||
          /vinted-(?:account-content|workspace)\.component/u.test(file)))
    )
      continue;
    for (const name of browserSpecs(file, files)) candidates.add(`e2e/${name}.spec.ts`);
  }
  const changedBrowserFiles = sorted(
    changed.filter((file) => isBrowser(file) && typeof files[file] === 'string'),
  );
  const browserFiles = sorted(
    Object.keys(files).filter(
      (file) =>
        typeof files[file] === 'string' &&
        isBrowser(file) &&
        !changedBrowserFiles.includes(file) &&
        (full || candidates.has(file) || affected.has(file)),
    ),
  );
  return {
    full,
    units,
    browserFiles,
    changedBrowserFiles,
    checks: {
      marketplace:
        full ||
        changed.some((file) =>
          /^(?:services\/marketplace-worker\/|tools\/flipbase-extension\/|supabase\/functions\/(?:marketplace-|ebay-|_shared\/))/u.test(
            file,
          ),
        ),
      push: pathsSelectPush(paths),
      landing: full || changed.some(isLanding),
    },
    pwa:
      full ||
      changed.some((file) => pwaPath.test(file)) ||
      [...affected].some(
        (file) => (!file.endsWith('.spec.ts') || file.startsWith('e2e/')) && pwaPath.test(file),
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
    const shards = plan.full && suite === 'angular' ? Math.ceil(files / 100) : 1;
    for (let shard = 1; shard <= shards; shard++)
      matrix.push({ suite, shard: String(shard) + '/' + String(shards) });
  }
  return matrix;
}

export function buildBrowserMatrix(plan) {
  return [
    { project: 'chromium', files: plan.browserFiles },
    { project: 'changed-tests', files: plan.changedBrowserFiles },
  ]
    .filter(({ files }) => files.length)
    .flatMap(({ project, files }) => {
      // Jede Teilgruppe erhält einen eigenen Runner und eine frische Anmeldung.
      // Nicht mehr Teilgruppen als Dateien erzeugen, damit kleine Änderungen keine leeren Jobs erhalten.
      const groups = plan.full ? Math.min(3, files.length) : 1;
      return Array.from({ length: groups }, (_, index) => ({
        project,
        shard: String(index + 1) + '/' + String(groups),
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
  const summary = `Betroffene Prüfungen: ${plan.full ? 'umfassend (gemeinsame/unklare Änderung)' : 'gezielt'}; Node ${plan.units.node.length}, DOM ${plan.units.dom.length}, Angular ${plan.units.angular.length}, Browserdateien ${plan.browserFiles.length + plan.changedBrowserFiles.length}, PWA ${plan.pwa ? 'ja' : 'nein'}.\n`;
  console.log(JSON.stringify({ ...plan, selection_hash: output.selection_hash }));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
