import { Injectable, computed, inject } from '@angular/core';
import { WorkspaceService } from './workspace.service';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import {
  InventoryItem,
  Sale,
  SaleLine,
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

    return sales.flatMap((sale) => {
      const item =
        sale.inventory_item ||
        items.find((i) => i.id === sale.inventory_item_id) ||
        ({} as InventoryItem);
      return this.calculateSaleLineTaxes(sale, item, defaultMode);
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
    const persistedLines = this.persistedLinesForSale(sale);
    if (persistedLines.length > 1) {
      if (new Set(persistedLines.map((line) => line.tax_mode)).size > 1) {
        throw new Error(
          'Gemischte Steuerarten müssen als getrennte Verkaufspositionen berechnet werden.',
        );
      }
      return this.aggregateLineResults(this.calculateSaleLineTaxes(sale, item, defaultTaxMode));
    }
    const taxMode = persistedLines[0]?.tax_mode || item.tax_mode_override || defaultTaxMode;
    const grossRevenue = sale.sale_price_total ?? sale.sale_price;
    const shippingRevenue = sale.shipping_revenue ?? 0;
    const shippingCost = sale.shipping_cost || 0;

    const directItemCosts = item.costs?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
    const totalPurchaseCost =
      persistedLines.length > 0
        ? persistedLines.reduce((sum, line) => sum + Number(line.cost_of_goods_sold ?? 0), 0)
        : (item.allocated_purchase_cost || 0) + directItemCosts;
    const grossMargin = this.roundMoney(grossRevenue - totalPurchaseCost);
    const rawTaxCost =
      persistedLines.length > 0 ? persistedLines[0].tax_purchase_cost : item.tax_purchase_cost;
    const taxPurchaseCost = this.validCost(rawTaxCost) ? rawTaxCost : null;
    const taxMargin =
      taxPurchaseCost === null ? null : this.roundMoney(grossRevenue - taxPurchaseCost);
    const differenceTax =
      taxMode === 'diff_25a'
        ? this.calculateDifferenceTax(grossRevenue, taxPurchaseCost, persistedLines[0])
        : null;
    const needsReview =
      (taxMode === 'diff_25a' && differenceTax === null) ||
      sale.cost_basis_status === 'unknown' ||
      !this.validCost(grossRevenue) ||
      !this.validCost(totalPurchaseCost) ||
      persistedLines.some((line) => !this.validCost(line.cost_of_goods_sold)) ||
      (persistedLines.length === 0 && !this.validCost(item.allocated_purchase_cost));

    let taxBase = 0;
    let vatAmount = 0;
    // Ohne belegbezogene Erfassung darf aus einem Bruttobetrag keine Vorsteuer
    // geraten werden. Das gilt auch für Gebühren und Versand.
    const inputTaxDeductible = 0;
    let invoiceClause = '';

    // Tatsächliche Kosten mindern den Gewinn unabhängig vom steuerlichen Einkaufspreis.
    const operatingCosts =
      (sale.platform_fee || 0) +
      shippingCost +
      (sale.packaging_cost || 0) +
      (sale.other_costs || 0);

    switch (taxMode) {
      case 'diff_25a': {
        vatAmount = differenceTax?.vat ?? 0;
        taxBase = differenceTax?.base ?? 0;
        invoiceClause =
          'Gebrauchtgegenstände / Sonderregelung gem. § 25a UStG (Differenzbesteuerung). Kein gesonderter Ausweis der Umsatzsteuer.';
        break;
      }

      case 'kleinunternehmer_19': {
        // § 19 UStG: No VAT charged, no input tax deductible
        taxBase = 0;
        vatAmount = 0;
        invoiceClause =
          'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).';
        break;
      }

      case 'regular_19': {
        // Standard 19% VAT on total gross price
        taxBase = Number((grossRevenue / 1.19).toFixed(2));
        vatAmount = Number((grossRevenue - taxBase).toFixed(2));
        invoiceClause = 'Enthält 19% gesetzliche Umsatzsteuer.';
        break;
      }
    }

    const netTaxLiability = Number((vatAmount - inputTaxDeductible).toFixed(2));
    // Ergebnis nach direkten Kosten und berechneter Umsatzsteuer, ohne geschätzte Vorsteuer.
    const netProfitAfterTax = Number((grossMargin - operatingCosts - netTaxLiability).toFixed(2));

    return {
      calculation_status: needsReview ? 'needs_review' : 'complete',
      tax_purchase_cost: taxPurchaseCost,
      tax_margin: taxMargin,
      sale_id: sale.id,
      item_title:
        persistedLines
          .map((line) => line.title_snapshot)
          .filter(Boolean)
          .join(', ') ||
        item.title ||
        'Artikel #' + (sale.inventory_item_id ?? sale.id).substring(0, 6),
      sale_date: sale.sale_date,
      tax_mode: taxMode,
      gross_revenue: grossRevenue,
      shipping_revenue: shippingRevenue,
      shipping_cost: shippingCost,
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
   * Teilt gemeinsame Verkaufskosten centgenau auf echte Verkaufspositionen auf.
   * Rundungsreste gehen an die größten Restanteile. Auch bei vielen kleinen
   * Beträgen entstehen keine negativen Kosten einer letzten Position.
   */
  calculateSaleLineTaxes(
    sale: Sale,
    item: InventoryItem,
    defaultTaxMode: TaxMode = 'diff_25a',
  ): TaxCalculationResult[] {
    const lines = this.persistedLinesForSale(sale);
    if (lines.length === 0) return [this.calculateSaleTax(sale, item, defaultTaxMode)];
    const lineResults = lines.map((line, index) =>
      this.calculateSaleTax(this.saleForLine(sale, line, lines, index), item, defaultTaxMode),
    );
    return lineResults;
  }

  /** Bildet eine persistierte Verkaufsposition als eigenständigen Steuerfall ab. */
  private saleForLine(sale: Sale, line: SaleLine, lines: readonly SaleLine[], index: number): Sale {
    return {
      ...sale,
      inventory_item_id: line.inventory_item_id ?? sale.inventory_item_id,
      sale_price:
        line.line_total + this.allocatedSaleAmount(sale.shipping_revenue ?? 0, lines, index),
      sale_price_total:
        line.line_total + this.allocatedSaleAmount(sale.shipping_revenue ?? 0, lines, index),
      shipping_revenue: this.allocatedSaleAmount(sale.shipping_revenue ?? 0, lines, index),
      platform_fee: this.allocatedSaleCost(sale.platform_fee || 0, lines, index),
      shipping_cost: this.allocatedSaleCost(sale.shipping_cost || 0, lines, index),
      packaging_cost: this.allocatedSaleCost(sale.packaging_cost || 0, lines, index),
      other_costs: this.allocatedSaleCost(sale.other_costs || 0, lines, index),
      lines: [line],
      has_persisted_lines: true,
    };
  }

  private persistedLinesForSale(sale: Sale): readonly SaleLine[] {
    return sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
  }

  private allocatedSaleCost(total: number, lines: readonly SaleLine[], index: number): number {
    return this.allocatedSaleAmount(total, lines, index);
  }

  private allocatedSaleAmount(total: number, lines: readonly SaleLine[], index: number): number {
    const cents = Math.round(total * 100);
    if (cents === 0) return 0;
    const weights = lines.map((line) => Math.max(0, line.line_total));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    if (weightTotal === 0) return index === lines.length - 1 ? total : 0;
    const exact = weights.map((value) => (Math.abs(cents) * value) / weightTotal);
    const shares = exact.map(Math.floor);
    const order = exact
      .map((value, position) => ({ position, remainder: value - shares[position] }))
      .sort((a, b) => b.remainder - a.remainder || b.position - a.position);
    const remainder = Math.abs(cents) - shares.reduce((sum, value) => sum + value, 0);
    for (let position = 0; position < remainder; position++) shares[order[position].position]++;
    return (Math.sign(cents) * shares[index]) / 100;
  }

  /** Prüft den Buchungssnapshot und berechnet jede physische Einheit getrennt. */
  private calculateDifferenceTax(
    revenue: number,
    purchaseCost: number | null,
    line: SaleLine | undefined,
  ): { base: number; vat: number } | null {
    if (purchaseCost === null || !this.validCost(revenue)) return null;
    const quantity = line?.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
    const allocations =
      line?.tax_cost_allocations ??
      (quantity === 1 ? [{ quantity: 1, tax_purchase_cost: purchaseCost }] : null);
    if (
      !allocations?.length ||
      allocations.some(
        (allocation) =>
          !Number.isSafeInteger(allocation.quantity) ||
          allocation.quantity < 1 ||
          !this.validCost(allocation.tax_purchase_cost) ||
          Math.abs(
            allocation.tax_purchase_cost * 100 - Math.round(allocation.tax_purchase_cost * 100),
          ) > 0.000001 ||
          Math.round(allocation.tax_purchase_cost * 100) % allocation.quantity !== 0,
      )
    )
      return null;
    if (
      allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== quantity ||
      allocations.reduce(
        (sum, allocation) => sum + Math.round(allocation.tax_purchase_cost * 100),
        0,
      ) !== Math.round(purchaseCost * 100)
    )
      return null;

    const revenueCents = Math.round(revenue * 100);
    const unitRevenue = Math.floor(revenueCents / quantity);
    let extraRevenueUnits = revenueCents % quantity;
    let positiveMarginCents = 0;
    let vatCents = 0;
    for (const allocation of allocations) {
      const cost = Math.round(allocation.tax_purchase_cost * 100) / allocation.quantity;
      const extraUnits = Math.min(extraRevenueUnits, allocation.quantity);
      const margin = Math.max(0, unitRevenue - cost);
      const extraMargin = Math.max(0, unitRevenue + 1 - cost);
      positiveMarginCents += margin * (allocation.quantity - extraUnits) + extraMargin * extraUnits;
      vatCents +=
        Math.round((margin * 19) / 119) * (allocation.quantity - extraUnits) +
        Math.round((extraMargin * 19) / 119) * extraUnits;
      extraRevenueUnits -= extraUnits;
    }
    return { base: (positiveMarginCents - vatCents) / 100, vat: vatCents / 100 };
  }

  private validCost(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  private roundMoney(value: number): number {
    return Number(value.toFixed(2));
  }

  /** Aggregiert ausschließlich bereits einzeln berechnete Steuerfälle. */
  private aggregateLineResults(results: readonly TaxCalculationResult[]): TaxCalculationResult {
    const aggregate = { ...results[0] };
    const fields = [
      'gross_revenue',
      'shipping_revenue',
      'shipping_cost',
      'total_purchase_cost',
      'gross_margin',
      'tax_base',
      'vat_amount',
      'input_tax_deductible',
      'net_tax_liability',
      'net_profit_after_tax',
    ] as const;
    for (const field of fields)
      aggregate[field] = this.roundMoney(results.reduce((sum, r) => sum + r[field], 0));
    aggregate.item_title = results.map((r) => r.item_title).join(', ');
    aggregate.calculation_status = results.some((r) => r.calculation_status !== 'complete')
      ? 'needs_review'
      : 'complete';
    aggregate.tax_purchase_cost = results.some((r) => r.tax_purchase_cost == null)
      ? null
      : this.roundMoney(results.reduce((sum, r) => sum + (r.tax_purchase_cost ?? 0), 0));
    aggregate.tax_margin = results.some((r) => r.tax_margin == null)
      ? null
      : this.roundMoney(results.reduce((sum, r) => sum + (r.tax_margin ?? 0), 0));
    return aggregate;
  }

  private requireReviewedTaxCosts(results: readonly TaxCalculationResult[]): void {
    if (results.some((result) => result.calculation_status !== 'complete')) {
      throw new Error('Bitte zuerst die Einkaufspreise der gekennzeichneten Verkäufe prüfen.');
    }
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
      review_count: taxResults.filter((r) => r.calculation_status !== 'complete').length,
      total_sales_count: new Set(taxResults.map((r) => r.sale_id)).size,
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
    this.requireReviewedTaxCosts(taxResults);
    const skr04 = optionen.skrStandard === 'SKR04';
    const bankkonto = skr04 ? '1800' : '1200';

    const zeilen = taxResults.flatMap((r) => {
      // Erlöskonten nach SKR03 bzw. SKR04
      let erloeskonto = skr04 ? '4200' : '8200'; // § 25a Differenzbesteuerung
      if (r.tax_mode === 'kleinunternehmer_19') erloeskonto = skr04 ? '4185' : '8195';
      if (r.tax_mode === 'regular_19') erloeskonto = skr04 ? '4400' : '8400';

      const artikel = r.item_title.replace(/[;"\r\n]/g, ' ');
      const warenumsatz = Number((r.gross_revenue - r.shipping_revenue).toFixed(2));
      const ausgangsfrachtkonto = skr04 ? '6740' : '4730';
      const buchungen: string[] = [];

      if (warenumsatz !== 0) {
        buchungen.push(
          this.datevBuchungszeile(warenumsatz, bankkonto, erloeskonto, r, `Verkauf ${artikel}`),
        );
      }
      if (r.shipping_revenue > 0) {
        buchungen.push(
          this.datevBuchungszeile(
            r.shipping_revenue,
            bankkonto,
            erloeskonto,
            r,
            `Käufer-Versand ${artikel}`,
          ),
        );
      }
      if (r.shipping_cost > 0) {
        buchungen.push(
          this.datevBuchungszeile(
            r.shipping_cost,
            ausgangsfrachtkonto,
            bankkonto,
            r,
            `Ausgangsfracht ${artikel}`,
          ),
        );
      }

      return buchungen;
    });

    return [this.baueExtfKopf(taxResults), this.datevSpalten.join(';'), ...zeilen].join('\r\n');
  }

  private datevBuchungszeile(
    amount: number,
    konto: string,
    gegenkonto: string,
    result: TaxCalculationResult,
    text: string,
  ): string {
    return [
      Math.abs(amount).toFixed(2).replace('.', ','),
      'S',
      'EUR',
      '',
      '',
      '',
      konto,
      gegenkonto,
      '',
      this.alsBelegdatum(result.sale_date),
      result.sale_id.substring(0, 12),
      '',
      '',
      this.schuetzeVorFormel(text.substring(0, 60)),
    ].join(';');
  }

  /**
   * Generates an EÜR (Einnahmen-Überschuss-Rechnung) CSV summary.
   */
  generateEurCsv(taxResults: TaxCalculationResult[]): string {
    this.requireReviewedTaxCosts(taxResults);
    const headers = [
      'Datum',
      'Vorgang / Artikel',
      'Steuer-Modus',
      'Einnahmen Brutto (€)',
      'Wareneinsatz einschließlich Zusatzkosten (€)',
      'Marge Brutto (€)',
      'Berechnete Umsatzsteuer (€)',
      'Berücksichtigte Vorsteuer (€)',
      'Umsatzsteuer vor weiterer Vorsteuerprüfung (€)',
      'Ergebnis nach USt, vor weiterer Vorsteuerprüfung (€)',
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
