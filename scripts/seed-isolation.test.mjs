import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

async function filesBelow(directory) {
  const entries = await readdir(join(root, directory), {
    withFileTypes: true,
    recursive: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

// supabase/seed.sql legt ein lokales Testkonto mit bekanntem Passwort an. Es darf nur
// bei `supabase db reset`/`start` auf dem eigenen Rechner und in CI laufen.
test('Seed-Daten gelangen weder ins Migrationspaket noch in die Veröffentlichung', async () => {
  const migrations = await readdir(join(root, 'supabase/migrations'));
  assert.deepEqual(
    migrations.filter((name) => /seed/i.test(name)),
    [],
    'Keine Seed-Datei unter supabase/migrations',
  );

  const releaseFiles = [
    'scripts/package-migrations.mjs',
    ...(await filesBelow('deploy')),
    ...(await filesBelow('docker')),
  ];
  for (const file of releaseFiles) {
    const content = await readFile(join(root, file), 'utf8');
    assert.doesNotMatch(content, /seed\.sql|include-seed|db:seed/i, `${file} nutzt Seed-Daten`);
  }

  for (const workflow of await filesBelow('.github/workflows')) {
    const content = await readFile(join(root, workflow), 'utf8');
    assert.doesNotMatch(content, /include-seed/i, `${workflow} spielt Seed-Daten ein`);
  }
});
