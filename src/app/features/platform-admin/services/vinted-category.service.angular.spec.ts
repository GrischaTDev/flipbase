import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedCategoryService } from './vinted-category.service';

function clientStub(overrides: Record<string, unknown>) {
  return { client: overrides } as unknown as SupabaseService;
}

describe('VintedCategoryService', () => {
  let service: VintedCategoryService;

  const configure = (supabase: SupabaseService): void => {
    TestBed.configureTestingModule({
      providers: [VintedCategoryService, { provide: SupabaseService, useValue: supabase }],
    });
    service = TestBed.inject(VintedCategoryService);
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('liefert nur Blattkategorien, nach Pfad sortiert', async () => {
    const order = vi.fn(async () => ({
      data: [
        {
          id: 1049,
          parent_id: 16,
          title: 'Stiefel',
          path: 'Damen > Schuhe > Stiefel',
          is_leaf: true,
        },
      ],
      error: null,
    }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    configure(clientStub({ from }));

    const categories = await service.listLeaves();

    expect(from).toHaveBeenCalledWith('vinted_categories');
    expect(eq).toHaveBeenCalledWith('is_leaf', true);
    expect(order).toHaveBeenCalledWith('path', { ascending: true });
    expect(categories).toEqual([
      { id: 1049, parentId: 16, title: 'Stiefel', path: 'Damen > Schuhe > Stiefel', isLeaf: true },
    ]);
  });

  it('meldet einen Datenbankfehler als Fehler weiter', async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: 'keine Rechte' } }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    configure(clientStub({ from: vi.fn(() => ({ select })) }));

    await expect(service.listLeaves()).rejects.toThrow('keine Rechte');
  });

  it('liest den Auffrischungsstand', async () => {
    const single = vi.fn(async () => ({
      data: {
        refreshed_at: '2026-09-06T12:00:00+00:00',
        requested_at: null,
        last_attempt_at: '2026-09-06T12:00:00+00:00',
        category_count: 2920,
        last_error: null,
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    configure(clientStub({ from: vi.fn(() => ({ select })) }));

    const status = await service.readStatus();

    expect(status.categoryCount).toBe(2920);
    expect(status.refreshedAt).toBe('2026-09-06T12:00:00+00:00');
    expect(status.lastError).toBeNull();
  });

  it('fordert eine Auffrischung an, indem es nur requested_at setzt', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    configure(clientStub({ from: vi.fn(() => ({ update })) }));

    await service.requestRefresh();

    expect(Object.keys(update.mock.calls[0]?.[0] as object)).toEqual(['requested_at']);
    expect(eq).toHaveBeenCalledWith('id', 1);
  });
});
