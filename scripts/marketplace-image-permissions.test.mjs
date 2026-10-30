import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  marketplaceReleaseManifest,
  planMarketplaceRelease,
  publicMarketplaceImage,
  publicationReceipt,
} from './marketplace-release.mjs';

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

test('nur der getrennte master-Publisher erhält nach freigegebenem Plan Schreibrechte', () => {
  assert.match(publisher, /^on:\r?\n  workflow_dispatch:$/m);
  assert.match(publisher, /^  workflow_call:$/m);
  assert.doesNotMatch(publisher, /^  (?:pull_request|push):$/m);
  assert.equal(publicationHeaders.length, 4);
  assert.match(
    publicationHeaders[0],
    /^    if: github.repository == 'GrischaTDev\/flipbase' && github.ref == 'refs\/heads\/master' && \(github.event_name == 'push' \|\| github.event_name == 'workflow_dispatch'\)$/m,
  );
  const publishHeader = publicationHeaders.find((header) => /^  publish:/m.test(header));
  assert.match(publishHeader, /^    needs: plan$/m);
  assert.match(publishHeader, /^    if: needs.plan.outputs.operation == 'release'$/m);
  assert.match(
    publishHeader,
    /^    permissions:\r?\n      contents: read\r?\n      packages: write$/m,
  );
  assert.equal(publisher.match(/packages: write/gu)?.length, 1);
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
  assert.equal(headers.length, 5);
  for (const header of headers) assert.match(header, /^    runs-on: ubuntu-24\.04$/m);
  for (const source of [workflow, publisher])
    assert.doesNotMatch(source, /(?:RUNNER_ENVIRONMENT|RUNNER_OS|GITHUB_ACTIONS):/);
});

test('automatischer Marketplace-Aufrufer wartet auf ausgewählte Prüfungen und Webmigrationen', () => {
  const caller = ci.slice(ci.indexOf('  marketplace-release:'), ci.indexOf('  release:'));
  assert.match(caller, /needs: \[changes, required-checks, deploy\]/u);
  assert.match(caller, /github.event_name == 'push' && github.ref == 'refs\/heads\/master'/u);
  assert.match(caller, /needs.required-checks.result == 'success'/u);
  assert.match(caller, /needs.deploy.result == 'success' \|\| needs.deploy.result == 'skipped'/u);
  assert.match(
    caller,
    /worker_image_required == 'true' \|\| needs.changes.outputs.session_image_required == 'true'/u,
  );
  assert.match(caller, /contents: read\n      actions: read\n      packages: write/u);
  assert.match(caller, /uses: \.\/\.github\/workflows\/marketplace-image-publish\.yml/u);
  assert.doesNotMatch(caller, /secrets: inherit|continue-on-error/u);
});

test('Marketplace-Aufrufer übergibt genau die beiden deklarierten Deployment-Secrets', () => {
  const caller = ci.slice(ci.indexOf('  marketplace-release:'), ci.indexOf('  release:'));
  const passed = [...caller.matchAll(/^      ([A-Z_]+): \$\{\{ secrets\.([A-Z_]+) \}\}$/gmu)];
  assert.deepEqual(
    passed.map(([, target, source]) => [target, source]),
    [
      ['MARKETPLACE_DEPLOY_SSH_KEY', 'MARKETPLACE_DEPLOY_SSH_KEY'],
      ['MARKETPLACE_DEPLOY_KNOWN_HOSTS', 'MARKETPLACE_DEPLOY_KNOWN_HOSTS'],
    ],
  );
  const declaration = publisher.split('  workflow_call:')[1].split(/^jobs:/mu)[0];
  assert.deepEqual(
    [...declaration.matchAll(/^      ([A-Z_]+):\r?\n        required: true$/gmu)].map(
      ([, name]) => name,
    ),
    ['MARKETPLACE_DEPLOY_SSH_KEY', 'MARKETPLACE_DEPLOY_KNOWN_HOSTS'],
  );
});

function deploymentShellStep(name) {
  const step = publisher.split(`      - name: ${name}`)[1]?.split('      - name: ')[0];
  const script = step?.split('        run: |')[1];
  assert.ok(script, `Der echte Shellschritt fehlt: ${name}`);
  return script.replace(/^          /gmu, '');
}

test(
  'fehlende Marketplace-SSH-Werte brechen vor jeder Datei und Übergabe an Folgeschritte ab',
  { skip: process.platform !== 'linux' ? 'Die echte CI-Shellprüfung benötigt Linux.' : false },
  async () => {
    const script = deploymentShellStep('Set up the restricted Marketplace SSH identity');
    for (const [key, hosts] of [
      ['', ''],
      ['', 'fixture-host'],
      ['fixture-key', ''],
    ]) {
      const directory = await mkdtemp(join(tmpdir(), 'flipbase-marketplace-missing-'));
      try {
        const result = spawnSync(
          'bash',
          ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
          {
            encoding: 'utf8',
            env: {
              PATH: process.env.PATH,
              RUNNER_TEMP: directory,
              GITHUB_ENV: join(directory, 'job-environment'),
              SSH_KEY: key,
              KNOWN_HOSTS: hosts,
            },
          },
        );
        assert.equal(result.error, undefined);
        assert.notEqual(
          result.status,
          0,
          'Leere Werte dürfen keinen erfolgreichen Schritt ergeben.',
        );
        assert.deepEqual(
          await readdir(directory),
          [],
          'Kein unvollständiges SSH-Paket weiterreichen.',
        );
        for (const value of [key, hosts].filter(Boolean))
          assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
);

test(
  'vollständige Marketplace-SSH-Werte bleiben privat und werden nach Gebrauch entfernt',
  { skip: process.platform !== 'linux' ? 'Die echte CI-Shellprüfung benötigt Linux.' : false },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flipbase-marketplace-identity-'));
    const key = 'fixture-private-key\nsecond-line\n';
    const hosts = 'fixture-host ssh-ed25519 fixture-public-key\n';
    const environment = {
      PATH: process.env.PATH,
      RUNNER_TEMP: directory,
      GITHUB_ENV: join(directory, 'job-environment'),
      SSH_KEY: key,
      KNOWN_HOSTS: hosts,
    };
    try {
      const result = spawnSync(
        'bash',
        [
          '--noprofile',
          '--norc',
          '-e',
          '-o',
          'pipefail',
          '-c',
          deploymentShellStep('Set up the restricted Marketplace SSH identity'),
        ],
        { encoding: 'utf8', env: environment },
      );
      assert.equal(result.status, 0, result.stderr);
      const jobEnvironment = await readFile(environment.GITHUB_ENV, 'utf8');
      const identity = /^MARKETPLACE_SSH_DIR=(.+)\n$/u.exec(jobEnvironment)?.[1];
      assert.ok(identity?.startsWith(`${directory}/marketplace-ssh.`));
      assert.equal(await readFile(join(identity, 'id_ed25519'), 'utf8'), `${key}\n`);
      assert.equal(await readFile(join(identity, 'known_hosts'), 'utf8'), `${hosts}\n`);
      assert.equal((await stat(identity)).mode & 0o777, 0o700);
      for (const filename of ['id_ed25519', 'known_hosts'])
        assert.equal((await stat(join(identity, filename))).mode & 0o777, 0o600);
      assert.equal(`${result.stdout}${result.stderr}`, '');
      const cleanup = spawnSync(
        'bash',
        [
          '--noprofile',
          '--norc',
          '-e',
          '-o',
          'pipefail',
          '-c',
          deploymentShellStep('Remove the temporary SSH identity'),
        ],
        { encoding: 'utf8', env: { ...environment, MARKETPLACE_SSH_DIR: identity } },
      );
      assert.equal(cleanup.status, 0, cleanup.stderr);
      assert.deepEqual(await readdir(directory), ['job-environment']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test('nur der freigeschaltete production-Job erhält den eigenen Hostschlüssel und feste SSH-Befehle', () => {
  const beforeDeploy = publisher.slice(publisher.indexOf('jobs:'), publisher.indexOf('  deploy:'));
  const deploy = publisher.slice(publisher.indexOf('  deploy:'));
  assert.doesNotMatch(beforeDeploy, /MARKETPLACE_DEPLOY_SSH_KEY|DEPLOY_KNOWN_HOSTS|\bssh /u);
  assert.match(deploy, /environment:\n      name: marketplace-production/u);
  assert.match(deploy, /secrets.MARKETPLACE_DEPLOY_KNOWN_HOSTS/u);
  assert.match(deploy, /group: deploy-production\n      cancel-in-progress: false/u);
  assert.match(deploy, /DEPLOY_ENABLED: \$\{\{ vars.MARKETPLACE_DEPLOY_ENABLED \}\}/u);
  assert.match(deploy, /if: steps.enabled.outputs.enabled == 'true'/u);
  assert.match(deploy, /secrets.MARKETPLACE_DEPLOY_SSH_KEY/u);
  assert.doesNotMatch(
    deploy,
    /secrets\.DEPLOY_SSH_KEY|packages: write|StrictHostKeyChecking=no|ssh-keyscan/u,
  );
  assert.match(deploy, /marketplace-deploy-v1/u);
  assert.match(deploy, /marketplace-status-v1 < \/dev\/null/u);
  assert.match(deploy, /-o IdentitiesOnly=yes -o StrictHostKeyChecking=yes/u);
  assert.match(deploy, /-o ForwardAgent=no -o RequestTTY=no/u);
  assert.ok(deploy.indexOf('marketplace-release.mjs check') < deploy.indexOf('SSH_KEY:'));
  assert.match(deploy, /Remove the temporary SSH identity/u);
});

const releaseSha = '8'.repeat(40);
const currentSha = 'a'.repeat(40);
const releaseEnvironment = {
  GITHUB_REPOSITORY: 'GrischaTDev/flipbase',
  GITHUB_REF: 'refs/heads/master',
  GITHUB_SHA: currentSha,
  GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '123',
};
const checkedJob = { name: 'Required checks', status: 'completed', conclusion: 'success' };
const publicationJob = {
  id: 789,
  status: 'completed',
  conclusion: 'success',
  steps: [
    'Check local extension and worker forms before manual publication',
    'Build and check selected marketplace images',
    'Publish verified marketplace images',
  ].map((name) => ({
    name,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-10-29T12:00:00Z',
    completed_at: '2026-10-29T12:00:10Z',
  })),
};
const receiptFixture = {
  job_id: publicationJob.id,
  worker_digest: `sha256:${'1'.repeat(64)}`,
  broker_digest: `sha256:${'2'.repeat(64)}`,
  session_digest: `sha256:${'3'.repeat(64)}`,
};
const publicationLogFixture = [
  ['flipbase-marketplace-worker', receiptFixture.worker_digest],
  ['flipbase-chromium-broker', receiptFixture.broker_digest],
  ['flipbase-chromium-session', receiptFixture.session_digest],
]
  .flatMap(([name, digest]) => [
    `2026-10-29T12:00:01.1234567Z The push refers to repository [ghcr.io/grischatdev/${name}]`,
    `2026-10-29T12:00:02.1234567Z sha-${releaseSha}: digest: ${digest} size: 2617`,
  ])
  .join('\n');
const publicationLogs = async (id) => {
  assert.equal(id, publicationJob.id);
  return publicationLogFixture;
};
function runFixture(sha = currentSha, overrides = {}) {
  return {
    id: 123,
    head_sha: sha,
    head_branch: 'master',
    head_repository: { full_name: 'GrischaTDev/flipbase' },
    event: 'push',
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

function releaseApi({
  master = currentSha,
  run = runFixture(),
  jobs = [checkedJob],
  publications = [publicationJob],
  overrides = {},
} = {}) {
  return async (path) => {
    if (Object.hasOwn(overrides, path)) return overrides[path];
    if (path === 'git/ref/heads/master')
      return { ref: 'refs/heads/master', object: { type: 'commit', sha: master } };
    if (path === 'actions/runs/123') return run;
    if (path === 'actions/runs/123/jobs?filter=latest&per_page=100&page=1') return { jobs };
    if (path === `compare/${releaseSha}...${currentSha}`)
      return {
        status: 'ahead',
        base_commit: { sha: releaseSha },
        merge_base_commit: { sha: releaseSha },
      };
    if (
      path ===
      `actions/workflows/ci.yml/runs?event=push&status=success&head_sha=${releaseSha}&per_page=100`
    )
      return { workflow_runs: [runFixture(releaseSha)] };
    if (
      path ===
      `actions/workflows/ci.yml/runs?event=push&status=success&head_sha=${currentSha}&per_page=100`
    )
      return { workflow_runs: [run] };
    if (
      path ===
      `actions/workflows/marketplace-image-publish.yml/runs?event=workflow_dispatch&status=success&head_sha=${releaseSha}&per_page=100`
    )
      return {
        workflow_runs: [
          runFixture(releaseSha, {
            id: 456,
            path: '.github/workflows/marketplace-image-publish.yml',
            event: 'workflow_dispatch',
          }),
        ],
      };
    if (path === 'actions/runs/456/jobs?filter=latest&per_page=100&page=1')
      return { jobs: publications };
    throw new Error(`Unerwarteter API-Aufruf: ${path}`);
  };
}

test('laufende Hauptzweig-CI darf erst nach ihrem eigenen grünen Sammelgate veröffentlichen', async () => {
  const plan = await planMarketplaceRelease(releaseEnvironment, {
    api: releaseApi({ run: runFixture(currentSha, { status: 'in_progress', conclusion: null }) }),
  });
  assert.deepEqual(plan, { operation: 'release', commit: currentSha });
  for (const jobs of [
    [],
    [{ ...checkedJob, conclusion: 'failure' }],
    [checkedJob, { status: 'completed', conclusion: 'cancelled' }],
  ]) {
    await assert.rejects(
      planMarketplaceRelease(releaseEnvironment, { api: releaseApi({ jobs }) }),
      /CI-Prüfungen/u,
    );
  }
});

test('wartende eigene Hauptzweig-CI erlaubt den gestarteten Rollout erst nach grünen Pflichtprüfungen', async () => {
  const run = runFixture(currentSha, { status: 'waiting', conclusion: null });
  assert.deepEqual(await planMarketplaceRelease(releaseEnvironment, { api: releaseApi({ run }) }), {
    operation: 'release',
    commit: currentSha,
  });
  for (const jobs of [
    [],
    [{ ...checkedJob, status: 'in_progress', conclusion: null }],
    [{ ...checkedJob, conclusion: 'failure' }],
    [{ ...checkedJob, conclusion: 'cancelled' }],
    [checkedJob, { status: 'completed', conclusion: 'failure' }],
    [checkedJob, { status: 'completed', conclusion: 'cancelled' }],
  ]) {
    await assert.rejects(
      planMarketplaceRelease(releaseEnvironment, { api: releaseApi({ run, jobs }) }),
      /CI-Prüfungen/u,
    );
  }
});

test('wartende CI behält Identitätsgrenzen und akzeptiert kein bereits gesetztes Ergebnis', async () => {
  for (const changes of [
    { head_sha: releaseSha },
    { head_repository: { full_name: 'fork/flipbase' } },
    { head_branch: 'feature' },
    { path: '.github/workflows/fake.yml' },
    { event: 'pull_request' },
    { conclusion: 'success' },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { conclusion: undefined },
    { status: 'queued' },
    { status: 'unknown' },
    { status: 'completed', conclusion: 'failure' },
    { status: 'completed', conclusion: 'cancelled' },
  ]) {
    await assert.rejects(
      planMarketplaceRelease(releaseEnvironment, {
        api: releaseApi({
          run: runFixture(currentSha, { status: 'waiting', conclusion: null, ...changes }),
        }),
      }),
      /CI-Lauf/u,
    );
  }
  await assert.rejects(
    planMarketplaceRelease(releaseEnvironment, {
      api: releaseApi({
        master: 'b'.repeat(40),
        run: runFixture(currentSha, { status: 'waiting', conclusion: null }),
      }),
    }),
    /überholt/u,
  );
});

test('fremde Quellen, PR-Auslöser, Branches und verfälschte CI-Zuordnungen werden abgewiesen', async () => {
  for (const changes of [
    { GITHUB_REPOSITORY: 'other/flipbase' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'workflow_run' },
    { GITHUB_SHA: 'a; echo wrong' },
    { RELEASE_OPERATION: 'status' },
  ])
    await assert.rejects(
      planMarketplaceRelease({ ...releaseEnvironment, ...changes }, { api: releaseApi() }),
    );
  for (const changes of [
    { head_sha: releaseSha },
    { head_repository: { full_name: 'fork/flipbase' } },
    { head_branch: 'feature' },
    { path: '.github/workflows/fake.yml' },
    { event: 'pull_request' },
    { conclusion: 'failure' },
  ])
    await assert.rejects(
      planMarketplaceRelease(releaseEnvironment, {
        api: releaseApi({ run: runFixture(currentSha, changes) }),
      }),
      /CI-Lauf/u,
    );
});

test('neuer master sperrt auch einen zuvor zulässigen automatischen Release vor SSH', async () => {
  await assert.rejects(
    planMarketplaceRelease(releaseEnvironment, { api: releaseApi({ master: 'b'.repeat(40) }) }),
    /überholt/u,
  );
});

test('reiner Statusauftrag benötigt weder erfolgreiche CI noch eine Veröffentlichung', async () => {
  const plan = await planMarketplaceRelease(
    { ...releaseEnvironment, GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_OPERATION: 'status' },
    {
      api: async (path) => {
        assert.equal(path, 'git/ref/heads/master');
        return { ref: 'refs/heads/master', object: { type: 'commit', sha: currentSha } };
      },
    },
  );
  assert.deepEqual(plan, { operation: 'status', commit: currentSha });
});

const existingEnvironment = {
  ...releaseEnvironment,
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  RELEASE_OPERATION: 'deploy-existing',
  RELEASE_COMMIT: releaseSha,
};

test('bereits veröffentlichter Hauptzweig-Release benötigt vollständigen CI- und Publishernachweis', async () => {
  assert.deepEqual(
    await planMarketplaceRelease(existingEnvironment, { api: releaseApi(), logs: publicationLogs }),
    {
      operation: 'deploy-existing',
      commit: releaseSha,
      receipts: [receiptFixture],
    },
  );
  await assert.rejects(
    planMarketplaceRelease(existingEnvironment, { api: releaseApi({ jobs: [] }) }),
    /Hauptzweig-CI-Lauf/u,
  );
  await assert.rejects(
    planMarketplaceRelease(existingEnvironment, { api: releaseApi({ publications: [] }) }),
    /Veröffentlichung/u,
  );
  await assert.rejects(
    planMarketplaceRelease(existingEnvironment, {
      api: releaseApi({
        publications: [{ ...publicationJob, steps: publicationJob.steps.slice(1) }],
      }),
    }),
    /Veröffentlichung/u,
  );
  for (const status of ['behind', 'diverged'])
    await assert.rejects(
      planMarketplaceRelease(existingEnvironment, {
        api: releaseApi({
          overrides: {
            [`compare/${releaseSha}...${currentSha}`]: {
              status,
              base_commit: { sha: releaseSha },
              merge_base_commit: { sha: releaseSha },
            },
          },
        }),
      }),
      /enthalten/u,
    );
  await assert.rejects(
    planMarketplaceRelease(
      { ...existingEnvironment, RELEASE_COMMIT: 'master' },
      { api: releaseApi() },
    ),
    /vollständige/u,
  );
});

test('wiederverwendeter Publisher im erfolgreichen Hauptlauf zählt als tatsächlicher Veröffentlichungsnachweis', async () => {
  const api = releaseApi({ jobs: [checkedJob, publicationJob] });
  const requests = [];
  await planMarketplaceRelease(existingEnvironment, {
    logs: publicationLogs,
    api: (path) => {
      requests.push(path);
      return api(path);
    },
  });
  assert.ok(
    !requests.some((path) => path.includes('workflows/marketplace-image-publish.yml/runs')),
  );
});

test('historischer Pushbeleg bindet drei Rollen an einen vollständigen erfolgreichen Job und exakten Release', () => {
  assert.deepEqual(
    publicationReceipt(releaseSha, publicationJob, publicationLogFixture),
    receiptFixture,
  );
  for (const logs of [
    publicationLogFixture.split('\n').slice(0, -1).join('\n'),
    `${publicationLogFixture}\n${publicationLogFixture}`,
    publicationLogFixture.replace(`sha-${releaseSha}`, `sha-${currentSha}`),
    publicationLogFixture.replaceAll('2026-10-29T12:00:0', '2026-10-29T11:00:0'),
    publicationLogFixture.replace('flipbase-chromium-broker', 'unexpected-image'),
    publicationLogFixture.replace(
      'ghcr.io/grischatdev/flipbase-chromium-broker',
      'docker.io/other/image',
    ),
  ])
    assert.throws(() => publicationReceipt(releaseSha, publicationJob, logs));
  assert.throws(
    () =>
      publicationReceipt(
        releaseSha,
        { ...publicationJob, conclusion: 'failure' },
        publicationLogFixture,
      ),
    /Publisherbeleg/u,
  );
  assert.throws(
    () =>
      publicationReceipt(releaseSha, { ...publicationJob, id: '789;bad' }, publicationLogFixture),
    /Publisherbeleg/u,
  );
});

test('fehlende oder nicht mehr aufbewahrte Publisherlogs erlauben keinen bestehenden Release', async () => {
  await assert.rejects(
    planMarketplaceRelease(existingEnvironment, { api: releaseApi(), logs: async () => '' }),
    /drei Image-Digests/u,
  );
  await assert.rejects(
    planMarketplaceRelease(existingEnvironment, {
      api: releaseApi(),
      logs: async () => {
        throw new Error('Publisherlogs nicht verfügbar');
      },
    }),
    /nicht verfügbar/u,
  );
});

test('Release-Manifest bindet genau die drei öffentlichen Digests an die zuvor geprüften Imageconfigs', async () => {
  const images = Object.fromEntries(
    ['worker_digest', 'broker_digest', 'session_digest'].map((field, index) => [
      field,
      {
        digest: `sha256:${String(index + 1).repeat(64)}`,
        configDigest: `sha256:${String(index + 4).repeat(64)}`,
      },
    ]),
  );
  const testedImages = Object.fromEntries(
    Object.entries(images).map(([field, image]) => [field, image.configDigest]),
  );
  const runtime = Buffer.from('reviewed runtime\n');
  const manifest = await marketplaceReleaseManifest(releaseSha, runtime, images, { testedImages });
  assert.deepEqual(manifest, {
    version: 1,
    commit: releaseSha,
    worker_digest: images.worker_digest.digest,
    broker_digest: images.broker_digest.digest,
    session_digest: images.session_digest.digest,
    runtime_sha256: createHash('sha256').update(runtime).digest('hex'),
  });
  await assert.rejects(
    marketplaceReleaseManifest(releaseSha, runtime, images, {
      testedImages: { ...testedImages, broker_digest: `sha256:${'9'.repeat(64)}` },
    }),
    /geprüften Abbild/u,
  );
  await assert.rejects(
    marketplaceReleaseManifest(releaseSha, runtime, {
      ...images,
      session_digest: { digest: 'latest' },
    }),
    /Digest/u,
  );
  assert.deepEqual(
    await marketplaceReleaseManifest(releaseSha, runtime, images, {
      publishedReceipts: [receiptFixture],
    }),
    manifest,
  );
  await assert.rejects(
    marketplaceReleaseManifest(releaseSha, runtime, images, {
      publishedReceipts: [{ ...receiptFixture, worker_digest: `sha256:${'9'.repeat(64)}` }],
    }),
    /Publisherbeleg/u,
  );
  // Einzelrollen aus verschiedenen erfolgreichen Läufen dürfen nicht zusammengesetzt werden.
  await assert.rejects(
    marketplaceReleaseManifest(releaseSha, runtime, images, {
      publishedReceipts: [
        { ...receiptFixture, worker_digest: `sha256:${'9'.repeat(64)}` },
        { ...receiptFixture, job_id: 790, broker_digest: `sha256:${'9'.repeat(64)}` },
      ],
    }),
    /Publisherbeleg/u,
  );
});

function registryFixture({
  platform = 'amd64',
  wrongDigest = false,
  duplicatePlatform = false,
  redirectHost,
} = {}) {
  const json = (value) => JSON.stringify(value);
  const digest = (body) => `sha256:${createHash('sha256').update(body).digest('hex')}`;
  const config = json({ os: 'linux', architecture: platform });
  const configDigest = digest(config);
  const manifest = json({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { digest: configDigest },
  });
  const manifestDigest = digest(manifest);
  const descriptor = { digest: manifestDigest, platform: { os: 'linux', architecture: 'amd64' } };
  const index = json({
    schemaVersion: 2,
    manifests: duplicatePlatform ? [descriptor, descriptor] : [descriptor],
  });
  return {
    digest: digest(index),
    configDigest,
    request: async (url, options) => {
      if (url.startsWith('https://ghcr.io/token?')) {
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers, undefined);
        return new Response(json({ token: 'public-scope-token' }));
      }
      if (url.startsWith('https://pkg-containers.githubusercontent.com/')) {
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers, undefined);
        return new Response(config);
      }
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.Authorization, 'Bearer public-scope-token');
      if (redirectHost && url.includes('/blobs/')) {
        return new Response(null, {
          status: 307,
          headers: { location: `https://${redirectHost}/public-config` },
        });
      }
      const body = url.endsWith(`/sha-${releaseSha}`)
        ? index
        : url.includes('/blobs/')
          ? config
          : manifest;
      return new Response(body, {
        headers: {
          'docker-content-digest': wrongDigest ? `sha256:${'0'.repeat(64)}` : digest(body),
        },
      });
    },
  };
}

test('öffentliche Registry-Leseprüfung bindet Index, Plattformmanifest und Config über tatsächliche Bytes', async () => {
  const fixture = registryFixture();
  assert.deepEqual(
    await publicMarketplaceImage('grischatdev/flipbase-marketplace-worker', releaseSha, fixture),
    { digest: fixture.digest, configDigest: fixture.configDigest },
  );
  for (const options of [
    { platform: 'arm64' },
    { wrongDigest: true },
    { duplicatePlatform: true },
  ]) {
    await assert.rejects(
      publicMarketplaceImage(
        'grischatdev/flipbase-marketplace-worker',
        releaseSha,
        registryFixture(options),
      ),
    );
  }
  await assert.rejects(
    publicMarketplaceImage('other/image', releaseSha, fixture),
    /Registry-Verweis/u,
  );
  await assert.rejects(
    publicMarketplaceImage('grischatdev/flipbase-marketplace-worker', 'latest', fixture),
    /Registry-Verweis/u,
  );
});

test('öffentliche Config darf zum GitHub-CDN weiterleiten, ohne den Registry-Bearer mitzuschicken', async () => {
  const fixture = registryFixture({ redirectHost: 'pkg-containers.githubusercontent.com' });
  assert.deepEqual(
    await publicMarketplaceImage('grischatdev/flipbase-marketplace-worker', releaseSha, fixture),
    { digest: fixture.digest, configDigest: fixture.configDigest },
  );
  await assert.rejects(
    publicMarketplaceImage(
      'grischatdev/flipbase-marketplace-worker',
      releaseSha,
      registryFixture({ redirectHost: 'other.example' }),
    ),
    /Unerwartetes Ziel/u,
  );
});
