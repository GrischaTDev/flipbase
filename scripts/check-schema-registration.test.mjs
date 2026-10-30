import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { getCheckCommands } from './ci-checks.mjs';
import '../supabase/test-support/kleinanzeigen-rest-precision-response.test.mjs';

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

for (const [title, script] of [
  [
    'runs real parallel publication checks in the isolated CI database',
    'kleinanzeigen-publication-concurrency.mjs',
  ],
  [
    'prüft große Kleinanzeigen-Konto-IDs über den echten REST-Parser',
    'kleinanzeigen-rest-precision.mjs',
  ],
]) {
  test(title, async () => {
    const ci = await readFile('.github/workflows/ci.yml', 'utf8');
    const databaseJob = ci.split('\n  database:')[1]?.split(/\n  [a-z][a-z-]*:/u)[0];
    assert.ok(databaseJob);
    assert.match(databaseJob, /needs\.changes\.outputs\.supabase == 'true'/u);
    assert.match(databaseJob, /run: node scripts\/ci-checks\.mjs database/u);
    const command = getCheckCommands('database').find(({ args }) =>
      args.includes(`supabase/test-support/${script}`),
    );
    assert.deepEqual(command, {
      name: script.includes('rest-precision')
        ? 'Test Kleinanzeigen REST identifier precision'
        : 'Test parallel Kleinanzeigen publication jobs',
      command: 'node',
      args: [`supabase/test-support/${script}`],
      env: { KLEINANZEIGEN_TEST_DB_CONTAINER: 'supabase_db_flipbase-supabase' },
    });
  });
}
