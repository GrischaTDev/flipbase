import { record } from './analysis.ts';
import { readVintedHtml, visitListingPayload, vintedListingUrl } from './listing-details.ts';
import type { ResearchListing } from './research.ts';

export interface CatalogComparison {
  title: string;
  url: string;
  price: number;
  currency: 'EUR';
  brand: string;
  details: string;
}

export function parseComparisonCatalog(
  html: string,
  listing: ResearchListing,
): CatalogComparison[] {
  const candidates = new Map<string, CatalogComparison>();
  const normalizeBrand = (value: string) =>
    value
      .toLowerCase()
      .replace(/\bwip\b/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  const targetBrand = normalizeBrand(listing.brand ?? '');
  const targetId = vintedListingUrl(listing.url)?.itemId;
  visitListingPayload(html, (entry) => {
    if (candidates.size >= 24) return;
    const product = record(entry['productItem']);
    if (!product || typeof product['url'] !== 'string') return;
    let source;
    try {
      source = vintedListingUrl(new URL(product['url'], 'https://www.vinted.de').href);
    } catch {
      return;
    }
    const price = record(product['price']);
    const box = record(product['itemBox']);
    const brand = box?.['firstLine'];
    const amount =
      typeof price?.['amount'] === 'string' || typeof price?.['amount'] === 'number'
        ? Number(price['amount'])
        : NaN;
    if (
      !source ||
      source.itemId === targetId ||
      String(product['id']) !== source.itemId ||
      typeof product['title'] !== 'string' ||
      typeof brand !== 'string' ||
      (targetBrand && normalizeBrand(brand) !== targetBrand) ||
      price?.['currencyCode'] !== 'EUR' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 100000
    )
      return;
    candidates.set(source.itemId, {
      title: product['title'].slice(0, 300),
      url: source.url.href,
      price: amount,
      currency: 'EUR',
      brand: brand.slice(0, 100),
      details: typeof box?.['secondLine'] === 'string' ? box['secondLine'].slice(0, 300) : '',
    });
  });
  return [...candidates.values()];
}

/** Eine frische, gezielte Katalogseite statt einer vollständigen Markensammlung. */
export async function loadComparisonCatalog(
  listing: ResearchListing,
  identity: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ candidates: CatalogComparison[]; limitation: string | null }> {
  const model =
    identity['confidence'] !== 'unknown' && typeof identity['modelName'] === 'string'
      ? identity['modelName'].split(/[,;()]/)[0].trim()
      : '';
  const category = listing.category?.path.at(-1) ?? '';
  const proposed =
    typeof identity['searchQuery'] === 'string' ? identity['searchQuery'].trim().slice(0, 180) : '';
  const subject = proposed || model || category;
  const brand = listing.brand?.trim() ?? '';
  const query = (
    brand && !subject.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${subject}` : subject
  ).slice(0, 180);
  if (
    !query ||
    (!model && !category && (!proposed || proposed.toLowerCase() === brand.toLowerCase()))
  )
    return {
      candidates: [],
      limitation: 'Keine ausreichend konkrete Vinted-Suche aus Modell oder Kategorie ableitbar.',
    };
  const url = new URL('https://www.vinted.de/catalog');
  url.searchParams.set('search_text', query);
  url.searchParams.set('order', 'newest_first');
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '24');
  if (listing.category?.id && /^\d+$/.test(listing.category.id))
    url.searchParams.set('catalog_ids[]', listing.category.id);
  try {
    const html = await readVintedHtml(
      url,
      AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      8_000_000,
    );
    const candidates = parseComparisonCatalog(html, listing);
    return {
      candidates,
      limitation: candidates.length
        ? null
        : 'Die gezielte Vinted-Katalogabfrage lieferte keine auswertbaren Vergleichsartikel.',
    };
  } catch {
    return {
      candidates: [],
      limitation:
        'Der Vinted-Katalog war für diese Abfrage nicht lesbar; zusätzliche Vergleiche stammen aus der Webrecherche.',
    };
  }
}
