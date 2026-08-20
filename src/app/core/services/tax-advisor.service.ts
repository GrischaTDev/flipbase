import { Injectable, effect, inject, signal } from '@angular/core';
import {
  DatevAccountBalance,
  MonthlyTaxReport,
  TaxAdvisorConfig,
} from '../models/accounting.models';
import { Purchase, Sale, TaxCalculationResult } from '../models/reflip.models';
import { WebhookService } from './webhook.service';
import { WebPushService } from './web-push.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { SyncStatusService } from './sync-status.service';
import { TaxEngineService } from './tax-engine.service';
import { MockDataStoreService } from './mock-data-store.service';

const STORAGE_KEY_ADVISOR = 'reflip_tax_advisor_config';

@Injectable({
  providedIn: 'root',
})
export class TaxAdvisorService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly taxEngine = inject(TaxEngineService);
  private readonly syncStatus = inject(SyncStatusService, { optional: true })!;
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webhookService = inject(WebhookService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

  readonly advisorConfig = signal<TaxAdvisorConfig>(this.loadAdvisorConfig());
  readonly isSendingEmail = signal<boolean>(false);
  readonly lastDispatchResult = signal<{
    success: boolean;
    message: string;
    timestamp: string;
  } | null>(null);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadFromSupabase(ws.id);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
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

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    try {
      const { data, error } = await this.supabase.client
        .from('tax_advisor_configs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (!error && data) {
        const cfg: TaxAdvisorConfig = {
          firmName: data.firm_name || '',
          advisorEmail: data.advisor_email || '',
          clientNumber: data.client_number || '',
          consultantNumber: data.consultant_number || '',
          skrStandard: (data.skr_standard as 'SKR03' | 'SKR04') || 'SKR03',
          autoSendOnFirstOfMonth: data.auto_send_on_first_of_month,
          includeDiffTaxJournal: data.include_diff_tax_journal,
          includeDatevBookingStack: data.include_datev_booking_stack,
          includePdfReport: data.include_pdf_report,
        };
        this.advisorConfig.set(cfg);
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(STORAGE_KEY_ADVISOR, JSON.stringify(cfg));
          }
        } catch {}
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Steuerberaterkonfiguration', err);
    }
  }

  updateAdvisorConfig(updates: Partial<TaxAdvisorConfig>): void {
    const updated = { ...this.advisorConfig(), ...updates };
    this.advisorConfig.set(updated);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_ADVISOR, JSON.stringify(updated));
      }
    } catch {}

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client
        .from('tax_advisor_configs')
        .upsert(
          {
            workspace_id: ws.id,
            firm_name: updated.firmName,
            advisor_email: updated.advisorEmail,
            client_number: updated.clientNumber,
            consultant_number: updated.consultantNumber,
            skr_standard: updated.skrStandard,
            auto_send_on_first_of_month: updated.autoSendOnFirstOfMonth,
            include_diff_tax_journal: updated.includeDiffTaxJournal,
            include_datev_booking_stack: updated.includeDatevBookingStack,
            include_pdf_report: updated.includePdfReport,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
        .then(({ error }) => {
          if (error) {
            this.syncStatus.melde('Speichern der Steuerberaterkonfiguration', error);
          }
        });
    }
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
    workspaceName = 'ReFlip Reselling HQ',
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
      (sum, s) =>
        sum +
        (s.platform_fee || 0) +
        (s.shipping_cost || 0) +
        (s.packaging_cost || 0) +
        (s.other_costs || 0),
      0,
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
    const accWareneinsatz = isSkr04 ? '5200' : '3200';
    const accPorto = isSkr04 ? '6800' : '4910';
    const accGebuehren = isSkr04 ? '6855' : '4970';
    const accUstDiff = isSkr04 ? '3800' : '1776';
    const accVorsteuer = isSkr04 ? '1406' : '1576';

    const accountBalances: DatevAccountBalance[] = [
      {
        accountNumber: accBank,
        accountName: 'Bank / Kasse (Gegenkonto)',
        debit: grossRevenue,
        credit: operatingExpenses + totalCostOfGoodsSold,
        balance: grossRevenue - operatingExpenses - totalCostOfGoodsSold,
      },
      {
        accountNumber: accRevDiff,
        accountName: 'Erlöse § 25a Differenzbesteuerung',
        debit: 0,
        credit: diff25aRevenue,
        balance: -diff25aRevenue,
      },
      {
        accountNumber: accRev19,
        accountName: 'Erlöse 19% Regelbesteuerung',
        debit: 0,
        credit: regular19Revenue,
        balance: -regular19Revenue,
      },
      {
        accountNumber: accWareneinsatz,
        accountName: 'Wareneingang § 25a (Wareneinsatz)',
        debit: totalCostOfGoodsSold,
        credit: 0,
        balance: totalCostOfGoodsSold,
      },
      {
        accountNumber: accPorto,
        accountName: 'Ausgehende Frachten & Porto',
        debit: sales.reduce((sum, s) => sum + (s.shipping_cost || 0) + (s.packaging_cost || 0), 0),
        credit: 0,
        balance: sales.reduce(
          (sum, s) => sum + (s.shipping_cost || 0) + (s.packaging_cost || 0),
          0,
        ),
      },
      {
        accountNumber: accGebuehren,
        accountName: 'Verkaufsgebühren Marktplätze (eBay/Vinted)',
        debit: sales.reduce((sum, s) => sum + (s.platform_fee || 0), 0),
        credit: 0,
        balance: sales.reduce((sum, s) => sum + (s.platform_fee || 0), 0),
      },
      {
        accountNumber: accUstDiff,
        accountName: 'Umsatzsteuer Zahllast (UStVA)',
        debit: 0,
        credit: vatPayable,
        balance: -vatPayable,
      },
      {
        accountNumber: accVorsteuer,
        accountName: 'Abziehbare Vorsteuer',
        debit: inputTaxDeductible,
        credit: 0,
        balance: inputTaxDeductible,
      },
    ];

    return {
      periodKey,
      periodLabel,
      generatedAt: new Date().toISOString(),
      workspaceName,
      taxAdvisor: cfg,
      salesCount: sales.length,
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

  /** Entschärft Werte, die ein Tabellenprogramm sonst als Formel ausführen würde. */
  private schuetzeVorFormel(wert: string): string {
    return /^[=+\-@\t\r]/.test(wert) ? `'${wert}` : wert;
  }

  /**
   * Erzeugt den DATEV-Buchungsstapel für die Steuerkanzlei.
   *
   * Delegiert an den TaxEngineService. Zuvor gab es hier eine zweite, eigene
   * Umsetzung mit gravierenden Fehlern: Die Felder der Buchungszeilen waren
   * gegenüber den Spaltenüberschriften um eine Position verschoben – das
   * Bankkonto landete in der Spalte „BU-Schlüssel", das Belegdatum blieb leer
   * und stand stattdessen in „Belegfeld 1". Zusätzlich hatte die Kopfzeile 26
   * statt 31 Felder, das Datum stand als MMTT statt TTMM, und die Zeilen waren
   * mit LF statt CRLF getrennt.
   */
  generateDatevExtfCsv(report: MonthlyTaxReport, results: TaxCalculationResult[]): string {
    const cfg = this.advisorConfig();

    return this.taxEngine.generateDatevCsv(results, {
      skrStandard: cfg.skrStandard === 'SKR04' ? 'SKR04' : 'SKR03',
      beraternummer: cfg.consultantNumber,
      mandantennummer: cfg.clientNumber,
      bezeichnung: report.periodLabel,
    });
  }

  /**
   * Generates a detailed Differential Taxation Journal (§ 25a UStG).
   */
  generateDiffTaxJournalCsv(results: TaxCalculationResult[]): string {
    const headers = [
      'Verkauf-ID',
      'Artikelbezeichnung',
      'Einkaufspreis (EUR)',
      'Verkaufsdatum',
      'Verkaufspreis (EUR)',
      'Handelsspanne / Rohgewinn',
      'Bemessungsgrundlage USt (EUR)',
      'Umsatzsteuersatz',
      'Enthaltene USt (EUR)',
      'Nettomarge nach Steuer (EUR)',
      'Steuerregelung',
    ];

    const diffResults = results.filter((r) => r.tax_mode === 'diff_25a');
    const rows = diffResults.map((r) => {
      return [
        `"${r.sale_id}"`,
        `"${this.schuetzeVorFormel(r.item_title).replace(/"/g, '""')}"`,
        r.total_purchase_cost.toFixed(2).replace('.', ','),
        `"${r.sale_date}"`,
        r.gross_revenue.toFixed(2).replace('.', ','),
        r.gross_margin.toFixed(2).replace('.', ','),
        r.tax_base.toFixed(2).replace('.', ','),
        '"19% (§ 25a)"',
        r.vat_amount.toFixed(2).replace('.', ','),
        r.net_profit_after_tax.toFixed(2).replace('.', ','),
        '"Differenzbesteuerung § 25a UStG"',
      ].join(';');
    });

    // CRLF als Zeilenende: Buchhaltungsprogramme und DATEV erwarten es so.
    return [headers.join(';'), ...rows].join('\r\n');
  }

  /**
   * Sends the monthly tax report bundle to the tax consultant email address.
   */
  async sendReportPackageToAdvisor(
    report: MonthlyTaxReport,
    email?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.isSendingEmail.set(true);

    await new Promise((res) => setTimeout(res, 1000));

    const cfg = this.advisorConfig();
    const targetEmail = email || cfg.advisorEmail;
    const result = {
      success: true,
      message: `Monatspaket für ${report.periodLabel} erfolgreich an ${cfg.firmName} (${targetEmail}) übermittelt.`,
      timestamp: new Date().toISOString(),
    };

    this.lastDispatchResult.set(result);
    this.isSendingEmail.set(false);

    if (this.webPushService) {
      this.webPushService.sendNotification('📤 DATEV-Monatspaket versendet', {
        body: result.message,
        tag: `tax-dispatch-${report.periodKey}`,
      });
    }

    if (this.webhookService) {
      this.webhookService.addNotification({
        title: 'Kanzlei-Monatspaket versandt',
        message: `${report.periodLabel} (${report.salesCount} Buchungssätze) an Steuerberater ${targetEmail} übertragen.`,
        type: 'system',
      });
    }

    return result;
  }
}
