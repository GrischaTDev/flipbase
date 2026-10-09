import { describe, expect, it } from 'vitest';
import {
  VINTED_WORKSPACE_NAVIGATION,
  VINTED_WORKSPACE_NAVIGATION_GROUPS,
  isVintedNavigationActive,
  isVintedWorkspaceRoute,
} from './vinted-workspace-navigation';

describe('Vinted-Bereichsgrenzen', () => {
  it('ordnet Konten zuerst und Kontoseiten und Automatisierungen in explizite Gruppen', () => {
    expect(VINTED_WORKSPACE_NAVIGATION[0].label).toBe('Konten');
    expect(VINTED_WORKSPACE_NAVIGATION_GROUPS.map((group) => group.label)).toEqual([
      'Konto',
      'Automatisierungen',
    ]);
    expect(VINTED_WORKSPACE_NAVIGATION_GROUPS[0].items.map((item) => item.label)).toEqual([
      'Übersicht',
      'Postfach',
      'Inserate',
      'Inserat erstellen',
      'Entwürfe',
      'Verkäufe',
      'Verlauf',
      'Profil',
    ]);
    expect(VINTED_WORKSPACE_NAVIGATION_GROUPS[1].items.map((item) => item.label)).toEqual([
      'Automatische Verhandlung',
      'Favoritennachrichten',
    ]);
    expect(VINTED_WORKSPACE_NAVIGATION.slice(1)).toEqual(
      VINTED_WORKSPACE_NAVIGATION_GROUPS.flatMap((group) => group.items),
    );
  });
  it('behält Einrichtung außerhalb des täglichen Menüs', () => {
    expect(
      VINTED_WORKSPACE_NAVIGATION.some((item) => item.path === '/marketplaces/vinted/setup'),
    ).toBe(false);
  });
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
        '/marketplaces/vinted/listings/new',
      ),
    ).toBe(false);
    expect(
      isVintedNavigationActive(
        '/marketplaces/vinted/listings/new',
        '/marketplaces/vinted/listings/new',
      ),
    ).toBe(true);
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
