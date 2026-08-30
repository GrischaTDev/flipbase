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
  if (Object.hasOwn(node, 'value')) return node.value;
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

function assertPinnedActions(jobs) {
  for (const job of Object.values(jobs)) {
    assert.equal(job['continue-on-error'], undefined);
    for (const actionStep of job.steps ?? []) {
      assert.equal(actionStep['continue-on-error'], undefined);
      if (actionStep.uses) assert.match(actionStep.uses, /@[0-9a-f]{40}$/);
    }
  }
}

function assertNodeSetup(job) {
  assert.equal(step(job, 'Check out repository').uses, `actions/checkout@${checkoutSha}`);
  assert.equal(step(job, 'Check out repository').with['persist-credentials'], 'false');
  assert.equal(step(job, 'Set up Node').uses, `actions/setup-node@${setupNodeSha}`);
  assert.equal(step(job, 'Set up Node').with['node-version'], '22');
  assert.equal(step(job, 'Install dependencies').run, 'npm ci');
}

function assertUpload(upload, expectedIf) {
  assert.equal(upload.uses, `actions/upload-artifact@${uploadSha}`);
  assert.equal(upload.if, expectedIf);
  assert.equal(upload.with['retention-days'], '7');
}

function assertFailClosedPipeline(pipelineStep) {
  assert.match(pipelineStep.run, /\| tee(?: -a)? /);
  assert.equal(pipelineStep.shell, 'bash');
}

function assertNightlyWorkflow(workflow) {
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
  assertNodeSetup(browser);
  assert.equal(browser.strategy['fail-fast'], 'false');
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

  const serialized = JSON.stringify(workflow);
  assert.doesNotMatch(serialized, /--linked|SUPABASE_(URL|DB_URL)|api\.flipbase\.de/);
}

async function loadNightlyWorkflow() {
  return parseWorkflow(await readFile(workflowPath, 'utf8'));
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
]) {
  test(`weist ${name} zurück`, async () => {
    const workflow = await loadNightlyWorkflow();
    mutate(workflow);
    assert.throws(() => assertNightlyWorkflow(workflow));
  });
}
