import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
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

    const ergebnis = await dienst.sendConfirmationEmail(rechnung);

    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.sentEmails()).toEqual([]);
  });
});
