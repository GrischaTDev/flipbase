import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/marketplace-worker-image.yml', import.meta.url),
  'utf8',
);
const publisher = await readFile(
  new URL('../.github/workflows/marketplace-image-publish.yml', import.meta.url),
  'utf8',
);
const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const jobHeaders = (source) =>
  source
    .split(/^jobs:\s*$/m)[1]
    .split(/(?=^  [a-z][\w-]*:\s*$)/m)
    .filter((block) => block.trim())
    .map((block) => block.split(/^    steps:/m)[0]);
const verificationHeaders = jobHeaders(workflow);
const publicationHeaders = jobHeaders(publisher);

test('wiederverwendete Imageprüfung erhält in sämtlichen Jobs ausschließlich Leserechte', () => {
  assert.match(workflow, /^permissions:\r?\n  contents: read\r?\n(?!  )/m);
  // GitHub validiert alle Jobs des aufgerufenen Workflows vor ihren if-Bedingungen.
  assert.doesNotMatch(workflow, /packages:\s*write/u);
  assert.equal(verificationHeaders.length, 1);
  for (const header of verificationHeaders) {
    assert.match(header, /^    permissions:\r?\n      contents: read\r?\n(?!      )/m);
    assert.doesNotMatch(header, /packages:|secrets:|environment:/);
  }
  assert.match(workflow, /^  workflow_call:$/m);
  assert.doesNotMatch(workflow, /^  (?:workflow_dispatch|pull_request|push):$/m);
  assert.doesNotMatch(workflow, /docker\/login-action|docker push|secrets\.GITHUB_TOKEN/u);
  assert.match(ci, /^permissions:\r?\n  contents: read\r?\n(?!  )/m);
  const caller = ci.slice(ci.indexOf('  marketplace-images:'), ci.indexOf('  pwa:'));
  assert.doesNotMatch(caller, /packages:|secrets:/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/marketplace-worker-image\.yml/u);
});

test('nur separater manueller master-Publisher erhält Schreibrechte nach vollständiger Prüfung', () => {
  assert.match(publisher, /^on:\r?\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(publisher, /^  (?:workflow_call|pull_request|push):$/m);
  assert.equal(publicationHeaders.length, 1);
  assert.match(
    publicationHeaders[0],
    /^    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/master'$/m,
  );
  assert.match(
    publicationHeaders[0],
    /^    permissions:\r?\n      contents: read\r?\n      packages: write$/m,
  );
  assert.doesNotMatch(publisher, /pull_request_target|workflow_run|continue-on-error|push: true/);
  assert.match(publisher, /selectMarketplaceChecks\(null\)/u);
  const orderedSteps = [
    'node scripts/run-marketplace-checks.mjs extension',
    'node scripts/run-marketplace-checks.mjs worker-browser',
    'run: node scripts/run-marketplace-checks.mjs images',
    'uses: docker/login-action@',
    'docker push "ghcr.io/grischatdev/flipbase-marketplace-worker:sha-$GITHUB_SHA"',
    'docker push "ghcr.io/grischatdev/flipbase-chromium-broker:sha-$GITHUB_SHA"',
    'docker push "ghcr.io/grischatdev/flipbase-chromium-session:sha-$GITHUB_SHA"',
  ].map((step) => publisher.indexOf(step));
  assert.ok(orderedSteps.every((position) => position >= 0));
  assert.deepEqual(
    orderedSteps,
    [...orderedSteps].sort((left, right) => left - right),
  );
  assert.equal(publisher.match(/^\s+docker push /gmu)?.length, 3);
  assert.match(publisher, /"workerImageRequired":true,"sessionImageRequired":true/u);
  assert.match(publisher, /^  cancel-in-progress: false$/m);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
  for (const source of [workflow, publisher]) assert.match(source, /persist-credentials: false/);
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
  const headers = [...verificationHeaders, ...publicationHeaders];
  assert.equal(headers.length, 2);
  for (const header of headers) assert.match(header, /^    runs-on: ubuntu-24\.04$/m);
  for (const source of [workflow, publisher])
    assert.doesNotMatch(source, /(?:RUNNER_ENVIRONMENT|RUNNER_OS|GITHUB_ACTIONS):/);
});
