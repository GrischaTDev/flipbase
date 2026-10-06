import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { test } from 'node:test';
import { createProxyForwarder } from './proxy-forwarder.mjs';

async function fixture(t, handler) {
  const upstream = createServer(handler);
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const forwarder = createProxyForwarder({
    server: `http://127.0.0.1:${upstream.address().port}`,
    username: 'fixture-user',
    password: 'fixture-password',
  });
  forwarder.listen(0, '127.0.0.1');
  await once(forwarder, 'listening');
  t.after(() => {
    forwarder.closeAllConnections();
    forwarder.close();
    upstream.closeAllConnections();
    upstream.close();
  });
  return { upstream, forwarder, port: forwarder.address().port };
}

async function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const incoming = request({ host: '127.0.0.1', port, path, headers }, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    incoming.on('error', reject);
    incoming.end();
  });
}

test('HTTP goes through upstream with private credentials and corrected host', async (t) => {
  const { port } = await fixture(t, (incoming, response) => {
    assert.equal(incoming.url, 'http://example.com/fixture');
    assert.equal(incoming.headers.host, 'example.com');
    assert.equal(
      incoming.headers['proxy-authorization'],
      `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`,
    );
    response.end('upstream');
  });
  assert.deepEqual(await get(port, 'http://example.com/fixture', { host: 'wrong.invalid' }), {
    status: 200,
    body: 'upstream',
  });
});

test('CONNECT preserves tunneled bytes without decrypting TLS', async (t) => {
  const { port, upstream } = await fixture(t);
  upstream.on('connect', (incoming, socket, head) => {
    assert.equal(incoming.url, 'example.com:443');
    assert.match(incoming.headers['proxy-authorization'], /^Basic /);
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) socket.write(head);
    socket.pipe(socket);
  });
  const socket = connect(port, '127.0.0.1');
  t.after(() => socket.destroy());
  socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n');
  const [response] = await once(socket, 'data');
  assert.match(response.toString(), /^HTTP\/1.1 200/);
  socket.write('opaque-fixture');
  const [echo] = await once(socket, 'data');
  assert.equal(echo.toString(), 'opaque-fixture');
});

test('private destinations and credential-bearing target URLs are rejected', async (t) => {
  let calls = 0;
  const { port } = await fixture(t, (_incoming, response) => {
    calls++;
    response.end();
  });
  for (const target of [
    'http://127.0.0.1/',
    'http://169.254.169.254/',
    'http://172.30.88.2/',
    'http://10.0.0.1/',
    'http://localhost/',
    'http://user:password@example.com/',
    '/relative',
  ]) {
    assert.equal((await get(port, target)).status, 403);
  }
  assert.equal(calls, 0);
});

test('unavailable proxy fails closed and never returns credentials', async (t) => {
  const { port, upstream } = await fixture(t);
  await new Promise((resolve) => upstream.close(resolve));
  const result = await get(port, 'http://example.com/');
  assert.equal(result.status, 502);
  assert.doesNotMatch(result.body, /fixture-user|fixture-password|Basic/);
});

test('proxy authentication rejection is sanitized', async (t) => {
  const { port } = await fixture(t, (_incoming, response) => {
    response.writeHead(407, { 'Proxy-Authenticate': 'Basic fixture-user' });
    response.end('fixture-password');
  });
  const result = await get(port, 'http://example.com/');
  assert.equal(result.status, 502);
  assert.doesNotMatch(result.body, /fixture-user|fixture-password|Basic/);
});

test('private CONNECT targets are rejected without upstream access', async (t) => {
  const { port, upstream } = await fixture(t);
  let calls = 0;
  upstream.on('connect', (_incoming, socket) => {
    calls++;
    socket.destroy();
  });
  const socket = connect(port, '127.0.0.1');
  t.after(() => socket.destroy());
  socket.write('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n');
  const [response] = await once(socket, 'data');
  assert.match(response.toString(), /^HTTP\/1.1 403/);
  assert.equal(calls, 0);
});
