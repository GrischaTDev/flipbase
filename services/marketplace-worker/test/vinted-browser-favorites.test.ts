import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { Page } from 'playwright';
import {
  sendVintedFavoriteMessage,
  sendVintedFavoriteOffer,
  favoriteOfferPriceCents,
} from '../src/vinted-browser-favorites.ts';

const command = { recipientId: '456', itemId: '789', text: 'Danke fürs Merken!' };
function browser(
  options: {
    existing?: boolean;
    wrongRecipient?: boolean;
    wrongItem?: boolean;
    loseCreation?: boolean;
    offerThrows?: boolean;
    offerId?: number;
    price?: string;
    sentMessage?: boolean;
    inboxPages?: number;
    existingOnSecondPage?: boolean;
  } = {},
) {
  const requests: { path: string; method: string; body: unknown }[] = [];
  let replied = options.sentMessage ?? false;
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: (operation: (...parameters: unknown[]) => unknown, argument: unknown) =>
      runInNewContext(`(${operation.toString()})(argument)`, {
        argument,
        AbortSignal,
        URL,
        location: { origin: 'https://www.vinted.de' },
        document: { querySelector: () => ({ content: 'test-csrf' }), scripts: [] },
        fetch: async (path: string, settings: RequestInit) => {
          const method = settings.method ?? 'GET';
          requests.push({
            path,
            method,
            body: settings.body ? JSON.parse(String(settings.body)) : null,
          });
          let payload: unknown;
          if (path === '/api/v2/users/current') payload = { user: { id: 123 } };
          else if (path.includes('/wardrobe/'))
            payload = {
              items: [
                {
                  id: 789,
                  is_closed: false,
                  is_reserved: false,
                  price: { amount: options.price ?? '20.00', currency_code: 'EUR' },
                },
              ],
              pagination: { total_pages: 1 },
            };
          else if (path.includes('/inbox?'))
            payload = {
              conversations:
                options.existing || (options.existingOnSecondPage && path.includes('page=2&'))
                  ? [{ id: 10, opposite_user: { id: 456 } }]
                  : [],
              pagination: { total_pages: options.inboxPages ?? 1 },
            };
          else if (path === '/api/v2/conversations') {
            if (options.loseCreation) throw new Error('private provider response');
            payload = { conversation: { id: 777 } };
          } else if (path === '/api/v2/conversations/777')
            payload = {
              conversation: {
                id: 777,
                opposite_user: { id: options.wrongRecipient ? 999 : 456 },
                item_id: options.wrongItem ? 999 : 789,
                transaction: { id: 888, item_id: 789 },
                messages: replied
                  ? [{ id: 11, entity: { id: 11, user_id: 123, body: command.text } }]
                  : [],
              },
            };
          else if (path.endsWith('/replies')) {
            replied = true;
            payload = { code: 0 };
          } else if (path.endsWith('/offers')) {
            if (options.offerThrows) throw new Error('private provider response');
            payload = { code: 0, ...(options.offerId ? { offer: { id: options.offerId } } : {}) };
          } else throw new Error('Unexpected test path');
          return {
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => payload,
          };
        },
      }),
  } as unknown as Page;
  return { page, requests };
}
test('sends a favorite reply once and confirms the new own message', async () => {
  const { page, requests } = browser();
  const result = await sendVintedFavoriteMessage(page, '123', command, async () => undefined);
  assert.deepEqual(result, {
    outcome: 'sent',
    externalMessageId: '11',
    conversationId: '777',
    transactionId: '888',
  });
  assert.equal(requests.filter((request) => request.path.endsWith('/replies')).length, 1);
});
test('does not interrupt an existing conversation', async () => {
  const { page, requests } = browser({ existing: true });
  assert.deepEqual(await sendVintedFavoriteMessage(page, '123', command, async () => undefined), {
    outcome: 'skipped',
    errorCode: 'existing_conversation',
  });
  assert.equal(
    requests.some((request) => request.method === 'POST'),
    false,
  );
});
test('never repeats a lost conversation creation or sends to an unconfirmed recipient', async () => {
  for (const options of [{ loseCreation: true }, { wrongRecipient: true }, { wrongItem: true }]) {
    const { page, requests } = browser(options);
    assert.equal(
      (await sendVintedFavoriteMessage(page, '123', command, async () => undefined)).outcome,
      'outcome_unknown',
    );
    assert.equal(requests.filter((request) => request.path === '/api/v2/conversations').length, 1);
    assert.equal(
      requests.some((request) => request.path.endsWith('/replies')),
      false,
    );
  }
});
test('does not create a conversation when older pages already contain the recipient', async () => {
  const { page, requests } = browser({ inboxPages: 2, existingOnSecondPage: true });
  assert.equal(
    (await sendVintedFavoriteMessage(page, '123', command, async () => undefined)).outcome,
    'skipped',
  );
  assert.equal(requests.filter((request) => request.path.includes('/inbox?')).length, 2);
  assert.equal(
    requests.some((request) => request.method === 'POST'),
    false,
  );
});
test('a truncated inbox cannot authorize a new automatic conversation', async () => {
  const { page, requests } = browser({ inboxPages: 26 });
  assert.deepEqual(await sendVintedFavoriteMessage(page, '123', command, async () => undefined), {
    outcome: 'failed',
    errorCode: 'source_partial',
  });
  assert.equal(requests.filter((request) => request.path.includes('/inbox?')).length, 25);
  assert.equal(
    requests.some((request) => request.method === 'POST'),
    false,
  );
});
const offerCommand = {
  ...command,
  conversationId: '777',
  transactionId: '888',
  externalMessageId: '11',
  offer: { type: 'percentage' as const, value: 10 },
};
test('requires server confirmation of the current offer price before posting', async () => {
  const { page, requests } = browser({ sentMessage: true });
  let checked = false;
  const result = await sendVintedFavoriteOffer(
    page,
    '123',
    offerCommand,
    async () => undefined,
    async (original, offered) => {
      checked = true;
      assert.equal(original, 2000);
      assert.equal(offered, 1800);
      return false;
    },
  );
  assert.equal(checked, true);
  assert.equal(result.outcome, 'skipped');
  assert.equal(
    requests.some((request) => request.path.endsWith('/offers')),
    false,
  );
});
test('keeps lost offer replies unknown and requires a concrete offer id', async () => {
  for (const options of [{ offerThrows: true }, {}]) {
    const { page, requests } = browser({ ...options, sentMessage: true });
    const result = await sendVintedFavoriteOffer(
      page,
      '123',
      offerCommand,
      async () => undefined,
      async () => true,
    );
    assert.equal(result.outcome, 'outcome_unknown');
    assert.equal(requests.filter((request) => request.path.endsWith('/offers')).length, 1);
  }
});
test('confirms amount and percentage offers using their concrete provider receipt', async () => {
  for (const offer of [
    { type: 'percentage' as const, value: 10 },
    { type: 'amount' as const, value: 2 },
  ]) {
    const { page, requests } = browser({ offerId: 222, sentMessage: true });
    assert.deepEqual(
      await sendVintedFavoriteOffer(
        page,
        '123',
        { ...offerCommand, offer },
        async () => undefined,
        async () => true,
      ),
      { outcome: 'sent', externalOfferId: '222' },
    );
    assert.deepEqual(requests.find((request) => request.path.endsWith('/offers'))?.body, {
      offer: { currency: 'EUR', price: '18.00' },
    });
  }
  assert.equal(favoriteOfferPriceCents(1999, { type: 'percentage', value: 10 }), 1799);
  assert.equal(favoriteOfferPriceCents(1000, { type: 'amount', value: 5.01 }), null);
});
test('requires the confirmed own favorite message before preparing an offer', async () => {
  const { page, requests } = browser();
  let checked = false;
  const result = await sendVintedFavoriteOffer(
    page,
    '123',
    offerCommand,
    async () => undefined,
    async () => {
      checked = true;
      return true;
    },
  );
  assert.equal(result.outcome, 'skipped');
  assert.equal(checked, false);
  assert.equal(
    requests.some((request) => request.path.endsWith('/offers')),
    false,
  );
});
test('stops revoked favorite actions before external reads or writes', async () => {
  const { page, requests } = browser();
  const result = await sendVintedFavoriteMessage(page, '123', command, async () => {
    throw new Error('private revoked token');
  });
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'authorization_expired' });
  assert.equal(requests.length, 0);
});
