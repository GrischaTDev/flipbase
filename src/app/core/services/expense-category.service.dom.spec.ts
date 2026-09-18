import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseCategory } from '../models/expense.models';
import { AuthService } from './auth.service';
import { ExpenseCategoryService } from './expense-category.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  min_roi_percent: 30,
  min_profit_amount: 15,
};

const category: ExpenseCategory = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspace.id,
  name: 'Versandmaterial',
  sort_order: 10,
  is_default: true,
  is_archived: false,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: null,
  updated_at: '2026-09-18T10:00:00.000Z',
};

function createService(
  options: {
    rows?: ExpenseCategory[];
    insertRow?: ExpenseCategory;
    updateRow?: ExpenseCategory;
    demo?: boolean;
  } = {},
) {
  const currentWorkspace = signal(workspace);
  const selectResult = vi.fn(async () => ({ data: options.rows ?? [category], error: null }));
  const singleInsert = vi.fn(async () => ({
    data: options.insertRow ?? {
      ...category,
      id: 'custom',
      name: 'Eigene Kategorie',
      is_default: false,
    },
    error: null,
  }));
  const singleUpdate = vi.fn(async () => ({
    data: options.updateRow ?? { ...category, name: 'Versand & Verpackung' },
    error: null,
  }));

  const selectQuery: Record<string, unknown> = {};
  Object.assign(selectQuery, {
    select: () => selectQuery,
    eq: () => selectQuery,
    order: () => selectResult(),
  });

  const updateQuery: Record<string, unknown> = {};
  Object.assign(updateQuery, {
    eq: () => updateQuery,
    select: () => ({ single: singleUpdate }),
  });

  const from = vi.fn(() => ({
    ...selectQuery,
    insert: vi.fn(() => ({ select: () => ({ single: singleInsert }) })),
    update: vi.fn(() => updateQuery),
  }));

  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(options.demo ?? false);

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
    ],
  });

  const service = runInInjectionContext(injector, () => new ExpenseCategoryService());
  return { service, from, currentWorkspace, singleInsert, singleUpdate };
}

describe('ExpenseCategoryService', () => {
  it('lädt und sortiert aktive Kategorien des aktuellen Workspace', async () => {
    const { service } = createService({
      rows: [
        { ...category, id: 'b', name: 'Software & Abos', sort_order: 40 },
        { ...category, id: 'a', name: 'Versandmaterial', sort_order: 10 },
        { ...category, id: 'c', name: 'Archiv', sort_order: 5, is_archived: true },
      ],
    });

    await service.load();

    expect(service.categories().map((entry) => entry.name)).toEqual([
      'Versandmaterial',
      'Software & Abos',
    ]);
  });

  it('legt eine eigene Kategorie mit Workspace und Ersteller an', async () => {
    const { service, singleInsert } = createService();

    const result = await service.create('  Eigene Kategorie  ');

    expect(result.error).toBeNull();
    expect(singleInsert).toHaveBeenCalled();
    expect(service.categories()).toContainEqual(
      expect.objectContaining({ name: 'Eigene Kategorie', is_default: false }),
    );
  });

  it('benennt eine Kategorie um', async () => {
    const { service, singleUpdate } = createService();
    await service.load();

    const result = await service.rename(category.id, 'Versand & Verpackung');

    expect(result.error).toBeNull();
    expect(singleUpdate).toHaveBeenCalled();
    expect(service.categories()[0]?.name).toBe('Versand & Verpackung');
  });

  it('archiviert Kategorien statt sie hart zu löschen', async () => {
    const archived = { ...category, is_archived: true };
    const { service } = createService({ updateRow: archived });
    await service.load();

    const result = await service.archive(category.id);

    expect(result.error).toBeNull();
    expect(service.categories()).toEqual([]);
  });
});
