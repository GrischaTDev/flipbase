import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createPushGateway } from '../src/push-gateway.ts';

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
