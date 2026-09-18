import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseRecurringRule, ExpenseRecurringRuleInput } from '../models/expense.models';
import { ExpenseRecurringService } from './expense-recurring.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const user = { id: '22222222-2222-4222-8222-222222222222' };

const storedRule: ExpenseRecurringRule = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  category_id: '44444444-4444-4444-8444-444444444444',
  title: 'Server',
  gross_amount: 29.9,
  vat_rate: 19,
  frequency: 'monthly',
  start_date: '2026-09-01',
  end_date: null,
  is_active: true,
  notes: null,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: user.id,
  updated_at: '2026-09-18T10:00:00.000Z',
};

const input: ExpenseRecurringRuleInput = {
  category_id: storedRule.category_id,
  title: 'Server',
  gross_amount: 29.9,
  vat_rate: 19,
  frequency: 'monthly',
  start_date: '2026-09-01',
  end_date: null,
  is_active: true,
  notes: null,
};

function createService() {
  const loadOrder = vi.fn(async () => ({ data: [storedRule], error: null }));
  const loadEq = vi.fn(() => ({ order: loadOrder }));
  const insertSingle = vi.fn(async () => ({ data: storedRule, error: null }));
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
  const updateSingle = vi.fn(async () => ({ data: storedRule, error: null }));
  const updateEq = vi.fn(() => ({ select: () => ({ single: updateSingle }) }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({
    select: () => ({ eq: loadEq }),
    insert,
    update,
  }));

  const service = Object.create(ExpenseRecurringService.prototype) as ExpenseRecurringService;
  const rules = signal<readonly ExpenseRecurringRule[]>([]);
  Object.assign(service, {
    rules,
    isLoading: signal(false),
    loadError: signal<string | null>(null),
    workspaceService: { currentWorkspace: signal(workspace) },
    mockStore: { isDemoMode: signal(false) },
    syncStatus: new SyncStatusService(),
    auth: { currentUser: signal(user) },
    supabase: { client: { from } },
  });

  return { service, insert, update };
}

describe('ExpenseRecurringService', () => {
  it('lädt wiederkehrende Regeln für den aktiven Workspace', async () => {
    const { service } = createService();

    await service.loadCurrentWorkspace();

    expect(service.rules()).toEqual([storedRule]);
  });

  it('legt eine wiederkehrende Ausgabe an ohne konkrete Ausgabe vorzutäuschen', async () => {
    const { service, insert } = createService();

    const result = await service.create(input);

    expect(result.error).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspace.id,
        title: 'Server',
        frequency: 'monthly',
        created_by: user.id,
      }),
    );
  });

  it('deaktiviert Regeln statt sie zu löschen', async () => {
    const { service, update } = createService();
    await service.loadCurrentWorkspace();

    const result = await service.setActive(storedRule.id, false);

    expect(result.error).toBeNull();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });

  it('berechnet die nächste Fälligkeit aus der Regel', async () => {
    const { service } = createService();
    await service.loadCurrentWorkspace();

    expect(service.nextDue(storedRule, '2026-09-18')).toBe('2026-10-01');
  });
});
