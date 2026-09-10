import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const rootDirectory = new URL('..', import.meta.url);
const projectRoot = fileURLToPath(rootDirectory);
const executeFile = promisify(execFile);
const expectedSmokeTests = [
  ['purchase-workspace.spec.ts', 'opens an existing purchase directly without runtime errors'],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening',
  ],
  ['inventory-sale.spec.ts', 'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar'],
  [
    'purchase-dropdown-layer.spec.ts',
    'keeps cost options above the modal footer and preserves keyboard dismissal',
  ],
  [
    'product-integration.spec.ts',
    'Produktbild bleibt nach erneutem Laden sichtbar und unbekannter Scan öffnet den Picker',
  ],
  ['dashboard-interactions.spec.ts', 'erkundet die Diagrammdaten vollstaendig mit der Tastatur'],
  [
    'record-timeline.spec.ts',
    'speichert Demo-Kommentare am richtigen Einkauf und zeigt Klartext nach Neuladen',
  ],
  ['entry-pages.spec.ts', 'keeps the new entry pages free of automated WCAG AA violations'],
];

const readProjectFile = (filePath) => readFile(new URL(filePath, rootDirectory), 'utf8');
const listSmokeTests = async () => {
  const { stdout } = await executeFile(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.pr.config.ts', '--list'],
    { cwd: projectRoot },
  );
  const listedTests = stdout.split(/\r?\n/).filter((line) => /^\s*\[[^\]]+\]\s+› /.test(line));

  return listedTests.map((line) => {
    const match = line.match(/^\s*\[[^\]]+\]\s+› (.+?):\d+:\d+ › (.+)$/);
    assert.ok(match, `Ungültige Playwright-Listenzeile: ${line}`);
    const [, filePath, testName] = match;
    assert.ok(testName.endsWith('@pr-smoke'), `Unerwartete Auswahl: ${testName}`);
    return [filePath.split(/[\\/]/).at(-1), testName];
  });
};
const assertPrConfiguration = (config) => {
  assert.match(config, /import baseConfig from '.\/playwright\.config';/);
  assert.match(config, /grep:\s*\/@pr-smoke\//);
  assert.match(config, /retries:\s*0/);
  assert.match(config, /maxFailures:\s*1\s*(?:,|\r?\n)/);
  assert.match(config, /workers:\s*1\s*(?:,|\r?\n)/);
  assert.match(config, /trace:\s*'retain-on-failure'/);
  assert.match(
    config,
    /projects:\s*\[\s*\{\s*name:\s*'chromium',\s*use:\s*\{\s*browserName:\s*'chromium'\s*\}\s*\}\s*\],/,
  );
};
const assertExpectedSmokeTests = (selectedTests) => {
  assert.equal(selectedTests.length, 8);
  assert.deepEqual(
    selectedTests.sort(([leftFile], [rightFile]) => leftFile.localeCompare(rightFile)),
    expectedSmokeTests
      .map(([fileName, testName]) => [fileName, `${testName} @pr-smoke`])
      .sort(([leftFile], [rightFile]) => leftFile.localeCompare(rightFile)),
  );
};

test('defines the fail-closed PR browser smoke suite', async () => {
  const [config, packageJson] = await Promise.all([
    readProjectFile('playwright.pr.config.ts'),
    readProjectFile('package.json'),
  ]);
  const packageDefinition = JSON.parse(packageJson);

  assertPrConfiguration(config);
  const selectedTests = await listSmokeTests();
  assertExpectedSmokeTests(selectedTests);
  assert.equal(
    packageDefinition.scripts['test:e2e:pr'],
    'playwright test --config=playwright.pr.config.ts',
  );
  assert.equal(packageDefinition.scripts['test:e2e'], 'playwright test');
  assert.equal(
    packageDefinition.scripts['test:e2e:nightly'],
    'playwright test --config=playwright.nightly.config.ts',
  );
});

test('rejects an additional nested double-quoted smoke tag inside a describe block', async () => {
  const probeDirectory = new URL('e2e/playwright-pr-smoke-contract-probe/', rootDirectory);
  const probeFile = new URL('nested.test.ts', probeDirectory);
  await mkdir(probeDirectory, { recursive: true });
  await writeFile(
    probeFile,
    `import { test } from '@playwright/test';\n\ntest.describe("probe", () => {\n  test("unexpected contract @pr-smoke", async () => {});\n});\n`,
  );

  try {
    const listedSmokeTests = await listSmokeTests();
    assert.equal(listedSmokeTests.length, 9);
    assert.throws(() => assertExpectedSmokeTests(listedSmokeTests));
  } finally {
    await rm(probeDirectory, { recursive: true, force: true });
  }
});

for (const setting of ['maxFailures', 'workers']) {
  test(`rejects ${setting}: 10 instead of the required value 1`, async () => {
    const originalConfig = await readProjectFile('playwright.pr.config.ts');
    const changedConfig = originalConfig.replace(`${setting}: 1`, `${setting}: 10`);
    assert.notEqual(changedConfig, originalConfig);
    assert.throws(() => assertPrConfiguration(changedConfig));
  });
}
