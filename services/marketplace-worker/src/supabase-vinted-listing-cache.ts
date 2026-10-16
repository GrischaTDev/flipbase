import type { VintedListingCurrentContent } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { normalizeVintedTransferSource } from './vinted-transfer-source.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedListingEditFields } from './vinted-browser-listing-edit.ts';

interface ListingCacheOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

/** Schreibt nur bereits vom kontogebundenen Browser gelesene oder bestätigte Werte. */
export class SupabaseVintedListingCache {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: ListingCacheOptions) {
    this.baseUrl = options.url.replace(/\/$/, '');
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async save(
    scope: BrowserSessionScope,
    entryId: string,
    externalId: string,
    fields: VintedListingEditFields,
    confirmed: boolean,
  ): Promise<boolean> {
    const price = Number(fields.price.replace(',', '.'));
    if (
      fields.description.length > 2000 ||
      (confirmed &&
        (!fields.title.trim() ||
          fields.title.length > 120 ||
          !Number.isFinite(price) ||
          price <= 0))
    )
      return false;
    const response = await this.request(
      new URL('/rest/v1/rpc/marketplace_cache_listing_text', this.baseUrl),
      {
        method: 'POST',
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_entry_id: entryId,
          p_external_id: externalId,
          p_text: fields.description,
          p_confirmed: confirmed,
          p_title: confirmed ? fields.title.trim() : null,
          p_price: confirmed ? price : null,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error('Inseratcache nicht verfügbar');
    return (await response.json()) === true;
  }
  async saveTransferSource(
    scope: BrowserSessionScope,
    entryId: string,
    current: VintedListingCurrentContent,
  ): Promise<void> {
    const source = normalizeVintedTransferSource(
      current,
      current.externalAccountId,
      current.externalId,
    );
    const response = await this.request(
      new URL('/rest/v1/rpc/kleinanzeigen_cache_transfer_source', this.baseUrl),
      {
        method: 'POST',
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: 'Bearer ' + this.serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_entry_id: entryId,
          p_user_id: scope.userId,
          p_source: source,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error('Die vollständige Quelle konnte nicht gesichert werden.');
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      Object.keys(result).length !== 2 ||
      !('entryId' in result) ||
      result.entryId !== entryId ||
      !('fingerprint' in result) ||
      typeof result.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(result.fingerprint)
    )
      throw new Error('Die Quellbestätigung ist ungültig.');
  }
}
