import { record } from './analysis.ts';
import type { ListingAttribute, ResearchListing } from './research.ts';

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

/** Liest ausschließlich Fotos, Beschreibung und Artikelmerkmale des angefragten Inserats. */
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
  const attributes = new Map<string, ListingAttribute>();
  let categoryId: string | null = null;
  let categoryPath: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 60 || value === null || typeof value !== 'object') return;
    const entry = record(value);
    if (entry && String(entry['item_id'] ?? entry['itemId'] ?? entry['id']) === itemId) {
      if (typeof entry['description'] === 'string')
        description = entry['description'].slice(0, 5000);
      const catalogId = entry['catalog_id'];
      if (
        (typeof catalogId === 'string' || typeof catalogId === 'number') &&
        /^\d{1,20}$/.test(String(catalogId))
      )
        categoryId = String(catalogId);
      if (Array.isArray(entry['breadcrumbs'])) {
        const path = entry['breadcrumbs'].slice(0, 20).flatMap((value) => {
          const crumb = record(value);
          // Markenfilter am Ende der Breadcrumbs sind keine zusätzliche Kategorie.
          if (
            typeof crumb?.['title'] !== 'string' ||
            typeof crumb['url'] !== 'string' ||
            !/^\/catalog\/\d+(?:-[^/?#]+)?$/.test(crumb['url'])
          )
            return [];
          const title = crumb['title'].trim().slice(0, 200);
          return title ? [title] : [];
        });
        if (path.length > categoryPath.length) categoryPath = path;
      }
      if (Array.isArray(entry['attributes'])) {
        for (const value of entry['attributes'].slice(0, 64)) {
          const attribute = record(value);
          const data = record(attribute?.['data']);
          if (typeof attribute?.['code'] !== 'string' || typeof data?.['title'] !== 'string')
            continue;
          const code = attribute['code'].trim().slice(0, 100);
          const label = data['title'].trim().slice(0, 200);
          const rawValue = data['value'];
          const values = Array.isArray(rawValue) ? rawValue : [rawValue];
          if (
            !values.length ||
            !values.every(
              (item) =>
                typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)),
            )
          )
            continue;
          const text = values.map(String).join(', ').trim().slice(0, 2000);
          // Relative Altersangaben sind keine Produkteigenschaft und würden den Cache stündlich ändern.
          if (!code || code === 'upload_date' || !label || !text) continue;
          attributes.set(JSON.stringify([code, label, text]), { code, label, value: text });
        }
      }
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
  return {
    image_urls: photos,
    description,
    attributes: [...attributes.values()],
    category: categoryId || categoryPath.length ? { id: categoryId, path: categoryPath } : null,
  };
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
    const attributeValue = (...codes: string[]) => {
      const values = details.attributes
        .filter((attribute) => codes.includes(attribute.code))
        .map((attribute) => attribute.value);
      return values.length ? [...new Set(values)].join(', ') : null;
    };
    return {
      ...listing,
      ...details,
      description: details.description ?? listing.description,
      brand: attributeValue('brand') ?? listing.brand,
      size: attributeValue('size') ?? listing.size,
      condition: attributeValue('status', 'condition') ?? listing.condition,
      detailsStatus: 'loaded',
    };
  } catch {
    return { ...listing, detailsStatus: 'unavailable' };
  }
}
