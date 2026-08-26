import { Injectable, computed, inject } from '@angular/core';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import {
  InventoryItem,
  Sale,
  TaxCalculationResult,
  TaxMode,
  TaxPeriodSummary,
} from '../models/flipbase.models';

/** Einstellungen für den DATEV-Buchungsstapel. */
export interface DatevOptionen {
  /** Kontenrahmen der Kanzlei. Standard ist SKR03. */
  skrStandard?: 'SKR03' | 'SKR04';
  beraternummer?: string;
  mandantennummer?: string;
  /** Bezeichnung des Stapels, etwa „August 2026". */
  bezeichnung?: string;
}

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

  /**
   * Steuerliche Bemessung je Verkauf.
   *
   * **Retouren bleiben hier bewusst enthalten.** Dashboard und Auswertungen
   * blenden zurueckgegebene Verkaeufe aus - dort geht es um die Frage, was
   * tatsaechlich verdient wurde. In der Buchhaltung ist das anders: Ein
   * Verkauf aus dem ersten Quartal verschwindet nicht rueckwirkend, weil im
   * zweiten eine Gutschrift entsteht. Die Gutschrift gehoert als eigener
   * Vorgang in den Zeitraum, in dem sie ausgestellt wurde.
   *
   * Wie das im DATEV-Buchungsstapel abzubilden ist, gehoert zur
   * Steuerkanzlei - deshalb wird hier nichts geraten und nichts stillschweigend
   * herausgefiltert.
   */
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
    // Reingewinn = Marge abzüglich Betriebskosten abzüglich der tatsächlichen
    // Zahllast. Zuvor wurde die volle Umsatzsteuer abgezogen und die eine Zeile
    // darüber berechnete abziehbare Vorsteuer ignoriert – der ausgewiesene
    // Gewinn war dadurch systematisch zu niedrig.
    const netProfitAfterTax = Number((grossMargin - operatingCosts - netTaxLiability).toFixed(2));

    return {
      sale_id: sale.id,
      item_title: item.title || 'Artikel #' + (sale.inventory_item_id ?? sale.id).substring(0, 6),
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
   * Spalten des DATEV-Buchungsstapels in der vorgeschriebenen Reihenfolge.
   * Öffentlich, damit Tests über den Spaltennamen statt über einen festen
   * Index prüfen können.
   */
  readonly datevSpalten: readonly string[] = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Kurs',
    'Basis-Umsatz',
    'WKZ Basis-Umsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel',
    'Belegdatum',
    'Belegfeld 1',
    'Belegfeld 2',
    'Skonto',
    'Buchungstext',
  ];

  /**
   * Entschärft Werte, die ein Tabellenprogramm sonst als Formel ausführen
   * würde. Ohne das könnte ein Artikeltitel wie `=HYPERLINK(...)` beim Öffnen
   * der Datei in der Steuerkanzlei Schaden anrichten.
   */
  private schuetzeVorFormel(wert: string): string {
    return /^[=+\-@\t\r]/.test(wert) ? `'${wert}` : wert;
  }

  /** Formatiert ein ISO-Datum als TTMM – so erwartet DATEV das Belegdatum. */
  private alsBelegdatum(isoDatum: string): string {
    const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDatum ?? '');
    if (!treffer) return '0101';
    return `${treffer[3]}${treffer[2]}`;
  }

  /** Formatiert ein ISO-Datum als JJJJMMTT für die Kopfzeile. */
  private alsKopfDatum(isoDatum: string): string {
    const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDatum ?? '');
    return treffer ? `${treffer[1]}${treffer[2]}${treffer[3]}` : '';
  }

  /**
   * Erzeugt die 31-feldrige EXTF-Kopfzeile eines DATEV-Buchungsstapels.
   *
   * Zuvor standen dort nur 10 Felder – DATEV konnte die Datei damit nicht
   * einlesen. Feldzahl und Reihenfolge gibt das Format vor.
   */
  private baueExtfKopf(taxResults: TaxCalculationResult[], optionen: DatevOptionen = {}): string {
    const daten = taxResults
      .map((r) => this.alsKopfDatum(r.sale_date))
      .filter((d) => d.length === 8)
      .sort();
    const von = daten[0] ?? this.alsKopfDatum(new Date().toISOString());
    const bis = daten[daten.length - 1] ?? von;
    const wirtschaftsjahr = `${von.substring(0, 4)}0101`;
    const erzeugt = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..*$/, '');

    return [
      '"EXTF"', // 1  Kennzeichen
      '700', // 2  Versionsnummer
      '21', // 3  Formatkategorie: Buchungsstapel
      '"Buchungsstapel"', // 4  Formatname
      '13', // 5  Formatversion
      erzeugt, // 6  Erzeugt am
      '', // 7  importiert (bleibt leer)
      '"RE"', // 8  Herkunft
      '"Flipbase"', // 9  Exportiert von
      '', // 10 Importiert von
      optionen.beraternummer || '0', // 11 Beraternummer
      optionen.mandantennummer || '0', // 12 Mandantennummer
      wirtschaftsjahr, // 13 Wirtschaftsjahresbeginn
      '4', // 14 Sachkontenlänge
      von, // 15 Datum von
      bis, // 16 Datum bis
      `"${(optionen.bezeichnung || '').replace(/"/g, '')}"`, // 17 Bezeichnung
      '""', // 18 Diktatkürzel
      '1', // 19 Buchungstyp: Finanzbuchführung
      '"EUR"', // 20 Währungskennzeichen
      '', // 21 reserviert
      '', // 22 Derivatskennzeichen
      '', // 23 reserviert
      '', // 24 reserviert
      '', // 25 SKR
      '', // 26 Branchenlösung-Id
      '', // 27 reserviert
      '', // 28 reserviert
      '""', // 29 Anwendungsinformation
      '', // 30 reserviert
      '', // 31 reserviert
    ].join(';');
  }

  /**
   * Erzeugt einen DATEV-Buchungsstapel im EXTF-Format.
   *
   * Ein Verkauf wird als *Bank an Erlöse* gebucht: Konto 1200 (Bank),
   * Gegenkonto je nach Steuermodus. Zuvor stand das Erlöskonto im Feld
   * „Konto" mit Kennzeichen S – damit landete der Umsatz auf der falschen
   * Seite. Das Belegdatum stand als MMTT statt TTMM.
   *
   * Hinweis: Die Datei sollte vor dem Einreichen von der Steuerkanzlei
   * gegengelesen werden. Die DATEV-Formatvorgaben sind versionsabhängig.
   */
  generateDatevCsv(taxResults: TaxCalculationResult[], optionen: DatevOptionen = {}): string {
    const skr04 = optionen.skrStandard === 'SKR04';
    const bankkonto = skr04 ? '1800' : '1200';

    const zeilen = taxResults.map((r) => {
      // Erlöskonten nach SKR03 bzw. SKR04
      let erloeskonto = skr04 ? '4200' : '8200'; // § 25a Differenzbesteuerung
      if (r.tax_mode === 'kleinunternehmer_19') erloeskonto = skr04 ? '4185' : '8195';
      if (r.tax_mode === 'regular_19') erloeskonto = skr04 ? '4400' : '8400';

      const buchungstext = this.schuetzeVorFormel(
        `Verkauf ${r.item_title.replace(/[;"\r\n]/g, ' ')}`.substring(0, 60),
      );

      return [
        Math.abs(r.gross_revenue).toFixed(2).replace('.', ','), // Umsatz
        'S', // Soll/Haben-Kennzeichen
        'EUR', // WKZ Umsatz
        '', // Kurs
        '', // Basis-Umsatz
        '', // WKZ Basis-Umsatz
        bankkonto, // Konto: Bank
        erloeskonto, // Gegenkonto: Erlöse
        '', // BU-Schlüssel
        this.alsBelegdatum(r.sale_date), // Belegdatum (TTMM)
        r.sale_id.substring(0, 12), // Belegfeld 1
        '', // Belegfeld 2
        '', // Skonto
        buchungstext, // Buchungstext
      ].join(';');
    });

    return [this.baueExtfKopf(taxResults), this.datevSpalten.join(';'), ...zeilen].join('\r\n');
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
        `"${this.schuetzeVorFormel(r.item_title).replace(/"/g, '""')}"`,
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
