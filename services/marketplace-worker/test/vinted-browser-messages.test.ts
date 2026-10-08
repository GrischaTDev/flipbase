import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { Page } from 'playwright';
import { sendVintedMessage } from '../src/vinted-browser-messages.ts';

const command = { externalConversationId: '777', text: 'Hallo', attachment: null };
const oldMessage = { id: 10, entity: { id: 10, user_id: 123, body: 'Hallo' } };
const newMessage = { id: 11, entity: { id: 11, user_id: 123, body: 'Hallo' } };

function browser(
  options: {
    accountId?: number;
    origin?: string;
    after?: unknown[];
    replyStatus?: number;
    replyThrows?: boolean;
    replyJson?: boolean;
    csrf?: string | null;
  } = {},
) {
  const requests: { path: string; method: string; body: unknown }[] = [];
  let replied = false;
  const page = {
    url: () => `${options.origin ?? 'https://www.vinted.de'}/`,
    evaluate: async (operation: (...parameters: unknown[]) => unknown, argument: unknown) =>
      runInNewContext(`(${operation.toString()})(argument)`, {
        argument,
        AbortSignal,
        FormData,
        Blob,
        Uint8Array,
        atob,
        location: { origin: options.origin ?? 'https://www.vinted.de' },
        document: {
          querySelector: () => ({
            content: options.csrf === undefined ? 'test-csrf' : options.csrf,
          }),
          scripts: [],
        },
        fetch: async (path: string, init: RequestInit = {}) => {
          const method = init.method ?? 'GET';
          requests.push({ path, method, body: init.body });
          if (path === '/api/v2/users/current')
            return Response.json({ user: { id: options.accountId ?? 123 } });
          if (path === '/api/v2/conversations/777')
            return Response.json({
              conversation: {
                id: 777,
                messages: replied ? (options.after ?? [oldMessage, newMessage]) : [oldMessage],
              },
            });
          if (path === '/api/v2/photos')
            return Response.json({ photo_temp_uuid: '10000000-0000-4000-8000-000000000001' });
          assert.equal(path, '/api/v2/conversations/777/replies');
          assert.equal(method, 'POST');
          replied = true;
          if (options.replyThrows) throw new Error('private upstream error');
          return options.replyJson === false
            ? new Response('<html>challenge</html>', { status: options.replyStatus ?? 200 })
            : Response.json({ code: 0 }, { status: options.replyStatus ?? 200 });
        },
      }),
  } as unknown as Page;
  return {
    page,
    requests,
    replies: () => requests.filter((request) => request.path.endsWith('/replies')),
  };
}

test('confirms exactly one new own message, excluding old same-text messages', async () => {
  const fixture = browser();
  let authorizations = 0;
  const result = await sendVintedMessage(fixture.page, '123', command, async () => {
    authorizations += 1;
  });
  assert.deepEqual(result, { outcome: 'sent', externalMessageId: '11' });
  assert.equal(fixture.replies().length, 1);
  assert.deepEqual(JSON.parse(String(fixture.replies()[0]?.body)), {
    reply: { body: 'Hallo', photo_temp_uuids: null },
  });
  assert.ok(authorizations >= fixture.requests.length);
});

test('changed identity cannot emit a reply', async () => {
  const fixture = browser({ accountId: 456 });
  const result = await sendVintedMessage(fixture.page, '123', command, async () => undefined);
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'identity_changed' });
  assert.equal(fixture.replies().length, 0);
});

test('revocation immediately before the reply prevents the POST', async () => {
  const fixture = browser();
  const result = await sendVintedMessage(fixture.page, '123', command, async () => {
    if (fixture.requests.length === 3) throw new Error('authorization revoked');
  });
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'authorization_expired' });
  assert.equal(fixture.replies().length, 0);
});

test('lost reply response stays unknown and never repeats the POST', async () => {
  const fixture = browser({ replyThrows: true });
  const result = await sendVintedMessage(fixture.page, '123', command, async () => undefined);
  assert.deepEqual(result, { outcome: 'outcome_unknown', errorCode: 'provider_unavailable' });
  assert.equal(fixture.replies().length, 1);
});

for (const [name, after] of [
  ['no new message', [oldMessage]],
  ['two new same-text messages', [oldMessage, newMessage, { ...newMessage, id: 12 }]],
  [
    'a new message from someone else',
    [oldMessage, { ...newMessage, entity: { ...newMessage.entity, user_id: 456 } }],
  ],
  [
    'a new message with different text',
    [oldMessage, { ...newMessage, entity: { ...newMessage.entity, body: 'Other' } }],
  ],
] as const) {
  test(`${name} is not confirmation of this reply`, async () => {
    const fixture = browser({ after: [...after] });
    assert.deepEqual(await sendVintedMessage(fixture.page, '123', command, async () => undefined), {
      outcome: 'outcome_unknown',
      errorCode: 'reply_unconfirmed',
    });
    assert.equal(fixture.replies().length, 1);
  });
}

test('revocation after an accepted reply preserves an unknown attempt', async () => {
  const fixture = browser();
  const result = await sendVintedMessage(fixture.page, '123', command, async () => {
    if (fixture.replies().length) throw new Error('authorization revoked');
  });
  assert.deepEqual(result, { outcome: 'outcome_unknown', errorCode: 'authorization_expired' });
  assert.equal(fixture.replies().length, 1);
});

test('an uploaded photo and matching text do not prove attachment delivery', async () => {
  const fixture = browser();
  const attachment = { name: 'test.png', mimeType: 'image/png' as const, base64: 'iVBORw0KGgo=' };
  const result = await sendVintedMessage(
    fixture.page,
    '123',
    { ...command, attachment },
    async () => undefined,
  );
  assert.deepEqual(result, { outcome: 'outcome_unknown', errorCode: 'reply_unconfirmed' });
  assert.equal(fixture.requests.filter((request) => request.path === '/api/v2/photos').length, 1);
  assert.equal(fixture.replies().length, 1);
  assert.deepEqual(JSON.parse(String(fixture.replies()[0]?.body)), {
    reply: {
      body: 'Hallo',
      photo_temp_uuids: ['10000000-0000-4000-8000-000000000001'],
      is_personal_data_sharing_check_skipped: false,
    },
  });
});

test('invalid image bytes are rejected before any browser request', async () => {
  const fixture = browser();
  const result = await sendVintedMessage(
    fixture.page,
    '123',
    {
      ...command,
      attachment: {
        name: 'test.png',
        mimeType: 'image/png',
        base64: 'c2VjcmV0',
      },
    },
    async () => undefined,
  );
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'invalid_command' });
  assert.equal(fixture.requests.length, 0);
});

test('a non-Vinted origin cannot receive account requests or secrets', async () => {
  const fixture = browser({ origin: 'https://example.test' });
  const result = await sendVintedMessage(fixture.page, '123', command, async () => undefined);
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'login_required' });
  assert.equal(fixture.requests.length, 0);
});

test('missing CSRF fails before any provider action', async () => {
  const fixture = browser({ csrf: null });
  const result = await sendVintedMessage(fixture.page, '123', command, async () => undefined);
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'login_required' });
  assert.equal(fixture.requests.length, 0);
});

test('a throttled reply is rejected without automatic retry', async () => {
  const fixture = browser({ replyStatus: 429 });
  const result = await sendVintedMessage(fixture.page, '123', command, async () => undefined);
  assert.deepEqual(result, { outcome: 'failed', errorCode: 'rate_limited' });
  assert.equal(fixture.replies().length, 1);
});

test('successful HTTP with an HTML response cannot claim sent', async () => {
  const fixture = browser({ replyJson: false });
  const result = await sendVintedMessage(fixture.page, '123', command, async () => undefined);
  assert.deepEqual(result, { outcome: 'outcome_unknown', errorCode: 'challenge_required' });
  assert.equal(fixture.replies().length, 1);
});
