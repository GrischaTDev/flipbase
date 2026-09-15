import { describe, expect, it, vi } from 'vitest';
import { VintedConnectionState } from '../../src/runtime/vinted-connection-state.js';
import { VintedCollector } from '../../src/vinted/collector.js';
import type { SniperQuery } from '../../src/domain/query.js';
import { catalogPage } from '../vinted/support/catalog-page.js';

const query: SniperQuery = {
  id: 'q1',
  queryKey: 'vinted|search=nike|catalog=-|brand=-|price_from=-|price_to=-',
  marketplace: 'vinted',
  searchText: 'nike',
  catalogId: null,
  brandId: null,
  priceTo: null,
  priceFrom: null,
  pollIntervalMs: 60000,
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
};

function catalog(): Response {
  return new Response(catalogPage(), { status: 200 });
}

describe('VintedConnectionState', () => {
  it('starts a streak at the first successful Vinted operation', () => {
    const state = new VintedConnectionState();
    const firstSuccess = new Date('2026-09-15T10:00:00.000Z');

    state.recordSuccess(firstSuccess);

    expect(state.snapshot()).toEqual({
      connectedSince: firstSuccess,
      lastSuccessAt: firstSuccess,
    });
  });

  it('keeps the start of an uninterrupted streak across later successes', () => {
    const state = new VintedConnectionState();
    const firstSuccess = new Date('2026-09-15T10:00:00.000Z');
    const laterSuccess = new Date('2026-09-15T10:05:00.000Z');

    state.recordSuccess(firstSuccess);
    state.recordSuccess(laterSuccess);

    expect(state.snapshot()).toEqual({
      connectedSince: firstSuccess,
      lastSuccessAt: laterSuccess,
    });
  });

  it('ends the streak on a failed operation and starts a new one after recovery', () => {
    const state = new VintedConnectionState();
    const firstSuccess = new Date('2026-09-15T10:00:00.000Z');
    const recovery = new Date('2026-09-15T10:08:00.000Z');

    state.recordSuccess(firstSuccess);
    state.recordFailure();
    expect(state.snapshot()).toEqual({ connectedSince: null, lastSuccessAt: null });

    state.recordSuccess(recovery);
    expect(state.snapshot()).toEqual({ connectedSince: recovery, lastSuccessAt: recovery });
  });

  it('connects and disconnects from the real collector result', async () => {
    const state = new VintedConnectionState();
    const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const collector = new VintedCollector(options, fetchFn, async () => undefined, state);

    await collector.collect(query);
    expect(state.snapshot().connectedSince).not.toBeNull();

    await expect(collector.collect(query)).rejects.toThrow();
    expect(state.snapshot()).toEqual({ connectedSince: null, lastSuccessAt: null });
  });
});
