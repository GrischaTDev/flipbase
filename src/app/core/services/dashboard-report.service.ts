import { Injectable, inject } from '@angular/core';
import {
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
import { InventoryService } from './inventory.service';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { StockService } from './stock.service';
import { calculateStoredSaleMetrics } from '../utils/sale-metrics';

export type DashboardPlatform = 'all' | string;

interface ReportRecords {
  readonly purchases: readonly Purchase[];
  readonly sales: readonly Sale[];
  readonly inventoryItems: readonly InventoryItem[];
  readonly stockLots: readonly StockLot[];
}

interface DateWindow {
  readonly start: Date;
  readonly end: Date;
  readonly bucket: 'day' | 'month';
}

/**
 * Eine reine Projektion der bereits bestaetigten Buchungen. Der Dienst nimmt
 * keine Buchung vor und berechnet den Gewinn ausschliesslich aus den
 * persistierten Verkaufspositionen (Wareneinsatz) und direkten Verkaufskosten.
 */
@Injectable({ providedIn: 'root' })
export class DashboardReportService {
  private readonly salesService = inject(SalesService);
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
    const points = this.createPoints(window);
    const pointByDate = new Map(points.map((point) => [point.date, point]));

    let expenses = 0;
    for (const purchase of records.purchases) {
      const date = this.calendarDate(purchase.purchase_date);
      if (!date || !this.isInWindow(date, window)) continue;

      const amount = this.purchaseAmount(purchase);
      if (amount === null) continue;
      expenses += amount;
      this.addToPoint(pointByDate, this.bucketKey(date, window), { expenses: amount });
    }

    const rows: DashboardSaleRow[] = [];
    let revenue = 0;
    let resultAfterDirectCosts = 0;
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

      const row = this.saleRow(sale);
      rows.push(row);
      revenue += row.revenue;
      resultAfterDirectCosts += row.resultAfterDirectCosts ?? 0;
      soldItems += row.quantity;
      this.addToPoint(pointByDate, this.bucketKey(date, window), {
        revenue: row.revenue,
        costOfGoodsSold: row.costOfGoodsSold ?? 0,
        sellingCosts: row.sellingCosts,
        resultAfterDirectCosts: row.resultAfterDirectCosts ?? 0,
      });
    }

    const margins = rows
      .map((row) => row.marginPercent)
      .filter((margin): margin is number => margin !== null);
    const roundedResult = this.money(resultAfterDirectCosts);

    return {
      expenses: this.money(expenses),
      revenue: this.money(revenue),
      realizedProfit: roundedResult,
      resultAfterDirectCosts: roundedResult,
      soldItems,
      averageMarginPercent:
        margins.length === 0
          ? null
          : this.money(margins.reduce((sum, margin) => sum + margin, 0) / margins.length),
      inventoryCostValue: this.inventoryCostValue(records),
      points: points.map((point) => ({
        ...point,
        revenue: this.money(point.revenue),
        costOfGoodsSold: this.money(point.costOfGoodsSold),
        sellingCosts: this.money(point.sellingCosts),
        resultAfterDirectCosts: this.money(point.resultAfterDirectCosts),
        expenses: this.money(point.expenses),
        realizedProfit: this.money(point.resultAfterDirectCosts),
      })),
      rows: rows.sort((a, b) => b.date.localeCompare(a.date)),
    };
  }

  private saleRow(sale: Sale): DashboardSaleRow {
    const lines = sale.lines?.filter((line) => line.quantity > 0) ?? [];
    const metrics = calculateStoredSaleMetrics({ ...sale, lines });

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

  private saleRevenue(sale: Sale, lines: readonly SaleLine[]): number {
    const persistedRevenue = lines.reduce((sum, line) => sum + this.number(line.line_total), 0);
    if (persistedRevenue > 0) {
      return persistedRevenue + this.number(sale.shipping_revenue);
    }
    return this.number(sale.sale_price_total ?? sale.sale_price);
  }

  private costOfGoodsSold(sale: Sale, lines: readonly SaleLine[]): number {
    if (lines.length > 0) {
      return lines.reduce((sum, line) => sum + this.number(line.cost_of_goods_sold), 0);
    }
    return this.number(
      sale.inventory_item?.total_item_cost ?? sale.inventory_item?.allocated_purchase_cost,
    );
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

  private inventoryCostValue(records: ReportRecords): number {
    const lotValue = records.stockLots.reduce(
      (sum, lot) => sum + this.number(lot.remaining_quantity) * this.number(lot.unit_cost),
      0,
    );
    const individualValue = records.inventoryItems
      .filter((item) => item.status !== 'sold' && item.status !== 'archived')
      .reduce(
        (sum, item) => sum + this.number(item.total_item_cost ?? item.allocated_purchase_cost),
        0,
      );
    return this.money(lotValue + individualValue);
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
        'revenue' | 'costOfGoodsSold' | 'sellingCosts' | 'resultAfterDirectCosts' | 'expenses'
      >
    >,
  ): void {
    const point = points.get(date);
    if (!point) return;
    point.revenue += amount.revenue ?? 0;
    point.costOfGoodsSold += amount.costOfGoodsSold ?? 0;
    point.sellingCosts += amount.sellingCosts ?? 0;
    point.resultAfterDirectCosts += amount.resultAfterDirectCosts ?? 0;
    point.expenses += amount.expenses ?? 0;
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

  private money(value: number): number {
    return Number(value.toFixed(2));
  }
}
