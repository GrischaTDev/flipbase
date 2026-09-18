import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Expense, ExpenseInput, ExpenseRecurringRule } from '../models/expense.models';
import { ExpenseService } from './expense.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const user = { id: '22222222-2222-4222-8222-222222222222' };
const categoryId = '33333333-3333-4333-8333-333333333333';

const storedExpense: Expense = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: workspace.id,
  category_id: categoryId,
  recurring_rule_id: null,
  occurrence_date: null,
  title: 'Kartons',
  gross_amount: 35,
  vat_rate: 19,
  expense_date: '2026-09-18',
  due_date: null,
  status: 'paid',
  payment_date: '2026-09-18',
  notes: null,
  deleted_at: null,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: user.id,
  updated_at: '2026-09-18T10:00:00.000Z',
};

const input: ExpenseInput = {
  category_id: categoryId,
  title: 'Kartons',
  gross_amount: 35,
  vat_rate: 19,
  expense_date: '2026-09-18',
  due_date: null,
  status: 'paid',
  payment_date: '2026-09-18',
  notes: null,
};

const recurringRule: ExpenseRecurringRule = {
  id: '55555555-5555-4555-8555-555555555555',
  workspace_id: workspace.id,
  category_id: categoryId,
  title: 'Server',
  gross_amount: 29.9,
  vat_rate: 19,
  frequency: 'monthly',
  start_date: '2026-07-01',
  end_date: null,
  is_active: true,
  notes: null,
  created_at: '2026-07-01T00:00:00.000Z',
  created_by: user.id,
  updated_at: '2026-07-01T00:00:00.000Z',
};

function createService(existing: Expense[] = [storedExpense]) {
  const loadOrder = vi.fn(async () => ({ data: existing, error: null }));
  const loadIs = vi.fn(() => ({ order: loadOrder }));
  const loadEq = vi.fn(() => ({ is: loadIs }));

  const insertSingle = vi.fn(async () => ({ data: storedExpense, error: null }));
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));

  const updateSelect = vi.fn(async () => ({ data: [storedExpense], error: null }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const upsert = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn(() => ({
    select: () => ({ eq: loadEq }),
    insert,
    update,
    upsert,
  }));

  const service = Object.create(ExpenseService.prototype) as ExpenseService;
  const expenses = signal<readonly Expense[]>([]);
  Object.assign(service, {
    expenses,
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore: { isDemoMode: signal(false) },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: signal(user) },
    recurringService: { rules: signal<readonly ExpenseRecurringRule[]>([recurringRule]) },
    supabase: { client: { from } },
  });

  return { service, insert, update, upsert };
}

describe('ExpenseService', () => {
  it('lädt nur nicht gelöschte Ausgaben des aktiven Workspace', async () => {
    const { service } = createService();

    await service.loadCurrentWorkspace();

    expect(service.expenses()).toEqual([storedExpense]);
  });

  it('speichert eine manuelle Ausgabe mit Workspace und Ersteller', async () => {
    const { service, insert } = createService([]);

    const result = await service.create(input);

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        title: 'Kartons',
        status: 'paid',
        payment_date: '2026-09-18',
        created_by: user.id,
      }),
    );
  });

  it('markiert eine offene Ausgabe mit Zahlungsdatum als bezahlt', async () => {
    const open = { ...storedExpense, status: 'open' as const, payment_date: null };
    const { service, update } = createService([open]);
    await service.loadCurrentWorkspace();

    const result = await service.markPaid(open.id, '2026-09-20');

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith({
      status: 'paid',
      payment_date: '2026-09-20',
    });
  });

  it('soft-löscht Ausgaben statt den Datensatz zu entfernen', async () => {
    const { service, update } = createService();
    await service.loadCurrentWorkspace();

    const result = await service.softDelete(storedExpense.id);

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith({
      deleted_at: expect.any(String),
    });
  });

  it('materialisiert alle fälligen Wiederholungen bis zum Stichtag idempotent', async () => {
    const { service, upsert } = createService([]);

    await service.materializeDue('2026-09-18');

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({ occurrence_date: '2026-07-01', status: 'open' }),
        expect.objectContaining({ occurrence_date: '2026-08-01', status: 'open' }),
        expect.objectContaining({ occurrence_date: '2026-09-01', status: 'open' }),
      ],
      {
        onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
        ignoreDuplicates: true,
      },
    );
  });
});
