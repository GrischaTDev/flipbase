import { describe, expect, it } from 'vitest';
import {
  parseEbayAuthorization,
  parseEbayListing,
  parseEbayOrder,
  parseEbayPage,
  parseEbayStatus,
  parseEbayTrafficReport,
  parseEbayListingDetails,
} from './ebay-response';

describe('eBay-Antwortverträge', () => {
  const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
  it('bindet Statistiken an den Workspace, das Konto und die angeforderten Inserate', () => {
    const report = {
      ...scope,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      lastUpdatedDate: null,
      items: [{ listingId: '123', views: 0, transactions: 0, conversionRate: null }],
    };
    expect(parseEbayTrafficReport(report, scope, ['123']).items[0]).toEqual(report.items[0]);
    expect(() =>
      parseEbayTrafficReport({ ...report, connectionId: 'foreign' }, scope, ['123']),
    ).toThrow();
    expect(() => parseEbayTrafficReport(report, scope, ['456'])).toThrow();
    expect(() =>
      parseEbayTrafficReport({ ...report, items: [...report.items, ...report.items] }, scope, [
        '123',
      ]),
    ).toThrow();
  });
  it('weist unsichere Bildadressen zurück und erhält die Beschreibung als Text', () => {
    const details = {
      ...scope,
      id: '123',
      title: 'Title',
      price: 10,
      currency: 'EUR',
      quantity: 1,
      listingType: 'FixedPriceItem',
      url: 'https://www.ebay.de/itm/123',
      description: '<p>Original</p>',
      imageUrls: ['https://i.ebayimg.com/image.jpg'],
      revision: 'a'.repeat(64),
    };
    expect(parseEbayListingDetails(details, scope, '123').description).toBe('<p>Original</p>');
    expect(() =>
      parseEbayListingDetails({ ...details, imageUrls: ['javascript:alert(1)'] }, scope, '123'),
    ).toThrow();
    expect(() => parseEbayListingDetails(details, scope, '456')).toThrow();
  });
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
