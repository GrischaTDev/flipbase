import { describe, expect, it } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import { evaluateFailure } from '../../src/runtime/retry-policy.js';
import {
  ForbiddenError,
  RateLimitedError,
  UnauthorizedError,
  VintedParserError,
  VintedServerError,
  VintedTimeoutError,
} from '../../src/vinted/errors.js';

function makeQuery(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'q-test',
    queryKey: 'vinted|search=test',
    marketplace: 'vinted',
    searchText: 'test',
    catalogId: null,
    brandId: 14,
    priceTo: null,
    priceFrom: null,
    pollIntervalMs: 60_000,
    isSeeded: true,
    isActive: true,
    runState: 'ready',
    nextAttemptAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorKind: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastPolledAt: null,
    lastStatus: 'never_polled',
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe('evaluateFailure', () => {
  const NOW = new Date('2026-09-15T12:00:00.000Z');

  it('handles 429 with explicit retryAfterSeconds', () => {
    const error = new RateLimitedError('Too many requests', { retryAfterSeconds: 120 });
    const decision = evaluateFailure(error, makeQuery(), NOW);

    expect(decision.runState).toBe('cooldown');
    expect(decision.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:02:00.000Z');
    expect(decision.errorKind).toBe('rate_limited');
    expect(decision.consecutiveFailures).toBe(1);
    expect(decision.originUpdate).toBeDefined();
    expect(decision.originUpdate?.state).toBe('cooldown');
    expect(decision.originUpdate?.blockedUntil?.toISOString()).toBe('2026-09-15T12:02:00.000Z');
  });

  it('handles 429 without retryAfterSeconds using exponential backoff', () => {
    const error = new RateLimitedError('Rate limited');
    const d1 = evaluateFailure(error, makeQuery({ consecutiveFailures: 0 }), NOW);
    expect(d1.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:01:00.000Z'); // 60s

    const d2 = evaluateFailure(error, makeQuery({ consecutiveFailures: 1 }), NOW);
    expect(d2.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:02:00.000Z'); // 120s

    const d3 = evaluateFailure(error, makeQuery({ consecutiveFailures: 2 }), NOW);
    expect(d3.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:04:00.000Z'); // 240s
  });

  it('handles 403 by marking runState as blocked and origin as blocked', () => {
    const error = new ForbiddenError('Cloudflare challenge detected');
    const decision = evaluateFailure(error, makeQuery(), NOW);

    expect(decision.runState).toBe('blocked');
    expect(decision.nextAttemptAt).toBeNull();
    expect(decision.errorKind).toBe('forbidden');
    expect(decision.consecutiveFailures).toBe(1);
    expect(decision.originUpdate?.state).toBe('blocked');
    expect(decision.originUpdate?.blockedUntil).toBeNull();
  });

  it('handles 401 with short cooldown', () => {
    const error = new UnauthorizedError('Session expired');
    const decision = evaluateFailure(error, makeQuery(), NOW);

    expect(decision.runState).toBe('cooldown');
    expect(decision.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:00:30.000Z'); // +30s
    expect(decision.errorKind).toBe('unauthorized');
    expect(decision.originUpdate).toBeUndefined();
  });

  it('handles 5xx server errors with progressive backoff', () => {
    const error = new VintedServerError(503, 'Service unavailable');
    const d1 = evaluateFailure(error, makeQuery({ consecutiveFailures: 0 }), NOW);
    expect(d1.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:00:30.000Z'); // 30s

    const d2 = evaluateFailure(error, makeQuery({ consecutiveFailures: 1 }), NOW);
    expect(d2.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:01:00.000Z'); // 60s

    const d3 = evaluateFailure(error, makeQuery({ consecutiveFailures: 2 }), NOW);
    expect(d3.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:02:00.000Z'); // 120s
  });

  it('handles timeout error', () => {
    const error = new VintedTimeoutError('Read timeout');
    const decision = evaluateFailure(error, makeQuery(), NOW);

    expect(decision.runState).toBe('cooldown');
    expect(decision.errorKind).toBe('timeout');
  });

  it('handles parser error with 5-minute cooldown', () => {
    const error = new VintedParserError('Malformed HTML');
    const decision = evaluateFailure(error, makeQuery(), NOW);

    expect(decision.runState).toBe('cooldown');
    expect(decision.nextAttemptAt?.toISOString()).toBe('2026-09-15T12:05:00.000Z'); // +5m
    expect(decision.errorKind).toBe('parser_error');
  });
});
