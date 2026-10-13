// deno-lint-ignore-file require-await
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPushRevokeHandler } from './handler.ts';
const generationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('offline revoke needs no JWT, hashes token and returns no binding oracle', async () => {
  let recorded = '';
  const handler = createPushRevokeHandler({
    origins: [],
    async revoke(id, hash) {
      assert.equal(id, generationId);
      recorded = hash;
    },
  });
  const request = (body: unknown) =>
    new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) });
  const result = await handler(
    request({ action: 'revoke_binding', generationId, token: '00'.repeat(32) }),
  );
  assert.equal(result.status, 200);
  assert.equal(recorded, '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925');
  const invalid = await handler(
    request({ action: 'register', generationId, token: '00'.repeat(32) }),
  );
  assert.equal(await result.text(), await invalid.text());
});
test('oversized streamed body is bounded', async () => {
  const handler = createPushRevokeHandler({
    origins: [],
    async revoke() {
      assert.fail();
    },
  });
  assert.equal(
    (await handler(new Request('https://example.test', { method: 'POST', body: 'a'.repeat(513) })))
      .status,
    503,
  );
});
