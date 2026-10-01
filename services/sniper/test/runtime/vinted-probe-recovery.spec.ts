import { describe, expect, it } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import type { OriginState } from '../../src/store/origin-state.store.js';
import { isDue } from '../../src/store/query.store.js';
import { RequestBudget } from '../../src/runtime/budget.js';
import { QueryScheduler, type OriginStateStoreLike } from '../../src/runtime/scheduler.js';
import { ForbiddenError } from '../../src/vinted/errors.js';

describe('Vinted recovery across brands and worker restarts', () => {
  it('backs off the same failed probe instead of starting over on the next brand', async () => {
    let now = new Date('2026-10-01T19:06:47Z');
    const queries: SniperQuery[] = [53, 14, 88].map((brandId, index) => ({
      id: `q${index}`,
      queryKey: `brand=${brandId}`,
      marketplace: 'vinted',
      searchText: null,
      catalogId: null,
      brandId,
      priceTo: null,
      priceFrom: null,
      pollIntervalMs: 20_000,
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
      lastStatus: 'ok',
      consecutiveFailures: 0,
    }));
    let state: OriginState = {
      origin: 'vinted',
      state: 'ready',
      blockedUntil: null,
      reason: null,
      probeInFlight: false,
      updatedAt: now.toISOString(),
    };
    const originState: OriginStateStoreLike = {
      getState: async () => state,
      setCooldown: async (_origin, until, reason) => {
        state = { ...state, state: 'cooldown', blockedUntil: until.toISOString(), reason };
      },
      setBlocked: async () => {
        throw new Error('Permanent blocks are unexpected');
      },
      tryAcquireProbe: async () => true,
      releaseProbe: async (_origin, success) => {
        if (success) state = { ...state, state: 'ready', blockedUntil: null, reason: null };
      },
      reset: async () => {
        throw new Error('Manual resets are unexpected');
      },
    };
    const attempted: string[] = [];
    let refused = true;
    const makeScheduler = () =>
      new QueryScheduler({
        queries: {
          dueQueries: async (at) =>
            queries
              .filter((query) => isDue(query, at))
              .sort((a, b) => (a.lastPolledAt ?? '').localeCompare(b.lastPolledAt ?? '')),
          recordFailure: async (id, decision, at) => {
            Object.assign(
              queries.find((query) => query.id === id)!,
              {
                runState: decision.runState,
                nextAttemptAt: decision.nextAttemptAt?.toISOString(),
                consecutiveFailures: decision.consecutiveFailures,
                lastErrorKind: decision.errorKind,
                lastAttemptAt: at!.toISOString(),
                lastPolledAt: at!.toISOString(),
              },
            );
          },
          recordSuccess: async (id, at) => {
            Object.assign(
              queries.find((query) => query.id === id)!,
              {
                runState: 'ready',
                nextAttemptAt: null,
                consecutiveFailures: 0,
                lastPolledAt: at!.toISOString(),
                lastSuccessAt: at!.toISOString(),
              },
            );
          },
          markSeeded: async () => undefined,
        },
        originState,
        collector: {
          collect: async (query) => {
            attempted.push(query.id);
            if (refused) throw new ForbiddenError();
            return [];
          },
        },
        listings: { saveNew: async () => [] },
        budget: new RequestBudget(30),
        log: { info: () => undefined, error: () => undefined },
      });
    const delays: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      // Neue Instanz: Die Wiederherstellung muss auch nach einem Neustart gelten.
      await makeScheduler().runOnce(now);
      const until = new Date(state.blockedUntil!);
      delays.push((until.getTime() - now.getTime()) / 60_000);
      const paused = await makeScheduler().runOnce(new Date(now.getTime() + 1000));
      expect(paused.originPause).toEqual({ reason: 'forbidden', until: until.toISOString() });
      expect(attempted).toHaveLength(attempt + 1);
      now = until;
    }
    expect(delays).toEqual([5, 10, 20, 40, 60]);
    expect(attempted).toEqual(['q0', 'q0', 'q0', 'q0', 'q0']);
    refused = false;
    const recovered = await makeScheduler().runOnce(now);
    expect(recovered.polled).toBe(1);
    expect(state.state).toBe('ready');
    expect(queries[0]?.consecutiveFailures).toBe(0);
    now = new Date(now.getTime() + 20_000);
    expect((await makeScheduler().runOnce(now)).polled).toBe(3);
  });
});
