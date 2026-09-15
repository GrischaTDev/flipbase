import { describe, expect, it, vi } from 'vitest';
import { RequestMetrics } from '../../src/runtime/request-metrics.js';

describe('RequestMetrics', () => {
  it('counts all attempts, rejects 403/429, and breaks down by kind', async () => {
    let now = 1000;
    const metrics = new RequestMetrics(() => now);
    const timeoutError = new Error('request timed out');
    timeoutError.name = 'TimeoutError';

    const fetchFn = metrics.wrap(
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 200 }))
        .mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValueOnce(new Response('', { status: 403 }))
        .mockResolvedValueOnce(new Response('', { status: 429 }))
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(new Error('offline')),
    );

    await fetchFn('https://example.com/catalog');
    await fetchFn('https://example.com/catalog');
    await fetchFn('https://example.com/catalog');
    await fetchFn('https://example.com/catalog');
    await fetchFn('https://example.com/catalog');
    await expect(fetchFn('https://example.com/catalog')).rejects.toThrow('timed out');
    await expect(fetchFn('https://example.com/catalog')).rejects.toThrow('offline');
    metrics.recordParserError('/catalog');

    const snap = metrics.snapshot();
    expect(snap.requests).toBe(8); // 7 fetch + 1 parser
    expect(snap.rejected).toBe(2); // 403 and 429
    expect(snap.byKind.unauthorized).toBe(1);
    expect(snap.byKind.forbidden).toBe(1);
    expect(snap.byKind.rate_limited).toBe(1);
    expect(snap.byKind.server_error).toBe(1);
    expect(snap.byKind.timeout).toBe(1);
    expect(snap.byKind.network_error).toBe(1);
    expect(snap.byKind.parser_error).toBe(1);

    now += 60_000;
    expect(metrics.snapshot().requests).toBe(0);
    expect(metrics.snapshot().rejected).toBe(0);
  });
});
