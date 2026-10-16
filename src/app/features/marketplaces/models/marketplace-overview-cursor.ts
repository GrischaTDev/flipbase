import type {
  MarketplaceOverviewAccount,
  MarketplaceListingQuery,
} from './marketplace-overview.models';
import { overviewAccountKey } from './marketplace-overview-normalization';
type CursorScope = Pick<MarketplaceOverviewAccount, 'platform' | 'workspaceId' | 'connectionId'>;
export function createOverviewCursor(
  scope: CursorScope,
  query: MarketplaceListingQuery,
  payload: Readonly<Record<string, unknown>>,
): string {
  return encodeURIComponent(
    JSON.stringify({
      scope: overviewAccountKey(scope),
      query: JSON.stringify([query.state, query.search.trim(), query.limit]),
      payload,
    }),
  );
}
export function readOverviewCursor(
  value: string | undefined,
  scope: CursorScope,
  query: MarketplaceListingQuery,
): Record<string, unknown> | null {
  if (!value) return null;
  try {
    if (value.length > 4096) throw new Error();
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const row = parsed as Record<string, unknown>;
    if (
      row['scope'] !== overviewAccountKey(scope) ||
      row['query'] !== JSON.stringify([query.state, query.search.trim(), query.limit]) ||
      !row['payload'] ||
      typeof row['payload'] !== 'object' ||
      Array.isArray(row['payload'])
    )
      throw new Error();
    return row['payload'] as Record<string, unknown>;
  } catch {
    throw new Error(
      'Diese Inseratseite gehört nicht zur aktuellen Auswahl. Lade die Liste erneut.',
    );
  }
}
