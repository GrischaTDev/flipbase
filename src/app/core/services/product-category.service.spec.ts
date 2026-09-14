import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { MockDataStoreService } from './mock-data-store.service';
import {
  CATEGORY_SEARCH_LIMIT,
  ProductCategoryService,
  escapeLikePattern,
} from './product-category.service';
import { SupabaseService } from './supabase.service';

type Call = readonly [string, ...unknown[]];
interface QueryResult {
  readonly data: unknown;
  readonly error: { message: string } | null;
}

function createQuery(result: QueryResult) {
  const calls: Call[] = [];
  const query = {
    calls,
    select(...args: unknown[]) {
      calls.push(['select', ...args]);
      return query;
    },
    eq(...args: unknown[]) {
      calls.push(['eq', ...args]);
      return query;
    },
    is(...args: unknown[]) {
      calls.push(['is', ...args]);
      return query;
    },
    ilike(...args: unknown[]) {
      calls.push(['ilike', ...args]);
      return query;
    },
    order(...args: unknown[]) {
      calls.push(['order', ...args]);
      return query;
    },
    limit(...args: unknown[]) {
      calls.push(['limit', ...args]);
      return query;
    },
    maybeSingle: async () => result,
    then<T1 = QueryResult, T2 = never>(
      resolve?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
      reject?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): Promise<T1 | T2> {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

const laptopRow = {
  id: 'el-6-6',
  parent_id: 'el-6',
  name: 'Laptops',
  full_name: 'Elektronik > Computer > Laptops',
  level: 3,
  is_leaf: true,
  is_deprecated: false,
};

function createService(results: QueryResult[], demo = false) {
  const queries = results.map(createQuery);
  const from = vi.fn(() => {
    const next = queries.shift();
    if (!next) throw new Error('Unerwartete Abfrage');
    return next;
  });
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(demo);
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: MockDataStoreService, useValue: mockStore },
    ],
  });
  const service = runInInjectionContext(injector, () => new ProductCategoryService());
  return { service, from, mockStore };
}

describe('ProductCategoryService', () => {
  it('lädt Hauptbereiche ohne veraltete Kategorien und merkt sie sich', async () => {
    const query = createQuery({ data: [laptopRow], error: null });
    const from = vi.fn(() => query);
    const mockStore = new MockDataStoreService();
    mockStore.isDemoMode.set(false);
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: MockDataStoreService, useValue: mockStore },
      ],
    });
    const service = runInInjectionContext(injector, () => new ProductCategoryService());

    const first = await service.loadChildren(null);
    const second = await service.loadChildren(null);

    expect(first).toEqual([
      {
        id: 'el-6-6',
        parentId: 'el-6',
        name: 'Laptops',
        fullName: 'Elektronik > Computer > Laptops',
        level: 3,
        isLeaf: true,
        isDeprecated: false,
      },
    ]);
    expect(second).toBe(first);
    expect(from).toHaveBeenCalledTimes(1);
    expect(query.calls).toContainEqual(['is', 'parent_id', null]);
    expect(query.calls).toContainEqual(['eq', 'is_deprecated', false]);
    expect(query.calls).toContainEqual(['order', 'name']);
  });

  it('lädt nach einem Fehler beim nächsten Versuch neu', async () => {
    const { service, from } = createService([
      { data: null, error: { message: 'offline' } },
      { data: [laptopRow], error: null },
    ]);

    await expect(service.loadChildren('el-6')).rejects.toThrow('offline');
    await expect(service.loadChildren('el-6')).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('sucht erst ab zwei Zeichen und fragt dann jedes Wort maskiert ab', async () => {
    const rows = Array.from({ length: CATEGORY_SEARCH_LIMIT + 1 }, (_, index) => ({
      ...laptopRow,
      id: `el-6-${index}`,
    }));
    const query = createQuery({ data: rows, error: null });
    const from = vi.fn(() => query);
    const mockStore = new MockDataStoreService();
    mockStore.isDemoMode.set(false);
    const injector = Injector.create({
      providers: [
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: MockDataStoreService, useValue: mockStore },
      ],
    });
    const service = runInInjectionContext(injector, () => new ProductCategoryService());

    await expect(service.search(' l ')).resolves.toEqual({ categories: [], hasMore: false });
    expect(from).not.toHaveBeenCalled();

    const result = await service.search('50% lap_top');

    expect(result.categories).toHaveLength(CATEGORY_SEARCH_LIMIT);
    expect(result.hasMore).toBe(true);
    expect(query.calls).toContainEqual(['ilike', 'full_name', '%50\\%%']);
    expect(query.calls).toContainEqual(['ilike', 'full_name', '%lap\\_top%']);
    expect(query.calls).toContainEqual(['limit', CATEGORY_SEARCH_LIMIT + 1]);
  });

  it('maskiert Platzhalter für ilike', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('nutzt im Demo-Modus die festen Beispielkategorien ohne Datenbank', async () => {
    const { service, from } = createService([], true);

    const roots = await service.loadChildren(null);
    const search = await service.search('laptops');

    expect(roots.map((category) => category.id)).toEqual(['aa', 'el', 'ha', 'co']);
    expect(search.categories.map((category) => category.id)).toEqual(['el-6-6']);
    expect(from).not.toHaveBeenCalled();
  });

  it('liefert bekannte Kategorien aus dem Zwischenspeicher und lädt unbekannte einzeln', async () => {
    const { service, from } = createService([
      { data: [laptopRow], error: null },
      { data: { ...laptopRow, id: 'el-6', name: 'Computer', is_leaf: false }, error: null },
    ]);

    await service.loadChildren('el-6');
    await expect(service.getById('el-6-6')).resolves.toMatchObject({ name: 'Laptops' });
    await expect(service.getById('el-6')).resolves.toMatchObject({ isLeaf: false });
    expect(from).toHaveBeenCalledTimes(2);
  });
});
