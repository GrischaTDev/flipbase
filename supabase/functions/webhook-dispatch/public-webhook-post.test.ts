import assert from 'node:assert/strict';
import { isPublicIpv4, postPublicWebhook, type WebhookTransport } from './public-webhook-post.ts';

Deno.test(
  'Eigene Webhooks sperren private, lokale, reservierte und gemischte DNS-Antworten',
  async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '198.18.0.1',
      '192.0.0.9',
      '224.0.0.1',
      '0.0.0.0',
      '203.0.113.1',
      '::1',
      '::ffff:127.0.0.1',
    ]) {
      assert.equal(isPublicIpv4(address), false);
      let connections = 0;
      const network: WebhookTransport = {
        resolve: async () => ['8.8.8.8', address],
        connect: async () => {
          connections++;
          throw new Error();
        },
      };
      await assert.rejects(postPublicWebhook('https://hooks.example.org/event', {}, network));
      assert.equal(connections, 0);
    }
  },
);
Deno.test(
  'URL-Parservarianten, Benutzerinfos, Klartext und Sonderports sind gesperrt',
  async () => {
    for (const target of [
      'http://example.org',
      'https://127.1/',
      'https://0x7f000001/',
      'https://[::1]/',
      'https://user:secret@example.org/',
      'https://example.org:8080/',
      'https://x.local/',
      'https://example.org/#fragment',
    ])
      await assert.rejects(postPublicWebhook(target, {}));
  },
);
Deno.test(
  'Versand benutzt die geprüfte IP und den ursprünglichen TLS-Host, ohne zweite DNS-Auflösung',
  async () => {
    let resolved = 0;
    const written: Uint8Array[] = [];
    let closed = false;
    const network: WebhookTransport = {
      resolve: async () => {
        resolved++;
        return ['8.8.8.8'];
      },
      connect: async (address, hostname) => {
        assert.equal(address, '8.8.8.8');
        assert.equal(hostname, 'hooks.example.org');
        return {
          write: async (bytes) => {
            written.push(bytes);
            return bytes.length;
          },
          read: async (bytes) => {
            const response = new TextEncoder().encode(
              'HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n',
            );
            bytes.set(response);
            return response.length;
          },
          close: () => {
            closed = true;
          },
        };
      },
    };
    await postPublicWebhook(
      'https://hooks.example.org/event?key=secret',
      { message: 'Test' },
      network,
    );
    assert.equal(resolved, 1);
    assert.equal(closed, true);
    assert.ok(
      new TextDecoder()
        .decode(written[0])
        .startsWith('POST /event?key=secret HTTP/1.1\r\nHost: hooks.example.org'),
    );
  },
);
Deno.test('Umleitungen ins interne Netz werden nicht verfolgt', async () => {
  let connections = 0;
  const network: WebhookTransport = {
    resolve: async () => ['8.8.8.8'],
    connect: async () => {
      connections++;
      return {
        write: async (bytes) => bytes.length,
        read: async (bytes) => {
          const response = new TextEncoder().encode(
            'HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/\r\n\r\n',
          );
          bytes.set(response);
          return response.length;
        },
        close: () => {},
      };
    },
  };
  await assert.rejects(postPublicWebhook('https://hooks.example.org/event', {}, network));
  assert.equal(connections, 1);
});
