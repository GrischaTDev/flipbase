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
  legacy_brand_id: number | null;
  audience: string | null;
  sizes: string[];
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
}
export interface FeedPage {
  items: FeedItem[];
  covered: boolean;
  reported_at: string | null;
}
export interface FeedRequest {
  workspace: string;
  watchlist: string | null;
  brand: string | null;
  size: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  sizes?: string[];
  categoryId?: number | null;
  audience?: string | null;
  titleQuery?: string;
  cursor?: { time: string; id: string };
}
export const FEED_CLOTHING_SIZES = [
  { value: 'xs', label: 'XS' },
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
  { value: 'xl', label: 'XL' },
  { value: 'xxl', label: 'XXL' },
  { value: '3xl', label: '3XL+' },
];

export const WATCHLIST_AUDIENCES = [
  { value: null, label: 'Alle Zielgruppen' },
  { value: 'women', label: 'Damen' },
  { value: 'men', label: 'Herren' },
  { value: 'both', label: 'Damen und Herren' },
];

export function watchlistSizeLabels(sizes: readonly string[]): string {
  return sizes
    .flatMap((size) => FEED_CLOTHING_SIZES.find((option) => option.value === size)?.label ?? [])
    .join(' · ');
}

export function feedSizeValues(selection: string): string[] {
  return selection
    .split(' · ')
    .flatMap((label) => FEED_CLOTHING_SIZES.find((option) => option.label === label)?.value ?? []);
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
