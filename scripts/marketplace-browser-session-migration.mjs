// Ergänzt ausschließlich eine frisch erzeugte Marktplatz-Testmigration mit den
// Rechten aus dem deklarativen Schema. Versionierte Migrationen bleiben unberührt.
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const header = `-- Zweck: Künstliche, kontogebundene Browser-Testsitzungen mit Ablauf und Widerruf.
-- Betroffen: public.marketplace_browser_test_sessions und zugehörige Testfunktionen.
`;
const marker = '-- Explicit browser test permissions from declarative schema';
const required = [
  'revoke all on public.marketplace_browser_test_sessions from public, anon, authenticated;',
  'grant select on public.marketplace_browser_test_sessions to authenticated;',
  'grant all on public.marketplace_browser_test_sessions to service_role;',
  'revoke all on function public.marketplace_test_session_start(uuid, uuid) from public, anon;',
  'grant execute on function public.marketplace_test_session_start(uuid, uuid) to authenticated;',
  'revoke all on function public.marketplace_test_session_status(uuid, uuid, uuid) from public, anon;',
  'grant execute on function public.marketplace_test_session_status(uuid, uuid, uuid) to authenticated;',
  'revoke all on function public.marketplace_test_session_action(uuid, uuid, uuid, text) from public, anon;',
  'grant execute on function public.marketplace_test_session_action(uuid, uuid, uuid, text) to authenticated;',
  'revoke all on function public.marketplace_revoke_browser_tests_on_pause() from public, anon, authenticated;',
];

export function finalizeBrowserSessionMigration(migration, schema) {
  if (!migration.trim()) throw new Error('Leere Migration.');
  for (const statement of required) {
    if (!schema.split('\n').some((line) => line.trim() === statement))
      throw new Error(`Recht fehlt im Schema: ${statement}`);
  }
  const suffix = `${marker}\n${required.join('\n')}\n`;
  if (migration.includes(marker)) {
    if (!migration.endsWith(suffix) || !migration.startsWith(header))
      throw new Error('Abweichender Rechteblock bereits vorhanden.');
    return migration;
  }
  return `${header}${migration.trimEnd()}\n\n${suffix}`;
}

async function main() {
  const directory = 'supabase/migrations';
  const files = (await readdir(directory)).filter((name) =>
    /^\d{14}_marketplace_browser_test_sessions\.sql$/.test(name),
  );
  if (files.length !== 1) throw new Error('Genau eine neue Sitzungstest-Migration erwartet.');
  const path = `${directory}/${files[0]}`;
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], {
    encoding: 'utf8',
  });
  if (tracked.error || tracked.status !== 1)
    throw new Error('Versionierte Migration oder Git-Status nicht prüfbar.');
  const [migration, schema] = await Promise.all([
    readFile(path, 'utf8'),
    readFile('supabase/schemas/255_marketplace_browser_test_sessions.sql', 'utf8'),
  ]);
  if (!migration.includes('CREATE TABLE public.marketplace_browser_test_sessions'))
    throw new Error('Der generierte Sitzungsbereich fehlt.');
  await writeFile(path, finalizeBrowserSessionMigration(migration, schema));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
