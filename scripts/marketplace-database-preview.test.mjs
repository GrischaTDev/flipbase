import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/marketplace-database-preview.yml', import.meta.url),
  'utf8',
);

test('Migration vergleicht den bisherigen Migrationsstand mit genau dem neuen Marktplatzschema', () => {
  const apply =
    'npx supabase db query --local --file supabase/schemas/250_marketplace_accounts.sql';
  const diff =
    'npx supabase db diff --from migrations --to local -f marketplace_accounts --schema public';
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
  assert.doesNotMatch(workflow, /continue-on-error|\|\|\s*true|--linked|--project-ref/);
});
