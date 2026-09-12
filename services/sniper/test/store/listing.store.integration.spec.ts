import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createSupabaseClient } from '../../src/store/supabase.js';
import { removeTestRows } from './support/cleanup.js';
import { ListingStore } from '../../src/store/listing.store.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';

const client = createSupabaseClient(loadConfig(process.env));

function listing(externalId: string, overrides: Partial<MarketplaceListing> = {}) {
  return {
    marketplace: 'vinted',
    externalId,
    title: 'Nike Air Max 95',
    url: `https://www.vinted.de/items/${externalId}`,
    description: null,
    imageUrls: ['https://images.example/1.jpg', 'https://images.example/2.jpg'],
    itemPrice: { amount: 45, currency: 'EUR' },
    totalPrice: { amount: 47.95, currency: 'EUR' },
    brand: 'Nike',
    size: '43',
    condition: 'Sehr gut',
    countryCode: null,
    seller: { name: 'seller_0', avatarUrl: null, rating: null, reviewCount: null },
    isHidden: false,
    itemUpdatedAt: null,
    photoUploadedAt: '2026-08-30T08:12:45.000Z',
    ...overrides,
  } satisfies MarketplaceListing;
}

describe('ListingStore', () => {
  afterAll(async () => {
    await removeTestRows(client);
  });

  let queryId: string;
  let store: ListingStore;

  beforeEach(async () => {
    store = new ListingStore(client);
    const { data, error } = await client
      .from('sniper_queries')
      .insert({ query_key: `test|${randomUUID()}`, search_text: 'nike air max' })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    queryId = data!.id as string;
  });

  it('reports every listing as new on first write', async () => {
    const first = randomUUID();
    const second = randomUUID();

    const created = await store.saveNew([listing(first), listing(second)], queryId);

    expect(created.map((item) => item.externalId).sort()).toEqual([first, second].sort());
  });

  it('reports nothing as new on the second write', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    const created = await store.saveNew([listing(externalId)], queryId);

    // Der erste Fund gewinnt. Ohne diese Zusicherung wuerde derselbe Artikel
    // bei jedem Durchlauf erneut als Treffer gemeldet.
    expect(created).toEqual([]);
  });

  it('keeps first_seen_at from the first write', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    const { data: before } = await client
      .from('sniper_listings')
      .select('first_seen_at')
      .eq('external_id', externalId)
      .single();

    await store.saveNew([listing(externalId, { title: 'Geaenderter Titel' })], queryId);

    const { data: after } = await client
      .from('sniper_listings')
      .select('first_seen_at, title')
      .eq('external_id', externalId)
      .single();

    expect(after!.first_seen_at).toBe(before!.first_seen_at);
    expect(after!.title).toBe('Nike Air Max 95');
  });

  it('stores both prices apart and every photo', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    const { data } = await client
      .from('sniper_listings')
      .select('item_price, total_price, currency, condition, image_urls, seller_name, is_hidden')
      .eq('external_id', externalId)
      .single();

    expect(Number(data!.item_price)).toBe(45);
    expect(Number(data!.total_price)).toBe(47.95);
    expect(data!.currency).toBe('EUR');
    expect(data!.condition).toBe('Sehr gut');
    expect(data!.image_urls).toEqual([
      'https://images.example/1.jpg',
      'https://images.example/2.jpg',
    ]);
    expect(data!.seller_name).toBe('seller_0');
    expect(data!.is_hidden).toBe(false);
  });

  it('returns an empty array for an empty input without calling the database', async () => {
    expect(await store.saveNew([], queryId)).toEqual([]);
  });

  it('meldet null Treffer, solange die Gruppe zu klein ist', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    // Ein einziger Fund liegt unter der Mindestzahl von acht - die Datenbank
    // darf daraus keinen Massstab und damit keinen Treffer bilden.
    expect(await store.evaluateHits(queryId)).toBe(0);
  });

  it('laesst ein unbewertbares Angebot fuer die naechste Runde offen', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    await store.evaluateHits(queryId);

    const { data } = await client
      .from('sniper_listings')
      .select('watchlist_evaluated_at')
      .eq('external_id', externalId)
      .single();

    // Ohne Massstab wurde nicht geurteilt - also darf auch nichts abgehakt
    // sein. Sonst verfiele ein Fund allein deshalb, weil er kam, bevor genug
    // Vergleichswerte da waren.
    expect(data!.watchlist_evaluated_at).toBeNull();
  });

  it('hakt den Bestand im Einlese-Lauf ab, ohne zu melden', async () => {
    const externalId = randomUUID();
    await store.saveNew([listing(externalId)], queryId);

    expect(await store.evaluateHits(queryId, false)).toBe(0);

    const { data } = await client
      .from('sniper_listings')
      .select('watchlist_evaluated_at')
      .eq('external_id', externalId)
      .single();

    // Der Einlese-Lauf vermerkt ausdruecklich auch das, was er nicht beurteilen
    // konnte: Der vorgefundene Bestand soll dauerhaft stumm bleiben und nicht
    // in einer spaeteren Runde nachtraeglich zum Fund werden.
    expect(data!.watchlist_evaluated_at).not.toBeNull();
  });
});
