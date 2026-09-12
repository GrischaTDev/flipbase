import { describe, expect, it, vi } from 'vitest';
import { RequestMetrics } from '../../src/runtime/request-metrics.js';

describe('RequestMetrics', () => {
  it('counts all attempts and only 403/429 as rejected, expires the full minute', async () => {
    let now = 1000;
    const metrics = new RequestMetrics(() => now);
    const fetchFn = metrics.wrap(
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(new Response('', { status: 403 }))
        .mockResolvedValueOnce(new Response('', { status: 429 }))
        .mockRejectedValueOnce(new Error('offline')),
    );
    await fetchFn('https://example.com');
    await fetchFn('https://example.com');
    await fetchFn('https://example.com');
    await expect(fetchFn('https://example.com')).rejects.toThrow('offline');
    expect(metrics.snapshot()).toEqual({ requests: 4, rejected: 2 });
    now += 60_000;
    expect(metrics.snapshot()).toEqual({ requests: 0, rejected: 0 });
  });
});
