import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  ComparisonStore,
  parseComparisonTask,
  type ComparisonTaskResult,
} from '../../src/store/comparison.store.js';
import { searchFilter } from '../support/search-filter.js';

const TOKEN = 'bbb37f05-6919-4bed-aabe-6e6b8db7418f';
const NOW = new Date('2026-11-07T15:00:00Z');

function catalogTask() {
  return {
    id: 'catalog:1',
    lease_token: TOKEN,
    kind: 'catalog',
    query_id: 'filter-1',
    query_revision: 1,
    request_cursor: 2,
    page: 1,
    window_start: '2026-10-31T15:00:00Z',
    consecutive_failures: 0,
    query: searchFilter({ priceFrom: 10, priceTo: 40, requestCursor: 0 }),
  };
}

describe('comparison task persistence', () => {
  it('drops feed price boundaries and uses the durable comparison cursor', () => {
    const task = parseComparisonTask(catalogTask());
    expect(task).toMatchObject({
      kind: 'catalog',
      leaseToken: TOKEN,
      query: { priceFrom: null, priceTo: null, requestCursor: 2 },
    });
    expect(parseComparisonTask(null)).toBeNull();
  });

  it('rejects inactive, mismatched and unversioned source filters', () => {
    const task = catalogTask();
    expect(() => parseComparisonTask({ ...task, query_revision: 2 })).toThrow();
    expect(() => parseComparisonTask({ ...task, query_id: 'other-filter' })).toThrow();
    expect(() =>
      parseComparisonTask({ ...task, query: { ...task.query, isActive: false } }),
    ).toThrow();
    expect(() =>
      parseComparisonTask({ ...task, query: { ...task.query, filterFormatVersion: 0 } }),
    ).toThrow();
  });

  it('requires matching task kinds, a fencing token and complete item identity', () => {
    const detail = {
      id: 'detail:2',
      kind: 'detail',
      lease_token: TOKEN,
      external_id: '1001',
      url: 'https://www.vinted.de/items/1001-jacket',
    };
    expect(parseComparisonTask(detail)).toMatchObject({ kind: 'detail', externalId: '1001' });
    expect(() => parseComparisonTask({ ...detail, id: 'catalog:2' })).toThrow();
    expect(() => parseComparisonTask({ ...detail, external_id: undefined })).toThrow();
    expect(() => parseComparisonTask({ ...detail, lease_token: 'not-a-lease' })).toThrow();
  });

  it('sends the reserved token for both checkpoint and retry and preserves a rejected stale lease', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: catalogTask(), error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const store = new ComparisonStore({ rpc } as unknown as SupabaseClient);
    const task = await store.claim(NOW);
    if (!task) throw new Error('fixture');
    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_vinted_comparison_task', {
      p_now: NOW.toISOString(),
    });
    const result: ComparisonTaskResult = {
      kind: 'catalog',
      observed_at: NOW.toISOString(),
      page: 1,
      sourceItemCount: 0,
      requestIndex: 0,
      requestCount: 1,
      items: [],
      pagination: null,
    };
    expect(await store.complete(task, result)).toBe(false);
    expect(rpc).toHaveBeenNthCalledWith(2, 'complete_vinted_comparison_task', {
      p_task_id: 'catalog:1',
      p_lease_token: TOKEN,
      p_result: result,
    });
    await store.fail(task, NOW, 'server_error', 'temporary');
    expect(rpc).toHaveBeenNthCalledWith(3, 'fail_vinted_comparison_task', {
      p_task_id: 'catalog:1',
      p_lease_token: TOKEN,
      p_retry_at: NOW.toISOString(),
      p_error_kind: 'server_error',
      p_error_message: 'temporary',
    });
  });

  it('rejects malformed completion responses instead of treating them as acceptance', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    const store = new ComparisonStore({ rpc } as unknown as SupabaseClient);
    const task = parseComparisonTask(catalogTask());
    if (!task) throw new Error('fixture');
    await expect(store.fail(task, NOW, 'server_error', 'temporary')).rejects.toThrow(
      'Invalid comparison retry response',
    );
  });
});
