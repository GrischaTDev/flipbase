import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  checkLocalMigrations,
  migrationStatements,
  validateLocalMigrationHistory,
} from './check-local-migrations.mjs';

const exec = promisify(execFile);
const path = 'supabase/migrations/20261028000000_example.sql';
const files = [{ version: '20261028000000', path, sql: 'select 1;\nselect 2;' }];
const newPaths = new Set([path]);
const history = [{ version: files[0].version, statements: ['select 1', 'select 2'] }];

test('gleicher Stand besteht, fehlende/fremde Versionen und unbekannte Historie brechen ab', () => {
  validateLocalMigrationHistory(files, history, newPaths);
  for (const bad of [
    null,
    [],
    [...history, { version: '20261029000000' }],
    [...history, history[0]],
  ])
    assert.throws(
      () => validateLocalMigrationHistory(files, bad, newPaths),
      /Vorabcheck unvollständig/u,
    );
});

test('neue Branchmigrationen benötigen den exakt angewandten SQL-Inhalt', () => {
  for (const statements of [null, [], ['select 1'], ['select 2', 'select 1'], ['select 1', null]])
    assert.throws(
      () => validateLocalMigrationHistory(files, [{ ...history[0], statements }], newPaths),
      /Vorabcheck unvollständig/u,
    );
  for (const sql of [
    'select 1 select 2;',
    'select 1; select 3;',
    "select '1'; select 2;",
    'select 1; -- verändert\nselect 2;',
  ])
    assert.throws(
      () => validateLocalMigrationHistory([{ ...files[0], sql }], history, newPaths),
      /Vorabcheck unvollständig/u,
    );
  // Alte Versionen benötigen keinen nachträglich erfundenen Inhaltsnachweis.
  validateLocalMigrationHistory(
    files,
    [{ version: files[0].version, statements: null }],
    new Set(),
  );
});

test('CLI-Historienform erhält Kommentare, Quotes, Dollarstrings und innere Leerzeichen', () => {
  const statements = [
    '-- Kommentar;\nselect  1',
    'select \'a;\'\'b\', "a;""b"',
    '/* außen /* innen; */ */ select 2',
    'do $body$ begin perform 1; perform 2; end $body$',
  ];
  const sql = ` \n${statements.join(';\n\n')};\n`;
  assert.deepEqual(migrationStatements(sql), statements);
  validateLocalMigrationHistory([{ ...files[0], sql }], [{ ...history[0], statements }], newPaths);
  for (const broken of [
    sql.replace('end $body$', 'end $changed$'),
    sql.replace('*/ */', '*/'),
    sql.replace("b',", 'b,'),
    sql.replace('perform 2;', 'perform 3;'),
  ])
    assert.throws(
      () =>
        validateLocalMigrationHistory(
          [{ ...files[0], sql: broken }],
          [{ ...history[0], statements }],
          newPaths,
        ),
      /Vorabcheck unvollständig/u,
    );
});

test('ein entfernter Zeilenumbruch darf die nächste Anweisung nicht unbemerkt auskommentieren', () => {
  const statements = ['select 1 -- Kommentar', 'select 2'];
  const applied = [{ ...history[0], statements }];
  validateLocalMigrationHistory(
    [{ ...files[0], sql: 'select 1 -- Kommentar\n;\nselect 2;' }],
    applied,
    newPaths,
  );
  assert.throws(
    () =>
      validateLocalMigrationHistory(
        [{ ...files[0], sql: 'select 1 -- Kommentar;select 2;' }],
        applied,
        newPaths,
      ),
    /SQL-Inhalt.*weicht/u,
  );
});

test('unbekannte oder unvollständige Lexik ergibt keinen falschen Inhaltsnachweis', () => {
  for (const sql of [
    "select E'a\\nb';",
    'select $1;',
    'select (1;',
    'select 1);',
    'begin atomic select 1; end;',
    '/* offen',
    "select 'offen",
    'do $$ offen',
  ])
    assert.throws(() => migrationStatements(sql), /Vorabcheck unvollständig/u);
});

test('echte Git-Arbeitskopie bindet ungetrackte Branchmigrationen und fragt ausschließlich den festen lokalen Container lesend ab', async (t) => {
  const repository = await mkdtemp(join(tmpdir(), 'flipbase-local-migrations-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = async (...args) => (await exec('git', args, { cwd: repository })).stdout.trim();
  await git('init', '--quiet');
  await git('config', 'user.name', 'Test');
  await git('config', 'user.email', 'test@example.invalid');
  await mkdir(join(repository, 'supabase/migrations'), { recursive: true });
  await writeFile(join(repository, 'README.md'), 'fixture');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'base');
  const baseSha = await git('rev-parse', 'HEAD');
  await writeFile(join(repository, path), files[0].sql);
  const calls = [];
  const options = {
    repository,
    environment: { PGDATABASE: 'flipbase_release_test', PGHOST: 'remote.invalid' },
    async execute(command, args) {
      calls.push({ command, args });
      return { stdout: JSON.stringify(history) };
    },
  };
  await checkLocalMigrations(baseSha, options);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'docker');
  assert.deepEqual(calls[0].args.slice(0, 12), [
    'exec',
    'supabase_db_flipbase-supabase',
    'psql',
    '-X',
    '-h',
    '127.0.0.1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-qAt',
    '-v',
  ]);
  assert.match(calls[0].args.at(-1), /^begin read only; select .*; commit;$/u);
  await writeFile(join(repository, path), 'select public.definitely_missing_preflight_function();');
  await assert.rejects(checkLocalMigrations(baseSha, options), /SQL-Inhalt.*weicht/u);
  await assert.rejects(
    checkLocalMigrations(baseSha, { ...options, execute: async () => ({ stdout: '[]' }) }),
    /fehlend: 20261028000000/u,
  );
  await assert.rejects(
    checkLocalMigrations(baseSha, { ...options, execute: async () => ({ stdout: 'unbekannt' }) }),
    /nicht verlässlich gelesen/u,
  );
});
