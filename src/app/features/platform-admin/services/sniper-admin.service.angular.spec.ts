import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SniperAdminService } from './sniper-admin.service';

describe('SniperAdminService', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('sends only editable query values and keeps absent filters null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'query', error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(SniperAdminService);
    await api.save({
      id: null,
      catalogId: 1049,
      searchText: '',
      brandId: null,
      priceFrom: null,
      priceTo: 50,
      intervalSeconds: 60,
      notes: 'Test',
    });
    expect(rpc).toHaveBeenCalledWith('upsert_sniper_query', {
      p_id: null,
      p_catalog_id: 1049,
      p_search_text: '',
      p_brand_id: null,
      p_price_from: null,
      p_price_to: 50,
      p_poll_interval_ms: 60000,
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
    const builder = { select: vi.fn(), order: vi.fn(), range };
    builder.select.mockReturnValue(builder);
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
  });
});
