import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { VintedCategoryService } from './vinted-category.service';

describe('complete Vinted category snapshots', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => TestBed.resetTestingModule());
  const parent = {
    id: 1,
    parent_id: null,
    title: 'Herren',
    path: '',
    tree_observed_at: '2026-11-23T10:00:00Z',
  };
  const child = {
    id: 2,
    parent_id: 1,
    title: 'Jacken',
    path: 'Herren',
    tree_observed_at: '2026-11-23T12:00:00Z',
  };
  function snapshotClient(pages: Record<string, unknown>[][]) {
    const range = vi.fn(async () => ({
      data: pages[range.mock.calls.length - 1] ?? [],
      error: null,
    }));
    const from = vi.fn((table: string) => {
      expect(table).toBe('vinted_listing_categories');
      return { select: () => ({ order: () => ({ order: () => ({ range }) }) }) };
    });
    TestBed.configureTestingModule({
      providers: [
        VintedCategoryService,
        { provide: SupabaseService, useValue: { client: { from } } },
      ],
    });
    return { service: TestBed.inject(VintedCategoryService), range, from };
  }
  it('reads from vinted_listing_categories and builds verified full paths', async () => {
    const { service, range } = snapshotClient([[parent, child]]);
    const snapshot = await service.readSnapshot();
    expect(snapshot.categories).toEqual([
      { id: 1, parentId: null, title: 'Herren', path: 'Herren' },
      { id: 2, parentId: 1, title: 'Jacken', path: 'Herren > Jacken' },
    ]);
    expect(snapshot.status).toEqual({
      refreshedAt: '2026-11-23T12:00:00Z',
      categoryCount: 2,
    });
    expect(range.mock.calls).toHaveLength(1);
  });
  it('fetches additional pages when a page fills the PostgREST limit', async () => {
    const firstPage = [
      parent,
      ...Array.from({ length: 999 }, (_, index) => ({
        id: index + 10,
        parent_id: 1,
        title: `Kat ${index + 10}`,
        path: 'Herren',
        tree_observed_at: '2026-11-23T10:00:00Z',
      })),
    ];
    const { service, range } = snapshotClient([firstPage, [child]]);
    const snapshot = await service.readSnapshot();
    expect(snapshot.categories).toHaveLength(1001);
    expect(range.mock.calls).toHaveLength(2);
  });
  it('rejects an empty category table', async () => {
    await expect(snapshotClient([[]]).service.readSnapshot()).rejects.toThrow('nicht geladen');
  });
  it('rejects orphaned categories instead of treating them as roots', async () => {
    await expect(
      snapshotClient([[parent, { ...child, parent_id: 999 }]]).service.readSnapshot(),
    ).rejects.toThrow();
  });
  it('rejects repeated server pages before the pagination loop can continue indefinitely', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      parent_id: index === 0 ? null : 1,
      title: `Kat ${index + 1}`,
      path: index === 0 ? '' : 'Kat 1',
      tree_observed_at: '2026-11-23T10:00:00Z',
    }));
    const { service, range } = snapshotClient([fullPage, fullPage, []]);
    await expect(service.readSnapshot()).rejects.toThrow('wiederholte Einträge');
    expect(range.mock.calls).toHaveLength(2);
  });
});
