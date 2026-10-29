/** Ein Prüfplan für lokale Vorbereitung und GitHub Actions. */
import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  selectAffectedTests,
  readSelectionFiles,
  buildUnitMatrix,
  buildBrowserMatrix,
  selectionHash,
} from './affected-tests.mjs';
import {
  classifyChanges,
  detectChangedPaths,
  pathsSelectPush,
} from './detect-supabase-changes.mjs';
import { selectMarketplaceChecks } from './marketplace-check-selection.mjs';
import { runMarketplaceChecks } from './run-marketplace-checks.mjs';
import { assertMarketplaceImageRunner } from './marketplace-image-checks.mjs';
import { executeCheckCommand, runCiCheck } from './ci-checks.mjs';
import { checkLocalMigrations } from './check-local-migrations.mjs';

const exec = promisify(execFile);
const sorted = (values) => [...new Set(values)].sort();

async function git(repository, args) {
  return (await exec('git', args, { cwd: repository, encoding: 'utf8' })).stdout;
}

/** Bezieht auch Index, Arbeitskopie und neue, nicht ignorierte Dateien ein. */
export async function localChangedPaths(repository = process.cwd(), baseRef = 'origin/master') {
  if (!baseRef || baseRef.startsWith('-')) throw new Error('Ungültiger Vergleichszweig.');
  if ((await git(repository, ['ls-files', '-u', '-z'])).length)
    throw new Error('Vor dem Vorabcheck müssen die Git-Konflikte gelöst werden.');
  const baseCommit = (
    await git(repository, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`])
  ).trim();
  const headSha = (await git(repository, ['rev-parse', 'HEAD'])).trim();
  const baseSha = (await git(repository, ['merge-base', baseCommit, headSha])).trim();
  const [difference, untracked] = await Promise.all([
    git(repository, ['diff', '--name-only', '--no-renames', '-z', baseSha]),
    git(repository, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  return {
    baseSha,
    headSha,
    paths: sorted([...difference.split('\0'), ...untracked.split('\0')].filter(Boolean)),
  };
}

export function preflightSelectionHash(plan) {
  // Der Wiederverwendungsnachweis umfasst auch native Browser- und Imageauswahl.
  return selectionHash({
    changes: plan.changes,
    application: plan.application,
    marketplace: plan.marketplace,
  });
}

export async function createPreflightPlan({
  repository = process.cwd(),
  baseRef = 'origin/master',
  event,
} = {}) {
  const comparison = event
    ? {
        baseSha: event.prBaseSha || event.pushBeforeSha,
        headSha: event.headSha,
        paths: await detectChangedPaths({ ...event, repository }),
      }
    : await localChangedPaths(repository, baseRef);
  const changes = { ...classifyChanges(comparison.paths), push: pathsSelectPush(comparison.paths) };
  const [files, marketplace] = await Promise.all([
    readSelectionFiles(repository),
    selectMarketplaceChecks(comparison.paths, { repository }),
  ]);
  const application = selectAffectedTests(comparison.paths, files);
  const plan = { version: 1, ...comparison, changes, application, marketplace };
  return { ...plan, selectionHash: preflightSelectionHash(plan) };
}

export function githubPreflightOutputs(plan) {
  const units = buildUnitMatrix(plan.application);
  const browsers = buildBrowserMatrix(plan.application);
  return {
    ...plan.changes,
    test_plan: JSON.stringify(plan.application),
    selection_hash: plan.selectionHash,
    unit_required: units.length > 0,
    unit_matrix: JSON.stringify({
      include: units.length ? units : [{ suite: 'node', shard: '1/1' }],
    }),
    browser_required: browsers.length > 0,
    browser_matrix: JSON.stringify({
      include: browsers.length ? browsers : [{ project: 'core-smoke', shard: '1/1' }],
    }),
    pwa_required: plan.application.pwa,
    marketplace_required: plan.application.checks.marketplace,
    landing_required: plan.application.checks.landing,
    marketplace_check_plan: JSON.stringify(plan.marketplace),
    extension_required: plan.marketplace.extensionRequired,
    worker_browser_required: plan.marketplace.workerBrowserTests.length > 0,
    worker_image_required: plan.marketplace.workerImageRequired,
    session_image_required: plan.marketplace.sessionImageRequired,
  };
}

/** Die Jobauswahl ist sichtbar; erforderliche Integrationen verschwinden nicht lokal. */
export function preflightChecks(plan) {
  if (plan.changes.documentation_only)
    return [{ id: 'documentation', title: 'Markdown formatieren prüfen', tools: [] }];
  const checks = [
    { id: 'migration-structure', title: 'Migrationsumfang und SQL-Paket', tools: [] },
    { id: 'workflow-lint', title: 'Workflow-Syntax (Actionlint)', tools: ['actionlint'] },
    {
      id: 'quality',
      title: 'Format, Lint, Typen, Workflowtests und Suite-Audit',
      tools: ['docker', 'pwsh'],
    },
  ];
  if (plan.application.checks.marketplace)
    checks.push({
      id: 'marketplace',
      title: 'Marketplace-Worker und Edge-Funktionen',
      tools: ['deno'],
    });
  if (plan.changes.push)
    checks.push({
      id: 'push',
      title: 'Push-Worker, Funktionen und Images',
      tools: ['deno', 'docker'],
    });
  if (plan.changes.sniper)
    checks.push({ id: 'sniper', title: 'Sniper-Tests, Build und Image', tools: ['docker'] });
  if (plan.changes.supabase)
    checks.push(
      {
        id: 'migration-transactions',
        title: 'Migrationen in isoliertem PostgreSQL',
        tools: ['docker', 'bash'],
      },
      {
        id: 'database',
        title: 'Lokale Datenbank, Rechte und Nebenläufigkeit',
        tools: ['docker'],
        supabase: true,
      },
    );
  if (plan.application.checks.landing)
    checks.push({ id: 'landing', title: 'Landingpage-Vertrag', tools: [] });
  if (plan.application.units.node.length)
    checks.push({ id: 'orchestrator', title: 'Testorchestrierung einmal prüfen', tools: [] });
  for (const entry of buildUnitMatrix(plan.application))
    checks.push({
      id: `unit:${entry.suite}:${entry.shard}`,
      title: `${entry.suite}-Tests ${entry.shard}`,
      tools: [],
      ...entry,
    });
  if (plan.changes.application_tests)
    checks.push({ id: 'build', title: 'Anwendungsbau einschließlich Angular-Vorlagen', tools: [] });
  for (const entry of buildBrowserMatrix(plan.application))
    checks.push({
      id: `browser:${entry.project}:${entry.shard}`,
      title: `Browser ${entry.project} ${entry.shard}`,
      tools: ['docker'],
      supabase: true,
      ...entry,
    });
  if (plan.application.pwa)
    checks.push({ id: 'pwa', title: 'Produktions-PWA, Offline- und Updateabläufe', tools: [] });
  if (plan.marketplace.extensionRequired)
    checks.push({ id: 'extension', title: 'Kleinanzeigen-Extension einmal prüfen', tools: [] });
  if (plan.marketplace.workerBrowserTests.length)
    checks.push({
      id: 'worker-browser',
      title: `Native Worker-Browserfälle (${plan.marketplace.workerBrowserTests.length} Dateien)`,
      tools: [],
    });
  if (plan.marketplace.workerImageRequired || plan.marketplace.sessionImageRequired)
    checks.push({
      id: 'images',
      title:
        'Ausgewählte Marketplace-Images und Isolation (nur wegwerfbarer GitHub-gehosteter Linux-Runner; lokal unvollständig)',
      tools: ['docker'],
    });
  return checks;
}

export function formatPreflightPlan(plan) {
  const checks = preflightChecks(plan);
  return [
    `Prüfumfang: ${plan.application.full ? 'umfassend' : 'gezielt'}; ${plan.paths?.length ?? 'unbekannte'} geänderte Pfade`,
    `Auswahlnachweis: ${plan.selectionHash}`,
    ...checks.map(
      (check) =>
        `- ${check.title}${check.supabase ? ' (lokale Supabase mit nachgewiesenem Migrationsstand)' : ''}`,
    ),
    'Planansicht führt keine Prüfungen aus.',
  ].join('\n');
}

export async function checkPreflightTools(
  checks,
  { environment = process.env, execute = exec } = {},
) {
  const missing = [];
  for (const tool of sorted(checks.flatMap((check) => check.tools))) {
    const executable = tool === 'actionlint' ? environment.ACTIONLINT_BIN || tool : tool;
    try {
      await execute(
        executable,
        tool === 'docker' ? ['info', '--format', '{{.ServerVersion}}'] : ['--version'],
        { env: environment },
      );
    } catch {
      missing.push(tool === 'docker' ? 'Docker mit erreichbarer Engine' : tool);
    }
  }
  if (missing.length)
    throw new Error(
      `Vorabcheck unvollständig: Erforderlich sind ${missing.join(', ')}. Es wurden keine Prüfungen als bestanden gewertet.`,
    );
}

export async function checkMigrationPackage({
  repository = process.cwd(),
  environment = process.env,
  temporaryRoot = tmpdir(),
  execute = executeCheckCommand,
} = {}) {
  const directory = await mkdtemp(join(temporaryRoot, 'flipbase-preflight-migrations-'));
  try {
    await execute(
      {
        name: 'SQL-Paket auf Vollständigkeit prüfen',
        command: 'node',
        args: ['scripts/package-migrations.mjs', 'supabase/migrations', join(directory, 'package')],
      },
      { repository, environment },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runPreflight(
  plan,
  { repository = process.cwd(), environment = process.env } = {},
) {
  // Auch lokal dieselbe begrenzte Parallelität und frische Vorschau wie im PR verwenden.
  environment = { ...environment, CI: 'true', GITHUB_SHA: plan.headSha };
  const checks = preflightChecks(plan);
  if (checks.some((check) => check.id === 'images')) assertMarketplaceImageRunner(environment);
  await checkPreflightTools(checks, { environment });
  const options = { repository, environment, commit: plan.headSha };
  const node = (name, args, env) =>
    executeCheckCommand({ name, command: 'node', args, env }, options);
  if (checks.some((check) => check.supabase)) {
    // Eine vorhandene Entwicklungsdatenbank weder zurücksetzen noch anhalten.
    await executeCheckCommand(
      {
        name: 'Lokale Supabase muss bereits bereitstehen',
        command: 'npm',
        args: ['exec', '--no', '--', 'supabase', 'status'],
      },
      options,
    );
    await checkLocalMigrations(plan.baseSha, { repository, environment });
  }
  for (const check of checks) {
    if (check.id === 'documentation') {
      const [listed, deleted] = await Promise.all([
        git(repository, [
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '-z',
          '--',
          '*.md',
        ]),
        git(repository, ['ls-files', '--deleted', '-z', '--', '*.md']),
      ]);
      const removed = new Set(deleted.split('\0'));
      const files = sorted(listed.split('\0').filter((file) => file && !removed.has(file)));
      await executeCheckCommand(
        {
          name: check.title,
          command: 'npm',
          args: ['exec', '--no', '--', 'prettier', '--check', '--', ...files],
        },
        options,
      );
    } else if (check.id === 'migration-structure') {
      await node(check.title, ['scripts/check-migration-changes.mjs', '--worktree', plan.baseSha]);
      await checkMigrationPackage({ repository, environment });
    } else if (check.id.startsWith('unit:')) {
      await node(
        check.title,
        ['scripts/run-affected-tests.mjs', 'unit', check.suite, check.shard],
        { AFFECTED_TEST_PLAN: JSON.stringify(plan.application) },
      );
    } else if (check.id.startsWith('browser:')) {
      await node(
        check.title,
        ['scripts/run-affected-tests.mjs', 'browser', `--shard=${check.shard}`],
        {
          AFFECTED_TEST_PLAN: JSON.stringify(plan.application),
          AFFECTED_BROWSER_PROJECT: check.project,
        },
      );
    } else if (['extension', 'worker-browser', 'images'].includes(check.id)) {
      await runMarketplaceChecks(check.id, plan.marketplace, { repository, environment });
    } else await runCiCheck(check.id, options);
  }
  console.log('\nAlle ausgewählten Vorabprüfungen erfolgreich.');
}

async function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const baseRef = baseIndex === -1 ? 'origin/master' : args[baseIndex + 1];
  const permitted = new Set(['--plan', '--json', '--github-output', '--base']);
  for (let index = 0; index < args.length; index++) {
    if (!permitted.has(args[index])) throw new Error(`Unbekanntes Argument: ${args[index]}`);
    if (args[index] === '--base') index++;
  }
  if (!baseRef) throw new Error('--base benötigt einen Vergleichszweig.');
  const github = args.includes('--github-output');
  const plan = await createPreflightPlan({
    baseRef,
    event: github
      ? {
          eventName: process.env.EVENT_NAME ?? process.env.GITHUB_EVENT_NAME,
          prBaseSha: process.env.PR_BASE_SHA,
          pushBeforeSha: process.env.PUSH_BEFORE_SHA,
          headSha: process.env.HEAD_SHA ?? process.env.GITHUB_SHA,
        }
      : undefined,
  });
  if (github) {
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT fehlt.');
    await appendFile(
      process.env.GITHUB_OUTPUT,
      Object.entries(githubPreflightOutputs(plan))
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `${formatPreflightPlan(plan)}\n`);
    console.log(formatPreflightPlan(plan));
  } else if (args.includes('--json')) console.log(JSON.stringify(plan));
  else if (args.includes('--plan')) console.log(formatPreflightPlan(plan));
  else {
    if (process.versions.node.split('.')[0] !== '22')
      throw new Error('Der Vorabcheck benötigt wie CI Node 22.');
    console.log(
      formatPreflightPlan(plan).replace(
        'Planansicht führt keine Prüfungen aus.',
        'Die ausgewählten Prüfungen werden jetzt ausgeführt.',
      ),
    );
    await runPreflight(plan);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  });
}
