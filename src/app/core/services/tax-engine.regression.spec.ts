import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { InventoryItem, Sale, SaleLine } from '../models/flipbase.models';
import { TaxEngineService } from './tax-engine.service';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';

const injector = Injector.create({
  providers: [
    { provide: WorkspaceService, useValue: {} },
    { provide: SalesService, useValue: {} },
    { provide: InventoryService, useValue: {} },
  ],
});
const engine = runInInjectionContext(injector, () => new TaxEngineService());
const item: InventoryItem = {
  id: 'item',
  workspace_id: 'ws',
  title: 'Gerät',
  condition: 'used',
  status: 'sold',
  allocated_purchase_cost: 100,
  tax_purchase_cost: 100,
};
const line = (id: string, revenue: number, cost: number): SaleLine => ({
  id,
  sale_id: 'sale',
  title_snapshot: id,
  quantity: 1,
  unit_sale_price: revenue,
  line_total: revenue,
  cost_of_goods_sold: cost,
  tax_purchase_cost: cost,
  tax_mode: 'diff_25a',
});
const sale = (lines: SaleLine[]): Sale => ({
  id: 'sale',
  workspace_id: 'ws',
  platform: 'direct',
  sale_date: '2026-09-13',
  sale_price: lines.reduce((sum, l) => sum + l.line_total, 0),
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  lines,
});

describe('Steuerregression: Kostenherkunft und Einzeldifferenz', () => {
  it('verrechnet die Verlustposition nicht mit der Steuer des gewinnbringenden Stücks', () => {
    const results = engine.calculateSaleLineTaxes(
      sale([line('A', 120, 100), line('B', 80, 100)]),
      item,
    );
    expect(results.map((r) => r.vat_amount)).toEqual([3.19, 0]);
    expect(results.map((r) => r.tax_base)).toEqual([16.81, 0]);
    expect(engine.summarizePeriod(results, 'September', 'diff_25a').total_sales_count).toBe(1);
  });
  it('zieht die enthaltene Steuer aus der Bemessungsgrundlage heraus', () => {
    const result = engine.calculateSaleTax(sale([line('A', 219, 100)]), item);
    expect(result.tax_base).toBe(100);
    expect(result.vat_amount).toBe(19);
  });
  it('Reparaturen mindern den Gewinn, aber nicht den steuerlichen Unterschiedsbetrag', () => {
    const result = engine.calculateSaleTax(
      sale([{ ...line('A', 219, 100), cost_of_goods_sold: 119 }]),
      item,
    );
    expect(result.total_purchase_cost).toBe(119);
    expect(result.gross_margin).toBe(100);
    expect(result.tax_purchase_cost).toBe(100);
    expect(result.tax_margin).toBe(119);
    expect(result.vat_amount).toBe(19);
    expect(result.net_profit_after_tax).toBe(81);
  });
  it('erfindet aus Kosten ohne Steuerbeleg keine Vorsteuer', () => {
    const result = engine.calculateSaleTax(
      { ...sale([line('A', 219, 100)]), shipping_cost: 11.9, platform_fee: 11.9 },
      item,
    );
    expect(result.input_tax_deductible).toBe(0);
    expect(result.net_profit_after_tax).toBe(76.2);
  });
  it('kennzeichnet fehlende historische Steuerkosten und verhindert Steuerexport', () => {
    const result = engine.calculateSaleTax(
      sale([{ ...line('A', 219, 100), tax_purchase_cost: null }]),
      item,
    );
    expect(result.calculation_status).toBe('needs_review');
    expect(result.tax_purchase_cost).toBeNull();
    expect(() => engine.generateDatevCsv([result])).toThrow(/prüfen/i);
    expect(() => engine.generateEurCsv([result])).toThrow(/prüfen/i);
  });
  it('rechnet auch den direkten Gesamtaufruf als Summe der Einzeldifferenzen', () => {
    const result = engine.calculateSaleTax(sale([line('A', 120, 100), line('B', 80, 100)]), item);
    expect(result.vat_amount).toBe(3.19);
    expect(result.tax_base).toBe(16.81);
    expect(result.net_profit_after_tax).toBe(-3.19);
    expect(result.tax_margin).toBe(0);
  });
  it('erhält den Rundungsrest ohne negative Kosten einer letzten Position', () => {
    const lines = Array.from({ length: 5 }, (_, index) => ({
      ...line(String(index), 1, 0),
      tax_mode: 'kleinunternehmer_19' as const,
    }));
    const results = engine.calculateSaleLineTaxes({ ...sale(lines), platform_fee: 0.03 }, item);
    expect(results.every((r) => r.net_profit_after_tax <= r.gross_revenue)).toBe(true);
    expect(results.reduce((sum, r) => sum + r.net_profit_after_tax, 0)).toBeCloseTo(4.97, 2);
  });
  it('lässt unbekannte Einzelkosten auch bei bekanntem Gesamtwareneinsatz offen', () => {
    const result = engine.calculateSaleTax(
      sale([line('A', 120, 100), { ...line('B', 80, 100), tax_purchase_cost: undefined }]),
      item,
    );
    expect(result.tax_purchase_cost).toBeNull();
    expect(result.tax_margin).toBeNull();
    expect(result.calculation_status).toBe('needs_review');
    expect(engine.summarizePeriod([result], 'September', 'diff_25a').review_count).toBe(1);
  });
  it('unterscheidet tatsächlich null Euro Einkaufspreis von fehlenden Angaben', () => {
    const result = engine.calculateSaleTax(sale([line('Geschenk', 119, 0)]), item);
    expect(result.calculation_status).toBe('complete');
    expect(result.tax_base).toBe(100);
    expect(result.vat_amount).toBe(19);
  });
  it('erfindet für Altverkäufe ohne Bestand keine Kostenbasis', () => {
    const missingItem = {
      ...item,
      tax_purchase_cost: undefined,
      allocated_purchase_cost: undefined,
    } as unknown as InventoryItem;
    const result = engine.calculateSaleTax(
      { ...sale([]), sale_price: 119 },
      missingItem,
      'regular_19',
    );
    expect(result.calculation_status).toBe('needs_review');
  });
  it('verrechnet auch innerhalb einer Mengenposition keine gegensätzlichen Stückmargen', () => {
    const result = engine.calculateSaleTax(
      sale([
        {
          ...line('A', 200, 200),
          quantity: 2,
          unit_sale_price: 100,
          tax_cost_allocations: [
            { quantity: 1, tax_purchase_cost: 80 },
            { quantity: 1, tax_purchase_cost: 120 },
          ],
        },
      ]),
      item,
    );
    expect(result.vat_amount).toBe(3.19);
    expect(result.tax_base).toBe(16.81);
    expect(result.calculation_status).toBe('complete');
  });
  it('akzeptiert bei mehreren Stücken keinen Summenwert ohne Stückzuordnung', () => {
    const result = engine.calculateSaleTax(
      sale([{ ...line('A', 200, 200), quantity: 2, unit_sale_price: 100 }]),
      item,
    );
    expect(result.calculation_status).toBe('needs_review');
  });
  it.each(
    [
      [],
      [{ quantity: 0, tax_purchase_cost: 200 }],
      [{ quantity: 1, tax_purchase_cost: 200 }],
      [{ quantity: 2, tax_purchase_cost: 199 }],
      [{ quantity: 2, tax_purchase_cost: 200.01 }],
      [{ quantity: 2, tax_purchase_cost: -200 }],
      [{ quantity: 2, tax_purchase_cost: 200.001 }],
    ].map((allocations) => ({ allocations })),
  )('weist widersprüchliche Stückkostensnapshots zurück: %j', ({ allocations }) => {
    const result = engine.calculateSaleTax(
      sale([{ ...line('A', 200, 200), quantity: 2, tax_cost_allocations: allocations }]),
      item,
    );
    expect(result.calculation_status).toBe('needs_review');
  });
  it('verteilt Versandrestcent über Einheiten mit gleichem Stückpreis', () => {
    const result = engine.calculateSaleTax(
      sale([
        {
          ...line('A', 20.03, 0),
          quantity: 2,
          tax_cost_allocations: [{ quantity: 2, tax_purchase_cost: 0 }],
        },
      ]),
      item,
    );
    expect(result.calculation_status).toBe('complete');
    expect(result.vat_amount).toBe(3.2);
    expect(result.tax_base).toBe(16.83);
  });
  it('gibt gemischte Steuerarten nur als getrennte Positionen weiter', () => {
    const mixed = sale([line('A', 119, 100), { ...line('B', 119, 100), tax_mode: 'regular_19' }]);
    expect(() => engine.calculateSaleTax(mixed, item)).toThrow(/getrennte Verkaufspositionen/);
    expect(engine.calculateSaleLineTaxes(mixed, item).map((r) => r.tax_mode)).toEqual([
      'diff_25a',
      'regular_19',
    ]);
  });
  it('exportiert keinen Steuerfall ohne ausdrücklichen Prüfstatus', () => {
    const result = engine.calculateSaleTax(sale([line('A', 119, 100)]), item);
    Reflect.deleteProperty(result, 'calculation_status');
    expect(() => engine.generateDatevCsv([result])).toThrow(/prüfen/);
    expect(engine.summarizePeriod([result], 'September', 'diff_25a').review_count).toBe(1);
  });
});

describe('Steuerexport mit Paketinhalt', () => {
  it.each(['diff_25a', 'regular_19', 'kleinunternehmer_19'] as const)(
    'sperrt offene Kosten auch bei %s und gemischten Verkäufen',
    (mode) => {
      const result = engine.calculateSaleTax(
        sale([
          {
            ...line('Paketinhalt', 80, 0),
            cost_of_goods_sold: null,
            tax_purchase_cost: null,
            tax_mode: mode,
          },
        ]),
        { ...item, allocated_purchase_cost: null },
      );
      expect(result.calculation_status).toBe('needs_review');
      const known = engine.calculateSaleTax(sale([line('Bekannt', 80, 10)]), item);
      expect(engine.summarizePeriod([known, result], 'September', mode).review_count).toBe(1);
      expect(() => engine.generateDatevCsv([known, result])).toThrow(/prüfen/i);
      expect(() => engine.generateEurCsv([known, result])).toThrow(/prüfen/i);
    },
  );
});
