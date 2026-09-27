import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedPublicRequest } from '../src/local-playwright-request-policy.ts';

test('allows only read requests to public Vinted hosts', () => {
  assert.equal(allowedPublicRequest('https://www.vinted.de/member/123-test', 'GET'), true);
  assert.equal(allowedPublicRequest('https://images1.vinted.net/image.jpg', 'HEAD'), true);
  assert.equal(allowedPublicRequest('https://www.vinted.de/api', 'POST'), false);
  assert.equal(allowedPublicRequest('https://127.0.0.1/internal', 'GET'), false);
  assert.equal(allowedPublicRequest('http://www.vinted.de/member/123-test', 'GET'), false);
  assert.equal(allowedPublicRequest('https://www.vinted.de.evil.test/', 'GET'), false);
  assert.equal(allowedPublicRequest('https://other.test/', 'GET'), false);
});
