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

  /**
   * Laesst die Datenbank die Treffer fuer diese Abfrage bilden und liefert die
   * Zahl der neu entstandenen.
   *
   * Gerechnet wird dort und nicht hier, damit die Oberflaeche spaeter dieselbe
   * Zahl sieht wie der Melder - und damit der Median in einer Abfrage entsteht
   * statt in einer Schleife im Dienst.
   *
   * `reportHits = false` haelt den Einlese-Lauf stumm: Die vorgefundenen
   * Angebote werden nur als geprueft vermerkt, damit sie auch spaeter kein
   * Fund mehr werden.
   */
  async evaluateHits(queryId: string, reportHits = true): Promise<number> {
    const { data, error } = await this.client.rpc('sniper_evaluate_hits', {
      p_query_id: queryId,
      p_report_hits: reportHits,
    });

    if (error) {
      throw new Error(`evaluating hits failed: ${error.message}`);
    }

    return typeof data === 'number' ? data : 0;
  }

  async purgeExpired(): Promise<number> {
    const { data, error } = await this.client.rpc('sniper_purge_expired_listings');
    if (error) throw new Error(`purging listings failed: ${error.message}`);
    if (typeof data !== 'number' || !Number.isInteger(data) || data < 0)
      throw new Error('purging listings returned an invalid count');
    return data;
  }
}
