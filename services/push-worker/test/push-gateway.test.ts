import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createPushGateway } from '../src/push-gateway.ts';

test('MCP discovery and native token forms use the isolated runtime with authentication headers', async () => {
  const observed: {
    path: string;
    contentType: string | undefined;
    authorization: string | undefined;
    body: string;
  }[] = [];
  const backend = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    observed.push({
      path: request.url ?? '',
      contentType: request.headers['content-type'],
      authorization: request.headers.authorization,
      body,
    });
    response
      .writeHead(request.url?.endsWith('/oauth/token') ? 400 : 401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer resource_metadata="https://api.test/metadata"',
      })
      .end('{"error":"invalid_grant"}');
  });
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const backendAddress = backend.address();
  assert.ok(backendAddress && typeof backendAddress !== 'string');
  const gateway = createPushGateway({
    commit: 'a'.repeat(40),
    upstream: `http://127.0.0.1:${backendAddress.port}`,
  });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const address = gateway.address();
  assert.ok(address && typeof address !== 'string');
  const root = `http://127.0.0.1:${address.port}/functions/v1/ai-connection`;
  try {
    const discovery = await fetch(root + '/.well-known/oauth-protected-resource');
    assert.equal(discovery.status, 401);
    assert.match(discovery.headers.get('www-authenticate') ?? '', /resource_metadata=/);
    const token = await fetch(root + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic test' },
      body: 'grant_type=authorization_code&code=test',
    });
    assert.equal(token.status, 400);
    assert.deepEqual(observed[1], {
      path: '/ai-connection/oauth/token',
      contentType: 'application/x-www-form-urlencoded',
      authorization: 'Basic test',
      body: 'grant_type=authorization_code&code=test',
    });
    assert.equal((await fetch(root + '/unrestricted')).status, 404);
  } finally {
    gateway.closeAllConnections();
    backend.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => gateway.close(resolve)),
      new Promise((resolve) => backend.close(resolve)),
    ]);
  }
});

test('Gateway begrenzt unbekannte Widerrufe pro IP und global; nur feste Routen', async () => {
  let forwarded = 0;
  const backend = createServer((_request, response) => {
    forwarded++;
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"revoked":true}');
  });
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address();
  assert.ok(address && typeof address !== 'string');
  const server = createPushGateway({
    commit: 'a'.repeat(40),
    upstream: `http://127.0.0.1:${address.port}`,
    perIp: 2,
    global: 3,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const gateway = server.address();
  assert.ok(gateway && typeof gateway !== 'string');
  const url = `http://127.0.0.1:${gateway.port}`;
  try {
    const send = (ip: string, body = '{}', path = 'push-revoke') =>
      fetch(`${url}/functions/v1/${path}`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip, 'Content-Type': 'application/json' },
        body,
      });
    assert.equal((await send('a', 'x'.repeat(513))).status, 413);
    assert.equal((await send('a', '{}', 'evil')).status, 404);
    assert.equal((await send('a')).status, 200);
    assert.equal((await send('a')).status, 200);
    assert.equal((await send('a')).status, 429);
    assert.equal((await send('b')).status, 200);
    assert.equal((await send('c')).status, 429);
    assert.equal(forwarded, 3);
    const health = await (await fetch(`${url}/healthz`)).json();
    assert.equal(health.commit, 'a'.repeat(40));
  } finally {
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => backend.close(resolve)),
    ]);
  }
});
