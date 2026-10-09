import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLocalExtensionHandler,
  hashLocalExtensionSecret,
  LocalExtensionStoreError,
} from './handler.ts';
import { parseLocalExtensionRequest } from '../_shared/marketplace-local-extension-contracts.ts';
import type { LocalExtensionRequest } from '../_shared/marketplace-local-extension-contracts.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const attempt = {
  ...scope,
  jobId: '9007199254740999',
  claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};
const result = {
  outcome: 'confirmed',
  action: 'publish',
  externalId: '98765',
  externalAccountId: '12345',
  providerState: 'processing',
  verifiedAt: '2026-10-10T12:00:00.000Z',
};
const secret = 'ab'.repeat(32);
function request(body: unknown) {
  return new Request('https://fixture.test', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + secret,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('listing requests preserve text identifiers and reach only their separate store', async () => {
  const received: LocalExtensionRequest[] = [];
  const handler = createLocalExtensionHandler({
    ingest: () => assert.fail('wrong importer'),
    negotiation: () => assert.fail('wrong negotiation'),
    messageClaim: () => assert.fail('wrong messages'),
    listings: async (tokenHash, input) => {
      assert.equal(tokenHash, await hashLocalExtensionSecret(secret));
      received.push(input);
      return { ok: true };
    },
  });
  const payloads = [
    { ...scope, action: 'listing_claim' },
    { ...attempt, action: 'listing_check' },
    { ...attempt, action: 'listing_begin' },
    { ...attempt, action: 'listing_finish', result },
    {
      ...attempt,
      action: 'listing_finish',
      result: { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' },
    },
  ];
  for (const payload of payloads) {
    assert.equal((await handler(request(payload))).status, 200);
  }
  assert.deepEqual(received, payloads);
});
test('listing inputs reject commands, numeric IDs and invalid attempts before store access', async () => {
  let calls = 0;
  const handler = createLocalExtensionHandler({
    ingest: () => assert.fail(),
    listings: () => {
      calls++;
      return Promise.resolve({});
    },
  });
  for (const body of [
    { ...scope, action: 'listing_claim', snapshot: {} },
    { ...scope, action: 'listing_claim', jobId: attempt.jobId },
    { ...attempt, action: 'listing_check', jobId: Number(attempt.jobId) },
    { ...attempt, action: 'listing_begin', jobId: '9223372036854775808' },
    { ...attempt, action: 'listing_check', claimToken: null },
    { ...attempt, action: 'listing_begin', result },
    { ...attempt, action: 'listing_finish' },
  ]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(calls, 0);
});
test('provider results require exact evidence and the state belonging to their action', () => {
  for (const invalid of [
    { ...result, externalId: 98765 },
    { ...result, externalAccountId: '' },
    { ...result, providerState: 'draft' },
    { ...result, providerState: ['active'] },
    { ...result, action: 'vinted_draft' },
    { ...result, verifiedAt: '2026-02-30T12:00:00.000Z' },
    { ...result, verifiedAt: '2026-10-10T12:00:00Z' },
    { ...result, cookies: 'private' },
    { outcome: 'failed', errorCode: 'bad-code' },
    { outcome: 'outcome_unknown', errorCode: 'timeout', externalId: '42' },
  ]) {
    assert.equal(
      parseLocalExtensionRequest({
        ...attempt,
        action: 'listing_finish',
        result: invalid,
      }),
      null,
    );
  }
  const draft = { ...result, action: 'vinted_draft', providerState: 'draft' };
  assert.deepEqual(
    parseLocalExtensionRequest({
      ...attempt,
      action: 'listing_finish',
      result: draft,
    }),
    { ...attempt, action: 'listing_finish', result: draft },
  );
});
test('an unavailable listing store cannot fall through into an importer', async () => {
  const handler = createLocalExtensionHandler({
    ingest: () => assert.fail('wrong importer'),
  });
  assert.equal((await handler(request({ ...scope, action: 'listing_claim' }))).status, 503);
});
test('listing authorization, conflicts and unavailability retain safe HTTP errors', async () => {
  for (const [error, status, message] of [
    [new LocalExtensionStoreError('access'), 401, 'unauthorized'],
    [new LocalExtensionStoreError('conflict'), 409, 'conflict'],
    [new LocalExtensionStoreError('invalid'), 400, 'invalid_request'],
    [new Error('private token or provider response'), 503, 'unavailable'],
  ] as const) {
    const handler = createLocalExtensionHandler({
      ingest: () => assert.fail(),
      listings: () => Promise.reject(error),
    });
    const response = await handler(request({ ...attempt, action: 'listing_finish', result }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: message });
  }
});
