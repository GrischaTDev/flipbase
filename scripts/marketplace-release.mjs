import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as waitForDelay } from 'node:timers/promises';

const exec = promisify(execFile);
const repository = 'GrischaTDev/flipbase';
const shaPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const runtimePath = 'tools/flipbase-extension/vinted-listing-runtime.js';
const packages = {
  worker_digest: 'grischatdev/flipbase-marketplace-worker',
  broker_digest: 'grischatdev/flipbase-chromium-broker',
  session_digest: 'grischatdev/flipbase-chromium-session',
};

function assertRelease(condition, message) {
  if (!condition) throw new Error(message);
}

async function githubApi(path, { timeoutMs = 30000 } = {}) {
  const { stdout } = await exec('gh', ['api', `repos/${repository}/${path}`], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function runJobs(runId, api) {
  const result = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await api(
      `actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`,
    );
    assertRelease(Array.isArray(response.jobs), 'GitHub lieferte keine eindeutige Jobliste.');
    result.push(...response.jobs);
    if (response.jobs.length < 100) return result;
  }
  throw new Error('Die Jobliste ist zu groß; keine unvollständige Freigabe.');
}

function validRun(run, sha, path, event) {
  return (
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
    run.head_sha === sha &&
    run.head_branch === 'master' &&
    run.head_repository?.full_name === repository &&
    run.event === event &&
    run.path === `.github/workflows/${path}`
  );
}

function successfulChecks(jobs) {
  return (
    jobs.some(
      (job) =>
        job.name === 'Required checks' &&
        job.status === 'completed' &&
        job.conclusion === 'success',
    ) &&
    jobs.every(
      (job) => job.status !== 'completed' || ['success', 'skipped'].includes(job.conclusion),
    )
  );
}

function publicationJobs(jobs) {
  const expectedSteps = [
    'Check local extension and worker forms before manual publication',
    'Build and check selected marketplace images',
    'Publish verified marketplace images',
  ];
  return jobs.filter(
    (job) =>
      Number.isSafeInteger(job.id) &&
      job.id > 0 &&
      job.status === 'completed' &&
      job.conclusion === 'success' &&
      expectedSteps.every((name) =>
        job.steps?.some(
          (step) =>
            step.name === name && step.status === 'completed' && step.conclusion === 'success',
        ),
      ),
  );
}

async function jobLogs(jobId) {
  assertRelease(Number.isSafeInteger(jobId) && jobId > 0, 'Ungültige Publisher-Jobkennung.');
  const { stdout } = await exec('gh', ['api', `repos/${repository}/actions/jobs/${jobId}/logs`], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

/** Ein vollständiger Pushbeleg muss aus genau einem erfolgreichen Veröffentlichungsschritt stammen. */
export function publicationReceipt(commit, job, logs) {
  assertRelease(
    shaPattern.test(commit) &&
      publicationJobs([job]).length === 1 &&
      typeof logs === 'string' &&
      Buffer.byteLength(logs) <= 8 * 1024 * 1024,
    'Ungültiger Publisherbeleg.',
  );
  const steps = job.steps.filter((step) => step.name === 'Publish verified marketplace images');
  assertRelease(steps.length === 1, 'Der Veröffentlichungsschritt ist nicht eindeutig.');
  const started = Date.parse(steps[0].started_at);
  const finished = Date.parse(steps[0].completed_at);
  assertRelease(
    Number.isFinite(started) && Number.isFinite(finished) && finished >= started,
    'Zeitgrenzen des Publisherbelegs fehlen.',
  );
  const receipt = { job_id: job.id };
  let packageName;
  for (const line of logs.split(/\r?\n/u)) {
    const timestamped = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$/u.exec(line);
    if (!timestamped) continue;
    const timestamp = Date.parse(timestamped[1]);
    // Die API-Zeitgrenzen haben Sekundenauflösung, die Logzeilen Nachkommastellen.
    if (timestamp < started || timestamp >= finished + 1000) continue;
    const repositoryLine = /^The push refers to repository \[([^\]]+)\]$/u.exec(timestamped[2]);
    if (repositoryLine) {
      const knownPackage = Object.values(packages).find(
        (name) => `ghcr.io/${name}` === repositoryLine[1],
      );
      assertRelease(
        packageName === undefined && knownPackage,
        'Mehrdeutige oder fremde Veröffentlichung im Pushbeleg.',
      );
      packageName = knownPackage;
      continue;
    }
    const digestLine =
      /^sha-([a-f0-9]{40}): digest: (sha256:[a-f0-9]{64}) size: [1-9][0-9]*$/u.exec(timestamped[2]);
    if (!digestLine) continue;
    assertRelease(
      packageName && digestLine[1] === commit,
      'Der Pushbeleg gehört nicht zum ausgewählten Release.',
    );
    const field = Object.entries(packages).find(([, name]) => name === packageName)[0];
    assertRelease(!Object.hasOwn(receipt, field), 'Mehrere Digests für dieselbe Image-Rolle.');
    receipt[field] = digestLine[2];
    packageName = undefined;
  }
  assertRelease(
    packageName === undefined &&
      Object.keys(packages).every((field) => digestPattern.test(receipt[field] ?? '')),
    'Der Pushbeleg enthält nicht alle drei Image-Digests.',
  );
  return receipt;
}

async function successfulRuns(sha, workflow, event, api) {
  const response = await api(
    `actions/workflows/${workflow}/runs?event=${event}&status=success&head_sha=${sha}&per_page=100`,
  );
  assertRelease(Array.isArray(response.workflow_runs), 'GitHub lieferte keine Workflowliste.');
  return response.workflow_runs.filter(
    (run) =>
      validRun(run, sha, workflow, event) &&
      run.status === 'completed' &&
      run.conclusion === 'success',
  );
}

/** Keine PR-Artefakte, fremden Repositories oder nur ähnlich benannten Checks akzeptieren. */
export async function planMarketplaceRelease(
  environment,
  {
    api: readApi = githubApi,
    logs = jobLogs,
    now = () => performance.now(),
    wait = waitForDelay,
  } = {},
) {
  const sha = environment.GITHUB_SHA;
  const event = environment.GITHUB_EVENT_NAME;
  assertRelease(
    environment.GITHUB_REPOSITORY === repository &&
      environment.GITHUB_REF === 'refs/heads/master' &&
      shaPattern.test(sha ?? '') &&
      ['push', 'workflow_dispatch'].includes(event),
    'Marketplace-Releases dürfen nur aus dem eigenen Hauptzweig starten.',
  );
  const operation = environment.RELEASE_OPERATION || 'release';
  assertRelease(
    ['release', 'deploy-existing', 'status'].includes(operation) &&
      (event !== 'push' || operation === 'release'),
    'Unbekannter oder für diesen Auslöser unzulässiger Releaseauftrag.',
  );
  const requestedCommit = environment.RELEASE_COMMIT || '';
  assertRelease(
    operation === 'deploy-existing' ? shaPattern.test(requestedCommit) : requestedCommit === '',
    'Nur deploy-existing benötigt eine vollständige Commitkennung.',
  );
  const deadline = now() + 8 * 60 * 1000;
  const timeoutMessage =
    'Die ausgewählten CI-Prüfungen sind nicht erfolgreich: Zeitlimit für die GitHub-Freigabe überschritten.';
  const remainingTime = () => {
    const remaining = Math.floor(deadline - now());
    assertRelease(remaining > 0, timeoutMessage);
    return remaining;
  };
  // Auch API-Zeit zählt zum festen Budget; verspätete Antworten erteilen keine Freigabe.
  const api =
    event === 'push'
      ? async (path) => {
          const response = await readApi(path, { timeoutMs: Math.min(30000, remainingTime()) });
          remainingTime();
          return response;
        }
      : readApi;
  const verifyCurrentMaster = async () => {
    const master = await api('git/ref/heads/master');
    assertRelease(
      master.ref === 'refs/heads/master' &&
        master.object?.type === 'commit' &&
        shaPattern.test(master.object.sha),
      'Der aktuelle Hauptzweig ist nicht eindeutig auflösbar.',
    );
    // Auch manuelle Aufträge laufen mit der aktuellen, geprüften Workflowfassung.
    assertRelease(
      master.object.sha === sha,
      'Der Auftrag wurde durch einen neueren Hauptzweig überholt.',
    );
  };
  await verifyCurrentMaster();
  if (operation === 'status') return { operation, commit: sha };

  const commit = operation === 'deploy-existing' ? requestedCommit : sha;
  if (operation === 'deploy-existing') {
    const comparison = await api(`compare/${commit}...${sha}`);
    assertRelease(
      ['ahead', 'identical'].includes(comparison.status) &&
        comparison.merge_base_commit?.sha === commit &&
        comparison.base_commit?.sha === commit,
      'Der ausgewählte Release ist nicht im aktuellen Hauptzweig enthalten.',
    );
  }
  if (event === 'push') {
    for (const [variable, message] of [
      ['GITHUB_RUN_ID', 'CI-Laufkennung fehlt oder ist ungültig.'],
      ['GITHUB_RUN_ATTEMPT', 'CI-Laufversuch fehlt oder ist ungültig.'],
    ]) {
      assertRelease(
        typeof environment[variable] === 'string' &&
          /^[1-9][0-9]*$/u.test(environment[variable]) &&
          Number.isSafeInteger(Number(environment[variable])),
        message,
      );
    }
    for (;;) {
      const run = await api(
        `actions/runs/${environment.GITHUB_RUN_ID}/attempts/${environment.GITHUB_RUN_ATTEMPT}`,
      );
      const ownRunIdMatches =
        Number.isSafeInteger(run?.id) && String(run.id) === environment.GITHUB_RUN_ID;
      const ownAttemptMatches =
        Number.isSafeInteger(run?.run_attempt) &&
        run.run_attempt > 0 &&
        String(run.run_attempt) === environment.GITHUB_RUN_ATTEMPT;
      assertRelease(
        validRun(run, sha, 'ci.yml', 'push') && ownRunIdMatches && ownAttemptMatches,
        `Die CI-Laufidentität gehört nicht zum freigegebenen Hauptzweigstand: ${JSON.stringify({
          expected_run_id: environment.GITHUB_RUN_ID.slice(0, 32),
          actual_run_id: Number.isSafeInteger(run?.id) ? run.id : 'invalid',
          run_id_matches: ownRunIdMatches,
          expected_attempt: environment.GITHUB_RUN_ATTEMPT.slice(0, 32),
          actual_attempt: Number.isSafeInteger(run?.run_attempt) ? run.run_attempt : 'invalid',
          attempt_matches: ownAttemptMatches,
          commit_matches: run?.head_sha === sha,
          branch_matches: run?.head_branch === 'master',
          repository_matches: run?.head_repository?.full_name === repository,
          event_matches: run?.event === 'push',
          workflow_matches: run?.path === '.github/workflows/ci.yml',
        })}`,
      );
      // Der GitHub-Gesamtstatus kann dem bereits gestarteten Schritt noch nachlaufen.
      const openRunStatuses = ['queued', 'in_progress', 'requested', 'waiting', 'pending'];
      const knownConclusions = [
        'success',
        'failure',
        'cancelled',
        'timed_out',
        'neutral',
        'skipped',
        'stale',
        'action_required',
      ];
      const diagnosticStatus =
        run.status === undefined
          ? 'missing'
          : [...openRunStatuses, 'completed'].includes(run.status)
            ? run.status
            : 'unknown';
      const diagnosticConclusion =
        run.conclusion === null
          ? null
          : run.conclusion === undefined
            ? 'missing'
            : knownConclusions.includes(run.conclusion)
              ? run.conclusion
              : 'unknown';
      assertRelease(
        (openRunStatuses.includes(run.status) && run.conclusion === null) ||
          (run.status === 'completed' && run.conclusion === 'success'),
        `Der CI-Laufzustand ist nicht freigegeben: ${JSON.stringify({ status: diagnosticStatus, conclusion: diagnosticConclusion })}`,
      );
      const jobs = await runJobs(run.id, api);
      if (successfulChecks(jobs)) {
        await verifyCurrentMaster();
        return { operation, commit };
      }
      const requiredChecks = jobs.filter((job) => job.name === 'Required checks');
      assertRelease(
        jobs.every(
          (job) => job.status !== 'completed' || ['success', 'skipped'].includes(job.conclusion),
        ) &&
          requiredChecks.every(
            (job) => openRunStatuses.includes(job.status) && job.conclusion === null,
          ),
        'Die ausgewählten CI-Prüfungen sind nicht erfolgreich.',
      );
      // Nur die Anzeige fehlender/offener Pflichtprüfungen erneut lesen, nie eine Aktion wiederholen.
      await wait(Math.min(10000, remainingTime()));
      await verifyCurrentMaster();
    }
  }

  const ciRuns = await successfulRuns(commit, 'ci.yml', 'push', api);
  let ciPassed = false;
  const publishers = [];
  for (const run of ciRuns) {
    const jobs = await runJobs(run.id, api);
    if (successfulChecks(jobs)) {
      ciPassed = true;
      publishers.push(...publicationJobs(jobs));
    }
  }
  assertRelease(
    ciPassed,
    'Für diesen Commit fehlt ein erfolgreicher vollständiger Hauptzweig-CI-Lauf.',
  );
  if (operation === 'deploy-existing' && publishers.length === 0) {
    const publications = await successfulRuns(
      commit,
      'marketplace-image-publish.yml',
      'workflow_dispatch',
      api,
    );
    for (const run of publications) publishers.push(...publicationJobs(await runJobs(run.id, api)));
  }
  if (operation === 'deploy-existing') {
    assertRelease(
      publishers.length > 0 && publishers.length <= 10,
      'Für diesen Commit fehlt ein eindeutiger Umfang erfolgreicher Veröffentlichungen geprüfter Marketplace-Images.',
    );
    const receipts = [];
    for (const job of publishers)
      receipts.push(publicationReceipt(commit, job, await logs(job.id)));
    return { operation, commit, receipts };
  }
  return { operation, commit };
}

async function boundedResponse(response, expectedDigest) {
  assertRelease(response.ok, 'Das öffentliche Registry-Abbild ist nicht lesbar.');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  assertRelease(
    declaredLength <= 2 * 1024 * 1024,
    'Registry-Metadaten überschreiten die zulässige Größe.',
  );
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assertRelease(
      length <= 2 * 1024 * 1024,
      'Registry-Metadaten überschreiten die zulässige Größe.',
    );
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assertRelease(
    !expectedDigest || digest === expectedDigest,
    'Registry-Inhalt stimmt nicht mit seinem Digest überein.',
  );
  const declaredDigest = response.headers.get('docker-content-digest');
  assertRelease(
    !declaredDigest || declaredDigest === digest,
    'Die Registry meldet einen widersprüchlichen Digest.',
  );
  return { value: JSON.parse(bytes.toString('utf8')), digest };
}

/** Anonyme Registry-Leseanmeldung belegt, dass der Host keinen dauerhaften Registrytoken braucht. */
export async function publicMarketplaceImage(packageName, commit, { request = fetch } = {}) {
  assertRelease(
    Object.values(packages).includes(packageName) && shaPattern.test(commit),
    'Unzulässiger Registry-Verweis.',
  );
  const tokenResponse = await request(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${packageName}:pull`,
    { signal: AbortSignal.timeout(30000), redirect: 'error' },
  );
  const { value: tokenValue } = await boundedResponse(tokenResponse);
  assertRelease(
    typeof tokenValue.token === 'string' && tokenValue.token.length > 0,
    'Die öffentliche Registry-Anmeldung fehlt.',
  );
  const headers = {
    Authorization: `Bearer ${tokenValue.token}`,
    Accept: [
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.docker.distribution.manifest.v2+json',
    ].join(', '),
  };
  async function document(kind, reference) {
    let response = await request(`https://ghcr.io/v2/${packageName}/${kind}/${reference}`, {
      headers,
      signal: AbortSignal.timeout(30000),
      redirect: 'manual',
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = new URL(response.headers.get('location') || '', 'https://ghcr.io');
      assertRelease(
        kind === 'blobs' &&
          target.protocol === 'https:' &&
          target.hostname === 'pkg-containers.githubusercontent.com' &&
          !target.username &&
          !target.password &&
          !target.port,
        'Unerwartetes Ziel für öffentliche Registry-Metadaten.',
      );
      // Der signierte GitHub-CDN-Link erhält ausdrücklich keinen Registry-Bearer.
      response = await request(target.href, {
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
    }
    return boundedResponse(response, digestPattern.test(reference) ? reference : undefined);
  }
  const tagged = await document('manifests', `sha-${commit}`);
  let manifest = tagged.value;
  if (Array.isArray(manifest.manifests)) {
    const linux = manifest.manifests.filter(
      (item) => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64',
    );
    assertRelease(
      linux.length === 1 && digestPattern.test(linux[0].digest),
      'Genau ein Linux-amd64-Abbild ist erforderlich.',
    );
    manifest = (await document('manifests', linux[0].digest)).value;
  }
  assertRelease(
    manifest.schemaVersion === 2 && digestPattern.test(manifest.config?.digest),
    'Registry-Manifest ist unvollständig.',
  );
  const config = await document('blobs', manifest.config.digest);
  assertRelease(
    config.value.os === 'linux' && config.value.architecture === 'amd64',
    'Das Abbild passt nicht zur Serverplattform.',
  );
  return { digest: tagged.digest, configDigest: config.digest };
}

export async function marketplaceReleaseManifest(
  commit,
  runtimeBytes,
  images,
  { testedImages, publishedReceipts } = {},
) {
  assertRelease(shaPattern.test(commit), 'Ungültige Releasekennung.');
  const manifest = { version: 1, commit };
  for (const [field, packageName] of Object.entries(packages)) {
    const image = images[field];
    assertRelease(
      digestPattern.test(image?.digest ?? '') && digestPattern.test(image?.configDigest ?? ''),
      'Vollständiger Image-Digest fehlt.',
    );
    if (testedImages)
      assertRelease(
        testedImages[field] === image.configDigest,
        `Die Veröffentlichung von ${packageName} weicht vom geprüften Abbild ab.`,
      );
    manifest[field] = image.digest;
  }
  if (publishedReceipts !== undefined) {
    assertRelease(
      Array.isArray(publishedReceipts) &&
        publishedReceipts.length > 0 &&
        publishedReceipts.length <= 10,
      'Veröffentlichungsbelege fehlen.',
    );
    assertRelease(
      publishedReceipts.some(
        (receipt) =>
          Number.isSafeInteger(receipt?.job_id) &&
          receipt.job_id > 0 &&
          Object.keys(packages).every((field) => receipt[field] === manifest[field]),
      ),
      'Die heutigen Registry-Digests stimmen mit keinem vollständigen geprüften Publisherbeleg überein.',
    );
  }
  manifest.runtime_sha256 = createHash('sha256').update(runtimeBytes).digest('hex');
  return manifest;
}

async function main() {
  const mode = process.argv[2];
  assertRelease(['plan', 'check', 'manifest'].includes(mode), 'Unbekannter Releasebefehl.');
  if (mode === 'plan' || mode === 'check') {
    const plan = await planMarketplaceRelease(process.env);
    if (mode === 'plan') {
      assertRelease(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT fehlt.');
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `operation=${plan.operation}\ncommit=${plan.commit}\nreceipts=${JSON.stringify(plan.receipts ?? [])}\n`,
      );
    }
    console.log(`Marketplace-Auftrag geprüft: ${plan.operation}, Commit ${plan.commit}.`);
    return;
  }
  const commit = process.env.RELEASE_COMMIT;
  assertRelease(shaPattern.test(commit ?? ''), 'Ungültige Releasekennung.');
  const { stdout: runtimeBytes } = await exec('git', ['show', `${commit}:${runtimePath}`], {
    encoding: 'buffer',
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const images = {};
  const testedImages = process.env.RELEASE_OPERATION === 'release' ? {} : undefined;
  assertRelease(
    ['release', 'deploy-existing'].includes(process.env.RELEASE_OPERATION),
    'Unbekannte Manifestquelle.',
  );
  const publishedReceipts = testedImages
    ? undefined
    : JSON.parse(process.env.RELEASE_RECEIPTS || 'null');
  for (const [field, packageName] of Object.entries(packages)) {
    images[field] = await publicMarketplaceImage(packageName, commit);
    if (testedImages) {
      const { stdout } = await exec(
        'docker',
        ['image', 'inspect', `ghcr.io/${packageName}:sha-${commit}`, '--format', '{{.Id}}'],
        {
          encoding: 'utf8',
          timeout: 30000,
        },
      );
      testedImages[field] = stdout.trim();
    }
  }
  const manifest = await marketplaceReleaseManifest(commit, runtimeBytes, images, {
    testedImages,
    publishedReceipts,
  });
  const serialized = JSON.stringify(manifest);
  assertRelease(
    Buffer.byteLength(serialized) <= 4096 && process.env.GITHUB_OUTPUT,
    'Releaseausgabe ist ungültig.',
  );
  await appendFile(process.env.GITHUB_OUTPUT, `manifest=${serialized}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### Geprüfte Marketplace-Images\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\`\n`,
    );
  console.log(`Öffentliche Marketplace-Images und Runtime für ${commit} sind gebunden.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
