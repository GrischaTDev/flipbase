import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import {
  OperatingExpense,
  OperatingExpenseCategory,
  RecurringOperatingExpense,
} from '../models/operating-expense.models';
import { OperatingExpenseService } from './operating-expense.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };

const category: OperatingExpenseCategory = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspace.id,
  name: 'Hosting & Server',
  default_key: 'hosting_server',
  archived_at: null,
  created_at: '2026-09-18T08:00:00.000Z',
  created_by: null,
};

const paidExpense: OperatingExpense = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  category_id: category.id,
  recurring_rule_id: null,
  recurrence_date: null,
  title: 'Server September',
  gross_amount: 29.9,
  vat_rate: 19,
  expense_date: '2026-09-01',
  status: 'paid',
  due_date: null,
  paid_at: '2026-09-03',
  created_at: '2026-09-18T08:00:00.000Z',
  updated_at: '2026-09-18T08:00:00.000Z',
  created_by: 'user-1',
};

const recurringRule: RecurringOperatingExpense = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: workspace.id,
  category_id: category.id,
  title: 'Server',
  gross_amount: 29.9,
  vat_rate: 19,
  interval: 'monthly',
  start_date: '2026-09-01',
  end_date: null,
  next_due_date: '2026-10-01',
  archived_at: null,
  created_at: '2026-09-01T08:00:00.000Z',
  updated_at: '2026-09-01T08:00:00.000Z',
  created_by: 'user-1',
};

function createService() {
  const events: string[] = [];
  const rpc = vi.fn(async () => {
    events.push('rpc');
    return { data: 1, error: null };
  });
  const insertExpense = vi.fn((payload: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({ data: { ...paidExpense, ...payload }, error: null }),
    }),
  }));

  const rows: Record<string, readonly unknown[]> = {
    operating_expense_categories: [category],
    recurring_operating_expenses: [recurringRule],
    operating_expenses: [paidExpense],
  };

  const from = vi.fn((table: string) => {
    if (table === 'operating_expenses') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => {
              events.push('select:operating_expenses');
              return { data: rows[table], error: null };
            },
          }),
        }),
        insert: insertExpense,
      };
    }
    return {
      select: () => ({
        eq: () => ({
          order: async () => {
            events.push(`select:${table}`);
            return { data: rows[table], error: null };
          },
        }),
      }),
    };
  });

  const categoriesRaw = signal<readonly OperatingExpenseCategory[]>([]);
  const expensesRaw = signal<readonly OperatingExpense[]>([]);
  const recurringRulesRaw = signal<readonly RecurringOperatingExpense[]>([]);
  const service = Object.create(OperatingExpenseService.prototype) as OperatingExpenseService;
  Object.assign(service, {
    categoriesRaw,
    expensesRaw,
    recurringRulesRaw,
    categories: categoriesRaw.asReadonly(),
    expenses: expensesRaw.asReadonly(),
    recurringRules: recurringRulesRaw.asReadonly(),
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    currentRequestId: 0,
    supabase: { client: { rpc, from } },
    mockStore: { isDemoMode: () => false },
    syncStatus: new SyncStatusService(),
    workspaceService: { currentWorkspace: () => workspace },
    auth: { currentUser: () => ({ id: 'user-1' }) },
  });

  return { service, events, rpc, insertExpense };
}

describe('OperatingExpenseService', () => {
  it('materialisiert fällige Fixkosten vor dem Laden der Workspace-Ausgaben', async () => {
    const { service, events, rpc } = createService();

    await service.loadWorkspace(workspace.id, '2026-09-18');

    expect(rpc).toHaveBeenCalledWith('materialize_due_operating_expenses', {
      p_workspace_id: workspace.id,
      p_through_date: '2026-09-18',
    });
    expect(events[0]).toBe('rpc');
    expect(events.slice(1)).toEqual([
      'select:operating_expense_categories',
      'select:recurring_operating_expenses',
      'select:operating_expenses',
    ]);
    expect(service.categories()).toEqual([category]);
    expect(service.recurringRules()).toEqual([recurringRule]);
    expect(service.expenses()).toEqual([paidExpense]);
  });

  it('speichert eine bezahlte manuelle Ausgabe mit Zahlungsdatum und aktualisiert erst nach Erfolg', async () => {
    const { service, insertExpense } = createService();

    const result = await service.createExpense({
      categoryId: category.id,
      title: 'Server September',
      grossAmount: 29.9,
      vatRate: 19,
      expenseDate: '2026-09-01',
      status: 'paid',
      dueDate: null,
      paidAt: '2026-09-03',
    });

    expect(result.error).toBeNull();
    expect(insertExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        category_id: category.id,
        gross_amount: 29.9,
        vat_rate: 19,
        status: 'paid',
        paid_at: '2026-09-03',
        created_by: 'user-1',
      }),
    );
    expect(service.expenses()).toHaveLength(1);
  });

  it('speichert offene Ausgaben ausdrücklich ohne Zahlungsdatum', async () => {
    const { service, insertExpense } = createService();

    await service.createExpense({
      categoryId: category.id,
      title: 'Offene Rechnung',
      grossAmount: 35,
      vatRate: null,
      expenseDate: '2026-09-18',
      status: 'open',
      dueDate: '2026-09-30',
      paidAt: null,
    });

    expect(insertExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'open',
        due_date: '2026-09-30',
        paid_at: null,
      }),
    );
  });
});
