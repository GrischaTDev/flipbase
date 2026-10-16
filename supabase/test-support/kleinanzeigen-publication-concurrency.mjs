import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
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
  const name = 'kleinanzeigen-publication-' + randomUUID();
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

const tokenHash = randomBytes(32).toString('hex');
const sourceConnection = randomUUID();
const claimOne = randomBytes(32).toString('hex');
const claimTwo = randomBytes(32).toString('hex');
const schema = {
  categoryPath: '153/160/shirts',
  categoryLabel: 'Shirts',
  titleMax: 65,
  descriptionMax: 4000,
  photoCountMax: 20,
  photoBytesMax: 12582912,
  priceStepCents: 100,
  fields: [
    {
      key: 'kleidung_herren.condition',
      label: 'Zustand',
      kind: 'select',
      selection: 'value',
      required: false,
      choices: [{ value: 'ok', label: 'Gut', description: '' }],
    },
  ],
  shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
};
let connection;
let schemaRevision;
function document(output, key) {
  const line = output
    .split('\n')
    .find((line) => line.startsWith('{') && line.includes('"' + key + '"'));
  assert.ok(line, 'Erwartete SQL-Antwort fehlt: ' + key);
  return JSON.parse(line);
}
function freshQuota() {
  query(
    'update public.kleinanzeigen_connections set quota_used=99,quota_observed_at=clock_timestamp() where workspace_id=' +
      quote(workspace) +
      ' and id=' +
      connection +
      ';',
  );
}
async function contend(firstSql, secondSql, marker) {
  const first = start(
    'begin; set local role service_role; ' + firstSql + ' select ' + quote(marker) + ';',
  );
  await wait(() => first.output().includes(marker), 'Erste Sitzung erreicht die Prüfsperre nicht.');
  const second = start('begin; set local role service_role; ' + secondSql + ' commit;');
  second.child.stdin.end();
  await blocked(second);
  first.child.stdin.end('commit;\n');
  return await Promise.all([first.done, second.done]);
}
function createDraft(externalId) {
  const entry = randomUUID();
  const requestId = randomUUID();
  const attempt = randomUUID();
  const source = {
    externalAccountId: '99',
    externalId,
    title: 'Jacke',
    description: 'Vollständiger Text',
    priceCents: 1200,
    currency: 'EUR',
    photoReferences: ['https://images1.vinted.net/unit.jpg'],
    attributeHints: { Zustand: 'Gut' },
    observedAt: new Date().toISOString(),
  };
  query(
    'insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values(' +
      quote(entry) +
      ',' +
      quote(workspace) +
      ',' +
      quote(sourceConnection) +
      ",'publication'," +
      quote(externalId) +
      ',' +
      quote(JSON.stringify({ transferSource: source })) +
      '::jsonb);',
  );
  const sourceReference =
    "(select jsonb_build_object('platform','vinted','workspaceId',workspace_id,'connectionId',connection_id,'externalId',external_id,'entryId',id,'fingerprint',encode(extensions.digest(((body->'transferSource')-'observedAt')::text,'sha256'),'hex')) from public.marketplace_account_entries where id=" +
    quote(entry) +
    ')';
  const content = {
    title: 'Jacke',
    description: 'Vollständiger Text',
    priceCents: 1200,
    currency: 'EUR',
    priceType: 'FIXED',
    shippingType: 'pickup',
    shippingPriceCents: null,
    postalCode: '12345',
    categoryId: schema.categoryPath,
    categoryFields: { 'kleidung_herren.condition': 'ok' },
    schemaRevision,
  };
  const created = document(
    query(
      authenticated +
        'select public.kleinanzeigen_create_transfer_draft(' +
        quote(workspace) +
        ',' +
        connection +
        ',' +
        sourceReference +
        ',' +
        quote(JSON.stringify(content)) +
        '::jsonb,' +
        quote(randomUUID()) +
        ');commit;',
    ),
    'target_connection_id',
  );
  const draft = created.id;
  const original = 'listings/' + workspace + '/' + draft + '/' + randomUUID() + '.jpg';
  query(
    "insert into storage.objects(bucket_id,name,metadata) values('item-media'," +
      quote(original) +
      ',\'{"mimetype":"image/jpeg","size":1024}\');select public.kleinanzeigen_complete_transfer_images(' +
      quote(workspace) +
      ',' +
      quote(draft) +
      ',1,' +
      quote(user) +
      ',' +
      quote(JSON.stringify([{ storagePath: original, fileName: 'Bild.jpg', sortOrder: 0 }])) +
      '::jsonb);',
  );
  const imageId = query(
    'select id::text from public.listing_images where workspace_id=' +
      quote(workspace) +
      ' and listing_id=' +
      quote(draft) +
      ';',
  );
  const storagePath =
    'kleinanzeigen-jobs/' + workspace + '/' + requestId + '/' + attempt + '/' + imageId + '.jpg';
  query(
    "insert into storage.objects(bucket_id,name,metadata) values('item-media'," +
      quote(storagePath) +
      ',\'{"mimetype":"image/jpeg","size":1024}\');',
  );
  return {
    draft,
    requestId,
    photos: [
      {
        imageId,
        storagePath,
        fileName: 'Bild.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        sha256: 'b'.repeat(64),
      },
    ],
  };
}
function enqueue(draft) {
  return (
    'select public.kleinanzeigen_enqueue_listing(' +
    quote(workspace) +
    ',' +
    connection +
    ',' +
    quote(draft.draft) +
    ',3,' +
    quote(draft.requestId) +
    ',' +
    quote(user) +
    ',' +
    quote(JSON.stringify(draft.photos)) +
    '::jsonb);'
  );
}
function claim(job, token) {
  return (
    'select public.kleinanzeigen_claim_listing(' +
    quote(workspace) +
    ',' +
    connection +
    ',' +
    quote(tokenHash) +
    ',2,' +
    job +
    ',' +
    quote(token) +
    ');'
  );
}
try {
  query(
    'insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(' +
      quote(user) +
      ",'authenticated','authenticated'," +
      quote(user + '@example.test') +
      ",'{}','{}');insert into public.platform_operators(user_id) values(" +
      quote(user) +
      ');insert into public.workspaces(id,name) values(' +
      quote(workspace) +
      ",'Kleinanzeigen Veröffentlichungs-Paralleltest');insert into public.workspace_members(workspace_id,user_id,role) values(" +
      quote(workspace) +
      ',' +
      quote(user) +
      ",'owner');insert into public.marketplace_connections(id,workspace_id,display_name,external_account_id,status) values(" +
      quote(sourceConnection) +
      ',' +
      quote(workspace) +
      ",'Vinted','99','connected');",
  );
  connection = query(
    'insert into public.kleinanzeigen_connections(workspace_id,external_account_id,display_name,account_type,status,created_by,quota_used,quota_observed_at) values(' +
      quote(workspace) +
      ",'88','Privatkonto','private','connected'," +
      quote(user) +
      ',99,clock_timestamp()) returning id::text;',
  );
  query(
    'insert into public.kleinanzeigen_local_grants(workspace_id,connection_id,approved_by,installation_id,token_hash,grant_generation,expires_at,can_publish) values(' +
      quote(workspace) +
      ',' +
      connection +
      ',' +
      quote(user) +
      ',' +
      quote(installation) +
      ',' +
      quote(tokenHash) +
      ",2,clock_timestamp()+interval '1 hour',true);",
  );
  schemaRevision = query(
    'insert into public.kleinanzeigen_form_schemas(workspace_id,connection_id,category_path,schema_revision,provider_schema,grant_generation,observed_at) values(' +
      quote(workspace) +
      ',' +
      connection +
      ',' +
      quote(schema.categoryPath) +
      ',encode(extensions.digest(' +
      quote(JSON.stringify(schema)) +
      "::jsonb::text,'sha256'),'hex')," +
      quote(JSON.stringify(schema)) +
      '::jsonb,2,clock_timestamp()) returning schema_revision;',
  );
  const firstDraft = createDraft('123');
  const secondDraft = createDraft('124');
  freshQuota();
  const same = await contend(enqueue(firstDraft), enqueue(firstDraft), 'same-held');
  for (const result of same) assert.equal(result.code, 0, result.errors);
  assert.equal(
    document(same[0].output, 'immutableSnapshot').id,
    document(same[1].output, 'immutableSnapshot').id,
    'Gleiche parallele Anfragen legen keinen zweiten Auftrag an.',
  );
  query(
    'delete from public.kleinanzeigen_publication_jobs where workspace_id=' +
      quote(workspace) +
      ';',
  );
  freshQuota();
  const reservations = await contend(enqueue(firstDraft), enqueue(secondDraft), 'reservation-held');
  assert.equal(reservations[0].code, 0, reservations[0].errors);
  assert.notEqual(
    reservations[1].code,
    0,
    'Bei 99 muss die zweite parallele Reservierung scheitern.',
  );
  assert.match(reservations[1].errors, /Kontingent nicht sicher frei/u);
  assert.equal(
    query(
      'select count(*) from public.kleinanzeigen_publication_jobs where workspace_id=' +
        quote(workspace) +
        ';',
    ),
    '1',
  );
  const job = document(reservations[0].output, 'immutableSnapshot').id;
  const claims = await contend(claim(job, claimOne), claim(job, claimTwo), 'claim-held');
  assert.equal(claims[0].code, 0, claims[0].errors);
  assert.notEqual(
    claims[1].code,
    0,
    'Zwei Browser dürfen denselben Auftrag nicht gleichzeitig übernehmen.',
  );
  assert.match(claims[1].errors, /anderer Versuch/u);
  freshQuota();
  const version = query(
    'select version from public.kleinanzeigen_publication_jobs where id=' +
      job +
      ' and workspace_id=' +
      quote(workspace) +
      ';',
  );
  const begin =
    'select public.kleinanzeigen_begin_listing(' +
    quote(workspace) +
    ',' +
    connection +
    ',' +
    quote(tokenHash) +
    ',2,' +
    job +
    ',' +
    quote(claimOne) +
    ',' +
    version +
    ",jsonb_build_object('state','free','observedAt',clock_timestamp()));";
  const started = await contend(begin, begin, 'begin-held');
  for (const result of started) assert.equal(result.code, 0, result.errors);
  assert.equal(document(started[0].output, 'authorized').authorized, true);
  assert.equal(
    document(started[1].output, 'authorized').authorized,
    false,
    'Nach begin wird nie ein zweiter Submit freigegeben.',
  );
  query(
    "update public.kleinanzeigen_publication_jobs set lease_until=clock_timestamp()-interval '1 second' where workspace_id=" +
      quote(workspace) +
      ' and id=' +
      job +
      ';',
  );
  const resumed = document(
    query(
      'select public.kleinanzeigen_read_listing_job(' +
        quote(workspace) +
        ',' +
        connection +
        ',' +
        job +
        ',' +
        quote(user) +
        ');',
    ),
    'immutableSnapshot',
  );
  assert.equal(resumed.state, 'outcome_unknown');
  const readonly = document(query(claim(job, claimOne)), 'claimToken');
  assert.equal(readonly.state, 'outcome_unknown', 'Ursprüngliche Wiederaufnahme bleibt lesend.');
  console.log(
    'Echte parallele Sitzungen bestätigen eine gemeinsame Request-ID, genau eine letzte kostenlose Reservierung, einen exklusiven Claim und genau eine begin-Freigabe; Timeout danach erlaubt nur Abgleich.',
  );
} finally {
  for (const client of clients)
    if (client.child.exitCode === null && !client.child.stdin.writableEnded)
      client.child.stdin.end('rollback;\n');
  await Promise.allSettled(clients.map((client) => client.done));
  query(
    "select set_config('storage.allow_delete_query','true',false);delete from public.kleinanzeigen_publication_jobs where workspace_id=" +
      quote(workspace) +
      ";delete from storage.objects where bucket_id='item-media' and (name like " +
      quote('listings/' + workspace + '/%') +
      ' or name like ' +
      quote('kleinanzeigen-jobs/' + workspace + '/%') +
      ');delete from public.marketplace_account_entries where workspace_id=' +
      quote(workspace) +
      ';delete from public.workspaces where id=' +
      quote(workspace) +
      ';delete from auth.users where id=' +
      quote(user) +
      ';',
  );
}
