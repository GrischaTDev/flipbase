import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Expense } from '../models/expense.models';
import { AuthService } from './auth.service';
import { ExpenseService } from './expense.service';
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

const paidExpense: Expense = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: workspace.id,
  category_id: '22222222-2222-4222-8222-222222222222',
  recurring_rule_id: null,
  occurrence_date: null,
  title: 'Paketband',
  vendor_name: 'Bürohandel',
  quantity: 4,
  gross_amount: 12.5,
  vat_rate: null,
  expense_date: '2026-09-01',
  due_date: null,
  status: 'paid',
  payment_date: '2026-09-03',
  notes: null,
  deleted_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  created_by: 'user-1',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function createService(rows: Expense[] = [paidExpense]) {
  const currentWorkspace = signal(workspace);
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: async () => ({ data: rows, error: null }),
  });

  const insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: paidExpense, error: null }) }),
  }));
  const updateQuery: Record<string, unknown> = {};
  Object.assign(updateQuery, {
    eq: () => updateQuery,
    select: () => ({ single: async () => ({ data: paidExpense, error: null }) }),
  });
  const update = vi.fn(() => updateQuery);
  const from = vi.fn(() => ({ ...query, insert, update }));

  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(false);

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
    ],
  });

  const service = runInInjectionContext(injector, () => new ExpenseService());
  return { service, insert, update };
}

describe('ExpenseService', () => {
  it('lädt nur aktive Ausgaben des aktuellen Workspace', async () => {
    const { service } = createService();

    await service.load();

    expect(service.expenses()).toEqual([paidExpense]);
  });

  it('legt eine manuelle bezahlte Ausgabe mit Zahlungsdatum an', async () => {
    const { service, insert } = createService();

    const result = await service.create({
      category_id: paidExpense.category_id,
      title: 'Paketband',
      vendor_name: 'Bürohandel',
      quantity: 4,
      gross_amount: 12.5,
      vat_rate: null,
      expense_date: '2026-09-01',
      due_date: null,
      status: 'paid',
      payment_date: '2026-09-03',
      notes: null,
    });

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_name: 'Bürohandel',
        quantity: 4,
        gross_amount: 12.5,
      }),
    );
  });

  it('markiert eine Ausgabe bezahlt und wieder offen', async () => {
    const { service, update } = createService();
    await service.load();

    expect((await service.markPaid(paidExpense.id, '2026-09-05')).error).toBeNull();
    expect((await service.markOpen(paidExpense.id)).error).toBeNull();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('soft-löscht statt einen Datensatz hart zu löschen', async () => {
    const { service, update } = createService();
    await service.load();

    const result = await service.remove(paidExpense.id);

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalled();
  });

  it('summiert Cashflow-Ausgaben nach Zahlungsdatum statt Rechnungsdatum', async () => {
    const { service } = createService([
      paidExpense,
      {
        ...paidExpense,
        id: 'outside',
        expense_date: '2026-09-15',
        payment_date: '2026-10-01',
        gross_amount: 50,
      },
      {
        ...paidExpense,
        id: 'open',
        status: 'open',
        payment_date: null,
        gross_amount: 99,
      },
    ]);
    await service.load();

    expect(service.paidTotalBetween('2026-09-01', '2026-09-30')).toBe(12.5);
  });
});
