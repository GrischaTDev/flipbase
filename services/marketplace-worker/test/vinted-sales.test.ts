import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVintedAccountImport, readVintedAccountImport } from '../src/vinted-account-import.ts';
import type { Page } from 'playwright';

const observedAt = '2026-10-23T10:00:00Z';
function system(group: string, type: string, title: string, at = '2026-10-22T10:00:00Z') {
  return {
    entity_type: 'status_message',
    event_group: group,
    event_type: type,
    created_at_ts: at,
    entity: { title },
  };
}
function snapshot(
  messages: unknown[],
  transaction: Record<string, unknown> = {},
  relation: Record<string, unknown> = {},
  previous: import('../src/vinted-account-import.ts').VintedConversationVersion[] = [],
  title = '6 Artikel',
) {
  return parseVintedAccountImport(
    { id: '123', username: 'konto' },
    { user: { id: 123 } },
    [],
    [{ id: 51 }],
    [
      {
        conversation: {
          id: 51,
          item_title: title,
          transaction: { id: 71, current_user_side: 'seller', ...relation },
          messages,
        },
        transaction: {
          transaction: {
            id: 71,
            seller_id: 123,
            order: { id: 81, item_ids: [41, 42, 43, 44, 45, 46] },
            ...transaction,
          },
        },
      },
    ],
    observedAt,
    previous,
  );
}

test('übernimmt einen bestätigten Paketverkauf bereits vor dem Versand mit sämtlichen Artikelkennungen', () => {
  const sale = snapshot([system('sale', 'success', 'Verkauft')], {
    offer: { price: { amount: '40.00', currency_code: 'EUR' } },
  }).entries.find((entry) => entry.kind === 'sale');
  assert.ok(sale);
  assert.equal(sale.body['saleState'], 'sold');
  assert.deepEqual(sale.body['itemIds'], ['41', '42', '43', '44', '45', '46']);
  assert.equal(sale.body['price'], 40);
  assert.equal(sale.body['externalConversationId'], '51');
});

test('behält den stornierten Paketverkauf und erkennt anschließend den Vinted-Wiedereinstellbeleg', () => {
  const messages = [
    system('sale', 'success', 'Verkauft'),
    system('cancelation', 'manually', 'Bestellung storniert', '2026-10-22T11:00:00Z'),
  ];
  const cancelled = snapshot(messages).entries.find((entry) => entry.kind === 'sale');
  assert.equal(cancelled?.body['saleState'], 'cancelled');
  assert.equal(cancelled?.body['occurredAt'], '2026-10-22T10:00:00.000Z');
  const relisted = snapshot([
    ...messages,
    system(
      'cancelation',
      'reuploaded',
      'Der Artikel wurde wieder eingestellt!',
      '2026-10-22T12:00:00Z',
    ),
  ]).entries.find((entry) => entry.kind === 'sale');
  assert.equal(relisted?.externalId, cancelled?.externalId);
  assert.equal(relisted?.body['saleState'], 'relisted');
  assert.deepEqual(relisted?.body['itemIds'], cancelled?.body['itemIds']);
});

test('erkennt die beobachtete Storniermeldung im Versandereignis und ignoriert private Chattexte', () => {
  const sold = system('sale', 'success', 'Verkauft');
  const cancelled = system(
    'shipment',
    'shipment_completed',
    'Der Käufer hat die Bestellung storniert.',
    '2026-10-22T11:00:00Z',
  );
  assert.equal(
    snapshot([cancelled, sold]).entries.find((entry) => entry.kind === 'sale')?.body['saleState'],
    'cancelled',
  );
  assert.equal(
    snapshot([sold, { ...cancelled, entity_type: 'text_message' }]).entries.find(
      (entry) => entry.kind === 'sale',
    )?.body['saleState'],
    'sold',
  );
});

test('erfasst weder Käuferkonto noch widersprüchliche Verkäuferkennung als eigenen Verkauf', () => {
  const messages = [system('sale', 'success', 'Verkauft')];
  for (const [transaction, relation] of [
    [{ seller_id: 999 }, {}],
    [{}, { current_user_side: 'buyer' }],
    [{ user_side: 'buyer' }, {}],
  ] as const)
    assert.equal(
      snapshot(messages, transaction, relation).entries.some((entry) => entry.kind === 'sale'),
      false,
    );
});

test('erfindet für ein unvollständig zugeordnetes Paket keine weiteren Artikel und keinen Verkaufspreis', () => {
  const sale = snapshot([system('sale', 'success', 'Verkauft')], {
    order: {},
    item_id: 41,
    items_count: 6,
  }).entries.find((entry) => entry.kind === 'sale');
  assert.ok(sale);
  assert.deepEqual(sale.body['itemIds'], []);
  assert.equal(sale.body['itemCount'], 6);
  assert.equal(sale.body['price'], null);
});

test('ein akzeptiertes Angebot ohne Kaufbeleg erzeugt keinen Verkauf', () => {
  assert.equal(
    snapshot([system('offer', 'accepted', 'Angebot angenommen')], { order: {} }).entries.some(
      (entry) => entry.kind === 'sale',
    ),
    false,
  );
});

test('ein später aktualisierter alter Versandstatus überschreibt keine belegte Stornierung', () => {
  const result = snapshot(
    [
      system('sale', 'success', 'Verkauft'),
      system('cancelation', 'manually', 'Bestellung storniert', '2026-10-22T11:00:00Z'),
    ],
    { status_title: 'Versendet', status_updated_at: '2026-10-22T12:00:00Z' },
  );
  assert.equal(
    result.entries.find((entry) => entry.kind === 'sale')?.body['saleState'],
    'cancelled',
  );
});

test('aktualisiert einen früher bestätigten Verkauf auch aus einem verkürzten Stornierverlauf', () => {
  const previous = {
    externalId: '51',
    sourceUpdatedAt: observedAt,
    detailCheckedAt: observedAt,
    occurredAt: observedAt,
    text: null,
    saleTransactionId: '71',
    saleSellerId: '123',
  };
  const messages = [system('cancelation', 'reuploaded', 'Der Artikel wurde wieder eingestellt!')];
  assert.equal(
    snapshot(messages, { order: {} }, {}, [previous]).entries.find((entry) => entry.kind === 'sale')
      ?.body['saleState'],
    'relisted',
  );
  assert.equal(
    snapshot(messages, { order: {} }, {}, [{ ...previous, saleTransactionId: '72' }]).entries.some(
      (entry) => entry.kind === 'sale',
    ),
    false,
  );
  assert.equal(
    snapshot(messages, { order: {} }, {}, [{ ...previous, saleSellerId: '999' }]).entries.some(
      (entry) => entry.kind === 'sale',
    ),
    false,
  );
});

test('erkennt Vinteds singulären item_count und behandelt unbekannte Pakete nicht als Einzelstück', () => {
  for (const relation of [{ item_count: 6, is_bundle: true }, { is_bundle: true }]) {
    const sale = snapshot(
      [system('sale', 'success', 'Verkauft')],
      { order: {}, item_id: 41 },
      relation,
      [],
      'Jacke',
    ).entries.find((entry) => entry.kind === 'sale');
    assert.ok(sale);
    assert.equal(sale.body['isBundle'], true);
    assert.equal(sale.body['itemCount'], 'item_count' in relation ? 6 : null);
    assert.deepEqual(sale.body['itemIds'], []);
  }
});

test('ergänzt ältere unveränderte Chats einmalig um den Verkaufsablauf und verwendet danach wieder den Cache', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  const calls: string[] = [];
  const updatedAt = '2026-10-23T09:00:00.000Z';
  const page = {
    url: () => 'https://www.vinted.de/',
    goto: async () => undefined,
    evaluate: async (_script: unknown, path: string) => {
      calls.push(path);
      if (path.includes('/users/current')) return { user: { id: 123, login: 'konto' } };
      if (path.includes('/wardrobe/')) return { items: [], pagination: { total_pages: 1 } };
      if (path.includes('/inbox'))
        return {
          conversations: [{ id: 51, unread: false, updated_at: updatedAt }],
          pagination: { total_pages: 1 },
        };
      if (path.includes('/conversations/51'))
        return {
          conversation: {
            id: 51,
            item_title: '6 Artikel',
            messages: [system('sale', 'success', 'Verkauft')],
            transaction: { id: 71, user_side: 'seller' },
          },
        };
      if (path.includes('/transactions/71'))
        return {
          transaction: {
            id: 71,
            seller_id: 123,
            order: { id: 81, item_ids: [41, 42, 43, 44, 45, 46] },
          },
        };
      if (path.includes('/feedbacks'))
        return { user_feedbacks: [], pagination: { total_pages: 1 } };
      throw new Error('Unerwarteter Abruf');
    },
  } as unknown as Page;
  const previous = {
    externalId: '51',
    sourceUpdatedAt: updatedAt,
    detailCheckedAt: '2026-10-23T09:30:00.000Z',
    text: 'Verkauft',
    occurredAt: updatedAt,
  };
  const result = await readVintedAccountImport(page, async () => undefined, undefined, [previous]);
  assert.equal(result.entries.find((entry) => entry.kind === 'sale')?.body['saleState'], 'sold');
  assert.equal(
    result.entries.find((entry) => entry.kind === 'conversation')?.body['saleTrackingVersion'],
    2,
  );
  assert.ok(calls.includes('/api/v2/transactions/71'));
  calls.length = 0;
  await readVintedAccountImport(page, async () => undefined, undefined, [
    { ...previous, saleTrackingVersion: 2 },
  ]);
  assert.equal(
    calls.some((path) => path.includes('/conversations/') || path.includes('/transactions/')),
    false,
  );
});

test('liest den gebundenen Kaufbetrag aus der Gesprächstransaktion auch ohne spätere Detailantwort', () => {
  const sale = snapshot(
    [system('sale', 'success', 'Verkauft')],
    {},
    {
      offer_price: { amount: '18.00', currency_code: 'EUR' },
    },
  ).entries.find((entry) => entry.kind === 'sale');
  assert.equal(sale?.body['price'], 18);
});

test('verwendet einen Gesprächspreis ohne Kaufbeleg niemals als Verkauf', () => {
  assert.equal(
    snapshot(
      [],
      { order: {} },
      { offer_price: { amount: '18.00', currency_code: 'EUR' } },
    ).entries.some((entry) => entry.kind === 'sale'),
    false,
  );
});

test('erhaelt die Artikelzuordnung der gebundenen Inbox bei verkuerztem Detail', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'konto' },
    { user: { id: 123 } },
    [],
    [{ id: 51, item_id: 41, item_title: 'Bekannter Inbox-Titel' }],
    [
      {
        conversation: {
          id: 51,
          transaction: { id: 71, user_side: 'seller' },
          messages: [system('sale', 'success', 'Verkauft')],
        },
        transaction: { transaction: { id: 71, seller_id: 123, order: { id: 81 } } },
      },
    ],
    observedAt,
  );
  const sale = result.entries.find((entry) => entry.kind === 'sale');
  assert.equal(sale?.body['title'], 'Bekannter Inbox-Titel');
  assert.deepEqual(sale?.body['itemIds'], ['41']);
});

test('ordnet die Marke eines einzelnen Paketteils keinem unvollstaendigen Gesamtpaket zu', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'konto' },
    { user: { id: 123 } },
    [{ id: 41, title: 'Teil', brand_title: 'Nike', size_title: 'M' }],
    [{ id: 51 }],
    [
      {
        conversation: {
          id: 51,
          item_title: '6 Artikel',
          transaction: { id: 71, user_side: 'seller', is_bundle: true },
          messages: [system('sale', 'success', 'Verkauft')],
        },
        transaction: {
          transaction: { id: 71, seller_id: 123, item_count: 6, order: { id: 81, item_ids: [41] } },
        },
      },
    ],
    observedAt,
  );
  const sale = result.entries.find((entry) => entry.kind === 'sale');
  assert.equal(sale?.body['brand'], null);
  assert.equal(sale?.body['size'], null);
});
