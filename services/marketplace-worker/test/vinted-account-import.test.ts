import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import {
  parseVintedAccountImport,
  readVintedAccountImport,
  VintedImportReadError,
} from '../src/vinted-account-import.ts';

test('ordnet einen geheimen Anbieterfehler nur dem fehlgeschlagenen Profilschritt zu', async () => {
  let requests = 0;
  const page = {
    goto: async () => undefined,
    url: () => 'https://www.vinted.de/',
    evaluate: async () => {
      requests += 1;
      throw new Error('private-provider-response');
    },
  } as unknown as Page;
  await assert.rejects(
    readVintedAccountImport(page, async () => undefined),
    (error: unknown) => {
      assert.ok(error instanceof VintedImportReadError);
      assert.equal(error.stage, 'profile');
      assert.equal(error.message.includes('private-provider-response'), false);
      return true;
    },
  );
  assert.equal(requests, 1);
});

test('nutzt eine bereits geöffnete Vinted-Seite und liest das Profil nur einmal', async () => {
  let navigations = 0;
  let requests = 0;
  const page = {
    url: () => 'https://www.vinted.de/',
    goto: async () => {
      navigations += 1;
    },
    evaluate: async () => {
      requests += 1;
      if (requests === 1) return { user: { id: 123, login: 'testkonto' } };
      return requests === 2
        ? { items: [], pagination: { total_pages: 1 } }
        : { conversations: [], pagination: { total_pages: 1 } };
    },
  } as unknown as Page;
  const result = await readVintedAccountImport(page, async () => undefined);
  assert.equal(result.identity.id, '123');
  assert.equal(navigations, 0);
  assert.equal(requests, 3);
});

test('unveränderte gelesene Gespräche bleiben aus dem Cache erhalten', async () => {
  const requested: string[] = [];
  const page = {
    url: () => 'https://www.vinted.de/',
    goto: async () => undefined,
    evaluate: async (_script: unknown, path: string) => {
      requested.push(path);
      if (path.includes('/users/current')) return { user: { id: 123, login: 'testkonto' } };
      if (path.includes('/wardrobe/')) return { items: [], pagination: { total_pages: 1 } };
      if (path.includes('/inbox'))
        return {
          conversations: [
            { id: 51, unread: false, updated_at: '2026-09-28T09:00:00Z', description: 'Kurztext' },
          ],
          pagination: { total_pages: 1 },
        };
      throw new Error('Gespräch darf nicht erneut gelesen werden');
    },
  } as unknown as Page;
  const result = await readVintedAccountImport(page, async () => undefined, undefined, [
    {
      externalId: '51',
      sourceUpdatedAt: '2026-09-28T09:00:00.000Z',
      detailCheckedAt: '2026-09-28T09:30:00Z',
      text: 'Vollständige letzte Nachricht',
      occurredAt: '2026-09-28T09:20:00Z',
    },
  ]);
  assert.equal(requested.length, 3);
  assert.equal(
    result.entries.find((entry) => entry.kind === 'conversation')?.body['text'],
    'Vollständige letzte Nachricht',
  );
});

test('ältere Gesprächsdetails werden trotz unverändertem Zeitstempel erneut gelesen', async () => {
  const requested: string[] = [];
  const page = {
    url: () => 'https://www.vinted.de/',
    goto: async () => undefined,
    evaluate: async (_script: unknown, path: string) => {
      requested.push(path);
      if (path.includes('/users/current')) return { user: { id: 123, login: 'testkonto' } };
      if (path.includes('/wardrobe/')) return { items: [], pagination: { total_pages: 1 } };
      if (path.includes('/inbox'))
        return {
          conversations: [
            { id: 51, unread: false, updated_at: '2026-09-28T09:00:00Z', description: 'Kurztext' },
          ],
          pagination: { total_pages: 1 },
        };
      if (path.includes('/conversations/51'))
        return {
          conversation: {
            id: 51,
            messages: [
              {
                id: 61,
                created_at_ts: '2026-09-28T09:20:00Z',
                entity: { body: 'Neuer Detailtext', user_id: 123 },
              },
            ],
          },
        };
      throw new Error('Unerwartete Anfrage');
    },
  } as unknown as Page;
  const result = await readVintedAccountImport(page, async () => undefined, undefined, [
    {
      externalId: '51',
      sourceUpdatedAt: '2026-09-28T09:00:00.000Z',
      detailCheckedAt: '2020-01-01T00:00:00Z',
      text: 'Alter Detailtext',
      occurredAt: '2026-09-28T09:00:00Z',
    },
  ]);
  assert.equal(
    requested.some((path) => path.includes('/conversations/51')),
    true,
  );
  assert.equal(
    result.entries.find((entry) => entry.kind === 'conversation')?.body['text'],
    'Neuer Detailtext',
  );
});

test('ordnet Profil, eigene Inserate, Gespräche, Nachrichten und belegte Verkäufe zu', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    {
      user: {
        id: 123,
        login: 'testkonto',
        name: 'Test',
        city: 'Berlin',
        feedback_count: 8,
        feedback_reputation: 4.8,
        positive_feedback_count: 7,
        photo: { url: 'https://images.vinted.net/user.jpg' },
      },
    },
    [
      {
        id: 41,
        user_id: 123,
        title: 'Jacke',
        price: { amount: '19.00', currency_code: 'EUR' },
        status: 'active',
        view_count: 12,
        favourite_count: 3,
        promoted: true,
        photos: [{ url: 'https://images.vinted.net/item.jpg' }],
      },
    ],
    [
      {
        id: 51,
        description: 'Frage zur Jacke',
        updated_at: '2026-09-28T09:00:00Z',
        unread: false,
        opposite_user: { login: 'Käuferin' },
      },
    ],
    [
      {
        conversation: {
          id: 51,
          messages: [
            {
              id: 61,
              entity_type: 'text_message',
              created_at_ts: '2026-09-28T09:00:00Z',
              entity: { body: 'Ist die Jacke noch da?' },
            },
          ],
          transaction: {
            id: 71,
            seller_id: 123,
            current_user_side: 'seller',
            purchase_id: 'purchase-1',
          },
        },
        transaction: {
          transaction: {
            id: 71,
            seller_id: 123,
            status_title: 'Versendet',
            order: { id: 81 },
            item_title: 'Jacke',
            offer: { price: { amount: '19.00', currency_code: 'EUR' } },
          },
        },
      },
    ],
    '2026-09-28T10:00:00Z',
  );
  assert.equal(result.entries.filter((entry) => entry.kind === 'profile').length, 1);
  assert.equal(result.entries.find((entry) => entry.kind === 'profile')?.body['feedbackCount'], 8);
  assert.equal(
    result.entries.find((entry) => entry.kind === 'publication')?.body['promoted'],
    true,
  );
  assert.equal(result.entries.find((entry) => entry.kind === 'publication')?.body['price'], 19);
  assert.equal(
    result.entries.find((entry) => entry.kind === 'publication')?.body['textState'],
    'not_loaded',
  );
  assert.equal(result.entries.find((entry) => entry.kind === 'message')?.parentExternalId, '51');
  assert.equal(
    result.entries.find((entry) => entry.kind === 'message')?.body['text'],
    'Ist die Jacke noch da?',
  );
  assert.equal(result.entries.find((entry) => entry.kind === 'sale')?.body['status'], 'Versendet');
});

test('übernimmt eine vorhandene Inseratbeschreibung einschließlich leerem Text', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123, login: 'testkonto' } },
    [
      { id: 41, user_id: 123, description: '' },
      { id: 42, user_id: 123, description: 'Gelesener Text' },
    ],
    [],
    [],
    '2026-09-28T10:00:00Z',
  );
  const publications = result.entries.filter((entry) => entry.kind === 'publication');
  assert.deepEqual(
    publications.map((entry) => entry.body['textState']),
    ['loaded', 'loaded'],
  );
  assert.deepEqual(
    publications.map((entry) => entry.body['text']),
    ['', 'Gelesener Text'],
  );
});

test('verwirft fremde Artikel und behandelt Angebote ohne Bestellung nicht als Verkauf', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123, login: 'testkonto' } },
    [
      { id: 41, user_id: 999, title: 'Fremder Artikel' },
      { id: 42, user_id: 123, title: 'Eigenes Inserat' },
      { id: 42, user_id: 123, title: 'Eigenes Inserat auf weiterer Seite' },
      { id: 43, user_id: 123, title: 'Verkauftes Inserat', is_closed: true },
    ],
    [],
    [{ conversation: { id: 51, messages: [], transaction: { id: 71, seller_id: 123 } } }],
    '2026-09-28T10:00:00Z',
  );
  assert.equal(result.entries.filter((entry) => entry.kind === 'publication').length, 1);
  assert.equal(
    result.entries.some((entry) => entry.kind === 'sale'),
    false,
  );
});

test('eine leere Bestellung und ein Angebot erzeugen keinen Verkauf', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123, login: 'testkonto' } },
    [{ id: 41, user_id: 123, title: 'Aktives Inserat' }],
    [{ id: 51, unread: false }],
    [
      {
        conversation: { id: 51, messages: [], transaction: { id: 71, seller_id: 123 } },
        transaction: {
          transaction: {
            id: 71,
            seller_id: 123,
            status_title: 'Angebot',
            order: {},
            item_title: 'Aktives Inserat',
          },
        },
      },
    ],
    '2026-09-28T10:00:00Z',
  );
  assert.equal(result.entries.filter((entry) => entry.kind === 'publication').length, 1);
  assert.equal(result.entries.filter((entry) => entry.kind === 'sale').length, 0);
  assert.deepEqual(result.rejectedSaleIds, ['71']);
});

test('unbekannter Transaktionsstatus löscht keinen historischen Verkauf', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123, login: 'testkonto' } },
    [],
    [{ id: 51, unread: false }],
    [
      {
        conversation: { id: 51, messages: [], transaction: { id: 71, seller_id: 123 } },
        transaction: {
          transaction: { id: 71, seller_id: 123, status_title: 'Unbekannt', order: { id: 81 } },
        },
      },
    ],
    '2026-09-28T10:00:00Z',
  );
  assert.equal(result.entries.filter((entry) => entry.kind === 'sale').length, 0);
  assert.deepEqual(result.rejectedSaleIds, []);
});

test('übernimmt echte Chatnachrichten mit Entity-ID und Systemereignisse ohne ID', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123, login: 'testkonto' } },
    [],
    [{ id: 51, unread: false }],
    [
      {
        conversation: {
          id: 51,
          messages: [
            {
              entity_type: 'message',
              created_at_ts: 1790589600,
              entity: { id: 62, user_id: 123, body: 'Danke für Deinen Einkauf' },
            },
            {
              entity_type: 'message',
              created_at_ts: 1790589601,
              entity: { id: 63, user_id: 456, body: 'Gerne' },
            },
            {
              entity_type: 'status_message',
              created_at_ts: 1790589602,
              event_type: 'success',
              entity: { title: 'Angebot angenommen', template: { style: 'notice' } },
            },
          ],
        },
      },
    ],
    '2026-09-28T10:00:00Z',
  );
  const messages = result.entries.filter((entry) => entry.kind === 'message');
  assert.equal(messages.length, 3);
  assert.deepEqual(
    messages.map((entry) => entry.body['direction']),
    ['outbound', 'inbound', 'unknown'],
  );
  const systemMessage = messages[2];
  assert.ok(systemMessage);
  assert.equal(systemMessage.body['text'], 'Angebot angenommen');
  assert.match(systemMessage.externalId, /^event:[0-9a-f]{64}$/);
  const conversation = result.entries.find((entry) => entry.kind === 'conversation');
  assert.ok(conversation);
  assert.equal(conversation.body['text'], 'Angebot angenommen');
  assert.equal(conversation.body['occurredAt'], systemMessage.sortAt);
});
