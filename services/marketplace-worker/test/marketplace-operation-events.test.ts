import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  MarketplaceOperationEvents,
  type MarketplaceOperationEvent,
} from '../src/marketplace-operation-events.ts';

test('source diagnostics retain only bounded categories and HTTP status without identifiers or content', () => {
  const lines: string[] = [];
  const write = mock.method(process.stdout, 'write', (line: string) => {
    lines.push(line);
    return true;
  });
  try {
    new MarketplaceOperationEvents().record({
      operationId: 'fixture',
      stage: 'cleanup',
      outcome: 'completed',
      elapsedMs: 1,
      sourceReadFailures: [
        { area: 'messages', issue: 'http_status', status: 404, url: 'private-url-and-token' },
        { area: 'messages', issue: 'private-provider-response' },
        ...Array(10).fill({ area: 'messages', issue: 'http_status', status: 404 }),
      ],
    } as MarketplaceOperationEvent);
  } finally {
    write.mock.restore();
  }
  assert.deepEqual(
    JSON.parse(lines[0] ?? '{}').sourceReadFailures,
    Array(8).fill({ area: 'messages', issue: 'http_status', status: 404 }),
  );
  assert.equal(lines[0]?.includes('private-'), false);
});

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

test('session navigation diagnoses remain visible without accepting provider details', () => {
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
        'navigation_interrupted',
        'navigation_aborted',
        'timeout',
        'network',
        'private-provider-response',
      ],
    } as MarketplaceOperationEvent);
  } finally {
    write.mock.restore();
  }
  assert.deepEqual(JSON.parse(lines[0] ?? '{}').browserReadFailures, [
    'navigation_interrupted',
    'navigation_aborted',
    'timeout',
    'network',
  ]);
  assert.equal(lines[0]?.includes('private-provider-response'), false);
});
