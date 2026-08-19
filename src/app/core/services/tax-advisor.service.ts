import { Injectable, inject, signal } from '@angular/core';
import { DatevAccountBalance, MonthlyTaxReport, TaxAdvisorConfig } from '../models/accounting.models';
import { Purchase, Sale, TaxCalculationResult } from '../models/reflip.models';
import { WebhookService } from './webhook.service';
import { WebPushService } from './web-push.service';

const STORAGE_KEY_ADVISOR = 'reflip_tax_advisor_config';

@Injectable({
  providedIn: 'root',
})
export class TaxAdvisorService {
  private readonly webhookService: WebhookService | null = null;
  private readonly webPushService: WebPushService | null = null;

  readonly advisorConfig = signal<TaxAdvisorConfig>(this.loadAdvisorConfig());
  readonly isSendingEmail = signal<boolean>(false);
  readonly lastDispatchResult = signal<{ success: boolean; message: string; timestamp: string } | null>(null);

  constructor() {
    try {
      this.webhookService = inject(WebhookService, { optional: true });
      this.webPushService = inject(WebPushService, { optional: true });
    } catch {
      this.webhookService = null;
      this.webPushService = null;
    }
  }

  private loadAdvisorConfig(): TaxAdvisorConfig {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_ADVISOR);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return {
      firmName: 'Kanzlei Dr. Müller & Partner Steuerberater',
      advisorEmail: 'mandanten@steuerberatung-mueller.de',
      clientNumber: '10854',
      consultantNumber: '20941',
      skrStandard: 'SKR03',
      autoSendOnFirstOfMonth: false,
      includeDiffTaxJournal: true,
      includeDatevBookingStack: true,
      includePdfReport: true,
    };
  }

  updateAdvisorConfig(updates: Partial<TaxAdvisorConfig>): void {
    const updated = { ...this.advisorConfig(), ...updates };
    this.advisorConfig.set(updated);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_ADVISOR, JSON.stringify(updated));
      }
    } catch {}
  }

  /**
   * Builds an aggregated Monthly Tax Report for the tax advisor with SKR account balances.
   */
  buildMonthlyReport(
    year: number,
    period: string,
    taxResults: TaxCalculationResult[],
    purchases: Purchase[],
    sales: Sale[],
    workspaceName: string = 'ReFlip Reselling HQ'
  ): MonthlyTaxReport {
    const cfg = this.advisorConfig();
    const periodLabel = period === 'all' ? `Gesamtjahr ${year}` : `${period} ${year}`;
    const periodKey = `${year}-${period}`;

    const grossRevenue = taxResults.reduce((sum, r) => sum + r.gross_revenue, 0);
    const diff25aResults = taxResults.filter((r) => r.tax_mode === 'diff_25a');
    const regular19Results = taxResults.filter((r) => r.tax_mode === 'regular_19');

    const diff25aRevenue = diff25aResults.reduce((sum, r) => sum + r.gross_revenue, 0);
    const regular19Revenue = regular19Results.reduce((sum, r) => sum + r.gross_revenue, 0);

    const totalCostOfGoodsSold = taxResults.reduce((sum, r) => sum + r.total_purchase_cost, 0);
    const operatingExpenses = sales.reduce(
      (sum, s) => sum + (s.platform_fee || 0) + (s.shipping_cost || 0) + (s.packaging_cost || 0) + (s.other_costs || 0),
      0
    );

    const grossProfitMargin = grossRevenue - totalCostOfGoodsSold;
    const diffTaxBase = diff25aResults.reduce((sum, r) => sum + r.gross_margin, 0);
    const vatPayable = taxResults.reduce((sum, r) => sum + r.vat_amount, 0);
    const inputTaxDeductible = taxResults.reduce((sum, r) => sum + r.input_tax_deductible, 0);
    const estimatedTaxDue = vatPayable - inputTaxDeductible;
    const netIncomeAfterTax = grossProfitMargin - operatingExpenses - Math.max(0, estimatedTaxDue);

    // Compute SKR03 or SKR04 Account Balances
    const isSkr04 = cfg.skrStandard === 'SKR04';
    const accBank = isSkr04 ? '1800' : '1200';
    const accRevDiff = isSkr04 ? '4200' : '8200';
    const accRev19 = isSkr04 ? '4400' : '8400';
    const accCogs = isSkr04 ? '5200' : '3200';
    const accVat = isSkr04 ? '3806' : '1776';
    const accInputTax = isSkr04 ? '1406' : '1576';
    const accFees = isSkr04 ? '6855' : '4900';

    const accountBalances: DatevAccountBalance[] = [
      {
        accountNumber: accBank,
        accountName: 'Bank / Zahlungsdienstleister (PayPal, Stripe, Kasse)',
        debit: Number(grossRevenue.toFixed(2)),
        credit: Number((totalCostOfGoodsSold + operatingExpenses).toFixed(2)),
        balance: Number((grossRevenue - totalCostOfGoodsSold - operatingExpenses).toFixed(2)),
      },
      {
        accountNumber: accRevDiff,
        accountName: 'Erlöse § 25a Differenzbesteuerung',
        debit: 0,
        credit: Number(diff25aRevenue.toFixed(2)),
        balance: Number((-diff25aRevenue).toFixed(2)),
      },
      {
        accountNumber: accRev19,
        accountName: 'Erlöse 19% Regelbesteuerung',
        debit: 0,
        credit: Number(regular19Revenue.toFixed(2)),
        balance: Number((-regular19Revenue).toFixed(2)),
      },
      {
        accountNumber: accCogs,
        accountName: 'Wareneingang / Anschaffungskosten',
        debit: Number(totalCostOfGoodsSold.toFixed(2)),
        credit: 0,
        balance: Number(totalCostOfGoodsSold.toFixed(2)),
      },
      {
        accountNumber: accFees,
        accountName: 'Verkaufsgebühren & Versandkosten (Nebenkosten)',
        debit: Number(operatingExpenses.toFixed(2)),
        credit: 0,
        balance: Number(operatingExpenses.toFixed(2)),
      },
      {
        accountNumber: accVat,
        accountName: 'Umsatzsteuer auf Differenz & Regelumsatz',
        debit: 0,
        credit: Number(vatPayable.toFixed(2)),
        balance: Number((-vatPayable).toFixed(2)),
      },
      {
        accountNumber: accInputTax,
        accountName: 'Abziehbare Vorsteuer 19%',
        debit: Number(inputTaxDeductible.toFixed(2)),
        credit: 0,
        balance: Number(inputTaxDeductible.toFixed(2)),
      },
    ];

    return {
      periodLabel,
      periodKey,
      generatedAt: new Date().toISOString(),
      workspaceName,
      taxAdvisor: cfg,
      salesCount: taxResults.length,
      purchasesCount: purchases.length,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      diff25aRevenue: Number(diff25aRevenue.toFixed(2)),
      regular19Revenue: Number(regular19Revenue.toFixed(2)),
      totalCostOfGoodsSold: Number(totalCostOfGoodsSold.toFixed(2)),
      operatingExpenses: Number(operatingExpenses.toFixed(2)),
      grossProfitMargin: Number(grossProfitMargin.toFixed(2)),
      diffTaxBase: Number(diffTaxBase.toFixed(2)),
      vatPayable: Number(vatPayable.toFixed(2)),
      inputTaxDeductible: Number(inputTaxDeductible.toFixed(2)),
      estimatedTaxDue: Number(estimatedTaxDue.toFixed(2)),
      netIncomeAfterTax: Number(netIncomeAfterTax.toFixed(2)),
      accountBalances,
    };
  }

  /**
   * Generates a fully standard-compliant DATEV EXTF Buchungsstapel CSV file.
   */
  generateDatevExtfCsv(report: MonthlyTaxReport, taxResults: TaxCalculationResult[]): string {
    const cfg = report.taxAdvisor;
    const isSkr04 = cfg.skrStandard === 'SKR04';
    const accBank = isSkr04 ? '1800' : '1200';
    const accRevDiff = isSkr04 ? '4200' : '8200';
    const accRev19 = isSkr04 ? '4400' : '8400';
    const accRev0 = isSkr04 ? '4185' : '8195';

    const headerLine1 = `"EXTF";700;21;"Buchungsstapel";1.0;${new Date().toISOString().split('T')[0]};;;;"${cfg.consultantNumber}";"${cfg.clientNumber}";${report.periodKey.substring(0, 4)}0101;4;${report.periodKey.replace('-', '')};;;;"${cfg.skrStandard}";;;`;
    
    const colHeaders = [
      'Umsatz (ohne Soll/Haben-Kz)',
      'Soll/Haben-Kennzeichen',
      'WKZ',
      'Konto',
      'Gegenkonto',
      'BU-Schluessel',
      'Belegdatum',
      'Belegfeld 1',
      'Buchungstext',
      'Steuersatz',
      'Mandantennr',
    ].join(';');

    const rows = taxResults.map((r) => {
      let konto = accRevDiff;
      if (r.tax_mode === 'kleinunternehmer_19') konto = accRev0;
      if (r.tax_mode === 'regular_19') konto = accRev19;

      const dateClean = r.sale_date ? r.sale_date.replace(/-/g, '').substring(4, 8) : '0101';
      const cleanTitle = r.item_title.replace(/[;,"]/g, ' ').substring(0, 30);

      return [
        r.gross_revenue.toFixed(2).replace('.', ','),
        'S',
        'EUR',
        konto,
        accBank,
        '',
        dateClean,
        r.sale_id.substring(0, 10),
        `Verkauf ${cleanTitle}`,
        r.tax_mode === 'diff_25a' ? 'Diff §25a' : r.tax_mode === 'regular_19' ? '19%' : '0%',
        cfg.clientNumber,
      ].join(';');
    });

    return [headerLine1, colHeaders, ...rows].join('\r\n');
  }

  /**
   * Generates a § 25a Differenzbesteuerungs-Journal CSV for statutory tax audit proof.
   */
  generateDiffTaxJournalCsv(taxResults: TaxCalculationResult[]): string {
    const headers = [
      'Verkaufsdatum',
      'Artikelbezeichnung',
      'Steuermodus',
      'Bruttoverkaufserloes (€)',
      'Gesamter Wareneinsatz (€)',
      'Handelsspanne / Rohgewinn (€)',
      'Bemessungsgrundlage USt (€)',
      'Abzufuehrende USt (19%) (€)',
      'Gezahlte Vorsteuer (€)',
      'USt-Zahllast (€)',
      'Reingewinn nach Steuern (€)',
      'Rechtsklausel (§ 25a UStG)',
    ];

    const rows = taxResults.map((r) => [
      r.sale_date,
      `"${r.item_title.replace(/"/g, '""')}"`,
      r.tax_mode,
      r.gross_revenue.toFixed(2).replace('.', ','),
      r.total_purchase_cost.toFixed(2).replace('.', ','),
      r.gross_margin.toFixed(2).replace('.', ','),
      r.tax_base.toFixed(2).replace('.', ','),
      r.vat_amount.toFixed(2).replace('.', ','),
      r.input_tax_deductible.toFixed(2).replace('.', ','),
      r.net_tax_liability.toFixed(2).replace('.', ','),
      r.net_profit_after_tax.toFixed(2).replace('.', ','),
      `"${(r.invoice_clause || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\r\n');
  }

  /**
   * Simulates dispatching the complete tax report package with DATEV attachments to the advisor.
   */
  async sendReportPackageToAdvisor(
    report: MonthlyTaxReport,
    customAdvisorEmail?: string,
    customMessage?: string
  ): Promise<{ success: boolean; message: string; timestamp: string }> {
    this.isSendingEmail.set(true);
    const targetEmail = customAdvisorEmail || report.taxAdvisor.advisorEmail;

    // Simulate secure email & DATEV API dispatch
    await new Promise((res) => setTimeout(res, 800));

    const timestamp = new Date().toLocaleString('de-DE');
    const result = {
      success: true,
      message: `Monatsbericht (${report.periodLabel}) inklusive DATEV-Buchungsstapel und § 25a Journal erfolgreich an ${targetEmail} übermittelt.`,
      timestamp,
    };

    this.lastDispatchResult.set(result);
    this.isSendingEmail.set(false);

    // Notify user in-app and via web push
    if (this.webPushService) {
      this.webPushService.sendNotification('DATEV Monatsabschluss versendet', {
        body: `Bericht für ${report.periodLabel} an ${targetEmail} gesendet.`,
        tag: 'tax-report-sent',
      });
    }

    if (this.webhookService) {
      this.webhookService.addNotification({
        title: 'DATEV Steuerberater-Bericht versendet',
        message: `Monatsbericht (${report.periodLabel}) an ${targetEmail} übermittelt.`,
        type: 'system',
      });
    }

    return result;
  }
}
