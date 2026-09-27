import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedBrandSearchService } from './vinted-brand-search.service';

describe('VintedBrandSearchService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('uses the operator-protected function and only accepts valid brands', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        brands: [
          { id: 53, name: 'Nike' },
          { id: -1, name: 'Ungültig' },
          { id: 99, name: '' },
          null,
        ],
      },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { functions: { invoke } } } }],
    });
    const service = TestBed.inject(VintedBrandSearchService);
    expect(await service.search('Nike')).toEqual([{ id: 53, name: 'Nike' }]);
    expect(invoke).toHaveBeenCalledWith('vinted-brand-search', { body: { keyword: 'Nike' } });
  });
});
