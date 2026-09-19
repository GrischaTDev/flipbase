import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Purchase, Source, Supplier } from '../models/flipbase.models';
import { PurchaseSellerDetails } from '../models/purchase-seller.models';
import { PurchaseService, PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };
const source: Source = { id: 'source-vinted', workspace_id: workspace.id, name: 'Vinted' };
const supplier: Supplier = {
  id: 'supplier-1',
  workspace_id: workspace.id,
  name: 'Großhandel Nord',
};

const finalizedPurchase: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  type: 'single',
  title: 'Vinted-Jacke',
  purchase_date: '2026-09-17',
  purchase_price: 10,
  total_purchase_cost: 12,
  cost_allocation_mode: 'even',
  entry_status: 'finalized',
  finalized_at: '2026-09-17T10:00:00.000Z',
  source_id: source.id,
  source,
  supplier_id: null,
  seller_marketplace_username: 'vintage_lea92',
  seller_details_version: 2,
  costs: [
    { id: 'cost-1', purchase_id: 'x', workspace_id: workspace.id, type: 'shipping', amount: 2 },
  ],
};

const amendment: PurchaseSellerDetails = {
  source_id: source.id,
  supplier_id: null,
  seller_type: 'private',
  seller_name: ' Lea Mustermann ',
  seller_marketplace_username: 'vintage_lea92',
  seller_street: 'Musterweg 5',
  seller_address_extra: '',
  seller_postal_code: '50667',
  seller_city: 'Köln',
  seller_country_code: 'de',
  external_order_id: null,
  supplier_reference: null,
  original_url: null,
};

function createService(options: { rpc?: ReturnType<typeof vi.fn> } = {}) {
  const purchasesRaw = signal<Purchase[]>([finalizedPurchase]);
  const selectedPurchaseRaw = signal<Purchase | null>(finalizedPurchase);
  const service = Object.create(PurchaseService.prototype) as PurchaseService;
  Object.assign(service, {
    purchasesRaw,
    selectedPurchaseRaw,
    workspaceService: { currentWorkspace: signal(workspace) },
    sourcesService: { sources: signal([source]) },
    suppliersService: { suppliers: signal([supplier]) },
    syncStatus: new SyncStatusService(),
    supabase: { client: { rpc: options.rpc ?? vi.fn() } },
  });
  return { service, purchasesRaw, selectedPurchaseRaw };
}

describe('PurchaseService.updatePurchaseSellerDetails', () => {
  it('schickt nur normalisierte Herkunftsangaben, erwartete Version und Grund an die Datenbank', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        purchase: {
          ...finalizedPurchase,
          seller_name: 'Lea Mustermann',
          seller_details_version: 3,
        },
        eventId: 'event-1',
      },
      error: null,
    });
    const { service, selectedPurchaseRaw } = createService({ rpc });

    const result = await service.updatePurchaseSellerDetails(
      finalizedPurchase.id,
      2,
      amendment,
      ' Adresse nachgereicht ',
    );

    expect(result).toEqual({ error: null, conflict: false });
    expect(rpc).toHaveBeenCalledWith('update_purchase_seller_details', {
      p_workspace_id: workspace.id,
      p_purchase_id: finalizedPurchase.id,
      p_expected_version: 2,
      p_details: {
        ...amendment,
        seller_name: 'Lea Mustermann',
        seller_address_extra: null,
        seller_country_code: 'DE',
      },
      p_reason: 'Adresse nachgereicht',
    });
    expect(selectedPurchaseRaw()).toMatchObject({
      seller_name: 'Lea Mustermann',
      seller_details_version: 3,
      source,
      entry_status: 'finalized',
      costs: finalizedPurchase.costs,
    });
  });

  it('meldet einen veralteten Stand als Konflikt und ändert lokal nichts', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'Der Einkauf wurde zwischenzeitlich geändert. Bitte neu laden.',
      },
    });
    const { service, selectedPurchaseRaw } = createService({ rpc });

    const result = await service.updatePurchaseSellerDetails(
      finalizedPurchase.id,
      1,
      amendment,
      null,
    );

    expect(result.conflict).toBe(true);
    expect(result.error?.message).toBe(PURCHASE_SELLER_DETAILS_CONFLICT_MESSAGE);
    expect(selectedPurchaseRaw()).toBe(finalizedPurchase);
  });

  it('entfernt eine gelöschte Quelle auch aus der lokalen Anzeige', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { purchase: { id: finalizedPurchase.id }, eventId: 'event-1' },
      error: null,
    });
    const { service, selectedPurchaseRaw } = createService({ rpc });

    await service.updatePurchaseSellerDetails(
      finalizedPurchase.id,
      2,
      { ...amendment, source_id: null, supplier_id: supplier.id },
      null,
    );

    expect(selectedPurchaseRaw()?.source).toBeUndefined();
    expect(selectedPurchaseRaw()?.source_id).toBeNull();
    expect(selectedPurchaseRaw()?.supplier).toEqual(supplier);
  });
});
