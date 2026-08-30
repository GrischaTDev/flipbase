import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareFixture } from './prepare-db-tests.mjs';

test('kopiert das ausgelagerte SQL-Fixture unverändert als nicht entdeckbare Include-Datei', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flipbase-db-fixture-'));
  const sourcePath = join(directory, 'support', 'inventory.sql');
  const targetPath = join(directory, 'tests', '.generated', 'inventory.sql.inc');

  try {
    await mkdir(join(directory, 'support'), { recursive: true });
    await writeFile(sourcePath, "select 'fixture';\n", 'utf8');
    await prepareFixture({ sourcePath, targetPath });

    assert.equal(await readFile(targetPath, 'utf8'), "select 'fixture';\n");
    assert.match(targetPath, /\.inc$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
