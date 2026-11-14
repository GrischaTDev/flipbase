import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.env.MARKETPLACE_DB_CONTAINER ?? 'supabase_db_flipbase-supabase';
const userId = randomUUID();
const workspaceId = randomUUID();
const connectionId = randomUUID();
const secondConnectionId = randomUUID();
const profileId = `test-${randomUUID()}`;
const workerId = randomUUID();
const clients = [];
let runtime;
let originalRuntime;
let originalCapacity;

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
  const client = { child, done, output: () => output };
  clients.push(client);
  return client;
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

const authentication = `set role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false);`;

function closeSessions() {
  query(`update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp()
    where workspace_id='${workspaceId}' and state in ('active','stopping');`);
}

async function race(firstStatement, secondStatement, expectedSecondSuccess) {
  const first = startClient();
  first.child.stdin.write(`begin; ${authentication} ${firstStatement} select 'first_reserved';\n`);
  await waitForMarker(first, 'first_reserved');
  const second = startClient();
  second.child.stdin.end(`${authentication} ${secondStatement}`);
  await delay(300);
  assert.equal(second.child.exitCode, null, 'Zweite Anfrage wartet auf die erste Transaktion');
  first.child.stdin.end('commit;\n');
  const result = await Promise.all([first.done, second.done]);
  assert.equal(result[0].code, 0, result[0].errors);
  if (expectedSecondSuccess) assert.equal(result[1].code, 0, result[1].errors);
  else assert.notEqual(result[1].code, 0, 'Zweite Anfrage darf nicht angenommen werden');
  return result;
}

function receipt(result) {
  for (const line of result.output.split('\n')) {
    try {
      const value = JSON.parse(line);
      if (typeof value?.action?.id === 'string') return value.action.id;
    } catch {
      // psql gibt neben dem JSON auch Transaktions- und Synchronisationsmarken aus.
    }
  }
  assert.fail('Gespeicherte Anfragequittung fehlt');
}

try {
  assert.equal(
    query(
      "select count(*) from public.marketplace_browser_sessions where state in ('active','stopping')",
    ),
    '0',
    'Die Konkurrenzprüfung benötigt eine eigene ruhende Testdatenbank',
  );
  originalRuntime = query(
    'select row_to_json(runtime) from public.marketplace_worker_runtime runtime where id=1',
  );
  originalCapacity = Number(
    query('select max_browsers from public.marketplace_browser_pool_settings where id=1'),
  );
  runtime = JSON.parse(query(`select public.marketplace_worker_claim('${workerId}')`));
  assert.ok(runtime, 'Ein fremder aktiver Worker darf nicht übernommen werden');
  assert.equal(
    query(
      `select public.marketplace_browser_capacity_report('${workerId}',${runtime.workerEpoch},2)`,
    ),
    't',
  );
  query(`insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    values ('${userId}', 'authenticated', 'authenticated', '${userId}@example.test', '{}', '{}');
    insert into public.platform_operators (user_id) values ('${userId}');
    insert into public.workspaces (id, name) values ('${workspaceId}', 'Browser-Konkurrenztest');
    insert into public.workspace_members (workspace_id, user_id, role) values ('${workspaceId}', '${userId}', 'owner');
    insert into public.marketplace_connections (id, workspace_id, display_name) values
      ('${connectionId}', '${workspaceId}', 'Browser-Testkonto A'),
      ('${secondConnectionId}', '${workspaceId}', 'Browser-Testkonto B');
    insert into public.marketplace_browser_profiles (workspace_id, connection_id, provider_profile_id) values
      ('${workspaceId}', '${connectionId}', '${profileId}'),
      ('${workspaceId}', '${secondConnectionId}', '${profileId}-b');`);

  const reserve = (connection) =>
    `select public.marketplace_browser_session_reserve('${workspaceId}','${connection}');`;
  for (const [capacity, secondConnection, allowed, expected] of [
    [1, secondConnectionId, false, '1'],
    [2, secondConnectionId, true, '2'],
    [2, connectionId, false, '1'],
  ]) {
    closeSessions();
    query(
      `update public.marketplace_browser_pool_settings set max_browsers=${capacity} where id=1`,
    );
    const [, second] = await race(reserve(connectionId), reserve(secondConnection), allowed);
    if (!allowed)
      assert.match(
        second.errors,
        /55P03/,
        'Konto- beziehungsweise Poolgrenze wird atomar eingehalten',
      );
    assert.equal(
      query(
        `select count(*) from public.marketplace_browser_sessions where workspace_id='${workspaceId}' and state='active'`,
      ),
      expected,
    );
  }
  closeSessions();
  const accountId = `${Date.now()}1`;
  query(`update public.marketplace_connections set status='connected',external_account_id='${accountId}' where id='${connectionId}';
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body)
      values('${workspaceId}','${connectionId}','profile','${accountId}','{}');`);
  const enqueue = (requestId) =>
    `select public.marketplace_account_action_enqueue('${workspaceId}','${connectionId}','${requestId}','profile_details_read','{}');`;
  query(`${authentication} do $$ begin for i in 1..49 loop
    perform public.marketplace_account_action_enqueue('${workspaceId}','${connectionId}',gen_random_uuid(),'profile_details_read','{}');
    end loop; end $$;`);
  const [, full] = await race(enqueue(randomUUID()), enqueue(randomUUID()), false);
  assert.match(
    full.errors,
    /account_action_queue_full/,
    'Nur eine von zwei konkurrierenden Anfragen erhält den letzten Warteplatz',
  );
  assert.equal(
    query(
      `select count(*) from public.marketplace_account_actions where workspace_id='${workspaceId}' and state='queued'`,
    ),
    '50',
  );
  query(
    `update public.marketplace_account_actions set state='cancelled',finished_at=clock_timestamp() where workspace_id='${workspaceId}' and state='queued'`,
  );
  const requestId = randomUUID();
  const repeated = await race(enqueue(requestId), enqueue(requestId), true);
  assert.equal(
    receipt(repeated[0]),
    receipt(repeated[1]),
    'Konkurrierende Wiederholung erhält dieselbe Auftragskennung',
  );
  assert.equal(
    query(
      `select count(*) from public.marketplace_account_actions where workspace_id='${workspaceId}' and request_id='${requestId}'`,
    ),
    '1',
  );
  console.log(
    'Echte parallele Transaktionen: Pool 1/2, Kontosperre, 50er-Wartelimit und idempotente Annahme erfolgreich.',
  );
} finally {
  for (const client of clients) {
    if (client?.child.exitCode === null) {
      client.child.stdin.end();
      client.child.kill();
    }
  }
  try {
    query(`update public.marketplace_browser_sessions set state = 'closed', provider_stopped_at = clock_timestamp()
      where connection_id in ('${connectionId}', '${secondConnectionId}') and state in ('active', 'stopping');
      delete from public.marketplace_account_actions where workspace_id='${workspaceId}';
      delete from public.marketplace_connections where id in ('${connectionId}', '${secondConnectionId}');
      delete from public.workspaces where id = '${workspaceId}';
      delete from auth.users where id = '${userId}';`);
    if (runtime) {
      query(`delete from public.marketplace_worker_runtime where worker_id='${workerId}' and worker_epoch=${runtime.workerEpoch};
        update public.marketplace_browser_pool_settings set max_browsers=${originalCapacity} where id=1;`);
      if (originalRuntime)
        query(`insert into public.marketplace_worker_runtime overriding system value
          select (jsonb_populate_record(null::public.marketplace_worker_runtime,'${originalRuntime.replaceAll("'", "''")}'::jsonb)).*;`);
    }
  } catch (error) {
    console.error('Künstliche Testdaten konnten nicht vollständig entfernt werden:', error);
    process.exitCode = 1;
  }
}
