import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import { loadMarketplaceListingCategoryPath } from './marketplace-listing-category.ts';
import { VintedEditAccess } from './vinted-edit-access.ts';

interface ListingCategoryAccessOptions {
  readonly url: string;
  readonly publishableKey: string;
  readonly serviceRoleKey: string;
  readonly request?: typeof fetch;
}
/** Die Benutzerrechte binden das Zielkonto; der Server-Schlüssel liest ausschließlich den Kategoriecache. */
export class VintedListingCategoryAccess {
  private readonly accountAccess: VintedEditAccess;
  private readonly options: ListingCategoryAccessOptions;
  constructor(options: ListingCategoryAccessOptions) {
    this.options = options;
    this.accountAccess = new VintedEditAccess({
      url: options.url,
      publishableKey: options.publishableKey,
      fetch: options.request,
    });
  }
  async read(
    scope: BrowserSessionScope,
    categoryId: number,
    authorize: () => Promise<void>,
  ): Promise<{ accountId: string; categoryPath: readonly number[] }> {
    await authorize();
    const target = await this.accountAccess.entry(scope, 'profile');
    const check = async () => {
      await authorize();
      await this.authorize(scope, target.accountId);
      return true;
    };
    const categoryPath = await loadMarketplaceListingCategoryPath(
      {
        url: this.options.url,
        serviceRoleKey: this.options.serviceRoleKey,
        request: this.options.request ?? fetch,
      },
      categoryId,
      check,
    );
    await check();
    return { accountId: target.accountId, categoryPath };
  }
  async authorize(scope: BrowserSessionScope, accountId: string): Promise<void> {
    const current = await this.accountAccess.entry(scope, 'profile');
    if (current.accountId !== accountId || current.externalId !== accountId)
      throw new Error('Die Vinted-Kontozuordnung wurde inzwischen geändert.');
  }
}
