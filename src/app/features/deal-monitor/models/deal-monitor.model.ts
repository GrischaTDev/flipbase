export interface Watchlist {
  id: string;
  workspace_id: string;
  title: string;
  catalog_id: number | null;
  brand: string | null;
  search_text: string | null;
  price_from: number | null;
  price_to: number | null;
  condition: string | null;
  discount_threshold_percent: number;
  is_active: boolean;
  legacy_brand_id: number | null;
}

export type WatchlistDraft = Omit<Watchlist, 'id' | 'workspace_id' | 'legacy_brand_id'> & {
  id: string | null;
};
export interface FeedItem {
  id: string;
  title: string;
  url: string;
  image_urls: string[];
  item_price: number;
  total_price: number;
  currency: string;
  brand: string | null;
  size: string | null;
  condition: string | null;
  is_hidden: boolean;
  first_seen_at: string;
  catalog_id: number | null;
  category_path: string | null;
  reference_price: number | null;
  reference_scope: string | null;
  discount_percent: number | null;
  watchlist_title: string | null;
}
export interface FeedPage {
  items: FeedItem[];
  covered: boolean;
  reported_at: string | null;
}
export interface FeedRequest {
  workspace: string;
  watchlist: string | null;
  dealsOnly: boolean;
  cursor?: { time: string; id: string };
}
export interface FeedCategory {
  id: number;
  path: string;
}

export function safeVintedLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'www.vinted.de' &&
      url.pathname.startsWith('/items/')
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function safeVintedImage(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && url.hostname.endsWith('.vinted.net') ? url.href : null;
  } catch {
    return null;
  }
}
