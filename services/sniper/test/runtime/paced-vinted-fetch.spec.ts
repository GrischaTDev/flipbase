import { describe, expect, it, vi } from 'vitest';
import { pacedVintedFetch } from '../../src/runtime/paced-vinted-fetch.js';
import type { FetchLike } from '../../src/vinted/session.js';

describe('pacedVintedFetch', () => {
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
});
