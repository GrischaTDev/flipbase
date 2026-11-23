export interface PersonalFeed {
  id: string;
  workspace_id: string;
  title: string;
  catalog_id: number | null;
  brand: string | null;
  search_text: string | null;
  price_from: number | null;
  price_to: number | null;
  condition: string | null;
  brand_id: number | null;
  audience: string | null;
  sizes: string[];
  is_active: boolean;
  started_at: string | null;
}

export type PersonalFeedDraft = Omit<
  PersonalFeed,
  'id' | 'workspace_id' | 'is_active' | 'started_at'
> & {
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
  watchlist: string;
  afterTime?: string;
}
export const FEED_ITEM_LIMIT = 100;
export const FEED_WINDOW_MS = 10 * 60_000;

export function recentFeedItems(items: readonly FeedItem[], now: number): FeedItem[] {
  return items
    .filter(({ first_seen_at }) => Date.parse(first_seen_at) > now - FEED_WINDOW_MS)
    .slice(0, FEED_ITEM_LIMIT);
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

export function feedSizeLabels(sizes: readonly string[]): string {
  return sizes
    .flatMap((size) => FEED_CLOTHING_SIZES.find((option) => option.value === size)?.label ?? [])
    .join(' · ');
}

/**
 * Bildet einen Vinted-Größentitel wie „M / 38 / 10“, „XXXL“ oder „3XL“ auf eine
 * Feed-Größe ab. Unbekannte Angaben ergeben null.
 */
export function feedSizeFromVintedTitle(title: string): string | null {
  const letters = (title.split('/')[0] ?? '').replace(/\s+/g, '').replace(/\+$/, '').toUpperCase();
  if (letters === 'XS' || letters === 'S' || letters === 'M' || letters === 'L') {
    return letters.toLowerCase();
  }
  const numbered = /^([1-9])XL$/.exec(letters);
  const repeated = /^(X+)L$/.exec(letters);
  const xCount = numbered ? Number(numbered[1]) : repeated ? repeated[1].length : 0;
  if (xCount === 1) return 'xl';
  if (xCount === 2) return 'xxl';
  if (xCount >= 3) return '3xl';
  return null;
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
