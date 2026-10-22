import { describe, expect, it } from 'vitest';
import type { MarketplaceEntry } from './marketplace-read.models';
import type { EbayListing } from '../../../../../supabase/functions/_shared/ebay-contracts';
import {
  normalizeEbayListing,
  normalizeVintedPublication,
  overviewAccountKey,
  overviewListingKey,
} from './marketplace-overview-normalization';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const vinted: MarketplaceEntry = {
  ...scope,
  id: 'entry-a',
  externalId: '123',
  title: 'Jacke',
  text: null,
  occurredAt: '2026-10-15T10:00:00Z',
  publishedAt: null,
  price: 12.34,
  currency: 'EUR',
  status: 'Sehr gut',
  imageUrl: null,
  metrics: { views: null, favorites: null, observedAt: null },
  conversationId: null,
  direction: 'unknown',
  promoted: null,
  unread: null,
  brand: null,
  size: null,
  shipmentStatus: null,
  messageType: null,
  priceLabel: null,
};
const ebay: EbayListing = {
  id: '123',
  title: 'Jacke',
  price: null,
  currency: null,
  quantity: 1,
  listingType: 'FixedPriceItem',
  url: 'https://www.ebay.de/itm/123',
};

describe('Gemeinsame Inseratdarstellung', () => {
  it('bewahrt unbekannte Preise und Zeitangaben statt Ersatzwerten', () => {
    const item = normalizeEbayListing(scope, ebay);
    expect(item.priceCents).toBeNull();
    expect(item.currency).toBeNull();
    expect(item.publishedAt).toBeNull();
    expect(normalizeVintedPublication(vinted).publishedAt).toBeNull();
  });
  it('übernimmt tatsächliche externe IDs und rechnet Geld centgenau um', () => {
    const item = normalizeVintedPublication(vinted);
    expect(item.priceCents).toBe(1234);
    expect(item.reference).toEqual({ platform: 'vinted', ...scope, externalId: '123' });
    expect(item.detailLink).toEqual(['/marketplaces/vinted/listings', 'account-a', 'entry-a']);
  });
  it('verwechselt den Artikelzustand nicht mit dem Veröffentlichungsstatus', () => {
    expect(normalizeVintedPublication(vinted).state).toBe('unknown');
    expect(normalizeVintedPublication({ ...vinted, isClosed: false, isReserved: true }).state).toBe(
      'unknown',
    );
    expect(
      normalizeVintedPublication({ ...vinted, isClosed: false, isReserved: false }).state,
    ).toBe('unknown');
  });
  it.each(['active', 'reserved', 'draft', 'hidden', 'ended', 'unknown'] as const)(
    'übernimmt den bestätigten Vinted-Veröffentlichungsstatus %s',
    (publicationState) => {
      const item = normalizeVintedPublication({
        ...vinted,
        publicationState,
        createdAt: '2026-10-01T09:00:00Z',
        publishedAt: '2026-10-15T10:00:00Z',
        publicationAge: { value: 7, unit: 'day', observedAt: '2026-10-22T10:00:00Z' },
        isClosed: false,
        isReserved: false,
      });
      expect(item.state).toBe(publicationState);
      expect(item.createdAt).toBe('2026-10-01T09:00:00Z');
      if (publicationState !== 'active' && publicationState !== 'reserved') {
        expect(item.publishedAt).toBeNull();
        expect(item.publicationAge).toBeNull();
      }
    },
  );
  it('trennt identische IDs nach Plattform, Account und Workspace', () => {
    const first = normalizeVintedPublication(vinted).reference;
    expect(overviewListingKey(first)).not.toBe(
      overviewListingKey({ ...first, connectionId: 'account-b' }),
    );
    expect(overviewListingKey(first)).not.toBe(overviewListingKey({ ...first, platform: 'ebay' }));
    expect(overviewAccountKey(first)).not.toBe(
      overviewAccountKey({ ...first, workspaceId: 'workspace-b' }),
    );
  });
  it('bietet keine unbestätigten Schreibaktionen und keine unsicheren Links an', () => {
    expect(normalizeVintedPublication(vinted).actions).toEqual(['view']);
    expect(
      normalizeEbayListing(scope, { ...ebay, url: 'javascript:alert(1)' }).externalUrl,
    ).toBeNull();
    expect(
      normalizeEbayListing(scope, { ...ebay, url: 'https://attacker.test/itm/123' }).externalUrl,
    ).toBeNull();
  });
  it('bewahrt die vom vorhandenen Anbieter unterstützte Sandbox-Ansehenaktion', () => {
    const item = normalizeEbayListing(scope, { ...ebay, url: 'https://sandbox.ebay.com/itm/123' });
    expect(item.externalUrl).toBe('https://sandbox.ebay.com/itm/123');
    expect(item.actions).toEqual(['view']);
  });
  it('behandelt ungültige Geldwerte als unbekannt und erhält null Euro', () => {
    expect(normalizeEbayListing(scope, { ...ebay, price: 0 }).priceCents).toBe(0);
    expect(normalizeEbayListing(scope, { ...ebay, price: Infinity }).priceCents).toBeNull();
    expect(normalizeEbayListing(scope, { ...ebay, price: -1 }).priceCents).toBeNull();
  });
});
