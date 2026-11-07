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

export function visitListingPayload(
  html: string,
  onRecord: (entry: Record<string, unknown>) => void,
) {
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
  const visit = (value: unknown, depth = 0) => {
    if (depth > 60 || value === null || typeof value !== 'object') return;
    const entry = record(value);
    if (entry) onRecord(entry);
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
}

/** Die Uploadangabe bleibt von stabilen Produkteigenschaften und deren Cache getrennt. */
export function parseListingPublicationLabel(html: string, itemId: string): string | null {
  const labels = new Set<string>();
  visitListingPayload(html, (entry) => {
    if (String(entry['item_id'] ?? entry['itemId'] ?? entry['id']) !== itemId) return;
    if (!Array.isArray(entry['attributes'])) return;
    for (const value of entry['attributes'].slice(0, 64)) {
      const attribute = record(value);
      const label = record(attribute?.['data'])?.['value'];
      if (attribute?.['code'] === 'upload_date' && typeof label === 'string') {
        const text = label.trim().slice(0, 200);
        if (text) labels.add(text);
      }
    }
  });
  // Widersprüchliche Angaben im selben Dokument begründen keine Zeitstatistik.
  return labels.size === 1 ? [...labels][0] : null;
}

function euroPrice(value: unknown): number | null {
  const money = record(value);
  const currency = money?.['currency_code'] ?? money?.['currencyCode'];
  const amount = money?.['amount'];
  if (
    currency !== 'EUR' ||
    (typeof amount !== 'number' &&
      (typeof amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount)))
  )
    return null;
  const number = Number(amount);
  return Number.isFinite(number) && number > 0 && number <= 100_000 ? number : null;
}

/** Liest ausschließlich Produktdaten des angefragten Inserats, keine Abschnittsüberschriften. */
export function parseListingDetails(html: string, itemId: string) {
  let photos: string[] = [];
  let description: string | null = null;
  const titles = new Set<string>();
  const itemPrices = new Set<number>();
  const totalPrices = new Set<number>();
  const attributes = new Map<string, ListingAttribute>();
  let categoryId: string | null = null;
  let categoryPath: string[] = [];
  visitListingPayload(html, (entry) => {
    if (String(entry['item_id'] ?? entry['itemId'] ?? entry['id']) !== itemId) return;
    // Auch „Ähnliche Artikel“ und „Verkauft“ tragen dieselbe item_id. Nur der
    // eigentliche Produktdatensatz besitzt gleichzeitig Fotos und ein Preisfeld.
    if (Array.isArray(entry['photos']) && Object.hasOwn(entry, 'price')) {
      if (typeof entry['title'] === 'string') {
        const title = entry['title'].trim().slice(0, 500);
        if (title) titles.add(title);
      }
      const price = euroPrice(entry['price']);
      if (price !== null) {
        itemPrices.add(price);
        const total = euroPrice(
          entry['totalItemPrice'] ?? entry['total_item_price'] ?? entry['total_price'],
        );
        // Einzel- und Gesamtpreis müssen aus demselben Produktdatensatz stammen.
        if (total !== null && total >= price) totalPrices.add(total);
      }
    }
    if (typeof entry['description'] === 'string') description = entry['description'].slice(0, 5000);
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
  });
  if (!photos.length) throw new Error('listing_details_missing');
  return {
    image_urls: photos,
    description,
    ...(titles.size === 1 ? { title: [...titles][0] } : {}),
    ...(itemPrices.size === 1
      ? {
          item_price: [...itemPrices][0],
          currency: 'EUR' as const,
          ...(totalPrices.size
            ? { total_price: totalPrices.size === 1 ? [...totalPrices][0] : null }
            : {}),
        }
      : {}),
    attributes: [...attributes.values()],
    category: categoryId || categoryPath.length ? { id: categoryId, path: categoryPath } : null,
  };
}

export function vintedListingUrl(value: unknown): { url: URL; itemId: string } | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    const itemId = /^\/items\/(\d{1,20})(?:-[^/]*)?$/.exec(url.pathname)?.[1];
    if (url.origin !== 'https://www.vinted.de' || url.username || url.password || !itemId)
      return null;
    url.search = '';
    url.hash = '';
    return { url, itemId };
  } catch {
    return null;
  }
}

/** Öffentliche Inseratseite mit fester Herkunft, Zeit- und Größenbegrenzung. */
export async function readVintedListingPage(value: unknown, signal: AbortSignal) {
  const target = vintedListingUrl(value);
  if (!target) throw new Error('invalid_listing_url');
  const html = await readVintedHtml(target.url, signal);
  return { html, itemId: target.itemId };
}

export async function readVintedHtml(
  url: URL,
  signal: AbortSignal,
  maxBytes = 3_000_000,
): Promise<string> {
  if (
    url.origin !== 'https://www.vinted.de' ||
    url.username ||
    url.password ||
    (url.pathname !== '/catalog' && !vintedListingUrl(url.href)) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 8_000_000
  )
    throw new Error('invalid_listing_url');
  const response = await fetch(url, { redirect: 'error', signal });
  if (!response.ok) throw new Error('listing_unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('listing_unavailable');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('listing_too_large');
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
  return new TextDecoder().decode(bytes);
}

export async function loadListingDetails(listing: ResearchListing): Promise<ResearchListing> {
  try {
    const { html, itemId } = await readVintedListingPage(listing.url, AbortSignal.timeout(7000));
    const details = parseListingDetails(html, itemId);
    const itemPrice = details.item_price ?? listing.item_price;
    const currency = details.currency ?? listing.currency;
    const totalPrice =
      details.total_price !== undefined
        ? details.total_price
        : itemPrice === listing.item_price && currency === listing.currency
          ? listing.total_price
          : null;
    const attributeValue = (...codes: string[]) => {
      const values = details.attributes
        .filter((attribute) => codes.includes(attribute.code))
        .map((attribute) => attribute.value);
      return values.length ? [...new Set(values)].join(', ') : null;
    };
    return {
      ...listing,
      ...details,
      item_price: itemPrice,
      total_price: totalPrice,
      currency,
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
