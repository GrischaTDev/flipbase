import type { CloudBrowserHandle } from './gologin-cloud-browser.ts';
import { chromiumAccountProfileIdPattern } from './chromium-account-profile-registry.ts';

interface BrowserProvider {
  open(profileId: string): Promise<CloudBrowserHandle>;
  stop(profileId: string): Promise<void>;
}

/** Auch Recovery verwendet die kopierte Sitzungsreferenz statt der aktuellen Kontokonfiguration. */
export class MarketplaceProfileBrowser {
  private readonly providers: { chromium: BrowserProvider; goLogin?: BrowserProvider };
  constructor(providers: { chromium: BrowserProvider; goLogin?: BrowserProvider }) {
    this.providers = providers;
  }
  async open(profileId: string): Promise<CloudBrowserHandle> {
    return this.provider(profileId).open(profileId);
  }
  async stop(profileId: string): Promise<void> {
    return this.provider(profileId).stop(profileId);
  }
  private provider(profileId: string): BrowserProvider {
    if (profileId.toLowerCase().startsWith('chromium_')) {
      if (!chromiumAccountProfileIdPattern.test(profileId))
        throw new Error('Ungültige Chromiumprofilreferenz');
      return this.providers.chromium;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId))
      throw new Error('Ungültige Browserprofilreferenz');
    if (!this.providers.goLogin)
      throw new Error('GoLogin für bestehende Sitzungen nicht konfiguriert');
    return this.providers.goLogin;
  }
}
