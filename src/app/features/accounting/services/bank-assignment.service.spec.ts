import '@angular/compiler';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankAssignmentService } from './bank-assignment.service';
import { BankReconciliationService } from '../../../core/services/bank-reconciliation.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { SalesService } from '../../../core/services/sales.service';
import { PurchaseService } from '../../../core/services/purchase.service';
import { StoreService } from '../../../core/services/store.service';
import { ExpenseService } from '../../../core/services/expense.service';
import type { Sale } from '../../../core/models/flipbase.models';
import type { BankTransaction } from '../../../core/models/bank-reconciliation.models';

const tx: BankTransaction = {
  id: 'tx',
  amount: 80,
  currency: 'EUR',
  status: 'pending',
  bookingDate: '2026-10-19',
  counterpartyName: 'Käufer',
  purpose: 'Hemd',
};
const sale = {
  id: 'sale',
  workspace_id: 'ws',
  sale_price: 80,
  sale_date: '2026-10-19',
  record_number: 'VK-42',
  inventory_item: { title: 'Hemd' },
} as Sale;
const injectors: EnvironmentInjector[] = [];
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
});
function setup() {
  const workspace = signal<{ id: string } | null>({ id: 'ws' });
  const user = signal<{ id: string } | null>({ id: 'user' });
  const sales = {
    sales: signal([sale]),
    loadSales: vi.fn(async (_id: string) => undefined),
    loadError: signal<Error | null>(null),
    loadedWorkspaceId: signal<string | null>('ws'),
  };
  const bank = {
    transactions: signal([tx]),
    manualAssign: vi.fn(async () => ({ status: 'success', success: true, message: 'Gespeichert' })),
  };
  const expense = {
    expenses: signal([]),
    load: vi.fn(async () => true),
    loadError: signal<Error | null>(null),
  };
  const injector = createEnvironmentInjector(
    [
      BankAssignmentService,
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: SalesService, useValue: sales },
      {
        provide: PurchaseService,
        useValue: {
          purchases: signal([]),
          loadPurchases: vi.fn(async () => undefined),
          loadedWorkspaceId: signal('ws'),
          loadError: signal(null),
        },
      },
      {
        provide: StoreService,
        useValue: {
          orders: signal([]),
          storeSettings: () => ({ currency: 'EUR' }),
          loadFromSupabase: vi.fn(async () => undefined),
          loadedWorkspaceId: signal('ws'),
        },
      },
      { provide: ExpenseService, useValue: expense },
      { provide: BankReconciliationService, useValue: bank },
    ],
    {} as EnvironmentInjector,
  );
  injectors.push(injector);
  const service = runInInjectionContext(injector, () => injector.get(BankAssignmentService));
  return { service, workspace, user, sales, bank, expense };
}
describe('Manuelle Bankzuordnung: Daten und Speichern', () => {
  it('lädt echte Ziele und speichert nach erneuter Prüfung ausschließlich die Zuordnung', async () => {
    const { service, bank, sales } = setup();
    const context = service.captureContext();
    const [target] = await service.loadTargets(tx, 'sale', context);
    await service.assign(tx, target, context, false);
    expect(sales.loadSales).toHaveBeenCalledTimes(2);
    expect(bank.manualAssign).toHaveBeenCalledWith(
      tx.id,
      expect.objectContaining({
        targetType: 'sale',
        targetId: sale.id,
        targetReference: 'VK-42',
        confidenceLabel: 'manual',
      }),
    );
    expect(sales.sales()[0].sale_price).toBe(80);
  });
  it('zeigt Ladefehler und verwendet keinen alten Datenstand', async () => {
    const { service, sales } = setup();
    sales.loadError.set(new Error('offline'));
    await expect(service.loadTargets(tx, 'sale', service.captureContext())).rejects.toThrow();
  });
  it('verhindert Schreiben nach Workspace- oder Benutzerwechsel', async () => {
    const { service, workspace, user, bank } = setup();
    const context = service.captureContext();
    const [target] = await service.loadTargets(tx, 'sale', context);
    workspace.set({ id: 'other' });
    await expect(service.assign(tx, target, context, false)).rejects.toThrow();
    workspace.set({ id: 'ws' });
    user.set({ id: 'other-user' });
    await expect(service.assign(tx, target, context, false)).rejects.toThrow();
    expect(bank.manualAssign).not.toHaveBeenCalled();
  });
  it('verhindert inzwischen entfernte oder geänderte Ziele', async () => {
    const { service, sales, bank } = setup();
    const context = service.captureContext();
    const [target] = await service.loadTargets(tx, 'sale', context);
    sales.sales.set([{ ...sale, sale_price: 90 }]);
    await expect(service.assign(tx, target, context, true)).rejects.toThrow();
    sales.sales.set([]);
    await expect(service.assign(tx, target, context, false)).rejects.toThrow();
    expect(bank.manualAssign).not.toHaveBeenCalled();
  });
  it('verlangt eine bewusste Bestätigung unterschiedlicher Beträge', async () => {
    const { service, bank } = setup();
    const context = service.captureContext();
    const lower = { ...tx, amount: 75 };
    bank.transactions.set([lower]);
    const [target] = await service.loadTargets(lower, 'sale', context);
    await expect(service.assign(lower, target, context, false)).rejects.toThrow();
    expect(bank.manualAssign).not.toHaveBeenCalled();
    await service.assign(lower, target, context, true);
    expect(bank.manualAssign).toHaveBeenCalledTimes(1);
  });
  it('verhindert Doppelzuordnung und reagiert auf inzwischen gebuchte Bewegung', async () => {
    const { service, bank } = setup();
    const context = service.captureContext();
    const [target] = await service.loadTargets(tx, 'sale', context);
    bank.transactions.set([{ ...tx, status: 'booked' }]);
    await expect(service.assign(tx, target, context, false)).rejects.toThrow();
    bank.transactions.set([
      tx,
      {
        ...tx,
        id: 'other',
        status: 'matched',
        match: {
          targetType: 'sale',
          targetId: sale.id,
          targetReference: 'VK-42',
          targetAmount: 80,
          confidence: 100,
          confidenceLabel: 'manual',
          reason: 'Manuell',
        },
      },
    ]);
    expect(await service.loadTargets(tx, 'sale', context)).toEqual([]);
    expect(bank.manualAssign).not.toHaveBeenCalled();
  });
  it('prüft die Bankbewegung nach dem Nachladen des Ziels erneut', async () => {
    const { service, sales, bank } = setup();
    const context = service.captureContext();
    const [target] = await service.loadTargets(tx, 'sale', context);
    sales.loadSales.mockImplementationOnce(async () => {
      bank.transactions.set([{ ...tx, amount: 90 }]);
    });
    await expect(service.assign(tx, target, context, false)).rejects.toThrow();
    expect(bank.manualAssign).not.toHaveBeenCalled();
  });
});
