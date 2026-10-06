import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { completeStorageMigration } from './server-storage-migration.mjs';

test('Speichermelder sendet nur Partitionswerte über einen begrenzten Zugang', () => {
  const python =
    process.env.FLIPBASE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const script = fileURLToPath(new URL('./server-storage-monitor.test.py', import.meta.url));
  const result = spawnSync(python, ['-B', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});

test('ergänzt auch bei bestehenden Default-Grants die vollständigen Speicherrechte', () => {
  const schema = readFileSync(
    new URL('../supabase/schemas/410_server_storage.sql', import.meta.url),
    'utf8',
  );
  const generated = 'CREATE TABLE public.server_storage_status (id smallint);';
  const completed = completeStorageMigration(generated, schema);
  assert.match(
    completed,
    /revoke all on public.server_storage_status from public, anon, authenticated, service_role/u,
  );
  assert.match(completed, /grant select on public.server_storage_status to authenticated/u);
  assert.match(completed, /revoke all on function public.report_server_storage/u);
  assert.throws(() => completeStorageMigration(completed, schema));
  assert.throws(() => completeStorageMigration('CREATE TABLE public.other (id int);', schema));
});
