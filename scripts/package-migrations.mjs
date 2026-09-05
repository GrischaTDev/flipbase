import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Technische Integritätsliste, keine SQL-Sicherheitsbewertung. Die inhaltliche
// Freigabe erfolgt mit dem Review/Merge der SQL-Dateien, nicht in einer zweiten Liste.
export async function packageMigrations(source, destination) {
  const directoryEntries = await readdir(source, { withFileTypes: true });
  if (directoryEntries.some((entry) => entry.isDirectory())) {
    throw new Error(
      'Migrationsdateien müssen direkt im Migrationsverzeichnis liegen, nicht in Unterordnern.',
    );
  }
  const entries = directoryEntries
    .filter((entry) => entry.name.endsWith('.sql'))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (!entries.length) throw new Error('Keine Migrationsdateien im Release.');
  const versions = new Set();
  const files = [];
  for (const entry of entries) {
    const match = /^([0-9]{14})_[a-z0-9_]+\.sql$/u.exec(entry.name);
    if (!entry.isFile() || !match) throw new Error(`Ungültige Migrationsdatei: ${entry.name}`);
    if (versions.has(match[1])) throw new Error(`Doppelte Migrationsversion: ${match[1]}`);
    versions.add(match[1]);
    const bytes = await readFile(join(source, entry.name));
    if (!bytes.toString('utf8').trim()) throw new Error(`Leere Migrationsdatei: ${entry.name}`);
    files.push({ name: entry.name, bytes, hash: createHash('sha256').update(bytes).digest('hex') });
  }
  // Absichtlich nur ein neues Verzeichnis: keine veralteten Dateien aus früheren Builds.
  await mkdir(destination);
  for (const file of files) await writeFile(join(destination, file.name), file.bytes);
  // Den Namen für den vorhandenen Server-Runner beibehalten; kein Serverumbau nötig.
  await writeFile(
    join(destination, 'approved.sha256'),
    files.map((file) => `${file.hash}  ${file.name}\n`).join(''),
  );
  console.log(`${files.length} Migrationen mit automatisch erzeugten Prüfsummen paketiert.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) {
    console.error('Migrationsquelle und neues Ausgabeverzeichnis angeben.');
    process.exitCode = 1;
  } else {
    packageMigrations(source, destination).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
