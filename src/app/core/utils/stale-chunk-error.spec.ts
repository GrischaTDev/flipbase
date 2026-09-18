import { describe, expect, it } from 'vitest';
import { isStaleChunkLoadError } from './stale-chunk-error';

describe('isStaleChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://app.flipbase.de/chunk-abc123.js',
    'Importing a module script failed.',
    'Failed to load module script: Expected a JavaScript-or-Wasm module script',
    'Loading chunk 42 failed.',
    'ChunkLoadError: Loading chunk settings failed.',
  ])('erkennt einen veralteten Lazy-Chunk: %s', (message) => {
    expect(isStaleChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('erkennt verschachtelte Router-Fehler', () => {
    expect(
      isStaleChunkLoadError({
        rejection: new TypeError(
          'Failed to fetch dynamically imported module: https://app.flipbase.de/chunk-old.js',
        ),
      }),
    ).toBe(true);
  });

  it.each([
    new Error('Failed to fetch'),
    new Error('Supabase request failed'),
    new Error('Cannot read properties of undefined'),
    null,
    'irgendein Fehler',
  ])('laedt bei normalen Fehlern nicht neu', (error) => {
    expect(isStaleChunkLoadError(error)).toBe(false);
  });
});
