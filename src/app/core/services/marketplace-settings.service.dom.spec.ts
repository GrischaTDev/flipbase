import '@angular/compiler';
import { Injector } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { MarketplaceSettingsService } from './marketplace-settings.service';
import { SupabaseService } from './supabase.service';

describe('MarketplaceSettingsService – gespeicherte Auswahl', () => {
  let service: MarketplaceSettingsService;
  let stored: { vinted: boolean; ebay: boolean; kleinanzeigen: boolean } | null;
  function createService() {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: stored, error: null }),
    };
    return Injector.create({
      providers: [
        MarketplaceSettingsService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => query,
              rpc: async (
                _name: string,
                args: { p_vinted: boolean; p_ebay: boolean; p_kleinanzeigen: boolean },
              ) => {
                stored = {
                  vinted: args.p_vinted,
                  ebay: args.p_ebay,
                  kleinanzeigen: args.p_kleinanzeigen,
                };
                return { data: stored, error: null };
              },
            },
          },
        },
      ],
    }).get(MarketplaceSettingsService);
  }
  beforeEach(async () => {
    stored = null;
    service = createService();
    await service.load('test-user', 'test-workspace');
  });
  it('initialisiert alle Marktplätze standardmäßig als aktiv', () => {
    expect(service.settings()).toEqual({ vinted: true, ebay: true, kleinanzeigen: true });
    expect(service.activeCount()).toBe(3);
    expect(service.isMarketplaceEnabled('vinted')).toBe(true);
  });
  it('stellt die gespeicherte persönliche Auswahl nach erneutem Laden wieder her', async () => {
    await service.setMarketplaceEnabled('vinted', false);
    expect(service.isVintedEnabled()).toBe(false);
    expect(service.activeCount()).toBe(2);
    const reopened = createService();
    await reopened.load('test-user', 'test-workspace');
    expect(reopened.isVintedEnabled()).toBe(false);
    expect(reopened.isEbayEnabled()).toBe(true);
  });
  it('toggelt Marktplätze per toggleMarketplace', async () => {
    await service.toggleMarketplace('ebay');
    expect(service.isEbayEnabled()).toBe(false);
    await service.toggleMarketplace('ebay');
    expect(service.isEbayEnabled()).toBe(true);
  });
});
