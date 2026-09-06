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
    const from = vi.fn(() => ({ select }));
    configure(clientStub({ from }));

    const status = await service.readStatus();

    // Nicht nur die Umwandlung pruefen: Ohne diese drei Zusicherungen bliebe
    // der Test auch dann gruen, wenn die falsche Tabelle abgefragt, eine
    // Spalte vergessen oder der Filter auf die einzige Zeile weggelassen
    // wuerde - die Attrappe antwortet ja unabhaengig davon.
    expect(from).toHaveBeenCalledWith('vinted_category_syncs');
    expect(select).toHaveBeenCalledWith(
      'refreshed_at, requested_at, last_attempt_at, category_count, last_error',
    );
    expect(eq).toHaveBeenCalledWith('id', 1);

    expect(status.categoryCount).toBe(2920);
    expect(status.refreshedAt).toBe('2026-09-06T12:00:00+00:00');
    expect(status.lastError).toBeNull();
  });

  it('fordert eine Auffrischung an, indem es nur requested_at setzt', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }));
    const from = vi.fn(() => ({ update }));
    configure(clientStub({ from }));

    await service.requestRefresh();

    expect(from).toHaveBeenCalledWith('vinted_category_syncs');
    // Genau ein Feld: Auf allen anderen Spalten hat ein angemeldetes Konto
    // kein Schreibrecht, die Datenbank wuerde den Aufruf ablehnen.
    expect(Object.keys(update.mock.calls[0][0])).toEqual(['requested_at']);
    expect(eq).toHaveBeenCalledWith('id', 1);
  });

  it('meldet einen abgelehnten Auffrischungswunsch als Fehler weiter', async () => {
    const eq = vi.fn(async () => ({ error: { message: 'keine Rechte' } }));
    configure(clientStub({ from: vi.fn(() => ({ update: vi.fn(() => ({ eq })) })) }));

    await expect(service.requestRefresh()).rejects.toThrow('keine Rechte');
  });
});
