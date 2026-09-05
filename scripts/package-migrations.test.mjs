import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./package-migrations.mjs', import.meta.url));

test('paketiert jede Migration unverändert mit automatisch passender Prüfsumme', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'migration-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const output = join(root, 'output');
  await mkdir(source);
  const file = '20260905000001_example.sql';
  const sql = 'select 1;\r\n';
  await writeFile(join(source, file), sql);
  const run = () => spawnSync(process.execPath, [script, source, output], { encoding: 'utf8' });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(output)).sort(), [file, 'approved.sha256']);
  assert.equal(await readFile(join(output, file), 'utf8'), sql);
  const hash = createHash('sha256').update(sql).digest('hex');
  assert.equal(await readFile(join(output, 'approved.sha256'), 'utf8'), `${hash}  ${file}\n`);
  assert.notEqual(run().status, 0, 'Vorhandene Pakete nicht mit alten Dateien vermischen');
});

for (const [label, files] of [
  ['leeres Verzeichnis', {}],
  ['ungültiger Name', { 'bad.sql': 'select 1;' }],
  ['leere Datei', { '20260905000001_empty.sql': ' \n' }],
  [
    'Unterordner',
    { '20260905000001_a.sql': 'select 1;', 'nested/20260905000002_b.sql': 'select 2;' },
  ],
  [
    'doppelte Version',
    { '20260905000001_a.sql': 'select 1;', '20260905000001_b.sql': 'select 2;' },
  ],
]) {
  test(`verweigert Paket bei ${label}`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'migration-invalid-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = join(root, 'source');
    await mkdir(source);
    for (const [name, sql] of Object.entries(files)) {
      await mkdir(dirname(join(source, name)), { recursive: true });
      await writeFile(join(source, name), sql);
    }
    const result = spawnSync(process.execPath, [script, source, join(root, 'output')], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
  });
}
