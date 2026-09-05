import { describe, it, expect, beforeEach } from 'vitest';
import { ExportService } from './export.service';
import { Purchase, Sale } from '../models/flipbase.models';

describe('ExportService (Phase 10: CSV & JSON Backup)', () => {
  let exportService: ExportService;

  beforeEach(() => {
    exportService = new ExportService();
  });

  it('should generate valid German Excel-compatible semicolon CSV for Sales (Chapter 32)', () => {
    const mockSales: Sale[] = [
      {
        id: 'sale-1',
        workspace_id: 'ws-1',
        inventory_item_id: 'item-1',
        platform: 'kleinanzeigen',
        sale_price: 75.0,
        shipping_revenue: 2.99,
        sale_date: '2026-08-16',
        platform_fee: 0,
        shipping_cost: 6.99,
        packaging_cost: 1.5,
        other_costs: 0,
        net_profit: 35.5,
        roi: 90.0,
        holding_duration_days: 12,
        external_order_id: 'ORD-12345',
        buyer_notes: 'Barzahlung bei Abholung; netter Kontakt',
        inventory_item: {
          id: 'item-1',
          workspace_id: 'ws-1',
          title: 'Bosch Akkuschrauber; Modell 18V',
          condition: 'very_good',
          status: 'sold',
          allocated_purchase_cost: 31.01,
        },
      },
    ];

    const csv = exportService.generateSalesCsv(mockSales);

    expect(csv).toContain('Verkaufsdatum;Artikel;Plattform');
    expect(csv).toContain('Verkaufserlös brutto (€)');
    expect(csv).toContain('Versand vom Käufer (€)');
    expect(csv).toContain('Tatsächliche Versandkosten (€)');
    expect(csv).toContain('2026-08-16');
    expect(csv).toContain('"Bosch Akkuschrauber; Modell 18V"'); // Escaped semicolon
    expect(csv).toContain('75.00');
    expect(csv).toContain('35.50');
    expect(csv).toContain('90.00');
    expect(csv).toContain('"Barzahlung bei Abholung; netter Kontakt"');
  });

  it('exports an unknown draft purchase price as an empty value instead of a real zero price', () => {
    const draftPurchase = {
      id: 'purchase-draft',
      workspace_id: 'ws-1',
      type: 'single',
      title: 'Noch nicht bepreist',
      purchase_date: '2026-08-31',
      purchase_price: null,
      cost_allocation_mode: 'even',
      entry_status: 'draft',
      items_count: 1,
    } as unknown as Purchase;

    const csv = exportService.generatePurchasesCsv([draftPurchase]);
    const row = csv.split('\r\n')[1];

    expect(row).toBe('2026-08-31;Noch nicht bepreist;single;Direktkauf;;;;even;1');
    expect(row).not.toContain('0.00');
  });

  it('keeps an explicitly free purchase distinguishable from an unknown price in exports', () => {
    const freePurchase: Purchase = {
      id: 'purchase-free',
      workspace_id: 'ws-1',
      type: 'single',
      title: 'Kostenlos',
      purchase_date: '2026-08-31',
      purchase_price: 0,
      total_purchase_cost: 0,
      cost_allocation_mode: 'even',
      entry_status: 'draft',
      items_count: 1,
    };

    const row = exportService.generatePurchasesCsv([freePurchase]).split('\r\n')[1];

    expect(row).toBe('2026-08-31;Kostenlos;single;Direktkauf;;0.00;0.00;even;1');
  });
});
