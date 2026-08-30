import { describe, expect, it, vi } from 'vitest';
import { countingFetch } from '../../src/runtime/counting-fetch.js';

describe('countingFetch', () => {
  it('records exactly once per call, passes arguments through unchanged, and returns the underlying response', async () => {
    const response = new Response('ok');
    const fetchFn = vi.fn().mockResolvedValue(response);
    const onRequest = vi.fn();
    const wrapped = countingFetch(fetchFn, onRequest);

    const init: RequestInit = { headers: { Accept: 'application/json' } };
    const result = await wrapped('https://example.test/foo', init);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('https://example.test/foo', init);
    expect(result).toBe(response);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('still records when the underlying fetch rejects', async () => {
    // Das ist die eigentliche Garantie: eine fehlgeschlagene Anfrage hat die
    // Maschine trotzdem verlassen und muss zaehlen - genau in dem Moment, in
    // dem Vinted schon mit Fehlern antwortet, darf das Budget nicht zu wenig
    // sehen.
    const failure = new Error('network down');
    const fetchFn = vi.fn().mockRejectedValue(failure);
    const onRequest = vi.fn();
    const wrapped = countingFetch(fetchFn, onRequest);

    await expect(wrapped('https://example.test/foo')).rejects.toThrow(failure);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('calls onRequest once per call across multiple calls', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('ok'));
    const onRequest = vi.fn();
    const wrapped = countingFetch(fetchFn, onRequest);

    await wrapped('https://example.test/a');
    await wrapped('https://example.test/b');
    await wrapped('https://example.test/c');

    expect(onRequest).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
