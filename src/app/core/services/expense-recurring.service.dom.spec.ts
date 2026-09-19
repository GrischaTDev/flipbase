import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseRecurringRule } from '../models/expense.models';
import { AuthService } from './auth.service';
import { ExpenseRecurringService } from './expense-recurring.service';
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

const rule: ExpenseRecurringRule = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  category_id: '22222222-2222-4222-8222-222222222222',
  title: 'Server',
  vendor_name: 'Netcup',
  quantity: 2,
  gross_amount: 29.9,
  vat_rate: 19,
  frequency: 'monthly',
  start_date: '2026-06-01',
  end_date: null,
  is_active: true,
  notes: null,
  created_at: '2026-06-01T00:00:00.000Z',
  created_by: 'user-1',
  updated_at: '2026-06-01T00:00:00.000Z',
};

function createService(rows: ExpenseRecurringRule[] = [rule]) {
  const currentWorkspace = signal(workspace);
  const selectQuery: Record<string, unknown> = {};
  Object.assign(selectQuery, {
    select: () => selectQuery,
    eq: () => selectQuery,
    order: async () => ({ data: rows, error: null }),
  });

  const upsert = vi.fn(
    async (
      _rows: unknown[],
      _options?: { readonly onConflict: string; readonly ignoreDuplicates: boolean },
    ) => ({ error: null }),
  );
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: rule, error: null }) }),
  }));
  const updateQuery: Record<string, unknown> = {};
  Object.assign(updateQuery, {
    eq: () => updateQuery,
    select: () => ({ single: async () => ({ data: rule, error: null }) }),
  });
  const update = vi.fn(() => updateQuery);

  const from = vi.fn((table: string) =>
    table === 'expenses' ? { upsert } : { ...selectQuery, insert, update },
  );

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

  const service = runInInjectionContext(injector, () => new ExpenseRecurringService());
  return { service, upsert, insert, update, from };
}

describe('ExpenseRecurringService', () => {
  it('lädt Wiederholungsregeln des Workspace', async () => {
    const { service } = createService();

    await service.load();

    expect(service.rules()).toEqual([rule]);
  });

  it('materialisiert alle verpassten Fälligkeiten bis zum Stichtag als offene Ausgaben', async () => {
    const { service, upsert } = createService();
    await service.load();

    const result = await service.materializeDue('2026-09-18');

    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          recurring_rule_id: rule.id,
          occurrence_date: '2026-06-01',
          status: 'open',
          payment_date: null,
          vendor_name: 'Netcup',
          quantity: 2,
        }),
        expect.objectContaining({ occurrence_date: '2026-07-01' }),
        expect.objectContaining({ occurrence_date: '2026-08-01' }),
        expect.objectContaining({ occurrence_date: '2026-09-01' }),
      ],
      {
        onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
        ignoreDuplicates: true,
      },
    );
  });

  it('legt keine zukünftige Fälligkeit an', async () => {
    const { service, upsert } = createService();
    await service.load();

    await service.materializeDue('2026-08-15');

    const rows = upsert.mock.calls[0]?.[0] as { occurrence_date: string }[];
    expect(rows.map((entry) => entry.occurrence_date)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ]);
  });

  it('zeigt kommende Fälligkeiten nur als Vorschau', async () => {
    const { service, upsert } = createService();
    await service.load();

    const upcoming = service.upcoming('2026-09-18', 30);

    expect(upcoming).toEqual([
      expect.objectContaining({ ruleId: rule.id, occurrenceDate: '2026-10-01' }),
    ]);
    expect(upsert).not.toHaveBeenCalled();
  });
});
