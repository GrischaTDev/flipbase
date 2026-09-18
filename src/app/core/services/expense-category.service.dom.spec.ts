import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseCategory } from '../models/expense.models';
import { ExpenseCategoryService } from './expense-category.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const user = { id: '22222222-2222-4222-8222-222222222222' };

const category: ExpenseCategory = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  name: 'Versandmaterial',
  sort_order: 10,
  is_default: true,
  is_archived: false,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: null,
  updated_at: '2026-09-18T10:00:00.000Z',
};

function createService(options: { demo?: boolean } = {}) {
  const orderName = vi.fn(async () => ({ data: [category], error: null }));
  const orderSort = vi.fn(() => ({ order: orderName }));
  const loadEq = vi.fn(() => ({ order: orderSort }));

  const created: ExpenseCategory = {
    ...category,
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Eigene Kategorie',
    is_default: false,
    created_by: user.id,
  };
  const singleInsert = vi.fn(async () => ({ data: created, error: null }));
  const insert = vi.fn(() => ({ select: () => ({ single: singleInsert }) }));

  const updated: ExpenseCategory = { ...created, name: 'Lagerbedarf' };
  const updateSelect = vi.fn(async () => ({ data: [updated], error: null }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const from = vi.fn(() => ({
    select: () => ({ eq: loadEq }),
    insert,
    update,
  }));

  const service = Object.create(ExpenseCategoryService.prototype) as ExpenseCategoryService;
  const categories = signal<readonly ExpenseCategory[]>([]);
  Object.assign(service, {
    categories,
    activeCategories: computed(() => categories().filter((entry) => !entry.is_archived)),
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore: { isDemoMode: signal(options.demo ?? false) },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: signal(user) },
    supabase: { client: { from } },
  });

  return { service, from, insert, update, updateEq };
}

describe('ExpenseCategoryService', () => {
  it('lädt Kategorien des aktiven Workspace sortiert', async () => {
    const { service, from } = createService();

    await service.loadCurrentWorkspace();

    expect(from).toHaveBeenCalledWith('expense_categories');
    expect(service.categories()).toEqual([category]);
    expect(service.activeCategories()).toEqual([category]);
  });

  it('legt eine eigene Kategorie mit Workspace und Ersteller an', async () => {
    const { service, insert } = createService();

    const result = await service.create('  Eigene Kategorie  ');

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        name: 'Eigene Kategorie',
        is_default: false,
        created_by: user.id,
      }),
    );
    expect(service.categories().map((entry) => entry.name)).toContain('Eigene Kategorie');
  });

  it('archiviert Kategorien statt sie zu löschen', async () => {
    const { service, update } = createService();
    await service.loadCurrentWorkspace();

    const result = await service.setArchived(category.id, true);

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_archived: true }));
  });

  it('speichert im Demo-Modus keine Kategorien', async () => {
    const { service, insert } = createService({ demo: true });

    const result = await service.create('Demo-Kategorie');

    expect(insert).not.toHaveBeenCalled();
    expect(result.error?.message).toContain('Demo');
  });
});
