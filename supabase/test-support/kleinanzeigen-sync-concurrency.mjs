import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const container = process.env.KLEINANZEIGEN_TEST_DB_CONTAINER;
if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/u.test(container))
  throw new Error(
    'KLEINANZEIGEN_TEST_DB_CONTAINER muss den isolierten Testcontainer ausdrücklich benennen.',
  );
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
  execFileSync('docker', args, {
    input: "set statement_timeout='12s'; " + sql,
    encoding: 'utf8',
    timeout: 15000,
  }).trim();
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const workspace = randomUUID();
const user = randomUUID();
const installation = randomUUID();
const clients = [];
const authenticated =
  "begin; set local role authenticated; select set_config('request.jwt.claims'," +
  quote(JSON.stringify({ sub: user, role: 'authenticated' })) +
  ',true);';
function start(sql) {
  const name = 'kleinanzeigen-sync-' + randomUUID();
  const child = spawn('docker', args);
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', (value) => {
    output += value;
  });
  child.stderr.setEncoding('utf8').on('data', (value) => {
    errors += value;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output, errors }));
  });
  const client = { child, name, done, output: () => output };
  clients.push(client);
  child.stdin.write(
    'set application_name=' + quote(name) + "; set statement_timeout='12s'; " + sql + '\n',
  );
  return client;
}
async function wait(predicate, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(40);
  }
  throw new Error(description);
}
async function blocked(client) {
  await wait(
    () =>
      query(
        'select count(*) from pg_stat_activity where application_name=' +
          quote(client.name) +
          ' and cardinality(pg_blocking_pids(pid))>0;',
      ) === '1',
    'Zweite echte Sitzung wartet nicht auf die Kontosperre.',
  );
}
let connection;
try {
  query(
    'insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(' +
      quote(user) +
      ",'authenticated','authenticated'," +
      quote(user + '@example.test') +
      ",'{}','{}'); insert into public.platform_operators(user_id) values(" +
      quote(user) +
      '); insert into public.workspaces(id,name) values(' +
      quote(workspace) +
      ",'Kleinanzeigen Paralleltest'); insert into public.workspace_members(workspace_id,user_id,role) values(" +
      quote(workspace) +
      ',' +
      quote(user) +
      ",'owner');",
  );
  const bound = query(
    authenticated +
      ' select public.kleinanzeigen_connect_account(' +
      quote(workspace) +
      ",'123','Paralleltest','private'," +
      quote(installation) +
      ",repeat('a',64),false); commit;",
  );
  connection = JSON.parse(bound.split('\n').at(-1)).connectionId;
  const request =
    'select public.kleinanzeigen_request_sync(' + quote(workspace) + ',' + connection + ');';
  const first = start(authenticated + ' ' + request + " select 'request-held';");
  await wait(
    () => first.output().includes('request-held'),
    'Erster Abgleich wurde nicht angefordert.',
  );
  const second = start(authenticated + ' ' + request + ' commit;');
  second.child.stdin.end();
  await blocked(second);
  first.child.stdin.end('commit;\n');
  const requested = await Promise.all([first.done, second.done]);
  for (const reply of requested) assert.equal(reply.code, 0, reply.errors);
  const firstRun = JSON.parse(
    requested[0].output.split('\n').find((line) => line.startsWith('{"state"')) ??
      requested[0].output.split('\n').find((line) => line.includes('"runId"')),
  ).runId;
  const secondRun = JSON.parse(
    requested[1].output.split('\n').find((line) => line.includes('"runId"')),
  ).runId;
  assert.equal(
    firstRun,
    secondRun,
    'Gleichzeitige Anforderungen müssen denselben exklusiven Lauf erhalten.',
  );
  const claim = (run) =>
    'select public.kleinanzeigen_claim_sync(' +
    quote(workspace) +
    ',' +
    connection +
    ",repeat('a',64),1," +
    run +
    ');';
  const claiming = start(
    'begin; set local role service_role; ' + claim(firstRun) + " select 'claim-held';",
  );
  await wait(() => claiming.output().includes('claim-held'), 'Erster Claim fehlt.');
  const duplicate = start('begin; set local role service_role; ' + claim(firstRun) + ' commit;');
  duplicate.child.stdin.end();
  await blocked(duplicate);
  claiming.child.stdin.end('commit;\n');
  const [claimed, rejected] = await Promise.all([claiming.done, duplicate.done]);
  assert.equal(claimed.code, 0, claimed.errors);
  assert.notEqual(rejected.code, 0, 'Ein zweiter paralleler Claim muss scheitern.');
  assert.match(rejected.errors, /Abgleich nicht übernehmbar/u);
  const claimOne = JSON.parse(
    claimed.output.split('\n').find((line) => line.includes('"claimToken"')),
  );
  const store = (claimed, title) =>
    'begin; set local role service_role; select public.kleinanzeigen_store_sync_page(' +
    quote(workspace) +
    ',' +
    connection +
    ",repeat('a',64),1," +
    claimed.runId +
    ',' +
    quote(claimed.claimToken) +
    ",'123','page:1',null," +
    quote(
      JSON.stringify([
        {
          externalId: '101',
          title,
          url: 'https://www.kleinanzeigen.de/s-anzeige/test/101-160-1',
          publishedAt: null,
          state: 'active',
        },
      ]),
    ) +
    '::jsonb); commit;';
  const finish = (claimed) =>
    'select public.kleinanzeigen_finish_sync(' +
    quote(workspace) +
    ',' +
    connection +
    ",repeat('a',64),1," +
    claimed.runId +
    ',' +
    quote(claimed.claimToken) +
    ",'123',null);";
  query(store(claimOne, 'Erster Stand'));
  const finishing = start(
    'begin; set local role service_role; ' + finish(claimOne) + " select 'finish-held';",
  );
  await wait(() => finishing.output().includes('finish-held'), 'Erster Abschluss fehlt.');
  const newer = start(authenticated + ' ' + request + ' commit;');
  newer.child.stdin.end();
  await blocked(newer);
  finishing.child.stdin.end('commit;\n');
  const [finished, newRequest] = await Promise.all([finishing.done, newer.done]);
  assert.equal(finished.code, 0, finished.errors);
  assert.equal(newRequest.code, 0, newRequest.errors);
  const runTwo = JSON.parse(
    newRequest.output.split('\n').find((line) => line.includes('"runId"')),
  ).runId;
  assert.notEqual(runTwo, firstRun);
  const claimTwo = JSON.parse(
    query('begin; set local role service_role; ' + claim(runTwo) + ' commit;')
      .split('\n')
      .at(-1),
  );
  query(store(claimTwo, 'Neuer Stand'));
  const latest = start(
    'begin; set local role service_role; ' + finish(claimTwo) + " select 'latest-held';",
  );
  await wait(() => latest.output().includes('latest-held'), 'Neuer Abschluss fehlt.');
  const old = start('begin; set local role service_role; ' + finish(claimOne) + ' commit;');
  old.child.stdin.end();
  await blocked(old);
  latest.child.stdin.end('commit;\n');
  for (const result of await Promise.all([latest.done, old.done]))
    assert.equal(result.code, 0, result.errors);
  assert.equal(
    query(
      'select title from public.kleinanzeigen_publications where workspace_id=' +
        quote(workspace) +
        " and external_id='101';",
    ),
    'Neuer Stand',
    'Verspäteter alter Abschluss darf den neuen Bestand nicht überschreiben.',
  );
  assert.equal(
    query(
      'select sync_run_id::text from public.kleinanzeigen_publications where workspace_id=' +
        quote(workspace) +
        " and external_id='101';",
    ),
    runTwo,
  );
  console.log(
    'Echte parallele Sitzungen teilen eine Anforderung, erlauben genau einen Claim und bewahren den neuesten vollständig bestätigten Bestand bei verspätetem altem Finish.',
  );
} finally {
  for (const client of clients)
    if (client.child.exitCode === null) client.child.stdin.end('rollback;\n');
  await Promise.allSettled(clients.map((client) => client.done));
  query(
    'delete from public.workspaces where id=' +
      quote(workspace) +
      '; delete from auth.users where id=' +
      quote(user) +
      ';',
  );
}
