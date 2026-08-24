import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Sale } from '../models/flipbase.models';
import { Invoice } from '../models/invoice.models';
import { ReturnService } from './return.service';
import { InvoiceService } from './invoice.service';
import { SalesService } from './sales.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: 'workspace-1', name: 'Test-Workspace' };
const artikel: InventoryItem = {
  id: 'item-1',
  workspace_id: workspace.id,
  title: 'Testartikel',
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: 20,
};
const verkauf: Sale = {
  id: 'sale-1',
  workspace_id: workspace.id,
  inventory_item_id: artikel.id,
  platform: 'kleinanzeigen',
  sale_price: 50,
  sale_date: '2026-08-24',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: 30,
  roi: 150,
};
const rechnung: Invoice = {
  id: 'invoice-1',
  invoiceNumber: 'RE-2026-0001',
  orderNumber: 'order-1',
  invoiceDate: '2026-08-24',
  deliveryDate: '2026-08-24',
  seller: {
    name: 'Flipbase',
    street: 'Musterstraße 1',
    postalCode: '10115',
    city: 'Berlin',
    country: 'DE',
  },
  buyer: {
    name: 'Max Mustermann',
    street: 'Testweg 2',
    postalCode: '10117',
    city: 'Berlin',
    country: 'DE',
  },
  items: [],
  subtotal: 50,
  shippingCost: 0,
  total: 50,
  taxMode: 'diff_25a',
  taxClause: '§ 25a UStG',
  paymentMethod: 'Überweisung',
  paymentStatus: 'paid',
};

function installiereArbeitsspeicher(): Map<string, string> {
  const werte = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => werte.get(key) ?? null,
      setItem: (key: string, value: string) => werte.set(key, value),
      removeItem: (key: string) => werte.delete(key),
    },
  });
  return werte;
}

describe('Verkaufsnahe Schreibvorgänge', () => {
  it('legt einen Verkauf bei abgelehnter Datenbankspeicherung nicht lokal an', async () => {
    const syncStatus = new SyncStatusService();
    const dienst = Object.create(SalesService.prototype) as SalesService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: () => workspace },
      inventoryService: {
        items: signal([artikel]),
        updateItemStatus: async () => ({ error: null }),
      },
      profitEngine: {
        calculateProfit: () => 30,
        calculateRoi: () => 150,
        calculateHoldingDurationDays: () => 0,
      },
      mockStore: { isDemoMode: () => false, saveSale: () => undefined },
      webhookService: { sendSaleNotification: () => undefined },
      syncStatus,
      sales: signal<Sale[]>([]),
      pendingFollowUps: signal([]),
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: new Error('offline') }),
              }),
            }),
          }),
        },
      },
    });

    const ergebnis = await dienst.createSale({
      inventory_item_id: artikel.id,
      platform: 'kleinanzeigen',
      sale_price: 50,
      sale_date: '2026-08-24',
    });

    expect(ergebnis.data).toBeNull();
    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.sales()).toEqual([]);
  });

  it('belässt eine Retoure bei abgelehnter Datenbankspeicherung außerhalb des lokalen Zustands', async () => {
    const syncStatus = new SyncStatusService();
    const dienst = Object.create(ReturnService.prototype) as ReturnService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: () => workspace },
      mockStore: { isDemoMode: () => false },
      syncStatus,
      returns: signal([]),
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({ single: async () => ({ data: null, error: new Error('offline') }) }),
            }),
          }),
        },
      },
    });

    const ergebnis = await dienst.processReturn({
      sale: verkauf,
      item: artikel,
      reason: 'buyer_remorse',
      refundAmount: 50,
      isFullRefund: true,
      restockAction: 'restock_ready',
    });

    expect(ergebnis.status).toBe('error');
    expect(ergebnis.data).toBeNull();
    expect(dienst.returns()).toEqual([]);
  });

  it('merkt eine E-Mail erst nach bestätigter Datenbankspeicherung als versendet vor', async () => {
    const syncStatus = new SyncStatusService();
    const dienst = Object.create(InvoiceService.prototype) as InvoiceService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: () => workspace },
      mockStore: { isDemoMode: () => false },
      syncStatus,
      sentEmails: signal([]),
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: new Error('offline') }),
              }),
            }),
          }),
        },
      },
    });

    const ergebnis = await dienst.prepareConfirmationEmail(rechnung);

    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.sentEmails()).toEqual([]);
  });

  it('übernimmt einen persistierten Verkauf bei fehlendem Artikelstatus und holt nur den Status nach', async () => {
    const speicher = installiereArbeitsspeicher();
    const syncStatus = new SyncStatusService();
    const updateItemStatus = vi
      .fn<(_id: string, _status: string, _notes: string) => Promise<{ error: Error | null }>>()
      .mockResolvedValueOnce({ error: new Error('Status nicht gespeichert') })
      .mockResolvedValueOnce({ error: null });
    const salesInsert = vi.fn(async () => ({ data: { id: 'sale-db-1' }, error: null }));
    const dienst = Object.create(SalesService.prototype) as SalesService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: () => workspace },
      inventoryService: { items: signal([artikel]), updateItemStatus },
      profitEngine: {
        calculateProfit: () => 30,
        calculateRoi: () => 150,
        calculateHoldingDurationDays: () => 0,
      },
      mockStore: { isDemoMode: () => false, saveSale: vi.fn() },
      webhookService: { sendSaleNotification: vi.fn() },
      syncStatus,
      sales: signal<Sale[]>([]),
      pendingFollowUps: signal([]),
      supabase: {
        client: {
          from: () => ({ insert: () => ({ select: () => ({ single: salesInsert }) }) }),
        },
      },
    });

    const ergebnis = await dienst.createSale({
      inventory_item_id: artikel.id,
      platform: 'kleinanzeigen',
      sale_price: 50,
      sale_date: '2026-08-24',
    });
    const zweiterVersuch = await dienst.createSale({
      inventory_item_id: artikel.id,
      platform: 'kleinanzeigen',
      sale_price: 50,
      sale_date: '2026-08-24',
    });
    expect(speicher.get('flipbase_pending_sale_follow_ups')).toContain('inventory_status');
    await (
      dienst as unknown as { retryPendingFollowUps?: () => Promise<void> }
    ).retryPendingFollowUps?.();

    expect(ergebnis).toMatchObject({ status: 'partial', data: { id: 'sale-db-1' } });
    expect(zweiterVersuch).toMatchObject({ status: 'partial', data: { id: 'sale-db-1' } });
    expect(dienst.sales().map((sale) => sale.id)).toEqual(['sale-db-1']);
    expect(salesInsert).toHaveBeenCalledOnce();
    expect(updateItemStatus).toHaveBeenCalledTimes(2);
    expect(speicher.get('flipbase_pending_sale_follow_ups')).toBe('[]');
  });

  it('übernimmt eine persistierte Retoure trotz fehlendem Nachschritt lokal', async () => {
    const syncStatus = new SyncStatusService();
    const planeArtikelstatusNachholung = vi.fn();
    const dienst = Object.create(ReturnService.prototype) as ReturnService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: () => workspace },
      mockStore: { isDemoMode: () => false },
      syncStatus,
      returns: signal([]),
      inventoryService: {
        updateItemStatus: async () => ({ error: new Error('Status nicht gespeichert') }),
      },
      salesService: {
        markiereAlsRetourniert: async () => ({ error: null }),
        planeArtikelstatusNachholung,
        planeRetourenvermerkNachholung: vi.fn(),
      },
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'return-db-1' }, error: null }),
              }),
            }),
          }),
        },
      },
    });

    const ergebnis = await dienst.processReturn({
      sale: verkauf,
      item: artikel,
      reason: 'buyer_remorse',
      refundAmount: 50,
      isFullRefund: true,
      restockAction: 'restock_ready',
    });

    expect(ergebnis).toMatchObject({ status: 'partial', data: { id: 'return-db-1' } });
    expect(dienst.returns().map((retoure) => retoure.id)).toEqual(['return-db-1']);
    expect(planeArtikelstatusNachholung).toHaveBeenCalledOnce();
  });

  it('entfernt einen in der Datenbank gelöschten Verkauf lokal und holt den Artikelstatus nach', async () => {
    const speicher = installiereArbeitsspeicher();
    const syncStatus = new SyncStatusService();
    const updateItemStatus = vi
      .fn<(_id: string, _status: string, _notes: string) => Promise<{ error: Error | null }>>()
      .mockResolvedValueOnce({ error: new Error('Status nicht gespeichert') })
      .mockResolvedValueOnce({ error: null });
    const loeschabfrage = {
      eq: vi.fn(),
      select: () => ({
        maybeSingle: async () => ({ data: { id: verkauf.id }, error: null }),
      }),
    };
    loeschabfrage.eq.mockReturnValue(loeschabfrage);
    const dienst = Object.create(SalesService.prototype) as SalesService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: () => workspace },
      inventoryService: { updateItemStatus },
      mockStore: { isDemoMode: () => false, deleteSale: vi.fn() },
      syncStatus,
      sales: signal<Sale[]>([verkauf]),
      pendingFollowUps: signal([]),
      supabase: {
        client: {
          from: () => ({
            delete: () => loeschabfrage,
          }),
        },
      },
    });

    const ergebnis = await dienst.deleteSale(verkauf.id, artikel.id);
    expect(speicher.get('flipbase_pending_sale_follow_ups')).toContain('inventory_status');
    await (
      dienst as unknown as { retryPendingFollowUps?: () => Promise<void> }
    ).retryPendingFollowUps?.();

    expect(ergebnis.status).toBe('partial');
    expect(dienst.sales()).toEqual([]);
    expect(updateItemStatus).toHaveBeenCalledTimes(2);
    expect(speicher.get('flipbase_pending_sale_follow_ups')).toBe('[]');
  });

  it('ordnet einen Nachschritt nach einem Workspace-Wechsel weiterhin dem Workspace der Löschung zu', async () => {
    const speicher = installiereArbeitsspeicher();
    const syncStatus = new SyncStatusService();
    const aktiverWorkspace = signal(workspace);
    const updateItemStatus = vi
      .fn<(_id: string, _status: string, _notes: string) => Promise<{ error: Error | null }>>()
      .mockResolvedValueOnce({ error: new Error('Status nicht gespeichert') })
      .mockResolvedValueOnce({ error: null });
    const loeschabfrage = {
      eq: vi.fn(),
      select: () => ({
        maybeSingle: async () => {
          aktiverWorkspace.set({ id: 'workspace-2', name: 'Anderer Workspace' });
          return { data: { id: verkauf.id }, error: null };
        },
      }),
    };
    loeschabfrage.eq.mockReturnValue(loeschabfrage);
    const dienst = Object.create(SalesService.prototype) as SalesService;
    Object.assign(dienst, {
      workspaceService: { currentWorkspace: aktiverWorkspace },
      inventoryService: { updateItemStatus },
      mockStore: { isDemoMode: () => false, deleteSale: vi.fn() },
      syncStatus,
      sales: signal<Sale[]>([verkauf]),
      pendingFollowUps: signal([]),
      supabase: {
        client: {
          from: () => ({
            delete: () => loeschabfrage,
          }),
        },
      },
    });

    await dienst.deleteSale(verkauf.id, artikel.id);
    const gespeicherterNachschritt = JSON.parse(
      speicher.get('flipbase_pending_sale_follow_ups') ?? '[]',
    ) as { workspaceId: string }[];

    await (
      dienst as unknown as { retryPendingFollowUps: (workspaceId: string) => Promise<void> }
    ).retryPendingFollowUps('workspace-2');
    expect(updateItemStatus).toHaveBeenCalledOnce();

    await (
      dienst as unknown as { retryPendingFollowUps: (workspaceId: string) => Promise<void> }
    ).retryPendingFollowUps(workspace.id);

    expect(gespeicherterNachschritt).toEqual([
      expect.objectContaining({ workspaceId: workspace.id }),
    ]);
    expect(loeschabfrage.eq).toHaveBeenNthCalledWith(2, 'workspace_id', workspace.id);
    expect(updateItemStatus).toHaveBeenCalledTimes(2);
  });

  it('verwirft beschädigtes Follow-up-JSON und meldet den Speicherfehler zentral', () => {
    const speicher = installiereArbeitsspeicher();
    speicher.set('flipbase_pending_sale_follow_ups', '{kein json');
    const syncStatus = new SyncStatusService();
    const dienst = Object.create(SalesService.prototype) as SalesService;
    Object.assign(dienst, { syncStatus });

    const nachschritte = (
      dienst as unknown as { loadPendingFollowUps: () => unknown[] }
    ).loadPendingFollowUps();

    expect(nachschritte).toEqual([]);
    expect(speicher.get('flipbase_pending_sale_follow_ups')).toBe('[]');
    expect(syncStatus.fehler()).toHaveLength(1);
  });

  it('verwirft strukturell ungültige Follow-ups und behält valide Einträge im Store', () => {
    const speicher = installiereArbeitsspeicher();
    const validerNachschritt = {
      key: 'inventory_status:item-1',
      workspaceId: workspace.id,
      kind: 'inventory_status',
      inventoryItemId: artikel.id,
      targetStatus: 'ready',
      notes: 'Nachholen',
    };
    speicher.set(
      'flipbase_pending_sale_follow_ups',
      JSON.stringify([validerNachschritt, { key: 'defekt', workspaceId: workspace.id }]),
    );
    const syncStatus = new SyncStatusService();
    const dienst = Object.create(SalesService.prototype) as SalesService;
    Object.assign(dienst, { syncStatus });

    const nachschritte = (
      dienst as unknown as { loadPendingFollowUps: () => unknown[] }
    ).loadPendingFollowUps();

    expect(nachschritte).toEqual([validerNachschritt]);
    expect(JSON.parse(speicher.get('flipbase_pending_sale_follow_ups') ?? '[]')).toEqual([
      validerNachschritt,
    ]);
    expect(syncStatus.fehler()).toHaveLength(1);
  });
});
