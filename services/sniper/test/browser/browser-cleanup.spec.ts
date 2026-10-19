import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserCleanup } from '../../src/browser/browser-cleanup.js';
afterEach(() => vi.useRealTimers());
describe('browser cleanup deadline', () => {
  it('shares one deadline and sends no later command after it expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const cleanup = new BrowserCleanup();
    const first = cleanup.run(() => new Promise((resolve) => setTimeout(resolve, 1000)));
    await vi.advanceTimersByTimeAsync(1000);
    await first;
    let release: () => void = () => undefined;
    const blocked = cleanup.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await blocked;
    const later = vi.fn(async () => undefined);
    await cleanup.run(later);
    expect(cleanup.expired).toBe(true);
    expect(later).not.toHaveBeenCalled();
    release();
    await Promise.resolve();
    await cleanup.run(later);
    expect(later).not.toHaveBeenCalled();
  });
});
