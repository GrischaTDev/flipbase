import { Injectable, signal, computed } from '@angular/core';

export type MarketplaceId = 'vinted' | 'ebay' | 'kleinanzeigen';

export interface MarketplaceSettings {
  readonly vinted: boolean;
  readonly ebay: boolean;
  readonly kleinanzeigen: boolean;
}

export const DEFAULT_MARKETPLACE_SETTINGS: MarketplaceSettings = {
  vinted: true,
  ebay: true,
  kleinanzeigen: true,
};

const STORAGE_KEY = 'flipbase_marketplace_settings';

@Injectable({
  providedIn: 'root',
})
export class MarketplaceSettingsService {
  readonly settings = signal<MarketplaceSettings>(this.readStoredSettings());

  readonly isVintedEnabled = computed(() => this.settings().vinted);
  readonly isEbayEnabled = computed(() => this.settings().ebay);
  readonly isKleinanzeigenEnabled = computed(() => this.settings().kleinanzeigen);

  readonly activeCount = computed(() => {
    const current = this.settings();
    return (current.vinted ? 1 : 0) + (current.ebay ? 1 : 0) + (current.kleinanzeigen ? 1 : 0);
  });

  isMarketplaceEnabled(id: MarketplaceId): boolean {
    return this.settings()[id];
  }

  setMarketplaceEnabled(id: MarketplaceId, enabled: boolean): void {
    const updated: MarketplaceSettings = {
      ...this.settings(),
      [id]: enabled,
    };
    this.settings.set(updated);
    this.persist(updated);
  }

  toggleMarketplace(id: MarketplaceId): void {
    this.setMarketplaceEnabled(id, !this.settings()[id]);
  }

  private readStoredSettings(): MarketplaceSettings {
    if (typeof localStorage === 'undefined') return DEFAULT_MARKETPLACE_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return DEFAULT_MARKETPLACE_SETTINGS;
      const parsed = JSON.parse(stored) as Partial<MarketplaceSettings>;
      return {
        vinted: typeof parsed.vinted === 'boolean' ? parsed.vinted : true,
        ebay: typeof parsed.ebay === 'boolean' ? parsed.ebay : true,
        kleinanzeigen: typeof parsed.kleinanzeigen === 'boolean' ? parsed.kleinanzeigen : true,
      };
    } catch {
      return DEFAULT_MARKETPLACE_SETTINGS;
    }
  }

  private persist(settings: MarketplaceSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Speicher nicht verfuegbar oder voll
    }
  }
}
