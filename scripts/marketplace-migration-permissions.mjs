// Der Schema-Diff allein kann Standardrechte einer frisch angelegten Tabelle
// stehen lassen. Deshalb gelten am Ende die expliziten Rechte aus unserem Schema.
// Das betrifft nur neu erzeugte Dateien; versionierte Migrationen bleiben unverändert.
import { spawnSync } from 'node:child_process';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = '-- Explicit marketplace permissions from declarative schema';
const tables = ['marketplace_connections', 'marketplace_account_entries'];

export function appendMarketplacePermissions(migration, schema) {
  if (!migration.trim()) throw new Error('Leere Migration.');
  const permissions = schema
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:revoke|grant)\s/i.test(line));

  for (const statement of permissions) {
    if (
      !/^(?:revoke all|grant (?:select|all|execute)) on (?:function )?public\.marketplace_[a-z_]+(?:\([a-z_, .]*\))? (?:from|to) [a-z_, ]+;$/.test(
        statement,
      )
    ) {
      throw new Error('Unerwartete Anweisung außerhalb des Marktplatz-Rechtevertrags.');
    }
  }

  for (const table of tables) {
    const required = [
      `revoke all on public.${table} from public, anon, authenticated;`,
      `grant select on public.${table} to authenticated;`,
      `grant all on public.${table} to service_role;`,
    ];
    if (required.some((statement) => !permissions.includes(statement))) {
      throw new Error(`Unvollständige Rechte für ${table}.`);
    }
  }

  const suffix = `${marker}\n${permissions.join('\n')}\n`;
  if (migration.includes(marker)) {
    if (!migration.endsWith(suffix)) throw new Error('Abweichender Rechteblock bereits vorhanden.');
    return migration;
  }
  return `${migration.trimEnd()}\n\n${suffix}`;
}

async function finalizeGeneratedMigration() {
  const lifecycle = process.argv.includes('--kleinanzeigen-job-lifecycle');
  const jobs = process.argv.includes('--kleinanzeigen-jobs');
  const forms = process.argv.includes('--kleinanzeigen-forms');
  const images = process.argv.includes('--kleinanzeigen-images');
  const sources = process.argv.includes('--kleinanzeigen-sources');
  const drafts = process.argv.includes('--kleinanzeigen-drafts');
  const read = process.argv.includes('--kleinanzeigen-read');
  const sync = process.argv.includes('--kleinanzeigen-sync');
  const kleinanzeigen =
    lifecycle ||
    jobs ||
    forms ||
    images ||
    sources ||
    drafts ||
    read ||
    sync ||
    process.argv.includes('--kleinanzeigen');
  const suffix = lifecycle
    ? 'kleinanzeigen_job_lifecycle'
    : jobs
      ? 'kleinanzeigen_publication_jobs'
      : forms
        ? 'kleinanzeigen_form_schemas'
        : images
          ? 'kleinanzeigen_transfer_images'
          : sources
            ? 'kleinanzeigen_transfer_sources'
            : drafts
              ? 'kleinanzeigen_drafts'
              : read
                ? 'kleinanzeigen_read'
                : sync
                  ? 'kleinanzeigen_sync'
                  : kleinanzeigen
                    ? 'kleinanzeigen_accounts'
                    : 'marketplace_accounts';
  const directory = 'supabase/migrations';
  const migrations = (await readdir(directory)).filter((file) =>
    new RegExp('^\\d{14}_' + suffix + '\\.sql$', 'u').test(file),
  );
  if (migrations.length !== 1) throw new Error('Genau eine neue Marktplatz-Migration erwartet.');
  const path = directory + '/' + migrations[0];
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  if (tracked.error || tracked.status !== 1)
    throw new Error('Migration ist bereits versioniert oder Git-Status nicht prüfbar.');
  if (!(await lstat(path)).isFile()) throw new Error('Migration ist keine reguläre Datei.');
  const schemaPath = lifecycle
    ? 'supabase/schemas/511_kleinanzeigen_job_execution.sql'
    : jobs
      ? 'supabase/schemas/510_kleinanzeigen_publication_jobs.sql'
      : forms
        ? 'supabase/schemas/503_kleinanzeigen_form_schemas.sql'
        : images
          ? 'supabase/schemas/502_kleinanzeigen_transfer_images.sql'
          : sources
            ? 'supabase/schemas/501_kleinanzeigen_transfer_sources.sql'
            : drafts
              ? 'supabase/schemas/500_kleinanzeigen_drafts.sql'
              : read
                ? 'supabase/schemas/492_kleinanzeigen_read.sql'
                : sync
                  ? 'supabase/schemas/491_kleinanzeigen_sync.sql'
                  : kleinanzeigen
                    ? 'supabase/schemas/490_kleinanzeigen_accounts.sql'
                    : 'supabase/schemas/250_marketplace_accounts.sql';
  let [migration, schema] = await Promise.all([
    readFile(path, 'utf8'),
    readFile(schemaPath, 'utf8'),
  ]);
  if (jobs)
    schema +=
      '\n' + (await readFile('supabase/schemas/511_kleinanzeigen_job_execution.sql', 'utf8'));
  const finish = lifecycle
    ? appendKleinanzeigenJobLifecyclePermissions
    : jobs
      ? appendKleinanzeigenJobPermissions
      : forms
        ? appendKleinanzeigenFormPermissions
        : images
          ? appendKleinanzeigenImagePermissions
          : sources
            ? appendKleinanzeigenSourcePermissions
            : drafts
              ? appendKleinanzeigenDraftPermissions
              : read
                ? appendKleinanzeigenReadPermissions
                : sync
                  ? appendKleinanzeigenSyncPermissions
                  : kleinanzeigen
                    ? appendKleinanzeigenPermissions
                    : appendMarketplacePermissions;
  await writeFile(
    path,
    finish(kleinanzeigen ? normalizeGeneratedSqlKeywords(migration) : migration, schema),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await finalizeGeneratedMigration();
function appendKleinanzeigenPermissionBlock(migration, schema, kind, tables, requiredFunction) {
  if (!migration.trim()) throw new Error('Leere Migration.');
  const permissions = schema
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:revoke|grant)\s/iu.test(line));
  for (const statement of permissions) {
    if (
      !/^(?:revoke all|grant (?:select|all|execute|usage,select)) on (?:(?:function|sequence) )?public\.kleinanzeigen_[a-z_]+(?:\([a-z_, .]*\))? (?:from|to) [a-z_, ]+;$/u.test(
        statement,
      )
    )
      throw new Error('Unerwartete Anweisung außerhalb des Kleinanzeigen-Rechtevertrags.');
  }
  const normalized = permissions.map((line) => line.replace(/,\s*/gu, ','));
  const required = tables.flatMap((table) => [
    'revoke all on public.' + table + ' from public,anon,authenticated;',
    'grant all on public.' + table + ' to service_role;',
  ]);
  if (tables.length > 0 && kind !== 'jobs')
    required.push(
      'grant select on public.' +
        (kind === 'forms'
          ? 'kleinanzeigen_form_schemas'
          : kind === 'accounts'
            ? 'kleinanzeigen_connections'
            : 'kleinanzeigen_publications') +
        ' to authenticated;',
    );
  for (const requiredFunctionEntry of [requiredFunction].flat()) {
    const signature =
      typeof requiredFunctionEntry === 'string'
        ? requiredFunctionEntry
        : requiredFunctionEntry.signature;
    const role =
      typeof requiredFunctionEntry === 'string'
        ? ['read', 'drafts'].includes(kind)
          ? 'authenticated'
          : 'service_role'
        : requiredFunctionEntry.role;
    required.push(
      'revoke all on function public.' +
        signature +
        ' from public,anon,authenticated,service_role;',
    );
    required.push('grant execute on function public.' + signature + ' to ' + role + ';');
  }
  if (required.some((statement) => !normalized.includes(statement)))
    throw new Error('Unvollständige Kleinanzeigen-Rechte.');
  const blockMarker =
    kind === 'lifecycle'
      ? '-- Explicit Kleinanzeigen lifecycle permissions from declarative schema'
      : kind === 'jobs'
        ? '-- Explicit Kleinanzeigen job permissions from declarative schema'
        : kind === 'forms'
          ? '-- Explicit Kleinanzeigen form permissions from declarative schema'
          : kind === 'images'
            ? '-- Explicit Kleinanzeigen image permissions from declarative schema'
            : kind === 'sources'
              ? '-- Explicit Kleinanzeigen source permissions from declarative schema'
              : kind === 'drafts'
                ? '-- Explicit Kleinanzeigen draft permissions from declarative schema'
                : kind === 'read'
                  ? '-- Explicit Kleinanzeigen read permissions from declarative schema'
                  : kind === 'accounts'
                    ? '-- Explicit Kleinanzeigen permissions from declarative schema'
                    : '-- Explicit Kleinanzeigen sync permissions from declarative schema';
  const comments =
    kind === 'jobs'
      ? schema
          .split('\n')
          .map((line) => line.trim())
          .filter((line) =>
            /^comment on table public\.kleinanzeigen_[a-z_]+ is '(?:[^']|'')*';$/u.test(line),
          )
      : [];
  const suffix = blockMarker + '\n' + [...permissions, ...comments].join('\n') + '\n';
  const header =
    kind === 'lifecycle'
      ? '-- Zweck: Unbegonnene Kleinanzeigen-Aufträge bei Widerruf, geänderter Fassung oder abgelaufener Vorbereitung beenden; begonnene Versuche bleiben gesperrt.\n'
      : kind === 'jobs'
        ? '-- Zweck: Dauerhafte Kleinanzeigen-Aufträge, private Fotoaufnahme, Kontingentreservierung, exklusiver Schreibbeginn und atomarer Ergebnisabschluss.\n'
        : kind === 'forms'
          ? '-- Zweck: Kontogebundene aktuelle Anbieterfelder in kleinanzeigen_form_schemas mit Inhaltsrevision und Beobachtungszeit.\n'
          : kind === 'images'
            ? '-- Zweck: Vollständige Transferbilder in listings/listing_images und Revision bei jeder Bildänderung.\n'
            : kind === 'sources'
              ? '-- Zweck: Vollständige Vinted-Quellen über geprüfte Cloud-/lokale RPCs im vorhandenen marketplace_account_entries-Cache.\n'
              : kind === 'drafts'
                ? '-- Zweck: Vinted-Quellbezug, Zielkonto und Revision in listings sowie geprüfte Entwurfs-RPCs.\n'
                : kind === 'read'
                  ? '-- Zweck: Geschützte Konten- und Inseratsübersicht über kleinanzeigen_read_accounts und kleinanzeigen_read_publications.\n'
                  : kind === 'accounts'
                    ? '-- Zweck: Kleinanzeigen-Konten und getrennte lokale Freigaben in kleinanzeigen_connections und kleinanzeigen_local_grants.\n'
                    : '-- Zweck: Atomarer Kleinanzeigen-Abgleich mit kleinanzeigen_sync_runs, kleinanzeigen_sync_entries und kleinanzeigen_publications.\n';
  let output;
  if (migration.includes(blockMarker)) {
    if (!migration.endsWith(suffix)) throw new Error('Abweichender Rechteblock bereits vorhanden.');
    output = migration;
  } else output = migration.trimEnd() + '\n\n' + suffix;
  return output.startsWith(header) ? output : header + output;
}
export function appendKleinanzeigenPermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'accounts',
    ['kleinanzeigen_connections', 'kleinanzeigen_local_grants'],
    'kleinanzeigen_extension_session(uuid,bigint,text,bigint)',
  );
}
export function appendKleinanzeigenSyncPermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'sync',
    ['kleinanzeigen_sync_runs', 'kleinanzeigen_sync_entries', 'kleinanzeigen_publications'],
    'kleinanzeigen_finish_sync(uuid,bigint,text,bigint,bigint,text,text,jsonb)',
  );
}

export function appendKleinanzeigenReadPermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'read',
    [],
    [
      'kleinanzeigen_read_accounts(uuid)',
      'kleinanzeigen_read_publications(uuid,bigint,integer,text,text,bigint,timestamptz)',
    ],
  );
}

export function appendKleinanzeigenDraftPermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'drafts',
    [],
    [
      'kleinanzeigen_create_transfer_draft(uuid,bigint,jsonb,jsonb,uuid)',
      'kleinanzeigen_update_draft(uuid,bigint,jsonb)',
    ],
  );
}

export function appendKleinanzeigenSourcePermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'sources',
    [],
    [
      {
        signature: 'kleinanzeigen_cache_transfer_source(uuid,uuid,uuid,uuid,jsonb)',
        role: 'service_role',
      },
      {
        signature: 'kleinanzeigen_local_transfer_source(uuid,uuid,text,uuid,text,bigint,jsonb)',
        role: 'service_role',
      },
      {
        signature: 'kleinanzeigen_read_transfer_source(uuid,bigint,uuid,text)',
        role: 'authenticated',
      },
    ],
  );
}

export function appendKleinanzeigenImagePermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'images',
    [],
    'kleinanzeigen_complete_transfer_images(uuid,uuid,bigint,uuid,jsonb)',
  );
}

export function appendKleinanzeigenFormPermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'forms',
    ['kleinanzeigen_form_schemas'],
    'kleinanzeigen_store_form_schema(uuid,bigint,text,bigint,text,jsonb,timestamptz)',
  );
}

export function appendKleinanzeigenJobPermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'jobs',
    ['kleinanzeigen_publication_jobs'],
    [
      'kleinanzeigen_job_document(public.kleinanzeigen_publication_jobs)',
      'kleinanzeigen_quota_capacity(uuid,bigint,bigint)',
      'kleinanzeigen_prepare_listing_job(uuid,bigint,uuid,bigint,uuid)',
      'kleinanzeigen_enqueue_listing(uuid,bigint,uuid,bigint,uuid,uuid,jsonb)',
      'kleinanzeigen_expire_listing_jobs(uuid,bigint)',
      'kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid)',
      'kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid)',
      'kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint)',
      'kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text)',
      'kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text)',
      'kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text)',
      'kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb)',
      'kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb)',
      'kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint)',
      'kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid)',
    ],
  );
}

export function appendKleinanzeigenJobLifecyclePermissions(migration, schema) {
  return appendKleinanzeigenPermissionBlock(
    migration,
    schema,
    'lifecycle',
    [],
    'kleinanzeigen_expire_listing_jobs(uuid,bigint)',
  );
}

/** PostgreSQLs erzeugte Deklarationen klein schreiben; zitierte Inhalte und Funktionskörper bleiben exakt. */
export function normalizeGeneratedSqlKeywords(sql) {
  const keywords = new Set(
    'create or replace function returns language stable immutable volatile security definer invoker set to as trigger after before insert update delete on for each row execute deferrable initially deferred constraint when referencing new old table statement instead of parallel safe unsafe restricted cost rows default setof'.split(
      ' ',
    ),
  );
  let result = '';
  let position = 0;
  while (position < sql.length) {
    const rest = sql.slice(position);
    const char = sql[position];
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', position);
      if (end === -1) {
        result += rest;
        break;
      }
      result += sql.slice(position, end);
      position = end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', position + 2);
      if (end === -1) throw new Error('Unvollständiger SQL-Kommentar.');
      result += sql.slice(position, end + 2);
      position = end + 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      let end = position + 1;
      while (end < sql.length) {
        if (sql[end] === quote) {
          if (sql[end + 1] === quote) {
            end += 2;
            continue;
          }
          end++;
          break;
        }
        end++;
      }
      result += sql.slice(position, end);
      position = end;
      continue;
    }
    const dollar = rest.match(/^\$(?:[a-z_][a-z0-9_]*)?\$/iu)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, position + dollar.length);
      if (end === -1) throw new Error('Unvollständiger SQL-Funktionskörper.');
      result += sql.slice(position, end + dollar.length);
      position = end + dollar.length;
      continue;
    }
    const word = rest.match(/^[a-z_][a-z0-9_]*/iu)?.[0];
    if (word) {
      result += keywords.has(word.toLowerCase()) ? word.toLowerCase() : word;
      position += word.length;
      continue;
    }
    result += char;
    position++;
  }
  return result;
}
