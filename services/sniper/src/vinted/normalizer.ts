import type { MarketplaceListing } from '../domain/listing.js';
import type { VintedItem } from './schema.js';

function toIsoOrNull(timestamp: number | null | undefined): string | null {
  return typeof timestamp === 'number' ? new Date(timestamp * 1000).toISOString() : null;
}

/**
 * Bilder in Katalogreihenfolge, Hauptbild zuerst.
 *
 * Vinted markiert genau ein Foto mit `is_main`, garantiert aber nicht, dass es
 * an erster Stelle steht. Ein einzelnes Foto zeigt Maengel oft nicht - deshalb
 * kommen alle mit, nicht nur das erste.
 */
function collectImageUrls(item: VintedItem): string[] {
  const fromList = (item.photos ?? [])
    .filter((photo) => typeof photo.url === 'string' && photo.url.length > 0)
    .sort((left, right) => Number(right.is_main ?? false) - Number(left.is_main ?? false))
    .map((photo) => photo.url as string);

  if (fromList.length > 0) {
    return fromList;
  }

  // Aeltere Antworten liefern nur das einzelne `photo`-Feld.
  return typeof item.photo?.url === 'string' && item.photo.url.length > 0 ? [item.photo.url] : [];
}

/**
 * Diese Funktion bleibt der Datenschutzriegel des Dienstes: Nur die hier
 * aufgefuehrten Felder verlassen die Vinted-Antwort.
 *
 * Seit dem 02.09.2026 gehoeren Verkaeufername und Profilbild dazu. Nicht
 * aufgenommen sind weiterhin die Kennung des Verkaeufers und seine
 * Profiladresse - beide identifizieren eine Person, ohne bei der
 * Kaufentscheidung zu helfen.
 */
export function normalizeVintedItem(item: VintedItem): MarketplaceListing {
  // Faellt price aus, ist der Gesamtpreis die einzige belastbare Zahl. Lieber
  // beide gleich als eine erfundene Aufteilung.
  const itemPriceSource = item.price ?? item.total_item_price;

  return {
    marketplace: 'vinted',
    externalId: String(item.id),
    title: item.title,
    url: item.url,
    description: null,
    imageUrls: collectImageUrls(item),
    itemPrice: {
      amount: Number(itemPriceSource.amount),
      currency: itemPriceSource.currency_code,
    },
    totalPrice: {
      amount: Number(item.total_item_price.amount),
      currency: item.total_item_price.currency_code,
    },
    brand: item.brand_title ?? null,
    size: item.size_title ?? null,
    condition: item.status ?? null,
    countryCode: null,
    seller: {
      name: item.user?.login ?? null,
      avatarUrl: item.user?.photo?.url ?? null,
      rating: null,
      reviewCount: null,
    },
    // Fehlt die Angabe, gilt der Artikel als sichtbar - sonst wuerde ein
    // fehlendes Feld jeden Fund als unkaufbar ausweisen.
    isHidden: item.is_visible === false,
    itemUpdatedAt: null,
    photoUploadedAt: toIsoOrNull(item.photo?.high_resolution?.timestamp),
  };
}
