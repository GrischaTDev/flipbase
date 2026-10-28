import { delimiter, dirname } from 'node:path';
import {
  assertMarketplaceImageRunner,
  marketplaceImageChecks,
} from './marketplace-image-checks.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Dieselben konkreten Befehle werden lokal und in CI verwendet. */
export function marketplaceCheckCommands(kind, plan) {
  if (
    !plan ||
    typeof plan.extensionRequired !== 'boolean' ||
    !Array.isArray(plan.workerBrowserTests)
  )
    throw new Error('Ungültiger Marketplace-Prüfplan.');
  if (kind === 'extension') {
    return plan.extensionRequired
      ? [
          ['scripts/kleinanzeigen-extension-browser.mjs'],
          ['scripts/kleinanzeigen-publication-browser.mjs'],
        ]
      : [];
  }
  if (kind !== 'worker-browser') throw new Error(`Unbekannte Marketplace-Prüfung: ${kind}`);
  const tests = [...new Set(plan.workerBrowserTests)];
  if (
    tests.some(
      (path) =>
        typeof path !== 'string' ||
        !/^services\/marketplace-worker\/test\/browser\/[a-z0-9-]+\.browser\.test\.ts$/u.test(
          path,
        ) ||
        path.endsWith('/chrome-session-stop.browser.test.ts'),
    )
  )
    throw new Error('Ungültige native Worker-Browserauswahl.');
  return tests.length
    ? [['--experimental-strip-types', '--test', '--test-concurrency=1', ...tests]]
    : [];
}

/** Auswahl und Bau der tatsächlich geprüften Images bleiben ein gemeinsamer Befehl. */
export function marketplaceImageCommands(plan, imageTag = 'ci') {
  if (
    typeof plan?.workerImageRequired !== 'boolean' ||
    typeof plan?.sessionImageRequired !== 'boolean' ||
    (plan.workerImageRequired && !plan.sessionImageRequired)
  )
    throw new Error('Ungültige Imageauswahl.');
  if (!/^[a-zA-Z0-9_.-]+$/u.test(imageTag)) throw new Error('Ungültiger Imagetag.');
  const workerImage = `ghcr.io/grischatdev/flipbase-marketplace-worker:${imageTag}`;
  const brokerImage = `ghcr.io/grischatdev/flipbase-chromium-broker:${imageTag}`;
  const sessionImage = `ghcr.io/grischatdev/flipbase-chromium-session:${imageTag}`;
  const commands = [];
  if (plan.workerImageRequired) {
    commands.push([
      'docker',
      [
        'buildx',
        'build',
        '--load',
        '--file',
        'services/marketplace-worker/Dockerfile',
        '--tag',
        workerImage,
        '.',
      ],
    ]);
    commands.push([
      'docker',
      [
        'buildx',
        'build',
        '--load',
        '--file',
        'services/marketplace-worker/Dockerfile',
        '--target',
        'chromium-broker',
        '--tag',
        brokerImage,
        '.',
      ],
    ]);
  }
  if (plan.sessionImageRequired)
    commands.push([
      'docker',
      [
        'buildx',
        'build',
        '--load',
        '--file',
        'services/marketplace-worker/Dockerfile.chromium-session',
        '--build-context',
        'pilot=tools/cloud-browser-pilot',
        '--build-context',
        'extension=tools/flipbase-extension',
        '--tag',
        sessionImage,
        'services/marketplace-worker',
      ],
    ]);
  // Import-Smoke vor jeder teuren Browser-/Brokerprüfung ausführen.
  const checks = [...marketplaceImageChecks].sort(
    (a, b) => Number(b.id === 'session-imports') - Number(a.id === 'session-imports'),
  );
  for (const check of checks)
    if (check.kind === 'worker' ? plan.workerImageRequired : plan.sessionImageRequired)
      commands.push(['bash', ['scripts/check-marketplace-images.sh', check.id]]);
  return {
    commands,
    env: {
      WORKER_IMAGE: workerImage,
      BROKER_IMAGE: brokerImage,
      SESSION_IMAGE: sessionImage,
      FLIPBASE_MARKETPLACE_IMAGE: workerImage,
      FLIPBASE_CHROMIUM_BROKER_IMAGE: brokerImage,
      MARKETPLACE_CHROMIUM_IMAGE: sessionImage,
    },
  };
}

export async function runMarketplaceChecks(
  kind,
  plan,
  { repository = process.cwd(), environment = process.env } = {},
) {
  const imagePlan =
    kind === 'images'
      ? marketplaceImageCommands(
          plan,
          environment.GITHUB_SHA ? `sha-${environment.GITHUB_SHA}` : 'ci',
        )
      : null;
  const commands =
    imagePlan?.commands ??
    marketplaceCheckCommands(kind, plan).map((args) => [process.execPath, args]);
  if (imagePlan && commands.length) assertMarketplaceImageRunner(environment);
  const env = {
    ...environment,
    PATH: [dirname(process.execPath), environment.PATH].filter(Boolean).join(delimiter),
    ...imagePlan?.env,
  };
  let sessionBuilt = false;
  for (const [command, arguments_] of commands) {
    try {
      await new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, arguments_, { cwd: repository, env, stdio: 'inherit' });
        child.once('error', rejectRun);
        child.once('exit', (code, signal) => {
          if (code === 0) return resolveRun();
          const error = new Error(`Marketplace-Prüfung fehlgeschlagen (${signal ?? code}).`);
          error.exitCode = Number.isInteger(code) && code > 0 ? code : 1;
          rejectRun(error);
        });
      });
      if (
        command === 'docker' &&
        arguments_.includes('services/marketplace-worker/Dockerfile.chromium-session')
      )
        sessionBuilt = true;
    } catch (error) {
      if (imagePlan && sessionBuilt) {
        await new Promise((resolveDiagnostics) => {
          const diagnostic = spawn(
            'bash',
            ['scripts/check-marketplace-images.sh', 'session-diagnostics'],
            { cwd: repository, env, stdio: 'inherit' },
          );
          diagnostic.once('error', resolveDiagnostics);
          diagnostic.once('exit', resolveDiagnostics);
        });
      }
      throw error;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.MARKETPLACE_CHECK_PLAN) throw new Error('MARKETPLACE_CHECK_PLAN fehlt.');
    await runMarketplaceChecks(process.argv[2], JSON.parse(process.env.MARKETPLACE_CHECK_PLAN));
  } catch (error) {
    console.error(error);
    process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
  }
}
