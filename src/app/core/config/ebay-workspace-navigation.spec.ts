import { describe, expect, it } from 'vitest';
import { isEbayNavigationActive, isEbayWorkspaceRoute } from './ebay-workspace-navigation';

describe('eBay-Navigationskontext', () => {
  it.each([
    ['/marketplaces/ebay?ebay_result=connected', true],
    ['/marketplaces/ebay/listings/123/edit?connection=a', true],
    ['/marketplaces/ebay/statistics#report', true],
    ['/marketplaces/ebay-other', false],
    ['/marketplaces/vinted', false],
    ['/sales/ebay/a/order', false],
  ])('grenzt %s korrekt ab', (url, expected) => {
    expect(isEbayWorkspaceRoute(url)).toBe(expected);
  });
  it('ordnet den Editor den Inseraten zu und trennt Statistiken und ähnliche Pfade', () => {
    expect(
      isEbayNavigationActive(
        '/marketplaces/ebay/listings',
        '/marketplaces/ebay/listings/123/edit?connection=a',
      ),
    ).toBe(true);
    expect(
      isEbayNavigationActive('/marketplaces/ebay/listings', '/marketplaces/ebay/statistics'),
    ).toBe(false);
    expect(
      isEbayNavigationActive('/marketplaces/ebay/listings', '/marketplaces/ebay/listings-other'),
    ).toBe(false);
  });
});
