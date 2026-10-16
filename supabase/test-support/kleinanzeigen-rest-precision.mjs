// Prüft die tatsächlich verwendete PostgREST-Auswahl ohne Genauigkeitsverlust großer Konto-IDs.
// Nur mit ausdrücklich benannter isolierter Testdatenbank; der kurzlebige REST-Server bindet an localhost.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const database = process.env.KLEINANZEIGEN_TEST_DB_CONTAINER;
if (!database || !/^supabase_db_flipbase[-_a-z0-9]*$/u.test(database))
  throw Error('Isolierten Testdatenbank-Container ausdrücklich angeben.');
function command(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 2000000 });
  if (result.status !== 0)
    throw Error(
      'Docker-Testschritt fehlgeschlagen: ' +
        (result.stderr || result.error?.message || result.status),
    );
  return result.stdout.trim();
}
const inspection = JSON.parse(command(['inspect', database]))[0];
const networks = Object.keys(inspection.NetworkSettings.Networks);
if (networks.length !== 1 || !networks[0].startsWith('supabase_network_flipbase'))
  throw Error('Testnetzwerk nicht eindeutig.');
const password = inspection.Config.Env.find((value) =>
  value.startsWith('POSTGRES_PASSWORD='),
)?.slice('POSTGRES_PASSWORD='.length);
if (!password) throw Error('Lokale Testdatenbank besitzt keine geprüfte Verbindungskonfiguration.');
const project = database.slice('supabase_db_'.length);
let image = process.env.KLEINANZEIGEN_TEST_POSTGREST_IMAGE;
if (!image) {
  const existing = spawnSync('docker', ['inspect', 'supabase_rest_' + project], {
    encoding: 'utf8',
  });
  if (existing.status === 0) image = JSON.parse(existing.stdout)[0].Config.Image;
}
if (
  !image ||
  !/^(?:public.ecr.aws\/supabase|ghcr.io\/supabase|postgrest)\/postgrest:v[0-9.]+$/u.test(image)
)
  throw Error('Vorhandenes PostgREST-Testimage ausdrücklich angeben.');
const suffix = randomUUID().replaceAll('-', '');
const view = 'kleinanzeigen_precision_fixture_' + suffix.slice(0, 24);
assert.ok(view.length <= 63);
let container = null;
let created = false;
function sql(text) {
  return command(
    [
      'exec',
      '-i',
      database,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
    ],
    text,
  );
}
try {
  sql(
    'create view public.' +
      view +
      ' with (security_invoker=true) as select 9007199254740993::bigint as target_connection_id; grant select on public.' +
      view +
      ' to anon;',
  );
  created = true;
  container = command([
    'run',
    '-d',
    '--name',
    'flipbase-ka-rest-' + suffix.slice(0, 12),
    '--network',
    networks[0],
    '-p',
    '127.0.0.1::3000',
    '-e',
    'PGRST_DB_URI=postgres://postgres:' +
      encodeURIComponent(password) +
      '@' +
      database +
      ':5432/postgres',
    '-e',
    'PGRST_DB_SCHEMAS=public',
    '-e',
    'PGRST_DB_ANON_ROLE=anon',
    '-e',
    'PGRST_JWT_SECRET=synthetic-local-postgrest-test-secret-0000000000',
    image,
  ]);
  if (!/^[a-f0-9]{64}$/u.test(container))
    throw Error('Eigener REST-Testcontainer nicht bestätigt.');
  const port = JSON.parse(command(['inspect', container]))[0].NetworkSettings.Ports['3000/tcp']?.[0]
    ?.HostPort;
  if (!/^[0-9]+$/u.test(port ?? '')) throw Error('Lokaler REST-Testport fehlt.');
  const end = Date.now() + 20000;
  let response;
  while (Date.now() < end) {
    try {
      response = await fetch(
        'http://127.0.0.1:' + port + '/' + view + '?select=*,target_connection_id::text',
        { signal: AbortSignal.timeout(2000) },
      );
      if (response.status !== 503) break;
    } catch {
      /* Eigener kurzlebiger Server startet noch. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!response?.ok)
    throw Error(
      'PostgREST-Auswahl konnte nicht gelesen werden: ' +
        (response ? response.status + ' ' + (await response.text()) : 'keine HTTP-Antwort'),
    );
  const rows = await response.json();
  assert.deepEqual(rows, [{ target_connection_id: '9007199254740993' }]);
  console.log(
    'PostgREST ' +
      image +
      ': select=*,target_connection_id::text erhält Konto-ID 9007199254740993 exakt als Zeichenfolge.',
  );
} finally {
  if (container && /^[a-f0-9]{64}$/u.test(container)) command(['rm', '-f', container]);
  if (created) sql('drop view public.' + view + ';');
}
