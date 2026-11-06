import { describe, expect, it, vi } from 'vitest';
import { FeedOperatorSwitch } from '../../src/runtime/feed-operator-switch.js';

describe('FeedOperatorSwitch', () => {
  it('caches the operator decision for the configured time', async () => {
    let now = 0;
    const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const feedSwitch = new FeedOperatorSwitch(read, 1_000, () => now);

    expect(await feedSwitch.isEnabled()).toBe(false);
    expect(await feedSwitch.isEnabled()).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);

    now = 1_000;
    expect(await feedSwitch.isEnabled()).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps collecting when the switch cannot be read', async () => {
    let now = 0;
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    const feedSwitch = new FeedOperatorSwitch(read, 1_000, () => now);

    expect(await feedSwitch.isEnabled()).toBe(true);
    now = 1_000;
    expect(await feedSwitch.isEnabled()).toBe(true);
  });
});
