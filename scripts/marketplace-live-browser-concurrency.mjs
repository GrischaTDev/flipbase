import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.env.MARKETPLACE_DB_CONTAINER ?? 'supabase_db_flipbase-supabase';
const userId = randomUUID();
const workspaceId = randomUUID();
const connectionId = randomUUID();
const profileId = `test-${randomUUID()}`;

function query(sql) {
  return execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-XAt',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
    },
  ).trim();
}

function startClient() {
  const child = spawn('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-XAtq',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
  ]);
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    errors += chunk;
  });
  const done = new Promise((resolve) =>
    child.on('close', (code) => resolve({ code, output, errors })),
  );
  return { child, done, output: () => output };
}

async function waitForMarker(client, marker) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (client.output().includes(marker)) return;
    if (client.child.exitCode !== null)
      throw new Error('Erste Reservierung wurde unerwartet beendet');
    await delay(50);
  }
  throw new Error('Erste Reservierung hat nicht geantwortet');
}

let first;
let second;
try {
  query(`insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    values ('${userId}', 'authenticated', 'authenticated', '${userId}@example.test', '{}', '{}');
    insert into public.platform_operators (user_id) values ('${userId}');
    insert into public.workspaces (id, name) values ('${workspaceId}', 'Browser-Konkurrenztest');
    insert into public.workspace_members (workspace_id, user_id, role) values ('${workspaceId}', '${userId}', 'owner');
    insert into public.marketplace_connections (id, workspace_id, display_name) values ('${connectionId}', '${workspaceId}', 'Browser-Testkonto');
    insert into public.marketplace_browser_profiles (workspace_id, connection_id, provider_profile_id) values ('${workspaceId}', '${connectionId}', '${profileId}');`);

  first = startClient();
  first.child.stdin.write(`begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
    select public.marketplace_browser_session_reserve('${workspaceId}', '${connectionId}');
    select 'first_reserved';
  `);
  await waitForMarker(first, 'first_reserved');

  second = startClient();
  second.child.stdin.end(`set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false);
    select public.marketplace_browser_session_reserve('${workspaceId}', '${connectionId}');
  `);
  await delay(500);
  assert.equal(
    second.child.exitCode,
    null,
    'Zweite Reservierung muss auf die erste Transaktion warten',
  );

  first.child.stdin.end('commit;\n');
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  assert.equal(firstResult.code, 0, firstResult.errors);
  assert.notEqual(secondResult.code, 0, 'Zweite Reservierung muss abgewiesen werden');
  assert.match(secondResult.errors, /55P03/, 'Zweite Reservierung muss die Kontosperre melden');
  assert.equal(
    query(
      `select count(*) from public.marketplace_browser_sessions where connection_id = '${connectionId}' and state = 'active'`,
    ),
    '1',
  );
  console.log('Parallele Reservierung: genau eine Sitzung, zweite Anfrage gesperrt.');
} finally {
  for (const client of [first, second]) {
    if (client?.child.exitCode === null) {
      client.child.stdin.end();
      client.child.kill();
    }
  }
  try {
    query(`update public.marketplace_browser_sessions set state = 'closed', provider_stopped_at = clock_timestamp()
      where connection_id = '${connectionId}' and state in ('active', 'stopping');
      delete from public.marketplace_connections where id = '${connectionId}';
      delete from public.workspaces where id = '${workspaceId}';
      delete from auth.users where id = '${userId}';`);
  } catch (error) {
    console.error('Künstliche Testdaten konnten nicht vollständig entfernt werden:', error);
    process.exitCode = 1;
  }
}
