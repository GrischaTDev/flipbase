import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCollectorWatchdog } from '../../src/runtime/collector-watchdog.js';
afterEach(() => vi.useRealTimers());
function setup(live = true, restart = false) {
  vi.useFakeTimers();
  const closeBrowser = vi.fn(async () => undefined);
  const exit = vi.fn();
  const stop = startCollectorWatchdog({
    isLive: () => live,
    needsBrowserRestart: () => restart,
    closeBrowser,
    exit,
    log: { info: vi.fn(), error: vi.fn() },
  });
  return { closeBrowser, exit, stop };
}
describe('collector watchdog', () => {
  it('preserves a live loop during provider errors, empty cycles and cooldowns', async () => {
    const { closeBrowser, exit, stop } = setup();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(closeBrowser).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    stop();
  });
  it('closes the browser and exits once after real progress has stopped', async () => {
    const { closeBrowser, exit } = setup(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });
  it('recovers an unusable browser even when the scheduler still handles failures', async () => {
    const { exit } = setup(true, true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('exits after a bounded shutdown when the browser never closes', async () => {
    const { closeBrowser, exit } = setup(false);
    closeBrowser.mockImplementationOnce(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('does not start recovery after a normal stop', async () => {
    const { stop, exit } = setup(false);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exit).not.toHaveBeenCalled();
  });
});
