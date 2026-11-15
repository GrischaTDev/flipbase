import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveAiConnectionRequestId } from './request-id.ts';

test('resuming a photo transfer keeps child requests stable and separates each operation', async () => {
  const id = '78000000-0000-4000-8000-000000000001';
  const first = await deriveAiConnectionRequestId(id, 'reserve-original', 0);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, await deriveAiConnectionRequestId(id, 'reserve-original', 0));
  assert.notEqual(first, await deriveAiConnectionRequestId(id, 'commit-original', 0));
  assert.notEqual(first, await deriveAiConnectionRequestId(id, 'reserve-original', 1));
});
