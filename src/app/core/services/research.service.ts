import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { ProfitEngineService } from './profit-engine.service';
import { ResearchQuery } from '../models/reflip.models';

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
   * Executes a market research simulation with robust parsing & statistical analysis.
   */
  async executeResearch(
    queryText: string,
    condition: string = 'used',
    estimatedCost: number = 25.0
  ): Promise<{ results: ResearchComparisonItem[]; summary: ResearchSummary }> {
    this.isLoading.set(true);

    try {
      // Generate realistic comparative listings with distinct photos
      const simulatedItems = this.generateRealisticComps(queryText, condition);
      this.currentComparisonItems.set(simulatedItems);

      const summary = this.calculateSummary(simulatedItems, estimatedCost, queryText);

      // Persist query to Supabase if workspace is active
      const ws = this.workspaceService.currentWorkspace();
      if (ws && queryText.trim()) {
        try {
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
        } catch {
          // offline query persistence ignored
        }
      }

      return { results: simulatedItems, summary };
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Calculates robust statistics, outlier filtering, and pricing strategies (Kapitel 18 & 19).
   */
  calculateSummary(
    items: ResearchComparisonItem[],
    baseCosts: number = 25.0,
    queryText: string = ''
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
      marketLinks,
      dealScore: dealEval.dealScore,
      maxBuyPrice,
    };
  }

  toggleExcludeItem(itemId: string): void {
    this.currentComparisonItems.update((items) =>
      items.map((it) => (it.id === itemId ? { ...it, isExcluded: !it.isExcluded } : it))
    );
  }

  private generateRealisticComps(query: string, condition: string): ResearchComparisonItem[] {
    let baseValue = 50.0;
    const lower = query.toLowerCase();

    // Curated high-resolution distinct photo galleries per category
    const photoGalleries: Record<string, { baseVal: number; photos: string[] }> = {
      audio: {
        baseVal: 110.0,
        photos: [
          'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1598331668826-20cecc596b86?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?w=500&auto=format&fit=crop&q=80',
        ],
      },
      gaming: {
        baseVal: 220.0,
        photos: [
          'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1612287233207-6b66e3309a47?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=500&auto=format&fit=crop&q=80',
        ],
      },
      phone: {
        baseVal: 380.0,
        photos: [
          'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=500&auto=format&fit=crop&q=80',
        ],
      },
      tools: {
        baseVal: 75.0,
        photos: [
          'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1581147036324-c17ac41dfa6c?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=500&auto=format&fit=crop&q=80',
        ],
      },
      toys: {
        baseVal: 85.0,
        photos: [
          'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1608889175123-8ee362201f81?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=500&auto=format&fit=crop&q=80',
        ],
      },
      fashion: {
        baseVal: 65.0,
        photos: [
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500&auto=format&fit=crop&q=80',
        ],
      },
      bike: {
        baseVal: 140.0,
        photos: [
          'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1511994298241-608e28f14fde?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1558611848-73f7eb4001a1?w=500&auto=format&fit=crop&q=80',
        ],
      },
      tech: {
        baseVal: 90.0,
        photos: [
          'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=80',
        ],
      },
    };

    let selectedCategory = photoGalleries['tech'];

    if (lower.includes('airpod') || lower.includes('bose') || lower.includes('sony') || lower.includes('audio') || lower.includes('kopfhörer') || lower.includes('headset') || lower.includes('box')) {
      selectedCategory = photoGalleries['audio'];
    } else if (lower.includes('switch') || lower.includes('ps5') || lower.includes('xbox') || lower.includes('nintendo') || lower.includes('konsole') || lower.includes('game') || lower.includes('spiel')) {
      selectedCategory = photoGalleries['gaming'];
    } else if (lower.includes('iphone') || lower.includes('macbook') || lower.includes('ipad') || lower.includes('samsung') || lower.includes('phone') || lower.includes('handy')) {
      selectedCategory = photoGalleries['phone'];
    } else if (lower.includes('bosch') || lower.includes('makita') || lower.includes('werkzeug') || lower.includes('bohr') || lower.includes('dewalt') || lower.includes('akku')) {
      selectedCategory = photoGalleries['tools'];
    } else if (lower.includes('lego') || lower.includes('spielzeug') || lower.includes('figur') || lower.includes('star wars') || lower.includes('pokemon')) {
      selectedCategory = photoGalleries['toys'];
    } else if (lower.includes('schuhe') || lower.includes('sneaker') || lower.includes('nike') || lower.includes('adidas') || lower.includes('jacke') || lower.includes('hoodie') || lower.includes('kleid')) {
      selectedCategory = photoGalleries['fashion'];
    } else if (lower.includes('fahrrad') || lower.includes('bike') || lower.includes('cube') || lower.includes('mountainbike') || lower.includes('rennrad') || lower.includes('e-bike')) {
      selectedCategory = photoGalleries['bike'];
    }

    baseValue = selectedCategory.baseVal;

    const listingTitleSuffixes = [
      '– Wie neu in OVP mit Zubehör',
      'inkl. Originalverpackung & Beleg',
      '– Top Zustand, kaum genutzt',
      '– Technisch & optisch einwandfrei',
      '(Gebraucht mit leichten Gebrauchsspuren)',
      'inkl. Zubehör (Versand möglich)',
      '– Voll funktionsfähig / Gepflegt',
    ];

    const comps: ResearchComparisonItem[] = [];
    const platforms: ('ebay_sold' | 'kleinanzeigen' | 'vinted')[] = [
      'ebay_sold',
      'ebay_sold',
      'ebay_sold',
      'kleinanzeigen',
      'kleinanzeigen',
      'vinted',
      'ebay_sold',
    ];

    for (let i = 0; i < 7; i++) {
      const variance = (Math.random() - 0.5) * 0.45; // +/- 22%
      const price = Number((baseValue * (1 + variance)).toFixed(2));
      const source = platforms[i % platforms.length];
      const photoUrl = selectedCategory.photos[i % selectedCategory.photos.length];
      const titleSuffix = listingTitleSuffixes[i % listingTitleSuffixes.length];

      comps.push({
        id: 'comp-' + i + '-' + Math.random().toString(36).substring(2, 7),
        title: `${query} ${titleSuffix}`,
        price: Math.max(5, price),
        source,
        imageUrl: photoUrl,
        url: source === 'ebay_sold'
          ? `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1`
          : `https://www.kleinanzeigen.de/s-${encodeURIComponent(query)}/k0`,
        date: new Date(Date.now() - i * 86400000 * 2).toISOString().split('T')[0],
        condition: condition || 'used',
        isExcluded: false,
      });
    }

    return comps;
  }
}
