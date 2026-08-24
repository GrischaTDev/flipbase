import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase } from '../models/flipbase.models';
import { PurchaseService } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

const einkauf: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  type: 'mystery_pack',
  title: 'Mystery Box',
  purchase_date: '2026-08-24',
  purchase_price: 31.98,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
  created_at: '2026-08-24T10:00:00.000Z',
};

describe('PurchaseService – fehlgeschlagenes Löschen', () => {
  it('entfernt den Einkauf erst nach bestätigtem Löschen aus der Datenbank', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const lokaleLoeschung = vi.fn();
    const artikelEntfernen = vi.fn();
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      mockStore: {
        isDemoMode: signal(false),
        deletePurchase: lokaleLoeschung,
      },
      inventory: { entferneArtikelZuEinkauf: artikelEntfernen },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            delete: () => ({
              eq: async () => ({ error: { code: '42501', message: 'denied' } }),
            }),
          }),
        },
      },
    });

    const ergebnis = await service.deletePurchase(einkauf.id);

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
    expect(lokaleLoeschung).not.toHaveBeenCalled();
    expect(artikelEntfernen).not.toHaveBeenCalled();
  });
});

describe('PurchaseService – bestätigte Tracking- und Verteiländerungen', () => {
  it('ändert das Tracking im lokalen Bestand erst nach erfolgreichem Datenbank-Update', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const lokalSpeichern = vi.fn();
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      purchases: () => purchasesRaw(),
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      mockStore: {
        isDemoMode: signal(false),
        savePurchase: lokalSpeichern,
      },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            update: () => ({
              eq: async () => ({ error: { code: '42501', message: 'denied' } }),
            }),
          }),
        },
      },
    });

    const ergebnis = await service.updatePurchaseTracking(einkauf.id, 'TRACK-NEU', 'dhl');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
    expect(lokalSpeichern).not.toHaveBeenCalled();
  });

  it('bricht das Zustellen nach einem Tracking-Fehler vor den Artikeln ab', async () => {
    const trackingError = new Error('Tracking fehlgeschlagen');
    const artikel: InventoryItem = {
      id: 'item-1',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      sku: 'SKU-1',
      title: 'Konsole',
      condition: 'used',
      status: 'needs_review',
      allocated_purchase_cost: 31.98,
      created_at: '2026-08-24T10:00:00.000Z',
    };
    const updateItemStatus = vi.fn(async () => ({ error: null }));
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchases: signal<Purchase[]>([einkauf]),
      updatePurchaseTracking: vi.fn(async () => ({ data: null, error: trackingError })),
      inventory: {
        items: signal<InventoryItem[]>([artikel]),
        updateItemStatus,
      },
    });

    const ergebnis = await service.markPurchaseDeliveredAndSyncItems(einkauf.id);

    expect(ergebnis).toEqual({ updatedCount: 0, error: trackingError });
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it('ändert die Verteilmethode lokal erst nach erfolgreichem Datenbank-Update', async () => {
    const purchasesRaw = signal<Purchase[]>([einkauf]);
    const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
    const lokalSpeichern = vi.fn();
    const service = Object.create(PurchaseService.prototype) as PurchaseService;

    Object.assign(service, {
      purchasesRaw,
      selectedPurchaseRaw,
      selectedPurchase: () => selectedPurchaseRaw(),
      mockStore: {
        isDemoMode: signal(false),
        getPurchases: () => [einkauf],
        savePurchase: lokalSpeichern,
      },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            update: () => ({
              eq: async () => ({ error: { code: '42501', message: 'denied' } }),
            }),
          }),
        },
      },
    });

    const ergebnis = await service.updateCostAllocationMode(einkauf.id, 'value_weighted');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(purchasesRaw()).toEqual([einkauf]);
    expect(selectedPurchaseRaw()).toEqual(einkauf);
    expect(lokalSpeichern).not.toHaveBeenCalled();
  });
});
