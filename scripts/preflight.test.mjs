import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  checkPreflightTools,
  checkMigrationPackage,
  createPreflightPlan,
  formatPreflightPlan,
  githubPreflightOutputs,
  localChangedPaths,
  preflightChecks,
  preflightSelectionHash,
  runPreflight,
  selectLocalScriptTests,
  selectWorkflowScriptTests,
} from './preflight.mjs';

const exec = promisify(execFile);

async function fixture(t) {
  const repository = await mkdtemp(join(tmpdir(), 'flipbase-preflight-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = async (...args) => (await exec('git', args, { cwd: repository })).stdout.trim();
  const write = async (path, text = path) => {
    const target = join(repository, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, text);
  };
  await git('init', '--quiet', '--initial-branch=master');
  await git('config', 'user.name', 'Test');
  await git('config', 'user.email', 'test@example.invalid');
  await write('.gitignore', 'node_modules/\n');
  await write('README.md', '# Beispiel\n');
  await write('src/shared.ts', 'export const value = 1;\n');
  await write('src/removed.ts', 'export const oldValue = 1;\n');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'base');
  const base = await git('rev-parse', 'HEAD');
  return { repository, git, write, base };
}

test('lokale Auswahl nutzt den gemeinsamen Vorfahren sowie Commit, Index, Arbeitskopie und neue Dateien', async (t) => {
  const { repository, git, write, base } = await fixture(t);
  await git('branch', 'feature');
  await write('upstream-only.md');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'upstream');
  await git('update-ref', 'refs/remotes/origin/master', await git('rev-parse', 'HEAD'));
  await git('switch', '--quiet', 'feature');
  await write('src/committed.ts');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'feature');
  await write('src/staged.ts');
  await git('add', 'src/staged.ts');
  await write('src/shared.ts', 'export const value = 2;\n');
  await rm(join(repository, 'src/removed.ts'));
  await rename(join(repository, 'README.md'), join(repository, 'renamed.md'));
  await write('src/untracked.ts');
  await write('node_modules/ignored.ts');
  const plan = await localChangedPaths(repository);
  assert.equal(plan.baseSha, base);
  assert.deepEqual(plan.paths, [
    'README.md',
    'renamed.md',
    'src/committed.ts',
    'src/removed.ts',
    'src/shared.ts',
    'src/staged.ts',
    'src/untracked.ts',
  ]);
  await assert.rejects(localChangedPaths(repository, '--all'), /Ungültiger Vergleichszweig/u);
});

test('Planansicht für reine Dokumentation bleibt ohne technische Prüfungen und berücksichtigt neue Dateien', async (t) => {
  const { repository, write, base } = await fixture(t);
  await write('docs/new.md', '# Neue Hinweise\n');
  const plan = await createPreflightPlan({ repository, baseRef: base });
  assert.equal(plan.changes.documentation_only, true);
  assert.deepEqual(
    preflightChecks(plan).map((check) => check.id),
    ['documentation'],
  );
  const { stdout } = await exec(
    process.execPath,
    [fileURLToPath(new URL('./preflight.mjs', import.meta.url)), '--json', '--base', base],
    { cwd: repository },
  );
  const printed = JSON.parse(stdout);
  assert.deepEqual(printed.paths, ['docs/new.md']);
  assert.equal(printed.selectionHash, plan.selectionHash);
  assert.equal(githubPreflightOutputs(plan).browser_required, false);
});

test('manueller Wiederanlauf wählt trotz reiner Dokumentationsdifferenz alle CI-Bereiche', async (t) => {
  const { repository, git, write, base } = await fixture(t);
  await write('docs/recovery.md', '# Wiederanlauf\n');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'documentation');
  const plan = await createPreflightPlan({
    repository,
    event: {
      eventName: 'workflow_dispatch',
      pushBeforeSha: base,
      headSha: await git('rev-parse', 'HEAD'),
    },
  });
  assert.equal(plan.paths, null);
  for (const selected of ['application', 'application_tests', 'supabase', 'sniper', 'push'])
    assert.equal(plan.changes[selected], true, selected);
  assert.equal(plan.changes.documentation_only, false);
  const output = githubPreflightOutputs(plan);
  for (const selected of [
    'pwa_required',
    'worker_image_required',
    'session_image_required',
    'extension_required',
  ])
    assert.equal(output[selected], true, selected);
  assert.equal(output.workflow_script_tests, 'null');
});

test('ein Wiederverwendungsnachweis bindet auch native Browser, Extension, Images und Dienstgates', () => {
  const original = {
    changes: { application: true, supabase: false, push: false },
    application: { units: { node: ['a.spec.ts'] } },
    marketplace: {
      extensionRequired: false,
      workerBrowserTests: [],
      workerImageRequired: false,
      sessionImageRequired: false,
    },
  };
  const hash = preflightSelectionHash(original);
  for (const patch of [
    { extensionRequired: true },
    { workerBrowserTests: ['services/marketplace-worker/test/browser/form.browser.test.ts'] },
    { workerImageRequired: true, sessionImageRequired: true },
  ])
    assert.notEqual(
      preflightSelectionHash({ ...original, marketplace: { ...original.marketplace, ...patch } }),
      hash,
    );
  assert.notEqual(
    preflightSelectionHash({ ...original, changes: { ...original.changes, push: true } }),
    hash,
  );
  assert.notEqual(
    preflightSelectionHash({ ...original, workflowScriptTests: ['scripts/ci-checks.test.mjs'] }),
    hash,
  );
  assert.equal(
    preflightSelectionHash({ ...original, headSha: 'anderer-Commit-bei-gleichem-Inhalt' }),
    hash,
  );
});

test('fehlende Pflichtprogramme ergeben einen unvollständigen Vorabcheck statt stiller Auslassungen', async () => {
  const probes = [];
  await assert.rejects(
    checkPreflightTools(
      [{ tools: ['docker', 'deno', 'actionlint', 'pwsh'] }, { tools: ['docker'] }],
      {
        environment: { ACTIONLINT_BIN: '/tools/actionlint' },
        async execute(command, args) {
          probes.push({ command, args });
          if (['docker', 'deno', 'pwsh'].includes(command)) throw new Error('nicht verfügbar');
        },
      },
    ),
    /Vorabcheck unvollständig:.*deno.*Docker.*pwsh/u,
  );
  assert.equal(probes.filter(({ command }) => command === 'docker').length, 1);
  assert.deepEqual(probes.find(({ command }) => command === 'docker').args, [
    'info',
    '--format',
    '{{.ServerVersion}}',
  ]);
  assert.ok(probes.some(({ command }) => command === '/tools/actionlint'));
});

test('SQL-Paketprüfung funktioniert wiederholt ohne Angular-Cache und räumt auch bei Folgefehler auf', async (t) => {
  const { repository, write } = await fixture(t);
  await write('supabase/migrations/20261028000000_example.sql', 'select 1;');
  await mkdir(join(repository, 'scripts'));
  await copyFile(
    new URL('./package-migrations.mjs', import.meta.url),
    join(repository, 'scripts/package-migrations.mjs'),
  );
  const temporaryRoot = join(repository, 'temporary');
  await mkdir(temporaryRoot);
  const options = { repository, temporaryRoot };
  await assert.rejects(access(join(repository, '.angular')));
  await checkMigrationPackage(options);
  await checkMigrationPackage(options);
  assert.deepEqual(await readdir(temporaryRoot), []);
  const { executeCheckCommand } = await import('./ci-checks.mjs');
  await assert.rejects(
    checkMigrationPackage({
      ...options,
      async execute(command, executionOptions) {
        await executeCheckCommand(command, executionOptions);
        await executeCheckCommand(
          { name: 'Folgefehler', command: 'node', args: ['--eval', 'process.exit(19)'] },
          executionOptions,
        );
      },
    }),
    (error) => error.exitCode === 19,
  );
  assert.deepEqual(await readdir(temporaryRoot), []);
  await checkMigrationPackage(options);
  assert.deepEqual(await readdir(temporaryRoot), []);
});

test('lokaler Plan trennt Pflichtimages ab; expliziter CI-Vorabcheck erhält die Hostgrenze', async (t) => {
  const { repository, write, base } = await fixture(t);
  await write('tools/cloud-browser-pilot/proxy-forwarder.mjs', 'export const fixture = true;');
  const cli = fileURLToPath(new URL('./preflight.mjs', import.meta.url));
  const environment = { PATH: process.env.PATH };
  const { stdout } = await exec(process.execPath, [cli, '--plan', '--base', base], {
    cwd: repository,
    env: environment,
  });
  assert.match(stdout, /Prüfprofil: lokale Entwicklung/u);
  assert.match(stdout, /Erforderlicher CI-Nachweis \(nicht lokal ausgeführt\):/u);
  assert.match(stdout, /Marketplace-Images.*GitHub-gehosteter Linux-Runner/u);
  assert.match(stdout, /Planansicht führt keine Prüfungen aus/u);
  await assert.rejects(
    exec(process.execPath, [cli, '--ci', '--base', base], { cwd: repository, env: environment }),
    (error) =>
      error.code === 1 &&
      /Vorabcheck unvollständig: Marketplace-Image- und Hostprüfungen/u.test(error.stderr) &&
      !/Erforderlich sind/u.test(error.stderr),
  );
  const { stdout: full } = await exec(process.execPath, [cli, '--full', '--plan', '--base', base], {
    cwd: repository,
    env: environment,
  });
  assert.match(full, /Prüfprofil: vollständiger CI-Umfang/u);
  assert.doesNotMatch(full, /Erforderlicher CI-Nachweis \(nicht lokal ausgeführt\):/u);
});

function technicalPlan() {
  return {
    paths: ['src/app/shared/components/button/button.component.ts'],
    changes: {
      documentation_only: false,
      application_tests: true,
      supabase: true,
      push: true,
      sniper: true,
    },
    application: {
      full: true,
      units: {
        node: ['src/a.spec.ts'],
        dom: [],
        angular: Array.from({ length: 130 }, (_, i) => `src/${i}.angular.spec.ts`),
      },
      coreBrowserFiles: ['e2e/core-smoke.spec.ts'],
      layoutBrowserFiles: ['e2e/responsive-admin-layout.spec.ts'],
      browserFiles: ['e2e/kleinanzeigen-accounts.spec.ts'],
      changedBrowserFiles: [],
      pwa: true,
      checks: { workflow: false, marketplace: true, landing: false },
    },
    marketplace: {
      extensionRequired: true,
      workerBrowserTests: ['services/marketplace-worker/test/browser/form.browser.test.ts'],
      workerImageRequired: true,
      sessionImageRequired: true,
    },
  };
}

test('Entwicklungsprofil benötigt keine Integrationswerkzeuge und führt jede Unitsuite einmal aus', () => {
  const plan = technicalPlan();
  const local = preflightChecks(plan);
  assert.deepEqual(
    local.map(({ id }) => id),
    ['quality-light', 'orchestrator', 'unit:node:1/1', 'unit:angular:1/1', 'build'],
  );
  assert.deepEqual(
    local.flatMap(({ tools }) => tools),
    [],
  );
  const ci = preflightChecks(plan, { profile: 'ci' });
  for (const id of [
    'migration-structure',
    'marketplace',
    'database',
    'pwa',
    'extension',
    'worker-browser',
    'images',
  ])
    assert.ok(
      ci.some((check) => check.id === id),
      `CI-Nachweis ${id} fehlt`,
    );
  assert.ok(ci.filter(({ id }) => id.startsWith('unit:angular:')).length > 1);
  assert.ok(ci.some(({ id }) => id.startsWith('browser:')));
  assert.equal(githubPreflightOutputs(plan).workflow_required, false);
  const description = formatPreflightPlan(plan);
  assert.match(description, /Erforderlicher CI-Nachweis \(nicht lokal ausgeführt\):/u);
  assert.match(description, /Produktions-PWA/u);
  assert.match(description, /Marketplace-Images/u);
});

test('native Browser sind lokal ausdrücklich zuschaltbar, Images bleiben dem CI-Profil vorbehalten', () => {
  const checks = preflightChecks(technicalPlan(), { native: true });
  assert.ok(checks.some(({ id }) => id === 'extension'));
  assert.ok(checks.some(({ id }) => id === 'worker-browser'));
  assert.equal(
    checks.some(({ id }) => id === 'images'),
    false,
  );
  assert.throws(
    () => preflightChecks(technicalPlan(), { profile: 'unknown' }),
    /Ungültiges Prüfprofil/u,
  );
});

test('breite CI-Auswahl für Infrastruktur startet lokal keine unbetroffenen Anwendungssuiten oder Bauten', () => {
  const original = technicalPlan();
  const plan = {
    ...original,
    paths: ['scripts/affected-tests.mjs'],
    application: {
      ...original.application,
      localUnits: { node: [], dom: [], angular: [] },
      checks: { ...original.application.checks, workflow: true },
    },
    localScriptTests: ['scripts/affected-tests.test.mjs'],
  };
  assert.deepEqual(
    preflightChecks(plan).map(({ id }) => id),
    ['quality-light', 'script-tests'],
  );
  const ci = preflightChecks(plan, { profile: 'ci' });
  assert.ok(ci.some(({ id }) => id.startsWith('unit:angular:')));
  assert.ok(ci.some(({ id }) => id === 'build'));
  assert.ok(ci.some(({ id }) => id === 'workflow'));
  assert.equal(plan.application.units.angular.length, 130);
});

test('lokale Ausführung übergibt dem Unitrunner tatsächlich nur lokale Dateien statt der vollen CI-Suite', async (t) => {
  const { repository, write, base } = await fixture(t);
  await write('npm-fixture.mjs', 'process.exit(0);');
  await write(
    'scripts/run-affected-tests.mjs',
    'import {writeFileSync} from "node:fs"; writeFileSync("executed-unit-plan.json", process.env.AFFECTED_TEST_PLAN);',
  );
  const original = technicalPlan();
  const localUnits = { node: ['src/target.spec.ts'], dom: [], angular: [] };
  await runPreflight(
    {
      ...original,
      paths: ['scripts/source.mjs'],
      headSha: base,
      baseSha: base,
      application: { ...original.application, localUnits },
    },
    {
      repository,
      environment: { ...process.env, npm_execpath: join(repository, 'npm-fixture.mjs') },
    },
  );
  const executed = JSON.parse(await readFile(join(repository, 'executed-unit-plan.json'), 'utf8'));
  assert.equal(executed.full, false);
  assert.deepEqual(executed.units, localUnits);
  assert.equal(original.application.full, true);
  assert.equal(original.application.units.angular.length, 130);
});

test('Planansicht erhält zusätzlichen CI-Unitumfang trotz gleicher lokaler Gruppenkennung', () => {
  const original = technicalPlan();
  const plan = {
    ...original,
    application: {
      ...original.application,
      units: { node: ['src/local.spec.ts', 'src/ci-only.spec.ts'], dom: [], angular: [] },
      localUnits: { node: ['src/local.spec.ts'], dom: [], angular: [] },
    },
  };
  const description = formatPreflightPlan(plan);
  const [local, deferred] = description.split(
    'Erforderlicher CI-Nachweis (nicht lokal ausgeführt):',
  );
  assert.match(local, /node-Tests 1\/1 \(1 Dateien\)/u);
  assert.match(deferred, /node-Tests 1\/1 \(2 Dateien\)/u);
  const identical = formatPreflightPlan({
    ...plan,
    application: { ...plan.application, localUnits: plan.application.units },
  }).split('Erforderlicher CI-Nachweis (nicht lokal ausgeführt):')[1];
  assert.doesNotMatch(identical, /node-Tests/u);
});

test('datenbankfreie UI-Matrix verlangt auch im vollständigen Plan keine lokale Supabase', () => {
  const original = technicalPlan();
  const plan = {
    ...original,
    application: {
      ...original.application,
      coreBrowserFiles: [],
      layoutBrowserFiles: ['e2e/settings-layout.spec.ts'],
      browserFiles: [],
      changedBrowserFiles: [],
      uiBrowserFiles: ['e2e/marketplace-overview.spec.ts'],
      changedUiBrowserFiles: ['e2e/kleinanzeigen-accounts.spec.ts'],
    },
  };
  const browsers = preflightChecks(plan, { profile: 'ci' }).filter(({ id }) =>
    id.startsWith('browser:'),
  );
  assert.ok(browsers.length > 0);
  for (const browser of browsers) {
    assert.equal(browser.database, false);
    assert.equal(browser.supabase, false);
    assert.deepEqual(browser.tools, []);
  }
  const backend = preflightChecks(technicalPlan(), { profile: 'ci' }).find(({ id }) =>
    id.startsWith('browser:core-smoke:'),
  );
  assert.equal(backend.supabase, true);
  assert.deepEqual(backend.tools, ['docker']);
});

test('Skriptänderungen wählen nur vorhandene eigene Regressionen und keine Infrastrukturmatrix', async (t) => {
  const { repository, write, base } = await fixture(t);
  await write('scripts/example.mjs', 'export const value = 1;');
  await write(
    'scripts/example.test.mjs',
    'import test from "node:test"; test("example", () => {});',
  );
  await write('scripts/other.test.mjs', 'import test from "node:test";');
  const tests = await selectLocalScriptTests(
    [
      'scripts/example.mjs',
      'scripts/example.test.mjs',
      'scripts/removed.test.mjs',
      'docs/example.mjs',
    ],
    repository,
  );
  assert.deepEqual(tests, ['scripts/example.test.mjs']);
  const plan = await createPreflightPlan({ repository, baseRef: base });
  assert.deepEqual(plan.localScriptTests, ['scripts/example.test.mjs', 'scripts/other.test.mjs']);
  const checks = preflightChecks(plan);
  assert.ok(checks.some(({ id }) => id === 'script-tests'));
  assert.equal(
    checks.some(({ id }) => ['database', 'images', 'workflow'].includes(id)),
    false,
  );
  assert.deepEqual(
    checks.flatMap(({ tools }) => tools),
    [],
  );
  const ci = preflightChecks(
    {
      ...plan,
      application: { ...plan.application, checks: { ...plan.application.checks, workflow: true } },
    },
    { profile: 'ci' },
  );
  assert.ok(ci.some(({ id }) => id === 'workflow'));
});

test('SQL-Struktur wird lokal bei Schemaänderungen ohne Datenbankstart geprüft', () => {
  const plan = { ...technicalPlan(), paths: ['supabase/schemas/10_core.sql'] };
  const checks = preflightChecks(plan);
  assert.ok(checks.some(({ id }) => id === 'migration-structure'));
  assert.equal(
    checks.some(({ supabase }) => supabase),
    false,
  );
});

test('lokale Skriptauswahl verfolgt Importe sowie gelesene Workflows und erhält unabhängige Fälle', async (t) => {
  const { repository, write } = await fixture(t);
  await write('scripts/source.mjs', 'export const value = 1;');
  await write('scripts/relay.mjs', "export { value } from './source.mjs';");
  await write('scripts/consumer.test.mjs', "import { value } from './relay.mjs';");
  await write(
    'scripts/workflow.test.mjs',
    "new URL('../.github/workflows/ci.yml', import.meta.url);",
  );
  await write('scripts/unrelated.test.mjs', 'export const unrelated = true;');
  await write('.github/workflows/ci.yml', 'name: CI');
  assert.deepEqual(await selectLocalScriptTests(['scripts/source.mjs'], repository), [
    'scripts/consumer.test.mjs',
  ]);
  assert.deepEqual(await selectLocalScriptTests(['.github/workflows/ci.yml'], repository), [
    'scripts/workflow.test.mjs',
  ]);
  assert.deepEqual(await selectLocalScriptTests(['docs/notes.md'], repository), []);
});

test('Deployment- und Linuxhostverträge bleiben vollständig CI-pflichtig ohne lokale Dockerpflicht', async (t) => {
  const { repository, write, base } = await fixture(t);
  const infrastructure = [
    'scripts/deploy-script.test.mjs',
    'scripts/marketplace-check-selection.test.mjs',
  ];
  await write('scripts/source.mjs', 'export const value = 1;');
  await write('scripts/local.test.mjs', "import './source.mjs';");
  for (const path of infrastructure) await write(path, "import './source.mjs';");
  assert.deepEqual(await selectLocalScriptTests(['scripts/source.mjs'], repository), [
    'scripts/local.test.mjs',
  ]);
  assert.deepEqual(await selectLocalScriptTests(infrastructure, repository), []);
  const plan = await createPreflightPlan({ repository, baseRef: base });
  assert.deepEqual(plan.localScriptTests, ['scripts/local.test.mjs']);
  assert.equal(plan.application.checks.workflow, true);
  assert.ok(preflightChecks(plan, { profile: 'ci' }).some(({ id }) => id === 'workflow'));
  assert.deepEqual(
    preflightChecks(plan).flatMap(({ tools }) => tools),
    [],
  );
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const path of infrastructure)
    assert.ok(manifest.scripts['test:workflow'].includes(path), `${path} fehlt in der Pflicht-CI`);
});

test('reine Timingwerkzeuge wählen dieselben betroffenen Scriptverträge lokal und in GitHub', async (t) => {
  const { repository, git, write } = await fixture(t);
  await write('scripts/browser-test-timings.mjs', 'export const duration = 1;');
  await write('scripts/ci-checks.test.mjs', "import './browser-test-timings.mjs';");
  await write('scripts/unrelated.test.mjs', 'export const unrelated = true;');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'tooling fixtures');
  const base = await git('rev-parse', 'HEAD');
  await write('scripts/browser-test-timings.mjs', 'export const duration = 2;');
  const plan = await createPreflightPlan({ repository, baseRef: base });
  assert.deepEqual(plan.workflowScriptTests, ['scripts/ci-checks.test.mjs']);
  assert.deepEqual(plan.localScriptTests, plan.workflowScriptTests);
  const output = githubPreflightOutputs(plan);
  assert.deepEqual(JSON.parse(output.workflow_script_tests), plan.workflowScriptTests);
  assert.equal(output.application_tests, false);
  assert.equal(output.unit_required, false);
  assert.equal(output.browser_required, false);
  const workflow = preflightChecks(plan, { profile: 'ci' }).find(({ id }) => id === 'workflow');
  assert.deepEqual(workflow.tools, []);
  assert.match(workflow.title, /1 Dateien/u);
});

test('unzugeordnete Werkzeuge ergeben Validatoren oder konservative Vollauswahl statt Leergrün', async (t) => {
  const { repository, write } = await fixture(t);
  await write('scripts/preflight.test.mjs', 'export const validator = true;');
  assert.deepEqual(
    await selectWorkflowScriptTests(['scripts/install-test-selection-parser.mjs'], repository),
    ['scripts/preflight.test.mjs'],
  );
  assert.equal(await selectWorkflowScriptTests(['scripts/unknown.mjs'], repository), null);
  assert.equal(await selectWorkflowScriptTests(['docker/Dockerfile'], repository), null);
  assert.equal(await selectWorkflowScriptTests(null, repository), null);
});

test('ci.yml erhält seine statischen Sicherheitsverträge ohne unveränderte Host- und Nginxfälle', async () => {
  const tests = await selectWorkflowScriptTests(['.github/workflows/ci.yml']);
  for (const required of [
    'scripts/ci-checks.test.mjs',
    'scripts/required-checks.test.mjs',
    'scripts/reuse-pr-checks.test.mjs',
  ])
    assert.ok(tests.includes(required), `${required} fehlt`);
  assert.equal(tests.includes('scripts/deploy-script.test.mjs'), false);
  const deployment = await selectWorkflowScriptTests(['deploy/deploy.sh']);
  assert.equal(deployment, null);
  const directHost = await selectWorkflowScriptTests(['scripts/deploy-script.test.mjs']);
  assert.ok(directHost.includes('scripts/deploy-script.test.mjs'));
  const plan = {
    ...technicalPlan(),
    workflowScriptTests: directHost,
    application: { ...technicalPlan().application, checks: { workflow: true } },
  };
  assert.deepEqual(
    preflightChecks(plan, { profile: 'ci' }).find(({ id }) => id === 'workflow').tools,
    ['docker', 'pwsh'],
  );
});
