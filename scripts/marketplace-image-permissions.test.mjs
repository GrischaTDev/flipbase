import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const filename of ['marketplace-worker-image.yml', 'marketplace-chromium-image.yml']) {
  const workflow = await readFile(
    new URL(`../.github/workflows/${filename}`, import.meta.url),
    'utf8',
  );
  const jobBlocks = workflow
    .split(/^jobs:\s*$/m)[1]
    .split(/(?=^  [a-z][\w-]*:\s*$)/m)
    .filter((block) => block.trim());
  const jobHeaders = jobBlocks.map((block) => block.split(/^    steps:/m)[0]);

  test(`${filename}: PR-Code erhält ausschließlich Leserechte`, () => {
    assert.match(workflow, /^permissions:\r?\n  contents: read\r?\n(?:jobs:|\r?\n)/m);
    const validationJobs = jobHeaders.filter((header) =>
      /^    if: github\.event_name == 'pull_request'\s*$/m.test(header),
    );
    assert.equal(validationJobs.length, 1);
    assert.match(validationJobs[0], /^    permissions:\r?\n      contents: read\r?\n(?!      )/m);
    assert.doesNotMatch(validationJobs[0], /packages:|secrets:|environment:/);
  });

  test(`${filename}: nur manuelles master darf Registry-Schreibrechte erhalten`, () => {
    const publishingJobs = jobHeaders.filter((header) => /packages: write/.test(header));
    assert.equal(publishingJobs.length, 1);
    assert.match(
      publishingJobs[0],
      /^    if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/master'\s*$/m,
    );
    assert.equal(jobHeaders.length, 2);
  });

  test(`${filename}: Veröffentlichung verwendet dieselben geprüften Images`, () => {
    const sharedSteps = workflow.match(/^    steps: &([\w-]+)\s*$/m)?.[1];
    assert.ok(sharedSteps);
    assert.ok(workflow.includes(`    steps: *${sharedSteps}`));
    assert.doesNotMatch(workflow, /pull_request_target|workflow_run|continue-on-error|push: true/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /load: true/);
    assert.match(workflow, /push: false/);
    const login = workflow.indexOf('      - name: Log in to container registry');
    const publish = workflow.indexOf('      - name: Publish verified');
    assert.ok(login >= 0 && publish > login);
    const registrySteps = workflow
      .split(/(?=^      - name:)/m)
      .filter((step) =>
        /^      - name: (?:Log in to container registry|Publish verified)/m.test(step),
      );
    assert.equal(registrySteps.length, 2);
    for (const step of registrySteps) {
      assert.match(step, /^        if: github\.event_name == 'workflow_dispatch'\s*$/m);
    }
  });
}
