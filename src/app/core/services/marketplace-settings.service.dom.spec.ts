import { beforeEach, describe, expect, it } from 'vitest';
import { MarketplaceSettingsService } from './marketplace-settings.service';

describe('MarketplaceSettingsService', () => {
  let service: MarketplaceSettingsService;

  beforeEach(() => {
    localStorage.clear();
    service = new MarketplaceSettingsService();
  });

  it('initialisiert alle Marktplätze standardmäßig als aktiv', () => {
    expect(service.settings()).toEqual({
      vinted: true,
      ebay: true,
      kleinanzeigen: true,
    });
    expect(service.activeCount()).toBe(3);
    expect(service.isMarketplaceEnabled('vinted')).toBe(true);
    expect(service.isMarketplaceEnabled('ebay')).toBe(true);
    expect(service.isMarketplaceEnabled('kleinanzeigen')).toBe(true);
  });

  it('schaltet Marktplätze einzeln ein und aus und persistiert die Einstellung', () => {
    service.setMarketplaceEnabled('vinted', false);
    expect(service.isVintedEnabled()).toBe(false);
    expect(service.isMarketplaceEnabled('vinted')).toBe(false);
    expect(service.activeCount()).toBe(2);

    // Neu instanziieren, um LocalStorage-Lesen zu verifizieren
    const newServiceInstance = new MarketplaceSettingsService();
    expect(newServiceInstance.isVintedEnabled()).toBe(false);
    expect(newServiceInstance.isEbayEnabled()).toBe(true);
  });

  it('toggelt Marktplätze per toggleMarketplace', () => {
    service.toggleMarketplace('ebay');
    expect(service.isEbayEnabled()).toBe(false);

    service.toggleMarketplace('ebay');
    expect(service.isEbayEnabled()).toBe(true);
  });
});
