export interface Money {
  amount: number;
  currency: string;
}

/**
 * Angaben zum Verkaeufer.
 *
 * Bis zum 02.09.2026 verwarf der Normalizer jedes Verkaeuferfeld. Aufgenommen
 * sind jetzt genau die vier, die bei der Kaufentscheidung helfen - Kennung und
 * Profiladresse bleiben weiterhin draussen.
 *
 * `rating` und `reviewCount` liefert der Katalog nicht; sie stehen nur auf der
 * Detailseite. Bis Etappe 2 sie fuer Treffer nachlaedt, bleiben sie null.
 */
export interface MarketplaceSeller {
  name: string | null;
  avatarUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
}

/** Plattformunabhaengige Sicht auf ein Angebot. */
export interface MarketplaceListing {
  marketplace: 'vinted';
  externalId: string;
  title: string;
  url: string;
  /** Nur auf der Detailseite verfuegbar, im Katalog nicht. */
  description: string | null;
  /** Alle Bilder in Katalogreihenfolge; das Hauptbild steht vorn. */
  imageUrls: string[];
  /** Reiner Artikelpreis - die Basis fuer jede Margenrechnung. */
  itemPrice: Money;
  /** Gesamtpreis inklusive Kaeuferschutz - der Betrag, der abgebucht wird. */
  totalPrice: Money;
  brand: string | null;
  size: string | null;
  condition: string | null;
  /** Zwei Buchstaben. Nur auf der Detailseite verfuegbar. */
  countryCode: string | null;
  seller: MarketplaceSeller;
  /** Solange wahr, zeigt Vinted den Artikel zwar an, laesst ihn aber nicht kaufen. */
  isHidden: boolean;
  /** Wann Vinted den Artikel zuletzt aktualisiert hat. Nur auf der Detailseite. */
  itemUpdatedAt: string | null;
  /** Naeherung fuer das Alter. Das Foto wird vor dem Absenden hochgeladen. */
  photoUploadedAt: string | null;
}
