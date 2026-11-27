import { describe, expect, it, vi } from 'vitest';
import { pacedVintedFetch } from '../../src/runtime/paced-vinted-fetch.js';
import type { FetchLike } from '../../src/vinted/session.js';

describe('pacedVintedFetch', () => {
  it('rechecks the provider gate after waiting and does not spend a request slot', async () => {
    let blocked = false;
    const fetchFn = vi.fn(async () => new Response('ok'));
    const recordStart = vi.fn();
    const fetch = pacedVintedFetch(fetchFn, {
      minimumIntervalMs: 2500,
      requestTimeoutMs: 20000,
      now: () => 0,
      sleep: async () => {
        blocked = true;
      },
      assertCanStart: () => {
        if (blocked) throw new Error('provider paused');
      },
      recordStart,
    });
    await fetch('https://www.vinted.de/catalog');
    await expect(fetch('https://www.vinted.de/catalog')).rejects.toThrow('provider paused');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(recordStart).toHaveBeenCalledTimes(1);
  });
  it('spaces all outgoing requests, including simultaneous callers and failed requests', async () => {
    let clock = 0;
    const started: number[] = [];
    const fetchFn: FetchLike = async () => {
      started.push(clock);
      if (started.length === 1) throw new Error('Network down');
      return new Response('ok');
    };
    const fetch = pacedVintedFetch(fetchFn, {
      minimumIntervalMs: 10_000,
      requestTimeoutMs: 20_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const results = await Promise.allSettled([
      fetch('https://www.vinted.de/'),
      fetch('https://www.vinted.de/catalog'),
      fetch('https://www.vinted.de/catalog'),
    ]);
    expect(started).toEqual([0, 10_000, 20_000]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
  });

  it('does not add a delay when the previous request already took longer than the spacing', async () => {
    let clock = 0;
    const wait = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const fetch = pacedVintedFetch(
      async () => {
        clock += 15_000;
        return new Response('ok');
      },
      { minimumIntervalMs: 10_000, requestTimeoutMs: 20_000, now: () => clock, sleep: wait },
    );
    await fetch('https://www.vinted.de/');
    await fetch('https://www.vinted.de/catalog');
    expect(clock).toBe(30_000);
    expect(wait).not.toHaveBeenCalled();
  });

  it('aborts a stalled request and releases the next caller', async () => {
    const fetchFn: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    const fetch = pacedVintedFetch(fetchFn, { minimumIntervalMs: 1, requestTimeoutMs: 10 });
    // AbortSignal.timeout verwendet einen Timer, der allein den Prozess nicht offen haelt.
    const keepAlive = setTimeout(() => undefined, 200);
    try {
      await expect(fetch('https://www.vinted.de/')).rejects.toMatchObject({ kind: 'timeout' });
      await expect(fetch('https://www.vinted.de/catalog')).rejects.toMatchObject({
        kind: 'timeout',
      });
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it('preserves caller cancellation and skips an already cancelled request', async () => {
    const fetchFn = vi.fn(async () => new Response('ok'));
    const fetch = pacedVintedFetch(fetchFn, {
      minimumIntervalMs: 10_000,
      requestTimeoutMs: 20_000,
    });
    const controller = new AbortController();
    controller.abort(new Error('Cancelled by caller'));
    await expect(fetch('https://www.vinted.de/', { signal: controller.signal })).rejects.toThrow(
      'Cancelled by caller',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('overlaps in-flight requests up to maxConcurrency while preserving start spacing', async () => {
    let clock = 0;
    let active = 0;
    let peakActive = 0;
    const started: number[] = [];
    const resolvers: (() => void)[] = [];
    const fetchFn: FetchLike = async () => {
      started.push(clock);
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      active -= 1;
      return new Response('ok');
    };
    const fetch = pacedVintedFetch(fetchFn, {
      minimumIntervalMs: 1000,
      requestTimeoutMs: 20_000,
      maxConcurrency: 2,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    const pending = [
      fetch('https://www.vinted.de/catalog?catalog_ids=1'),
      fetch('https://www.vinted.de/catalog?catalog_ids=2'),
      fetch('https://www.vinted.de/catalog?catalog_ids=3'),
    ];
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    expect(peakActive).toBe(2);
    expect(started).toEqual([0, 1000]);
    resolvers[0]!();
    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    expect(started).toEqual([0, 1000, 2000]);
    resolvers[1]!();
    resolvers[2]!();
    const responses = await Promise.all(pending);
    expect(responses.every((response) => response.ok)).toBe(true);
  });
});
