import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { ReturnService } from './return.service';
import { InventoryItem, Sale } from '../models/flipbase.models';

describe('ReturnService & Credit Note Engine (Chapter 25)', () => {
  let service: ReturnService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new ReturnService());
  });

  const sampleSale: Sale = {
    packaging_cost: 0,
    other_costs: 0,
    id: 'sale-99',
    workspace_id: 'ws-1',
    inventory_item_id: 'item-99',
    platform: 'ebay',
    sale_price: 150.0,
    sale_date: '2026-08-10',
    platform_fee: 15.0,
    shipping_cost: 5.0,
    net_profit: 50.0,
    roi: 50.0,
  };

  const sampleItem: InventoryItem = {
    condition: 'used',
    id: 'item-99',
    workspace_id: 'ws-1',
    title: 'Nintendo Switch OLED',
    status: 'sold',
    allocated_purchase_cost: 80.0,
  };

  it('should initialize with persisted returns', () => {
    const list = service.returns();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].credit_note_number).toContain('GS-2026');
  });

  it('should process full return, restock ready item and generate credit note invoice', async () => {
    const initialCount = service.returns().length;

    const result = await service.processReturn({
      sale: sampleSale,
      item: sampleItem,
      reason: 'buyer_remorse',
      refundAmount: 150.0,
      isFullRefund: true,
      restockAction: 'restock_ready',
      buyerName: 'Lisa Schmidt',
      notes: 'OVP noch versiegelt.',
    });

    expect(result.status).toBe('success');
    const returnRec = result.data;
    expect(returnRec).not.toBeNull();
    expect(returnRec?.credit_note_number).toContain('GS-2026');
    expect(returnRec?.refund_amount).toBe(150.0);
    expect(returnRec?.is_full_refund).toBe(true);
    expect(service.returns().length).toBe(initialCount + 1);

    // Verify credit note invoice
    expect(returnRec?.creditNoteInvoice).toBeDefined();
    expect(returnRec?.creditNoteInvoice?.invoiceNumber).toBe(returnRec?.credit_note_number);
    expect(returnRec?.creditNoteInvoice?.total).toBe(-150.0);
    expect(returnRec?.creditNoteInvoice?.taxClause).toContain('§ 25a UStG');
  });

  it('should process partial refund / discount agreement', async () => {
    const result = await service.processReturn({
      sale: sampleSale,
      item: sampleItem,
      reason: 'not_as_described',
      refundAmount: 20.0,
      isFullRefund: false,
      restockAction: 'keep_with_buyer',
      buyerName: 'Thomas Becker',
      notes: 'Einigung auf 20 € Nachlass wegen kleinem Kratzer.',
    });

    expect(result.status).toBe('success');
    expect(result.data?.refund_amount).toBe(20.0);
    expect(result.data?.is_full_refund).toBe(false);
    expect(result.data?.restock_action).toBe('keep_with_buyer');
    expect(result.data?.creditNoteInvoice?.total).toBe(-20.0);
  });

  it('materializes a confirmed atomic return once with its credit note', () => {
    const initialCount = service.returns().length;

    const first = service.materializeConfirmedReturn({
      sale: sampleSale,
      reason: 'buyer_remorse',
      refundAmount: 150,
      isFullRefund: true,
      restockAction: 'restock_ready',
    });
    const duplicate = service.materializeConfirmedReturn({
      sale: sampleSale,
      reason: 'buyer_remorse',
      refundAmount: 150,
      isFullRefund: true,
      restockAction: 'restock_ready',
    });

    expect(first.creditNoteInvoice?.total).toBe(-150);
    expect(duplicate.id).toBe(first.id);
    expect(service.returns()).toHaveLength(initialCount + 1);
  });
});
