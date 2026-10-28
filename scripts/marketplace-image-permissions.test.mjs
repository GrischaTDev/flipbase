import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/marketplace-worker-image.yml', import.meta.url),
  'utf8',
);
const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const jobBlocks = workflow
  .split(/^jobs:\s*$/m)[1]
  .split(/(?=^  [a-z][\w-]*:\s*$)/m)
  .filter((block) => block.trim());
const jobHeaders = jobBlocks.map((block) => block.split(/^    steps:/m)[0]);

test('wiederverwendete Imageprüfung erhält ausschließlich Leserechte', () => {
  assert.match(workflow, /^permissions:\r?\n  contents: read/m);
  assert.match(jobHeaders[0], /^    if: github.event_name != 'workflow_dispatch'$/m);
  assert.match(jobHeaders[0], /^    permissions:\r?\n      contents: read\r?\n(?!      )/m);
  assert.doesNotMatch(jobHeaders[0], /packages:|secrets:|environment:/);
  assert.match(workflow, /^  workflow_call:$/m);
  assert.doesNotMatch(workflow, /^  pull_request:$/m);
});

test('nur manuelles master erhält Registry-Schreibrechte und veröffentlicht geprüfte Images', () => {
  const publishingJobs = jobHeaders.filter((header) => /packages: write/.test(header));
  assert.equal(publishingJobs.length, 1);
  assert.match(
    publishingJobs[0],
    /^    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/master'$/m,
  );
  assert.equal(jobHeaders.length, 2);
  const sharedSteps = workflow.match(/^    steps: &([\w-]+)$/m)?.[1];
  assert.ok(sharedSteps);
  assert.ok(workflow.includes(`    steps: *${sharedSteps}`));
  assert.doesNotMatch(workflow, /pull_request_target|workflow_run|continue-on-error|push: true/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(
    workflow.indexOf('run-marketplace-checks.mjs images') <
      workflow.indexOf('Log in to container registry'),
  );
  const registrySteps = workflow
    .split(/(?=^      - name:)/m)
    .filter((step) =>
      /^      - name: (?:Log in to container registry|Publish verified)/m.test(step),
    );
  assert.equal(registrySteps.length, 2);
  for (const step of registrySteps)
    assert.match(step, /^        if: github.event_name == 'workflow_dispatch'$/m);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
});

test('Erweiterung läuft als eigener Job einmal und wird vor Veröffentlichung sowie im Aggregat geprüft', () => {
  const browser = ci.slice(ci.indexOf('  browser-smoke:'), ci.indexOf('  extension:'));
  assert.doesNotMatch(
    browser,
    /kleinanzeigen-extension-browser|kleinanzeigen-publication-browser|run-marketplace-checks.mjs extension/,
  );
  assert.equal(ci.match(/run-marketplace-checks\.mjs extension/gu)?.length, 1);
  for (const job of ['  image:', '  required-checks:']) {
    const block = ci.slice(ci.indexOf(job)).split(/(?=^  [a-z][\w-]*:\s*$)/m)[0];
    assert.match(block, /needs:\s*\[[^\]]*extension[^\]]*worker-browser[^\]]*marketplace-images/);
    assert.match(block, /EXTENSION_RESULT: \$\{\{ needs.extension.result \}\}/);
    assert.match(block, /WORKER_BROWSER_RESULT: \$\{\{ needs.worker-browser.result \}\}/);
    assert.match(block, /MARKETPLACE_IMAGES_RESULT: \$\{\{ needs.marketplace-images.result \}\}/);
  }
});

test('beide Imagejobs behalten den wegwerfbaren gehosteten Ubuntu-Runner', () => {
  assert.equal(jobHeaders.length, 2);
  for (const header of jobHeaders) assert.match(header, /^    runs-on: ubuntu-24\.04$/m);
  assert.doesNotMatch(workflow, /(?:RUNNER_ENVIRONMENT|RUNNER_OS|GITHUB_ACTIONS):/);
});
