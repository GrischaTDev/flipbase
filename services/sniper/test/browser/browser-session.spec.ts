import { describe, expect, it } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import type { OriginState } from '../../src/store/origin-state.store.js';
import { BrowserSessionController } from '../../src/browser/browser-session.js';
import { ForbiddenError } from '../../src/vinted/errors.js';

function setup() {
  let clock = Date.parse('2026-10-07T12:00:00Z');
  let origin: OriginState = {
    origin: 'vinted',
    state: 'blocked',
    blockedUntil: null,
    reason: 'interaction_required',
    probeInFlight: false,
    updatedAt: new Date(clock).toISOString(),
  };
  const query: SniperQuery = {
    id: 'query',
    queryKey: 'nike',
    marketplace: 'vinted',
    searchText: null,
    catalogId: 2050,
    brandId: 53,
    brandIds: [53],
    priceTo: null,
    priceFrom: null,
    pollIntervalMs: 60_000,
    isSeeded: true,
    isActive: true,
    runState: 'blocked',
    nextAttemptAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorKind: 'forbidden',
    lastErrorAt: null,
    lastErrorMessage: null,
    lastPolledAt: null,
    lastStatus: 'forbidden',
    consecutiveFailures: 1,
    filterFormatVersion: 1,
    filterRevision: 3,
    requestCursor: 0,
  };
  const events: string[] = [];
  const behavior = {
    collect: async () => undefined,
    complete: async () => undefined,
    accepted: true,
    capacity: true,
  };
  const controller = new BrowserSessionController({
    baseUrl: 'https://www.vinted.de',
    minimumIntervalMs: 10_000,
    now: () => new Date(clock),
    browser: {
      fetch: async () => new Response(''),
      openManual: async (url) => {
        events.push(`open:${url.searchParams.get('brand_ids')}`);
      },
      stopManual: async () => {
        events.push('stop');
      },
      captureFrame: async () => new Uint8Array([255, 216, 255, 1]),
      input: async () => {
        events.push('input');
      },
      close: async () => undefined,
    },
    originState: {
      getState: async () => origin,
      setBlocked: async (_origin, reason, deadline) => {
        origin = {
          ...origin,
          state: 'blocked',
          reason,
          blockedUntil: deadline?.toISOString() ?? null,
        };
      },
      reset: async () => {
        events.push('ready');
        origin = { ...origin, state: 'ready', reason: null, blockedUntil: null };
      },
      setCooldown: async () => undefined,
      tryAcquireProbe: async () => false,
      releaseProbe: async () => undefined,
    },
    queries: { activeQueries: async () => (query.isActive ? [structuredClone(query)] : []) },
    collector: {
      collect: async (_query, options) => {
        expect(options).toEqual({ allowRetries: false });
        events.push('collect');
        await behavior.collect();
        return [];
      },
    },
    listings: {
      completeRun: async (_listings, captured) => {
        events.push('stored');
        await behavior.complete();
        return {
          accepted:
            behavior.accepted && query.isActive && captured.filterRevision === query.filterRevision,
          created: 0,
          seeded: false,
          hits: 0,
        };
      },
    },
    budget: {
      hasCapacity: () => behavior.capacity,
      record: () => {
        events.push('counted');
      },
    },
  });
  return {
    controller,
    query,
    events,
    behavior,
    advance: (ms: number) => {
      clock += ms;
    },
    state: () => origin,
    deadline: (iso: string) => {
      origin = { ...origin, blockedUntil: iso };
    },
  };
}

describe('BrowserSessionController', () => {
  it('allows only one operator and rejects foreign input or closing', async () => {
    const { controller, events } = setup();
    const opened = await controller.open('owner');
    expect(opened.expiresAt).toBe('2026-10-07T12:10:00.000Z');
    expect(opened.sessionId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(controller.open('other')).rejects.toMatchObject({ status: 409 });
    await expect(
      controller.input('other', String(opened.sessionId), { kind: 'key', key: 'Enter' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(controller.close('other', String(opened.sessionId))).rejects.toMatchObject({
      status: 409,
    });
    expect(events).not.toContain('input');
    await controller.close('owner', String(opened.sessionId));
  });
  it('skips all automatic work while a manual pause is persisted', async () => {
    const { controller } = setup();
    let executed = false;
    expect(
      await controller.runAutomatic(async () => {
        executed = true;
        return 1;
      }),
    ).toBeUndefined();
    expect(executed).toBe(false);
  });
  it('accepts guarded storage before clearing the persisted pause', async () => {
    const { controller, advance, events, state } = setup();
    const opened = await controller.open('owner');
    advance(60_000);
    const result = await controller.verify('owner', String(opened.sessionId));
    expect(result.state).toBe('ready');
    expect(events.indexOf('stored')).toBeLessThan(events.indexOf('ready'));
    expect(events.filter((event) => event === 'collect')).toHaveLength(1);
    expect(state().state).toBe('ready');
  });
  it.each(['stale', 'inactive', 'storage', 'challenge', 'expired'] as const)(
    'keeps the pause when proof fails because of %s',
    async (failure) => {
      const { controller, advance, behavior, events, query, state } = setup();
      const opened = await controller.open('owner');
      advance(60_000);
      behavior.collect = async () => {
        if (failure === 'stale') query.filterRevision = 4;
        if (failure === 'inactive') query.isActive = false;
        if (failure === 'challenge')
          throw new ForbiddenError('challenge', { challengeDetected: true });
      };
      behavior.complete = async () => {
        if (failure === 'storage') throw new Error('storage failed');
        if (failure === 'expired') advance(10 * 60_000);
      };
      await expect(controller.verify('owner', String(opened.sessionId))).rejects.toThrow();
      expect(state().state).toBe('blocked');
      expect(events).not.toContain('ready');
    },
  );
  it('respects provider delay before opening and navigates nowhere without an active query', async () => {
    const { controller, deadline, advance, query, events } = setup();
    deadline('2026-10-07T12:30:00Z');
    await expect(controller.open('owner')).rejects.toMatchObject({ status: 409 });
    advance(30 * 60_000);
    query.isActive = false;
    await expect(controller.open('owner')).rejects.toMatchObject({ status: 409 });
    expect(events.some((event) => event.startsWith('open:'))).toBe(false);
  });
  it('retains the request spacing after a failed proof instead of opening again immediately', async () => {
    const { controller, advance, behavior, state } = setup();
    const opened = await controller.open('owner');
    advance(60_000);
    behavior.collect = async () => {
      throw new Error('network failed');
    };
    await expect(controller.verify('owner', String(opened.sessionId))).rejects.toThrow();
    expect(state().blockedUntil).toBe('2026-10-07T12:02:00.000Z');
    await expect(controller.open('owner')).rejects.toMatchObject({ status: 409 });
  });
  it('rejects expired input and retains the pause after closing the desktop', async () => {
    const { controller, advance, events, state } = setup();
    const opened = await controller.open('owner');
    advance(10 * 60_000);
    await expect(
      controller.input('owner', String(opened.sessionId), { kind: 'key', key: 'Enter' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(events).not.toContain('input');
    expect(state().state).toBe('blocked');
  });
});
