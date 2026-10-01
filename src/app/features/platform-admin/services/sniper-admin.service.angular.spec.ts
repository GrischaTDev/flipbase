import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { QueryDraft } from '../models/sniper-query.model';
import { SniperAdminService } from './sniper-admin.service';

describe('SniperAdminService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sends only the editable values of a central brand filter', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'query', error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(SniperAdminService);
    await api.save({
      id: null,
      title: 'Nike',
      brandId: 53,
      intervalSeconds: 20,
      notes: 'Test',
    } satisfies QueryDraft);
    expect(rpc).toHaveBeenCalledWith('upsert_sniper_query', {
      p_id: null,
      p_title: 'Nike',
      p_brand_id: 53,
      p_poll_interval_ms: 20000,
      p_notes: 'Test',
    });
    rpc.mockResolvedValueOnce({ error: { message: 'Keine Berechtigung' } });
    await expect(api.setActive('query', true)).rejects.toThrow('Keine Berechtigung');
  });

  it('continues pagination when the server returns less than the requested page size', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'first' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'second' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const builder = { select: vi.fn(), is: vi.fn(), order: vi.fn(), range };
    builder.select.mockReturnValue(builder);
    builder.is.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from: () => builder } } }],
    });
    expect(await TestBed.inject(SniperAdminService).list()).toEqual([
      { id: 'first' },
      { id: 'second' },
    ]);
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1, 1000],
      [2, 1001],
    ]);
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('removes a filter through the restricted function and reports errors', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'Nicht erlaubt' } });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(SniperAdminService);
    await api.delete('query');
    expect(rpc).toHaveBeenCalledWith('delete_sniper_query', { p_id: 'query' });
    await expect(api.delete('query')).rejects.toThrow('Nicht erlaubt');
  });

  it('saves each selected brand independently and reports only failed brands for retry', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'Duplicate' } })
      .mockResolvedValueOnce({ error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const drafts = [
      { id: null, title: 'Nike', brandId: 53, intervalSeconds: 20, notes: '' },
      { id: null, title: 'Ralph Lauren', brandId: 88, intervalSeconds: 20, notes: '' },
      { id: null, title: 'Polo Ralph Lauren', brandId: 4273, intervalSeconds: 20, notes: '' },
    ] satisfies QueryDraft[];
    const result = await TestBed.inject(SniperAdminService).saveMany(drafts);
    expect(result).toEqual({ savedIds: [53, 4273], failedNames: ['Ralph Lauren'] });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
