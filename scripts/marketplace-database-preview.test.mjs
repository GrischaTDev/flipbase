import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/marketplace-database-preview.yml', import.meta.url),
  'utf8',
);

test('Migration vergleicht den bisherigen Migrationsstand mit genau dem neuen Marktplatzschema', () => {
  const apply =
    'docker exec -i supabase_db_flipbase-supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/schemas/250_marketplace_accounts.sql';
  const diff =
    'npx supabase db diff --from migrations --to local --schema public > /tmp/marketplace-database/generated.sql';
  assert.ok(
    workflow.includes(apply),
    'Nur das neue Schema auf der wegwerfbaren Datenbank anwenden.',
  );
  assert.ok(
    workflow.includes(diff),
    'Keinen unbeschränkten deklarativen Gesamtabgleich verwenden.',
  );
  assert.ok(workflow.indexOf('npx supabase start ') < workflow.indexOf(apply));
  assert.ok(workflow.indexOf(apply) < workflow.indexOf(diff));
});

test('Tests prüfen die wieder eingespielte Migration statt nur das direkt angewendete Schema', () => {
  const permissions = 'node scripts/marketplace-migration-permissions.mjs';
  const reset = 'npx supabase db reset --local';
  const tests = 'npx supabase test db supabase/tests/marketplace-accounts.test.sql';
  assert.ok(workflow.includes(reset));
  assert.ok(workflow.indexOf(permissions) < workflow.indexOf(reset));
  assert.ok(workflow.indexOf(reset) < workflow.indexOf(tests));
});

test('Datenbankregressionen bleiben vor Typen und Review-Commit verpflichtend', () => {
  assert.ok(workflow.includes('run: npm run test:db'));
  assert.ok(workflow.indexOf('run: npm run test:db') < workflow.indexOf('npx supabase gen types'));
  assert.ok(
    workflow.indexOf('npx supabase gen types') <
      workflow.indexOf('marketplace-review-commit.mjs prepare'),
  );
  assert.doesNotMatch(workflow, /db query|continue-on-error|\|\|\s*true|--linked|--project-ref/);
});

test('Expliziter Diff wird vor der CLI-Migration gespeichert und erst danach übernommen', () => {
  const diff =
    'npx supabase db diff --from migrations --to local --schema public > /tmp/marketplace-database/generated.sql';
  const nonempty = 'test -s /tmp/marketplace-database/generated.sql';
  const create = 'npx supabase migration new marketplace_accounts';
  const copy = 'cp /tmp/marketplace-database/generated.sql "${migrations[0]}"';
  for (const command of [diff, nonempty, create, copy])
    assert.ok(workflow.includes(command), command);
  assert.ok(workflow.indexOf(diff) < workflow.indexOf(nonempty));
  assert.ok(workflow.indexOf(nonempty) < workflow.indexOf(create));
  assert.ok(workflow.indexOf(create) < workflow.indexOf(copy));
  assert.ok(
    workflow.indexOf(copy) < workflow.indexOf('node scripts/marketplace-migration-permissions.mjs'),
  );
  assert.ok(workflow.includes('test "${#migrations[@]}" -eq 1'));
  assert.doesNotMatch(workflow, /db diff[^\n]*-f marketplace_accounts/);
});
