import { describe, expect, it, vi } from 'vitest';
import { WatchlistEvaluator } from '../../src/runtime/watchlist-evaluator.js';

describe('WatchlistEvaluator', () => {
  it('evaluates pending listings in batches until queue is empty', async () => {
    const evaluatePending = vi
      .fn()
      .mockResolvedValueOnce({ processed: 100, hits: 2 })
      .mockResolvedValueOnce({ processed: 42, hits: 1 });

    const log = { info: vi.fn(), error: vi.fn() };
    const evaluator = new WatchlistEvaluator({
      listings: { evaluatePending },
      log,
      batchSize: 100,
      maxBatchesPerRun: 5,
    });

    const result = await evaluator.runOnce();

    expect(evaluatePending).toHaveBeenCalledTimes(2);
    expect(evaluatePending).toHaveBeenNthCalledWith(1, 100);
    expect(evaluatePending).toHaveBeenNthCalledWith(2, 100);
    expect(result).toEqual({ totalProcessed: 142, totalHits: 3, batches: 2 });
    expect(log.info).toHaveBeenCalledWith('watchlist_evaluation_completed', {
      batches: 2,
      processed: 142,
      hits: 3,
    });
  });

  it('stops when maxBatchesPerRun is reached even if queue still has items', async () => {
    const evaluatePending = vi.fn().mockResolvedValue({ processed: 50, hits: 0 });
    const log = { info: vi.fn(), error: vi.fn() };
    const evaluator = new WatchlistEvaluator({
      listings: { evaluatePending },
      log,
      batchSize: 50,
      maxBatchesPerRun: 3,
    });

    const result = await evaluator.runOnce();

    expect(evaluatePending).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ totalProcessed: 150, totalHits: 0, batches: 3 });
  });

  it('handles database errors gracefully and does not throw', async () => {
    const evaluatePending = vi
      .fn()
      .mockResolvedValueOnce({ processed: 100, hits: 1 })
      .mockRejectedValueOnce(new Error('timeout'));

    const log = { info: vi.fn(), error: vi.fn() };
    const evaluator = new WatchlistEvaluator({
      listings: { evaluatePending },
      log,
      batchSize: 100,
    });

    const result = await evaluator.runOnce();

    expect(result).toEqual({ totalProcessed: 100, totalHits: 1, batches: 1 });
    expect(log.error).toHaveBeenCalledWith('watchlist_evaluation_failed', {
      reason: 'timeout',
      batchesCompleted: 1,
      totalProcessed: 100,
      totalHits: 1,
    });
    // Protokolliert trotzdem die bisherigen Treffer
    expect(log.info).toHaveBeenCalledWith('watchlist_evaluation_completed', {
      batches: 1,
      processed: 100,
      hits: 1,
    });
  });

  it('does not log completed if no items were processed or found', async () => {
    const evaluatePending = vi.fn().mockResolvedValue({ processed: 0, hits: 0 });
    const log = { info: vi.fn(), error: vi.fn() };
    const evaluator = new WatchlistEvaluator({
      listings: { evaluatePending },
      log,
    });

    const result = await evaluator.runOnce();

    expect(result).toEqual({ totalProcessed: 0, totalHits: 0, batches: 1 });
    expect(log.info).not.toHaveBeenCalled();
  });
});
