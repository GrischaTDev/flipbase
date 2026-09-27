import { FeedItem, safeVintedLink } from '../models/deal-monitor.model';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

export async function shareVintedListing(item: FeedItem): Promise<ShareResult> {
  const url = safeVintedLink(item.url);
  if (!url) return 'unavailable';

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: item.title, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (!navigator.clipboard?.writeText) return 'unavailable';
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
