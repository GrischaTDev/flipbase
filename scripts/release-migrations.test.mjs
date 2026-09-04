import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

// Nur die ausdrücklich dafür gestartete, wegwerfbare Testdatenbank verwenden.
const enabled = process.env.PGDATABASE === 'flipbase_release_test';
const script = resolve('deploy/apply-release-migrations.sh');
function query(sql) {
  const result = spawnSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test(
  'Release-Migrationen: echte Transaktionen, Freigaben und Wiederholung',
  { skip: !enabled },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'release-migrations-'));
    const migrations = join(root, 'migrations');
    const bin = join(root, 'bin');
    mkdirSync(migrations);
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'docker'),
      '#!/bin/bash\n[[ "$1" == exec && "$2" == -i && "$3" == supabase-db ]] || exit 91\nshift 3\nexec "$@"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(root, 'migration-backup.sh'),
      '#!/bin/bash\necho backup >> "$FLIPBASE_DEPLOY_DIR/backup-calls"\nexit "${BACKUP_STATUS:-0}"\n',
      { mode: 0o755 },
    );
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FLIPBASE_DEPLOY_DIR: root };
    function run(extra = {}) {
      return spawnSync('bash', [script, migrations], {
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    }
    function migration(version, sql, approve = true) {
      const file = `${version}_fixture.sql`;
      writeFileSync(join(migrations, file), sql);
      if (approve)
        writeFileSync(
          join(migrations, 'approved.sha256'),
          `${createHash('sha256').update(sql).digest('hex')}  ${file}\n`,
          { flag: 'a' },
        );
    }
    try {
      query(
        'create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text);',
      );
      writeFileSync(join(migrations, 'approved.sha256'), '');
      migration('20260905000001', 'create table public.release_fixture(id integer);\n');
      let result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        query('select version from supabase_migrations.schema_migrations'),
        '20260905000001',
      );
      assert.equal(readFileSync(join(root, 'backup-calls'), 'utf8'), 'backup\n');
      assert.equal(run().status, 0);
      assert.equal(
        readFileSync(join(root, 'backup-calls'), 'utf8'),
        'backup\n',
        'Kein Backup beim No-op',
      );

      migration(
        '20260905000002',
        'alter table public.release_fixture add column amount integer;\n',
      );
      result = run({ BACKUP_STATUS: '42' });
      assert.notEqual(result.status, 0);
      assert.equal(
        query(
          "select count(*) from information_schema.columns where table_name='release_fixture' and column_name='amount'",
        ),
        '0',
      );
      assert.equal(run().status, 0);

      migration(
        '20260905000003',
        'alter table public.release_fixture add column failed integer;\nselect 1 / 0;\n',
      );
      result = run();
      assert.notEqual(result.status, 0);
      assert.equal(
        query(
          "select count(*) from information_schema.columns where table_name='release_fixture' and column_name='failed'",
        ),
        '0',
        'DDL muss zurueckrollen',
      );
      assert.equal(
        query(
          "select count(*) from supabase_migrations.schema_migrations where version='20260905000003'",
        ),
        '0',
        'Historie darf nicht vorlaufen',
      );
      assert.notEqual(run().status, 0, 'Wiederholung darf Fehler nicht verschlucken');
      rmSync(join(migrations, '20260905000003_fixture.sql'));
      writeFileSync(join(migrations, 'approved.sha256'), '');
      query(
        "create function public.reject_release_history() returns trigger language plpgsql as $$ begin raise exception 'history blocked'; end $$; create trigger reject_release_history before insert on supabase_migrations.schema_migrations for each row execute function public.reject_release_history();",
      );
      migration(
        '20260905000004',
        'alter table public.release_fixture add column history_failed integer;\n',
      );
      assert.notEqual(run().status, 0);
      assert.equal(
        query(
          "select count(*) from information_schema.columns where table_name='release_fixture' and column_name='history_failed'",
        ),
        '0',
        'Fehlender Historieneintrag muss DDL ebenfalls zurueckrollen',
      );
      query(
        'drop trigger reject_release_history on supabase_migrations.schema_migrations; drop function public.reject_release_history();',
      );
      assert.equal(run().status, 0, 'Wiederholung nach behobener Ursache');
      rmSync(join(migrations, '20260905000004_fixture.sql'));
      writeFileSync(join(migrations, 'approved.sha256'), '');
      migration('20260905000005', 'select 1;\n', false);
      assert.notEqual(run().status, 0, 'Ohne Freigabe keine Ausfuehrung');
      migration('20260905000005', 'select 1;\n');
      writeFileSync(join(migrations, '20260905000005_fixture.sql'), 'select 2;\n');
      assert.notEqual(run().status, 0, 'Geaenderte Pruefsumme sperren');
      writeFileSync(join(migrations, '../invalid.sql'), 'select 1;');
      writeFileSync(join(migrations, 'approved.sha256'), 'a'.repeat(64) + '  ../invalid.sql\n');
      assert.notEqual(run().status, 0, 'Pfadwechsel sperren');
    } finally {
      query(
        'drop table if exists public.release_fixture; drop schema if exists supabase_migrations cascade; drop function if exists public.reject_release_history();',
      );
      rmSync(root, { recursive: true, force: true });
    }
  },
);
