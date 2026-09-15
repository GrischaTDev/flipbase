import { describe, expect, it, vi } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import { isDue, QueryStore } from '../../src/store/query.store.js';

function query(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'q1',
    queryKey: 'vinted|search=test',
    marketplace: 'vinted',
    searchText: 'test',
    catalogId: null,
    brandId: null,
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

describe('isDue', () => {
  it('is due when never polled', () => {
    expect(isDue(query({ lastPolledAt: null }), new Date())).toBe(true);
  });

  it('is not due when interval has not elapsed', () => {
    const now = new Date(1_000_000);
    const lastPolled = new Date(1_000_000 - 30_000).toISOString();
    expect(isDue(query({ lastPolledAt: lastPolled, pollIntervalMs: 60_000 }), now)).toBe(false);
  });

  it('is due when normal interval has elapsed', () => {
    const now = new Date(1_000_000);
    const lastPolled = new Date(1_000_000 - 61_000).toISOString();
    expect(isDue(query({ lastPolledAt: lastPolled, pollIntervalMs: 60_000 }), now)).toBe(true);
  });

  it('is not due when runState is blocked or invalid', () => {
    const now = new Date(1_000_000);
    expect(isDue(query({ runState: 'blocked', lastPolledAt: null }), now)).toBe(false);
    expect(isDue(query({ runState: 'invalid', lastPolledAt: null }), now)).toBe(false);
  });

  it('respects nextAttemptAt over pollIntervalMs', () => {
    const now = new Date(1_000_000);
    const future = new Date(1_050_000).toISOString();
    const past = new Date(950_000).toISOString();

    // In future: not due even if pollInterval has passed
    expect(isDue(query({ nextAttemptAt: future, lastPolledAt: null }), now)).toBe(false);

    // Reached / in past: due
    expect(isDue(query({ nextAttemptAt: past, lastPolledAt: null }), now)).toBe(true);
  });

  it('applies exponential backoff on rate_limited status', () => {
    const now = new Date(1_000_000);
    // 1 failure -> 2 minutes backoff (120,000 ms)
    const polled1mAgo = new Date(1_000_000 - 65_000).toISOString();
    const polled2mAgo = new Date(1_000_000 - 125_000).toISOString();

    const q = query({
      lastPolledAt: polled1mAgo,
      pollIntervalMs: 30_000,
      lastStatus: 'rate_limited',
      consecutiveFailures: 1,
    });

    expect(isDue(q, now)).toBe(false);
    expect(isDue({ ...q, lastPolledAt: polled2mAgo }, now)).toBe(true);
  });

  it('applies exponential backoff on forbidden status', () => {
    const now = new Date(1_000_000);
    // 2 consecutive failures -> 4 minutes backoff (240,000 ms)
    const polled3mAgo = new Date(1_000_000 - 180_000).toISOString();
    const polled4mAgo = new Date(1_000_000 - 245_000).toISOString();

    const q = query({
      lastPolledAt: polled3mAgo,
      pollIntervalMs: 30_000,
      lastStatus: 'forbidden',
      consecutiveFailures: 2,
    });

    expect(isDue(q, now)).toBe(false);
    expect(isDue({ ...q, lastPolledAt: polled4mAgo }, now)).toBe(true);
  });

  it('caps exponential backoff at 10 minutes', () => {
    const now = new Date(2_000_000);
    const polled9mAgo = new Date(2_000_000 - 540_000).toISOString();
    const polled10mAgo = new Date(2_000_000 - 605_000).toISOString();

    const q = query({
      lastPolledAt: polled9mAgo,
      pollIntervalMs: 30_000,
      lastStatus: 'forbidden',
      consecutiveFailures: 10,
    });

    expect(isDue(q, now)).toBe(false);
    expect(isDue({ ...q, lastPolledAt: polled10mAgo }, now)).toBe(true);
  });
});

describe('QueryStore database operations', () => {
  it('recordSuccess updates operational state without touching is_active', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const client = {
      from: vi.fn().mockReturnValue({ update }),
    };
    const store = new QueryStore(client as never);
    const now = new Date('2026-09-15T12:00:00Z');

    await store.recordSuccess('q1', now);

    expect(client.from).toHaveBeenCalledWith('sniper_queries');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        run_state: 'ready',
        next_attempt_at: null,
        last_status: 'ok',
        consecutive_failures: 0,
      }),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ is_active: expect.anything() }),
    );
  });

  it('recordFailure updates run_state, next_attempt_at and error details without touching is_active', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const client = {
      from: vi.fn().mockReturnValue({ update }),
    };
    const store = new QueryStore(client as never);
    const now = new Date('2026-09-15T12:00:00Z');
    const nextAttempt = new Date('2026-09-15T12:05:00Z');

    await store.recordFailure(
      'q1',
      {
        runState: 'cooldown',
        nextAttemptAt: nextAttempt,
        errorKind: 'rate_limited',
        errorMessage: 'Rate limit hit',
        consecutiveFailures: 3,
      },
      now,
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        run_state: 'cooldown',
        next_attempt_at: nextAttempt.toISOString(),
        last_error_kind: 'rate_limited',
        last_status: 'rate_limited',
        consecutive_failures: 3,
      }),
    );
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ is_active: expect.anything() }),
    );
  });
});
