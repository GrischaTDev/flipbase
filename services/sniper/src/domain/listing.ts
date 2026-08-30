export interface Money {
  amount: number;
  currency: string;
}

/**
 * Plattformunabhaengige Sicht auf ein Angebot. Bewusst ohne jedes Verkaeuferfeld:
 * der Katalog liefert Name, Profiladresse und Profilfoto mit, all das wird im
 * Normalizer verworfen und erreicht dieses Modell nie.
 */
export interface MarketplaceListing {
  marketplace: 'vinted';
  externalId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  /** Gesamtpreis inklusive Kaeuferschutz, nicht der reine Artikelpreis. */
  price: Money;
  brand: string | null;
  size: string | null;
  condition: string | null;
  /** Naeherung fuer das Alter. Das Foto wird vor dem Absenden hochgeladen. */
  photoUploadedAt: string | null;
}
