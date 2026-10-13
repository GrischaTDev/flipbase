import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const container = process.env.PUSH_TEST_DB_CONTAINER ?? 'supabase_db_flipbase-supabase';
const database = process.env.PUSH_TEST_DB_NAME ?? 'postgres';
const userId = randomUUID(),
  sessionId = randomUUID(),
  workspaceId = randomUUID(),
  deviceId = randomUUID();
const args = [
  'exec',
  container,
  'psql',
  '-U',
  'postgres',
  '-d',
  database,
  '-tAq',
  '-v',
  'ON_ERROR_STOP=1',
];
const sql = (statement) =>
  execFileSync('docker', [...args, '-c', statement], { encoding: 'utf8' }).trim();
const claim = `public.web_push_claim('v1',false,'{}',array['${deviceId}']::uuid[])`;
let worker;
try {
  sql(`begin;
 insert into auth.users(id,email) values('${userId}','${userId}@push-concurrency.example.test');
 insert into auth.sessions(id,user_id,created_at,updated_at) values('${sessionId}','${userId}',now(),now());
 insert into public.workspaces(id,name) values('${workspaceId}','Push concurrency fixture');
 insert into public.workspace_members(workspace_id,user_id,role) values('${workspaceId}','${userId}','member');
 insert into public.web_push_generations(id,user_id,token_hash) values('${deviceId}','${userId}',repeat('a',64));
 insert into public.web_push_devices(id,user_id,session_id,installation_id,endpoint_fingerprint,endpoint,p256dh,auth,vapid_key_id) values('${deviceId}','${userId}','${sessionId}','${randomUUID()}','${deviceId}','https://fcm.googleapis.com/test',repeat('x',87),repeat('x',22),'v1');
 select public.web_push_enqueue_test('${deviceId}','${workspaceId}'); commit;`);
  worker = spawn(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      database,
      '-tAq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const exited = new Promise((resolve, reject) => {
    worker.on('error', reject);
    worker.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Worker A failed'))));
  });
  let output = '';
  const claimed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker claim timed out')), 10000);
    worker.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = /CLAIM=([a-f0-9-]+)\|([a-f0-9-]+)\|([a-f0-9-]+)/u.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match.slice(1));
      }
    });
    worker.on('error', reject);
  });
  worker.stdin.write(
    `begin;select 'CLAIM='||id::text||'|'||binding_generation::text||'|'||claim_token::text from ${claim};\n`,
  );
  const [deliveryId, generation, token] = await claimed;
  assert.equal(
    sql(`select count(*) from ${claim};`),
    '0',
    'Worker B skips the row while A holds its transaction',
  );
  worker.stdin.end('commit;\n');
  await exited;
  worker = undefined;
  assert.equal(
    sql(`select attempts from public.web_push_deliveries where id='${deliveryId}'`),
    '1',
  );
  sql(
    `update public.web_push_deliveries set lease_until=clock_timestamp()-interval '1 second' where id='${deliveryId}'`,
  );
  assert.equal(sql(`select count(*) from ${claim};`), '1', 'Expired A lease is reclaimed');
  assert.equal(
    sql(
      `select public.web_push_finish('${deliveryId}','${generation}','${token}','accepted',null);`,
    ),
    'f',
    'Stale A acknowledgement cannot overwrite B',
  );
  assert.equal(
    sql(`select attempts from public.web_push_deliveries where id='${deliveryId}'`),
    '2',
  );
  console.log('Two concurrent SQL workers, lease recovery and stale acknowledgement verified.');
} finally {
  if (worker) {
    worker.stdin.end('rollback;\n');
    worker.kill();
  }
  sql(
    `begin;delete from public.workspaces where id='${workspaceId}';delete from auth.users where id='${userId}';delete from public.web_push_generations where id='${deviceId}';commit;`,
  );
}
