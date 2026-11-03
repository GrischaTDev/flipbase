/** Ein Prüfplan für lokale Vorbereitung und GitHub Actions. */
import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
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
import { isCiToolingPath } from './ci-tooling-paths.mjs';
import ts from 'typescript';

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
    workflowScriptTests: plan.workflowScriptTests,
  });
}

// Diese Verträge benötigen Docker beziehungsweise den isolierten Linux-/Imagehost.
// Sie bleiben vollständig in test:workflow und im expliziten CI-Profil enthalten.
const ciOnlyScriptTests = new Set([
  'scripts/deploy-script.test.mjs',
  'scripts/marketplace-check-selection.test.mjs',
]);

/** Direkte Skriptänderungen prüfen ihre vorhandenen Regressionen ohne CI-Infrastruktur. */
export async function selectLocalScriptTests(
  paths,
  repository = process.cwd(),
  { includeInfrastructure = false } = {},
) {
  if (!paths?.some((path) => !path.startsWith('docs/') && !path.endsWith('.md'))) return [];
  const listed = await git(repository, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    'scripts',
  ]);
  const files = new Map(
    (
      await Promise.all(
        sorted(listed.split('\0').filter((path) => path.endsWith('.mjs'))).map(async (path) => {
          try {
            return [path, await readFile(resolve(repository, path), 'utf8')];
          } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
          }
        }),
      )
    ).filter(Boolean),
  );
  const available = new Set([...files.keys(), ...paths]);
  const reverse = new Map();
  for (const [file, content] of files) {
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isStringLiteralLike(node)) {
        // Neben Imports zählen auch gelesene Workflowdateien und native Skriptfixtures.
        const dependency = [
          node.text,
          posix.normalize(posix.join(posix.dirname(file), node.text)),
        ].find((path) => available.has(path));
        if (dependency) {
          if (!reverse.has(dependency)) reverse.set(dependency, new Set());
          reverse.get(dependency).add(file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const affected = new Set(paths);
  for (const path of paths)
    if (/^scripts\/.*\.mjs$/u.test(path))
      affected.add(path.replace(/(?<!\.test)\.mjs$/u, '.test.mjs'));
  for (const path of affected)
    for (const consumer of reverse.get(path) ?? []) affected.add(consumer);
  return sorted(
    [...affected].filter(
      (path) =>
        path.endsWith('.test.mjs') &&
        files.has(path) &&
        (includeInfrastructure || !ciOnlyScriptTests.has(path)),
    ),
  );
}

const workflowInputPath =
  /^(?:scripts\/|\.github\/|deploy\/|docker\/|package(?:-lock)?\.json|(?:angular|tsconfig[^/]*|vitest[^/]*|playwright[^/]*)\.(?:json|ts)|\.dockerignore)/u;

/** Bekannte Werkzeuge prüfen ihre Verbraucher; unklare Bau-/Hoständerungen bleiben vollständig. */
export async function selectWorkflowScriptTests(paths, repository = process.cwd()) {
  if (paths === null) return null;
  const inputs = paths.filter((path) => workflowInputPath.test(path));
  if (inputs.some((path) => !isCiToolingPath(path))) return null;
  const roots = paths.includes('.github/workflows/ci.yml')
    ? [
        ...paths,
        'scripts/preflight.mjs',
        'scripts/ci-checks.mjs',
        'scripts/required-checks.mjs',
        'scripts/reuse-pr-checks.mjs',
      ]
    : paths;
  const tests = await selectLocalScriptTests(roots, repository, { includeInfrastructure: true });
  if (inputs.length && !tests.length) {
    // Ein neues oder entferntes Werkzeug darf keinen stillen Leerlauf erzeugen.
    const { stdout } = await exec(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        'scripts/ci-checks.test.mjs',
        'scripts/preflight.test.mjs',
      ],
      { cwd: repository, encoding: 'utf8' },
    );
    const validators = sorted(stdout.split(/\r?\n/u).filter(Boolean));
    return validators.length ? validators : null;
  }
  return tests;
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
  const [files, marketplace, workflowScriptTests] = await Promise.all([
    readSelectionFiles(repository),
    selectMarketplaceChecks(comparison.paths, { repository }),
    selectWorkflowScriptTests(comparison.paths, repository),
  ]);
  const localScriptTests =
    workflowScriptTests === null
      ? await selectLocalScriptTests(comparison.paths, repository)
      : workflowScriptTests.filter((path) => !ciOnlyScriptTests.has(path));
  const application = selectAffectedTests(comparison.paths, files);
  const plan = {
    version: 1,
    ...comparison,
    changes,
    application,
    marketplace,
    localScriptTests,
    workflowScriptTests,
  };
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
    workflow_required: plan.application.checks.workflow ?? true,
    workflow_script_tests: JSON.stringify(plan.workflowScriptTests ?? null),
    marketplace_check_plan: JSON.stringify(plan.marketplace),
    extension_required: plan.marketplace.extensionRequired,
    worker_browser_required: plan.marketplace.workerBrowserTests.length > 0,
    worker_image_required: plan.marketplace.workerImageRequired,
    session_image_required: plan.marketplace.sessionImageRequired,
  };
}

/** Lokaler Entwicklungsnachweis und verbindliche CI-Auswahl bleiben getrennt sichtbar. */
export function preflightChecks(plan, { profile = 'local', native = false } = {}) {
  if (!['local', 'ci'].includes(profile)) throw new Error('Ungültiges Prüfprofil.');
  if (plan.changes.documentation_only)
    return [{ id: 'documentation', title: 'Markdown formatieren prüfen', tools: [] }];
  const ci = profile === 'ci';
  const paths = plan.paths ?? [];
  const migrationStructure =
    ci ||
    plan.paths === null ||
    paths.some((path) =>
      /^(?:supabase\/(?:migrations|schemas)\/|scripts\/(?:check-migration|package-migrations)|deploy\/(?:apply-release-migrations|migration-backup))/u.test(
        path,
      ),
    );
  const checks = [
    ...(migrationStructure
      ? [{ id: 'migration-structure', title: 'Migrationsumfang und SQL-Paket', tools: [] }]
      : []),
    {
      id: 'quality-light',
      title: 'Format, Lint, Typen und Suite-Audit',
      tools: [],
    },
  ];
  if (ci && (plan.application.checks.workflow ?? true)) {
    checks.push(
      { id: 'workflow-lint', title: 'Workflow-Syntax (Actionlint)', tools: ['actionlint'] },
      {
        id: 'workflow',
        title: plan.workflowScriptTests
          ? `Betroffene Workflowverträge (${plan.workflowScriptTests.length} Dateien)`
          : 'Workflow- und Deploymentverträge',
        tools: plan.workflowScriptTests
          ? plan.workflowScriptTests.includes('scripts/deploy-script.test.mjs')
            ? ['docker', 'pwsh']
            : []
          : ['docker', 'pwsh'],
      },
    );
  } else if (paths.some((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path))) {
    checks.push({
      id: 'workflow-lint',
      title: 'Workflow-Syntax (Actionlint)',
      tools: ['actionlint'],
    });
  }
  if (!ci && plan.localScriptTests?.length)
    checks.push({
      id: 'script-tests',
      title: `Betroffene Skriptverträge (${plan.localScriptTests.length} Dateien)`,
      tools: [],
    });
  if (ci && plan.application.checks.marketplace)
    checks.push({
      id: 'marketplace',
      title: 'Marketplace-Worker und Edge-Funktionen',
      tools: ['deno'],
    });
  if (ci && plan.changes.push)
    checks.push({
      id: 'push',
      title: 'Push-Worker, Funktionen und Images',
      tools: ['deno', 'docker'],
    });
  if (ci && plan.changes.sniper)
    checks.push({ id: 'sniper', title: 'Sniper-Tests, Build und Image', tools: ['docker'] });
  if (ci && plan.changes.supabase)
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
  const localUnits = plan.application.localUnits ?? plan.application.units;
  if ((ci ? plan.application.units : localUnits).node.length)
    checks.push({ id: 'orchestrator', title: 'Testorchestrierung einmal prüfen', tools: [] });
  const units = ci
    ? buildUnitMatrix(plan.application)
    : Object.entries(localUnits)
        .filter(([, files]) => files.length)
        .map(([suite]) => ({ suite, shard: '1/1' }));
  for (const entry of units)
    checks.push({
      id: `unit:${entry.suite}:${entry.shard}`,
      title: `${entry.suite}-Tests ${entry.shard} (${(ci ? plan.application.units : localUnits)[entry.suite].length} Dateien)`,
      tools: [],
      ...entry,
    });
  if (
    plan.changes.application_tests &&
    (ci ||
      plan.paths === null ||
      localUnits.angular.length ||
      paths.some((path) => /^(?:src\/|(?:angular|package(?:-lock)?)\.json$)/u.test(path)))
  )
    checks.push({ id: 'build', title: 'Anwendungsbau einschließlich Angular-Vorlagen', tools: [] });
  for (const entry of ci ? buildBrowserMatrix(plan.application) : [])
    checks.push({
      id: `browser:${entry.project}:${entry.shard}`,
      title: `Browser ${entry.project} ${entry.shard}`,
      tools: entry.database === false ? [] : ['docker'],
      supabase: entry.database !== false,
      ...entry,
    });
  if (ci && plan.application.pwa)
    checks.push({ id: 'pwa', title: 'Produktions-PWA, Offline- und Updateabläufe', tools: [] });
  if ((ci || native) && plan.marketplace.extensionRequired)
    checks.push({ id: 'extension', title: 'Kleinanzeigen-Extension einmal prüfen', tools: [] });
  if ((ci || native) && plan.marketplace.workerBrowserTests.length)
    checks.push({
      id: 'worker-browser',
      title: `Native Worker-Browserfälle (${plan.marketplace.workerBrowserTests.length} Dateien)`,
      tools: [],
    });
  if (ci && (plan.marketplace.workerImageRequired || plan.marketplace.sessionImageRequired))
    checks.push({
      id: 'images',
      title:
        'Ausgewählte Marketplace-Images und Isolation (nur wegwerfbarer GitHub-gehosteter Linux-Runner)',
      tools: ['docker'],
    });
  return checks;
}

export function formatPreflightPlan(plan, { profile = 'local', native = false } = {}) {
  const checks = preflightChecks(plan, { profile, native });
  const localIds = new Set(checks.map((check) => check.id));
  const localUnits = plan.application.localUnits ?? plan.application.units;
  const deferred =
    profile === 'local'
      ? preflightChecks(plan, { profile: 'ci' }).filter(
          (check) =>
            !localIds.has(check.id) ||
            (check.id.startsWith('unit:') &&
              JSON.stringify(localUnits[check.suite]) !==
                JSON.stringify(plan.application.units[check.suite])),
        )
      : [];
  const describe = (check) =>
    `- ${check.title}${check.supabase ? ' (lokale Supabase mit nachgewiesenem Migrationsstand)' : ''}`;
  return [
    `Prüfprofil: ${profile === 'local' ? 'lokale Entwicklung' : 'vollständiger CI-Umfang'}`,
    `Prüfumfang: ${plan.application.full ? 'umfassend' : 'gezielt'}; ${plan.paths?.length ?? 'unbekannte'} geänderte Pfade`,
    `Auswahlnachweis: ${plan.selectionHash}`,
    ...checks.map(describe),
    ...(deferred.length
      ? ['Erforderlicher CI-Nachweis (nicht lokal ausgeführt):', ...deferred.map(describe)]
      : []),
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
  { repository = process.cwd(), environment = process.env, profile = 'local', native = false } = {},
) {
  // Der CI-Vollumfang bleibt ausdrücklich aufrufbar; Entwicklung startet keine Integrationsmatrix.
  environment = { ...environment, CI: 'true', GITHUB_SHA: plan.headSha };
  const checks = preflightChecks(plan, { profile, native });
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
    } else if (check.id === 'script-tests') {
      await node(check.title, ['--test', ...plan.localScriptTests]);
    } else if (check.id.startsWith('unit:')) {
      const application =
        profile === 'local'
          ? {
              ...plan.application,
              full: false,
              units: plan.application.localUnits ?? plan.application.units,
            }
          : plan.application;
      await node(
        check.title,
        ['scripts/run-affected-tests.mjs', 'unit', check.suite, check.shard],
        { AFFECTED_TEST_PLAN: JSON.stringify(application) },
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
    } else await runCiCheck(check.id, { ...options, workflowTests: plan.workflowScriptTests });
  }
  console.log(
    profile === 'local'
      ? '\nLokale Entwicklungsprüfungen erfolgreich. Der erforderliche CI-Nachweis bleibt offen.'
      : '\nAlle ausgewählten CI-Prüfungen erfolgreich.',
  );
}

async function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const baseRef = baseIndex === -1 ? 'origin/master' : args[baseIndex + 1];
  const permitted = new Set([
    '--plan',
    '--json',
    '--github-output',
    '--base',
    '--ci',
    '--full',
    '--native',
  ]);
  for (let index = 0; index < args.length; index++) {
    if (!permitted.has(args[index])) throw new Error(`Unbekanntes Argument: ${args[index]}`);
    if (args[index] === '--base') index++;
  }
  if (!baseRef) throw new Error('--base benötigt einen Vergleichszweig.');
  const github = args.includes('--github-output');
  const profile = github || args.includes('--ci') || args.includes('--full') ? 'ci' : 'local';
  const native = args.includes('--native');
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
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `${formatPreflightPlan(plan, { profile })}\n`,
      );
    console.log(formatPreflightPlan(plan, { profile }));
  } else if (args.includes('--json')) console.log(JSON.stringify(plan));
  else if (args.includes('--plan')) console.log(formatPreflightPlan(plan, { profile, native }));
  else {
    if (process.versions.node.split('.')[0] !== '22')
      throw new Error('Der Vorabcheck benötigt wie CI Node 22.');
    console.log(
      formatPreflightPlan(plan, { profile, native }).replace(
        'Planansicht führt keine Prüfungen aus.',
        'Die ausgewählten Prüfungen werden jetzt ausgeführt.',
      ),
    );
    await runPreflight(plan, { profile, native });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  });
}
