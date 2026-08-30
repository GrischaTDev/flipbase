import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parsers as yamlParsers } from 'prettier/plugins/yaml';

const workflowPath = fileURLToPath(
  new URL('../.github/workflows/quality-nightly.yml', import.meta.url),
);
const checkoutSha = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const setupNodeSha = '820762786026740c76f36085b0efc47a31fe5020';
const uploadSha = '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const failureUploadIf = '${{ failure() || cancelled() }}';
const jobMetadata = {
  coverage: {
    name: 'Full coverage',
    'runs-on': 'ubuntu-latest',
    'timeout-minutes': 10,
  },
  'node-stress': {
    name: 'Node order stress',
    'runs-on': 'ubuntu-latest',
    'timeout-minutes': 15,
  },
  'database-full': {
    name: 'Full local database checks',
    'runs-on': 'ubuntu-latest',
    'timeout-minutes': 20,
  },
  'browser-matrix': {
    name: 'Browser smoke (${{ matrix.browser }})',
    'runs-on': 'ubuntu-latest',
    'timeout-minutes': 15,
  },
};

function nodeSetupSteps() {
  return [
    {
      name: 'Check out repository',
      uses: `actions/checkout@${checkoutSha}`,
      with: { 'persist-credentials': false },
    },
    {
      name: 'Set up Node',
      uses: `actions/setup-node@${setupNodeSha}`,
      with: {
        'node-version': '22',
        cache: 'npm',
        'cache-dependency-path': 'package-lock.json',
      },
    },
    { name: 'Install dependencies', run: 'npm ci' },
  ];
}

function expectedJobSteps() {
  return {
    coverage: [
      ...nodeSetupSteps(),
      { name: 'Run full coverage', run: 'npm run test:coverage' },
      {
        name: 'Upload coverage report',
        if: '${{ always() }}',
        uses: `actions/upload-artifact@${uploadSha}`,
        with: {
          name: 'nightly-coverage',
          path: 'coverage/',
          'if-no-files-found': 'ignore',
          'retention-days': 7,
        },
      },
    ],
    'node-stress': [
      ...nodeSetupSteps(),
      {
        name: 'Run 20 shuffled Node suites',
        env: {
          GITHUB_RUN_ID: '${{ github.run_id }}',
          GITHUB_RUN_ATTEMPT: '${{ github.run_attempt }}',
        },
        shell: 'bash',
        run: 'npm run test:stress:20 2>&1 | tee node-stress.log',
      },
      {
        name: 'Upload stress failure log',
        if: failureUploadIf,
        uses: `actions/upload-artifact@${uploadSha}`,
        with: {
          name: 'nightly-node-stress-failure',
          path: 'node-stress.log',
          'if-no-files-found': 'ignore',
          'retention-days': 7,
        },
      },
    ],
    'database-full': [
      ...nodeSetupSteps(),
      { name: 'Start local Supabase', run: 'npx supabase start' },
      {
        name: 'Run pgTAP suite',
        shell: 'bash',
        run: 'npm run test:db 2>&1 | tee -a database-full.log',
      },
      {
        name: 'Run immediate upgrade harness',
        shell: 'bash',
        run: 'pwsh -NoProfile -File supabase/test-support/manual/inventory_integrity_upgrade.ps1 2>&1 | tee -a database-full.log',
      },
      {
        name: 'Run legacy sale-line migration harness',
        shell: 'bash',
        run: 'pwsh -NoProfile -File supabase/test-support/manual/run_inventory_sales_legacy_migration.ps1 2>&1 | tee -a database-full.log',
      },
      {
        name: 'Run parallel sale harness',
        shell: 'bash',
        run: 'pwsh -NoProfile -File supabase/test-support/manual/inventory_double_sale.ps1 2>&1 | tee -a database-full.log',
      },
      {
        name: 'Stop local Supabase',
        if: '${{ always() }}',
        run: 'npx supabase stop --no-backup',
      },
      {
        name: 'Upload database failure logs',
        if: failureUploadIf,
        uses: `actions/upload-artifact@${uploadSha}`,
        with: {
          name: 'nightly-database-failure',
          path: 'database-full.log\nsupabase/.temp/logs/\n',
          'if-no-files-found': 'ignore',
          'retention-days': 7,
        },
      },
    ],
    'browser-matrix': [
      ...nodeSetupSteps(),
      {
        name: 'Install selected browser',
        run: 'npx playwright install --with-deps ${{ matrix.browser }}',
      },
      {
        name: 'Run selected browser smoke tests',
        run: 'npm run test:e2e:nightly -- --project=${{ matrix.browser }}',
      },
      {
        name: 'Upload browser failure artifacts',
        if: failureUploadIf,
        uses: `actions/upload-artifact@${uploadSha}`,
        with: {
          name: 'nightly-browser-${{ matrix.browser }}-failure',
          path: 'playwright-report/\ntest-results/\n',
          'if-no-files-found': 'ignore',
          'retention-days': 7,
        },
      },
    ],
  };
}

function convertYamlNode(node) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'mapping') {
    return Object.fromEntries(
      node.children.map((item) => {
        const [keyNode, valueNode] = item.children;
        return [convertYamlNode(keyNode), convertYamlNode(valueNode)];
      }),
    );
  }
  if (node.type === 'sequence' || node.type === 'flowSequence') {
    return node.children.map(convertYamlNode);
  }
  if (Object.hasOwn(node, 'value')) {
    if (node.type !== 'plain' || node.tag !== null) return node.value;
    if (['true', 'True', 'TRUE'].includes(node.value)) return true;
    if (['false', 'False', 'FALSE'].includes(node.value)) return false;
    if (['null', 'Null', 'NULL', '~'].includes(node.value)) return null;

    if (/^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(node.value)) {
      const numberValue = Number(node.value);
      const significantDigits = node.value
        .replace(/^[+-]/, '')
        .replace(/[eE].*$/, '')
        .replace('.', '')
        .replace(/^0+/, '').length;
      if (
        Number.isFinite(numberValue) &&
        (Number.isSafeInteger(numberValue) ||
          (!Number.isInteger(numberValue) && significantDigits <= 15))
      ) {
        return numberValue;
      }
    }
    return node.value;
  }
  const children = (node.children ?? [])
    .map(convertYamlNode)
    .filter((value) => value !== undefined);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return children;
}

async function parseWorkflow(source, path = workflowPath) {
  const ast = await yamlParsers.yaml.parse(source, { filepath: path });
  return convertYamlNode(ast);
}

function step(job, name) {
  return job.steps.find((candidate) => candidate.name === name);
}

function assertExactKeys(value, expectedKeys, label) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expectedKeys].sort(),
    `${label} darf ausschließlich die freigegebenen Schlüssel enthalten`,
  );
}

function assertExactWorkflowShape(workflow) {
  assertExactKeys(workflow, ['name', 'on', 'permissions', 'jobs'], 'Workflow');
  assert.equal(workflow.name, 'Nightly full quality checks');
  assertExactKeys(workflow.on, ['schedule', 'workflow_dispatch'], 'Workflow-Trigger');
  assertExactKeys(workflow.permissions, ['contents'], 'Workflow-Berechtigungen');
  assertExactKeys(workflow.jobs, Object.keys(jobMetadata), 'Workflow-Jobs');

  for (const [jobName, expectedMetadata] of Object.entries(jobMetadata)) {
    const job = workflow.jobs[jobName];
    const expectedKeys = ['name', 'runs-on', 'timeout-minutes', 'steps'];
    if (jobName === 'browser-matrix') expectedKeys.push('strategy');
    assertExactKeys(job, expectedKeys, `Job ${jobName}`);
    assert.equal(job.name, expectedMetadata.name);
    assert.equal(job['runs-on'], expectedMetadata['runs-on']);
    assert.equal(job['timeout-minutes'], expectedMetadata['timeout-minutes']);
  }

  const strategy = workflow.jobs['browser-matrix'].strategy;
  assertExactKeys(strategy, ['fail-fast', 'matrix'], 'Browser-Strategy');
  assertExactKeys(strategy.matrix, ['browser'], 'Browser-Matrix');
  assert.equal(strategy['fail-fast'], false);
  assert.deepEqual(strategy.matrix.browser, ['chromium', 'firefox', 'webkit']);
}

function assertNoRemoteOrProductionCredentials(jobs) {
  const serialized = JSON.stringify(jobs);
  assert.doesNotMatch(serialized, /https?:\/\//i, 'Nightly-Jobs dürfen keine Remote-URL enthalten');
  assert.doesNotMatch(
    serialized,
    /\$\{\{\s*secrets\./i,
    'Nightly-Jobs dürfen keinen GitHub-Secrets-Kontext verwenden',
  );
  assert.doesNotMatch(
    serialized,
    /\b(?:SUPABASE_(?:URL|DB_URL|SERVICE_ROLE_KEY)|DATABASE_URL|SERVICE_ROLE_KEY|PRODUCTION_[A-Z0-9_]*|PROD_[A-Z0-9_]*)\b/i,
    'Nightly-Jobs dürfen keine Produktions- oder privilegierten Variablen verwenden',
  );
}

function assertPinnedActions(jobs) {
  for (const job of Object.values(jobs)) {
    assert.equal(job['continue-on-error'], undefined);
    for (const actionStep of job.steps ?? []) {
      assert.equal(actionStep['continue-on-error'], undefined);
      if (actionStep.uses) assert.match(actionStep.uses, /@[0-9a-f]{40}$/);
    }
  }
}

function assertExactStepAllowlists(jobs) {
  for (const [jobName, expectedSteps] of Object.entries(expectedJobSteps())) {
    const actualSteps = jobs[jobName].steps;
    assert.equal(
      actualSteps.length,
      expectedSteps.length,
      `${jobName} darf ausschließlich ${expectedSteps.length} freigegebene Schritte enthalten`,
    );
    for (const [index, expectedStep] of expectedSteps.entries()) {
      assert.deepEqual(
        actualSteps[index],
        expectedStep,
        `${jobName}.steps[${index}] muss vollständig der Allowlist entsprechen`,
      );
    }
  }
}

function assertUploadAllowlists(jobs) {
  const expected = {
    coverage: { name: 'Upload coverage report', if: '${{ always() }}' },
    'node-stress': { name: 'Upload stress failure log', if: failureUploadIf },
    'database-full': { name: 'Upload database failure logs', if: failureUploadIf },
    'browser-matrix': { name: 'Upload browser failure artifacts', if: failureUploadIf },
  };
  for (const [jobName, policy] of Object.entries(expected)) {
    const uploads = jobs[jobName].steps.filter((candidate) =>
      candidate.uses?.startsWith('actions/upload-artifact@'),
    );
    assert.equal(uploads.length, 1, `${jobName} darf genau einen Artefakt-Upload enthalten`);
    assert.equal(uploads[0].name, policy.name);
    assert.equal(uploads[0].if, policy.if);
    assert.equal(uploads[0].uses, `actions/upload-artifact@${uploadSha}`);
    assert.equal(uploads[0].with['retention-days'], 7);
  }
}

function assertDatabaseLocalOnly(database) {
  const allowedRuns = expectedJobSteps()
    ['database-full'].filter((candidate) => candidate.run)
    .map((candidate) => candidate.run);
  const actualRuns = database.steps
    .filter((candidate) => candidate.run)
    .map((candidate) => candidate.run);
  assert.deepEqual(
    actualRuns,
    allowedRuns,
    'database-full darf nur lokale freigegebene Befehle ausführen',
  );

  const forbiddenCommand =
    /--linked|\bsupabase\s+link\b|\bsupabase\s+db\s+push\b|https?:\/\/[^\s"']*\.supabase\.co\b/i;
  for (const command of actualRuns) assert.doesNotMatch(command, forbiddenCommand);
  const serialized = JSON.stringify(database);
  assert.doesNotMatch(
    serialized,
    /SUPABASE_(?:URL|DB_URL|SERVICE_ROLE_KEY)|SERVICE_ROLE_KEY|PRODUCTION/i,
  );
}

function assertSelectedBrowserOnly(browser) {
  const installSteps = browser.steps.filter((candidate) =>
    candidate.run?.includes('playwright install'),
  );
  const browserRuns = browser.steps.filter((candidate) =>
    candidate.run?.includes('test:e2e:nightly'),
  );
  assert.deepEqual(installSteps, [
    {
      name: 'Install selected browser',
      run: 'npx playwright install --with-deps ${{ matrix.browser }}',
    },
  ]);
  assert.deepEqual(browserRuns, [
    {
      name: 'Run selected browser smoke tests',
      run: 'npm run test:e2e:nightly -- --project=${{ matrix.browser }}',
    },
  ]);
}

function assertNodeSetup(job) {
  assert.equal(step(job, 'Check out repository').uses, `actions/checkout@${checkoutSha}`);
  assert.equal(step(job, 'Check out repository').with['persist-credentials'], false);
  assert.equal(step(job, 'Set up Node').uses, `actions/setup-node@${setupNodeSha}`);
  assert.equal(step(job, 'Set up Node').with['node-version'], '22');
  assert.equal(step(job, 'Install dependencies').run, 'npm ci');
}

function assertUpload(upload, expectedIf) {
  assert.equal(upload.uses, `actions/upload-artifact@${uploadSha}`);
  assert.equal(upload.if, expectedIf);
  assert.equal(upload.with['retention-days'], 7);
}

function assertFailClosedPipeline(pipelineStep) {
  assert.match(pipelineStep.run, /\| tee(?: -a)? /);
  assert.equal(pipelineStep.shell, 'bash');
}

function assertNightlyWorkflow(workflow) {
  assertNoRemoteOrProductionCredentials(workflow.jobs);
  assertExactWorkflowShape(workflow);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(workflow.on.schedule.length, 1);
  assert.match(workflow.on.schedule[0].cron, /^[0-9]+ [0-9]+ \* \* \*$/);
  assert.notEqual(workflow.on.schedule[0].cron.split(' ')[0], '0');
  assert.equal(workflow.on.schedule[0].timezone, 'Europe/Berlin');

  const { jobs } = workflow;
  assert.deepEqual(Object.keys(jobs).sort(), [
    'browser-matrix',
    'coverage',
    'database-full',
    'node-stress',
  ]);
  for (const job of Object.values(jobs)) assert.equal(job.needs, undefined);
  assertPinnedActions(jobs);
  assertExactStepAllowlists(jobs);
  assertUploadAllowlists(jobs);

  assertNodeSetup(jobs.coverage);
  assert.equal(step(jobs.coverage, 'Run full coverage').run, 'npm run test:coverage');
  assertUpload(step(jobs.coverage, 'Upload coverage report'), '${{ always() }}');
  assert.match(step(jobs.coverage, 'Upload coverage report').with.path, /coverage\//);

  assertNodeSetup(jobs['node-stress']);
  const stressRun = step(jobs['node-stress'], 'Run 20 shuffled Node suites');
  assert.equal(stressRun.run, 'npm run test:stress:20 2>&1 | tee node-stress.log');
  assertFailClosedPipeline(stressRun);
  assert.equal(stressRun.env.GITHUB_RUN_ID, '${{ github.run_id }}');
  assert.equal(stressRun.env.GITHUB_RUN_ATTEMPT, '${{ github.run_attempt }}');
  assertUpload(step(jobs['node-stress'], 'Upload stress failure log'), failureUploadIf);

  const database = jobs['database-full'];
  assertDatabaseLocalOnly(database);
  assertNodeSetup(database);
  assert.equal(step(database, 'Start local Supabase').run, 'npx supabase start');
  const pgTap = step(database, 'Run pgTAP suite');
  assert.equal(pgTap.run, 'npm run test:db 2>&1 | tee -a database-full.log');
  assertFailClosedPipeline(pgTap);
  assert.equal(
    step(database, 'Run immediate upgrade harness').run,
    'pwsh -NoProfile -File supabase/test-support/manual/inventory_integrity_upgrade.ps1 2>&1 | tee -a database-full.log',
  );
  assert.equal(
    step(database, 'Run legacy sale-line migration harness').run,
    'pwsh -NoProfile -File supabase/test-support/manual/run_inventory_sales_legacy_migration.ps1 2>&1 | tee -a database-full.log',
  );
  assert.equal(
    step(database, 'Run parallel sale harness').run,
    'pwsh -NoProfile -File supabase/test-support/manual/inventory_double_sale.ps1 2>&1 | tee -a database-full.log',
  );
  for (const name of [
    'Run immediate upgrade harness',
    'Run legacy sale-line migration harness',
    'Run parallel sale harness',
  ]) {
    assertFailClosedPipeline(step(database, name));
  }
  const cleanup = step(database, 'Stop local Supabase');
  assert.equal(cleanup.if, '${{ always() }}');
  assert.equal(cleanup.run, 'npx supabase stop --no-backup');
  assertUpload(step(database, 'Upload database failure logs'), failureUploadIf);

  const browser = jobs['browser-matrix'];
  assertSelectedBrowserOnly(browser);
  assertNodeSetup(browser);
  assert.equal(browser.strategy['fail-fast'], false);
  assert.deepEqual(browser.strategy.matrix.browser, ['chromium', 'firefox', 'webkit']);
  assert.equal(
    step(browser, 'Install selected browser').run,
    'npx playwright install --with-deps ${{ matrix.browser }}',
  );
  assert.equal(
    step(browser, 'Run selected browser smoke tests').run,
    'npm run test:e2e:nightly -- --project=${{ matrix.browser }}',
  );
  assertUpload(step(browser, 'Upload browser failure artifacts'), failureUploadIf);
}

async function loadNightlyWorkflow() {
  return parseWorkflow(await readFile(workflowPath, 'utf8'));
}

test('normalisiert ausschließlich sichere ungequotierte YAML-Skalare', async () => {
  const expression = '$' + '{{ matrix.browser }}';
  const workflow = await parseWorkflow(`
plainFalse: false
quotedFalse: 'false'
plainNumber: 15
quotedNumber: '15'
plainNull: null
quotedNull: 'null'
unsafeNumber: 9007199254740992
expression: ${expression}
cron: '17 2 * * *'
`);

  assert.deepEqual(workflow, {
    plainFalse: false,
    quotedFalse: 'false',
    plainNumber: 15,
    quotedNumber: '15',
    plainNull: null,
    quotedNull: 'null',
    unsafeNumber: '9007199254740992',
    expression: '${{ matrix.browser }}',
    cron: '17 2 * * *',
  });
});

for (const [name, original, replacement] of [
  ['gequotetes fail-fast', 'fail-fast: false', "fail-fast: 'false'"],
  ['gequoteten Job-Timeout', 'timeout-minutes: 15', "timeout-minutes: '15'"],
  ['gequotierte Artefakt-Aufbewahrung', 'retention-days: 7', "retention-days: '7'"],
  [
    'gequotiertes boolesches Action-Input',
    'persist-credentials: false',
    "persist-credentials: 'false'",
  ],
  ['ungequotiertes numerisches Action-Input', "node-version: '22'", 'node-version: 22'],
]) {
  test(`weist ${name} zurück`, async () => {
    const source = await readFile(workflowPath, 'utf8');
    const mutatedSource = source.replace(original, replacement);
    assert.notEqual(mutatedSource, source, `Fixture muss ${original} ersetzen`);
    const workflow = await parseWorkflow(mutatedSource);
    assert.throws(() => assertNightlyWorkflow(workflow));
  });
}

function extraUploadStep(name) {
  return {
    name,
    if: '${{ always() }}',
    uses: `actions/upload-artifact@${uploadSha}`,
    with: {
      name: 'unexpected-artifact',
      path: 'unexpected/',
      'retention-days': 7,
    },
  };
}

test('erzwingt die vollständige fail-closed Nightly-Matrix', async () => {
  assertNightlyWorkflow(await loadNightlyWorkflow());
});

for (const [name, mutate] of [
  [
    'bewegliche Action-Tags',
    (workflow) =>
      (step(workflow.jobs.coverage, 'Check out repository').uses = 'actions/checkout@v7'),
  ],
  [
    'nur einen Stresslauf',
    (workflow) =>
      (step(workflow.jobs['node-stress'], 'Run 20 shuffled Node suites').run =
        'npm run test:stress'),
  ],
  [
    'fehlendes WebKit',
    (workflow) =>
      (workflow.jobs['browser-matrix'].strategy.matrix.browser = ['chromium', 'firefox']),
  ],
  [
    'continue-on-error',
    (workflow) => (step(workflow.jobs.coverage, 'Run full coverage')['continue-on-error'] = 'true'),
  ],
  [
    'linked Supabase',
    (workflow) =>
      (step(workflow.jobs['database-full'], 'Run pgTAP suite').run = 'supabase test db --linked'),
  ],
  [
    'Erfolgs-Upload von Fehlerartefakten',
    (workflow) =>
      (step(workflow.jobs['node-stress'], 'Upload stress failure log').if = '${{ success() }}'),
  ],
  [
    'fehlenden DB-Cleanup',
    (workflow) =>
      (workflow.jobs['database-full'].steps = workflow.jobs['database-full'].steps.filter(
        (candidate) => candidate.name !== 'Stop local Supabase',
      )),
  ],
  [
    'eine Pipeline ohne Pipefail-Shell',
    (workflow) => delete step(workflow.jobs['database-full'], 'Run pgTAP suite').shell,
  ],
  [
    'einen zusätzlichen Datenbank-Push',
    (workflow) =>
      workflow.jobs['database-full'].steps.push({
        name: 'Push database',
        run: 'npx supabase db push',
      }),
  ],
  [
    'ein zusätzliches Supabase-Link-Kommando',
    (workflow) =>
      workflow.jobs['database-full'].steps.push({
        name: 'Link database',
        run: 'npx supabase link --project-ref production',
      }),
  ],
  [
    'eine beliebige Supabase-Remote-URL',
    (workflow) =>
      workflow.jobs['database-full'].steps.push({
        name: 'Probe remote database',
        run: 'curl https://projekt.supabase.co',
      }),
  ],
  [
    'eine Service-Role-Umgebungsvariable',
    (workflow) =>
      (step(workflow.jobs['database-full'], 'Start local Supabase').env = {
        SUPABASE_SERVICE_ROLE_KEY: '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
      }),
  ],
  [
    'einen zusätzlichen Stress-Upload mit always()',
    (workflow) =>
      workflow.jobs['node-stress'].steps.push(extraUploadStep('Upload extra stress artifact')),
  ],
  [
    'einen zusätzlichen Datenbank-Upload mit always()',
    (workflow) =>
      workflow.jobs['database-full'].steps.push(extraUploadStep('Upload extra database artifact')),
  ],
  [
    'einen zusätzlichen Browser-Upload mit always()',
    (workflow) =>
      workflow.jobs['browser-matrix'].steps.push(extraUploadStep('Upload extra browser artifact')),
  ],
  [
    'die Installation aller Browser',
    (workflow) =>
      (step(workflow.jobs['browser-matrix'], 'Install selected browser').run =
        'npx playwright install --with-deps'),
  ],
  [
    'einen Browserlauf ohne ausgewähltes Projekt',
    (workflow) =>
      (step(workflow.jobs['browser-matrix'], 'Run selected browser smoke tests').run =
        'npm run test:e2e:nightly'),
  ],
  [
    'einen beliebigen zusätzlichen Schritt',
    (workflow) => workflow.jobs.coverage.steps.push({ name: 'Unexpected step', run: 'echo extra' }),
  ],
  [
    'jobweite Schreibrechte in der Browsermatrix',
    (workflow) => (workflow.jobs['browser-matrix'].permissions = 'write-all'),
  ],
  [
    'ein jobweites Service-Role-Secret außerhalb des Datenbankjobs',
    (workflow) =>
      (workflow.jobs['node-stress'].env = {
        SUPABASE_SERVICE_ROLE_KEY: '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
      }),
  ],
  [
    'ein globales Secret',
    (workflow) =>
      (workflow.env = {
        PRODUCTION_TOKEN: '${{ secrets.PRODUCTION_TOKEN }}',
      }),
  ],
  ['globale Defaults', (workflow) => (workflow.defaults = { run: { shell: 'bash' } })],
  ['globale Concurrency', (workflow) => (workflow.concurrency = { group: 'nightly' })],
  [
    'jobweite Services',
    (workflow) => (workflow.jobs.coverage.services = { postgres: { image: 'postgres:18' } }),
  ],
  ['jobweite Secrets', (workflow) => (workflow.jobs.coverage.secrets = 'inherit')],
  ['einen jobweiten Container', (workflow) => (workflow.jobs.coverage.container = 'node:22')],
  ['eine jobweite Bedingung', (workflow) => (workflow.jobs.coverage.if = '${{ success() }}')],
  [
    'jobweites continue-on-error',
    (workflow) => (workflow.jobs.coverage['continue-on-error'] = 'true'),
  ],
  [
    'einen Strategy-Zusatz',
    (workflow) => (workflow.jobs['browser-matrix'].strategy['max-parallel'] = '1'),
  ],
  [
    'ein Matrix-Include',
    (workflow) =>
      (workflow.jobs['browser-matrix'].strategy.matrix.include = [{ browser: 'chromium' }]),
  ],
  [
    'eine zusätzliche Matrix-Achse',
    (workflow) => (workflow.jobs['browser-matrix'].strategy.matrix.os = ['ubuntu-latest']),
  ],
  [
    'eine Remote-URL außerhalb des Datenbankjobs',
    (workflow) =>
      (step(workflow.jobs.coverage, 'Run full coverage').env = {
        REPORT_URL: 'https://reports.example.com',
      }),
  ],
]) {
  test(`weist ${name} zurück`, async () => {
    const workflow = await loadNightlyWorkflow();
    mutate(workflow);
    assert.throws(() => assertNightlyWorkflow(workflow));
  });
}
