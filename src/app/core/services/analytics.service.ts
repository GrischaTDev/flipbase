import { Injectable } from '@angular/core';
import { ProfitEngineService } from './profit-engine.service';
import { Sale, Purchase, InventoryItem } from '../models/reflip.models';

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
   * Computes source performance analytics (Kapitel 28).
   */
  computeSourcePerformance(purchases: Purchase[], sales: Sale[]): SourcePerformance[] {
    const sourceMap = new Map<string, {
      name: string;
      purchasesCount: number;
      invested: number;
      revenue: number;
      profit: number;
      totalHoldingDays: number;
      salesCount: number;
    }>();

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
   * Computes supplier performance analytics and defect rates (Kapitel 28).
   */
  computeSupplierPerformance(purchases: Purchase[], items: InventoryItem[], sales: Sale[]): SupplierPerformance[] {
    const supplierMap = new Map<string, {
      name: string;
      purchasesCount: number;
      itemsCount: number;
      defectiveCount: number;
      totalRoi: number;
      salesCount: number;
    }>();

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
      const defectRate = val.itemsCount > 0 ? Number(((val.defectiveCount / val.itemsCount) * 100).toFixed(1)) : 0;
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
   * Computes Mystery Pack Statistics (Kapitel 29).
   */
  computeMysteryPackStats(purchases: Purchase[], items: InventoryItem[], sales: Sale[]): MysteryPackStats[] {
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

      const remainingStockValue = openItems.reduce((sum, i) => sum + (Number(i.expected_value) || 0), 0);

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
   * Computes Pallet & Lot Dashboard and Break-even Analysis (Kapitel 30).
   */
  computePalletStats(purchases: Purchase[], items: InventoryItem[], sales: Sale[]): PalletStats[] {
    const pallets = purchases.filter((p) => p.type === 'pallet' || p.type === 'lot');

    return pallets.map((p) => {
      const palletItems = items.filter((i) => i.purchase_id === p.id);
      const totalInvest = p.total_purchase_cost ?? p.purchase_price;

      const soldItems = palletItems.filter((i) => i.status === 'sold');
      const openItems = palletItems.filter((i) => i.status !== 'sold' && i.status !== 'archived');
      const defectiveItems = palletItems.filter((i) => i.condition === 'defective' || i.status === 'defective');

      const defectRate = palletItems.length > 0
        ? Number(((defectiveItems.length / palletItems.length) * 100).toFixed(1))
        : 0;

      const palletSales = sales.filter((s) => s.inventory_item?.purchase_id === p.id);
      const revenue = palletSales.reduce((sum, s) => sum + s.sale_price, 0);
      const realizedProfit = palletSales.reduce((sum, s) => sum + (s.net_profit || 0), 0);
      const remainingStockValue = openItems.reduce((sum, i) => sum + (Number(i.expected_value) || 0), 0);

      // Break-even is reached when accumulated revenue >= total investment
      const isBreakEven = revenue >= totalInvest;

      let daysToBreakEven: number | undefined;
      if (isBreakEven && palletSales.length > 0) {
        // Sort sales chronologically to find exact break-even date
        const sortedSales = [...palletSales].sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());
        let runningRev = 0;
        for (const s of sortedSales) {
          runningRev += s.sale_price;
          if (runningRev >= totalInvest) {
            daysToBreakEven = this.profitEngine.calculateHoldingDurationDays(p.purchase_date, s.sale_date);
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
   * Computes category rankings and sell-through rates (Kapitel 31).
   */
  computeCategoryRankings(items: InventoryItem[], sales: Sale[]): CategoryRank[] {
    const catMap = new Map<string, {
      category: string;
      itemsCount: number;
      soldCount: number;
      revenue: number;
      profit: number;
      totalRoi: number;
    }>();

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
}
