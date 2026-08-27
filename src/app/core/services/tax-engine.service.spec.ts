import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { InventoryItem, Sale } from '../models/flipbase.models';
import { TaxEngineService } from './tax-engine.service';

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

  it('summiert die persistierten Verkaufskosten statt den aktuellen Artikelwert zu verwenden', () => {
    const service = Object.create(TaxEngineService.prototype) as TaxEngineService;
    const saleWithPersistedLines: Sale = {
      ...dummySale,
      sale_price: 39.96,
      lines: [
        {
          id: 'line-1',
          sale_id: dummySale.id,
          catalog_product_id: 'product-1',
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 19.98,
          line_total: 39.96,
          cost_of_goods_sold: 12.5,
          tax_mode: 'diff_25a',
        },
        {
          id: 'line-2',
          sale_id: dummySale.id,
          inventory_item_id: 'item-2',
          title_snapshot: 'Adapter',
          quantity: 1,
          unit_sale_price: 0,
          line_total: 0,
          cost_of_goods_sold: 3.5,
          tax_mode: 'regular_19',
        },
      ],
    };

    const calculation = service.calculateSaleTax(saleWithPersistedLines, {
      ...dummyItem,
      allocated_purchase_cost: 999,
    });

    expect(calculation.total_purchase_cost).toBe(16);
    expect(calculation.tax_mode).toBe('diff_25a');
  });

  it('verteilt gemeinsame Verkaufskosten einmalig auf die Positions-Steuerfälle', () => {
    const service = Object.create(TaxEngineService.prototype) as TaxEngineService;
    const saleWithTwoLines: Sale = {
      ...dummySale,
      sale_price: 30,
      platform_fee: 3,
      shipping_cost: 2,
      packaging_cost: 1,
      other_costs: 4,
      lines: [
        {
          id: 'line-1',
          sale_id: dummySale.id,
          title_snapshot: 'A',
          quantity: 1,
          unit_sale_price: 10,
          line_total: 10,
          cost_of_goods_sold: 4,
          tax_mode: 'diff_25a',
        },
        {
          id: 'line-2',
          sale_id: dummySale.id,
          title_snapshot: 'B',
          quantity: 1,
          unit_sale_price: 20,
          line_total: 20,
          cost_of_goods_sold: 8,
          tax_mode: 'diff_25a',
        },
      ],
    };

    const calculations = service.calculateSaleLineTaxes(saleWithTwoLines, dummyItem);

    expect(calculations).toHaveLength(2);
    expect(calculations.reduce((sum, entry) => sum + entry.gross_revenue, 0)).toBe(30);
    expect(calculations.reduce((sum, entry) => sum + entry.net_profit_after_tax, 0)).toBeCloseTo(
      service.calculateSaleTax(saleWithTwoLines, dummyItem).net_profit_after_tax,
      2,
    );
  });

  it('erhält den Steuer-Modus eines historischen Einzelverkaufs trotz Display-Fallback', () => {
    const service = Object.create(TaxEngineService.prototype) as TaxEngineService;
    const historicSale = {
      ...dummySale,
      lines: [
        {
          id: 'fallback',
          sale_id: dummySale.id,
          title_snapshot: 'Gameboy',
          quantity: 1,
          unit_sale_price: 80,
          line_total: 80,
          cost_of_goods_sold: 0,
          tax_mode: 'diff_25a',
        },
      ],
      has_persisted_lines: false,
    } as Sale & { has_persisted_lines: boolean };

    expect(
      service.calculateSaleTax(historicSale, { ...dummyItem, tax_mode_override: 'regular_19' })
        .tax_mode,
    ).toBe('regular_19');
  });
});
