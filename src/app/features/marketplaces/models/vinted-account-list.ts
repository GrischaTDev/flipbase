import type { MarketplaceEntry, MarketplacePage } from './marketplace-read.models';
import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError, parseMarketplacePage } from './marketplace-response';

export type VintedAccountListKind =
  'publication' | 'provider_draft' | 'conversation' | 'sale' | 'activity';

export type VintedConversationFilter =
  'all' | 'unread' | 'questions' | 'negotiating' | 'sold' | 'system';

export interface VintedAccountListRequest {
  readonly workspaceId: string;
  readonly kind: VintedAccountListKind;
  readonly cursor?: string;
  readonly query?: string;
  readonly filter?: VintedConversationFilter;
  readonly oldestFirst?: boolean;
  readonly connectionId?: string;
  readonly entryId?: string;
}

export interface VintedAccountListPage extends MarketplacePage<MarketplaceEntry> {
  readonly filterCounts: Partial<Readonly<Record<VintedConversationFilter, number>>>;
}

export function vintedAccountEntryKey(entry: AccountScope & { readonly id: string }): string {
  return JSON.stringify([entry.workspaceId, entry.connectionId, entry.id]);
}

export function parseVintedAccountListPage(
  response: unknown,
  workspaceId: string,
  connectionId?: string,
): VintedAccountListPage {
  if (!response || typeof response !== 'object') throw new MarketplaceResponseError();
  const { items, total, nextCursor, filterCounts } = response as Record<string, unknown>;
  if (
    !Array.isArray(items) ||
    items.length > 50 ||
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < items.length ||
    (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.length === 0)) ||
    !filterCounts ||
    typeof filterCounts !== 'object' ||
    Array.isArray(filterCounts)
  )
    throw new MarketplaceResponseError();

  const parsedItems = items.map((item: unknown): MarketplaceEntry => {
    if (!item || typeof item !== 'object') throw new MarketplaceResponseError();
    const scope = item as Partial<AccountScope>;
    if (
      scope.workspaceId !== workspaceId ||
      typeof scope.connectionId !== 'string' ||
      !scope.connectionId ||
      (connectionId !== undefined && scope.connectionId !== connectionId)
    )
      throw new MarketplaceResponseError();
    const [entry] = parseMarketplacePage(
      { items: [item], total: 1, nextCursor: null },
      { workspaceId, connectionId: scope.connectionId },
    ).items;
    if (!entry) throw new MarketplaceResponseError();
    return entry;
  });
  if (new Set(parsedItems.map(vintedAccountEntryKey)).size !== parsedItems.length)
    throw new MarketplaceResponseError();

  const counts: Partial<Record<VintedConversationFilter, number>> = {};
  const countRecord = filterCounts as Record<string, unknown>;
  for (const filter of ['unread', 'questions', 'negotiating', 'sold', 'system'] as const) {
    const count = countRecord[filter];
    if (count === undefined) continue;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new MarketplaceResponseError();
    counts[filter] = count;
  }
  return { items: parsedItems, total, nextCursor, filterCounts: counts };
}
