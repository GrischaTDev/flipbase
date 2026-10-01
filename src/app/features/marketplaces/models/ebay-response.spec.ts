import { describe, expect, it } from 'vitest';
import {
  parseEbayAuthorization,
  parseEbayListing,
  parseEbayOrder,
  parseEbayPage,
  parseEbayStatus,
} from './ebay-response';

describe('eBay-Antwortverträge', () => {
  const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
  it('weist fremde Workspace- und Kontodaten zurück', () => {
    expect(() =>
      parseEbayStatus(
        {
          configured: true,
          connection: {
            ...scope,
            workspaceId: 'foreign',
            status: 'connected',
            environment: 'production',
            username: null,
            lastReadAt: null,
          },
        },
        scope.workspaceId,
      ),
    ).toThrow();
    expect(() =>
      parseEbayPage(
        { ...scope, connectionId: 'foreign', items: [], total: 0, nextPage: null },
        scope,
        parseEbayListing,
      ),
    ).toThrow();
  });
  it('erhält Nullpreise und unterscheidet fehlende Beträge', () => {
    const order = parseEbayOrder({
      id: 'order',
      createdAt: '2026-10-01T00:00:00Z',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'NOT_STARTED',
      cancelStatus: null,
      total: 0,
      currency: 'EUR',
      items: [{ title: 'Artikel', quantity: 1 }],
    });
    expect(order.total).toBe(0);
    expect(
      parseEbayListing({
        id: '123',
        title: 'Artikel',
        price: null,
        currency: null,
        quantity: null,
        listingType: null,
        url: null,
      }).price,
    ).toBeNull();
  });
  it('akzeptiert ausschließlich den offiziellen Consent und sichere Inseratlinks', () => {
    expect(
      parseEbayAuthorization({
        authorizationUrl: 'https://auth.ebay.com/oauth2/authorize?state=test',
      }),
    ).toContain('auth.ebay.com');
    expect(() =>
      parseEbayAuthorization({
        authorizationUrl: 'https://auth.ebay.com.evil.test/oauth2/authorize',
      }),
    ).toThrow();
    expect(() =>
      parseEbayAuthorization({ authorizationUrl: 'https://auth.ebay.com:444/oauth2/authorize' }),
    ).toThrow();
    expect(() =>
      parseEbayListing({
        id: '123',
        title: 'Artikel',
        price: 1,
        currency: 'EUR',
        quantity: 1,
        listingType: null,
        url: 'javascript:alert(1)',
      }),
    ).toThrow();
  });
  it('weist ungültige Zahlen und Seiten zurück', () => {
    expect(() =>
      parseEbayPage({ ...scope, items: [], total: -1, nextPage: null }, scope, parseEbayListing),
    ).toThrow();
    expect(() =>
      parseEbayPage({ ...scope, items: [], total: 0, nextPage: 1.5 }, scope, parseEbayListing),
    ).toThrow();
  });
});
