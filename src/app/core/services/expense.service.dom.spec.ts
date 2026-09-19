import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Expense } from '../models/expense.models';
import { AuthService } from './auth.service';
import { ExpenseRecurringService } from './expense-recurring.service';
import { ExpenseService } from './expense.service';
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
    order: () => query,
    range: async () => ({ data: rows, error: null }),
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

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
    ],
  });

  const service = runInInjectionContext(injector, () => new ExpenseService());
  return { service, insert, update };
}

interface QueryResult {
  readonly data: Expense[] | null;
  readonly error: Error | null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function workspaceExpense(workspaceId: string): Expense {
  return {
    ...paidExpense,
    id: `expense-${workspaceId}`,
    workspace_id: workspaceId,
    title: workspaceId,
  };
}

function createWorkspaceHarness(
  queryResult: (workspaceId: string, from: number, to: number) => Promise<QueryResult>,
  recurring: Pick<ExpenseRecurringService, 'load' | 'materializeDue'> | null = null,
) {
  const currentWorkspace = signal({ id: 'workspace-a' });
  const queriedWorkspaces: string[] = [];
  const ranges: (readonly [number, number])[] = [];
  const orders: (readonly [string, boolean])[] = [];
  const from = vi.fn(() => {
    let workspaceId = '';
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        if (column === 'workspace_id') workspaceId = value;
        return query;
      },
      is: () => query,
      order: (column: string, options: { ascending: boolean }) => {
        orders.push([column, options.ascending]);
        return query;
      },
      range: (start: number, end: number) => {
        queriedWorkspaces.push(workspaceId);
        ranges.push([start, end]);
        return queryResult(workspaceId, start, end);
      },
    };
    return query;
  });
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: SyncStatusService, useValue: { melde: (_label: string, cause: Error) => cause } },
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'user-1' }) } },
      { provide: ExpenseRecurringService, useValue: recurring },
    ],
  });
  const service = runInInjectionContext(injector, () => new ExpenseService());
  return { service, currentWorkspace, queriedWorkspaces, ranges, orders, injector };
}

describe('ExpenseService', () => {
  it('lädt A nach A→B→A frisch, wenn die erste A-Anfrage noch läuft', async () => {
    const first = deferred<QueryResult>();
    let aRequests = 0;
    const harness = createWorkspaceHarness(async (workspaceId) => {
      if (workspaceId === 'workspace-a' && ++aRequests === 1) return first.promise;
      return { data: [workspaceExpense(workspaceId)], error: null };
    });

    const initial = harness.service.ensureCurrentWorkspaceLoaded();
    harness.currentWorkspace.set({ id: 'workspace-b' });
    await harness.service.ensureCurrentWorkspaceLoaded();
    harness.currentWorkspace.set({ id: 'workspace-a' });
    const returned = harness.service.ensureCurrentWorkspaceLoaded();
    first.resolve({ data: [workspaceExpense('workspace-a')], error: null });
    await Promise.all([initial, returned]);

    try {
      expect(harness.service.expenses().map((row) => row.workspace_id)).toEqual(['workspace-a']);
    } finally {
      harness.injector.destroy();
    }
  });

  it('ordnet Ausgabenseiten stabil nach Datum und ID', async () => {
    const harness = createWorkspaceHarness(async () => ({ data: [], error: null }));

    await harness.service.load();

    expect(harness.orders).toEqual([
      ['expense_date', false],
      ['id', false],
    ]);
    harness.injector.destroy();
  });

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

  it('prüft beim nächsten Aufruf an einem neuen Tag erneut fällige Wiederholungen', async () => {
    vi.useFakeTimers();
    const materializeDue = vi.fn().mockResolvedValue({ count: 0, error: null });
    const harness = createWorkspaceHarness(async () => ({ data: [], error: null }), {
      load: vi.fn().mockResolvedValue(true),
      materializeDue,
    });

    try {
      vi.setSystemTime(new Date(2026, 8, 19, 12));
      await harness.service.ensureCurrentWorkspaceLoaded();
      vi.setSystemTime(new Date(2026, 8, 20, 12));
      await harness.service.ensureCurrentWorkspaceLoaded();

      expect(materializeDue.mock.calls.map(([date]) => date)).toEqual(['2026-09-19', '2026-09-20']);
    } finally {
      vi.useRealTimers();
      harness.injector.destroy();
    }
  });

  it('verwirft die verspätete Antwort des vorherigen Workspace', async () => {
    const first = deferred<QueryResult>();
    const harness = createWorkspaceHarness(async (workspaceId) =>
      workspaceId === 'workspace-a'
        ? first.promise
        : { data: [workspaceExpense(workspaceId)], error: null },
    );

    const initial = harness.service.load();
    harness.currentWorkspace.set({ id: 'workspace-b' });
    await harness.service.load();
    first.resolve({ data: [workspaceExpense('workspace-a')], error: null });
    await initial;

    expect(harness.service.expenses().map((row) => row.workspace_id)).toEqual(['workspace-b']);
    harness.injector.destroy();
  });

  it('lädt den neuen Workspace auch bei noch laufender Anfrage des vorherigen', async () => {
    const first = deferred<QueryResult>();
    const harness = createWorkspaceHarness(async (workspaceId) =>
      workspaceId === 'workspace-a'
        ? first.promise
        : { data: [workspaceExpense(workspaceId)], error: null },
    );

    const initial = harness.service.ensureCurrentWorkspaceLoaded();
    harness.currentWorkspace.set({ id: 'workspace-b' });
    const next = harness.service.ensureCurrentWorkspaceLoaded();
    first.resolve({ data: [workspaceExpense('workspace-a')], error: null });
    await Promise.all([initial, next]);

    expect(harness.queriedWorkspaces).toContain('workspace-b');
    harness.injector.destroy();
  });

  it('wiederholt einen fehlgeschlagenen Ladevorgang beim nächsten Aufruf', async () => {
    const response = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValue({ data: [workspaceExpense('workspace-a')], error: null });
    const harness = createWorkspaceHarness(async () => response());

    await harness.service.ensureCurrentWorkspaceLoaded();
    await harness.service.ensureCurrentWorkspaceLoaded();

    expect(response).toHaveBeenCalledTimes(2);
    harness.injector.destroy();
  });

  it('lädt auch mehr als tausend Ausgaben vollständig', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      ...workspaceExpense('workspace-a'),
      id: `expense-${index}`,
    }));
    const harness = createWorkspaceHarness(async (_workspaceId, start) => ({
      data: rows.slice(start, start + 1000),
      error: null,
    }));

    await harness.service.load();

    expect(harness.service.expenses()).toHaveLength(1001);
    expect(harness.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    harness.injector.destroy();
  });
});
