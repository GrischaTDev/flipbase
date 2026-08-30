import type { MarketplaceListing } from '../domain/listing.js';
import type { VintedItem } from './schema.js';

function toIsoOrNull(timestamp: number | null | undefined): string | null {
  return typeof timestamp === 'number' ? new Date(timestamp * 1000).toISOString() : null;
}

/**
 * Diese Funktion ist der Datenschutzriegel des Dienstes: Nur die hier
 * aufgefuehrten Felder verlassen die Vinted-Antwort. Alles andere - Name,
 * Kennung, Profiladresse und Profilfoto des Verkaeufers - bleibt zurueck.
 */
export function normalizeVintedItem(item: VintedItem): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId: String(item.id),
    title: item.title,
    url: item.url,
    imageUrl: item.photo?.url ?? null,
    price: {
      amount: Number(item.total_item_price.amount),
      currency: item.total_item_price.currency_code,
    },
    brand: item.brand_title ?? null,
    size: item.size_title ?? null,
    condition: item.status ?? null,
    photoUploadedAt: toIsoOrNull(item.photo?.high_resolution?.timestamp),
  };
}
