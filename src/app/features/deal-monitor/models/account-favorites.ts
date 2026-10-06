import { FeedItem, safeVintedImage } from './deal-monitor.model';

/** Die externe Kennung bleibt auch erhalten, wenn ein Feed-Eintrag neu eingelesen wird. */
export function favoriteIdentity(item: Pick<FeedItem, 'url'>): string | null {
  try {
    const url = new URL(item.url);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'www.vinted.de' ||
      url.username ||
      url.password
    )
      return null;
    return /^\/items\/([0-9]{1,30})(?:-|\/|$)/u.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Altbestände werden wie Serverantworten geprüft, niemals ungeprüft als FeedItem verwendet. */
export function readFavoriteItem(value: unknown): FeedItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row['id'] !== 'string' ||
    typeof row['title'] !== 'string' ||
    typeof row['url'] !== 'string' ||
    !favoriteIdentity({ url: row['url'] }) ||
    typeof row['currency'] !== 'string' ||
    typeof row['first_seen_at'] !== 'string' ||
    !Number.isFinite(Date.parse(row['first_seen_at'])) ||
    typeof row['item_price'] !== 'number' ||
    !Number.isFinite(row['item_price']) ||
    row['item_price'] < 0 ||
    typeof row['total_price'] !== 'number' ||
    !Number.isFinite(row['total_price']) ||
    row['total_price'] < 0 ||
    !Array.isArray(row['image_urls'])
  )
    return null;
  const text = (key: string) => (typeof row[key] === 'string' ? row[key] : null);
  const number = (key: string) =>
    typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : null;
  return {
    id: row['id'],
    title: row['title'],
    url: row['url'],
    currency: row['currency'],
    first_seen_at: row['first_seen_at'],
    item_price: row['item_price'],
    total_price: row['total_price'],
    image_urls: row['image_urls'].filter(
      (url): url is string => typeof url === 'string' && !!safeVintedImage(url),
    ),
    brand: text('brand'),
    size: text('size'),
    condition: text('condition'),
    catalog_id: number('catalog_id'),
    category_path: text('category_path'),
    reference_price: number('reference_price'),
    reference_scope: text('reference_scope'),
    discount_percent: number('discount_percent'),
    watchlist_title: text('watchlist_title'),
    is_hidden: row['is_hidden'] === true,
  };
}
