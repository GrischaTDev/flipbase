import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// pg-delta beschreibt neue Objekte, übersieht dabei aber Rechte aus bestehenden
// Default-Grants. Die vollständigen ACLs kommen deshalb aus dem deklarativen SQL.
export function completeStorageMigration(migration, schema) {
  const marker = '-- Explizite Speicherrechte aus 410_server_storage.sql.';
  if (migration.includes(marker)) throw new Error('Speicherrechte bereits ergänzt.');
  if (!/create table public\.server_storage_status\b/iu.test(migration))
    throw new Error('Keine generierte Speicher-Migration.');
  const permissions = [...schema.matchAll(/^(?:revoke|grant)\s+[^;]+;/gimu)].map(
    (match) => match[0],
  );
  if (permissions.length !== 3) throw new Error('Unerwartete Speicherrechte im Schema.');
  return `${migration.trimEnd()}\n\n${marker}\n${permissions.join('\n\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const migrationPath = process.argv[2];
  if (!/[/\\][0-9]{14}_server_storage_status\.sql$/u.test(migrationPath ?? ''))
    throw new Error('Pfad der erzeugten Speicher-Migration erforderlich.');
  const schemaPath = fileURLToPath(
    new URL('../supabase/schemas/410_server_storage.sql', import.meta.url),
  );
  writeFileSync(
    migrationPath,
    completeStorageMigration(readFileSync(migrationPath, 'utf8'), readFileSync(schemaPath, 'utf8')),
  );
}
