import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { InventoryItem, Sale } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { SalesService } from './sales.service';
import { TaxEngineService } from './tax-engine.service';
import { WorkspaceService } from './workspace.service';

describe('TaxEngineService (§ 25a Differenzbesteuerung & DATEV)', () => {
  const injector = Injector.create({
    providers: [
      { provide: WorkspaceService, useValue: {} },
      { provide: SalesService, useValue: {} },
      { provide: InventoryService, useValue: {} },
    ],
  });
  const service = runInInjectionContext(injector, () => new TaxEngineService());

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

  it('berechnet § 25a-Umsatzsteuer aus der positiven Marge', () => {
    const result = service.calculateSaleTax(dummySale, dummyItem, 'diff_25a');

    expect(result.gross_margin).toBe(45);
    expect(result.tax_base).toBe(45);
    expect(result.vat_amount).toBeCloseTo(7.18, 2);
    expect(result.tax_mode).toBe('diff_25a');
  });

  it('begrenzt die § 25a-Bemessungsgrundlage bei einem Verlust auf null', () => {
    const lossSale: Sale = {
      ...dummySale,
      sale_price: 25,
    };
    const result = service.calculateSaleTax(lossSale, dummyItem, 'diff_25a');

    expect(result.gross_margin).toBe(-10);
    expect(result.tax_base).toBe(0);
    expect(result.vat_amount).toBe(0);
  });

  it('weist für Kleinunternehmer weder Steuer noch Vorsteuer oder Zahllast aus', () => {
    const result = service.calculateSaleTax(dummySale, dummyItem, 'kleinunternehmer_19');

    expect(result.vat_amount).toBe(0);
    expect(result.input_tax_deductible).toBe(0);
    expect(result.net_tax_liability).toBe(0);
    expect(result.invoice_clause).toBe(
      'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).',
    );
  });

  it('exportiert einen § 25a-Verkauf mit den SKR03-Konten Bank 1200 und Erlöse 8200', () => {
    const taxResult = service.calculateSaleTax(dummySale, dummyItem, 'diff_25a');
    const [, headerLine, bookingLine] = service.generateDatevCsv([taxResult]).split('\r\n');
    const header = headerLine.split(';');
    const booking = bookingLine.split(';');
    const bankkontoIndex = service.datevSpalten.indexOf('Konto');
    const erloeskontoIndex = service.datevSpalten.indexOf('Gegenkonto (ohne BU-Schlüssel)');

    expect(header).toEqual(service.datevSpalten);
    expect(booking).toHaveLength(service.datevSpalten.length);
    expect(booking[bankkontoIndex]).toBe('1200');
    expect(booking[erloeskontoIndex]).toBe('8200');
    expect(booking[service.datevSpalten.indexOf('Belegdatum')]).toBe('1502');
  });

  it('summiert die persistierten Verkaufskosten statt den aktuellen Artikelwert zu verwenden', () => {
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
