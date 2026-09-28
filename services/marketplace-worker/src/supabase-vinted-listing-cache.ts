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
}
