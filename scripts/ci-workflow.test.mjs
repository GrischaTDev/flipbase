import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const workflowPath = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url));

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
  const { ast } = await prettier.__debug.parse(source, { parser: 'yaml' });
  return convertYamlNode(ast);
}

function findStep(job, name) {
  return job.steps.find((step) => step.name === name);
}

function expressionContainsAll(expression, fragments) {
  for (const fragment of fragments) assert.match(expression, fragment);
}

test('parallelisiert Quality und die vollständige Unit-Matrix hinter einem Test-Gate', async () => {
  const { jobs } = await loadWorkflow();

  assert.deepEqual(Object.keys(jobs).sort(), ['deploy', 'image', 'quality', 'test-gate', 'unit']);
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
  expressionContainsAll(suites.run, [
    /npm run test:node:shard -- --shard="\$SHARD"/,
    /npm run "test:\$SUITE" -- --shard="\$SHARD"/,
  ]);

  const gate = jobs['test-gate'];
  assert.equal(gate.if, '${{ always() }}');
  assert.equal(gate.needs, 'unit');
  const gateStep = findStep(gate, 'Require every unit shard');
  assert.equal(gateStep.env.RESULT, '${{ needs.unit.result }}');
  assert.equal(gateStep.run, 'test "$RESULT" = "success"');
});

test('baut nur bei Push parallel ein unveränderliches Kandidatenimage', async () => {
  const { jobs } = await loadWorkflow();
  const image = jobs.image;

  assert.equal(image.needs, undefined);
  assert.equal(image.if, "github.event_name == 'push'");
  const tagStep = findStep(image, 'Determine image tag');
  assert.match(tagStep.run, /sha-\$\{GITHUB_SHA::7\}/);

  const buildStep = findStep(image, 'Build and push');
  assert.equal(buildStep.with.tags, '${{ env.IMAGE }}:${{ steps.tag.outputs.value }}');
  assert.equal(buildStep.with['cache-from'], 'type=gha');
  assert.equal(buildStep.with['cache-to'], 'type=gha,mode=max');
  expressionContainsAll(buildStep.with['build-args'], [
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

  assert.deepEqual(deploy.needs, ['quality', 'test-gate', 'image']);
  expressionContainsAll(deploy.if, [
    /github\.event_name == 'push'/,
    /always\(\)/,
    /needs\.quality\.result == 'success'/,
    /needs\.test-gate\.result == 'success'/,
    /needs\.image\.result == 'success'/,
  ]);

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
