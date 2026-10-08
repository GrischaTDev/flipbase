import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { IncomingMessage, type ClientRequest } from 'node:http';
import type { request } from 'node:https';
import { Socket } from 'node:net';
import { Duplex } from 'node:stream';
import { test } from 'node:test';
import { GoLoginSessionProxy } from '../src/gologin-session-proxy.ts';

class FixtureSocket extends Duplex {
  output = '';
  _read() {
    // Die synthetische Gegenstelle liefert keine eigenen Nutzdaten.
  }
  _write(chunk: Buffer, _encoding: string, complete: () => void) {
    this.output += chunk.toString();
    complete();
  }
}

function fixture() {
  let now = 1000;
  const endpoints: URL[] = [];
  const requests: (EventEmitter & { destroy(): void; end(): void })[] = [];
  const proxy = new GoLoginSessionProxy({
    now: () => now,
    request: ((endpoint: URL) => {
      endpoints.push(endpoint);
      const upstream = Object.assign(new EventEmitter(), {
        destroy: () => undefined,
        end: () => undefined,
      });
      requests.push(upstream);
      return upstream as unknown as ClientRequest;
    }) as typeof request,
  });
  const upgrade = (endpoint: string, address = '172.30.88.128') => {
    const network = new Socket();
    Object.defineProperty(network, 'remoteAddress', { value: address });
    const incoming = new IncomingMessage(network);
    incoming.url = new URL(endpoint).pathname;
    incoming.headers = { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' };
    const socket = new FixtureSocket();
    proxy.server.emit('upgrade', incoming, socket, Buffer.alloc(0));
    return socket;
  };
  return {
    proxy,
    upgrade,
    endpoints,
    requests,
    expire: () => {
      now += 12 * 60_000;
    },
  };
}

test('GoLogin channel pins one profile and never forwards provider credentials or headers', async () => {
  const { proxy, upgrade, endpoints, requests } = fixture();
  const session = proxy.open('account-a', 'global-fixture-key');
  assert.equal(session.endpoint.includes('global-fixture-key'), false);
  assert.equal(session.endpoint.includes('account-a'), false);
  assert.throws(() => proxy.open('account-b', 'global-fixture-key'));
  const socket = upgrade(session.endpoint);
  assert.equal(endpoints[0]?.origin, 'https://cloudbrowser.gologin.com');
  assert.equal(endpoints[0]?.searchParams.get('profile'), 'account-a');
  assert.equal(endpoints[0]?.searchParams.get('token'), 'global-fixture-key');
  const remote = new FixtureSocket();
  requests[0]?.emit(
    'upgrade',
    {
      headers: {
        'sec-websocket-accept': 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
        'x-provider-token': 'global-fixture-key',
        location: 'https://private.fixture/',
      },
    },
    remote,
    Buffer.alloc(0),
  );
  assert.match(socket.output, /^HTTP\/1.1 101/);
  assert.equal(socket.output.includes('global-fixture-key'), false);
  assert.equal(socket.output.includes('private.fixture'), false);
  session.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(socket.destroyed, true);
  assert.equal(remote.destroyed, true);
  assert.equal(upgrade(session.endpoint).destroyed, true);
});

test('GoLogin denies foreign sources, modified capabilities, expired channels and excess sockets', () => {
  const { proxy, upgrade, endpoints, expire } = fixture();
  const session = proxy.open('account-a', 'fixture-key');
  for (const address of ['172.30.88.2', '172.30.88.3', '127.0.0.1', '172.30.88.255'])
    assert.equal(upgrade(session.endpoint, address).destroyed, true);
  assert.equal(upgrade(session.endpoint + '/account-b').destroyed, true);
  assert.equal(endpoints.length, 0);
  upgrade(session.endpoint);
  upgrade(session.endpoint);
  assert.equal(upgrade(session.endpoint).destroyed, true);
  assert.equal(endpoints.length, 2);
  expire();
  assert.equal(upgrade(session.endpoint).destroyed, true);
  session.close();
});
