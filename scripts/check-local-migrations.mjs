/** Lesender Bereitschaftsnachweis ausschließlich für die lokale Testdatenbank. */
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { migrationChanges, validateMigrationChanges } from './check-migration-changes.mjs';

const exec = promisify(execFile);
const incomplete = (detail) => new Error(`Vorabcheck unvollständig: ${detail}`);

/**
 * Supabase 2.114.0 speichert SplitAndTrim als statements text[]. Kommentare und
 * innere Leerzeichen bleiben unverändert. Kein semantischer SQL-Vergleich:
 * unbekannte Lexik wird abgelehnt statt möglicherweise gleichgesetzt.
 * Quelle: supabase/cli v2.114.0, apps/cli/src/legacy/shared/
 * legacy-sql-split.ts und legacy-migration-apply.ts.
 */
export function migrationStatements(sql) {
  const statements = [];
  let start = 0;
  let index = 0;
  let parentheses = 0;
  const emit = (end) => {
    const statement = sql.slice(start, end).trim();
    if (statement) statements.push(statement);
  };
  while (index < sql.length) {
    const character = sql[index];
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2);
      index = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (depth && index < sql.length) {
        if (sql.startsWith('/*', index)) {
          depth++;
          index += 2;
        } else if (sql.startsWith('*/', index)) {
          depth--;
          index += 2;
        } else index++;
      }
      if (depth) throw incomplete('Nicht abgeschlossener SQL-Kommentar.');
      continue;
    }
    if (character === "'" || character === '"') {
      const delimiter = character;
      let closed = false;
      index++;
      while (index < sql.length) {
        // Escape-Strings hängen von Parser-/Sessionregeln ab: kein geratenes Grün.
        if (sql[index] === '\\')
          throw incomplete('SQL-Escapes sind nicht verlässlich vergleichbar.');
        if (sql[index++] !== delimiter) continue;
        if (sql[index] === delimiter) {
          index++;
          continue;
        }
        closed = true;
        break;
      }
      if (!closed) throw incomplete('Nicht abgeschlossene SQL-Anführungszeichen.');
      continue;
    }
    if (character === '$') {
      const tag = /^(?:\$\$|\$[A-Za-z_][A-Za-z_0-9]*\$)/u.exec(sql.slice(index))?.[0];
      if (!tag || (index > 0 && /[\p{L}\p{N}_$]/u.test(sql[index - 1])))
        throw incomplete('Unbekannte SQL-Dollarlexik.');
      const end = sql.indexOf(tag, index + tag.length);
      if (end < 0) throw incomplete('Nicht abgeschlossener SQL-Dollarstring.');
      index = end + tag.length;
      continue;
    }
    if (character === '\\' || /\bbegin\s+atomic\b/iu.test(sql.slice(index, index + 32)))
      throw incomplete('SQL-Lexik ist nicht verlässlich vergleichbar.');
    if (character === '(') parentheses++;
    if (character === ')' && --parentheses < 0) throw incomplete('Unvollständige SQL-Klammern.');
    if (character === ';') {
      if (parentheses) throw incomplete('SQL-Semikolon innerhalb eines Klammerblocks.');
      emit(index);
      start = index + 1;
    }
    index++;
  }
  if (parentheses) throw incomplete('Unvollständige SQL-Klammern.');
  emit(sql.length);
  return statements;
}

export function validateLocalMigrationHistory(files, history, newPaths) {
  if (!Array.isArray(history)) throw incomplete('Lokale Migrationshistorie ist unbekannt.');
  const rows = new Map();
  for (const row of history) {
    if (!row || !/^[0-9]{14}$/u.test(row.version) || rows.has(row.version))
      throw incomplete('Lokale Migrationshistorie enthält ungültige oder doppelte Versionen.');
    rows.set(row.version, row);
  }
  const versions = new Set(files.map((file) => file.version));
  const missing = files.filter((file) => !rows.has(file.version)).map((file) => file.version);
  const extra = [...rows.keys()].filter((version) => !versions.has(version));
  if (missing.length || extra.length)
    throw incomplete(
      `Lokale Migrationsversionen weichen ab (fehlend: ${missing.join(', ') || 'keine'}; zusätzlich: ${extra.join(', ') || 'keine'}).`,
    );
  for (const file of files.filter((file) => newPaths.has(file.path))) {
    const applied = rows.get(file.version).statements;
    if (
      !Array.isArray(applied) ||
      !applied.length ||
      applied.some((value) => typeof value !== 'string')
    )
      throw incomplete(`Angewandter SQL-Inhalt für ${file.version} fehlt.`);
    if (JSON.stringify(migrationStatements(file.sql)) !== JSON.stringify(applied))
      throw incomplete(
        `Angewandter SQL-Inhalt für ${file.version} weicht von der Branchmigration ab.`,
      );
  }
}

export async function checkLocalMigrations(
  baseSha,
  { repository = process.cwd(), environment = process.env, execute = exec } = {},
) {
  const changes = await migrationChanges(baseSha, undefined, { repository, worktree: true });
  validateMigrationChanges(changes);
  const newPaths = new Set(changes.filter(({ status }) => status === 'A').map(({ path }) => path));
  const directory = join(repository, 'supabase/migrations');
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.name.endsWith('.sql') && !entry.isDirectory()) continue;
    const match = /^([0-9]{14})_[a-z0-9_]+\.sql$/u.exec(entry.name);
    if (!entry.isFile() || !match || files.some(({ version }) => version === match[1]))
      throw incomplete(`Ungültige Migrationsdatei: ${entry.name}`);
    files.push({
      version: match[1],
      path: `supabase/migrations/${entry.name}`,
      sql: await readFile(join(directory, entry.name), 'utf8'),
    });
  }
  if (!files.length) throw incomplete('Keine lokalen Migrationsdateien vorhanden.');
  // Keine URL/PGHOST/PGDATABASE aus der Shell; ausschließlich fester lokaler Container.
  // -X ignoriert psqlrc; die Transaktion ist zusätzlich ausdrücklich nur lesend.
  const args = [
    'exec',
    'supabase_db_flipbase-supabase',
    'psql',
    '-X',
    '-h',
    '127.0.0.1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "begin read only; select coalesce(json_agg(row_to_json(m) order by version), '[]'::json) from (select version, statements from supabase_migrations.schema_migrations) m; commit;",
  ];
  let history;
  try {
    const { stdout } = await execute('docker', args, {
      cwd: repository,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    history = JSON.parse(stdout.trim());
  } catch (cause) {
    throw incomplete(
      `Lokale Migrationshistorie konnte nicht verlässlich gelesen werden: ${cause.message}`,
    );
  }
  validateLocalMigrationHistory(files, history, newPaths);
}
