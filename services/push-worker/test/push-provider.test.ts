import assert from 'node:assert/strict';
import test from 'node:test';
import webPush from 'web-push';
const { generateVAPIDKeys } = webPush;
import {
  createPushProvider,
  isPublicAddress,
  normalizeRetryAfter,
  validateEndpoint,
} from '../src/push-provider.ts';

test('sichtbare Systemmeldungen fordern sofortige Zustellung auch bei ruhendem Gerät an', async () => {
  const keys = generateVAPIDKeys();
  let requestHeaders: Record<string, string | number> | undefined;
  const provider = createPushProvider(
    { ...keys, subject: 'mailto:push@example.test' },
    {
      resolve: async () => [{ address: '8.8.8.8', family: 4 }],
      post: async (_endpoint, _address, details) => {
        requestHeaders = details.headers;
        return { status: 201 };
      },
    },
  );
  assert.equal(
    (
      await provider.send(
        {
          endpoint: 'https://fcm.googleapis.com/test',
          p256dh: keys.publicKey,
          auth: Buffer.alloc(16, 1).toString('base64url'),
        },
        '{"category":"message"}',
      )
    ).status,
    'accepted',
  );
  assert.equal(requestHeaders?.['Urgency'], 'high');
  assert.equal(requestHeaders?.['TTL'], 86400);
});

test('nur HTTPS-Anbieter ohne alternative Ports, Credentials oder Redirectziele', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/a',
    'https://fcm.googleapis.com.evil.test/a',
    'https://127.0.0.1/a',
    'https://localhost/a',
    'https://fcm.googleapis.com:8443/a',
    'https://a@fcm.googleapis.com/a',
    'https://fcm.googleapis.com/a#x',
    'https://notify.windows.com/a',
  ]) {
    assert.throws(() => validateEndpoint(endpoint));
  }
  for (const host of [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
    'wns2-par02p.notify.windows.com',
  ])
    assert.equal(validateEndpoint(`https://${host}/a`).hostname, host);
});
test('DNS: IPv4, IPv6 und IPv4-mapped private Ziele verweigert', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2001:db8::1',
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '142.250.1.1', '2606:4700::1111'])
    assert.equal(isPublicAddress(address), true, address);
});
test('Retry-After Sekunden, Datum, ungueltig und zu lang', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  assert.equal(normalizeRetryAfter('120', now), 120000);
  assert.equal(normalizeRetryAfter('Tue, 13 Oct 2026 12:01:00 GMT', now), 60000);
  assert.equal(normalizeRetryAfter('yesterday', now), undefined);
  assert.equal(normalizeRetryAfter('-1', now), undefined);
});
test('Anbieterstatus 404/410, 429/5xx, 401/403 und Redirect', async () => {
  const keys = generateVAPIDKeys();
  const config = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: 'mailto:push@example.test',
  };
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/a',
    p256dh: keys.publicKey,
    auth: Buffer.alloc(16, 1).toString('base64url'),
  };
  for (const [status, expected] of [
    [201, 'accepted'],
    [404, 'expired'],
    [410, 'expired'],
    [429, 'retry'],
    [503, 'retry'],
    [401, 'configuration_error'],
    [403, 'configuration_error'],
    [302, 'configuration_error'],
  ] as const) {
    const provider = createPushProvider(config, {
      resolve: async () => [{ address: '8.8.8.8', family: 4 }],
      post: async () => ({ status, retryAfter: '12' }),
    });
    const result = await provider.send(subscription, '{}');
    assert.equal(result.status, expected);
    if (result.status === 'retry') assert.equal(result.retryAfterMs, 12000);
  }
});
test('DNS-Rebinding und ungepruefte URLs erreichen Transport niemals', async () => {
  let sends = 0;
  const keys = generateVAPIDKeys();
  const provider = createPushProvider(
    { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:push@example.test' },
    {
      resolve: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
      post: async () => {
        sends++;
        return { status: 201 };
      },
    },
  );
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/a',
    p256dh: keys.publicKey,
    auth: Buffer.alloc(16, 1).toString('base64url'),
  };
  assert.equal((await provider.send(subscription, '{}')).status, 'configuration_error');
  assert.equal(
    (await provider.send({ ...subscription, endpoint: 'https://evil.test/a' }, '{}')).status,
    'configuration_error',
  );
  assert.equal(sends, 0);
});

test('zehn Sekunden begrenzen auch haengende DNS-Aufloesung', async () => {
  const keys = generateVAPIDKeys();
  const provider = createPushProvider(
    { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:push@example.test' },
    { resolve: () => new Promise(() => undefined) },
  );
  const keepAlive = setTimeout(() => undefined, 15000);
  try {
    const started = Date.now();
    assert.deepEqual(
      await provider.send(
        {
          endpoint: 'https://fcm.googleapis.com/a',
          p256dh: keys.publicKey,
          auth: Buffer.alloc(16, 1).toString('base64url'),
        },
        '{}',
      ),
      { status: 'retry' },
    );
    assert.ok(Date.now() - started >= 9900);
    assert.ok(Date.now() - started < 14000);
  } finally {
    clearTimeout(keepAlive);
  }
});
