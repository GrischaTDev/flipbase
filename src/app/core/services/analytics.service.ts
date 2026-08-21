import { Injectable } from '@angular/core';
import { ProfitEngineService } from './profit-engine.service';
import { Sale, Purchase, InventoryItem } from '../models/flipbase.models';

export type AnalyticsTimeRange = '7d' | '30d' | '1y' | 'all';

export interface SourcePerformance {
  sourceId?: string;
  sourceName: string;
  purchasesCount: number;
  invested: number;
  revenue: number;
  profit: number;
  roi: number;
  avgHoldingDays: number;
}

export interface SupplierPerformance {
  supplierId?: string;
  supplierName: string;
  purchasesCount: number;
  avgRoi: number;
  defectRate: number;
}

export interface MysteryPackStats {
  purchaseId: string;
  title: string;
  totalCost: number;
  itemsCount: number;
  soldCount: number;
  openCount: number;
  revenue: number;
  realizedProfit: number;
  remainingStockValue: number;
}

export interface PalletStats {
  purchaseId: string;
  title: string;
  totalInvestment: number;
  itemsCount: number;
  soldCount: number;
  openCount: number;
  defectCount: number;
  defectRate: number;
  revenue: number;
  realizedProfit: number;
  remainingStockValue: number;
  isBreakEven: boolean;
  daysToBreakEven?: number;
}

export interface CategoryRank {
  category: string;
  itemsCount: number;
  soldCount: number;
  revenue: number;
  profit: number;
  avgRoi: number;
}

export interface PlatformPerformance {
  platform: string;
  platformLabel: string;
  salesCount: number;
  grossRevenue: number;
  platformFees: number;
  effectiveFeePercent: number;
  netProfit: number;
  profitMargin: number;
  avgHoldingDays: number;
}

export interface HoldingDurationBucket {
  label: string;
  count: number;
  percent: number;
  totalProfit: number;
  avgRoi: number;
  color: string;
}

export interface HoldingDurationAnalysis {
  avgOverallDays: number;
  fastestSaleDays: number;
  slowestSaleDays: number;
  capitalTurnoverRate: number;
  buckets: HoldingDurationBucket[];
}

export interface MonthlyCohortStats {
  monthKey: string;
  monthLabel: string;
  invested: number;
  realizedRevenue: number;
  realizedProfit: number;
  recoveryPercent: number;
  isProfitable: boolean;
  itemsCount: number;
  soldCount: number;
}

export interface DayHeatmap {
  dayName: string;
  dayIndex: number;
  morningCount: number;
  afternoonCount: number;
  eveningCount: number;
  nightCount: number;
  totalSales: number;
  totalRevenue: number;
}

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly profitEngine = new ProfitEngineService();

  /**
   * Filters sales by the given time range relative to today.
   */
  filterSalesByTimeRange(sales: Sale[], range: AnalyticsTimeRange): Sale[] {
    if (range === 'all') return sales;

    const now = new Date().getTime();
    let maxDays = 30;
    if (range === '7d') maxDays = 7;
    else if (range === '30d') maxDays = 30;
    else if (range === '1y') maxDays = 365;

    const cutoffMs = now - maxDays * 24 * 60 * 60 * 1000;

    return sales.filter((s) => {
      const saleDateMs = new Date(s.sale_date).getTime();
      return saleDateMs >= cutoffMs;
    });
  }

  /**
   * Computes source performance analytics.
   */
  computeSourcePerformance(purchases: Purchase[], sales: Sale[]): SourcePerformance[] {
    const sourceMap = new Map<
      string,
      {
        name: string;
        purchasesCount: number;
        invested: number;
        revenue: number;
        profit: number;
        totalHoldingDays: number;
        salesCount: number;
      }
    >();

    // 1. Aggregate purchases per source
    for (const p of purchases) {
      const sourceName = p.source?.name || 'Direktkauf';
      const entry = sourceMap.get(sourceName) || {
        name: sourceName,
        purchasesCount: 0,
        invested: 0,
        revenue: 0,
        profit: 0,
        totalHoldingDays: 0,
        salesCount: 0,
      };

      entry.purchasesCount += 1;
      entry.invested += p.total_purchase_cost ?? p.purchase_price;
      sourceMap.set(sourceName, entry);
    }

    // 2. Aggregate sales per source
    for (const s of sales) {
      const sourceName = s.inventory_item?.purchase?.source?.name || 'Direktkauf';
      const entry = sourceMap.get(sourceName) || {
        name: sourceName,
        purchasesCount: 0,
        invested: 0,
        revenue: 0,
        profit: 0,
        totalHoldingDays: 0,
        salesCount: 0,
      };

      entry.revenue += s.sale_price;
      entry.profit += s.net_profit || 0;
      entry.totalHoldingDays += s.holding_duration_days || 0;
      entry.salesCount += 1;
      sourceMap.set(sourceName, entry);
    }

    const results: SourcePerformance[] = [];
    for (const [name, val] of sourceMap.entries()) {
      const roi = val.invested > 0 ? this.profitEngine.calculateRoi(val.profit, val.invested) : 0;
      const avgHolding = val.salesCount > 0 ? Math.round(val.totalHoldingDays / val.salesCount) : 0;

      results.push({
        sourceName: name,
        purchasesCount: val.purchasesCount,
        invested: Number(val.invested.toFixed(2)),
        revenue: Number(val.revenue.toFixed(2)),
        profit: Number(val.profit.toFixed(2)),
        roi,
        avgHoldingDays: avgHolding,
      });
    }

    return results.sort((a, b) => b.profit - a.profit);
  }

  /**
   * Computes supplier performance analytics and defect rates.
   */
  computeSupplierPerformance(
    purchases: Purchase[],
    items: InventoryItem[],
    sales: Sale[],
  ): SupplierPerformance[] {
    const supplierMap = new Map<
      string,
      {
        name: string;
        purchasesCount: number;
        itemsCount: number;
        defectiveCount: number;
        totalRoi: number;
        salesCount: number;
      }
    >();

    for (const p of purchases) {
      if (!p.supplier) continue;
      const supName = p.supplier.name;
      const entry = supplierMap.get(supName) || {
        name: supName,
        purchasesCount: 0,
        itemsCount: 0,
        defectiveCount: 0,
        totalRoi: 0,
        salesCount: 0,
      };
      entry.purchasesCount += 1;
      supplierMap.set(supName, entry);
    }

    // Count defective items
    for (const item of items) {
      const supName = item.purchase?.supplier?.name;
      if (!supName) continue;
      const entry = supplierMap.get(supName);
      if (entry) {
        entry.itemsCount += 1;
        if (item.condition === 'defective' || item.status === 'defective') {
          entry.defectiveCount += 1;
        }
      }
    }

    // Count ROIs
    for (const s of sales) {
      const supName = s.inventory_item?.purchase?.supplier?.name;
      if (!supName) continue;
      const entry = supplierMap.get(supName);
      if (entry) {
        entry.salesCount += 1;
        entry.totalRoi += s.roi || 0;
      }
    }

    const results: SupplierPerformance[] = [];
    for (const [name, val] of supplierMap.entries()) {
      const defectRate =
        val.itemsCount > 0 ? Number(((val.defectiveCount / val.itemsCount) * 100).toFixed(1)) : 0;
      const avgRoi = val.salesCount > 0 ? Number((val.totalRoi / val.salesCount).toFixed(1)) : 0;

      results.push({
        supplierName: name,
        purchasesCount: val.purchasesCount,
        avgRoi,
        defectRate,
      });
    }

    return results.sort((a, b) => b.avgRoi - a.avgRoi);
  }

  /**
   * Computes Mystery Pack Statistics.
   */
  computeMysteryPackStats(
    purchases: Purchase[],
    items: InventoryItem[],
    sales: Sale[],
  ): MysteryPackStats[] {
    const mysteryPurchases = purchases.filter((p) => p.type === 'mystery_pack');

    return mysteryPurchases.map((p) => {
      const packItems = items.filter((i) => i.purchase_id === p.id);
      const totalCost = p.total_purchase_cost ?? p.purchase_price;

      const soldItems = packItems.filter((i) => i.status === 'sold');
      const openItems = packItems.filter((i) => i.status !== 'sold' && i.status !== 'archived');

      // Calculate realized sales from this pack
      const packSales = sales.filter((s) => s.inventory_item?.purchase_id === p.id);
      const revenue = packSales.reduce((sum, s) => sum + s.sale_price, 0);
      const realizedProfit = packSales.reduce((sum, s) => sum + (s.net_profit || 0), 0);

      const remainingStockValue = openItems.reduce(
        (sum, i) => sum + (Number(i.expected_value) || 0),
        0,
      );

      return {
        purchaseId: p.id,
        title: p.title,
        totalCost: Number(totalCost.toFixed(2)),
        itemsCount: packItems.length,
        soldCount: soldItems.length,
        openCount: openItems.length,
        revenue: Number(revenue.toFixed(2)),
        realizedProfit: Number(realizedProfit.toFixed(2)),
        remainingStockValue: Number(remainingStockValue.toFixed(2)),
      };
    });
  }

  /**
   * Computes Pallet & Lot Dashboard and Break-even Analysis.
   */
  computePalletStats(purchases: Purchase[], items: InventoryItem[], sales: Sale[]): PalletStats[] {
    const pallets = purchases.filter((p) => p.type === 'pallet' || p.type === 'lot');

    return pallets.map((p) => {
      const palletItems = items.filter((i) => i.purchase_id === p.id);
      const totalInvest = p.total_purchase_cost ?? p.purchase_price;

      const soldItems = palletItems.filter((i) => i.status === 'sold');
      const openItems = palletItems.filter((i) => i.status !== 'sold' && i.status !== 'archived');
      const defectiveItems = palletItems.filter(
        (i) => i.condition === 'defective' || i.status === 'defective',
      );

      const defectRate =
        palletItems.length > 0
          ? Number(((defectiveItems.length / palletItems.length) * 100).toFixed(1))
          : 0;

      const palletSales = sales.filter((s) => s.inventory_item?.purchase_id === p.id);
      const revenue = palletSales.reduce((sum, s) => sum + s.sale_price, 0);
      const realizedProfit = palletSales.reduce((sum, s) => sum + (s.net_profit || 0), 0);
      const remainingStockValue = openItems.reduce(
        (sum, i) => sum + (Number(i.expected_value) || 0),
        0,
      );

      // Break-even is reached when accumulated revenue >= total investment
      const isBreakEven = revenue >= totalInvest;

      let daysToBreakEven: number | undefined;
      if (isBreakEven && palletSales.length > 0) {
        // Sort sales chronologically to find exact break-even date
        const sortedSales = [...palletSales].sort(
          (a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime(),
        );
        let runningRev = 0;
        for (const s of sortedSales) {
          runningRev += s.sale_price;
          if (runningRev >= totalInvest) {
            daysToBreakEven = this.profitEngine.calculateHoldingDurationDays(
              p.purchase_date,
              s.sale_date,
            );
            break;
          }
        }
      }

      return {
        purchaseId: p.id,
        title: p.title,
        totalInvestment: Number(totalInvest.toFixed(2)),
        itemsCount: palletItems.length,
        soldCount: soldItems.length,
        openCount: openItems.length,
        defectCount: defectiveItems.length,
        defectRate,
        revenue: Number(revenue.toFixed(2)),
        realizedProfit: Number(realizedProfit.toFixed(2)),
        remainingStockValue: Number(remainingStockValue.toFixed(2)),
        isBreakEven,
        daysToBreakEven,
      };
    });
  }

  /**
   * Computes category rankings and sell-through rates.
   */
  computeCategoryRankings(items: InventoryItem[], sales: Sale[]): CategoryRank[] {
    const catMap = new Map<
      string,
      {
        category: string;
        itemsCount: number;
        soldCount: number;
        revenue: number;
        profit: number;
        totalRoi: number;
      }
    >();

    for (const item of items) {
      const cat = item.category?.trim() || 'Allgemein';
      const entry = catMap.get(cat) || {
        category: cat,
        itemsCount: 0,
        soldCount: 0,
        revenue: 0,
        profit: 0,
        totalRoi: 0,
      };
      entry.itemsCount += 1;
      catMap.set(cat, entry);
    }

    for (const s of sales) {
      const cat = s.inventory_item?.category?.trim() || 'Allgemein';
      const entry = catMap.get(cat) || {
        category: cat,
        itemsCount: 0,
        soldCount: 0,
        revenue: 0,
        profit: 0,
        totalRoi: 0,
      };
      entry.soldCount += 1;
      entry.revenue += s.sale_price;
      entry.profit += s.net_profit || 0;
      entry.totalRoi += s.roi || 0;
      catMap.set(cat, entry);
    }

    const results: CategoryRank[] = [];
    for (const [_, val] of catMap.entries()) {
      const avgRoi = val.soldCount > 0 ? Number((val.totalRoi / val.soldCount).toFixed(1)) : 0;
      results.push({
        category: val.category,
        itemsCount: val.itemsCount,
        soldCount: val.soldCount,
        revenue: Number(val.revenue.toFixed(2)),
        profit: Number(val.profit.toFixed(2)),
        avgRoi,
      });
    }

    return results.sort((a, b) => b.profit - a.profit);
  }

  /**
   * Calculates overall sell-through rate.
   */
  calculateSellThroughRate(totalItems: number, soldItems: number): number {
    if (totalItems <= 0) return 0;
    return Number(((soldItems / totalItems) * 100).toFixed(1));
  }

  /**
   * Computes platform profitability and fee analytics.
   */
  computePlatformPerformance(sales: Sale[]): PlatformPerformance[] {
    const map = new Map<
      string,
      {
        salesCount: number;
        grossRevenue: number;
        platformFees: number;
        netProfit: number;
        totalHoldingDays: number;
      }
    >();

    for (const s of sales) {
      const p = s.platform || 'other';
      const entry = map.get(p) || {
        salesCount: 0,
        grossRevenue: 0,
        platformFees: 0,
        netProfit: 0,
        totalHoldingDays: 0,
      };

      entry.salesCount += 1;
      entry.grossRevenue += s.sale_price;
      entry.platformFees += s.platform_fee || 0;
      entry.netProfit += s.net_profit || 0;
      entry.totalHoldingDays += s.holding_duration_days || 0;

      map.set(p, entry);
    }

    const platformLabels: Record<string, string> = {
      kleinanzeigen: 'Kleinanzeigen',
      ebay: 'eBay',
      vinted: 'Vinted',
      custom_store: 'Eigener Shop',
      other: 'Sonstige',
    };

    const results: PlatformPerformance[] = [];
    for (const [key, val] of map.entries()) {
      const effectiveFeePercent =
        val.grossRevenue > 0 ? Number(((val.platformFees / val.grossRevenue) * 100).toFixed(1)) : 0;
      const profitMargin =
        val.grossRevenue > 0 ? Number(((val.netProfit / val.grossRevenue) * 100).toFixed(1)) : 0;
      const avgHoldingDays =
        val.salesCount > 0 ? Number((val.totalHoldingDays / val.salesCount).toFixed(1)) : 0;

      results.push({
        platform: key,
        platformLabel: platformLabels[key] || key,
        salesCount: val.salesCount,
        grossRevenue: Number(val.grossRevenue.toFixed(2)),
        platformFees: Number(val.platformFees.toFixed(2)),
        effectiveFeePercent,
        netProfit: Number(val.netProfit.toFixed(2)),
        profitMargin,
        avgHoldingDays,
      });
    }

    return results.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * Analyzes holding duration and speed buckets.
   */
  computeHoldingDurationAnalysis(sales: Sale[]): HoldingDurationAnalysis {
    if (sales.length === 0) {
      return {
        avgOverallDays: 0,
        fastestSaleDays: 0,
        slowestSaleDays: 0,
        capitalTurnoverRate: 0,
        buckets: [],
      };
    }

    let totalDays = 0;
    let fastest = Infinity;
    let slowest = -Infinity;

    const bFast = { count: 0, profit: 0, totalRoi: 0 }; // < 7 days
    const bNormal = { count: 0, profit: 0, totalRoi: 0 }; // 7 - 30 days
    const bMedium = { count: 0, profit: 0, totalRoi: 0 }; // 31 - 60 days
    const bSlow = { count: 0, profit: 0, totalRoi: 0 }; // > 60 days

    for (const s of sales) {
      const days = s.holding_duration_days || 1;
      totalDays += days;
      if (days < fastest) fastest = days;
      if (days > slowest) slowest = days;

      const p = s.net_profit || 0;
      const roi = s.roi || 0;

      if (days < 7) {
        bFast.count++;
        bFast.profit += p;
        bFast.totalRoi += roi;
      } else if (days <= 30) {
        bNormal.count++;
        bNormal.profit += p;
        bNormal.totalRoi += roi;
      } else if (days <= 60) {
        bMedium.count++;
        bMedium.profit += p;
        bMedium.totalRoi += roi;
      } else {
        bSlow.count++;
        bSlow.profit += p;
        bSlow.totalRoi += roi;
      }
    }

    const n = sales.length;
    const avgDays = Number((totalDays / n).toFixed(1));
    const turnoverRate = avgDays > 0 ? Number((365 / avgDays).toFixed(1)) : 0;

    const buckets: HoldingDurationBucket[] = [
      {
        label: 'Schnelldreher (< 7 Tage)',
        count: bFast.count,
        percent: Number(((bFast.count / n) * 100).toFixed(1)),
        totalProfit: Number(bFast.profit.toFixed(2)),
        avgRoi: bFast.count > 0 ? Number((bFast.totalRoi / bFast.count).toFixed(1)) : 0,
        color: '#6366f1',
      },
      {
        label: 'Optimal (7 – 30 Tage)',
        count: bNormal.count,
        percent: Number(((bNormal.count / n) * 100).toFixed(1)),
        totalProfit: Number(bNormal.profit.toFixed(2)),
        avgRoi: bNormal.count > 0 ? Number((bNormal.totalRoi / bNormal.count).toFixed(1)) : 0,
        color: '#10b981',
      },
      {
        label: 'Mittel (31 – 60 Tage)',
        count: bMedium.count,
        percent: Number(((bMedium.count / n) * 100).toFixed(1)),
        totalProfit: Number(bMedium.profit.toFixed(2)),
        avgRoi: bMedium.count > 0 ? Number((bMedium.totalRoi / bMedium.count).toFixed(1)) : 0,
        color: '#f59e0b',
      },
      {
        label: 'Langläufer (> 60 Tage)',
        count: bSlow.count,
        percent: Number(((bSlow.count / n) * 100).toFixed(1)),
        totalProfit: Number(bSlow.profit.toFixed(2)),
        avgRoi: bSlow.count > 0 ? Number((bSlow.totalRoi / bSlow.count).toFixed(1)) : 0,
        color: '#ef4444',
      },
    ];

    return {
      avgOverallDays: avgDays,
      fastestSaleDays: fastest === Infinity ? 0 : fastest,
      slowestSaleDays: slowest === -Infinity ? 0 : slowest,
      capitalTurnoverRate: turnoverRate,
      buckets,
    };
  }

  /**
   * Computes monthly purchase cohort recovery stats.
   */
  computeMonthlyCohorts(purchases: Purchase[], sales: Sale[]): MonthlyCohortStats[] {
    const monthMap = new Map<
      string,
      {
        invested: number;
        itemsCount: number;
        revenue: number;
        profit: number;
        soldCount: number;
      }
    >();

    for (const p of purchases) {
      const monthKey = p.purchase_date.substring(0, 7); // 'YYYY-MM'
      const entry = monthMap.get(monthKey) || {
        invested: 0,
        itemsCount: 0,
        revenue: 0,
        profit: 0,
        soldCount: 0,
      };

      entry.invested += p.total_purchase_cost || p.purchase_price;
      entry.itemsCount += p.items_count || 1;
      monthMap.set(monthKey, entry);
    }

    for (const s of sales) {
      const monthKey = s.sale_date.substring(0, 7);
      const entry = monthMap.get(monthKey) || {
        invested: 0,
        itemsCount: 0,
        revenue: 0,
        profit: 0,
        soldCount: 0,
      };

      entry.revenue += s.sale_price;
      entry.profit += s.net_profit || 0;
      entry.soldCount += 1;
      monthMap.set(monthKey, entry);
    }

    const monthNames: Record<string, string> = {
      '01': 'Januar',
      '02': 'Februar',
      '03': 'März',
      '04': 'April',
      '05': 'Mai',
      '06': 'Juni',
      '07': 'Juli',
      '08': 'August',
      '09': 'September',
      '10': 'Oktober',
      '11': 'November',
      '12': 'Dezember',
    };

    const results: MonthlyCohortStats[] = [];
    for (const [mKey, val] of monthMap.entries()) {
      const [year, month] = mKey.split('-');
      const label = `${monthNames[month] || month} ${year}`;
      const recoveryPercent =
        val.invested > 0 ? Number(((val.revenue / val.invested) * 100).toFixed(1)) : 100;

      results.push({
        monthKey: mKey,
        monthLabel: label,
        invested: Number(val.invested.toFixed(2)),
        realizedRevenue: Number(val.revenue.toFixed(2)),
        realizedProfit: Number(val.profit.toFixed(2)),
        recoveryPercent,
        isProfitable: recoveryPercent >= 100,
        itemsCount: val.itemsCount,
        soldCount: val.soldCount,
      });
    }

    return results.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }

  /**
   * Computes sales distribution across days and time slots.
   */
  computeSalesHeatmap(sales: Sale[]): DayHeatmap[] {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    const heatmap: DayHeatmap[] = days.map((dayName, dayIndex) => ({
      dayName,
      dayIndex,
      morningCount: 0,
      afternoonCount: 0,
      eveningCount: 0,
      nightCount: 0,
      totalSales: 0,
      totalRevenue: 0,
    }));

    for (const s of sales) {
      const d = new Date(s.sale_date);
      const dayIndex = d.getDay();

      const entry = heatmap[dayIndex];
      entry.totalSales += 1;
      entry.totalRevenue += s.sale_price;

      // Keine Auswertung nach Tageszeit: sale_date ist ein Datum ohne Uhrzeit.
      // Die Aufteilung in Vormittag, Nachmittag und Abend stand deshalb immer
      // auf null, waehrend die Ueberschrift "die lukrativsten Tage und Zeiten"
      // versprach. Der Wochentag laesst sich aus dem Datum ableiten und bleibt.
    }

    // Reorder starting Monday (1, 2, 3, 4, 5, 6, 0)
    return [heatmap[1], heatmap[2], heatmap[3], heatmap[4], heatmap[5], heatmap[6], heatmap[0]];
  }
}
