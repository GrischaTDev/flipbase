import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { EbayApiService } from './ebay-api.service';
import { ResearchQuery } from '../models/flipbase.models';
import { LoggerService } from './logger.service';

export interface ResearchComparisonItem {
  id: string;
  title: string;
  price: number;
  source: 'ebay_sold' | 'kleinanzeigen' | 'vinted';
  imageUrl: string;
  url: string;
  date: string;
  condition: string;
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

export interface MarketLink {
  platform: 'ebay_sold' | 'kleinanzeigen' | 'vinted' | 'idealo' | 'google_shopping';
  title: string;
  url: string;
  badge: string;
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
  marketLinks: MarketLink[];
  dealScore: number;
  maxBuyPrice: number;
}

@Injectable({
  providedIn: 'root',
})
export class ResearchService {
  private readonly supabase = inject(SupabaseService);
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly workspaceService = inject(WorkspaceService);
  private readonly ebayApiService = inject(EbayApiService);
  private readonly profitEngine = new ProfitEngineService();

  readonly recentQueries = signal<ResearchQuery[]>([]);
  readonly currentComparisonItems = signal<ResearchComparisonItem[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        if (ws) {
          this.loadRecentQueries(ws.id);
        } else {
          this.recentQueries.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
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
      this.logger.error('Error loading research queries:', err);
    }
  }

  /**
   * Generates live marketplace search links for German platforms.
   */
  generateMarketLinks(query: string): MarketLink[] {
    const encoded = encodeURIComponent(query.trim());
    return [
      {
        platform: 'ebay_sold',
        title: 'eBay Verkaufte Artikel (Real Comps)',
        url: `https://www.ebay.de/sch/i.html?_nkw=${encoded}&LH_Complete=1&LH_Sold=1`,
        badge: 'Tatsächliche Verkaufspreise',
      },
      {
        platform: 'kleinanzeigen',
        title: 'Kleinanzeigen Angebote',
        url: `https://www.kleinanzeigen.de/s-${encoded}/k0`,
        badge: 'Lokale Inserate',
      },
      {
        platform: 'vinted',
        title: 'Vinted Katalog',
        url: `https://www.vinted.de/catalog?search_text=${encoded}`,
        badge: 'Second Hand & Mode',
      },
      {
        platform: 'idealo',
        title: 'Idealo Neupreis-Vergleich',
        url: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encoded}`,
        badge: 'UVP & Neupreise',
      },
    ];
  }

  /**
   * Executes a market research search using live eBay API / Marketplace Comps with original seller photos.
   */
  /**
   * Ob die letzte Recherche echte Marktdaten geliefert hat.
   *
   * Die Oberflaeche zeigt danach einen Hinweis statt einer leeren Liste, die
   * wie ein Suchergebnis aussieht.
   */
  readonly marktdatenAngebunden = signal<boolean>(false);

  async executeResearch(
    queryText: string,
    // Der Zustand floss nur in die frueher erfundenen Vergleichsangebote ein.
    // Er bleibt in der Signatur, weil die Oberflaeche ihn mitgibt und eine
    // echte Anbindung ihn wieder brauchen wird.
    _condition = 'used',
    estimatedCost = 25.0,
    limit = 24,
  ): Promise<{ results: ResearchComparisonItem[]; summary: ResearchSummary }> {
    this.isLoading.set(true);

    try {
      // Nur echte verkaufte Angebote von eBay.
      //
      // Frueher stand hier ein Rueckfall: Lieferte die Schnittstelle nichts,
      // wurden Vergleichsangebote *erfunden* - Zufallspreise um einen
      // Schaetzwert, dazu erfundene Titel, Plattformangaben und Verkaufsdaten.
      // Da die Schnittstelle einen eBay-Schluessel braucht und die zugehoerige
      // Edge Function auf dem Server gar nicht liegt, war praktisch jede
      // Recherche erfunden - und darauf wurden Verkaufspreise gestuetzt.
      //
      // Lieber keine Zahl als eine ausgedachte.
      const comps = (await this.ebayApiService.searchSoldItems(queryText, limit)) ?? [];
      this.marktdatenAngebunden.set(comps.length > 0);

      this.currentComparisonItems.set(comps);
      const summary = this.calculateSummary(comps, estimatedCost, queryText);

      // Persist query to Supabase if workspace is active
      const ws = this.workspaceService.currentWorkspace();
      if (ws && queryText.trim()) {
        try {
          await this.supabase.client.from('research_queries').insert({
            workspace_id: ws.id,
            query_text: queryText.trim(),
            source: 'ebay_sold,kleinanzeigen,vinted',
            result_count: comps.length,
            min_price: summary.minPrice,
            max_price: summary.maxPrice,
            avg_price: summary.avgPrice,
            median_price: summary.medianPrice,
          });
          await this.loadRecentQueries(ws.id);
        } catch {
          // offline query persistence ignored
        }
      }

      return { results: comps, summary };
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Calculates robust statistics, outlier filtering, and pricing strategies.
   */
  calculateSummary(
    items: ResearchComparisonItem[],
    baseCosts = 25.0,
    queryText = '',
  ): ResearchSummary {
    const activePrices = items
      .filter((i) => !i.isExcluded)
      .map((i) => i.price)
      .sort((a, b) => a - b);

    const marketLinks = this.generateMarketLinks(queryText);

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
        marketLinks,
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

    // 3 Pricing Strategies
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
        estimatedRoi: this.profitEngine.calculateRoi(quickProfit, baseCosts) ?? 0,
        turnaroundDays: '1 - 5 Tage',
      },
      {
        type: 'fair_market',
        label: 'Fairer Marktwert (Standard)',
        description: 'Optimale Balance aus gesunder Marge und realistischer Verkaufszeit.',
        recommendedPrice: fairMarketPrice,
        estimatedProfit: fairProfit,
        estimatedRoi: this.profitEngine.calculateRoi(fairProfit, baseCosts) ?? 0,
        turnaroundDays: '7 - 14 Tage',
      },
      {
        type: 'high_margin',
        label: 'High Margin (Maximaler Gewinn)',
        description: 'Für Top-Zustände & geduldige Verkäufer mit Fokus auf Höchstpreise.',
        recommendedPrice: highMarginPrice,
        estimatedProfit: highProfit,
        estimatedRoi: this.profitEngine.calculateRoi(highProfit, baseCosts) ?? 0,
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
      marketLinks,
      dealScore: dealEval.dealScore,
      maxBuyPrice,
    };
  }

  toggleExcludeItem(itemId: string): void {
    this.currentComparisonItems.update((items) =>
      items.map((it) => (it.id === itemId ? { ...it, isExcluded: !it.isExcluded } : it)),
    );
  }
}
