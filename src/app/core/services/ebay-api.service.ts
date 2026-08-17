import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ResearchComparisonItem } from './research.service';

export interface EbayApiConfig {
  appId?: string;
  certId?: string;
  devId?: string;
  siteId?: string; // e.g. EBAY-DE (77)
  useEdgeFunction?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class EbayApiService {
  private readonly supabase = inject(SupabaseService);

  private config: EbayApiConfig = {
    siteId: 'EBAY-DE',
    useEdgeFunction: true,
  };

  constructor() {
    this.loadSavedConfig();
  }

  private loadSavedConfig(): void {
    try {
      const saved = localStorage.getItem('reflip_ebay_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
  }

  saveConfig(newConfig: Partial<EbayApiConfig>): void {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem('reflip_ebay_config', JSON.stringify(this.config));
    } catch {
      // ignore
    }
  }

  getConfig(): EbayApiConfig {
    return { ...this.config };
  }

  /**
   * Searches live completed / sold items on eBay with genuine original seller photos.
   */
  async searchSoldItems(query: string, limit: number = 10): Promise<ResearchComparisonItem[]> {
    const cleanQ = query.trim();
    if (!cleanQ) return [];

    // 1. Try Supabase Edge Function if available
    try {
      const { data, error } = await this.supabase.client.functions.invoke('marketplace-search', {
        body: { query: cleanQ, limit, platform: 'ebay_sold' },
      });

      if (!error && data && Array.isArray(data.items) && data.items.length > 0) {
        return data.items.map((it: any) => ({
          id: it.itemId || 'ebay-' + Math.random().toString(36).substring(2, 7),
          title: it.title,
          price: Number(it.price) || 0,
          source: 'ebay_sold' as const,
          imageUrl: it.imageUrl || it.galleryURL,
          url: it.viewItemURL || it.url,
          date: it.endTime ? new Date(it.endTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          condition: it.conditionDisplayName || it.condition || 'Gebraucht',
          isExcluded: false,
        }));
      }
    } catch (err) {
      console.warn('Edge function marketplace-search fallback', err);
    }

    // 2. Direct Open eBay Finding RSS / Open Search Bridge if direct key configured
    if (this.config.appId) {
      try {
        const ebayUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${this.config.appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(cleanQ)}&GLOBAL-ID=${this.config.siteId || 'EBAY-DE'}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&paginationInput.entriesPerPage=${limit}`;
        const res = await fetch(ebayUrl);
        if (res.ok) {
          const json = await res.json();
          const items = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
          return items.map((it: any) => {
            const priceVal = parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || '0');
            return {
              id: it.itemId?.[0] || 'ebay-' + Math.random().toString(36).substring(2, 7),
              title: it.title?.[0] || cleanQ,
              price: priceVal,
              source: 'ebay_sold' as const,
              imageUrl: it.galleryURL?.[0] || '',
              url: it.viewItemURL?.[0] || `https://www.ebay.de/itm/${it.itemId?.[0]}`,
              date: it.listingInfo?.[0]?.endTime?.[0]?.split('T')?.[0] || new Date().toISOString().split('T')[0],
              condition: it.condition?.[0]?.conditionDisplayName?.[0] || 'Gebraucht',
              isExcluded: false,
            };
          });
        }
      } catch (err) {
        console.warn('eBay direct finding API call failed', err);
      }
    }

    return [];
  }
}
