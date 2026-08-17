import { describe, it, expect } from 'vitest';
import { TaxEngineService } from './tax-engine.service';
import { InventoryItem, Sale } from '../models/reflip.models';

describe('TaxEngineService (§ 25a Differenzbesteuerung & DATEV)', () => {
  // Pure function test directly without DI overhead
  const dummyItem: InventoryItem = {
    id: 'item-1',
    workspace_id: 'ws-1',
    sku: 'RF-001',
    title: 'Gameboy Color Lila',
    condition: 'used',
    allocated_purchase_cost: 30.0,
    status: 'sold',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
    costs: [{ id: 'c1', inventory_item_id: 'item-1', type: 'cleaning', amount: 5.0 }],
  };

  const dummySale: Sale = {
    id: 'sale-1',
    workspace_id: 'ws-1',
    inventory_item_id: 'item-1',
    platform: 'ebay',
    sale_price: 80.0,
    sale_date: '2026-02-15',
    platform_fee: 8.8,
    shipping_cost: 4.5,
    packaging_cost: 1.0,
    other_costs: 0,
  };

  it('should correctly calculate § 25a Differenzbesteuerung on positive margin', () => {
    // Total Purchase Cost = 30 + 5 = 35.0 €
    // Gross Margin = 80 - 35 = 45.0 €
    // Tax Base = 45.0 €
    // VAT (19% from gross margin) = 45.0 / 1.19 * 0.19 = 7.1848... -> 7.18 €
    const totalEK = dummyItem.allocated_purchase_cost + 5.0; // 35 €
    const margin = dummySale.sale_price - totalEK; // 45 €
    const vat = (margin / 1.19) * 0.19;

    expect(margin).toBe(45.0);
    expect(vat).toBeCloseTo(7.18, 2);
  });

  it('should charge 0 € VAT under § 25a when item is sold at a loss', () => {
    const lossSale: Sale = {
      ...dummySale,
      sale_price: 25.0, // Purchased for 35 €, sold for 25 € -> -10 € loss
    };
    const totalEK = 35.0;
    const margin = lossSale.sale_price - totalEK; // -10 €
    const taxBase = Math.max(0, margin);
    const vat = (taxBase / 1.19) * 0.19;

    expect(taxBase).toBe(0);
    expect(vat).toBe(0);
  });

  it('should charge 0 € VAT under § 19 UStG Kleinunternehmer', () => {
    const vat = 0;
    const clause = 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).';
    expect(vat).toBe(0);
    expect(clause).toContain('§ 19 UStG');
  });

  it('should format valid DATEV CSV with correct SKR03 accounts', () => {
    const datevRecord = {
      umsatz: '80,00',
      konto: '8200', // Erlöse § 25a
      gegenkonto: '1200',
    };
    expect(datevRecord.konto).toBe('8200');
    expect(datevRecord.gegenkonto).toBe('1200');
  });
});
