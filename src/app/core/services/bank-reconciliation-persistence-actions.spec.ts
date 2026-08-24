import '@angular/compiler';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BankTransaction } from '../models/bank-reconciliation.models';
import { StoreOrder } from '../models/store.models';
import { InvoiceService } from './invoice.service';
import { MockDataStoreService } from './mock-data-store.service';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { StoreService } from './store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';
import { BankReconciliationService } from './bank-reconciliation.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => (resolve = resolver));
  return { promise, resolve };
}

const order: StoreOrder = {
  id: '10000000-0000-4000-8000-000000000001',
  orderNumber: 'ORD-1001',
  status: 'confirmed',
  createdAt: '2026-08-24T10:00:00.000Z',
  items: [],
  customer: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    street: 'Testweg',
    houseNumber: '1',
    zip: '10115',
    city: 'Berlin',
    country: 'Deutschland',
    shippingMethod: 'dhl_standard',
    paymentMethod: 'bank_transfer',
  },
  subtotal: 50,
  shippingCost: 0,
  total: 50,
  paymentStatus: 'pending',
  paymentMethod: 'bank_transfer',
};

function transaction(id: string, confidence = 100): BankTransaction {
  return {
    id,
    bookingDate: '2026-08-24',
    counterpartyName: 'Ada Lovelace',
    purpose: `Bestellung ${order.orderNumber}`,
    amount: 50,
    currency: 'EUR',
    status: 'matched',
    match: {
      targetType: 'store_order',
      targetId: order.id,
      targetReference: order.orderNumber,
      targetAmount: 50,
      confidence,
      confidenceLabel: 'exact',
      reason: 'Testtreffer',
      order,
    },
  };
}

describe('BankReconciliationService – bestätigte Persistenz', () => {
  let injector: EnvironmentInjector;
  let service: BankReconciliationService;
  let orders: ReturnType<typeof signal<StoreOrder[]>>;
  let rpc: ReturnType<typeof vi.fn>;
  let syncStatus: SyncStatusService;
  let workspace: ReturnType<typeof signal<{ id: string } | null>>;

  beforeEach(() => {
    orders = signal([order]);
    rpc = vi.fn(async () => ({ data: {}, error: null }));
    syncStatus = new SyncStatusService();
    workspace = signal<{ id: string } | null>({ id: 'ws-1' });
    injector = createEnvironmentInjector(
      [
        provideZonelessChangeDetection(),
        { provide: SupabaseService, useValue: { client: { rpc } } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: MockDataStoreService, useValue: { isDemoMode: () => false } },
        { provide: SyncStatusService, useValue: syncStatus },
        { provide: StoreService, useValue: { orders } },
        { provide: SalesService, useValue: { sales: signal([]) } },
        { provide: PurchaseService, useValue: { purchases: signal([]) } },
        { provide: InvoiceService, useValue: { invoices: signal([]) } },
      ],
      null as never,
    );
    service = runInInjectionContext(injector, () => new BankReconciliationService());
  });

  it('ändert Ignorieren erst nach bestätigtem Datenbankerfolg', async () => {
    const antwort = deferred<{ data: number | null; error: Error | null }>();
    rpc.mockReturnValueOnce(antwort.promise);
    service.transactions.set([transaction('20000000-0000-4000-8000-000000000001')]);

    const ergebnisPromise = service.ignoreTransaction(service.transactions()[0].id);

    expect(service.transactions()[0].status).toBe('matched');
    antwort.resolve({ data: 1, error: null });
    const ergebnis = await ergebnisPromise;
    expect(ergebnis.status).toBe('success');
    expect(service.transactions()[0].status).toBe('ignored');
  });

  it('behält beim Persistenzfehler den Zustand und liefert typisierte Provenienz', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    service.transactions.set([transaction('20000000-0000-4000-8000-000000000002')]);

    const ergebnis = await service.ignoreTransaction(service.transactions()[0].id);

    expect(ergebnis).toMatchObject({
      status: 'failed',
      problem: { reportedBySyncStatus: true },
    });
    expect(service.transactions()[0].status).toBe('matched');
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('bucht Banktransaktion und Shop-Zahlung gemeinsam DB-first', async () => {
    const antwort = deferred<{ data: object | null; error: Error | null }>();
    rpc.mockReturnValueOnce(antwort.promise);
    service.transactions.set([transaction('20000000-0000-4000-8000-000000000003')]);

    const ergebnisPromise = service.bookTransaction(service.transactions()[0].id);

    expect(service.transactions()[0].status).toBe('matched');
    expect(orders()[0].paymentStatus).toBe('pending');
    antwort.resolve({ data: {}, error: null });
    const ergebnis = await ergebnisPromise;
    expect(ergebnis.status).toBe('success');
    expect(service.transactions()[0].status).toBe('booked');
    expect(orders()[0].paymentStatus).toBe('paid');
    expect(rpc).toHaveBeenCalledWith(
      'book_bank_transaction',
      expect.objectContaining({ p_store_order_id: order.id }),
    );
  });

  it('setzt den Kontoauszug bei Nulltreffer nicht lokal zurück', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    service.transactions.set([transaction('20000000-0000-4000-8000-000000000004')]);

    const ergebnis = await service.resetStatement();

    expect(ergebnis.status).toBe('failed');
    expect(service.transactions()).toHaveLength(1);
  });

  it('meldet einen leeren Batch neutral und wertet Einzelresultate als Teilerfolg aus', async () => {
    service.transactions.set([]);
    await expect(service.bookAllExactMatches()).resolves.toMatchObject({
      status: 'empty',
      bookedCount: 0,
      failedCount: 0,
    });

    service.transactions.set([
      transaction('20000000-0000-4000-8000-000000000005'),
      transaction('20000000-0000-4000-8000-000000000006'),
    ]);
    rpc
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('zweiter Schreibfehler') });

    await expect(service.bookAllExactMatches()).resolves.toMatchObject({
      status: 'partial',
      bookedCount: 1,
      failedCount: 1,
    });
    expect(service.transactions().map(({ status }) => status)).toEqual(['booked', 'matched']);
  });

  it('liefert mit Supabase aber ohne Workspace einen zentral gemeldeten Fehler', async () => {
    workspace.set(null);
    service.transactions.set([transaction('20000000-0000-4000-8000-000000000007')]);

    const ergebnis = await service.ignoreTransaction(service.transactions()[0].id);

    expect(ergebnis).toMatchObject({
      status: 'failed',
      problem: { reportedBySyncStatus: true },
    });
    expect(service.transactions()[0].status).toBe('matched');
    expect(rpc).not.toHaveBeenCalled();
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('weist eine manuelle Zuordnung mit unbekannter ID ohne DB-Erfolg ab', async () => {
    const ergebnis = await service.manualAssign('unbekannt', transaction('quelle').match!);

    expect(ergebnis).toMatchObject({
      status: 'failed',
      problem: { reportedBySyncStatus: false },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('dedupliziert denselben zentralen Fehler über den gesamten Buchungs-Batch', async () => {
    service.transactions.set([
      transaction('20000000-0000-4000-8000-000000000008'),
      transaction('20000000-0000-4000-8000-000000000009'),
    ]);
    rpc.mockResolvedValue({ data: null, error: new Error('gemeinsamer Netzwerkfehler') });

    const ergebnis = await service.bookAllExactMatches();

    expect(ergebnis).toMatchObject({ status: 'failed', bookedCount: 0, failedCount: 2 });
    expect(ergebnis.problems).toHaveLength(2);
    expect(ergebnis.problems.every(({ reportedBySyncStatus }) => reportedBySyncStatus)).toBe(true);
    expect(syncStatus.fehler()).toHaveLength(1);
  });
});
