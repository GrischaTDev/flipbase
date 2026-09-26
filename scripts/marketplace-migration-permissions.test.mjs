import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { appendMarketplacePermissions } from './marketplace-migration-permissions.mjs';

const schema = `create table public.marketplace_connections (id uuid);
revoke all on public.marketplace_connections from public, anon, authenticated;
grant select on public.marketplace_connections to authenticated;
grant all on public.marketplace_connections to service_role;
create table public.marketplace_account_entries (id uuid);
revoke all on public.marketplace_account_entries from public, anon, authenticated;
grant select on public.marketplace_account_entries to authenticated;
grant all on public.marketplace_account_entries to service_role;
revoke all on function public.marketplace_can_manage(uuid) from public, anon;
grant execute on function public.marketplace_can_manage(uuid) to authenticated;
`;
const migration = 'create table public.marketplace_connections (id uuid);\n';
const script = fileURLToPath(new URL('./marketplace-migration-permissions.mjs', import.meta.url));
const filename = '20260926150000_marketplace_accounts.sql';

for (const table of ['marketplace_connections', 'marketplace_account_entries']) {
  test(`Migration übernimmt den expliziten Rechteentzug für ${table}`, () => {
    const broadGrant = `grant all on public.${table} to authenticated;`;
    const output = appendMarketplacePermissions(`${migration}${broadGrant}\n`, schema);
    const revoke = `revoke all on public.${table} from public, anon, authenticated;`;
    assert.ok(output.indexOf(revoke) > output.indexOf(broadGrant));
    assert.ok(
      output.indexOf(`grant select on public.${table} to authenticated;`) > output.indexOf(revoke),
    );
    assert.ok(output.includes(`grant all on public.${table} to service_role;`));
  });
}

test('Funktionsrechte werden ebenfalls übernommen', () => {
  const output = appendMarketplacePermissions(migration, schema);
  assert.ok(
    output.includes(
      'revoke all on function public.marketplace_can_manage(uuid) from public, anon;',
    ),
  );
  assert.ok(
    output.includes(
      'grant execute on function public.marketplace_can_manage(uuid) to authenticated;',
    ),
  );
});

test('Bereits erzeugtes SQL bleibt unverändert vor dem Rechteblock erhalten', () => {
  assert.ok(appendMarketplacePermissions(migration, schema).startsWith(migration));
});

test('Wiederholung dupliziert den Rechteblock nicht', () => {
  const first = appendMarketplacePermissions(migration, schema);
  assert.notEqual(first, migration);
  assert.equal(appendMarketplacePermissions(first, schema), first);
});

test('Unvollständiges Rechteschema wird abgelehnt', () => {
  assert.throws(
    () =>
      appendMarketplacePermissions(
        migration,
        schema.replace('grant select on public.marketplace_account_entries to authenticated;', ''),
      ),
    /Rechte/,
  );
});

test('Fremde Tabellen werden nicht beiläufig mitverändert', () => {
  assert.throws(
    () =>
      appendMarketplacePermissions(migration, `${schema}grant all on public.workspaces to anon;\n`),
    /Marktplatz/,
  );
});

test('Ein geänderter vorhandener Rechteblock wird nicht still überschrieben', () => {
  const first = appendMarketplacePermissions(migration, schema);
  const changed = schema.replace('from public, anon;', 'from public, anon, authenticated;');
  assert.throws(() => appendMarketplacePermissions(first, changed), /vorhanden/);
});

test('Leere Migration wird abgelehnt', () => {
  assert.throws(() => appendMarketplacePermissions(' \n', schema), /Migration/);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-marketplace-permissions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'supabase/migrations'), { recursive: true });
  await mkdir(join(root, 'supabase/schemas'), { recursive: true });
  await writeFile(join(root, 'supabase/schemas/250_marketplace_accounts.sql'), schema);
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

test('CLI ergänzt ausschließlich eine neue, noch nicht versionierte Migration', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'supabase/migrations', filename);
  await writeFile(path, migration);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path, 'utf8'), appendMarketplacePermissions(migration, schema));
  assert.notEqual(await readFile(path, 'utf8'), migration);
});

test('CLI fasst eine bereits versionierte Migration nicht an', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'supabase/migrations', filename);
  await writeFile(path, migration);
  execFileSync('git', ['add', '--', `supabase/migrations/${filename}`], { cwd: root });
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /versioniert/);
  assert.equal(await readFile(path, 'utf8'), migration);
});

test('CLI bricht bei mehreren passenden Migrationen ohne Änderung ab', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'supabase/migrations', filename);
  await writeFile(path, migration);
  await writeFile(
    join(root, 'supabase/migrations/20260926150001_marketplace_accounts.sql'),
    migration,
  );
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(path, 'utf8'), migration);
});

test('CLI bricht ohne passende Migration ab', async (t) => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
});
