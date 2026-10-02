import type { CloudBrowserHandle } from './gologin-cloud-browser.ts';
import {
  chromiumAccountProfileIdPattern,
  type ChromiumAccountProfileRegistry,
} from './chromium-account-profile-registry.ts';

interface BrowserProvider {
  open(profileId: string): Promise<CloudBrowserHandle>;
  stop(profileId: string): Promise<void>;
}

interface BrowserProviders {
  chromium: BrowserProvider;
  chromiumRegistry: Pick<ChromiumAccountProfileRegistry, 'resolve'>;
  goLogin?: BrowserProvider;
}

/** Auch Recovery verwendet die kopierte Sitzungsreferenz statt der aktuellen Kontokonfiguration. */
export class MarketplaceProfileBrowser {
  private readonly providers: BrowserProviders;
  constructor(providers: BrowserProviders) {
    this.providers = providers;
  }
  async open(profileId: string): Promise<CloudBrowserHandle> {
    return (await this.resolveProvider(profileId)).open(profileId);
  }
  async stop(profileId: string): Promise<void> {
    return (await this.resolveProvider(profileId)).stop(profileId);
  }
  private async resolveProvider(profileId: string): Promise<BrowserProvider> {
    if (profileId.toLowerCase().startsWith('chromium_')) {
      if (!chromiumAccountProfileIdPattern.test(profileId))
        throw new Error('Ungültige Chromiumprofilreferenz');
      // Ohne Hostnachweis darf Recovery eine fremde Sitzung nicht freigeben.
      await this.providers.chromiumRegistry.resolve(profileId);
      return this.providers.chromium;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId))
      throw new Error('Ungültige Browserprofilreferenz');
    if (!this.providers.goLogin)
      throw new Error('GoLogin für bestehende Sitzungen nicht konfiguriert');
    return this.providers.goLogin;
  }
}
