import { normalizeGeneratedSqlKeywords } from './marketplace-migration-permissions.mjs';
import { appendKleinanzeigenJobLifecyclePermissions } from './marketplace-migration-permissions.mjs';
import { appendKleinanzeigenJobPermissions } from './marketplace-migration-permissions.mjs';
import { appendKleinanzeigenFormPermissions } from './marketplace-migration-permissions.mjs';
import { appendKleinanzeigenSourcePermissions } from './marketplace-migration-permissions.mjs';
import { appendKleinanzeigenReadPermissions } from './marketplace-migration-permissions.mjs';
import { appendKleinanzeigenSyncPermissions } from './marketplace-migration-permissions.mjs';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  appendMarketplacePermissions,
  appendKleinanzeigenPermissions,
} from './marketplace-migration-permissions.mjs';

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

test('Kleinanzeigen übernimmt auch versteckte Grants und Funktionsrechte aus der deklarativen Quelle', async () => {
  const source = await readFile('supabase/schemas/490_kleinanzeigen_accounts.sql', 'utf8');
  const generated =
    'create table public.kleinanzeigen_local_grants(id bigint);\ngrant all on public.kleinanzeigen_local_grants to authenticated;\n';
  const output = appendKleinanzeigenPermissions(generated, source);
  assert.ok(
    output.lastIndexOf(
      'revoke all on public.kleinanzeigen_local_grants from public,anon,authenticated;',
    ) > output.indexOf('grant all on public.kleinanzeigen_local_grants to authenticated;'),
  );
  assert.ok(
    output.includes(
      'revoke all on function public.kleinanzeigen_extension_session(uuid,bigint,text,bigint) from public,anon,authenticated,service_role;',
    ),
  );
  assert.ok(
    output.includes(
      'grant usage,select on sequence public.kleinanzeigen_local_grants_id_seq to service_role;',
    ),
  );
  assert.equal(appendKleinanzeigenPermissions(output, source), output);
  assert.throws(() =>
    appendKleinanzeigenPermissions(
      generated,
      source + '\ngrant all on public.workspaces to anon;\n',
    ),
  );
});

test('Kleinanzeigen-Abgleich entfernt vererbte Nutzerrechte aus Vormerkungen und Claims', async () => {
  const schema = await readFile('supabase/schemas/491_kleinanzeigen_sync.sql', 'utf8');
  const migration =
    'create table public.kleinanzeigen_sync_runs(id bigint);\ngrant all on public.kleinanzeigen_sync_runs to authenticated;\n';
  const output = appendKleinanzeigenSyncPermissions(migration, schema);
  assert.ok(
    output.lastIndexOf(
      'revoke all on public.kleinanzeigen_sync_runs from public,anon,authenticated;',
    ) > output.indexOf('grant all on public.kleinanzeigen_sync_runs to authenticated;'),
  );
  assert.ok(
    output.includes(
      'revoke all on public.kleinanzeigen_sync_entries from public,anon,authenticated;',
    ),
  );
  assert.ok(
    output.includes(
      'revoke all on function public.kleinanzeigen_finish_sync(uuid,bigint,text,bigint,bigint,text,text,jsonb) from public,anon,authenticated,service_role;',
    ),
  );
  assert.equal(appendKleinanzeigenSyncPermissions(output, schema), output);
  assert.throws(() =>
    appendKleinanzeigenSyncPermissions(
      migration,
      schema.replace(
        'revoke all on public.kleinanzeigen_sync_entries from public,anon,authenticated;',
        '',
      ),
    ),
  );
  assert.throws(() =>
    appendKleinanzeigenSyncPermissions(
      migration,
      schema + '\ngrant all on public.workspaces to anon;\n',
    ),
  );
});

test('Kleinanzeigen-Lesevorschau bleibt für anonyme Aufrufer geschlossen', async () => {
  const schema = await readFile('supabase/schemas/492_kleinanzeigen_read.sql', 'utf8');
  const output = appendKleinanzeigenReadPermissions(
    "create function public.kleinanzeigen_read_accounts() returns void language sql as 'select 1';",
    schema,
  );
  assert.ok(
    output.includes(
      'revoke all on function public.kleinanzeigen_read_accounts(uuid) from public,anon,authenticated,service_role;',
    ),
  );
  assert.ok(
    output.includes(
      'grant execute on function public.kleinanzeigen_read_publications(uuid,bigint,integer,text,text,bigint,timestamptz) to authenticated;',
    ),
  );
  assert.equal(appendKleinanzeigenReadPermissions(output, schema), output);
  assert.throws(() =>
    appendKleinanzeigenReadPermissions(
      'select 1;',
      schema.replace(
        'revoke all on function public.kleinanzeigen_read_accounts(uuid) from public,anon,authenticated,service_role;',
        '',
      ),
    ),
  );
});

test('Quellmigration trennt Nutzerlesen und servicegebundene Quellbelege', async () => {
  const schema = await readFile('supabase/schemas/501_kleinanzeigen_transfer_sources.sql', 'utf8');
  const result = appendKleinanzeigenSourcePermissions('select 1;', schema);
  assert.ok(
    result.includes(
      'grant execute on function public.kleinanzeigen_read_transfer_source(uuid,bigint,uuid,text) to authenticated;',
    ),
  );
  assert.ok(
    result.includes(
      'grant execute on function public.kleinanzeigen_local_transfer_source(uuid,uuid,text,uuid,text,bigint,jsonb) to service_role;',
    ),
  );
  assert.equal(appendKleinanzeigenSourcePermissions(result, schema), result);
  assert.throws(() =>
    appendKleinanzeigenSourcePermissions(
      'select 1;',
      schema.replace(
        'grant execute on function public.kleinanzeigen_read_transfer_source(uuid,bigint,uuid,text) to authenticated;',
        '',
      ),
    ),
  );
});

test('Formularmigration entzieht Schreibrechte und lässt nur den Installations-RPC zu', async () => {
  const schema = await readFile('supabase/schemas/503_kleinanzeigen_form_schemas.sql', 'utf8');
  const output = appendKleinanzeigenFormPermissions(
    'create table public.kleinanzeigen_form_schemas(id bigint);',
    schema,
  );
  assert.ok(
    output.includes(
      'revoke all on public.kleinanzeigen_form_schemas from public,anon,authenticated;',
    ),
  );
  assert.ok(
    output.includes(
      'grant execute on function public.kleinanzeigen_store_form_schema(uuid,bigint,text,bigint,text,jsonb,timestamptz) to service_role;',
    ),
  );
  assert.equal(appendKleinanzeigenFormPermissions(output, schema), output);
  assert.throws(() =>
    appendKleinanzeigenFormPermissions(
      'select 1;',
      schema.replace(
        'grant execute on function public.kleinanzeigen_store_form_schema(uuid,bigint,text,bigint,text,jsonb,timestamptz) to service_role;',
        '',
      ),
    ),
  );
});

test('Auftragsmigration hält Claim-Daten verborgen und übernimmt die Tabellenbeschreibung automatisch', async () => {
  const schema =
    (await readFile('supabase/schemas/510_kleinanzeigen_publication_jobs.sql', 'utf8')) +
    '\n' +
    (await readFile('supabase/schemas/511_kleinanzeigen_job_execution.sql', 'utf8'));
  const output = appendKleinanzeigenJobPermissions(
    'create table public.kleinanzeigen_publication_jobs(id bigint);',
    schema,
  );
  assert.ok(
    output.includes(
      'revoke all on public.kleinanzeigen_publication_jobs from public,anon,authenticated;',
    ),
  );
  assert.ok(
    !output.includes('grant select on public.kleinanzeigen_publication_jobs to authenticated;'),
  );
  assert.ok(output.includes('comment on table public.kleinanzeigen_publication_jobs is'));
  assert.equal(appendKleinanzeigenJobPermissions(output, schema), output);
  assert.throws(() =>
    appendKleinanzeigenJobPermissions(
      'select 1;',
      schema.replace(
        'grant execute on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) to service_role;',
        '',
      ),
    ),
  );
});

test('Lebenszyklusmigration hält die private Elternprüfung hinter dem Installationsendpoint', async () => {
  const schema = await readFile('supabase/schemas/511_kleinanzeigen_job_execution.sql', 'utf8');
  const output = appendKleinanzeigenJobLifecyclePermissions('select 1;', schema);
  assert.ok(
    output.includes(
      'revoke all on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) from public,anon,authenticated,service_role;',
    ),
  );
  assert.ok(
    output.includes(
      'grant execute on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) to service_role;',
    ),
  );
  assert.equal(appendKleinanzeigenJobLifecyclePermissions(output, schema), output);
});

test('normalisiert generierte SQL-Deklarationen ohne Funktionskörper, Literale oder Kommentare umzuschreiben', () => {
  const source = `CREATE OR REPLACE FUNCTION public.example(p_text text DEFAULT 'DEFAULT')
 RETURNS text
 LANGUAGE sql
AS $function$
select 'CREATE DEFAULT';
$function$;
-- DEFAULT bleibt im Kommentar
CREATE TRIGGER example AFTER UPDATE ON public.example FOR EACH ROW EXECUTE FUNCTION public.example('UPDATE');`;
  const result = normalizeGeneratedSqlKeywords(source);
  assert.ok(
    result.startsWith("create or replace function public.example(p_text text default 'DEFAULT')"),
  );
  assert.ok(result.includes("as $function$\nselect 'CREATE DEFAULT';\n$function$;"));
  assert.ok(result.includes('-- DEFAULT bleibt im Kommentar'));
  assert.ok(
    result.includes(
      "create trigger example after update on public.example for each row execute function public.example('UPDATE');",
    ),
  );
  assert.equal(normalizeGeneratedSqlKeywords(result), result);
});
