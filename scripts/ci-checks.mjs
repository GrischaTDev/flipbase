/** Gemeinsame Prüfkommandos für GitHub Actions und den lokalen Vorabcheck. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const checks = {
  orchestrator: [
    { name: 'Testorchestrierung', command: 'npm', args: ['run', 'test:orchestrator'] },
  ],
  quality: [
    {
      name: 'Check formatting',
      command: 'npm',
      args: ['run', 'format:check'],
    },
    {
      name: 'Lint',
      command: 'npm',
      args: ['run', 'lint'],
    },
    {
      name: 'Check types',
      command: 'npm',
      args: ['run', 'typecheck'],
    },
    {
      name: 'Test workflow contracts',
      command: 'npm',
      args: ['run', 'test:workflow'],
    },
    {
      name: 'Audit test suite classification',
      command: 'npm',
      args: ['run', 'test:audit'],
    },
  ],
  marketplace: [
    {
      name: 'Check and test marketplace functions in Deno',
      command: 'deno',
      args: [
        'check',
        '--no-config',
        '--node-modules-dir=none',
        'supabase/functions/webhook-dispatch/index.ts',
        'supabase/functions/ebay-account/index.ts',
        'supabase/functions/ebay-account-deletion/index.ts',
        'supabase/functions/marketplace-search/index.ts',
        'supabase/functions/marketplace-local-extension/index.ts',
        'supabase/functions/brand-label-media/index.ts',
        'supabase/functions/kleinanzeigen-account/index.ts',
        'supabase/functions/kleinanzeigen-local-extension/index.ts',
      ],
    },
    {
      name: 'Check and test marketplace functions in Deno',
      command: 'deno',
      args: [
        'test',
        '--no-config',
        '--node-modules-dir=none',
        '--allow-env',
        'supabase/functions/webhook-dispatch/handler.test.ts',
        'supabase/functions/webhook-dispatch/public-webhook-post.test.ts',
        'supabase/functions/webhook-dispatch/sale-notification.test.ts',
        'supabase/functions/ebay-account/handler.test.ts',
        'supabase/functions/ebay-account-deletion/handler.test.ts',
        'supabase/functions/ebay-account-deletion/endpoint.test.ts',
        'supabase/functions/_shared/ebay-api.test.ts',
        'supabase/functions/_shared/ebay-listing-management.test.ts',
        'supabase/functions/_shared/ebay-order-amounts.test.ts',
        'supabase/functions/_shared/ebay-order-source.test.ts',
        'supabase/functions/ebay-account/connection-read.test.ts',
        'supabase/functions/ebay-account/order-import.test.ts',
        'supabase/functions/marketplace-local-extension/handler.test.ts',
        'supabase/functions/_shared/kleinanzeigen-contracts.test.ts',
        'supabase/functions/kleinanzeigen-account/handler.test.ts',
        'supabase/functions/kleinanzeigen-local-extension/handler.test.ts',
        'supabase/functions/kleinanzeigen-local-extension/sync-handler.test.ts',
        'supabase/functions/_shared/kleinanzeigen-listing-contracts.test.ts',
        'supabase/functions/kleinanzeigen-account/transfer-source.test.ts',
        'supabase/functions/kleinanzeigen-account/transfer-draft.test.ts',
        'supabase/functions/marketplace-local-extension/source-details.test.ts',
        'supabase/functions/kleinanzeigen-local-extension/form-handler.test.ts',
        'supabase/functions/_shared/kleinanzeigen-form-contracts.test.ts',
        'supabase/functions/kleinanzeigen-local-extension/listing-handler.test.ts',
        'supabase/functions/kleinanzeigen-local-extension/listing-photo.test.ts',
        'supabase/functions/kleinanzeigen-account/listing-handler.test.ts',
        'supabase/functions/kleinanzeigen-account/listing-jobs.test.ts',
        'supabase/functions/_shared/kleinanzeigen-job-replies.test.ts',
        'supabase/functions/_shared/kleinanzeigen-job-contracts.test.ts',
      ],
    },
    {
      name: 'Check and test marketplace functions in Deno',
      command: 'deno',
      args: [
        'test',
        '--no-config',
        '--node-modules-dir=none',
        'supabase/functions/brand-label-media/png.test.ts',
        'supabase/functions/_shared/ebay-traffic-overview.test.ts',
        'supabase/functions/_shared/ebay-listing-performance.test.ts',
        'supabase/functions/_shared/ebay-advertising-report.test.ts',
      ],
    },
    {
      name: 'Install marketplace worker dependencies',
      command: 'npm',
      args: ['ci', '--prefix', 'services/marketplace-worker', '--ignore-scripts'],
    },
    {
      name: 'Check marketplace worker',
      command: 'npm',
      args: ['--prefix', 'services/marketplace-worker', 'run', 'typecheck'],
    },
    {
      name: 'Check marketplace worker',
      command: 'npm',
      args: ['--prefix', 'services/marketplace-worker', 'test'],
    },
    {
      name: 'Check marketplace worker',
      command: 'npm',
      args: ['--prefix', 'services/marketplace-worker', 'run', 'build'],
    },
  ],
  push: [
    {
      name: 'Install push worker dependencies',
      command: 'npm',
      args: ['ci', '--prefix', 'services/push-worker', '--ignore-scripts'],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'npm',
      args: ['--prefix', 'services/push-worker', 'run', 'typecheck'],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'npm',
      args: ['--prefix', 'services/push-worker', 'test'],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'npm',
      args: ['--prefix', 'services/push-worker', 'run', 'build'],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'deno',
      args: [
        'check',
        '--no-config',
        '--node-modules-dir=none',
        'deploy/push-main/index.ts',
        'supabase/functions/push-settings/index.ts',
        'supabase/functions/push-revoke/index.ts',
        'supabase/functions/ebay-order-observer/index.ts',
      ],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'deno',
      args: [
        'test',
        '--no-config',
        '--node-modules-dir=none',
        '--allow-env',
        'supabase/functions/push-settings/contracts.test.ts',
        'supabase/functions/push-settings/handler.test.ts',
        'supabase/functions/push-revoke/handler.test.ts',
        'supabase/functions/ebay-order-observer/handler.test.ts',
      ],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'docker',
      args: [
        'build',
        '--build-arg',
        'FLIPBASE_COMMIT=$GITHUB_SHA',
        '--tag',
        'flipbase-push:ci',
        'services/push-worker',
      ],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'node',
      args: ['services/push-worker/scripts/smoke-image.mjs', 'flipbase-push:ci'],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'node',
      args: ['scripts/package-push-functions.mjs', '$RUNNER_TEMP/push-functions', '$GITHUB_SHA'],
    },
    {
      name: 'Check push worker and isolated function router',
      command: 'node',
      args: [
        'services/push-worker/scripts/smoke-functions.mjs',
        'flipbase-push:ci',
        '$RUNNER_TEMP/push-functions',
        '$GITHUB_SHA',
      ],
    },
  ],
  database: [
    {
      name: 'Test database',
      command: 'npm',
      args: ['run', 'test:db'],
    },
    {
      name: 'Test parallel marketplace browser reservations',
      command: 'node',
      args: ['scripts/marketplace-live-browser-concurrency.mjs'],
      env: { MARKETPLACE_DB_CONTAINER: 'supabase_db_flipbase-supabase' },
    },
    {
      name: 'Test parallel cloud IP reservations',
      command: 'node',
      args: ['supabase/test-support/marketplace-cloud-setup-concurrency.mjs'],
      env: {
        CLOUD_SETUP_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Check Vinted account slots and order concurrency',
      command: 'node',
      args: ['supabase/test-support/marketplace-account-order-concurrency.mjs'],
      env: {
        ACCOUNT_ORDER_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Test parallel eBay order imports',
      command: 'node',
      args: ['--test', 'supabase/test-support/ebay-order-import-concurrency.test.mjs'],
      env: {
        EBAY_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Test parallel eBay order imports',
      command: 'node',
      args: ['supabase/test-support/ebay-order-import-concurrency.mjs'],
      env: {
        EBAY_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Test parallel Kleinanzeigen listing sync',
      command: 'node',
      args: ['supabase/test-support/kleinanzeigen-sync-concurrency.mjs'],
      env: {
        KLEINANZEIGEN_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Test parallel Kleinanzeigen publication jobs',
      command: 'node',
      args: ['supabase/test-support/kleinanzeigen-publication-concurrency.mjs'],
      env: {
        KLEINANZEIGEN_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Test Kleinanzeigen REST identifier precision',
      command: 'node',
      args: ['supabase/test-support/kleinanzeigen-rest-precision.mjs'],
      env: {
        KLEINANZEIGEN_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
      },
    },
    {
      name: 'Test parallel push claims',
      command: 'node',
      args: ['supabase/test-support/web-push-concurrency.mjs'],
      env: {
        PUSH_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase',
        PUSH_TEST_DB_NAME: 'postgres',
      },
    },
  ],
  sniper: [
    {
      name: 'Install dependencies',
      command: 'npm',
      args: ['ci'],
      directory: 'services/sniper',
    },
    {
      name: 'Check types',
      command: 'npm',
      args: ['run', 'typecheck'],
      directory: 'services/sniper',
    },
    {
      name: 'Test',
      command: 'npm',
      args: ['test'],
      directory: 'services/sniper',
    },
    {
      name: 'Build',
      command: 'npm',
      args: ['run', 'build'],
      directory: 'services/sniper',
    },
    {
      name: 'Build and smoke test bot image',
      command: 'docker',
      args: ['build', '--tag', 'flipbase-sniper:ci', '.'],
      directory: 'services/sniper',
    },
    {
      name: 'Build and smoke test bot image',
      command: 'node',
      args: ['scripts/smoke-image.mjs', 'flipbase-sniper:ci'],
      directory: 'services/sniper',
    },
    {
      name: 'Build and smoke test bot image',
      command: 'node',
      args: ['scripts/smoke-browser-image.mjs', 'flipbase-sniper:ci'],
      directory: 'services/sniper',
    },
  ],
  pwa: [
    {
      name: 'Test PWA startup, caching and updates',
      command: 'npm',
      args: ['run', 'test:pwa:scripts'],
    },
    {
      name: 'Test production PWA and offline drafts',
      command: 'npm',
      args: ['run', 'test:e2e:pwa'],
    },
  ],
  landing: [
    {
      name: 'Test landing page contract',
      command: 'npm',
      args: ['run', 'test:landing'],
    },
  ],
  build: [
    {
      name: 'Build',
      command: 'npm',
      args: ['run', 'build'],
    },
  ],
  'workflow-lint': [
    {
      name: 'Lint workflow files',
      command: 'actionlint',
      args: ['-color'],
    },
  ],
  'migration-transactions': [
    {
      name: 'Test migration transactions in isolated PostgreSQL',
      command: 'bash',
      args: ['scripts/check-migration-transactions.sh'],
    },
  ],
};

export function getCheckCommands(name) {
  if (!Object.hasOwn(checks, name)) throw new Error(`Unbekannter Prüfbereich: ${name}`);
  return structuredClone(checks[name]);
}

/** Kein Shell-Eval: Dateinamen und Metadaten bleiben einzelne Argumente. */
export async function executeCheckCommand(
  command,
  {
    repository = process.cwd(),
    environment = process.env,
    commit = environment.GITHUB_SHA ?? '',
    temporaryDirectory = '',
    spawnProcess = spawn,
  } = {},
) {
  const expand = (value) =>
    String(value).replaceAll('$GITHUB_SHA', commit).replaceAll('$RUNNER_TEMP', temporaryDirectory);
  let executable = command.command;
  let args = command.args.map(expand);
  const env = {
    ...environment,
    ...Object.fromEntries(
      Object.entries(command.env ?? {}).map(([key, value]) => [key, expand(value)]),
    ),
    PATH: `${dirname(process.execPath)}${delimiter}${environment.PATH ?? ''}`,
  };
  if (executable === 'node') executable = process.execPath;
  if (executable === 'npm' && environment.npm_execpath) {
    executable = process.execPath;
    args = [environment.npm_execpath, ...args];
  }
  if (executable === 'actionlint') executable = environment.ACTIONLINT_BIN || executable;
  const shell = process.platform === 'win32' && executable === 'npm';
  console.log(`\n${command.name}`);
  await new Promise((resolvePromise, reject) => {
    const child = spawnProcess(executable, args, {
      cwd: resolve(repository, command.directory ?? '.'),
      env,
      stdio: 'inherit',
      shell,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        const error = new Error(
          `${command.name} fehlgeschlagen (${signal ?? code ?? 'kein Exitcode'}).`,
        );
        error.exitCode = typeof code === 'number' && code > 0 ? code : 1;
        reject(error);
      }
    });
  });
}

export async function runCiCheck(name, options = {}) {
  const commands = getCheckCommands(name);
  if (name === 'quality') {
    // Release-Fixtures dürfen nur in der isolierten PostgreSQL-Gruppe aktiv werden.
    const environment = Object.fromEntries(
      Object.entries(options.environment ?? process.env).filter(([key]) => !/^PG/iu.test(key)),
    );
    options = { ...options, environment };
  }
  if (
    commands.some((command) => command.args.some((arg) => arg.includes('$GITHUB_SHA'))) &&
    !/^[a-f0-9]{40}$/iu.test(
      options.commit ?? options.environment?.GITHUB_SHA ?? process.env.GITHUB_SHA ?? '',
    )
  )
    throw new Error('Für Image-Metadaten ist ein gültiger Commit erforderlich.');
  const usesTemporaryDirectory = commands.some((command) =>
    command.args.some((arg) => arg.includes('$RUNNER_TEMP')),
  );
  const temporaryDirectory = usesTemporaryDirectory
    ? await mkdtemp(
        join(
          options.environment?.RUNNER_TEMP ?? process.env.RUNNER_TEMP ?? tmpdir(),
          'flipbase-check-',
        ),
      )
    : '';
  try {
    for (const command of commands)
      await executeCheckCommand(command, { ...options, temporaryDirectory });
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCiCheck(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  });
}
