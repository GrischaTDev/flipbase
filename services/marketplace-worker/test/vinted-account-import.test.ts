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
      if (requests === 1) return { user: { id: 123, login: 'testkonto' } };
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
  assert.equal(result.entries.find((entry) => entry.kind === 'message')?.parentExternalId, '51');
  assert.equal(
    result.entries.find((entry) => entry.kind === 'message')?.body['text'],
    'Ist die Jacke noch da?',
  );
  assert.equal(result.entries.find((entry) => entry.kind === 'sale')?.body['status'], 'Versendet');
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
