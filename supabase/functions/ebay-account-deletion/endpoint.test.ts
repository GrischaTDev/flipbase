import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { createDeletionEndpoint } from './endpoint.ts';
import { deletionChallenge } from '../_shared/ebay-notifications.ts';

const verificationToken = 'x'.repeat(32);
const endpoint = 'https://api.example.test/functions/v1/ebay-account-deletion';
const environment: Record<string, string> = {
  EBAY_DELETION_VERIFICATION_TOKEN: verificationToken,
  EBAY_DELETION_ENDPOINT: endpoint,
};

test('Löschendpoint lässt sich vor Freischaltung des Keysets bestätigen', async () => {
  const removed: string[] = [];
  const handler = createDeletionEndpoint(
    (name) => environment[name],
    async (id) => {
      removed.push(id);
    },
  );
  const response = await handler(new Request(`${endpoint}?challenge_code=setup-check`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    challengeResponse: deletionChallenge('setup-check', verificationToken, endpoint),
  });
  assert.deepEqual(removed, []);
});

test('Ohne Kontokonfiguration werden Löschmeldungen abgewiesen und bleiben wiederholbar', async () => {
  const removed: string[] = [];
  const handler = createDeletionEndpoint(
    (name) => environment[name],
    async (id) => {
      removed.push(id);
    },
  );
  const request = (signature?: string) =>
    new Request(endpoint, {
      method: 'POST',
      headers: signature ? { 'x-ebay-signature': signature } : {},
      body: '{}',
    });
  assert.equal((await handler(request())).status, 412);
  const signature = Buffer.from(JSON.stringify({ kid: 'key-a', signature: 'invalid' })).toString(
    'base64',
  );
  assert.equal((await handler(request(signature))).status, 503);
  assert.deepEqual(removed, []);
});

test('Fehlender Verifikationstoken sperrt auch die Bestätigung', async () => {
  const handler = createDeletionEndpoint(
    () => undefined,
    async () => {
      assert.fail('Keine Löschung ohne Konfiguration');
    },
  );
  assert.equal((await handler(new Request(`${endpoint}?challenge_code=setup-check`))).status, 503);
});

test('Unsichere oder ungültige Löschendpoints bleiben gesperrt', async () => {
  for (const invalidEndpoint of [
    'https://',
    'http://api.example.test/deletion',
    'https://user:password@api.example.test/deletion',
    'https://api.example.test/deletion?secret=value',
    'https://api.example.test/deletion#fragment',
  ]) {
    const handler = createDeletionEndpoint(
      (name) => (name === 'EBAY_DELETION_ENDPOINT' ? invalidEndpoint : environment[name]),
      async () => {
        assert.fail('Keine Löschung mit ungültiger Konfiguration');
      },
    );
    assert.equal(
      (await handler(new Request(`${endpoint}?challenge_code=setup-check`))).status,
      503,
    );
  }
});
