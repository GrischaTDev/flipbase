import { execFileSync } from 'node:child_process';

try {
  const [base, head] = process.argv.slice(2);
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/u.test(sha ?? '')))
    throw new Error('Gültige Vergleichscommits erforderlich.');
  const tokens = execFileSync(
    'git',
    [
      'diff',
      '--name-status',
      '--no-renames',
      '-z',
      base,
      head,
      '--',
      'supabase/schemas',
      'supabase/migrations',
    ],
    { encoding: 'utf8' },
  ).split('\0');
  let schemaChanged = false;
  let migrationAdded = false;
  for (let index = 0; index < tokens.length - 1; index += 2) {
    const [status, path] = tokens.slice(index, index + 2);
    if (!path.endsWith('.sql')) continue;
    if (path.startsWith('supabase/schemas/')) schemaChanged = true;
    if (path.startsWith('supabase/migrations/')) {
      if (!/^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/u.test(path)) {
        throw new Error(`Ungültige Migrationsdatei oder Unterordner: ${path}`);
      }
      if (status !== 'A')
        throw new Error(
          `Bestehende Migration nicht ändern oder löschen: ${path}. Neue Korrekturmigration anlegen.`,
        );
      migrationAdded = true;
    }
  }
  if (schemaChanged && !migrationAdded)
    throw new Error(
      'Schema geändert, aber keine neue Migrationsdatei enthalten. Migration erzeugen, prüfen und mit dem Schema committen.',
    );
  console.log('Migrationsdateien im Änderungsumfang geprüft.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
