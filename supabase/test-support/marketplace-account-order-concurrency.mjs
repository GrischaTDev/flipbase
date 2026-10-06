import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.env.ACCOUNT_ORDER_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container))
  throw new Error('ACCOUNT_ORDER_TEST_DB_CONTAINER muss einen getrennten Testcontainer benennen.');
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
const userId = randomUUID();
const workspaceIds = [randomUUID(), randomUUID(), randomUUID()];
const networkId = `account-order-${randomUUID()}`;
const clients = [];
const start = (sql) => {
  const name = `account-order-${randomUUID()}`;
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
const authenticated = `begin; set local role authenticated;
  select set_config('request.jwt.claims','${JSON.stringify({ sub: userId, role: 'authenticated' })}',true);`;
try {
  query(`insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values('${userId}','authenticated','authenticated','${userId}@example.test','{}','{}');
    insert into public.platform_operators(user_id) values('${userId}');
    insert into public.marketplace_cloud_ips(network_id,exit_ip_fingerprint,order_reference,country_code,expires_at,enabled,verified_at)
      values('${networkId}',repeat('7',64),'test','DE',clock_timestamp()+interval '1 day',true,clock_timestamp());`);
  for (const [index, workspaceId] of workspaceIds.slice(0, 2).entries()) {
    query(`insert into public.workspaces(id,name) values('${workspaceId}','Kontogrenze Paralleltest');
      insert into public.workspace_members(workspace_id,user_id,role) values('${workspaceId}','${userId}','owner');
      insert into public.marketplace_connections(workspace_id,display_name,execution_mode)
        select '${workspaceId}','Vorbereitet '||n,case when n%2=0 then 'local' else 'cloud' end from generate_series(1,9) n;`);
    const local = `select public.marketplace_create_connection('${workspaceId}','Lokales zehntes Konto');`;
    const cloud = `select public.marketplace_cloud_setup_begin('${workspaceId}',null,'${randomUUID()}','Cloud zehntes Konto');`;
    const first = start(`${authenticated} ${index === 0 ? local : cloud} select 'slot-reserved';`);
    await wait(
      () => first.output().includes('slot-reserved'),
      'Erster Kontoplatz wurde nicht reserviert.',
    );
    const second = start(`${authenticated} ${index === 0 ? cloud : local} commit;`);
    second.child.stdin.end();
    await wait(
      () =>
        query(
          `select count(*) from pg_stat_activity where application_name='${second.name}' and cardinality(pg_blocking_pids(pid))>0;`,
        ) === '1',
      'Zweite Anlage wartet nicht auf die echte Datenbanksperre.',
    );
    first.child.stdin.end('commit;\n');
    const [accepted, rejected] = await Promise.all([first.done, second.done]);
    assert.equal(accepted.code, 0, accepted.errors);
    assert.notEqual(rejected.code, 0, 'Die elfte Anlage darf nicht erfolgreich sein.');
    assert.match(rejected.errors, /höchstens zehn Vinted-Konten/);
    assert.equal(
      query(
        `select count(*) from public.marketplace_connections where workspace_id='${workspaceId}' and marketplace='vinted';`,
      ),
      '10',
    );
    assert.equal(
      query(
        `select max(sort_order) from public.marketplace_connections where workspace_id='${workspaceId}' and marketplace='vinted';`,
      ),
      '10',
    );
    query(
      `update public.marketplace_cloud_setups set state='cancelled' where workspace_id='${workspaceId}'; delete from public.workspaces where id='${workspaceId}';`,
    );
  }
  const workspaceId = workspaceIds[2];
  query(`insert into public.workspaces(id,name) values('${workspaceId}','Kontoreihenfolge Paralleltest');
    insert into public.workspace_members(workspace_id,user_id,role) values('${workspaceId}','${userId}','owner');
    insert into public.marketplace_connections(workspace_id,display_name) select '${workspaceId}','Vorbereitet '||n from generate_series(1,9) n;`);
  const reversedIds = query(
    `select id from public.marketplace_connections where workspace_id='${workspaceId}' order by sort_order desc;`,
  ).split('\n');
  const first = start(
    `${authenticated} select public.marketplace_reorder_connections('${workspaceId}',array[${reversedIds.map((connectionId) => `'${connectionId}'::uuid`).join(',')}]); select 'order-saved';`,
  );
  await wait(
    () => first.output().includes('order-saved'),
    'Erste Reihenfolge wurde nicht gespeichert.',
  );
  const second = start(
    `${authenticated} select public.marketplace_create_connection('${workspaceId}','Nach Sortierung'); commit;`,
  );
  second.child.stdin.end();
  await wait(
    () =>
      query(
        `select count(*) from pg_stat_activity where application_name='${second.name}' and cardinality(pg_blocking_pids(pid))>0;`,
      ) === '1',
    'Neue Anlage wartet nicht auf die Sortierung.',
  );
  first.child.stdin.end('commit;\n');
  for (const result of await Promise.all([first.done, second.done]))
    assert.equal(result.code, 0, result.errors);
  assert.equal(
    query(
      `select id from public.marketplace_connections where workspace_id='${workspaceId}' order by sort_order limit 1;`,
    ),
    reversedIds[0],
  );
  assert.equal(
    query(
      `select sort_order from public.marketplace_connections where workspace_id='${workspaceId}' and display_name='Nach Sortierung';`,
    ),
    '10',
  );
  console.log(
    'Lokale und Cloudanlage konkurrieren in beiden Richtungen um genau einen zehnten Kontoplatz; parallele Anlagen hängen sich nach bestätigter Sortierung an.',
  );
} finally {
  for (const client of clients)
    if (client.child.exitCode === null) client.child.stdin.end('rollback;\n');
  await Promise.allSettled(clients.map((client) => client.done));
  query(`update public.marketplace_cloud_setups set state='cancelled' where workspace_id in (${workspaceIds.map((workspaceId) => `'${workspaceId}'`).join(',')});
    delete from public.workspaces where id in (${workspaceIds.map((workspaceId) => `'${workspaceId}'`).join(',')});
    delete from public.marketplace_cloud_ips where network_id='${networkId}';
    delete from auth.users where id='${userId}';`);
}
