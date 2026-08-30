import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parsers as yamlParsers } from 'prettier/plugins/yaml';

const workflowPath = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url));
const expectedExpressions = Object.freeze({
  testGateIf: '${{ always() }}',
  testGateResult: '${{ needs.unit.result }}',
  databaseIf: "${{ needs.changes.outputs.supabase == 'true' }}",
  databaseGateIf: '${{ always() }}',
  databaseGateChangesResult: '${{ needs.changes.result }}',
  databaseGateChanged: '${{ needs.changes.outputs.supabase }}',
  databaseGateDatabaseResult: '${{ needs.database.result }}',
  imageIf: "github.event_name == 'push'",
  deployIf:
    "${{ github.event_name == 'push' && always() && needs.quality.result == 'success' && needs.test-gate.result == 'success' && needs.database-gate.result == 'success' && needs.image.result == 'success' }}",
});
const expectedGateCommand = 'test "$RESULT" = "success"';
const expectedDatabaseGateCommand = `test "$CHANGES_RESULT" = "success"
if [ "$SUPABASE_CHANGED" = "true" ]; then
  test "$DATABASE_RESULT" = "success"
else
  test "$SUPABASE_CHANGED" = "false"
  test "$DATABASE_RESULT" = "skipped"
fi
`;

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

async function loadWorkflow() {
  const source = await readFile(workflowPath, 'utf8');
  // Der YAML-Parser bildet nur die Dokumentstruktur ab. GitHub-Ausdrücke
  // bleiben opaque Skalare und werden unten vollständig als Strings geprüft.
  const ast = await yamlParsers.yaml.parse(source, { filepath: workflowPath });
  return convertYamlNode(ast);
}

function findStep(job, name) {
  return job.steps.find((step) => step.name === name);
}

function assertContainsPatterns(value, patterns) {
  for (const pattern of patterns) assert.match(value, pattern);
}

function normalizeExpressionWhitespace(expression) {
  assert.equal(typeof expression, 'string');
  return expression.replace(/\s+/g, ' ').trim();
}

function assertExactExpression(actual, expected, label) {
  assert.equal(
    normalizeExpressionWhitespace(actual),
    normalizeExpressionWhitespace(expected),
    `${label} muss dem vollständigen Sicherheitsausdruck entsprechen`,
  );
}

function assertTestGateSecurity(gate) {
  assertExactExpression(gate.if, expectedExpressions.testGateIf, 'test-gate.if');
  assert.equal(gate.needs, 'unit');

  const gateStep = findStep(gate, 'Require every unit shard');
  assert.ok(gateStep, 'Der Ergebnisprüfschritt des Test-Gates fehlt');
  assertExactExpression(
    gateStep.env.RESULT,
    expectedExpressions.testGateResult,
    'test-gate RESULT',
  );
  assert.equal(gateStep.run, expectedGateCommand);
}

function assertImageTriggerSecurity(image) {
  assertExactExpression(image.if, expectedExpressions.imageIf, 'image.if');
}

function assertChangesSecurity(changes) {
  assert.equal(changes.outputs.supabase, '${{ steps.filter.outputs.supabase }}');

  const checkout = findStep(changes, 'Check out repository history');
  assert.equal(checkout.with['fetch-depth'], '0');
  assert.equal(checkout.with['persist-credentials'], 'false');

  const filter = findStep(changes, 'Detect Supabase changes');
  assert.equal(filter.id, 'filter');
  assert.deepEqual(filter.env, {
    EVENT_NAME: '${{ github.event_name }}',
    PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
    PUSH_BEFORE_SHA: '${{ github.event.before }}',
    HEAD_SHA: '${{ github.sha }}',
  });
  assert.equal(filter.run, 'node scripts/detect-supabase-changes.mjs');
}

function assertDatabaseSecurity(database) {
  assertExactExpression(database.if, expectedExpressions.databaseIf, 'database.if');
  assert.equal(database.needs, 'changes');

  const checkout = findStep(database, 'Check out repository');
  assert.equal(checkout.with['persist-credentials'], 'false');
  assert.ok(findStep(database, 'Install dependencies'));
  assert.equal(findStep(database, 'Start local Supabase').run, 'npx supabase start');
  assert.equal(findStep(database, 'Test database').run, 'npm run test:db');

  const cleanup = findStep(database, 'Stop local Supabase');
  assertExactExpression(cleanup.if, '${{ always() }}', 'database cleanup.if');
  assert.equal(cleanup.run, 'npx supabase stop --no-backup');
}

function assertDatabaseGateSecurity(gate) {
  assertExactExpression(gate.if, expectedExpressions.databaseGateIf, 'database-gate.if');
  assert.deepEqual(gate.needs, ['changes', 'database']);

  const step = findStep(gate, 'Require the matching database result');
  assert.deepEqual(step.env, {
    CHANGES_RESULT: expectedExpressions.databaseGateChangesResult,
    SUPABASE_CHANGED: expectedExpressions.databaseGateChanged,
    DATABASE_RESULT: expectedExpressions.databaseGateDatabaseResult,
  });
  assert.equal(step.run, expectedDatabaseGateCommand);
}

function assertDeploySecurity(deploy) {
  assert.deepEqual(deploy.needs, ['quality', 'test-gate', 'database-gate', 'image']);
  assertExactExpression(deploy.if, expectedExpressions.deployIf, 'deploy.if');
}

function securityFixtures() {
  return {
    testGate: {
      if: expectedExpressions.testGateIf,
      needs: 'unit',
      steps: [
        {
          name: 'Require every unit shard',
          env: { RESULT: expectedExpressions.testGateResult },
          run: expectedGateCommand,
        },
      ],
    },
    changes: {
      outputs: { supabase: '${{ steps.filter.outputs.supabase }}' },
      steps: [
        {
          name: 'Check out repository history',
          with: { 'fetch-depth': '0', 'persist-credentials': 'false' },
        },
        {
          name: 'Detect Supabase changes',
          id: 'filter',
          env: {
            EVENT_NAME: '${{ github.event_name }}',
            PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
            PUSH_BEFORE_SHA: '${{ github.event.before }}',
            HEAD_SHA: '${{ github.sha }}',
          },
          run: 'node scripts/detect-supabase-changes.mjs',
        },
      ],
    },
    databaseGate: {
      if: expectedExpressions.databaseGateIf,
      needs: ['changes', 'database'],
      steps: [
        {
          name: 'Require the matching database result',
          env: {
            CHANGES_RESULT: expectedExpressions.databaseGateChangesResult,
            SUPABASE_CHANGED: expectedExpressions.databaseGateChanged,
            DATABASE_RESULT: expectedExpressions.databaseGateDatabaseResult,
          },
          run: expectedDatabaseGateCommand,
        },
      ],
    },
    image: { if: expectedExpressions.imageIf },
    deploy: {
      needs: ['quality', 'test-gate', 'database-gate', 'image'],
      if: expectedExpressions.deployIf,
    },
  };
}

test('weist eine permissive Deploy-Erweiterung mit || true zurück', () => {
  const { deploy } = securityFixtures();
  deploy.if = deploy.if.replace(' }}', ' || true }}');

  assert.throws(() => assertDeploySecurity(deploy), /deploy\.if/);
});

test('weist ein Test-Gate zurück, das Fehler nur indirekt ausschließt', () => {
  const { testGate } = securityFixtures();
  findStep(testGate, 'Require every unit shard').run = 'test "$RESULT" != "failure"';

  assert.throws(() => assertTestGateSecurity(testGate));
});

test('weist eine Image-Bedingung zurück, die auch Pull Requests zulässt', () => {
  const { image } = securityFixtures();
  image.if = "github.event_name == 'push' || github.event_name == 'pull_request'";

  assert.throws(() => assertImageTriggerSecurity(image), /image\.if/);
});

test('weist ein Datenbank-Gate zurück, das einen fehlgeschlagenen Changes-Job durchlässt', () => {
  const { databaseGate } = securityFixtures();
  findStep(databaseGate, 'Require the matching database result').run =
    'test "$DATABASE_RESULT" != "failure"';

  assert.throws(() => assertDatabaseGateSecurity(databaseGate));
});

test('weist ein Datenbank-Gate zurück, das skipped bei Supabase-Änderungen akzeptiert', () => {
  const { databaseGate } = securityFixtures();
  findStep(databaseGate, 'Require the matching database result').run =
    expectedDatabaseGateCommand.replace('= "success"', '= "skipped"');

  assert.throws(() => assertDatabaseGateSecurity(databaseGate));
});

test('parallelisiert Quality und die vollständige Unit-Matrix hinter einem Test-Gate', async () => {
  const { jobs } = await loadWorkflow();

  assert.deepEqual(Object.keys(jobs).sort(), [
    'changes',
    'database',
    'database-gate',
    'deploy',
    'image',
    'quality',
    'test-gate',
    'unit',
  ]);
  assert.equal(jobs.quality['timeout-minutes'], '5');
  assert.deepEqual(
    jobs.quality.steps.filter((step) => step.run).map((step) => step.run),
    ['npm ci', 'npm run format:check', 'npm run lint', 'npm run typecheck', 'npm run build'],
  );

  const unit = jobs.unit;
  assert.equal(unit['timeout-minutes'], '5');
  assert.equal(unit.strategy['fail-fast'], 'false');
  assert.deepEqual(unit.strategy.matrix.include, [
    { suite: 'node', shard: '1/2' },
    { suite: 'node', shard: '2/2' },
    { suite: 'dom', shard: '1/1' },
    { suite: 'angular', shard: '1/1' },
  ]);

  const orchestrator = findStep(unit, 'Test orchestrator contracts once');
  assert.equal(orchestrator.if, "matrix.suite == 'node' && matrix.shard == '1/2'");
  assert.equal(orchestrator.run, 'npm run test:orchestrator');

  const suites = findStep(unit, 'Run test suite');
  assertContainsPatterns(suites.run, [
    /npm run test:node:shard -- --shard="\$SHARD"/,
    /npm run "test:\$SUITE" -- --shard="\$SHARD"/,
  ]);

  const gate = jobs['test-gate'];
  assertTestGateSecurity(gate);
});

test('erkennt Supabase-Änderungen vollständig und führt den lokalen Datenbanktest bedingt aus', async () => {
  const { jobs } = await loadWorkflow();

  assertChangesSecurity(jobs.changes);
  assertDatabaseSecurity(jobs.database);
  assertDatabaseGateSecurity(jobs['database-gate']);
});

test('baut nur bei Push parallel ein unveränderliches Kandidatenimage', async () => {
  const { jobs } = await loadWorkflow();
  const image = jobs.image;

  assert.equal(image.needs, undefined);
  assertImageTriggerSecurity(image);
  const tagStep = findStep(image, 'Determine image tag');
  assert.match(tagStep.run, /sha-\$\{GITHUB_SHA::7\}/);

  const buildStep = findStep(image, 'Build and push');
  assert.equal(buildStep.with.tags, '${{ env.IMAGE }}:${{ steps.tag.outputs.value }}');
  assert.equal(buildStep.with['cache-from'], 'type=gha');
  assert.equal(buildStep.with['cache-to'], 'type=gha,mode=max');
  assertContainsPatterns(buildStep.with['build-args'], [
    /FLIPBASE_COMMIT=\$\{\{ github\.sha \}\}/,
    /FLIPBASE_COMMIT_DATE=\$\{\{ github\.event\.repository\.updated_at \}\}/,
  ]);

  assert.ok(findStep(image, 'Write the production environment file'));
  assert.ok(findStep(image, 'Set up Buildx'));
  assert.ok(findStep(image, 'Log in to the container registry'));
});

test('deployt nur nach allen erfolgreichen Gates und behält die Sicherheitsprüfungen', async () => {
  const { jobs } = await loadWorkflow();
  const deploy = jobs.deploy;

  assertDeploySecurity(deploy);

  assert.ok(findStep(deploy, 'Set up SSH'));
  assert.ok(findStep(deploy, 'Check that all migrations are applied'));
  const deployment = findStep(deploy, 'Deploy the image and wait for the container to be healthy');
  assert.equal(deployment.env.TAG, '${{ needs.image.outputs.tag }}');
  assert.match(deployment.run, /ssh .*"\$TAG"/);
  const publicHealth = findStep(deploy, 'Check the public address');
  assert.match(publicHealth.run, /curl --fail .*https:\/\/app\.flipbase\.de\/healthz/);

  for (const job of Object.values(jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/);
    }
  }
});
