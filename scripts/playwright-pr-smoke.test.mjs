import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const rootDirectory = new URL('..', import.meta.url);
const projectRoot = fileURLToPath(rootDirectory);
const probeTempArea = new URL('e2e/playwright-pr-smoke-test-temp/', rootDirectory);
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
const createProbeDirectory = async () => {
  await mkdir(probeTempArea, { recursive: true });
  const resolvedTempArea = await realpath(fileURLToPath(probeTempArea));
  const probeDirectory = await mkdtemp(join(resolvedTempArea, 'probe-'));
  const resolvedProbeDirectory = await realpath(probeDirectory);
  const probeRelativePath = relative(resolvedTempArea, resolvedProbeDirectory);
  assert.ok(
    probeRelativePath && !probeRelativePath.startsWith('..') && !isAbsolute(probeRelativePath),
    `Unsicherer Probe-Pfad: ${resolvedProbeDirectory}`,
  );
  return resolvedProbeDirectory;
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
const collectSpecs = (suites) =>
  suites.flatMap((suite) => [...(suite.specs ?? []), ...collectSpecs(suite.suites ?? [])]);
const assertResolvedSmokeSuite = (resolvedSuite) => {
  assert.equal(resolvedSuite.config.maxFailures, 1);
  assert.equal(resolvedSuite.config.workers, 1);
  assert.deepEqual(
    resolvedSuite.config.projects.map((project) => [project.name, project.retries]),
    [['chromium', 0]],
  );

  const selectedTests = collectSpecs(resolvedSuite.suites).map((spec) => {
    assert.ok(spec.tags.includes('pr-smoke'), `Unerwartete Auswahl: ${spec.title}`);
    assert.deepEqual(
      spec.tests.map((test) => test.projectName),
      ['chromium'],
    );
    return [spec.file.split(/[\\/]/).at(-1), spec.title];
  });
  assertExpectedSmokeTests(selectedTests);
  return selectedTests;
};
const listSmokeTests = async () => {
  const { stdout } = await executeFile(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config=playwright.pr.config.ts',
      '--list',
      '--reporter=json',
    ],
    { cwd: projectRoot },
  );
  return assertResolvedSmokeSuite(JSON.parse(stdout));
};

test('defines the fail-closed PR browser smoke suite', async () => {
  const packageJson = await readProjectFile('package.json');
  const packageDefinition = JSON.parse(packageJson);

  await listSmokeTests();
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
  const probeDirectory = await createProbeDirectory();
  const probeFile = join(probeDirectory, 'nested.test.ts');
  await writeFile(
    probeFile,
    `import { test } from '@playwright/test';\n\ntest.describe("probe", () => {\n  test("unexpected contract @pr-smoke", async () => {});\n});\n`,
  );

  try {
    await assert.rejects(listSmokeTests);
  } finally {
    await rm(probeDirectory, { recursive: true, force: true });
  }
});

for (const [setting, expectedValue, invalidValue] of [
  ['retries', '0', '00'],
  ['maxFailures', '1', '10'],
  ['workers', '1', '10'],
]) {
  test(`rejects ${setting}: ${invalidValue} instead of the required value ${expectedValue}`, async () => {
    const configFile = new URL('playwright.pr.config.ts', rootDirectory);
    const originalConfig = await readFile(configFile, 'utf8');
    const changedConfig = originalConfig.replace(
      `${setting}: ${expectedValue}`,
      `${setting}: ${invalidValue}`,
    );
    assert.notEqual(changedConfig, originalConfig);
    await writeFile(configFile, changedConfig);

    try {
      await assert.rejects(listSmokeTests);
    } finally {
      await writeFile(configFile, originalConfig);
    }
  });
}

test('rejects a semantically nonzero retries expression', async () => {
  const configFile = new URL('playwright.pr.config.ts', rootDirectory);
  const originalConfig = await readFile(configFile, 'utf8');
  const changedConfig = originalConfig.replace('retries: 0', 'retries: 0 + 1');
  assert.notEqual(changedConfig, originalConfig);
  await writeFile(configFile, changedConfig);

  try {
    await assert.rejects(listSmokeTests);
  } finally {
    await writeFile(configFile, originalConfig);
  }
});
