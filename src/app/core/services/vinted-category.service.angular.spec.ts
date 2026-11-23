import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { VintedCategoryService } from './vinted-category.service';

describe('complete Vinted category snapshots', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => TestBed.resetTestingModule());
  const parent = { id: 1, parent_id: null, title: 'Herren', path: 'untrusted old path' };
  const child = { id: 2, parent_id: 1, title: 'Jacken', path: 'untrusted old path' };
  function snapshotClient(
    pages: Record<string, unknown>[][],
    versions = ['2026-10-05', '2026-10-05'],
  ) {
    const single = vi.fn(async () => ({
      data: { refreshed_at: versions[single.mock.calls.length - 1], category_count: 2 },
      error: null,
    }));
    const range = vi.fn(async () => ({
      data: pages[range.mock.calls.length - 1] ?? [],
      error: null,
    }));
    const from = (table: string) =>
      table === 'vinted_category_syncs'
        ? { select: () => ({ eq: () => ({ single }) }) }
        : { select: () => ({ order: () => ({ order: () => ({ range }) }) }) };
    TestBed.configureTestingModule({
      providers: [
        VintedCategoryService,
        { provide: SupabaseService, useValue: { client: { from } } },
      ],
    });
    return { service: TestBed.inject(VintedCategoryService), range };
  }
  it('includes parents and fetches every page even below the requested server limit', async () => {
    const { service, range } = snapshotClient([[parent], [child], []]);
    const snapshot = await service.readSnapshot();
    expect(snapshot.categories).toEqual([
      { id: 1, parentId: null, title: 'Herren', path: 'Herren' },
      { id: 2, parentId: 1, title: 'Jacken', path: 'Herren > Jacken' },
    ]);
    expect(range.mock.calls).toHaveLength(3);
  });
  it('rejects a partial snapshot instead of presenting it as the whole category tree', async () => {
    await expect(snapshotClient([[parent], []]).service.readSnapshot()).rejects.toThrow(
      'unvollständig',
    );
  });
  it('rejects mixed synchronization generations', async () => {
    await expect(
      snapshotClient([[parent, child], []], ['first', 'second']).service.readSnapshot(),
    ).rejects.toThrow('aktualisiert');
  });
  it('rejects orphaned categories instead of treating them as roots', async () => {
    await expect(
      snapshotClient([[parent, { ...child, parent_id: 999 }], []]).service.readSnapshot(),
    ).rejects.toThrow();
  });
  it('rejects repeated server pages before the pagination loop can continue indefinitely', async () => {
    const { service, range } = snapshotClient([[parent], [parent], [parent], []]);
    await expect(service.readSnapshot()).rejects.toThrow();
    expect(range.mock.calls).toHaveLength(2);
  });
});
