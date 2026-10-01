import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createDeletionHandler } from './handler.ts';

test('Löschungen erfordern eine gültige Signatur, prüfen den Nutzer und sind wiederholbar', async () => {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const removed: string[] = [];
  const handler = createDeletionHandler(
    'x'.repeat(32),
    'https://db.example.test/deletion',
    async () => publicKey,
    async (id) => {
      removed.push(id);
    },
  );
  const payload = JSON.stringify({
    metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' },
    notification: { data: { userId: 'seller-a' } },
  });
  const signature = Buffer.from(
    JSON.stringify({
      kid: 'key-a',
      signature: sign('sha1', Buffer.from(payload), keys.privateKey).toString('base64'),
    }),
  ).toString('base64');
  const request = (body = payload, header = signature) =>
    new Request('https://db.example.test/deletion', {
      method: 'POST',
      headers: { 'x-ebay-signature': header },
      body,
    });
  assert.equal((await handler(request(payload.replace('seller-a', 'seller-b')))).status, 412);
  assert.deepEqual(removed, []);
  assert.equal((await handler(request())).status, 204);
  assert.equal((await handler(request())).status, 204);
  assert.deepEqual(removed, ['seller-a', 'seller-a']);
  assert.equal((await handler(request(payload, ''))).status, 412);
});
test('eBay kann eine fehlgeschlagene Datenbanklöschung wiederholen', async () => {
  const handler = createDeletionHandler(
    'x'.repeat(32),
    'https://db.example.test/deletion',
    async () => {
      throw new Error('Database unavailable');
    },
    async () => {},
  );
  const header = Buffer.from(JSON.stringify({ kid: 'key-a', signature: 'anything' })).toString(
    'base64',
  );
  const response = await handler(
    new Request('https://db.example.test/deletion', {
      method: 'POST',
      headers: { 'x-ebay-signature': header },
      body: '{}',
    }),
  );
  assert.equal(response.status, 503);
});
