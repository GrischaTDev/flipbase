import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export function validateEbayTestContainer(name) {
  if (typeof name !== 'string' || !/^(supabase_db_|flipbase-ebay-test-)[a-zA-Z0-9_-]+$/.test(name))
    throw new Error(
      'EBAY_TEST_DB_CONTAINER muss ausdrücklich einen getrennten Testcontainer benennen.',
    );
  return name;
}

export async function runEbayImportConcurrency() {
  const container = validateEbayTestContainer(process.env.EBAY_TEST_DB_CONTAINER);
  const database = process.env.EBAY_TEST_DATABASE ?? 'postgres';
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Ungültiger Testdatenbankname.');
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-XAtq',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
  ];
  const query = (sql) =>
    execFileSync('docker', args, { input: sql, encoding: 'utf8', timeout: 15_000 }).trim();
  const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const users = [randomUUID(), randomUUID()];
  const workspace = randomUUID();
  const connections = [randomUUID(), randomUUID()];
  const operations = [randomUUID(), randomUUID()];
  const products = Array.from({ length: 5 }, () => randomUUID());
  const purchase = randomUUID();
  const lines = Array.from({ length: 5 }, () => randomUUID());
  const clients = [];
  const claims = (user) =>
    `set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: user, role: 'authenticated' })}', true);`;
  const start = (sql) => {
    const name = `ebay-test-${randomUUID()}`;
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
    child.stdin.write(`set application_name = '${name}'; set statement_timeout = '12s'; ${sql}\n`);
    return client;
  };
  const wait = async (client, predicate, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) return;
      if (client.child.exitCode !== null)
        throw new Error(`${message}: ${JSON.stringify(await client.done)}`);
      await delay(40);
    }
    throw new Error(message);
  };
  const source = (orderId) => ({
    orderId,
    createdAt: '2026-10-01T12:00:00Z',
    lastModifiedAt: null,
    observedAt: new Date().toISOString(),
    paymentStatus: 'PAID',
    cancelStatus: 'NONE_REQUESTED',
    fulfillmentStatus: 'NOT_STARTED',
    currency: 'EUR',
    totalCents: 1000,
    shippingRevenueCents: 0,
    lines: [
      {
        lineItemId: 'line-1',
        listingId: '123',
        variationId: null,
        sku: null,
        title: 'Parallelartikel',
        quantity: 1,
        goodsCents: 1000,
        hasRefund: false,
        variationAspects: [],
      },
    ],
    blockers: [],
  });
  const costs = json({
    platformFeeCents: 0,
    shippingCostCents: 0,
    shippingMode: 'pickup',
    additionalCosts: [],
  });
  const snapshot = (index, key, orderId) => {
    query(
      `update public.ebay_connections set operation_id='${operations[index]}', operation_expires_at=clock_timestamp()+interval '90 seconds' where id='${connections[index]}';`,
    );
    const result = query(
      `begin; set local role service_role; select public.ebay_store_order_snapshot('${users[index]}','${connections[index]}',1,'${operations[index]}','${key}','${'b'.repeat(64)}',${json(source(orderId))},true); commit;`,
    );
    return JSON.parse(result.split('\n').find((line) => line.startsWith('{'))).snapshotId;
  };
  const book = (index, id, product) => `${claims(users[index])}
    select public.ebay_record_order_sale('${workspace}','${connections[index]}','${id}',${json([{ lineItemId: 'line-1', target: { catalogProductId: product } }])},${costs});`;
  const concurrent = async (firstSql, secondSql) => {
    const first = start(`begin; ${firstSql} select 'ready';`);
    await wait(first, () => first.output().includes('ready'), 'Erste Transaktion fehlt');
    const second = start(`begin; ${secondSql} commit;`);
    second.child.stdin.end();
    await wait(
      second,
      () =>
        query(
          `select count(*) from pg_stat_activity where application_name='${second.name}' and cardinality(pg_blocking_pids(pid)) > 0;`,
        ) === '1',
      'Zweite Transaktion wartet nicht auf die echte Datenbanksperre',
    );
    first.child.stdin.end('commit;\n');
    return Promise.all([first.done, second.done]);
  };
  try {
    query(`begin;
      insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
      ${users.map((id) => `('${id}','authenticated','authenticated','${id}@example.test','{}','{}')`).join(',')};
      insert into public.workspaces(id,name) values ('${workspace}','eBay Paralleltest');
      insert into public.workspace_members(workspace_id,user_id,role) values ${users.map((id) => `('${workspace}','${id}','member')`).join(',')};
      insert into public.ebay_connections(id,workspace_id,user_id,environment,status,external_account_id,authorization_version) values
      ${connections.map((id, index) => `('${id}','${workspace}','${users[index]}','production','connected','test-${workspace}',1)`).join(',')};
      insert into public.catalog_products(id,workspace_id,title,tracking_mode) values ${products.map((id) => `('${id}','${workspace}','Parallelartikel','quantity')`).join(',')};
      select set_config('request.jwt.claims','${JSON.stringify({ sub: users[0], role: 'authenticated' })}',true);
      insert into public.purchases(id,workspace_id,type,title) values ('${purchase}','${workspace}','lot','Parallelbestand');
      insert into public.purchase_lines(id,workspace_id,purchase_id,catalog_product_id,title_snapshot,line_kind,ordered_quantity,unit_purchase_price,line_total) values
      ${lines.map((id, index) => `('${id}','${workspace}','${purchase}','${products[index]}','Parallelartikel','quantity',${index === 0 ? 2 : 1},1,${index === 0 ? 2 : 1})`).join(',')};
      select public.receive_purchase_lines('${workspace}','${purchase}',${json(lines.map((id, index) => ({ purchase_line_id: id, received_quantity: index === 0 ? 2 : 1, received_at: '2026-10-01T12:00:00Z' })))});
      select public.finalize_purchase_costing('${workspace}','${purchase}'); commit;`);

    const sharedKey = 'a'.repeat(64);
    let ids = [snapshot(0, sharedKey, 'same-order'), snapshot(1, sharedKey, 'same-order')];
    let results = await concurrent(book(0, ids[0], products[0]), book(1, ids[1], products[0]));
    for (const result of results) assert.equal(result.code, 0, result.errors);
    const booked = results.map((result) =>
      JSON.parse(result.output.split('\n').find((line) => line.includes('\"status"'))),
    );
    assert.equal(booked[0].saleId, booked[1].saleId);
    assert.equal(booked[1].alreadyRecorded, true);
    assert.equal(
      query(`select count(*) from public.sales where workspace_id='${workspace}';`),
      '1',
    );
    assert.equal(
      query(
        `select sum(remaining_quantity) from public.stock_lots where catalog_product_id='${products[0]}';`,
      ),
      '1',
    );
    assert.equal(
      query(
        `select count(*) from public.ebay_order_bookings where workspace_id='${workspace}' and source_key='${sharedKey}';`,
      ),
      '1',
    );
    console.log('Gleiche Quelle, zwei Mitglieder: ein Verkauf und einmaliger Bestandsabgang.');

    ids = [snapshot(0, 'c'.repeat(64), 'competing-a'), snapshot(1, 'd'.repeat(64), 'competing-b')];
    results = await concurrent(book(0, ids[0], products[1]), book(1, ids[1], products[1]));
    assert.equal(results[0].code, 0, results[0].errors);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].errors, /Bestand|bestand|stock|quantity|Menge/i);
    assert.equal(
      query(`select count(*) from public.sales where workspace_id='${workspace}';`),
      '2',
    );
    assert.equal(
      query(
        `select sum(remaining_quantity) from public.stock_lots where catalog_product_id='${products[1]}';`,
      ),
      '0',
    );
    assert.equal(
      query(
        `select count(*) from public.ebay_order_bookings where workspace_id='${workspace}' and source_key='${'d'.repeat(64)}';`,
      ),
      '0',
    );
    console.log('Zwei Quellen für ein Stück: eine Buchung, kein Teilverkauf der zweiten.');

    const reserve = (index, key, orderId) => {
      const order = source(orderId);
      order.lines[0].listingId = `reserve-${index}`;
      return `insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,auto_prepare)
        values('${workspace}','production','test-${workspace}','${orderId}','${key}',${json(order)},now(),true);`;
    };
    const manual = (index) => `${claims(users[1])} select public.record_sale('${workspace}',
      '{"platform":"ebay","sale_date":"2026-10-23"}',${json([{ catalog_product_id: products[index], quantity: 1, unit_sale_price: 10 }])});`;
    query(`insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,catalog_product_id) values
      ${[2, 3, 4].map((index) => `('${workspace}','production','test-${workspace}','reserve-${index}','${products[index]}')`).join(',')};`);
    results = await concurrent(reserve(2, '1'.repeat(64), 'reserve-vs-manual'), manual(2));
    assert.equal(results[0].code, 0, results[0].errors);
    assert.notEqual(
      results[1].code,
      0,
      'Manueller Verkauf darf die zuvor reservierte Menge nicht verbrauchen',
    );
    assert.match(results[1].errors, /Bestand|bestand|stock|quantity|Menge/i);
    assert.equal(
      query(
        `select sum(remaining_quantity) from public.stock_lots where catalog_product_id='${products[2]}';`,
      ),
      '1',
    );
    console.log(
      'Eigene Reservierung gegen manuellen Verkauf: echte Sperre, reservierte Menge bleibt vollständig.',
    );

    results = await concurrent(
      reserve(3, '2'.repeat(64), 'reserve-source-a'),
      reserve(3, '3'.repeat(64), 'reserve-source-b'),
    );
    for (const result of results) assert.equal(result.code, 0, result.errors);
    assert.equal(
      query(
        `select state from public.ebay_sale_drafts where workspace_id='${workspace}' and order_id='reserve-source-a';`,
      ),
      'needs_costs',
    );
    assert.equal(
      query(
        `select state from public.ebay_sale_drafts where workspace_id='${workspace}' and order_id='reserve-source-b';`,
      ),
      'needs_stock',
    );
    assert.equal(
      query(
        `select sum(r.quantity) from public.ebay_sale_reservations r join public.stock_lots l on l.id=r.stock_lot_id where l.catalog_product_id='${products[3]}' and r.released_at is null;`,
      ),
      '1',
    );
    console.log(
      'Zwei Quellen für ein Stück: getrennte Sitzungen reservieren insgesamt nur eine Menge.',
    );

    query(reserve(4, '4'.repeat(64), 'reserved-finalization'));
    const finalSnapshot = snapshot(0, '4'.repeat(64), 'reserved-finalization');
    results = await concurrent(book(0, finalSnapshot, products[4]), manual(4));
    assert.equal(results[0].code, 0, results[0].errors);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].errors, /Bestand|bestand|stock|quantity|Menge/i);
    assert.equal(
      query(
        `select state from public.ebay_sale_drafts where workspace_id='${workspace}' and order_id='reserved-finalization';`,
      ),
      'booked',
    );
    assert.equal(
      query(
        `select count(*) from public.ebay_sale_reservations r join public.stock_lots l on l.id=r.stock_lot_id where l.catalog_product_id='${products[4]}' and r.released_at is null;`,
      ),
      '0',
    );
    assert.equal(
      query(
        `select sum(remaining_quantity) from public.stock_lots where catalog_product_id='${products[4]}';`,
      ),
      '0',
    );
    console.log(
      'Eigene endgültige Buchung gegen manuellen Verkauf: atomare Umwandlung ohne freie Zwischenmenge.',
    );

    const revoked = snapshot(1, 'e'.repeat(64), 'revoked-member');
    results = await concurrent(
      `delete from public.workspace_members where workspace_id='${workspace}' and user_id='${users[1]}';`,
      book(1, revoked, products[0]),
    );
    assert.equal(results[0].code, 0, results[0].errors);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].errors, /42501/);
    query(
      `insert into public.workspace_members(workspace_id,user_id,role) values ('${workspace}','${users[1]}','member');`,
    );
    const disconnected = snapshot(1, 'f'.repeat(64), 'disconnected-account');
    results = await concurrent(
      `update public.ebay_connections set status='disconnected', authorization_version=authorization_version+1 where id='${connections[1]}';`,
      book(1, disconnected, products[0]),
    );
    assert.equal(results[0].code, 0, results[0].errors);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].errors, /42501/);
    assert.equal(
      query(`select count(*) from public.sales where workspace_id='${workspace}';`),
      '3',
    );
    assert.equal(
      query(
        `select sum(remaining_quantity) from public.stock_lots where catalog_product_id='${products[0]}';`,
      ),
      '1',
    );
    console.log(
      'Parallel entzogene Mitgliedschaft und getrennte Verbindung: kein unberechtigter Commit.',
    );
  } finally {
    for (const client of clients)
      if (client.child.exitCode === null) {
        client.child.stdin.end();
        client.child.kill();
      }
    // Nur künstliche Daten dieses Laufs in dem ausdrücklich gewählten Testcontainer.
    // Die Geschäftsdaten-Trigger bleiben für sämtliche Testbuchungen aktiv. Die
    // abschließende Bereinigung umgeht sie ausschließlich in dieser Admin-Sitzung.
    query(`begin; set local session_replication_role = replica;
      create temporary table cleanup_workspaces on commit drop as select id from public.workspaces
        where id='${workspace}' or id in (select workspace_id from public.workspace_members where user_id in ('${users[0]}','${users[1]}'));
      delete from public.number_series_counters where series_id in (select id from public.number_series where workspace_id in (select id from cleanup_workspaces));
      do $$ declare entry record; workspace_ids uuid[]; begin
        select array_agg(id) into workspace_ids from cleanup_workspaces;
        for entry in select c.table_name from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
          where c.table_schema='public' and c.column_name='workspace_id' and t.table_type='BASE TABLE'
        loop execute format('delete from public.%I where workspace_id = any($1)',entry.table_name) using workspace_ids; end loop;
      end $$;
      delete from public.workspaces where id in (select id from cleanup_workspaces);
      delete from public.profiles where id in ('${users[0]}','${users[1]}');
      delete from auth.users where id in ('${users[0]}','${users[1]}'); commit;`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runEbayImportConcurrency();
