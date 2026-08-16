import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { ResearchQuery, ResearchResult } from '../models/reflip.models';

export interface ResearchComparisonItem {
  id: string;
  title: string;
  price: number;
  source: 'ebay_sold' | 'kleinanzeigen' | 'vinted';
  url?: string;
  date?: string;
  condition?: string;
  isExcluded: boolean;
}

export interface PricingStrategy {
  type: 'quick_sale' | 'fair_market' | 'high_margin';
  label: string;
  description: string;
  recommendedPrice: number;
  estimatedProfit: number;
  estimatedRoi: number;
  turnaroundDays: string;
}

export interface ResearchSummary {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  p25: number;
  p75: number;
  validCount: number;
  excludedCount: number;
  strategies: PricingStrategy[];
  dealScore: number;
  maxBuyPrice: number;
}

@Injectable({
  providedIn: 'root',
})
export class ResearchService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly profitEngine = new ProfitEngineService();

  readonly recentQueries = signal<ResearchQuery[]>([]);
  readonly currentComparisonItems = signal<ResearchComparisonItem[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.loadRecentQueries(ws.id);
      } else {
        this.recentQueries.set([]);
      }
    });
  }

  async loadRecentQueries(workspaceId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('research_queries')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        this.recentQueries.set(data as ResearchQuery[]);
      }
    } catch (err) {
      console.error('Error loading research queries:', err);
    }
  }

  /**
   * Executes a market research simulation with robust parsing & statistical analysis.
   */
  async executeResearch(
    queryText: string,
    condition: string = 'used',
    estimatedCost: number = 25.0
  ): Promise<{ results: ResearchComparisonItem[]; summary: ResearchSummary }> {
    this.isLoading.set(true);

    try {
      // Simulate real-world sold listings / current market comps
      const simulatedItems = this.generateRealisticComps(queryText, condition);
      this.currentComparisonItems.set(simulatedItems);

      const summary = this.calculateSummary(simulatedItems, estimatedCost);

      // Persist query to Supabase if workspace is active
      const ws = this.workspaceService.currentWorkspace();
      if (ws && queryText.trim()) {
        await this.supabase.client.from('research_queries').insert({
          workspace_id: ws.id,
          query_text: queryText.trim(),
          source: 'ebay_sold,kleinanzeigen,vinted',
          result_count: simulatedItems.length,
          min_price: summary.minPrice,
          max_price: summary.maxPrice,
          avg_price: summary.avgPrice,
          median_price: summary.medianPrice,
        });
        await this.loadRecentQueries(ws.id);
      }

      return { results: simulatedItems, summary };
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Calculates robust statistics, outlier filtering, and pricing strategies (Kapitel 18 & 19).
   */
  calculateSummary(items: ResearchComparisonItem[], baseCosts: number = 25.0): ResearchSummary {
    const activePrices = items
      .filter((i) => !i.isExcluded)
      .map((i) => i.price)
      .sort((a, b) => a - b);

    if (activePrices.length === 0) {
      return {
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        medianPrice: 0,
        p25: 0,
        p75: 0,
        validCount: 0,
        excludedCount: items.length,
        strategies: [],
        dealScore: 0,
        maxBuyPrice: 0,
      };
    }

    const minPrice = activePrices[0];
    const maxPrice = activePrices[activePrices.length - 1];
    const sum = activePrices.reduce((a, b) => a + b, 0);
    const avgPrice = Number((sum / activePrices.length).toFixed(2));

    // Median
    const mid = Math.floor(activePrices.length / 2);
    const medianPrice =
      activePrices.length % 2 !== 0
        ? activePrices[mid]
        : Number(((activePrices[mid - 1] + activePrices[mid]) / 2).toFixed(2));

    // Quartiles P25 and P75
    const p25Index = Math.floor(activePrices.length * 0.25);
    const p75Index = Math.floor(activePrices.length * 0.75);
    const p25 = activePrices[p25Index];
    const p75 = activePrices[p75Index];

    // 3 Pricing Strategies (Kapitel 19)
    const quickSalePrice = Math.max(minPrice, Number((medianPrice * 0.85).toFixed(2)));
    const fairMarketPrice = medianPrice;
    const highMarginPrice = Math.min(maxPrice, Number((p75 * 1.05).toFixed(2)));

    const quickProfit = this.profitEngine.calculateProfit(quickSalePrice, baseCosts);
    const fairProfit = this.profitEngine.calculateProfit(fairMarketPrice, baseCosts);
    const highProfit = this.profitEngine.calculateProfit(highMarginPrice, baseCosts);

    const strategies: PricingStrategy[] = [
      {
        type: 'quick_sale',
        label: 'Quick Sale (Schnelldreher)',
        description: 'Schneller Abverkauf für sofortigen Cashflow innerhalb weniger Tage.',
        recommendedPrice: quickSalePrice,
        estimatedProfit: quickProfit,
        estimatedRoi: this.profitEngine.calculateRoi(quickProfit, baseCosts),
        turnaroundDays: '1 - 5 Tage',
      },
      {
        type: 'fair_market',
        label: 'Fairer Marktwert (Standard)',
        description: 'Optimale Balance aus gesunder Marge und realistischer Verkaufszeit.',
        recommendedPrice: fairMarketPrice,
        estimatedProfit: fairProfit,
        estimatedRoi: this.profitEngine.calculateRoi(fairProfit, baseCosts),
        turnaroundDays: '7 - 14 Tage',
      },
      {
        type: 'high_margin',
        label: 'High Margin (Maximaler Gewinn)',
        description: 'Für Top-Zustände & geduldige Verkäufer mit Fokus auf Höchstpreise.',
        recommendedPrice: highMarginPrice,
        estimatedProfit: highProfit,
        estimatedRoi: this.profitEngine.calculateRoi(highProfit, baseCosts),
        turnaroundDays: '14 - 30+ Tage',
      },
    ];

    const maxBuyPrice = this.profitEngine.calculateMaxBuyPrice(medianPrice, 5.0, 30.0, 15.0);
    const dealEval = this.profitEngine.evaluateDeal(baseCosts, medianPrice, 5.0, 30.0, 15.0, 90.0);

    return {
      minPrice,
      maxPrice,
      avgPrice,
      medianPrice,
      p25,
      p75,
      validCount: activePrices.length,
      excludedCount: items.filter((i) => i.isExcluded).length,
      strategies,
      dealScore: dealEval.dealScore,
      maxBuyPrice,
    };
  }

  toggleExcludeItem(itemId: string): void {
    this.currentComparisonItems.update((list) =>
      list.map((item) =>
        item.id === itemId ? { ...item, isExcluded: !item.isExcluded } : item
      )
    );
  }

  private generateRealisticComps(query: string, condition: string): ResearchComparisonItem[] {
    // Generate realistic market distribution comps tailored to the query
    const baseSeedPrice = this.estimateSeedPrice(query);
    const comps: ResearchComparisonItem[] = [];

    const dateToday = new Date();

    // 1. A few normal market sold items
    const variations = [0.85, 0.95, 1.0, 1.02, 1.1, 1.15, 0.9, 1.25, 0.78, 1.05];
    const platforms: ('ebay_sold' | 'kleinanzeigen' | 'vinted')[] = [
      'ebay_sold',
      'kleinanzeigen',
      'ebay_sold',
      'vinted',
      'ebay_sold',
      'kleinanzeigen',
      'ebay_sold',
      'ebay_sold',
      'kleinanzeigen',
      'vinted',
    ];

    variations.forEach((factor, idx) => {
      const price = Number((baseSeedPrice * factor).toFixed(2));
      const pastDays = idx * 2;
      const d = new Date(dateToday.getTime() - pastDays * 24 * 60 * 60 * 1000);

      comps.push({
        id: `comp-${idx + 1}`,
        title: `${query} (${condition}) - Verkauft`,
        price,
        source: platforms[idx % platforms.length],
        date: d.toISOString().split('T')[0],
        condition,
        isExcluded: false,
      });
    });

    // 2. Outlier 1: Extreme high outlier (Mondpreis)
    comps.push({
      id: 'comp-outlier-high',
      title: `${query} (Sammler / Neu / Mondpreis)`,
      price: Number((baseSeedPrice * 3.5).toFixed(2)),
      source: 'ebay_sold',
      date: dateToday.toISOString().split('T')[0],
      condition: 'new',
      isExcluded: true, // Automatically marked as excluded outlier
    });

    return comps.sort((a, b) => a.price - b.price);
  }

  private estimateSeedPrice(query: string): number {
    const q = query.toLowerCase();
    if (q.includes('iphone') || q.includes('macbook')) return 450;
    if (q.includes('playstation') || q.includes('ps5') || q.includes('xbox')) return 320;
    if (q.includes('nintendo') || q.includes('switch')) return 190;
    if (q.includes('lego')) return 85;
    if (q.includes('bosch') || q.includes('makita') || q.includes('bohrer')) return 75;
    if (q.includes('jacke') || q.includes('sneaker') || q.includes('schuhe')) return 60;
    return 50;
  }
}
