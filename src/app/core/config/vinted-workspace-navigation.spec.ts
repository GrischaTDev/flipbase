import { describe, expect, it } from 'vitest';
import { isVintedNavigationActive, isVintedWorkspaceRoute } from './vinted-workspace-navigation';

describe('Vinted-Bereichsgrenzen', () => {
  it.each([
    ['/marketplaces/vinted?connectionId=account-a', true],
    ['/marketplaces/vinted/local-connect/account-a', true],
    ['/marketplaces/vinted/listings/account-a/item-a#details', true],
    ['/marketplaces/vinted-other', false],
    ['/vinted-bot', false],
    ['/marketplaces/ebay', false],
    ['/dashboard', false],
  ])('ordnet %s dem richtigen Menükontext zu', (url, expected) => {
    expect(isVintedWorkspaceRoute(url)).toBe(expected);
  });
  it('ordnet Details den Inseraten zu, ohne ähnlich benannte Routen einzuschließen', () => {
    expect(
      isVintedNavigationActive(
        '/marketplaces/vinted/listings',
        '/marketplaces/vinted/listings/account-a/item-a',
      ),
    ).toBe(true);
    expect(
      isVintedNavigationActive(
        '/marketplaces/vinted/listings',
        '/marketplaces/vinted/listings-other',
      ),
    ).toBe(false);
    expect(
      isVintedNavigationActive('/marketplaces/vinted/accounts', '/marketplaces/vinted?source=menu'),
    ).toBe(true);
  });
});
