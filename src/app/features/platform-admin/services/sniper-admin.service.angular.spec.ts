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
