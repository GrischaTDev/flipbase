import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Ausschließlich gegen eine ausdrücklich benannte lokale Testdatenbank ausführen.
const container = process.argv[2];
assert.match(container ?? '', /^supabase_db_flipbase-product-editor-db$/);
const args = ['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (statement) =>
  execFileSync('docker', [...args, '-c', statement], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const id = (suffix) => `ba600000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const user = id('1'),
  workspace = id('11'),
  product = id('21'),
  first = id('31'),
  second = id('32');
const media = (value) =>
  `insert into public.catalog_product_media(id, workspace_id, catalog_product_id, storage_path) values ('${value}', '${workspace}', '${product}', 'catalog-products/${workspace}/${product}/${value}.png');`;
const auth = `select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`;
let pending;
try {
  sql(`insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values ('${user}','authenticated','authenticated','gallery-concurrency@example.test','{}','{}');
    insert into public.workspaces(id,name) values ('${workspace}','Galerie-Nebenläufigkeit');
    insert into public.workspace_members(workspace_id,user_id,role) values ('${workspace}','${user}','owner');
    insert into public.catalog_products(id,workspace_id,title) values ('${product}','${workspace}','Test'); ${media(first)}`);
  const child = spawn(
    'docker',
    [
      ...args,
      '-c',
      `set application_name='gallery-concurrency-upload'; begin; ${auth} ${media(second)} select pg_sleep(2); commit;`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (data) => {
    errors += data.toString();
  });
  child.stdout.resume();
  pending = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(errors))));
  });
  let sleeping = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    sleeping =
      sql(
        "select count(*) from pg_stat_activity where application_name='gallery-concurrency-upload' and wait_event='PgSleep'",
      ).trim() === '1';
    if (sleeping) break;
    await delay(25);
  }
  assert.ok(sleeping, 'Upload-Transaktion hält die Produktsperre');
  const started = Date.now();
  assert.throws(
    () =>
      sql(
        `${auth} select * from public.update_product_media_layout('${product}', array['${first}']::uuid[], array['${first}']::uuid[], '${workspace}');`,
      ),
    /zwischenzeitlich/,
  );
  assert.ok(Date.now() - started > 700, 'Galeriespeicherung wartet auf den parallelen Upload');
  await pending;
  pending = null;
  assert.equal(
    sql(
      `select count(*) from public.catalog_product_media where catalog_product_id='${product}'`,
    ).trim(),
    '2',
  );
  console.log(
    'PASS: paralleler Upload wird abgewartet; veraltete Bilderliste wird ohne Datenverlust abgewiesen.',
  );
} finally {
  await pending;
  sql(
    `delete from public.catalog_product_media where catalog_product_id='${product}'; delete from public.catalog_products where id='${product}'; delete from public.workspace_members where workspace_id='${workspace}'; delete from public.workspaces where id='${workspace}'; delete from auth.users where id='${user}';`,
  );
}
