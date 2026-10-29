import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);

/** Derselbe Git-Vertrag gilt für PR-Commits und die noch ungespeicherte Arbeitskopie. */
export async function migrationChanges(
  base,
  head,
  { repository = process.cwd(), worktree = false } = {},
) {
  if (![base, ...(worktree ? [] : [head])].every((sha) => /^[a-f0-9]{40}$/u.test(sha ?? '')))
    throw new Error('Gültige Vergleichscommits erforderlich.');
  const { stdout } = await exec(
    'git',
    [
      'diff',
      '--name-status',
      '--no-renames',
      '-z',
      base,
      ...(worktree ? [] : [head]),
      '--',
      'supabase/schemas',
      'supabase/migrations',
    ],
    { cwd: repository, encoding: 'utf8' },
  );
  const tokens = stdout.split('\0');
  const changes = [];
  for (let index = 0; index < tokens.length - 1; index += 2)
    changes.push({ status: tokens[index], path: tokens[index + 1] });
  if (worktree) {
    const { stdout: untracked } = await exec(
      'git',
      [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        'supabase/schemas',
        'supabase/migrations',
      ],
      { cwd: repository, encoding: 'utf8' },
    );
    changes.push(
      ...untracked
        .split('\0')
        .filter(Boolean)
        .map((path) => ({ status: 'A', path })),
    );
  }
  return changes;
}

export function validateMigrationChanges(changes) {
  let schemaChanged = false;
  let migrationAdded = false;
  for (const { status, path } of changes) {
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const worktree = args[0] === '--worktree';
    if (args.length !== 2) throw new Error('Vergleichscommits oder --worktree BASIS erforderlich.');
    const [base, head] = worktree ? [args[1]] : args;
    validateMigrationChanges(await migrationChanges(base, head, { worktree }));
    console.log('Migrationsdateien im Änderungsumfang geprüft.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
