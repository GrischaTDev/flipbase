import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareFixture } from './prepare-db-tests.mjs';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

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

test('ersetzt ein vorhandenes Include atomar statt dessen Dateiinhalt direkt zu überschreiben', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flipbase-db-fixture-'));
  const sourcePath = join(directory, 'support', 'inventory.sql');
  const targetDirectory = join(directory, 'tests', '.generated');
  const targetPath = join(targetDirectory, 'inventory.sql.inc');
  const previousAliasPath = join(directory, 'previous-target.inc');

  try {
    await mkdir(join(directory, 'support'), { recursive: true });
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(sourcePath, "select 'new';\n", 'utf8');
    await writeFile(targetPath, "select 'old';\n", 'utf8');
    await link(targetPath, previousAliasPath);

    await prepareFixture({ sourcePath, targetPath });

    assert.equal(await readFile(targetPath, 'utf8'), "select 'new';\n");
    assert.equal(await readFile(previousAliasPath, 'utf8'), "select 'old';\n");
    assert.deepEqual(await readdir(targetDirectory), ['inventory.sql.inc']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('mehrere parallele Vorbereitungen liefern dieselbe vollständige Include-Datei', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flipbase-db-fixture-'));
  const sourcePath = join(directory, 'support', 'inventory.sql');
  const targetDirectory = join(directory, 'tests', '.generated');
  const targetPath = join(targetDirectory, 'inventory.sql.inc');
  const content = `-- ${'fixture'.repeat(150_000)}\nselect 'complete';\n`;

  try {
    await mkdir(join(directory, 'support'), { recursive: true });
    await writeFile(sourcePath, content, 'utf8');

    await Promise.all(Array.from({ length: 12 }, () => prepareFixture({ sourcePath, targetPath })));

    assert.equal(sha256(await readFile(targetPath)), sha256(content));
    assert.deepEqual(await readdir(targetDirectory), ['inventory.sql.inc']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
