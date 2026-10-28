import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, copyFile, mkdtemp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  checkPreflightTools,
  checkMigrationPackage,
  createPreflightPlan,
  githubPreflightOutputs,
  localChangedPaths,
  preflightChecks,
  preflightSelectionHash,
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

test('echter lokaler Vorabcheck zeigt Pflichtimages und bricht trotz eigenem CI=true vor Werkzeugen ab', async (t) => {
  const { repository, write, base } = await fixture(t);
  await write('tools/cloud-browser-pilot/proxy-forwarder.mjs', 'export const fixture = true;');
  const cli = fileURLToPath(new URL('./preflight.mjs', import.meta.url));
  const environment = { PATH: process.env.PATH };
  const { stdout } = await exec(process.execPath, [cli, '--plan', '--base', base], {
    cwd: repository,
    env: environment,
  });
  assert.match(stdout, /Marketplace-Images.*lokal unvollständig/u);
  assert.match(stdout, /Planansicht führt keine Prüfungen aus/u);
  await assert.rejects(
    exec(process.execPath, [cli, '--base', base], { cwd: repository, env: environment }),
    (error) =>
      error.code === 1 &&
      /Vorabcheck unvollständig: Marketplace-Image- und Hostprüfungen/u.test(error.stderr) &&
      !/Erforderlich sind/u.test(error.stderr),
  );
});
