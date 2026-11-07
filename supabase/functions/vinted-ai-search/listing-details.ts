import { record } from './analysis.ts';
import type { ResearchListing } from './research.ts';

export function listingImages(images: string[]): string[] {
  return [...new Set(images)]
    .filter((image) => {
      if (image.length > 4096) return false;
      try {
        const url = new URL(image);
        return (
          url.protocol === 'https:' &&
          url.hostname.endsWith('.vinted.net') &&
          !url.username &&
          !url.password &&
          (!url.port || url.port === '443')
        );
      } catch {
        return false;
      }
    })
    .slice(0, 100);
}

/** Liest ausschließlich Fotoliste und Beschreibung des angefragten Inserats. */
export function parseListingDetails(html: string, itemId: string) {
  let stream = '';
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const push = script[1].match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!push) continue;
    try {
      const chunk: unknown = JSON.parse(push[1]);
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === 'string')
        stream += chunk[1];
    } catch {
      // Fremde oder unvollständige Scripts werden niemals ausgeführt.
    }
  }
  let photos: string[] = [];
  let description: string | null = null;
  const visit = (value: unknown, depth = 0) => {
    if (depth > 60 || value === null || typeof value !== 'object') return;
    const entry = record(value);
    if (entry && String(entry['item_id'] ?? entry['itemId'] ?? entry['id']) === itemId) {
      if (typeof entry['description'] === 'string')
        description = entry['description'].slice(0, 5000);
      if (Array.isArray(entry['photos'])) {
        const urls = listingImages(
          entry['photos'].slice(0, 100).flatMap((photo) => {
            const image = record(photo);
            if (typeof image?.['url'] === 'string') return [image['url']];
            return [];
          }),
        );
        if (urls.length > photos.length) photos = urls;
      }
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  for (const line of stream.split('\n')) {
    const payload = line.slice(line.indexOf(':') + 1);
    if (!payload.startsWith('[') && !payload.startsWith('{')) continue;
    try {
      visit(JSON.parse(payload));
    } catch {
      // React enthält neben JSON auch nicht benötigte Referenz-/Textdatensätze.
    }
  }
  if (!photos.length) throw new Error('listing_details_missing');
  return { image_urls: photos, description };
}

export async function loadListingDetails(listing: ResearchListing): Promise<ResearchListing> {
  try {
    const url = new URL(listing.url);
    if (
      url.origin !== 'https://www.vinted.de' ||
      url.username ||
      url.password ||
      !/^\/items\/\d+(?:-[^/]*)?$/.test(url.pathname)
    )
      throw new Error('invalid_listing_url');
    const itemId = /^\/items\/(\d+)/.exec(url.pathname)![1];
    url.search = '';
    url.hash = '';
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error('listing_unavailable');
    // Begrenzt auch gestreamte Antworten ohne Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('listing_unavailable');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 3_000_000) throw new Error('listing_too_large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const details = parseListingDetails(new TextDecoder().decode(bytes), itemId);
    return {
      ...listing,
      ...details,
      description: details.description ?? listing.description,
      detailsStatus: 'loaded',
    };
  } catch {
    return { ...listing, detailsStatus: 'unavailable' };
  }
}
