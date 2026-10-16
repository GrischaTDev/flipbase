import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import { Injectable, inject } from '@angular/core';
import type { MarketplaceId } from '../../../core/services/marketplace-settings.service';
import type {
  MarketplaceOverviewAccount,
  MarketplaceOverviewPage,
  MarketplaceListingQuery,
} from '../models/marketplace-overview.models';
import { normalizeEbayListing } from '../models/marketplace-overview-normalization';
import { createOverviewCursor, readOverviewCursor } from '../models/marketplace-overview-cursor';
import { MarketplaceApiService } from './marketplace-api.service';
import { EbayAccountApiService } from './ebay-account-api.service';

@Injectable({ providedIn: 'root' })
export class MarketplaceOverviewService {
  private readonly vinted = inject(MarketplaceApiService);
  private readonly ebay = inject(EbayAccountApiService);
  private readonly kleinanzeigen = inject(KleinanzeigenAccountService);

  async loadAccounts(
    workspaceId: string,
    platform: MarketplaceId,
  ): Promise<readonly MarketplaceOverviewAccount[]> {
    if (platform === 'kleinanzeigen') {
      const result = await this.kleinanzeigen.readAccounts(workspaceId);
      return result.accounts.map((account) => ({
        platform,
        ...account,
        observedAt: account.lastSyncedAt,
        completeness: account.lastSyncedAt ? 'complete' : 'unknown',
        supportsSearch: true,
        supportsStatus: true,
        canEdit: false,
        error:
          account.sync?.state === 'failed'
            ? 'Der letzte Abruf wurde abgebrochen. Du siehst den zuletzt vollständig bestätigten Bestand.'
            : null,
      }));
    }
    if (platform === 'ebay') {
      const status = await this.ebay.loadStatus(workspaceId);
      const connection = status.connection;
      if (!connection) return [];
      return [
        {
          platform,
          ...connection,
          displayName: connection.username ?? 'eBay-Konto',
          activeCount: null,
          listingCount: null,
          observedAt: connection.lastReadAt,
          completeness: 'unknown',
          supportsSearch: false,
          supportsStatus: false,
          canEdit: status.listingManagementAvailable === true,
          error: null,
        },
      ];
    }
    if (!(await this.vinted.canManage(workspaceId))) return [];
    const result = await this.vinted.listConnections(workspaceId);
    if (!result.canManage) return [];
    return Promise.all(
      result.connections
        .filter((connection) => connection.marketplace === 'vinted')
        .map(async (connection): Promise<MarketplaceOverviewAccount> => {
          const base: MarketplaceOverviewAccount = {
            platform: 'vinted',
            ...connection,
            activeCount: null,
            listingCount: null,
            observedAt: connection.lastSyncedAt,
            completeness: 'unknown',
            supportsSearch: true,
            supportsStatus: true,
            canEdit: false,
            error: null,
          };
          try {
            const preview = await this.vinted.readAccountPreview(connection);
            return {
              ...base,
              listingCount: connection.lastSyncedAt ? preview.publicationCount : null,
              completeness: connection.lastSyncedAt ? 'partial' : 'unknown',
            };
          } catch {
            return {
              ...base,
              error: 'Die gespeicherten Inseratzahlen konnten nicht geladen werden.',
            };
          }
        }),
    );
  }

  async loadListings(
    account: MarketplaceOverviewAccount,
    query: MarketplaceListingQuery,
  ): Promise<MarketplaceOverviewPage> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)
      throw new Error('Ungültige Seitengröße.');
    if (!['all', 'active', 'reserved', 'ended'].includes(query.state))
      throw new Error('Ungültige Inseratauswahl.');
    if (query.search.length > 200)
      throw new Error('Die Suche darf höchstens 200 Zeichen enthalten.');
    if (account.platform === 'vinted') return this.vinted.readOverviewPublications(account, query);
    if (account.platform === 'kleinanzeigen') return this.kleinanzeigen.readPage(account, query);
    if (query.search.trim() || query.state !== 'all')
      throw new Error('Diese Filter stehen für eBay noch nicht zur Verfügung.');
    const cursor = readOverviewCursor(query.cursor, account, query);
    const page = cursor?.['page'] ?? 1;
    const offset = cursor?.['offset'] ?? 0;
    if (
      typeof page !== 'number' ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      typeof offset !== 'number' ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= 200
    )
      throw new Error('Ungültige Inseratseite.');
    const result = await this.ebay.loadListings(account, page);
    const items = result.items.slice(offset, offset + query.limit).map((listing) => {
      const item = normalizeEbayListing(account, listing);
      return account.canEdit && !listing.hasVariations
        ? {
            ...item,
            actions: [...item.actions, 'edit' as const],
            editLink: ['/marketplaces/ebay/listings', listing.id, 'edit'],
          }
        : item;
    });
    const moreInPage = offset + query.limit < result.items.length;
    const nextCursor = moreInPage
      ? createOverviewCursor(account, query, { page, offset: offset + query.limit })
      : result.nextPage
        ? createOverviewCursor(account, query, { page: result.nextPage, offset: 0 })
        : null;
    return { items, total: result.total, nextCursor, completeness: 'complete' };
  }
}
