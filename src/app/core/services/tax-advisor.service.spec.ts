import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TaxAdvisorService } from './tax-advisor.service';
import { TaxEngineService } from './tax-engine.service';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import { Purchase, Sale, TaxCalculationResult } from '../models/reflip.models';

describe('TaxAdvisorService & DATEV Export Engine (Chapter 24)', () => {
  let service: TaxAdvisorService;

  beforeEach(() => {
    // Der TaxAdvisorService delegiert den DATEV-Export an den TaxEngineService;
    // dieser wird deshalb mit schlanken Attrappen echt bereitgestellt.
    const engineInjector = Injector.create({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace: signal(null) } },
        { provide: SalesService, useValue: { sales: signal([]) } },
        { provide: InventoryService, useValue: { items: signal([]) } },
      ],
    });
    const taxEngine = runInInjectionContext(engineInjector, () => new TaxEngineService());

    const injector = Injector.create({
      providers: [{ provide: TaxEngineService, useValue: taxEngine }],
    });
    service = runInInjectionContext(injector, () => new TaxAdvisorService());
  });

  const sampleTaxResults: TaxCalculationResult[] = [
    {
      sale_id: 'sale-1',
      sale_date: '2026-08-15',
      item_title: 'Sony PlayStation 5 Disc Edition',
      tax_mode: 'diff_25a',
      gross_revenue: 450,
      total_purchase_cost: 300,
      gross_margin: 150,
      tax_base: 150,
      vat_amount: 23.95,
      input_tax_deductible: 4.5,
      net_tax_liability: 19.45,
      net_profit_after_tax: 126.05,
      invoice_clause: 'Sonderregelung Differenzbesteuerung § 25a UStG',
    },
    {
      sale_id: 'sale-2',
      sale_date: '2026-08-16',
      item_title: 'Apple AirPods Pro 2',
      tax_mode: 'regular_19',
      gross_revenue: 200,
      total_purchase_cost: 120,
      gross_margin: 80,
      tax_base: 200,
      vat_amount: 31.93,
      input_tax_deductible: 2.0,
      net_tax_liability: 29.93,
      net_profit_after_tax: 48.07,
      invoice_clause: 'Regelbesteuerung 19% USt',
    },
  ];

  it('should initialize with default tax advisor settings', () => {
    const cfg = service.advisorConfig();
    expect(cfg.advisorEmail).toContain('@');
    expect(cfg.clientNumber).toBeDefined();
    expect(cfg.skrStandard).toBe('SKR03');
  });

  it('should build monthly tax report with SKR account balances', () => {
    const report = service.buildMonthlyReport(
      2026,
      '08',
      sampleTaxResults,
      [
        {
          id: 'p1',
          purchase_price: 300,
          shipping_cost: 0,
          purchase_date: '2026-08-01',
          status: 'active',
        } as Purchase,
      ],
      [{ id: 's1', sale_price: 450, platform_fee: 15, shipping_cost: 5 } as Sale],
    );

    expect(report.grossRevenue).toBe(650);
    expect(report.diff25aRevenue).toBe(450);
    expect(report.regular19Revenue).toBe(200);
    expect(report.accountBalances.length).toBeGreaterThan(4);
    expect(report.accountBalances.some((b) => b.accountNumber === '8200')).toBe(true);
  });

  it('should generate valid DATEV EXTF Buchungsstapel CSV', () => {
    const report = service.buildMonthlyReport(2026, '08', sampleTaxResults, [], []);
    const csv = service.generateDatevExtfCsv(report, sampleTaxResults);

    expect(csv).toContain('EXTF');
    expect(csv).toContain('Buchungsstapel');
    expect(csv).toContain('8200');
    expect(csv).toContain('8400');
  });

  it('should generate § 25a Differenzbesteuerungs-Journal CSV', () => {
    const journalCsv = service.generateDiffTaxJournalCsv(sampleTaxResults);

    expect(journalCsv).toContain('Handelsspanne / Rohgewinn');
    expect(journalCsv).toContain('Differenzbesteuerung § 25a UStG');
    expect(journalCsv).toContain('Sony PlayStation 5');
  });

  it('should simulate sending report package to tax advisor', async () => {
    const report = service.buildMonthlyReport(2026, '08', sampleTaxResults, [], []);
    const res = await service.sendReportPackageToAdvisor(report, 'kanzlei@test.de');

    expect(res.success).toBe(true);
    expect(service.lastDispatchResult()).toBeDefined();
    expect(service.lastDispatchResult()?.message).toContain('kanzlei@test.de');
  });
});
