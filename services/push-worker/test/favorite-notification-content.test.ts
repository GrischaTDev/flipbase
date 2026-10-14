import assert from 'node:assert/strict';
import test from 'node:test';
import { readFavoriteNotificationContent } from '../src/favorite-notification-content.ts';
import { createPushDeliveryStore } from '../src/push-delivery-store.ts';
import { readConfig } from '../src/config.ts';
import { validatePayload } from '../src/push-dispatcher.ts';

const config = {
  ...readConfig({}),
  supabaseUrl: 'https://api.example.test',
  serviceKey: 'fixture',
};
const payload = {
  version: 1,
  eventId: 'a7000000-0000-4000-8000-000000000001',
  workspaceId: 'a7000000-0000-4000-8000-000000000002',
  category: 'favorite',
  title: 'Flipbase',
  body: 'Deine Inserate haben neue Favoriten.',
  target: { kind: 'vinted_favorites', connectionId: 'a7000000-0000-4000-8000-000000000003' },
};
const source = {
  id: payload.eventId,
  workspace_id: payload.workspaceId,
  connection_id: payload.target.connectionId,
  source_key: 'vinted-favorites:42',
};
const notification = {
  id: 42,
  workspace_id: payload.workspaceId,
  connection_id: payload.target.connectionId,
  marketplace_connections: { display_name: 'Maike Vintage' },
  marketplace_favorite_notification_events: [{ id: 1, title: 'Sommerkleid mit Blumenmuster' }],
};
const delivery = {
  endpoint: 'https://fcm.googleapis.com/a',
  p256dh: 'test',
  auth: 'test',
  keyId: 'v1',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  payload,
};
const claim = {
  id: payload.eventId,
  binding_generation: payload.workspaceId,
  claim_token: payload.eventId,
};

test('favorite content uses the verified notification and scopes both reads to its account', async (context) => {
  const requests: URL[] = [];
  context.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    requests.push(url);
    return Response.json(url.pathname.endsWith('web_push_events') ? [source] : [notification]);
  });
  assert.deepEqual(await readFavoriteNotificationContent(config, payload), {
    title: 'Artikel wurde favorisiert · Maike Vintage',
    body: 'Sommerkleid mit Blumenmuster',
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.origin, config.supabaseUrl);
    assert.equal(request.searchParams.get('workspace_id'), `eq.${payload.workspaceId}`);
    assert.equal(request.searchParams.get('connection_id'), `eq.${payload.target.connectionId}`);
  }
  assert.ok(requests[1]);
  assert.equal(requests[1].searchParams.get('id'), 'eq.42');
});

test('multiple favorites show their article titles and keep Unicode within browser limits', async (context) => {
  context.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) =>
    Response.json(
      String(input).includes('/web_push_events?')
        ? [source]
        : [
            {
              ...notification,
              marketplace_connections: { display_name: '😀'.repeat(80) },
              marketplace_favorite_notification_events: [
                { id: 1, title: '😀'.repeat(160) },
                { id: 2, title: 'Jeansjacke' },
              ],
            },
          ],
    ),
  );
  const content = await readFavoriteNotificationContent(config, payload);
  assert.ok(content);
  assert.ok(content?.title.startsWith('2 Artikel wurden favorisiert · '));
  assert.ok(content.title.length <= 80 && content.body.length <= 160);
  assert.equal(/[\uD800-\uDBFF]$/u.test(content.title), false);
  assert.equal(validatePayload({ ...payload, ...content }), true);
});

test('foreign, missing and malformed source details never become notification contents', async (context) => {
  for (const invalid of [
    { ...source, workspace_id: claim.id },
    { ...source, connection_id: claim.id },
    { ...source, source_key: 'vinted-favorites:42&limit=1000' },
  ]) {
    const reads: string[] = [];
    context.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
      reads.push(String(input));
      return Response.json([invalid]);
    });
    assert.equal(await readFavoriteNotificationContent(config, payload), null);
    assert.equal(reads.length, 1);
  }
});

test('a foreign notification, deleted articles or an unavailable API keep the generic fallback', async (context) => {
  for (const invalid of [
    { ...notification, connection_id: claim.id },
    { ...notification, marketplace_favorite_notification_events: [] },
    null,
  ]) {
    context.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) =>
      Response.json(
        String(input).includes('/web_push_events?') ? [source] : invalid === null ? [] : [invalid],
      ),
    );
    assert.equal(await readFavoriteNotificationContent(config, payload), null);
  }
  context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('unavailable');
  });
  assert.equal(await readFavoriteNotificationContent(config, payload), null);
});

test('favorite details require a fresh authorization after lookup, including revocation', async (context) => {
  for (const revoked of [false, true]) {
    let authorizations = 0;
    context.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/web_push_authorize')) {
        authorizations++;
        return Response.json(revoked && authorizations === 2 ? null : delivery);
      }
      return Response.json(path.endsWith('/web_push_events') ? [source] : [notification]);
    });
    const result = await createPushDeliveryStore(config).authorize(claim);
    assert.equal(authorizations, 2);
    if (revoked) assert.equal(result, null);
    else
      assert.deepEqual(result?.payload, {
        ...payload,
        title: 'Artikel wurde favorisiert · Maike Vintage',
        body: 'Sommerkleid mit Blumenmuster',
      });
  }
});

test('denied delivery never reads article details', async (context) => {
  let reads = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    reads++;
    return Response.json(null);
  });
  assert.equal(await createPushDeliveryStore(config).authorize(claim), null);
  assert.equal(reads, 1);
});
