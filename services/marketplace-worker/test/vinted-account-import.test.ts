import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { Page } from 'playwright';
import {
  parseVintedAccountImport,
  readVintedAccountImport,
  VintedImportReadError,
  VintedImportRequestError,
} from '../src/vinted-account-import.ts';

function importPage(overrides: (path: string) => unknown): Page {
  return {
    url: () => 'https://www.vinted.de/',
    evaluate: async (_script: unknown, path: string) =>
      overrides(path) ??
      (path.includes('/users/current')
        ? { user: { id: 123, login: 'testkonto' } }
        : { items: [], conversations: [], user_feedbacks: [], pagination: { total_pages: 1 } }),
  } as unknown as Page;
}

test('a provider rate limit stops subsequent source requests and retains its normalized waiting time', async () => {
  const calls: string[] = [];
  const retryAfter = new Date(Date.now() + 3_600_000).toISOString();
  const snapshot = await readVintedAccountImport(
    importPage((path) => {
      calls.push(path);
      return path.includes('/wardrobe/')
        ? { flipbaseRequestFailure: 'rate_limited', retryAfter }
        : undefined;
    }),
    async () => undefined,
  );
  assert.equal(calls.length, 2);
  assert.equal(snapshot.areas.publications.retryAfter, retryAfter);
  assert.equal(snapshot.areas.conversations.failure, 'rate_limited');
  assert.equal(snapshot.sourceRequestCount, 2);
});

test('normalizes Retry-After seconds from a real response without exposing the provider body', async () => {
  const before = Date.now();
  const replacement = mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('private provider body', { status: 429, headers: { 'Retry-After': '1800' } }),
  );
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: async (callback: (path: string) => Promise<unknown>, path: string) => callback(path),
  } as unknown as Page;
  try {
    await assert.rejects(
      readVintedAccountImport(page, async () => undefined),
      (error: unknown) => {
        if (
          !(error instanceof VintedImportReadError) ||
          !(error.cause instanceof VintedImportRequestError)
        )
          return false;
        const retry = Date.parse(error.cause.retryAfter ?? '');
        return (
          retry >= before + 1_800_000 &&
          retry <= Date.now() + 1_800_000 &&
          !error.message.includes('private provider')
        );
      },
    );
  } finally {
    replacement.mock.restore();
  }
});

test('fehlende Sterne und Herkunft werden nicht erfunden', () => {
  const snapshot = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123 } },
    [],
    [],
    [],
    '2026-09-30T09:00:00Z',
    [],
    [
      { id: 901 },
      { id: 902, rating: 8, feedback: 'automatisch klingt gut', author: { login: 'Anna' } },
    ],
  );
  const feedbacks = snapshot.entries[0]?.body['feedbacks'] as Record<string, unknown>[];
  assert.equal(feedbacks[0]?.['rating'], null);
  assert.equal(feedbacks[0]?.['isAutomatic'], null);
  assert.equal(feedbacks[0]?.['authorName'], null);
  assert.equal(feedbacks[0]?.['text'], '');
  assert.equal(feedbacks[1]?.['rating'], null);
  assert.equal(feedbacks[1]?.['isAutomatic'], null);
});

test('fehlgeschlagene Bewertungen bleiben von einer erfolgreichen leeren Liste unterscheidbar', async () => {
  const failed = await readVintedAccountImport(
    importPage((path) =>
      path.includes('/feedbacks') ? { flipbaseRequestFailure: 'provider_unavailable' } : undefined,
    ),
    async () => undefined,
  );
  assert.deepEqual(failed.areas.feedback, { status: 'failed', failure: 'provider_unavailable' });
  assert.equal(Object.hasOwn(failed.entries[0]?.body ?? {}, 'feedbacks'), false);
  const empty = await readVintedAccountImport(
    importPage(() => undefined),
    async () => undefined,
  );
  assert.deepEqual(empty.areas.feedback, { status: 'complete' });
  assert.deepEqual(empty.entries[0]?.body['feedbacks'], []);
});

test('ein Inseratfehler verwirft keine erfolgreichen Gespräche', async () => {
  const snapshot = await readVintedAccountImport(
    importPage((path) => {
      if (path.includes('/wardrobe/')) return { flipbaseRequestFailure: 'network' };
      if (path.includes('/inbox'))
        return { conversations: [{ id: 51, unread: true }], pagination: { total_pages: 1 } };
      return undefined;
    }),
    async () => undefined,
  );
  assert.deepEqual(snapshot.areas.publications, { status: 'failed', failure: 'network' });
  assert.equal(snapshot.areas.conversations.status, 'complete');
  assert.equal(snapshot.areas.messages.status, 'partial');
  assert.equal(snapshot.entries.filter((entry) => entry.kind === 'conversation').length, 1);
});

test('fehlerhafte Folgeseite behält gelesene Inserate ohne Vollständigkeitsbehauptung', async () => {
  const snapshot = await readVintedAccountImport(
    importPage((path) => {
      if (path.includes('/wardrobe/') && path.includes('page=1&'))
        return { items: [{ id: 41, user_id: 123 }], pagination: { total_pages: 2 } };
      if (path.includes('/wardrobe/')) return { flipbaseRequestFailure: 'rate_limited' };
      return undefined;
    }),
    async () => undefined,
  );
  assert.deepEqual(snapshot.areas.publications, { status: 'partial', failure: 'rate_limited' });
  assert.equal(
    snapshot.entries.some((entry) => entry.externalId === '41'),
    true,
  );
});

test('ein Gesprächsfehler verhindert nicht andere Gesprächsdetails', async () => {
  const snapshot = await readVintedAccountImport(
    importPage((path) => {
      if (path.includes('/inbox'))
        return {
          conversations: [
            { id: 51, unread: false },
            { id: 52, unread: false },
          ],
          pagination: { total_pages: 1 },
        };
      if (path.endsWith('/conversations/51')) return { flipbaseRequestFailure: 'invalid_response' };
      if (path.endsWith('/conversations/52'))
        return { conversation: { id: 52, messages: [{ id: 62, entity: { body: 'Hallo' } }] } };
      return undefined;
    }),
    async () => undefined,
  );
  assert.deepEqual(snapshot.areas.messages, { status: 'partial', failure: 'invalid_response' });
  assert.equal(
    snapshot.entries.some((entry) => entry.kind === 'message' && entry.externalId === '62'),
    true,
  );
});

test('unbekannte Listenzeilen berechtigen nicht zum Löschen des bisherigen Bestands', async () => {
  const snapshot = await readVintedAccountImport(
    importPage((path) =>
      path.includes('/wardrobe/')
        ? { items: [{ title: 'ID fehlt' }], pagination: { total_pages: 1 } }
        : undefined,
    ),
    async () => undefined,
  );
  assert.deepEqual(snapshot.areas.publications, { status: 'partial', failure: 'invalid_response' });
});

test('fehlende oder fremde Inseratzuordnung gilt nicht als vollständige leere Liste', async () => {
  for (const item of [{ id: 41 }, { id: 41, user_id: 999 }]) {
    const snapshot = await readVintedAccountImport(
      importPage((path) =>
        path.includes('/wardrobe/') ? { items: [item], pagination: { total_pages: 1 } } : undefined,
      ),
      async () => undefined,
    );
    assert.deepEqual(snapshot.areas.publications, {
      status: 'partial',
      failure: 'invalid_response',
    });
    assert.equal(snapshot.entries.filter((entry) => entry.kind === 'publication').length, 0);
  }
});

test('Seitengrenze liefert Teilstand und beendet den Abruf nach genau zwanzig Seiten', async () => {
  let pagesRead = 0;
  const snapshot = await readVintedAccountImport(
    importPage((path) => {
      if (!path.includes('/wardrobe/')) return undefined;
      pagesRead++;
      return { items: [{ id: pagesRead, user_id: 123 }], pagination: { total_pages: 21 } };
    }),
    async () => undefined,
  );
  assert.equal(pagesRead, 20);
  assert.equal(snapshot.entries.filter((entry) => entry.kind === 'publication').length, 20);
  assert.deepEqual(snapshot.areas.publications, { status: 'partial', failure: 'invalid_response' });
});

test('entzogener Zugriff und Anmeldeverlust werden auch bei Bewertungen nicht verschluckt', async () => {
  let requestedFeedback = false;
  const page = importPage((path) => {
    if (path.includes('/feedbacks')) {
      requestedFeedback = true;
      return { flipbaseRequestFailure: 'unauthorized' };
    }
    return undefined;
  });
  await assert.rejects(
    readVintedAccountImport(page, async () => undefined),
    VintedImportReadError,
  );
  assert.equal(requestedFeedback, true);
  let revoked = false;
  const revokedPage = importPage((path) => {
    if (path.includes('/wardrobe/')) revoked = true;
    return undefined;
  });
  await assert.rejects(
    readVintedAccountImport(revokedPage, async () => {
      if (revoked) throw new Error('Kontozugriff abgelaufen');
    }),
    /Kontozugriff abgelaufen|Vinted-Datenabruf fehlgeschlagen/,
  );
});

test('ordnet HTTP-Ablehnungen nur festen Diagnosekategorien zu', async () => {
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: async (callback: (path: string) => Promise<unknown>, path: string) => callback(path),
  } as unknown as Page;
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, reason] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [429, 'rate_limited'],
      [503, 'provider_unavailable'],
    ] as const) {
      globalThis.fetch = async () => new Response(null, { status });
      await assert.rejects(
        readVintedAccountImport(page, async () => undefined),
        (error: unknown) => {
          assert.ok(error instanceof VintedImportReadError);
          assert.equal(error.stage, 'profile');
          assert.ok(error.cause instanceof VintedImportRequestError);
          assert.equal(error.cause.reason, reason);
          assert.equal(error.message.includes(String(status)), false);
          return true;
        },
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
      if (requests === 2) return { items: [], pagination: { total_pages: 1 } };
      if (requests === 3) return { conversations: [], pagination: { total_pages: 1 } };
      return { user_feedbacks: [], pagination: { total_pages: 1 } };
    },
  } as unknown as Page;
  const result = await readVintedAccountImport(page, async () => undefined);
  assert.equal(result.identity.id, '123');
  assert.equal(navigations, 0);
  assert.equal(requests, 4);
});

test('unveränderte gelesene Gespräche bleiben aus dem Cache erhalten', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-28T10:00:00Z') });
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
      if (path.includes('/feedbacks'))
        return { user_feedbacks: [], pagination: { total_pages: 1 } };
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
  assert.equal(requested.length, 4);
  assert.equal(
    result.entries.find((entry) => entry.kind === 'conversation')?.body['text'],
    'Vollständige letzte Nachricht',
  );
});

test('ältere Gesprächsdetails werden trotz unverändertem Zeitstempel erneut gelesen', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-28T10:00:00Z') });
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

test('ordnet Feedbacks mit Kennzeichnung für automatische Bewertungen dem Profil zu', () => {
  const result = parseVintedAccountImport(
    { id: '123', username: 'testkonto' },
    { user: { id: 123, login: 'testkonto', feedback_count: 2, feedback_reputation: 5 } },
    [],
    [],
    [],
    '2026-09-28T10:00:00Z',
    [],
    [
      {
        id: 901,
        feedback: 'Super lieber Kontakt!',
        rating: 5,
        created_at: '2026-09-25T12:00:00Z',
        is_automatic: false,
        author: { login: 'kaeufer_1', photo: { url: 'https://example.com/p1.jpg' } },
        item: { title: 'Sommerkleid' },
      },
      {
        id: 902,
        feedback: 'Automatische Bewertung: Die Transaktion wurde erfolgreich abgeschlossen.',
        rating: 5,
        created_at: '2026-09-24T10:00:00Z',
        is_automatic: true,
      },
    ],
  );
  const profile = result.entries.find((entry) => entry.kind === 'profile');
  assert.ok(profile);
  const feedbacks = profile.body['feedbacks'] as Record<string, unknown>[];
  assert.equal(feedbacks.length, 2);
  const first = feedbacks[0];
  const second = feedbacks[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first['authorName'], 'kaeufer_1');
  assert.equal(first['isAutomatic'], false);
  assert.equal(first['itemTitle'], 'Sommerkleid');
  assert.equal(second['isAutomatic'], true);
  assert.equal(second['authorName'], 'Vinted System');
});
