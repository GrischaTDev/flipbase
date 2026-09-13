import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const rootDirectory = new URL('..', import.meta.url);
const projectRoot = fileURLToPath(rootDirectory);
const probeTempArea = new URL('tmp/playwright-pr-smoke-test-temp/', rootDirectory);
const executeFile = promisify(execFile);
const expectedSmokeTests = [
  [
    'product-editor-storefront.spec.ts',
    'Artikel mit Galerie, Zuschnitt und Suchvorschau erstellen 1440',
  ],
  [
    'product-editor-storefront.spec.ts',
    'Shop zeigt den freigegebenen Katalogartikel mit Galerie und echten Metadaten',
  ],
  ['deal-monitor.spec.ts', 'Deal-Monitor pausieren und Merkzettel verwalten light'],
  ['deal-monitor.spec.ts', 'Deal-Monitor pausieren und Merkzettel verwalten dark'],
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
  [
    'sniper-administration.spec.ts',
    'Sammelaufträge anlegen, Fehler beheben, aktivieren und pausieren light',
  ],
  [
    'sniper-administration.spec.ts',
    'Sammelaufträge anlegen, Fehler beheben, aktivieren und pausieren dark',
  ],
];

const readProjectFile = (filePath) => readFile(new URL(filePath, rootDirectory), 'utf8');
const getWorkflowJob = (workflow, jobId) => {
  const matchedJob = workflow.match(
    new RegExp(`^  ${jobId}:\\r?\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:\\r?\\n|(?![\\s\\S]))`, 'm'),
  );
  assert.ok(matchedJob, `Fehlender Workflow-Job: ${jobId}`);
  return matchedJob[1];
};
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
const createSuiteProbe = async (context) => {
  const probeDirectory = await createProbeDirectory();
  context.after(() => rm(probeDirectory, { recursive: true, force: true }));
  // Kopien liegen außerhalb des echten e2e-Baums, auch bei parallelen Läufen oder Abbruch.
  for (const filePath of ['playwright.config.ts', 'playwright.pr.config.ts', 'e2e']) {
    await cp(join(projectRoot, filePath), join(probeDirectory, filePath), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  return {
    configFile: join(probeDirectory, 'playwright.pr.config.ts'),
    testDirectory: join(probeDirectory, 'e2e'),
  };
};
const assertExpectedSmokeTests = (selectedTests) => {
  assert.equal(selectedTests.length, 14);
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
    assert.deepEqual(
      spec.tests.map((test) => test.timeout),
      [60_000],
    );
    return [spec.file.split(/[\\/]/).at(-1), spec.title];
  });
  assertExpectedSmokeTests(selectedTests);
  return selectedTests;
};
const assertResolvedNightlySmokeSuite = (resolvedSuite) => {
  assert.deepEqual(
    resolvedSuite.config.projects.map((project) => [project.name, project.retries]),
    [
      ['chromium', 1],
      ['firefox', 1],
      ['webkit', 1],
    ],
  );

  const selectedTests = collectSpecs(resolvedSuite.suites).map((spec) => {
    assert.ok(spec.tags.includes('pr-smoke'), `Unerwartete Nightly-Auswahl: ${spec.title}`);
    assert.equal(spec.tests.length, 1);
    const [project] = spec.tests;
    assert.ok(['chromium', 'firefox', 'webkit'].includes(project.projectName));
    return [spec.file.split(/[\\/]/).at(-1), spec.title, project.projectName];
  });

  assert.equal(selectedTests.length, 42);
  assert.deepEqual(
    selectedTests.sort(
      ([leftFile, leftTitle, leftProject], [rightFile, rightTitle, rightProject]) =>
        `${leftFile}:${leftTitle}:${leftProject}`.localeCompare(
          `${rightFile}:${rightTitle}:${rightProject}`,
        ),
    ),
    expectedSmokeTests
      .flatMap(([fileName, testName]) =>
        ['chromium', 'firefox', 'webkit'].map((projectName) => [
          fileName,
          `${testName} @pr-smoke`,
          projectName,
        ]),
      )
      .sort(([leftFile, leftTitle, leftProject], [rightFile, rightTitle, rightProject]) =>
        `${leftFile}:${leftTitle}:${leftProject}`.localeCompare(
          `${rightFile}:${rightTitle}:${rightProject}`,
        ),
      ),
  );
};
const listSmokeTests = async (
  configFile = join(projectRoot, 'playwright.pr.config.ts'),
  environment = process.env,
) => {
  const { stdout } = await executeFile(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      `--config=${configFile}`,
      '--list',
      '--reporter=json',
    ],
    { cwd: projectRoot, env: environment },
  );
  return assertResolvedSmokeSuite(JSON.parse(stdout));
};
const listNightlySmokeTests = async (environment = process.env) => {
  const { stdout } = await executeFile(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      `--config=${join(projectRoot, 'playwright.nightly.config.ts')}`,
      '--list',
      '--reporter=json',
    ],
    { cwd: projectRoot, env: environment },
  );
  assertResolvedNightlySmokeSuite(JSON.parse(stdout));
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

test('keeps CI and nightly browser gates on the critical smoke contracts', async () => {
  const [ciWorkflow, nightlyWorkflow, packageJson] = await Promise.all([
    readProjectFile('.github/workflows/ci.yml'),
    readProjectFile('.github/workflows/quality-nightly.yml'),
    readProjectFile('package.json'),
  ]);
  const packageDefinition = JSON.parse(packageJson);
  const browserSmokeJob = getWorkflowJob(ciWorkflow, 'browser-smoke');
  const requiredChecksJob = getWorkflowJob(ciWorkflow, 'required-checks');
  const webkitJob = getWorkflowJob(nightlyWorkflow, 'browser-webkit');
  const firefoxJob = getWorkflowJob(nightlyWorkflow, 'browser-firefox');

  const localEnvironment = { ...process.env };
  delete localEnvironment.CI;
  const ciEnvironment = { ...localEnvironment, CI: 'true' };
  await Promise.all([
    listSmokeTests(undefined, localEnvironment),
    listSmokeTests(undefined, ciEnvironment),
    listNightlySmokeTests(localEnvironment),
    listNightlySmokeTests(ciEnvironment),
  ]);

  assert.match(
    browserSmokeJob,
    /^      - name: Install Chromium Headless Shell\r?\n        run: npx playwright install --with-deps --only-shell chromium\r?$/m,
  );
  assert.match(
    browserSmokeJob,
    /^      - name: Run browser smoke tests\r?\n        run: npm run test:e2e:pr\r?$/m,
  );
  assert.match(
    requiredChecksJob,
    /^    needs: \[changes, quality, unit, database, sniper, browser-smoke, image\]$/m,
  );
  assert.match(
    requiredChecksJob,
    /^          BROWSER_RESULT: \$\{\{ needs\.browser-smoke\.result \}\}$/m,
  );
  assert.equal(
    packageDefinition.scripts['test:e2e:nightly'],
    'playwright test --config=playwright.nightly.config.ts',
  );
  assert.match(
    nightlyWorkflow,
    /^  schedule:\r?\n    # 02:17 Berlin \(Sommerzeit\) - taeglich\r?\n    - cron: '17 0 \* \* \*'\r?\n    # 03:17 Berlin \(Sommerzeit\) - zusaetzlich sonntags\r?\n    - cron: '17 1 \* \* 0'/m,
  );
  assert.match(
    webkitJob,
    /^    if: \$\{\{ needs\.gate\.outputs\.run == 'true' && github\.event\.schedule != '17 1 \* \* 0' \}\}\r?\n[\s\S]*?^      - name: Install WebKit\r?\n        run: npx playwright install --with-deps webkit\r?$\r?\n\s+- name: Run WebKit smoke tests\r?\n        run: npm run test:e2e:nightly -- --project=webkit\r?$/m,
  );
  assert.match(
    firefoxJob,
    /^    if: \$\{\{ needs\.gate\.outputs\.run == 'true' && github\.event\.schedule != '17 0 \* \* \*' \}\}\r?\n[\s\S]*?^      - name: Install Firefox\r?\n        run: npx playwright install --with-deps firefox\r?$\r?\n\s+- name: Run Firefox smoke tests\r?\n        run: npm run test:e2e:nightly -- --project=firefox\r?$/m,
  );
});

test('checks an isolated invalid configuration while the real configuration stays valid and untouched', async (context) => {
  const configFile = new URL('playwright.pr.config.ts', rootDirectory);
  const originalConfig = await readFile(configFile, 'utf8');
  const originalStat = await stat(configFile);
  const probe = await createSuiteProbe(context);
  await listSmokeTests(probe.configFile);
  await writeFile(probe.configFile, originalConfig.replace('retries: 0', 'retries: 1'));
  const results = await Promise.allSettled([listSmokeTests(), listSmokeTests(probe.configFile)]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, 'ERR_ASSERTION');
  assert.equal(await readFile(configFile, 'utf8'), originalConfig);
  assert.equal((await stat(configFile)).mtimeMs, originalStat.mtimeMs);
});

test('rejects an additional nested double-quoted smoke tag inside a describe block', async (context) => {
  const probe = await createSuiteProbe(context);
  await listSmokeTests(probe.configFile);
  const nestedDirectory = join(probe.testDirectory, 'nested');
  await mkdir(nestedDirectory);
  const probeFile = join(nestedDirectory, 'nested.test.ts');
  await writeFile(
    probeFile,
    `import { test } from '@playwright/test';\n\ntest.describe("probe", () => {\n  test("unexpected contract @pr-smoke", async () => {});\n});\n`,
  );
  await assert.rejects(() => listSmokeTests(probe.configFile), { code: 'ERR_ASSERTION' });
  await listSmokeTests();
});

for (const [setting, expectedValue, invalidValue] of [
  ['retries', '0', '00'],
  ['maxFailures', '1', '10'],
  ['workers', '1', '10'],
]) {
  test(`rejects ${setting}: ${invalidValue} instead of the required value ${expectedValue}`, async (context) => {
    const { configFile } = await createSuiteProbe(context);
    await listSmokeTests(configFile);
    const originalConfig = await readFile(configFile, 'utf8');
    const changedConfig = originalConfig.replace(
      `${setting}: ${expectedValue}`,
      `${setting}: ${invalidValue}`,
    );
    assert.notEqual(changedConfig, originalConfig);
    await writeFile(configFile, changedConfig);

    await assert.rejects(() => listSmokeTests(configFile));
  });
}

test('rejects a semantically nonzero retries expression', async (context) => {
  const { configFile } = await createSuiteProbe(context);
  await listSmokeTests(configFile);
  const originalConfig = await readFile(configFile, 'utf8');
  const changedConfig = originalConfig.replace('retries: 0', 'retries: 0 + 1');
  assert.notEqual(changedConfig, originalConfig);
  await writeFile(configFile, changedConfig);

  await assert.rejects(() => listSmokeTests(configFile), { code: 'ERR_ASSERTION' });
});
