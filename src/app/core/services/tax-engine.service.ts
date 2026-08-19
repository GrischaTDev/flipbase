import { Injectable, computed, inject } from '@angular/core';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import {
  DatevBookingRecord,
  InventoryItem,
  Sale,
  TaxCalculationResult,
  TaxMode,
  TaxPeriodSummary,
} from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class TaxEngineService {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly salesService = inject(SalesService);
  private readonly inventoryService = inject(InventoryService);

  readonly currentTaxMode = computed<TaxMode>(() => {
    return this.workspaceService.currentWorkspace()?.tax_mode || 'diff_25a';
  });

  readonly allTaxCalculations = computed<TaxCalculationResult[]>(() => {
    const sales = this.salesService.sales();
    const items = this.inventoryService.items();
    const defaultMode = this.currentTaxMode();

    return sales.map((sale) => {
      const item =
        sale.inventory_item ||
        items.find((i) => i.id === sale.inventory_item_id) ||
        ({} as InventoryItem);
      return this.calculateSaleTax(sale, item, defaultMode);
    });
  });

  /**
   * Deterministic tax calculation for a single sale.
   */
  calculateSaleTax(
    sale: Sale,
    item: InventoryItem,
    defaultTaxMode: TaxMode = 'diff_25a',
  ): TaxCalculationResult {
    const taxMode = item.tax_mode_override || defaultTaxMode;
    const grossRevenue = sale.sale_price;

    const directItemCosts = item.costs?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
    const totalPurchaseCost = (item.allocated_purchase_cost || 0) + directItemCosts;
    const grossMargin = grossRevenue - totalPurchaseCost;

    let taxBase = 0;
    let vatAmount = 0;
    let inputTaxDeductible = 0;
    let invoiceClause = '';

    // Operating expenses Vorsteuer (e.g. fees, shipping paid with 19% VAT)
    const operatingCosts =
      (sale.platform_fee || 0) +
      (sale.shipping_cost || 0) +
      (sale.packaging_cost || 0) +
      (sale.other_costs || 0);

    switch (taxMode) {
      case 'diff_25a': {
        // § 25a UStG: Tax is strictly due on the positive gross margin (VK - EK)
        taxBase = Math.max(0, grossMargin);
        vatAmount = Number(((taxBase / 1.19) * 0.19).toFixed(2));
        // Input tax from business expenses (e.g. shipping labels, packaging, software)
        inputTaxDeductible = Number(((operatingCosts / 1.19) * 0.19).toFixed(2));
        invoiceClause =
          'Gebrauchtgegenstände / Sonderregelung gem. § 25a UStG (Differenzbesteuerung). Kein gesonderter Ausweis der Umsatzsteuer.';
        break;
      }

      case 'kleinunternehmer_19': {
        // § 19 UStG: No VAT charged, no input tax deductible
        taxBase = 0;
        vatAmount = 0;
        inputTaxDeductible = 0;
        invoiceClause =
          'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).';
        break;
      }

      case 'regular_19': {
        // Standard 19% VAT on total gross price
        taxBase = Number((grossRevenue / 1.19).toFixed(2));
        vatAmount = Number((grossRevenue - taxBase).toFixed(2));
        inputTaxDeductible = Number(((operatingCosts / 1.19) * 0.19).toFixed(2));
        invoiceClause = 'Enthält 19% gesetzliche Umsatzsteuer.';
        break;
      }
    }

    const netTaxLiability = Number((vatAmount - inputTaxDeductible).toFixed(2));
    const netProfitAfterTax = Number((grossMargin - operatingCosts - vatAmount).toFixed(2));

    return {
      sale_id: sale.id,
      item_title: item.title || 'Artikel #' + sale.inventory_item_id.substring(0, 6),
      sale_date: sale.sale_date,
      tax_mode: taxMode,
      gross_revenue: grossRevenue,
      total_purchase_cost: totalPurchaseCost,
      gross_margin: grossMargin,
      tax_base: taxBase,
      vat_amount: vatAmount,
      input_tax_deductible: inputTaxDeductible,
      net_tax_liability: netTaxLiability,
      net_profit_after_tax: netProfitAfterTax,
      invoice_clause: invoiceClause,
    };
  }

  /**
   * Summarizes tax results for a specific period.
   */
  summarizePeriod(
    taxResults: TaxCalculationResult[],
    periodLabel: string,
    taxMode: TaxMode = this.currentTaxMode(),
  ): TaxPeriodSummary {
    const grossRevenue = taxResults.reduce((s, r) => s + r.gross_revenue, 0);
    const totalCostOfGoodsSold = taxResults.reduce((s, r) => s + r.total_purchase_cost, 0);
    const totalGrossMargin = taxResults.reduce((s, r) => s + r.gross_margin, 0);
    const totalVatDue = taxResults.reduce((s, r) => s + r.vat_amount, 0);
    const totalInputTax = taxResults.reduce((s, r) => s + r.input_tax_deductible, 0);
    const totalVatLiability = totalVatDue - totalInputTax;
    const netProfitAfterTax = taxResults.reduce((s, r) => s + r.net_profit_after_tax, 0);

    return {
      period_label: periodLabel,
      total_sales_count: taxResults.length,
      gross_revenue: Number(grossRevenue.toFixed(2)),
      total_cost_of_goods_sold: Number(totalCostOfGoodsSold.toFixed(2)),
      total_gross_margin: Number(totalGrossMargin.toFixed(2)),
      total_vat_due: Number(totalVatDue.toFixed(2)),
      total_input_tax: Number(totalInputTax.toFixed(2)),
      total_vat_liability: Number(totalVatLiability.toFixed(2)),
      net_profit_after_tax: Number(netProfitAfterTax.toFixed(2)),
      tax_mode: taxMode,
    };
  }

  /**
   * Generates a standard DATEV-compatible CSV format for tax advisors (Steuerberater).
   */
  generateDatevCsv(taxResults: TaxCalculationResult[]): string {
    const headers = [
      'Umsatz (ohne Soll/Haben-Kz)',
      'Soll/Haben-Kennzeichen',
      'WKZ',
      'Konto',
      'Gegenkonto',
      'BU-Schlüssel',
      'Belegdatum',
      'Belegfeld 1',
      'Buchungstext',
      'Steuersatz',
    ];

    const rows = taxResults.map((r) => {
      // DATEV Konto nach SKR03:
      // 8200 = Erlöse § 25a Differenzbesteuerung
      // 8195 = Erlöse Kleinunternehmer § 19
      // 8400 = Erlöse 19% USt
      let konto = '8200';
      if (r.tax_mode === 'kleinunternehmer_19') konto = '8195';
      if (r.tax_mode === 'regular_19') konto = '8400';

      const gegenkonto = '1200'; // Bank / Zahlungsdienstleister
      const dateFormatted = r.sale_date ? r.sale_date.replace(/-/g, '').substring(4, 8) : '0101'; // MMDD
      const cleanTitle = r.item_title.replace(/[;,"]/g, ' ').substring(0, 30);

      return [
        r.gross_revenue.toFixed(2).replace('.', ','),
        'S',
        'EUR',
        konto,
        gegenkonto,
        '',
        dateFormatted,
        r.sale_id.substring(0, 10),
        `Verkauf ${cleanTitle}`,
        r.tax_mode === 'diff_25a' ? 'Diff. 19%' : r.tax_mode === 'regular_19' ? '19%' : '0%',
      ].join(';');
    });

    return [
      'EXTF;700;21;DATEV Format;1.0;' + new Date().toISOString().split('T')[0] + ';;;;',
      headers.join(';'),
      ...rows,
    ].join('\r\n');
  }

  /**
   * Generates an EÜR (Einnahmen-Überschuss-Rechnung) CSV summary.
   */
  generateEurCsv(taxResults: TaxCalculationResult[]): string {
    const headers = [
      'Datum',
      'Vorgang / Artikel',
      'Steuer-Modus',
      'Einnahmen Brutto (€)',
      'Wareneinsatz EK (€)',
      'Marge Brutto (€)',
      'USt auf Marge (€)',
      'Abziehbare Vorsteuer (€)',
      'USt-Zahllast (€)',
      'Reingewinn nach USt (€)',
    ];

    const rows = taxResults.map((r) => {
      return [
        r.sale_date,
        `"${r.item_title.replace(/"/g, '""')}"`,
        r.tax_mode,
        r.gross_revenue.toFixed(2).replace('.', ','),
        r.total_purchase_cost.toFixed(2).replace('.', ','),
        r.gross_margin.toFixed(2).replace('.', ','),
        r.vat_amount.toFixed(2).replace('.', ','),
        r.input_tax_deductible.toFixed(2).replace('.', ','),
        r.net_tax_liability.toFixed(2).replace('.', ','),
        r.net_profit_after_tax.toFixed(2).replace('.', ','),
      ].join(';');
    });

    return [headers.join(';'), ...rows].join('\r\n');
  }
}
