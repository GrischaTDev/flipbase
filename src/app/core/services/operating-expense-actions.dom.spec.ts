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
const user = { id: 'user-1' };

const category: OperatingExpenseCategory = {
  id: 'cat-1',
  workspace_id: workspace.id,
  name: 'Hosting & Server',
  default_key: 'hosting_server',
  archived_at: null,
  created_at: '2026-09-18T08:00:00.000Z',
  created_by: user.id,
};

const recurringRule: RecurringOperatingExpense = {
  id: 'rule-1',
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
  created_by: user.id,
};

function createActionService() {
  const categoriesRaw = signal<readonly OperatingExpenseCategory[]>([category]);
  const recurringRulesRaw = signal<readonly RecurringOperatingExpense[]>([]);
  const expensesRaw = signal<readonly OperatingExpense[]>([]);

  const insert = vi.fn((payload: Record<string, unknown>) => ({
    select: () => ({
      single: async () => {
        if ('interval' in payload) {
          return {
            data: { ...recurringRule, ...payload, id: 'rule-created' },
            error: null,
          };
        }
        return {
          data: {
            ...category,
            ...payload,
            id: 'cat-created',
            default_key: null,
            archived_at: null,
          },
          error: null,
        };
      },
    }),
  }));

  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: () => ({
      eq: () => ({
        select: () => ({
          single: async () => {
            if ('archived_at' in payload && recurringRulesRaw().length > 0) {
              return {
                data: { ...recurringRulesRaw()[0], ...payload },
                error: null,
              };
            }
            return {
              data: { ...categoriesRaw()[0], ...payload },
              error: null,
            };
          },
        }),
      }),
    }),
  }));

  const from = vi.fn((table: string) => ({ insert, update, table }));

  const service = Object.create(OperatingExpenseService.prototype) as OperatingExpenseService;
  Object.assign(service, {
    categoriesRaw,
    recurringRulesRaw,
    expensesRaw,
    categories: categoriesRaw.asReadonly(),
    recurringRules: recurringRulesRaw.asReadonly(),
    expenses: expensesRaw.asReadonly(),
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: () => workspace },
    auth: { currentUser: () => user },
    mockStore: { isDemoMode: () => false },
    syncStatus: new SyncStatusService(),
    supabase: { client: { from, rpc: vi.fn(async () => ({ data: 0, error: null })) } },
  });

  return { service, insert, update, recurringRulesRaw };
}

describe('OperatingExpenseService category actions', () => {
  it('legt eine eigene Kategorie im aktuellen Workspace an', async () => {
    const { service, insert } = createActionService();

    const result = await service.createCategory('  Verpackung Spezial  ');

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        name: 'Verpackung Spezial',
        created_by: user.id,
      }),
    );
    expect(service.categories().some((entry) => entry.name === 'Verpackung Spezial')).toBe(true);
  });

  it('archiviert eine Kategorie statt sie hart zu löschen', async () => {
    const { service, update } = createActionService();

    const result = await service.archiveCategory(category.id);

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ archived_at: expect.any(String) }),
    );
    expect(service.categories()[0]?.archived_at).not.toBeNull();
  });
});

describe('OperatingExpenseService recurring actions', () => {
  it('legt eine monatliche Regel an und materialisiert bereits fällige Instanzen', async () => {
    const { service, insert } = createActionService();
    const loadWorkspace = vi.spyOn(service, 'loadWorkspace').mockResolvedValue();

    const result = await service.createRecurringRule(
      {
        categoryId: category.id,
        title: 'Server',
        grossAmount: 29.9,
        vatRate: 19,
        interval: 'monthly',
        startDate: '2026-09-01',
        endDate: null,
      },
      '2026-09-18',
    );

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: 'monthly',
        start_date: '2026-09-01',
        next_due_date: '2026-09-01',
      }),
    );
    expect(loadWorkspace).toHaveBeenCalledWith(workspace.id, '2026-09-18');
  });

  it('archiviert eine Wiederholungsregel, ohne erzeugte Ausgaben anzufassen', async () => {
    const { service, update, recurringRulesRaw } = createActionService();
    recurringRulesRaw.set([recurringRule]);

    const result = await service.archiveRecurringRule(recurringRule.id);

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ archived_at: expect.any(String) }),
    );
    expect(service.recurringRules()[0]?.archived_at).not.toBeNull();
  });
});
