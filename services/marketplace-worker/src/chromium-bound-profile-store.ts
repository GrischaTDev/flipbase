import { chromiumAccountProfileIdPattern } from './chromium-account-profile-registry.ts';
import type { BrowserLease, BrowserSessionScope } from './marketplace-browser-session-broker.ts';

interface BoundProfileStoreOptions {
  profiles: { resolve(lease: BrowserLease): Promise<string> };
  registry: {
    resolve(profileId: string): Promise<{
      profileId: string;
      workspaceId: string;
      connectionId: string;
      networkId?: string;
    }>;
  };
  assertNetwork?: (
    scope: BrowserSessionScope,
  ) => Promise<{ profileId: string; networkId: string } | null>;
}

/** Automatische Abrufe umgehen die manuelle Vorbereitung, deshalb gilt die Bindung bei jedem Start. */
export class ChromiumBoundProfileStore {
  private readonly options: BoundProfileStoreOptions;
  constructor(options: BoundProfileStoreOptions) {
    this.options = options;
  }

  async resolve(lease: BrowserLease): Promise<string> {
    const profileId = await this.options.profiles.resolve(lease);
    const network = await this.options.assertNetwork?.(lease.scope);
    if (network && network.profileId !== profileId)
      throw new Error('Cloudprofilzuordnung wurde geändert');
    if (!profileId.toLowerCase().startsWith('chromium_')) return profileId;
    if (this.options.assertNetwork && !network)
      throw new Error('Cloud-IP muss zuerst über die Kontoeinstellungen eingerichtet werden');
    if (!chromiumAccountProfileIdPattern.test(profileId))
      throw new Error('Ungültige Chromiumprofilreferenz');
    const profile = await this.options.registry.resolve(profileId);
    if (
      profile.profileId !== profileId ||
      profile.workspaceId !== lease.scope.workspaceId ||
      profile.connectionId !== lease.scope.connectionId ||
      (network && profile.networkId !== network.networkId)
    )
      throw new Error('Browserprofil gehört zu einer anderen Verbindung');
    return profileId;
  }
}
