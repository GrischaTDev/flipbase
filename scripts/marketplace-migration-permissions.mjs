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
      !/^(?:revoke all|grant (?:select|all|execute)) on (?:function )?public\.marketplace_[a-z_]+(?:\([a-z, ]*\))? (?:from|to) [a-z_, ]+;$/.test(
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
  const directory = 'supabase/migrations';
  const migrations = (await readdir(directory)).filter((file) =>
    /^\d{14}_marketplace_accounts\.sql$/.test(file),
  );
  if (migrations.length !== 1) throw new Error('Genau eine neue Marktplatz-Migration erwartet.');
  const path = `${directory}/${migrations[0]}`;
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  if (tracked.error || tracked.status !== 1) {
    throw new Error('Migration ist bereits versioniert oder Git-Status nicht prüfbar.');
  }
  if (!(await lstat(path)).isFile()) throw new Error('Migration ist keine reguläre Datei.');
  const [migration, schema] = await Promise.all([
    readFile(path, 'utf8'),
    readFile('supabase/schemas/250_marketplace_accounts.sql', 'utf8'),
  ]);
  await writeFile(path, appendMarketplacePermissions(migration, schema));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await finalizeGeneratedMigration();
}
