import { describe, expect, it } from 'vitest';
import {
  MAX_VINTED_PAGE_BYTES,
  parseBoundedPageJson,
  readVintedPage,
} from '../../src/vinted/response-body.js';
import { parseRetryAfter, RateLimitedError, ForbiddenError } from '../../src/vinted/errors.js';
import { evaluateFailure } from '../../src/runtime/retry-policy.js';
import { parseCategoryTree } from '../../src/vinted/categories.js';

describe('provider-controlled resource bounds', () => {
  it.each([undefined, '1'])(
    'counts actual response bytes and cancels unknown or false lengths: %s',
    async (declared) => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_VINTED_PAGE_BYTES));
          controller.enqueue(new Uint8Array(1));
        },
        cancel() {
          cancelled = true;
        },
      });
      const response = new Response(stream, {
        headers: declared ? { 'Content-Length': declared } : {},
      });
      await expect(readVintedPage(response)).rejects.toThrow(/size limit/);
      expect(cancelled).toBe(true);
    },
  );

  it('accepts split UTF-8, but rejects excessive JSON nesting and multibyte copies', async () => {
    const bytes = new TextEncoder().encode('{"title":"Schön [ ]"}');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 12));
        controller.enqueue(bytes.slice(12));
        controller.close();
      },
    });
    expect(parseBoundedPageJson(await readVintedPage(new Response(stream)))).toEqual({
      title: 'Schön [ ]',
    });
    expect(() => parseBoundedPageJson('['.repeat(65) + '0' + ']'.repeat(65))).toThrow(/nesting/);
    expect(() => parseBoundedPageJson('ä'.repeat(MAX_VINTED_PAGE_BYTES / 2 + 1))).toThrow(
      /size limit/,
    );
  });

  it('keeps cooldown timestamps serializable for hostile integer and date headers', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    for (const header of ['9'.repeat(1000), '9007199254740991', 'Thu, 07 Oct 2099 12:00:00 GMT'])
      expect(parseRetryAfter(header, now)).toBeUndefined();
    for (const seconds of [NaN, Infinity, Number.MAX_SAFE_INTEGER, -1])
      for (const ErrorType of [RateLimitedError, ForbiddenError]) {
        const decision = evaluateFailure(
          new ErrorType('provider failure', { retryAfterSeconds: seconds }),
          { consecutiveFailures: 0 },
          now,
        );
        expect(() => decision.nextAttemptAt?.toISOString()).not.toThrow();
        expect((decision.nextAttemptAt?.getTime() ?? 0) - now.getTime()).toBeLessThanOrEqual(
          86_400_000,
        );
      }
    expect(parseRetryAfter('1800', now)).toBe(1800);
  });

  it('rejects malformed and duplicate category nodes while preserving bracketed titles', () => {
    const html = (tree: unknown) =>
      `self.__next_f.push([1,${JSON.stringify(`x:{"catalogTree":${JSON.stringify(tree)}}`)}])`;
    for (const tree of [
      [null],
      [{ id: 0, title: 'Wrong' }],
      [
        { id: 1, title: 'One' },
        { id: 1, title: 'Again' },
      ],
      [{ id: 1, title: 'One', catalogs: {} }],
    ])
      expect(() => parseCategoryTree(html(tree))).toThrow();
    expect(parseCategoryTree(html([{ id: 1, title: 'Schuhe [A]' }]))[0]?.title).toBe('Schuhe [A]');
  });
});
