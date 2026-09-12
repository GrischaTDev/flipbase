import { describe, expect, it, vi } from 'vitest';
import { ListingRetention } from '../../src/runtime/listing-retention.js';

describe('ListingRetention', () => {
  it('continues a full batch on the next cycle, then resumes the minute interval', async () => {
    const purge = vi.fn().mockResolvedValueOnce(1000).mockResolvedValue(2);
    const retention = new ListingRetention(purge, { info: vi.fn(), error: vi.fn() }, () => 0);
    await retention.runIfDue();
    await retention.runIfDue();
    await retention.runIfDue();
    expect(purge).toHaveBeenCalledTimes(2);
  });

  it('purges at startup and once per minute, logging only actual deletions', async () => {
    let now = 1000;
    const purge = vi.fn().mockResolvedValueOnce(2).mockResolvedValue(0);
    const log = { info: vi.fn(), error: vi.fn() };
    const retention = new ListingRetention(purge, log, () => now);
    await retention.runIfDue();
    expect(log.info).toHaveBeenCalledWith('listings_expired', { deleted: 2, retentionDays: 30 });
    now += 59_999;
    await retention.runIfDue();
    expect(purge).toHaveBeenCalledTimes(1);
    now++;
    await retention.runIfDue();
    expect(purge).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledTimes(1);
  });

  it('keeps a failure visible until retry succeeds without throwing or leaking backend errors', async () => {
    let now = 0;
    const purge = vi.fn().mockRejectedValueOnce(new Error('secret')).mockResolvedValue(0);
    const log = { info: vi.fn(), error: vi.fn() };
    const retention = new ListingRetention(purge, log, () => now);
    await expect(retention.runIfDue()).resolves.toBeUndefined();
    expect(retention.error).toContain('nicht bereinigt');
    now = 59_999;
    await retention.runIfDue();
    expect(retention.error).not.toBeNull();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('secret');
    now++;
    await retention.runIfDue();
    expect(retention.error).toBeNull();
  });

  it('does not overlap a slow cleanup and waits a minute after it completes', async () => {
    let finish!: (count: number) => void;
    let now = 0;
    const purge = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const retention = new ListingRetention(purge, { info: vi.fn(), error: vi.fn() }, () => now);
    const pending = retention.runIfDue();
    now = 120_000;
    await retention.runIfDue();
    expect(purge).toHaveBeenCalledTimes(1);
    finish(0);
    await pending;
    now += 59_999;
    await retention.runIfDue();
    expect(purge).toHaveBeenCalledTimes(1);
  });
});
