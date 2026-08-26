import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { StockService } from './stock.service';
import { StockPosition } from '../models/flipbase.models';
import { SyncStatusService } from './sync-status.service';

const position: StockPosition = {
  catalog_product_id: 'product-1',
  title: 'LED-Lampe',
  available_quantity: 5,
  reserved_quantity: 0,
  on_hand_quantity: 5,
  oldest_available_unit_cost: 4.99,
  is_public_store: false,
};

describe('StockService', () => {
  it('übernimmt den durch den Wareneingang bestätigten Mengenbestand', async () => {
    const service = Object.create(StockService.prototype) as StockService;
    Object.assign(service, {
      positions: signal<StockPosition[]>([]),
      movements: signal([]),
      mockStore: { isDemoMode: signal(false) },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          rpc: async () => ({
            data: {
              purchase_lines: [],
              stock_lots: [
                {
                  id: 'lot-1',
                  workspace_id: 'workspace-1',
                  purchase_id: 'purchase-1',
                  purchase_line_id: 'line-1',
                  catalog_product_id: 'product-1',
                  received_quantity: 5,
                  remaining_quantity: 5,
                  unit_cost: 4.99,
                  received_at: '2026-08-26T10:00:00.000Z',
                },
              ],
            },
            error: null,
          }),
        },
      },
    });

    const result = await service.receivePurchaseLines('purchase-1', [
      { purchaseLineId: 'line-1', receivedQuantity: 5 },
    ]);

    expect(result.error).toBeNull();
    expect(service.positions()[0].available_quantity).toBe(5);
  });
});
