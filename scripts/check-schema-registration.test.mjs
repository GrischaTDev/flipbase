import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

test('registers every declarative schema exactly once', async () => {
  const config = await readFile('supabase/config.toml', 'utf8');
  const schemaPathsSection = config.match(/schema_paths\s*=\s*\[([^\]]*)\]/u);
  assert.ok(schemaPathsSection, 'schema_paths fehlt');

  const registeredPaths = [...schemaPathsSection[1].matchAll(/"([^"]+)"/gu)].map(
    (entry) => entry[1],
  );
  const schemaPaths = (await readdir('supabase/schemas'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => `./schemas/${name}`);

  assert.equal(
    new Set(registeredPaths).size,
    registeredPaths.length,
    'Doppelte Schemaregistrierung',
  );
  assert.deepEqual([...registeredPaths].sort(), schemaPaths.sort());
  assert.ok(
    registeredPaths.indexOf('./schemas/180_expenses.sql') >
      registeredPaths.indexOf('./schemas/170_purchase_documents.sql'),
  );
  assert.ok(
    registeredPaths.indexOf('./schemas/99_platform_admin.sql') <
      registeredPaths.indexOf('./schemas/50_sniper.sql'),
    'Betreiberfunktionen müssen vor den Bot-Policies geladen werden',
  );
});
