import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiConnectionHandler } from './handler.ts';
import { tools } from './tools.ts';

const config = {
  endpoint: 'https://api.example.test/functions/v1/ai-connection',
  authorizationServer: 'https://api.example.test/auth/v1',
  allowedOrigins: ['https://app.example.test'],
};
const requestId = '78000000-0000-4000-8000-000000000001';
function fixture(mode = 'read', role = 'owner') {
  const calls: unknown[] = [];
  let valid = true;
  const handler = createAiConnectionHandler(config, {
    connected() {
      return Promise.resolve();
    },
    context(token) {
      if (!valid || token !== 'valid') return Promise.reject(new Error('revoked'));
      return Promise.resolve({ access_mode: mode, role });
    },
    call(token, action, input, id) {
      calls.push({ token, action, input, id });
      return Promise.resolve({ saved: true });
    },
  });
  const send = (method: string, args: unknown = {}, headers: Record<string, string> = {}) =>
    handler(
      new Request(config.endpoint, {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid',
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: args }),
      }),
    );
  return {
    handler,
    send,
    calls,
    setMode: (next: string) => {
      mode = next;
    },
    revoke: () => {
      valid = false;
    },
  };
}

test('discovery is public, authentication challenges name protected metadata', async () => {
  const { handler } = fixture();
  const metadata = await handler(
    new Request(config.endpoint + '/.well-known/oauth-protected-resource'),
  );
  assert.equal(metadata.status, 200);
  assert.deepEqual((await metadata.json()).authorization_servers, [config.authorizationServer]);
  const denied = await handler(new Request(config.endpoint, { method: 'POST' }));
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate') ?? '', /resource_metadata=/);
});
test('only trusted browser origins can access the endpoint', async () => {
  const { send, calls } = fixture('edit');
  assert.equal((await send('tools/list', {}, { origin: 'https://attacker.test' })).status, 403);
  assert.equal(calls.length, 0);
});
test('initialize advertises tools and instructions without invented prompt/resource capabilities', async () => {
  const { send } = fixture();
  const { result } = await (await send('initialize', { protocolVersion: '2025-06-18' })).json();
  assert.equal(result.protocolVersion, '2025-06-18');
  assert.deepEqual(result.capabilities, { tools: {} });
  assert.match(result.instructions, /Entwurf/);
});
test('the catalog stays discoverable in read mode while writes remain blocked', async () => {
  const { send, calls } = fixture();
  const { result } = await (await send('tools/list')).json();
  assert.ok(result.tools.length > 1);
  assert.equal(result.tools.length, tools.length);
  assert.match(
    result.tools.find((t: { name: string }) => t.name === 'save_sale_draft').description,
    /Lesen und bearbeiten/,
  );
  const write = await (
    await send('tools/call', {
      name: 'record_sale',
      arguments: { request_id: requestId, sale: {}, lines: [] },
    })
  ).json();
  assert.equal(write.error.code, -32602);
  assert.equal(calls.length, 0);
});

test('the same client sees changed rights immediately without changing its tool catalog', async () => {
  const { send, calls, setMode } = fixture();
  const catalog = await (await send('tools/list')).json();
  const write = () =>
    send('tools/call', {
      name: 'save_sale_draft',
      arguments: { request_id: requestId, title: 'Testentwurf', draft: {} },
    });
  assert.ok((await (await write()).json()).error);
  setMode('edit');
  const context = await (await send('tools/call', { name: 'get_context', arguments: {} })).json();
  assert.equal(JSON.parse(context.result.content[0].text).access_mode, 'edit');
  assert.deepEqual(await (await send('tools/list')).json(), catalog);
  assert.equal((await (await write()).json()).result.isError, undefined);
  setMode('read');
  assert.ok((await (await write()).json()).error);
  assert.equal(calls.length, 1);
});

test('role restrictions still limit the discoverable catalog', async () => {
  for (const role of ['readonly', 'fulfillment']) {
    const { send } = fixture('read', role);
    const { result } = await (await send('tools/list')).json();
    assert.ok(
      result.tools.every(
        (t: { name: string; annotations: { readOnlyHint: boolean } }) =>
          t.annotations.readOnlyHint && !t.name.includes('vinted'),
      ),
    );
  }
});
test('requests are validated and idempotency keys are kept out of business payloads', async () => {
  const { send, calls } = fixture('edit');
  for (const args of [
    { purchase: {} },
    { request_id: 'invalid', purchase: {} },
    { request_id: requestId, purchase: {}, workspace_id: 'foreign' },
  ]) {
    assert.ok(
      (await (await send('tools/call', { name: 'create_purchase', arguments: args })).json()).error,
    );
  }
  assert.equal(calls.length, 0);
  const result = await (
    await send('tools/call', {
      name: 'create_purchase',
      arguments: { request_id: requestId, purchase: { title: 'Kauf' } },
    })
  ).json();
  assert.equal(result.result.isError, undefined);
  assert.deepEqual(calls, [
    {
      token: 'valid',
      action: 'create_purchase',
      input: { purchase: { title: 'Kauf' } },
      id: requestId,
    },
  ]);
});
test('revocation is rechecked for every request', async () => {
  const { send, revoke } = fixture();
  assert.equal((await send('tools/list')).status, 200);
  revoke();
  assert.equal((await send('tools/list')).status, 401);
});
test('unsupported protocol versions, batch bodies and oversized payloads are rejected', async () => {
  const { send, handler } = fixture();
  assert.equal((await send('ping', {}, { 'mcp-protocol-version': '2099-01-01' })).status, 400);
  for (const [body, status] of [
    ['[]', 400],
    [JSON.stringify({ text: 'a'.repeat(300001) }), 413],
  ] as const) {
    assert.equal(
      (
        await handler(
          new Request(config.endpoint, {
            method: 'POST',
            headers: {
              authorization: 'Bearer valid',
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body,
          }),
        )
      ).status,
      status,
    );
  }
});
test('every write requires a request UUID and advertises its side effect', () => {
  for (const tool of tools.filter((t) => !t.annotations.readOnlyHint)) {
    assert.ok(tool.inputSchema.required.includes('request_id'));
    assert.equal(tool.annotations.destructiveHint, true);
  }
});
