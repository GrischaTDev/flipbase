// Ergänzt ausschließlich einen neuen CLI-Diff um deklarative Rechte und Bucket-Daten.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const marker = '-- Explizite Inseratrechte und privater Bucket aus dem deklarativen Schema.';
const tables = [
  'marketplace_listing_drafts',
  'marketplace_listing_images',
  'marketplace_listing_templates',
];
function lowercaseSql(sql) {
  let result = '',
    quote = null,
    lineComment = false,
    blockComment = false;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index],
      next = sql[index + 1];
    if (lineComment) {
      result += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      result += char;
      if (char === '*' && next === '/') {
        result += next;
        index++;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      result += char;
      if (char === quote) {
        if (next === quote) {
          result += next;
          index++;
        } else quote = null;
      }
      continue;
    }
    if (char === '-' && next === '-') {
      result += '--';
      index++;
      lineComment = true;
    } else if (char === '/' && next === '*') {
      result += '/*';
      index++;
      blockComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else result += char.toLowerCase();
  }
  return result;
}
export function completeListingMigration(migration, schemas) {
  if (migration.includes(marker)) throw new Error('Inserat-Migration bereits ergänzt.');
  for (const table of tables)
    if (!new RegExp(`create table public\\.${table}\\b`, 'iu').test(migration))
      throw new Error(`Generierte Tabelle fehlt: ${table}`);
  // Ein großer Schema-Diff darf keinen vorhandenen Bereich nebenbei umbauen.
  for (const match of migration.matchAll(
    /^(?:alter table|drop table|create table)\s+(?:"?public"?\.)?"?([a-z_]+)"?/gimu,
  )) {
    if (!tables.includes(match[1])) throw new Error(`Fremde Tabellenänderung: ${match[1]}`);
  }
  const permissions = schemas.flatMap((schema) =>
    [...schema.matchAll(/^(?:revoke|grant)\s+[^;]+;/gimu)].map((match) => match[0]),
  );
  for (const table of tables)
    if (
      !permissions.some((statement) =>
        new RegExp(`revoke all on public\\.${table} from`, 'iu').test(statement),
      )
    )
      throw new Error(`Rechte fehlen: ${table}`);
  const bucket = schemas.flatMap((schema) =>
    [...schema.matchAll(/^insert into storage\.buckets\([^;]+;/gimu)].map((match) => match[0]),
  );
  if (bucket.length !== 1 || !bucket[0].includes("'marketplace-listing-media'"))
    throw new Error('Privater Inserat-Bucket fehlt.');
  const policies = schemas.flatMap((schema) =>
    [...schema.matchAll(/^create policy "[^"]+" on storage\.objects[^;]+;/gimu)].map(
      (match) => match[0],
    ),
  );
  if (!policies.length) throw new Error('Inserat-Storage-Policies fehlen.');
  const missingPolicies = policies.filter(
    (policy) => !migration.includes(policy.match(/^create policy ("[^"]+")/iu)[1]),
  );
  return `-- Zweck: Vinted-Arbeitskopien, Originalfotos und ausgewählte Vorlagenfelder speichern.\n-- Betroffen: public.marketplace_listing_drafts, marketplace_listing_images, marketplace_listing_templates und private Storage-Policies.\n${lowercaseSql(migration.trimEnd())}\n\n${marker}\n${permissions.join('\n')}\n${bucket[0]}\n${missingPolicies.join('\n')}\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2];
  if (!/^supabase[/\\]migrations[/\\]\d{14}_vinted_listing_drafts\.sql$/.test(path ?? ''))
    throw new Error('Pfad der frisch generierten Inserat-Migration erforderlich.');
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  if (tracked.error || tracked.status !== 1)
    throw new Error('Versionierte Migration oder Git-Status nicht prüfbar.');
  const schemas = await Promise.all(
    [
      '460_marketplace_listing_drafts',
      '461_marketplace_listing_images',
      '462_marketplace_listing_templates',
    ].map((name) => readFile(`supabase/schemas/${name}.sql`, 'utf8')),
  );
  await writeFile(path, completeListingMigration(await readFile(path, 'utf8'), schemas));
}
