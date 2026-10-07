import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  MarketplaceOperationEvents,
  type MarketplaceOperationEvent,
} from '../src/marketplace-operation-events.ts';

test('browser diagnoses contain only fixed categories and a bounded history', () => {
  const lines: string[] = [];
  const write = mock.method(process.stdout, 'write', (line: string) => {
    lines.push(line);
    return true;
  });
  try {
    new MarketplaceOperationEvents().record({
      operationId: 'fixture',
      stage: 'profile',
      outcome: 'failed',
      elapsedMs: 2,
      browserReadFailures: [
        'navigation',
        'private-token-and-response',
        ...Array(10).fill('closed'),
      ],
    } as MarketplaceOperationEvent);
  } finally {
    write.mock.restore();
  }
  const line = lines[0];
  assert.ok(line);
  const logged = JSON.parse(line);
  assert.deepEqual(logged.browserReadFailures, ['navigation', ...Array(7).fill('closed')]);
  assert.equal(lines[0]?.includes('private-token'), false);
});
