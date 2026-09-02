import type { SupabaseClient } from '@supabase/supabase-js';

import type { MarketplaceListing } from '../domain/listing.js';

export class ListingStore {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Schreibt alle uebergebenen Angebote und liefert ausschliesslich die
   * zurueck, die wirklich neu waren.
   *
   * `ignoreDuplicates` erledigt die Deduplizierung in der Datenbank, ohne
   * vorher eine Leseabfrage zu brauchen: Bereits bekannte Artikel werden weder
   * geschrieben noch zurueckgemeldet. Der erste Fund gewinnt damit, und
   * `first_seen_at` bleibt der Zeitpunkt, zu dem das Angebot wirklich zum
   * ersten Mal auftauchte - die Zahl, an der spaeter haengt, wie schnell der
   * Dienst war.
   *
   * Preisaenderungen eines bekannten Artikels bleiben dadurch unsichtbar. Das
   * ist Absicht: Eine Preishistorie ist ein eigenes Merkmal mit eigener
   * Tabelle und gehoert nicht in den Sammelpfad.
   */
  async saveNew(
    listings: MarketplaceListing[],
    discoveredByQueryId: string,
  ): Promise<MarketplaceListing[]> {
    if (listings.length === 0) {
      return [];
    }

    const rows = listings.map((listing) => ({
      marketplace: listing.marketplace,
      external_id: listing.externalId,
      title: listing.title,
      url: listing.url,
      description: listing.description,
      image_urls: listing.imageUrls,
      item_price: listing.itemPrice.amount,
      total_price: listing.totalPrice.amount,
      currency: listing.totalPrice.currency,
      brand: listing.brand,
      size: listing.size,
      condition: listing.condition,
      country_code: listing.countryCode,
      seller_name: listing.seller.name,
      seller_avatar_url: listing.seller.avatarUrl,
      seller_rating: listing.seller.rating,
      seller_review_count: listing.seller.reviewCount,
      is_hidden: listing.isHidden,
      item_updated_at: listing.itemUpdatedAt,
      photo_uploaded_at: listing.photoUploadedAt,
      discovered_by_query_id: discoveredByQueryId,
    }));

    const { data, error } = await this.client
      .from('sniper_listings')
      .upsert(rows, { onConflict: 'marketplace,external_id', ignoreDuplicates: true })
      .select('external_id');

    if (error) {
      throw new Error(`saving listings failed: ${error.message}`);
    }

    const createdIds = new Set((data ?? []).map((row) => row.external_id as string));
    return listings.filter((listing) => createdIds.has(listing.externalId));
  }
}
