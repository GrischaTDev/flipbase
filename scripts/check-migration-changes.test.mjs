import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { migrationChanges, validateMigrationChanges } from './check-migration-changes.mjs';

const script = fileURLToPath(new URL('./check-migration-changes.mjs', import.meta.url));

test('erkennt vergessene Migrationen und Änderungen alter Dateien bereits im Git-Vergleich', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'migration-diff-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  await mkdir(join(cwd, 'supabase/schemas'), { recursive: true });
  await mkdir(join(cwd, 'supabase/migrations'));
  const schema = join(cwd, 'supabase/schemas/10_core.sql');
  const oldMigration = join(cwd, 'supabase/migrations/20260905000001_initial.sql');
  await writeFile(schema, 'select 1;');
  await writeFile(oldMigration, 'select 1;');
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  const run = () =>
    spawnSync(process.execPath, [script, base, git('rev-parse', 'HEAD')], {
      cwd,
      encoding: 'utf8',
    });
  assert.equal(run().status, 0);
  await writeFile(schema, 'select 2;');
  git('add', '.');
  git('commit', '--quiet', '-m', 'schema only');
  let result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Migrationsdatei/u);
  await mkdir(join(cwd, 'supabase/migrations/nested'));
  await writeFile(join(cwd, 'supabase/migrations/nested/20260905000002_update.sql'), 'select 2;');
  git('add', '.');
  git('commit', '--quiet', '-m', 'misplaced migration');
  assert.notEqual(run().status, 0, 'Verschachtelte Migration wird nicht ausgeliefert');
  git('rm', 'supabase/migrations/nested/20260905000002_update.sql');
  await writeFile(join(cwd, 'supabase/migrations/20260905000002_update.sql'), 'select 2;');
  git('add', '.');
  git('commit', '--quiet', '-m', 'include migration');
  result = run();
  assert.equal(result.status, 0, result.stderr);
  await writeFile(oldMigration, 'select 3;');
  git('add', '.');
  git('commit', '--quiet', '-m', 'edit history');
  result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Bestehende Migration/u);
});

test('prüft Schema und neue Migration vor dem Commit einschließlich Index und Arbeitskopie', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'migration-worktree-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  await mkdir(join(cwd, 'supabase/schemas'), { recursive: true });
  await mkdir(join(cwd, 'supabase/migrations'));
  const schema = join(cwd, 'supabase/schemas/10_core.sql');
  const initial = 'supabase/migrations/20260905000001_initial.sql';
  await writeFile(schema, 'select 1;');
  await writeFile(join(cwd, initial), 'select 1;');
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  const changes = () => migrationChanges(base, undefined, { repository: cwd, worktree: true });
  await writeFile(schema, 'select 2;');
  const schemaOnly = await changes();
  assert.throws(() => validateMigrationChanges(schemaOnly), /keine neue Migrationsdatei/u);
  const added = 'supabase/migrations/20261028000001_update.sql';
  await writeFile(join(cwd, added), 'select 2;');
  validateMigrationChanges(await changes());
  git('add', added);
  validateMigrationChanges(await changes());
  // Auch eine Umbenennung darf eine bereits ausgelieferte Migration nicht ersetzen.
  git('mv', initial, 'supabase/migrations/20260905000002_renamed.sql');
  const renamed = await changes();
  assert.throws(() => validateMigrationChanges(renamed), /Bestehende Migration/u);
});
