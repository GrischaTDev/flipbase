import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { InventoryItem, Sale, TaxCalculationResult, Workspace } from '../models/flipbase.models';
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
    tax_purchase_cost: 30.0,
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
    expect(result.tax_base).toBe(42.02);
    expect(result.vat_amount).toBeCloseTo(7.98, 2);
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
          tax_purchase_cost: 12.5,
          tax_cost_allocations: [{ quantity: 2, tax_purchase_cost: 12.5 }],
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
          tax_purchase_cost: 3.5,
          tax_mode: 'diff_25a',
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
          tax_purchase_cost: 4,
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
          tax_purchase_cost: 8,
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

  it('verteilt Käufer-Versand centgenau auf die Steuerpositionen', () => {
    const saleWithShippingRevenue: Sale = {
      ...dummySale,
      sale_price: 42.98,
      sale_price_total: 42.98,
      shipping_revenue: 2.99,
      shipping_cost: 5.19,
      platform_fee: 7.7,
      lines: [
        {
          id: 'line-1',
          sale_id: dummySale.id,
          title_snapshot: 'A',
          quantity: 1,
          unit_sale_price: 10,
          line_total: 10,
          cost_of_goods_sold: 4,
          tax_purchase_cost: 4,
          tax_mode: 'diff_25a',
        },
        {
          id: 'line-2',
          sale_id: dummySale.id,
          title_snapshot: 'B',
          quantity: 1,
          unit_sale_price: 29.99,
          line_total: 29.99,
          cost_of_goods_sold: 8,
          tax_purchase_cost: 8,
          tax_mode: 'diff_25a',
        },
      ],
    };

    const calculations = service.calculateSaleLineTaxes(saleWithShippingRevenue, dummyItem);

    expect(calculations.map((calculation) => calculation.gross_revenue)).toEqual([10.75, 32.23]);
    expect(calculations.reduce((sum, calculation) => sum + calculation.gross_revenue, 0)).toBe(
      42.98,
    );
    expect(calculations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shipping_revenue: 0.75, shipping_cost: 1.3 }),
        expect.objectContaining({ shipping_revenue: 2.24, shipping_cost: 3.89 }),
      ]),
    );
    expect(calculations.reduce((sum, calculation) => sum + calculation.shipping_revenue, 0)).toBe(
      2.99,
    );
    expect(calculations.reduce((sum, calculation) => sum + calculation.shipping_cost, 0)).toBe(
      5.19,
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
          tax_purchase_cost: 0,
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

  it('berechnet Regelbesteuerung ohne unbelegte Vorsteuer aus echten Verkaufswerten', () => {
    const result = service.calculateSaleTax(dummySale, dummyItem, 'regular_19');

    expect(result).toMatchObject({
      tax_mode: 'regular_19',
      gross_revenue: 80,
      total_purchase_cost: 35,
      gross_margin: 45,
      tax_base: 67.23,
      vat_amount: 12.77,
      input_tax_deductible: 0,
      net_tax_liability: 12.77,
      net_profit_after_tax: 17.93,
      invoice_clause: 'Enthält 19% gesetzliche Umsatzsteuer.',
    });
  });

  it('vergibt den Cent-Rundungsrest gemeinsamer Kosten an die letzte Verkaufsposition', () => {
    const lines = ['A', 'B', 'C'].map((title, index) => ({
      id: `line-${index}`,
      sale_id: dummySale.id,
      title_snapshot: title,
      quantity: 1,
      unit_sale_price: 10,
      line_total: 10,
      cost_of_goods_sold: 0,
      tax_purchase_cost: 0,
      tax_mode: index === 0 ? ('diff_25a' as const) : ('kleinunternehmer_19' as const),
    }));
    const sale: Sale = {
      ...dummySale,
      sale_price: 30,
      platform_fee: 0.01,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      lines,
    };

    const results = service.calculateSaleLineTaxes(sale, dummyItem);

    expect(results.map((result) => result.net_profit_after_tax)).toEqual([8.4, 10, 9.99]);
    expect(results.reduce((sum, result) => sum + result.net_profit_after_tax, 0)).toBeCloseTo(
      28.39,
      2,
    );
  });

  it('behandelt Nullumsatz-Positionen und gemischte Steuerarten ohne erfundene Abstimmung', () => {
    const sale: Sale = {
      ...dummySale,
      sale_price: 0,
      platform_fee: 3,
      lines: [
        {
          id: 'zero-a',
          sale_id: dummySale.id,
          title_snapshot: 'A',
          quantity: 1,
          unit_sale_price: 0,
          line_total: 0,
          cost_of_goods_sold: 4,
          tax_purchase_cost: 4,
          tax_mode: 'diff_25a',
        },
        {
          id: 'zero-b',
          sale_id: dummySale.id,
          title_snapshot: 'B',
          quantity: 1,
          unit_sale_price: 0,
          line_total: 0,
          cost_of_goods_sold: 8,
          tax_purchase_cost: 8,
          tax_mode: 'regular_19',
        },
      ],
    };

    const results = service.calculateSaleLineTaxes(sale, dummyItem);

    expect(results).toHaveLength(2);
    expect(results[0].tax_mode).toBe('diff_25a');
    expect(results[1].tax_mode).toBe('regular_19');
    expect(results[0].net_profit_after_tax).toBe(-4);
    expect(results[1].net_profit_after_tax).toBe(-16.5);
  });

  it('fasst einen Steuerzeitraum centgenau zusammen', () => {
    const diff = service.calculateSaleTax(dummySale, dummyItem, 'diff_25a');
    const regular = service.calculateSaleTax(
      { ...dummySale, id: 'sale-2', sale_price: 25 },
      dummyItem,
      'regular_19',
    );

    expect(service.summarizePeriod([diff, regular], 'Februar 2026', 'regular_19')).toEqual({
      period_label: 'Februar 2026',
      review_count: 0,
      total_sales_count: 2,
      gross_revenue: 105,
      total_cost_of_goods_sold: 70,
      total_gross_margin: 35,
      total_vat_due: 11.97,
      total_input_tax: 0,
      total_vat_liability: 11.97,
      net_profit_after_tax: -5.57,
      tax_mode: 'regular_19',
    });
  });

  it('berechnet reaktive Steuerfälle mit eingebettetem, gefundenem und fehlendem Artikel', () => {
    const workspace = signal<Workspace | null>({
      id: 'ws-1',
      name: 'Test',
      tax_mode: 'regular_19',
      min_roi_percent: 30,
      min_profit_amount: 15,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    const sales = signal<Sale[]>([
      { ...dummySale, id: 'embedded', inventory_item: { ...dummyItem, title: 'Eingebettet' } },
      { ...dummySale, id: 'matched' },
      { ...dummySale, id: 'missing', inventory_item_id: 'missing-item' },
    ]);
    const items = signal<InventoryItem[]>([dummyItem]);
    const reactiveInjector = Injector.create({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: SalesService, useValue: { sales } },
        { provide: InventoryService, useValue: { items } },
      ],
    });
    const reactiveService = runInInjectionContext(reactiveInjector, () => new TaxEngineService());

    const results = reactiveService.allTaxCalculations();

    expect(results.map((result) => result.item_title)).toEqual([
      'Eingebettet',
      'Gameboy Color Lila',
      'Artikel #missin',
    ]);
    expect(results.map((result) => result.tax_mode)).toEqual([
      'regular_19',
      'regular_19',
      'regular_19',
    ]);
  });

  it('exportiert alle Steuerarten in SKR04 und schützt EÜR-Zellen vor Formeln', () => {
    const results = [
      service.calculateSaleTax(dummySale, dummyItem, 'diff_25a'),
      service.calculateSaleTax(
        { ...dummySale, id: 'ku-sale' },
        { ...dummyItem, title: '=HYPERLINK("https://invalid.example")' },
        'kleinunternehmer_19',
      ),
      service.calculateSaleTax({ ...dummySale, id: 'reg-sale' }, dummyItem, 'regular_19'),
    ];

    const datevRows = service
      .generateDatevCsv(results, {
        skrStandard: 'SKR04',
        beraternummer: '123',
        mandantennummer: '456',
        bezeichnung: 'August "2026"',
      })
      .split('\r\n')
      .slice(2)
      .map((row) => row.split(';'));
    const accountIndex = service.datevSpalten.indexOf('Konto');
    const revenueAccountIndex = service.datevSpalten.indexOf('Gegenkonto (ohne BU-Schlüssel)');

    expect(datevRows.map((row) => row[accountIndex])).toEqual([
      '1800',
      '6740',
      '1800',
      '6740',
      '1800',
      '6740',
    ]);
    expect(datevRows.map((row) => row[revenueAccountIndex])).toEqual([
      '4200',
      '1800',
      '4185',
      '1800',
      '4400',
      '1800',
    ]);
    expect(service.generateEurCsv(results)).toContain(
      '"\'=HYPERLINK(""https://invalid.example"")"',
    );
  });

  it('nutzt sichere Datums- und Titel-Fallbacks für unvollständige Altverkäufe', () => {
    const fallbackResult: TaxCalculationResult = {
      ...service.calculateSaleTax(
        { ...dummySale, id: 'abc', inventory_item_id: undefined, sale_date: 'ungueltig' },
        { ...dummyItem, title: '', costs: [], allocated_purchase_cost: 0 },
      ),
      item_title: '@Altbestand',
    };

    const [, , booking] = service.generateDatevCsv([fallbackResult]).split('\r\n');

    expect(booking.split(';')[service.datevSpalten.indexOf('Belegdatum')]).toBe('0101');
    expect(service.generateDatevCsv([]).split('\r\n')).toHaveLength(2);
    expect(service.generateEurCsv([fallbackResult])).toContain('"\'@Altbestand"');
  });
});
