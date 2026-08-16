import { describe, it, expect, beforeEach } from 'vitest';
import { ExportService } from './export.service';
import { Sale, Purchase, InventoryItem } from '../models/reflip.models';

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
    expect(csv).toContain('2026-08-16');
    expect(csv).toContain('"Bosch Akkuschrauber; Modell 18V"'); // Escaped semicolon
    expect(csv).toContain('75.00');
    expect(csv).toContain('35.50');
    expect(csv).toContain('90.00');
    expect(csv).toContain('"Barzahlung bei Abholung; netter Kontakt"');
  });

  it('should generate valid JSON Backup with complete workspace snapshot', () => {
    const json = exportService.generateJsonBackup(
      { id: 'ws-1', user_id: 'u-1', name: 'Test Workspace', currency: 'EUR', min_roi_percent: 30, min_profit_absolute: 15, is_default: true, created_at: '2026-08-16' },
      [],
      [],
      []
    );

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.0');
    expect(parsed.workspace.name).toBe('Test Workspace');
    expect(Array.isArray(parsed.purchases)).toBe(true);
    expect(Array.isArray(parsed.inventory)).toBe(true);
    expect(Array.isArray(parsed.sales)).toBe(true);
  });
});
