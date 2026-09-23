import { Injectable, inject } from '@angular/core';
import { Expense } from '../models/expense.models';
import {
  DashboardComparison,
  DashboardOpenCost,
  DashboardOpenCostReason,
  DashboardRange,
  DashboardReport,
  DashboardSaleRow,
  DashboardTimePoint,
  InventoryItem,
  Purchase,
  Sale,
  SaleLine,
  StockLot,
} from '../models/flipbase.models';
import { ExpenseService } from './expense.service';
import { InventoryService } from './inventory.service';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { StockService } from './stock.service';
import { calculateStoredSaleMetrics } from '../utils/sale-metrics';
import { inventoryItemCost, purchaseForCost, purchaseIsFinalized } from '../utils/cost-basis';
import { lotCostResult } from '../utils/lot-cost';

export type DashboardPlatform = 'all' | string;

interface ReportRecords {
  readonly purchases: readonly Purchase[];
  readonly sales: readonly Sale[];
  readonly inventoryItems: readonly InventoryItem[];
  readonly stockLots: readonly StockLot[];
  readonly expenses?: readonly Expense[];
}

interface DateWindow {
  readonly start: Date;
  readonly end: Date;
  readonly bucket: 'day' | 'month';
}

interface DatedPurchase {
  readonly purchase: Purchase;
  readonly date: Date;
  /** `null`, solange der Einkaufspreis fehlt. */
  readonly amount: number | null;
}

interface DatedSale {
  readonly sale: Sale;
  readonly date: Date;
  readonly row: DashboardSaleRow;
}

interface DatedOperatingExpense {
  readonly date: Date;
  readonly amount: number;
}

/** Kennzahlen eines beliebigen Fensters; Grundlage für Zeitraum und Vergleich. */
interface PeriodFigures {
  readonly purchases: readonly DatedPurchase[];
  readonly sales: readonly DatedSale[];
  readonly operatingExpenses: readonly DatedOperatingExpense[];
  readonly grossProfit: number;
  readonly revenue: number;
  readonly revenueWithoutCost: number;
  readonly purchaseSpend: number;
  readonly sellingCosts: number;
  readonly operatingExpenseSpend: number;
  readonly soldItems: number;
  readonly averageMarginPercent: number | null;
}

interface OpenCostEntry {
  purchase: Purchase;
  reason: DashboardOpenCostReason;
  affectedSales: number;
  affectedInventory: number;
}

const REASON_PRIORITY: Readonly<Record<DashboardOpenCostReason, number>> = {
  price_missing: 0,
  not_finalized: 1,
  cost_not_allocated: 2,
};

/**
 * Eine reine Projektion der bereits bestaetigten Buchungen. Der Dienst nimmt
 * keine Buchung vor und berechnet den Gewinn ausschliesslich aus den
 * persistierten Verkaufspositionen (Wareneinsatz) und direkten Verkaufskosten.
 */
@Injectable({ providedIn: 'root' })
export class DashboardReportService {
  private readonly salesService = inject(SalesService);
  private readonly expenseService = inject(ExpenseService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly inventoryService = inject(InventoryService);
  private readonly stockService = inject(StockService);

  createReport(
    range: DashboardRange,
    platform: DashboardPlatform = 'all',
    now = new Date(),
  ): DashboardReport {
    return this.createReportForRecords(
      range,
      platform,
      {
        purchases: this.purchaseService.purchases(),
        sales: this.salesService.sales(),
        inventoryItems: this.inventoryService.items(),
        stockLots: this.stockService.lots(),
        expenses: this.expenseService.expenses(),
      },
      now,
    );
  }

  /** Sichtbar fuer fokussierte Tests und bewusst frei von Angular- oder I/O-Logik. */
  createReportForRecords(
    range: DashboardRange,
    platform: DashboardPlatform,
    records: ReportRecords,
    now = new Date(),
  ): DashboardReport {
    const window = this.windowFor(range, now);
    const previousWindow = this.previousWindowFor(range, window);
    const current = this.periodFigures(window, platform, records);
    const previous = this.periodFigures(previousWindow, platform, records);
    const openCosts = new Map<string, OpenCostEntry>();

    const unknownSales = current.sales.filter(({ row }) => row.resultAfterDirectCosts === null);
    let salesWithoutPurchase = 0;
    for (const { sale } of unknownSales) {
      const causes = this.saleOpenCostCauses(sale, records);
      if (causes.length === 0) salesWithoutPurchase += 1;
      for (const cause of causes) this.addOpenCost(openCosts, cause.purchase, cause.reason, 1, 0);
    }
    if (platform === 'all') {
      for (const { purchase, amount } of current.purchases) {
        if (amount === null) this.addOpenCost(openCosts, purchase, 'price_missing', 0, 0);
      }
    }
    const inventory = this.inventoryValue(records, openCosts);

    return {
      grossProfit: current.grossProfit,
      revenue: current.revenue,
      revenueWithoutCost: current.revenueWithoutCost,
      salesWithoutCostCount: unknownSales.length,
      purchaseSpend: current.purchaseSpend,
      sellingCosts: current.sellingCosts,
      operatingExpenseSpend: current.operatingExpenseSpend,
      totalExpenses: this.money(
        current.purchaseSpend + current.sellingCosts + current.operatingExpenseSpend,
      ),
      purchasesIncluded: platform === 'all',
      soldItems: current.soldItems,
      averageMarginPercent: current.averageMarginPercent,
      inventoryCostValue: inventory.value,
      inventoryItemsWithoutCost: inventory.unitsWithoutCost,
      comparison: this.comparison(range, previousWindow, previous),
      openCosts: this.sortedOpenCosts(openCosts),
      salesWithoutPurchase,
      points: this.points(window, current, platform === 'all'),
      rows: current.sales.map(({ row }) => row).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }

  private periodFigures(
    window: DateWindow,
    platform: DashboardPlatform,
    records: ReportRecords,
  ): PeriodFigures {
    const purchases: DatedPurchase[] = [];
    let purchaseSpend = 0;
    if (platform === 'all') {
      for (const purchase of records.purchases) {
        const date = this.calendarDate(purchase.purchase_date);
        if (!date || !this.isInWindow(date, window)) continue;
        const amount = this.purchaseAmount(purchase);
        purchases.push({ purchase, date, amount });
        purchaseSpend += amount ?? 0;
      }
    }

    const operatingExpenses =
      platform === 'all' ? this.paidOperatingExpenses(window, records.expenses ?? []) : [];
    const operatingExpenseSpend = this.money(
      operatingExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    );

    const sales: DatedSale[] = [];
    let grossProfit = 0;
    let revenue = 0;
    let revenueWithoutCost = 0;
    let sellingCosts = 0;
    let soldItems = 0;
    for (const sale of records.sales) {
      const date = this.calendarDate(sale.sale_date);
      if (
        !date ||
        !this.isInWindow(date, window) ||
        !this.isSaleActiveAt(sale, window.end) ||
        (platform !== 'all' && sale.platform !== platform)
      ) {
        continue;
      }

      const row = this.saleRow(sale, records);
      sales.push({ sale, date, row });
      revenue += row.revenue;
      sellingCosts += row.sellingCosts;
      soldItems += row.quantity;
      if (row.resultAfterDirectCosts === null) {
        revenueWithoutCost += row.revenue;
      } else {
        grossProfit += row.resultAfterDirectCosts;
      }
    }

    return {
      purchases,
      sales,
      operatingExpenses,
      grossProfit: this.money(grossProfit),
      revenue: this.money(revenue),
      revenueWithoutCost: this.money(revenueWithoutCost),
      purchaseSpend: this.money(purchaseSpend),
      sellingCosts: this.money(sellingCosts),
      operatingExpenseSpend,
      soldItems,
      averageMarginPercent: this.marginPercent(grossProfit, revenue - revenueWithoutCost),
    };
  }

  private comparison(
    range: DashboardRange,
    window: DateWindow,
    figures: PeriodFigures,
  ): DashboardComparison {
    return {
      label: this.windowLabel(range, window),
      grossProfit: figures.grossProfit,
      revenue: figures.revenue,
      totalExpenses: this.money(
        figures.purchaseSpend + figures.sellingCosts + figures.operatingExpenseSpend,
      ),
      soldItems: figures.soldItems,
      averageMarginPercent: figures.averageMarginPercent,
    };
  }

  private points(
    window: DateWindow,
    figures: PeriodFigures,
    purchasesIncluded: boolean,
  ): DashboardTimePoint[] {
    const points = this.createPoints(window);
    const pointByDate = new Map(points.map((point) => [point.date, point]));
    for (const { date, amount } of figures.purchases) {
      if (amount !== null) {
        this.addToPoint(pointByDate, this.bucketKey(date, window), {
          expenses: amount,
          totalExpenses: amount,
        });
      }
    }
    for (const { date, row } of figures.sales) {
      this.addToPoint(pointByDate, this.bucketKey(date, window), {
        revenue: row.revenue,
        costOfGoodsSold: row.costOfGoodsSold,
        sellingCosts: row.sellingCosts,
        totalExpenses: row.sellingCosts,
        resultAfterDirectCosts: row.resultAfterDirectCosts,
      });
    }
    for (const { date, amount } of figures.operatingExpenses) {
      this.addToPoint(pointByDate, this.bucketKey(date, window), { totalExpenses: amount });
    }
    return points.map((point) => ({
      ...point,
      revenue: this.money(point.revenue),
      costOfGoodsSold: point.costOfGoodsSold === null ? null : this.money(point.costOfGoodsSold),
      sellingCosts: this.money(point.sellingCosts),
      resultAfterDirectCosts:
        point.resultAfterDirectCosts === null ? null : this.money(point.resultAfterDirectCosts),
      expenses: this.money(point.expenses),
      totalExpenses: purchasesIncluded ? this.money(point.totalExpenses ?? 0) : null,
      realizedProfit:
        point.resultAfterDirectCosts === null ? null : this.money(point.resultAfterDirectCosts),
    }));
  }

  private saleRow(sale: Sale, records: ReportRecords): DashboardSaleRow {
    const lines = sale.lines?.filter((line) => line.quantity > 0) ?? [];
    const metrics = calculateStoredSaleMetrics({ ...sale, lines }, records);

    return {
      saleId: sale.id,
      date: sale.sale_date,
      articles:
        lines.length > 0
          ? lines.map((line) => line.title_snapshot).join(', ')
          : (sale.inventory_item?.title ?? 'Artikel'),
      quantity: lines.length > 0 ? lines.reduce((sum, line) => sum + line.quantity, 0) : 1,
      platform: sale.platform,
      revenue: metrics.revenue,
      costOfGoodsSold: metrics.costOfGoodsSold,
      sellingCosts: metrics.sellingCosts,
      resultAfterDirectCosts: metrics.resultAfterDirectCosts,
      marginPercent: metrics.marginPercent,
      profit: metrics.resultAfterDirectCosts,
    };
  }

  /** Einkäufe, an denen die offenen Kosten eines Verkaufs hängen, je einmal. */
  private saleOpenCostCauses(
    sale: Sale,
    records: ReportRecords,
  ): { purchase: Purchase; reason: DashboardOpenCostReason }[] {
    const lines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
    const causes = new Map<string, { purchase: Purchase; reason: DashboardOpenCostReason }>();
    const add = (purchase: Purchase | undefined, item: InventoryItem | undefined) => {
      if (!purchase) return;
      const reason = this.openCostReason(purchase, item);
      const known = causes.get(purchase.id);
      if (reason && (!known || REASON_PRIORITY[reason] < REASON_PRIORITY[known.reason])) {
        causes.set(purchase.id, { purchase, reason });
      }
    };

    if (lines.length === 0) {
      const item = this.saleItem(sale, sale.inventory_item_id, sale.inventory_item, records);
      if (item) add(purchaseForCost(item, records), item);
    }
    for (const line of lines) {
      if (line.inventory_item_id || line.inventory_item) {
        const item = this.saleItem(sale, line.inventory_item_id, line.inventory_item, records);
        if (item) add(purchaseForCost(item, records), item);
        continue;
      }
      for (const allocation of this.lineAllocations(line, sale)) {
        const lot =
          allocation.stock_lot ??
          records.stockLots.find(
            (candidate) =>
              candidate.id === allocation.stock_lot_id &&
              candidate.workspace_id === sale.workspace_id,
          );
        if (lot) add(purchaseForCost(lot, records), undefined);
      }
    }
    return [...causes.values()];
  }

  private saleItem(
    sale: Sale,
    itemId: string | null | undefined,
    embedded: InventoryItem | undefined,
    records: ReportRecords,
  ): InventoryItem | undefined {
    return (
      embedded ??
      records.inventoryItems.find(
        (item) => item.id === itemId && item.workspace_id === sale.workspace_id,
      )
    );
  }

  private lineAllocations(line: SaleLine, sale: Sale) {
    return (line.lot_allocations ?? sale.lot_allocations ?? []).filter(
      (allocation) => allocation.sale_line_id === line.id,
    );
  }

  /**
   * Prüft in fester Reihenfolge, warum die Kosten nicht belastbar sind. Ohne
   * Artikel (Los) gilt ein abgeschlossener Einkauf mit Preis als belastbar.
   */
  private openCostReason(
    purchase: Purchase,
    item: InventoryItem | undefined,
  ): DashboardOpenCostReason | null {
    if (purchase.purchase_price === null) return 'price_missing';
    if (!purchaseIsFinalized(purchase)) return 'not_finalized';
    if (item && inventoryItemCost(item, purchase) === null) return 'cost_not_allocated';
    return null;
  }

  private inventoryValue(
    records: ReportRecords,
    openCosts: Map<string, OpenCostEntry>,
  ): { value: number; unitsWithoutCost: number } {
    let totalCents = 0;
    let unitsWithoutCost = 0;
    for (const lot of records.stockLots.filter((lot) => lot.remaining_quantity > 0)) {
      const purchase = purchaseForCost(lot, records);
      const value = lotCostResult(lot, purchase, records.sales, 'known').remainingValueCents;
      if (value !== null) {
        totalCents += value;
        continue;
      }
      unitsWithoutCost += lot.remaining_quantity;
      if (purchase) {
        const reason = this.openCostReason(purchase, undefined) ?? 'cost_not_allocated';
        this.addOpenCost(openCosts, purchase, reason, 0, lot.remaining_quantity);
      }
    }
    for (const item of records.inventoryItems.filter(
      (item) => item.status !== 'sold' && item.status !== 'archived',
    )) {
      const purchase = purchaseForCost(item, records);
      const value = inventoryItemCost(item, purchase);
      if (value !== null) {
        totalCents += Math.round((value + Number.EPSILON) * 100);
        continue;
      }
      unitsWithoutCost += 1;
      if (purchase) {
        const reason = this.openCostReason(purchase, item) ?? 'cost_not_allocated';
        this.addOpenCost(openCosts, purchase, reason, 0, 1);
      }
    }
    return { value: totalCents / 100, unitsWithoutCost };
  }

  private addOpenCost(
    openCosts: Map<string, OpenCostEntry>,
    purchase: Purchase,
    reason: DashboardOpenCostReason,
    affectedSales: number,
    affectedInventory: number,
  ): void {
    const entry = openCosts.get(purchase.id);
    if (!entry) {
      openCosts.set(purchase.id, { purchase, reason, affectedSales, affectedInventory });
      return;
    }
    if (REASON_PRIORITY[reason] < REASON_PRIORITY[entry.reason]) entry.reason = reason;
    entry.affectedSales += affectedSales;
    entry.affectedInventory += affectedInventory;
  }

  private sortedOpenCosts(openCosts: Map<string, OpenCostEntry>): DashboardOpenCost[] {
    return [...openCosts.values()]
      .map(({ purchase, reason, affectedSales, affectedInventory }) => ({
        purchaseId: purchase.id,
        title: purchase.title?.trim() || 'Einkauf',
        recordNumber: purchase.record_number ?? null,
        reason,
        affectedSales,
        affectedInventory,
      }))
      .sort(
        (a, b) =>
          b.affectedSales - a.affectedSales ||
          b.affectedInventory - a.affectedInventory ||
          a.title.localeCompare(b.title, 'de'),
      );
  }

  private saleRevenue(sale: Sale, lines: readonly SaleLine[]): number {
    const persistedRevenue = lines.reduce((sum, line) => sum + this.number(line.line_total), 0);
    if (persistedRevenue > 0) {
      return persistedRevenue + this.number(sale.shipping_revenue);
    }
    return this.number(sale.sale_price_total ?? sale.sale_price);
  }

  private paidOperatingExpenses(
    window: DateWindow,
    expenses: readonly Expense[],
  ): DatedOperatingExpense[] {
    return expenses.flatMap((expense) => {
      if (expense.deleted_at !== null || expense.status !== 'paid') return [];
      const date = this.calendarDate(expense.payment_date);
      return date && this.isInWindow(date, window)
        ? [{ date, amount: this.number(expense.gross_amount) }]
        : [];
    });
  }

  private purchaseAmount(purchase: Purchase): number | null {
    if (purchase.purchase_price === null) return null;
    if (purchase.total_purchase_cost !== undefined && purchase.total_purchase_cost !== null) {
      return this.number(purchase.total_purchase_cost);
    }
    return (
      this.number(purchase.purchase_price) +
      this.number(purchase.shipping_cost) +
      this.number(purchase.other_costs) +
      (purchase.costs ?? []).reduce((sum, cost) => sum + this.number(cost.amount), 0)
    );
  }

  private windowFor(range: DashboardRange, now: Date): DateWindow {
    const end = this.startOfDay(now);
    if (range === 'today') return { start: end, end, bucket: 'day' };
    if (range === 'last_7_days') {
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { start, end, bucket: 'day' };
    }
    if (range === 'month') {
      return { start: new Date(end.getFullYear(), end.getMonth(), 1), end, bucket: 'day' };
    }
    return { start: new Date(end.getFullYear(), 0, 1), end, bucket: 'month' };
  }

  /**
   * Gleich langer Zeitraum davor: Heute → gestern, 7 Tage → 7 Tage davor,
   * Monat und Jahr → vom Anfang bis zum gleichen Kalendertag, höchstens bis
   * zum Monatsende (31.03. → 28.02., 29.02. → 28.02. des Vorjahres).
   */
  private previousWindowFor(range: DashboardRange, window: DateWindow): DateWindow {
    const { start, end, bucket } = window;
    if (range === 'today' || range === 'last_7_days') {
      const days = range === 'today' ? 1 : 7;
      return {
        start: new Date(start.getFullYear(), start.getMonth(), start.getDate() - days),
        end: new Date(end.getFullYear(), end.getMonth(), end.getDate() - days),
        bucket,
      };
    }
    const year = range === 'year' ? end.getFullYear() - 1 : end.getFullYear();
    const month = range === 'year' ? end.getMonth() : end.getMonth() - 1;
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      start: range === 'year' ? new Date(year, 0, 1) : new Date(year, month, 1),
      end: new Date(year, month, Math.min(end.getDate(), lastDay)),
      bucket,
    };
  }

  private windowLabel(range: DashboardRange, window: DateWindow): string {
    if (range === 'today') return 'gestern';
    const day = (date: Date) => String(date.getDate()).padStart(2, '0');
    const dayMonth = (date: Date) =>
      `${day(date)}.${String(date.getMonth() + 1).padStart(2, '0')}.`;
    if (range === 'year')
      return `${dayMonth(window.start)}–${dayMonth(window.end)}${window.end.getFullYear()}`;
    if (window.start.getTime() === window.end.getTime()) return dayMonth(window.end);
    const sameMonth =
      window.start.getFullYear() === window.end.getFullYear() &&
      window.start.getMonth() === window.end.getMonth();
    return `${sameMonth ? `${day(window.start)}.` : dayMonth(window.start)}–${dayMonth(window.end)}`;
  }

  private createPoints(window: DateWindow): DashboardTimePoint[] {
    const points: DashboardTimePoint[] = [];
    const cursor = new Date(window.start);
    while (cursor <= window.end) {
      points.push({
        date: this.dateKey(cursor),
        label:
          window.bucket === 'month'
            ? new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(cursor)
            : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(cursor),
        revenue: 0,
        costOfGoodsSold: 0,
        sellingCosts: 0,
        resultAfterDirectCosts: 0,
        expenses: 0,
        totalExpenses: 0,
        realizedProfit: 0,
      });
      if (window.bucket === 'month') cursor.setMonth(cursor.getMonth() + 1, 1);
      else cursor.setDate(cursor.getDate() + 1);
    }
    return points;
  }

  private addToPoint(
    points: Map<string, DashboardTimePoint>,
    date: string,
    amount: Partial<
      Pick<
        DashboardTimePoint,
        | 'revenue'
        | 'costOfGoodsSold'
        | 'sellingCosts'
        | 'resultAfterDirectCosts'
        | 'expenses'
        | 'totalExpenses'
      >
    >,
  ): void {
    const point = points.get(date);
    if (!point) return;
    point.revenue += amount.revenue ?? 0;
    point.costOfGoodsSold =
      point.costOfGoodsSold === null || amount.costOfGoodsSold === null
        ? null
        : point.costOfGoodsSold + (amount.costOfGoodsSold ?? 0);
    point.sellingCosts += amount.sellingCosts ?? 0;
    point.resultAfterDirectCosts =
      point.resultAfterDirectCosts === null || amount.resultAfterDirectCosts === null
        ? null
        : point.resultAfterDirectCosts + (amount.resultAfterDirectCosts ?? 0);
    point.expenses += amount.expenses ?? 0;
    point.totalExpenses = (point.totalExpenses ?? 0) + (amount.totalExpenses ?? 0);
    point.realizedProfit = point.resultAfterDirectCosts;
  }

  private isSaleActiveAt(sale: Sale, end: Date): boolean {
    const returnedAt = sale.returned_at ? this.calendarDate(sale.returned_at) : null;
    if (!returnedAt || returnedAt > end) return true;
    const refund = this.number(sale.refund_amount);
    return refund > 0 && refund < this.saleRevenue(sale, sale.lines ?? []);
  }

  private isInWindow(date: Date, window: DateWindow): boolean {
    return date >= window.start && date <= window.end;
  }

  private calendarDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private dateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private bucketKey(date: Date, window: DateWindow): string {
    return window.bucket === 'month'
      ? this.dateKey(new Date(date.getFullYear(), date.getMonth(), 1))
      : this.dateKey(date);
  }

  private number(value: number | null | undefined): number {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  private marginPercent(profit: number, revenue: number): number | null {
    return revenue === 0 ? null : this.money((profit / revenue) * 100);
  }

  private money(value: number): number {
    return Number(value.toFixed(2));
  }
}
