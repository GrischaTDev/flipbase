import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.env.CLOUD_SETUP_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container))
  throw new Error('CLOUD_SETUP_TEST_DB_CONTAINER muss einen getrennten Testcontainer benennen.');
const args = [
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
];
const query = (sql) =>
  execFileSync('docker', args, { input: sql, encoding: 'utf8', timeout: 15_000 }).trim();
const user = randomUUID();
const workspace = randomUUID();
const connections = [randomUUID(), randomUUID()];
const network = `test-${randomUUID()}`;
const clients = [];
const start = (sql) => {
  const name = `cloud-test-${randomUUID()}`;
  const child = spawn('docker', args);
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    errors += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output, errors }));
  });
  const client = { child, name, done, output: () => output };
  clients.push(client);
  child.stdin.write(`set application_name='${name}'; set statement_timeout='12s'; ${sql}\n`);
  return client;
};
const wait = async (predicate, message) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await delay(40);
  }
  throw new Error(message);
};
const reserve = (index) => `begin; set local role authenticated;
  select set_config('request.jwt.claims','${JSON.stringify({ sub: user, role: 'authenticated' })}',true);
  select public.marketplace_cloud_setup_begin('${workspace}','${connections[index]}','${randomUUID()}',null);`;
try {
  // Der Testcontainer darf keinen fremden freien Bestand enthalten.
  assert.equal(
    query(
      "select count(*) from public.marketplace_cloud_ips where enabled and country_code='DE' and expires_at>clock_timestamp();",
    ),
    '0',
  );
  query(`begin;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values('${user}','authenticated','authenticated','${user}@example.test','{}','{}');
    insert into public.platform_operators(user_id) values('${user}');
    insert into public.workspaces(id,name) values('${workspace}','Cloud Paralleltest');
    insert into public.workspace_members(workspace_id,user_id,role) values('${workspace}','${user}','owner');
    insert into public.marketplace_connections(id,workspace_id,display_name,execution_mode) values ${connections.map((id) => `('${id}','${workspace}','Test','local')`).join(',')};
    insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at) values('${network}',repeat('e',64),'test','DE',clock_timestamp()+interval '1 day',true,clock_timestamp()); commit;`);
  const first = start(`${reserve(0)} select 'first-reserved';`);
  await wait(() => first.output().includes('first-reserved'), 'Erste Reservierung fehlt');
  const second = start(`${reserve(1)} commit;`);
  second.child.stdin.end();
  await wait(
    () =>
      query(
        `select count(*) from pg_stat_activity where application_name='${second.name}' and cardinality(pg_blocking_pids(pid))>0;`,
      ) === '1',
    'Zweite Sitzung wartet nicht auf die echte Datenbanksperre',
  );
  first.child.stdin.end('commit;\n');
  const results = await Promise.all([first.done, second.done]);
  for (const result of results) assert.equal(result.code, 0, result.errors);
  const responses = results.map((result) =>
    JSON.parse(result.output.split('\n').find((line) => line.includes('"status"'))),
  );
  assert.deepEqual(
    responses.map((response) => response.status),
    ['ready', 'no_capacity'],
  );
  assert.equal(
    query(
      `select count(*) from public.marketplace_cloud_setups where workspace_id='${workspace}' and state<>'cancelled';`,
    ),
    '1',
  );
  console.log('Zwei echte parallele Sitzungen: eine IP-Reservierung, eine Kapazitätsmeldung.');
} finally {
  for (const client of clients) {
    if (client.child.exitCode === null) client.child.stdin.end('rollback;\n');
  }
  await Promise.allSettled(clients.map((client) => client.done));
  query(
    `begin; delete from public.marketplace_cloud_setups where workspace_id='${workspace}'; delete from public.marketplace_connections where workspace_id='${workspace}'; delete from public.marketplace_cloud_ips where network_id='${network}'; delete from public.workspace_members where workspace_id='${workspace}'; delete from public.workspaces where id='${workspace}'; delete from public.platform_operators where user_id='${user}'; delete from auth.users where id='${user}'; commit;`,
  );
}
