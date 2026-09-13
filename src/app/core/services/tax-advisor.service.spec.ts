import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TaxAdvisorService } from './tax-advisor.service';
import { TaxEngineService } from './tax-engine.service';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import { Purchase, Sale, TaxCalculationResult } from '../models/flipbase.models';

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
      calculation_status: 'complete',
      tax_purchase_cost: 300,
      tax_margin: 150,
      sale_id: 'sale-1',
      sale_date: '2026-08-15',
      item_title: 'Sony PlayStation 5 Disc Edition',
      tax_mode: 'diff_25a',
      gross_revenue: 450,
      shipping_revenue: 0,
      shipping_cost: 0,
      total_purchase_cost: 300,
      gross_margin: 150,
      tax_base: 126.05,
      vat_amount: 23.95,
      input_tax_deductible: 0,
      net_tax_liability: 23.95,
      net_profit_after_tax: 126.05,
      invoice_clause: 'Sonderregelung Differenzbesteuerung § 25a UStG',
    },
    {
      calculation_status: 'complete',
      tax_purchase_cost: null,
      tax_margin: null,
      sale_id: 'sale-2',
      sale_date: '2026-08-16',
      item_title: 'Apple AirPods Pro 2',
      tax_mode: 'regular_19',
      gross_revenue: 200,
      shipping_revenue: 0,
      shipping_cost: 0,
      total_purchase_cost: 120,
      gross_margin: 80,
      tax_base: 168.07,
      vat_amount: 31.93,
      input_tax_deductible: 0,
      net_tax_liability: 31.93,
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
        } as Purchase,
      ],
      [{ id: 'sale-1', sale_price: 450, platform_fee: 15, shipping_cost: 5 } as Sale],
    );

    expect(report.grossRevenue).toBe(650);
    expect(report.diff25aRevenue).toBe(450);
    expect(report.regular19Revenue).toBe(200);
    expect(report.accountBalances.length).toBeGreaterThan(4);
    expect(report.accountBalances.some((b) => b.accountNumber === '8200')).toBe(true);
  });

  it('übernimmt den Brutto-Verkaufserlös inklusive Käufer-Versand in den Monatsbericht', () => {
    const report = service.buildMonthlyReport(
      2026,
      '08',
      [{ ...sampleTaxResults[0], gross_revenue: 42.98, gross_margin: 12.98 }],
      [],
      [
        {
          id: 'sale-1',
          sale_price: 42.98,
          shipping_revenue: 2.99,
          platform_fee: 7.7,
          shipping_cost: 5.19,
          packaging_cost: 0,
          other_costs: 0,
        } as Sale,
      ],
    );

    expect(report.grossRevenue).toBe(42.98);
    expect(report.operatingExpenses).toBe(12.89);
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

    expect(journalCsv).toContain('Differenz gemäß § 25a (brutto)');
    expect(journalCsv).toContain('Differenzbesteuerung § 25a UStG');
    expect(journalCsv).toContain('Sony PlayStation 5');
  });

  it('bereitet das Berichtspaket wahrheitsgemäß vor, ohne Versand vorzutäuschen', async () => {
    const report = service.buildMonthlyReport(2026, '08', sampleTaxResults, [], []);
    const res = await service.prepareReportPackageForAdvisor(report, 'kanzlei@test.de');

    expect(res.status).toBe('prepared');
    expect(res.message).toContain('kanzlei@test.de');
    expect(res.message).toContain('noch nicht eingerichtet');
    expect(res.message).not.toMatch(/versendet|übermittelt|übertragen/i);
    expect(service.lastPreparationResult()).toEqual(res);
  });
  it('summiert Nettobemessungsgrundlagen und Ergebnisse je Position ohne Verlustverrechnung', () => {
    const results: TaxCalculationResult[] = [
      {
        ...sampleTaxResults[0],
        sale_id: 'same-sale',
        gross_revenue: 120,
        total_purchase_cost: 100,
        tax_purchase_cost: 100,
        tax_margin: 20,
        gross_margin: 20,
        tax_base: 16.81,
        vat_amount: 3.19,
        net_tax_liability: 3.19,
        net_profit_after_tax: 16.81,
      },
      {
        ...sampleTaxResults[0],
        sale_id: 'same-sale',
        gross_revenue: 80,
        total_purchase_cost: 100,
        tax_purchase_cost: 100,
        tax_margin: -20,
        gross_margin: -20,
        tax_base: 0,
        vat_amount: 0,
        net_tax_liability: 0,
        net_profit_after_tax: -20,
      },
    ];
    const report = service.buildMonthlyReport(2026, '08', results, [], []);
    expect(report).toMatchObject({
      salesCount: 1,
      diffTaxBase: 16.81,
      vatPayable: 3.19,
      estimatedTaxDue: 3.19,
      netIncomeAfterTax: -3.19,
      calculationStatus: 'complete',
      reviewCount: 0,
    });
  });

  it('bezieht nur Verkäufe des Berichts und Einkäufe des gewählten Zeitraums ein', () => {
    const report = service.buildMonthlyReport(
      2026,
      '08',
      sampleTaxResults,
      [
        { id: 'aug', purchase_date: '2026-08-01' },
        { id: 'jul', purchase_date: '2026-07-01' },
      ] as Purchase[],
      [
        { id: 'sale-1', platform_fee: 3 },
        { id: 'outside', platform_fee: 90 },
      ] as Sale[],
    );
    expect(report.operatingExpenses).toBe(3);
    expect(report.purchasesCount).toBe(1);
    expect(report.salesCount).toBe(2);
    expect(report.accountBalances.find((account) => account.accountNumber === '4970')?.debit).toBe(
      3,
    );
  });

  it('gibt bei ungeklärten Positionen keine scheinbar vollständigen Monatssteuern oder Kontensalden aus', async () => {
    const results: TaxCalculationResult[] = [
      sampleTaxResults[1],
      {
        ...sampleTaxResults[0],
        calculation_status: 'needs_review',
        tax_purchase_cost: null,
        tax_margin: null,
        tax_base: 0,
        vat_amount: 0,
        net_tax_liability: 0,
        net_profit_after_tax: 0,
      },
    ];
    const report = service.buildMonthlyReport(2026, '08', results, [], []);
    expect(report).toMatchObject({
      calculationStatus: 'needs_review',
      reviewCount: 1,
      diffTaxBase: null,
      vatPayable: null,
      estimatedTaxDue: null,
      netIncomeAfterTax: null,
      accountBalances: [],
      grossRevenue: 650,
    });
    expect(() => service.generateDatevExtfCsv(report, results)).toThrow('prüfen');
    expect(() => service.generateDiffTaxJournalCsv(results)).toThrow('prüfen');
    await expect(service.prepareReportPackageForAdvisor(report)).rejects.toThrow('prüfen');
    expect(service.lastPreparationResult()).toBeNull();
    expect(service.isPreparingReport()).toBe(false);
  });

  it('prüft Exportdaten erneut auch bei einem zuvor vollständigen Monatsbericht', () => {
    const report = service.buildMonthlyReport(2026, '08', sampleTaxResults, [], []);
    const changed: TaxCalculationResult[] = [
      { ...sampleTaxResults[0], calculation_status: 'needs_review' },
    ];
    expect(() => service.generateDatevExtfCsv(report, changed)).toThrow('prüfen');
  });

  it('exportiert steuerlichen Einkaufspreis und Differenz getrennt vom betrieblichen Ergebnis', () => {
    const result: TaxCalculationResult = {
      ...sampleTaxResults[0],
      total_purchase_cost: 350,
      gross_margin: 100,
      tax_purchase_cost: 300,
      tax_margin: 150,
      net_profit_after_tax: 76.05,
    };
    const row = service.generateDiffTaxJournalCsv([result]).split('\r\n')[1].split(';');
    expect(row[2]).toBe('300,00');
    expect(row[5]).toBe('150,00');
    expect(row[6]).toBe('126,05');
    expect(row[9]).toBe('76,05');
  });

  it('sperrt bekannte Regelbesteuerung nicht wegen eines fehlenden §-25a-Einkaufspreises', () => {
    const results = [sampleTaxResults[1]];
    const report = service.buildMonthlyReport(2026, '08', results, [], []);
    expect(report.calculationStatus).toBe('complete');
    expect(() => service.generateDatevExtfCsv(report, results)).not.toThrow();
  });
  it('behandelt einen fehlenden Berechnungsstatus als ungeprüft und sperrt alle Berichtsexporte', async () => {
    const legacyResult = { ...sampleTaxResults[0] };
    Reflect.deleteProperty(legacyResult, 'calculation_status');
    const report = service.buildMonthlyReport(2026, '08', [legacyResult], [], []);
    expect(report).toMatchObject({
      calculationStatus: 'needs_review',
      reviewCount: 1,
      vatPayable: null,
      diffTaxBase: null,
      netIncomeAfterTax: null,
    });
    expect(() => service.generateDatevExtfCsv(report, [legacyResult])).toThrow('prüfen');
    expect(() => service.generateDiffTaxJournalCsv([legacyResult])).toThrow('prüfen');
    await expect(service.prepareReportPackageForAdvisor(report)).rejects.toThrow('prüfen');
    expect(service.lastPreparationResult()).toBeNull();
  });
});
